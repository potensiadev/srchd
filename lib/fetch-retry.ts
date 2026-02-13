/**
 * Fetch with Retry
 *
 * HTTP 요청 실패 시 자동 재시도
 * - Exponential backoff
 * - 최대 재시도 횟수 제한
 * - 재시도 가능한 에러만 처리
 */

import https from "https";
import http from "http";

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

/**
 * Native Node.js HTTP/HTTPS 요청 (Next.js fetch 우회)
 * Next.js의 fetch 확장이 문제를 일으킬 경우 사용
 */
function nativeHttpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    };

    const req = httpModule.request(requestOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, body });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${options.timeout}ms`));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
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
      // 상세 에러 로깅
      console.error(`[fetchWithRetry] Attempt ${attempt + 1} error:`, {
        url,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCause: error instanceof Error ? (error as NodeJS.ErrnoException).cause : undefined,
      });

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
 * Worker 파이프라인 호출용 특화 함수 (Native HTTP 사용)
 * Next.js의 fetch 확장 문제를 우회하기 위해 native Node.js http/https 모듈 사용
 */
export async function callWorkerPipeline(
  workerUrl: string,
  payload: Record<string, unknown>,
  onFailure?: (error: string, attempts: number) => Promise<void>
): Promise<FetchRetryResult> {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhookSecret) {
    headers["X-API-Key"] = webhookSecret;
  } else {
    console.warn("[Worker Pipeline] WEBHOOK_SECRET not set - Worker may reject request in production");
  }

  const pipelineUrl = `${workerUrl}/pipeline`;
  const body = JSON.stringify(payload);
  headers["Content-Length"] = Buffer.byteLength(body).toString();

  console.log("[Worker Pipeline] Calling (native HTTP):", pipelineUrl, "payload keys:", Object.keys(payload));

  const maxRetries = 3;
  const startTime = Date.now();
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await nativeHttpRequest(pipelineUrl, {
        method: "POST",
        headers,
        body,
        timeout: 60000,
      });

      if (response.status >= 200 && response.status < 300) {
        const data = JSON.parse(response.body);
        console.log("[Worker Pipeline] Success:", {
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        });
        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // 재시도 가능한 상태 코드
      if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
        lastError = `HTTP ${response.status}: ${response.body.substring(0, 200)}`;
        console.warn(`[Worker Pipeline] Retryable error (attempt ${attempt + 1}):`, lastError);
      } else {
        // 재시도 불가능한 에러
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.body.substring(0, 500)}`,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[Worker Pipeline] Network error (attempt ${attempt + 1}):`, lastError);
    }

    // 재시도 대기
    if (attempt < maxRetries) {
      const waitTime = Math.min(2000 * Math.pow(2, attempt), 15000);
      console.log(`[Worker Pipeline] Waiting ${waitTime}ms before retry...`);
      await delay(waitTime);
    }
  }

  // 모든 재시도 실패
  const result: FetchRetryResult = {
    success: false,
    error: lastError || "All retry attempts failed",
    attempts: maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };

  console.error("[Worker Pipeline] Failed after all retries:", {
    url: pipelineUrl,
    error: result.error,
    attempts: result.attempts,
    totalTimeMs: result.totalTimeMs,
  });

  if (onFailure) {
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

/**
 * DLQ (Dead Letter Queue)에 실패 기록
 * 서버리스 환경에서도 실패한 작업을 추적하고 재처리 가능
 */
export async function recordFailureToDLQ(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  status: string,
  payload: Record<string, unknown>,
  error: string
): Promise<void> {
  try {
    await supabase.from("webhook_failures").insert({
      job_id: jobId,
      status,
      payload,
      error,
      retry_count: 0,
    });
    console.log(`[DLQ] Recorded failure for job ${jobId}`);
  } catch (dlqError) {
    console.error("[DLQ] Failed to record failure:", dlqError);
  }
}

/**
 * 개선된 비동기 Worker 호출 (DLQ 통합)
 * - 실패 시 DLQ에 기록
 * - 재시도 횟수 추적
 * - 구조화된 에러 로깅
 */
export function callWorkerPipelineWithDLQ(
  workerUrl: string,
  payload: Record<string, unknown> & { job_id: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  onFailure?: (error: string, attempts: number) => Promise<void>
): void {
  callWorkerPipeline(workerUrl, payload, async (error, attempts) => {
    // DLQ에 실패 기록
    await recordFailureToDLQ(
      supabase,
      payload.job_id,
      "worker_call_failed",
      payload,
      `Worker call failed after ${attempts} attempts: ${error}`
    );

    // 추가 실패 콜백 실행
    if (onFailure) {
      await onFailure(error, attempts);
    }
  }).catch((error) => {
    console.error("[Worker Pipeline DLQ] Unexpected error:", error);
  });
}

// ─────────────────────────────────────────────────
// Option C 하이브리드: Worker 파싱/분석 분리 호출
// ─────────────────────────────────────────────────

/**
 * Worker /parse-only 동기 호출 결과
 */
export interface ParseOnlyResult {
  success: boolean;
  text?: string;
  text_length?: number;
  file_type?: string;
  parse_method?: string;
  page_count?: number;
  quick_extracted?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  error_code?: string;
  error_message?: string;
  is_encrypted?: boolean;
  warnings?: string[];
  duration_ms?: number;
}

/**
 * Worker /parse-only 동기 호출 (Option C 하이브리드)
 *
 * 파일을 파싱하여 텍스트를 추출합니다. AI 분석 없이 빠르게 응답합니다.
 *
 * @param workerUrl - Worker 베이스 URL
 * @param payload - 파싱 요청 데이터
 * @param timeoutMs - 타임아웃 (기본 15초)
 * @returns ParseOnlyResult
 */
export async function callWorkerParseOnly(
  workerUrl: string,
  payload: {
    file_url: string;
    file_name: string;
    user_id: string;
    job_id: string;
    candidate_id?: string;
  },
  timeoutMs: number = 15000
): Promise<ParseOnlyResult> {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhookSecret) {
    headers["X-API-Key"] = webhookSecret;
  }

  const parseUrl = `${workerUrl}/parse-only`;
  const body = JSON.stringify(payload);
  headers["Content-Length"] = Buffer.byteLength(body).toString();

  console.log("[Worker ParseOnly] Calling:", parseUrl);

  try {
    const response = await nativeHttpRequest(parseUrl, {
      method: "POST",
      headers,
      body,
      timeout: timeoutMs,
    });

    if (response.status >= 200 && response.status < 300) {
      const data = JSON.parse(response.body) as ParseOnlyResult;
      console.log("[Worker ParseOnly] Success:", {
        success: data.success,
        text_length: data.text_length,
        duration_ms: data.duration_ms,
      });
      return data;
    }

    // HTTP 에러 응답
    let errorData: ParseOnlyResult;
    try {
      errorData = JSON.parse(response.body);
    } catch {
      errorData = {
        success: false,
        error_code: "HTTP_ERROR",
        error_message: `HTTP ${response.status}: ${response.body.substring(0, 200)}`,
      };
    }
    console.error("[Worker ParseOnly] HTTP Error:", response.status, errorData);
    return errorData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Worker ParseOnly] Request failed:", errorMessage);

    return {
      success: false,
      error_code: "CONNECTION_ERROR",
      error_message: `Worker 연결 실패: ${errorMessage}`,
    };
  }
}

/**
 * Worker /analyze-only 비동기 호출 (Option C 하이브리드)
 *
 * 파싱된 텍스트를 받아 AI 분석을 백그라운드에서 수행합니다.
 * 즉시 응답하고 분석은 Worker에서 비동기로 처리됩니다.
 *
 * @param workerUrl - Worker 베이스 URL
 * @param payload - 분석 요청 데이터
 * @param onFailure - 실패 시 콜백
 */
export function callWorkerAnalyzeAsync(
  workerUrl: string,
  payload: {
    text: string;
    file_url: string;
    file_name: string;
    file_type: string;
    user_id: string;
    job_id: string;
    candidate_id: string;
    mode?: string;
    skip_credit_deduction?: boolean;
  },
  onFailure?: (error: string) => Promise<void>
): void {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhookSecret) {
    headers["X-API-Key"] = webhookSecret;
  }

  const analyzeUrl = `${workerUrl}/analyze-only`;
  const body = JSON.stringify(payload);
  headers["Content-Length"] = Buffer.byteLength(body).toString();

  console.log("[Worker AnalyzeAsync] Calling:", analyzeUrl, "job:", payload.job_id);

  // Fire-and-forget 방식으로 호출
  nativeHttpRequest(analyzeUrl, {
    method: "POST",
    headers,
    body,
    timeout: 60000, // 60초 (응답만 기다림, 분석은 Worker에서 비동기)
  })
    .then((response) => {
      if (response.status >= 200 && response.status < 300) {
        console.log("[Worker AnalyzeAsync] Request accepted:", response.status);
      } else {
        console.error("[Worker AnalyzeAsync] Request failed:", response.status);
        if (onFailure) {
          onFailure(`HTTP ${response.status}: ${response.body.substring(0, 200)}`).catch(
            console.error
          );
        }
      }
    })
    .catch((error) => {
      console.error("[Worker AnalyzeAsync] Network error:", error);
      if (onFailure) {
        onFailure(error instanceof Error ? error.message : String(error)).catch(
          console.error
        );
      }
    });
}
