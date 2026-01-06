/**
 * Fetch with Retry
 *
 * HTTP 요청 실패 시 자동 재시도
 * - Exponential backoff
 * - 최대 재시도 횟수 제한
 * - 재시도 가능한 에러만 처리
 */

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

export interface RetryConfig {
  /** 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 초기 대기 시간 ms (기본: 1000) */
  initialDelayMs?: number;
  /** 최대 대기 시간 ms (기본: 10000) */
  maxDelayMs?: number;
  /** 백오프 배수 (기본: 2) */
  backoffMultiplier?: number;
  /** 재시도할 HTTP 상태 코드 (기본: 408, 429, 500, 502, 503, 504) */
  retryableStatusCodes?: number[];
  /** 요청 타임아웃 ms (기본: 30000) */
  timeoutMs?: number;
  /** 재시도 시 콜백 */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface FetchRetryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTimeMs: number;
}

// ─────────────────────────────────────────────────
// 기본 설정
// ─────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "onRetry">> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  timeoutMs: 30000,
};

// ─────────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────────

/**
 * 지연 함수
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지터(jitter) 적용된 지연 시간 계산
 * 여러 클라이언트가 동시에 재시도하는 것을 방지
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // 20% 지터 추가
  const jitter = cappedDelay * 0.2 * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * 재시도 가능한 에러인지 확인
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // 네트워크 오류 (ECONNREFUSED, ETIMEDOUT 등)
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("fetch failed")
    );
  }
  return false;
}

// ─────────────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────────────

/**
 * 재시도 기능이 있는 fetch
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = {}
): Promise<FetchRetryResult<T>> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    retryableStatusCodes,
    timeoutMs,
  } = { ...DEFAULT_CONFIG, ...config };

  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // AbortController로 타임아웃 구현
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 성공적인 응답
      if (response.ok) {
        const data = await response.json() as T;
        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // 재시도 가능한 상태 코드인지 확인
      if (!retryableStatusCodes.includes(response.status)) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // 재시도 예정
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      // 타임아웃 또는 네트워크 오류
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(`Request timeout after ${timeoutMs}ms`);
      } else if (isRetryableError(error)) {
        lastError = error instanceof Error ? error : new Error(String(error));
      } else {
        // 재시도 불가능한 에러
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }
    }

    // 마지막 시도가 아니면 대기 후 재시도
    if (attempt < maxRetries) {
      const waitTime = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      );

      if (config.onRetry) {
        config.onRetry(attempt + 1, lastError!, waitTime);
      } else {
        console.warn(
          `[fetchWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError?.message}. Retrying in ${waitTime}ms...`
        );
      }

      await delay(waitTime);
    }
  }

  // 모든 재시도 실패
  return {
    success: false,
    error: lastError?.message || "All retry attempts failed",
    attempts: maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Worker 파이프라인 호출용 특화 함수
 */
export async function callWorkerPipeline(
  workerUrl: string,
  payload: Record<string, unknown>,
  onFailure?: (error: string, attempts: number) => Promise<void>
): Promise<FetchRetryResult> {
  const result = await fetchWithRetry(
    `${workerUrl}/pipeline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    {
      maxRetries: 3,
      initialDelayMs: 2000,
      maxDelayMs: 15000,
      timeoutMs: 60000, // Worker 처리에 시간이 걸릴 수 있음
      onRetry: (attempt, error, delay) => {
        console.warn(
          `[Worker Pipeline] Retry ${attempt}: ${error.message}. Next attempt in ${delay}ms`
        );
      },
    }
  );

  if (!result.success && onFailure) {
    await onFailure(result.error || "Unknown error", result.attempts);
  }

  return result;
}

/**
 * 비동기 Worker 호출 (Fire-and-forget with retry)
 * 실패해도 사용자에게 즉시 응답하지만, 백그라운드에서 재시도
 */
export function callWorkerPipelineAsync(
  workerUrl: string,
  payload: Record<string, unknown>,
  onFailure?: (error: string, attempts: number) => Promise<void>
): void {
  // 백그라운드에서 재시도 실행
  callWorkerPipeline(workerUrl, payload, onFailure).catch((error) => {
    console.error("[Worker Pipeline Async] Unexpected error:", error);
  });
}
