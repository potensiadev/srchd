/**
 * OpenAI Embedding Service
 * text-embedding-3-small 모델 사용 (1536 차원)
 * 
 * P0 안정성 개선: Timeout, Retry
 * P1+P2 복원력/관측성: Circuit Breaker, Metrics, Alerts
 */

import OpenAI from "openai";
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure
} from "./circuit-breaker";
import { recordEmbeddingMetrics } from "@/lib/observability/metrics";
import { alertCircuitOpen, alertHighErrorRate } from "@/lib/observability/alerts";

// OpenAI 클라이언트 (Lazy initialization - 빌드 시 에러 방지)
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// 임베딩 설정
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;
/** P2 Fix: 5초 → 8초 (OpenAI 콜드스타트, 네트워크 지연 고려) */
const EMBEDDING_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 200;

// 에러율 모니터링을 위한 간단한 카운터 (메모리)
let recentErrors = 0;
let recentRequests = 0;
const ERROR_RATE_THRESHOLD = 0.1; // 10%

/**
 * Structured logging
 */
function logEmbedding(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'embedding',
    event,
    ...data,
  }));
}

/**
 * 단일 임베딩 호출 (타임아웃 적용)
 */
async function callEmbeddingAPI(
  openai: OpenAI,
  cleanText: string,
  signal: AbortSignal
): Promise<number[]> {
  const response = await openai.embeddings.create(
    {
      model: EMBEDDING_MODEL,
      input: cleanText,
      dimensions: EMBEDDING_DIMENSION,
    },
    { signal }
  );

  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error("Invalid embedding response");
  }

  return embedding;
}

/**
 * 텍스트를 임베딩 벡터로 변환
 * - Circuit Breaker 보호
 * - Timeout: 5초
 * - Retry: 2회
 * - Metrics & Alerting
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // 1. Circuit Breaker 확인
  if (isCircuitOpen()) {
    logEmbedding('circuit_open_reject', {});
    throw new Error("Circuit breaker is open - Service degraded");
  }

  const openai = getOpenAIClient();
  const startTime = Date.now();

  // 텍스트 전처리
  const cleanText = text
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  if (!cleanText) {
    throw new Error("Empty text provided for embedding");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      const embedding = await callEmbeddingAPI(openai, cleanText, controller.signal);

      // 성공 처리
      const duration = Date.now() - startTime;
      recordSuccess(); // Circuit closed/reset
      recordEmbeddingMetrics(duration, true, attempt + 1);

      logEmbedding('embedding_success', {
        attempt: attempt + 1,
        duration_ms: duration,
        text_length: cleanText.length,
      });

      // 에러율 모니터링 업데이트
      recentRequests++;

      return embedding;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Abort (타임아웃) 처리
      const isTimeout = lastError.name === 'AbortError';

      if (isTimeout) {
        logEmbedding('embedding_timeout', {
          attempt: attempt + 1,
          timeout_ms: EMBEDDING_TIMEOUT_MS,
        });
      } else {
        logEmbedding('embedding_error', {
          attempt: attempt + 1,
          error: lastError.message,
        });
      }

      // 실패 기록 (Circuit Breaker)
      recordFailure();

      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 모든 재시도 실패
  const totalDuration = Date.now() - startTime;
  recordEmbeddingMetrics(totalDuration, false, MAX_RETRIES + 1);

  // 에러율 모니터링
  recentErrors++;
  recentRequests++;

  if (recentRequests >= 50) {
    const errorRate = recentErrors / recentRequests;
    if (errorRate > ERROR_RATE_THRESHOLD) {
      alertHighErrorRate(Math.round(errorRate * 100));
      // 카운터 리셋
      recentErrors = 0;
      recentRequests = 0;
    }
  }

  // Circuit Open 알림 (이미 recordFailure에서 상태가 변경되었을 수 있음)
  if (isCircuitOpen()) {
    // 쿨다운 적용되어 있으므로 자주 호출되어도 괜찮음
    const { failures } = await import("./circuit-breaker").then(m => m.getCircuitStatus());
    alertCircuitOpen(failures);
  }

  logEmbedding('embedding_failed', {
    total_attempts: MAX_RETRIES + 1,
    duration_ms: totalDuration,
    error: lastError?.message,
  });

  throw lastError || new Error("Embedding generation failed after retries");
}

/**
 * 여러 텍스트를 배치로 임베딩 생성
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();

  const cleanTexts = texts.map((text) =>
    text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000)
  );

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleanTexts,
      dimensions: EMBEDDING_DIMENSION,
    });

    return response.data.map((item: { embedding: number[] }) => item.embedding);
  } catch (error) {
    console.error("Batch embedding generation error:", error);
    throw error;
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION };
