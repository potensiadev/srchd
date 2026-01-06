/**
 * Rate Limiting Utilities
 *
 * API 요청 제한을 위한 유틸리티
 * - IP 기반 레이트 제한
 * - 사용자 기반 레이트 제한
 * - 슬라이딩 윈도우 알고리즘
 *
 * 주의: 인메모리 캐시는 서버리스 환경에서 인스턴스 간 공유되지 않음
 * 프로덕션에서는 Redis 또는 Vercel KV 사용 권장
 */

import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** 윈도우 내 최대 요청 수 */
  limit: number;
  /** 윈도우 크기 (밀리초) */
  windowMs: number;
  /** 제한 초과 시 에러 메시지 */
  message?: string;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// ─────────────────────────────────────────────────
// 기본 설정
// ─────────────────────────────────────────────────

export const RATE_LIMIT_CONFIGS = {
  // 업로드 API: 분당 10회
  upload: {
    limit: 10,
    windowMs: 60 * 1000,
    message: "Too many upload requests. Please try again later.",
  },
  // 검색 API: 분당 30회
  search: {
    limit: 30,
    windowMs: 60 * 1000,
    message: "Too many search requests. Please try again later.",
  },
  // 일반 API: 분당 60회
  default: {
    limit: 60,
    windowMs: 60 * 1000,
    message: "Too many requests. Please try again later.",
  },
  // 인증 API: 분당 5회 (브루트포스 방지)
  auth: {
    limit: 5,
    windowMs: 60 * 1000,
    message: "Too many authentication attempts. Please try again later.",
  },
  // 내보내기 API: 시간당 20회
  export: {
    limit: 20,
    windowMs: 60 * 60 * 1000,
    message: "Export limit reached. Please try again later.",
  },
} as const;

// ─────────────────────────────────────────────────
// 인메모리 캐시
// ─────────────────────────────────────────────────

const rateLimitCache = new Map<string, RateLimitEntry>();

// 주기적으로 만료된 항목 정리 (메모리 누수 방지)
const CLEANUP_INTERVAL = 60 * 1000; // 1분마다
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitCache.entries()) {
    if (entry.resetTime < now) {
      rateLimitCache.delete(key);
    }
  }
}

// ─────────────────────────────────────────────────
// 핵심 함수
// ─────────────────────────────────────────────────

/**
 * IP 주소 추출
 */
export function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare 프록시 헤더
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  // Cloudflare
  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Vercel
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}

/**
 * 레이트 제한 체크
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.default
): RateLimitResult {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitCache.get(identifier);

  if (!entry || entry.resetTime < now) {
    // 새 윈도우 시작
    rateLimitCache.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      reset: now + config.windowMs,
    };
  }

  if (entry.count >= config.limit) {
    // 제한 초과
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset: entry.resetTime,
    };
  }

  // 카운트 증가
  entry.count++;
  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    reset: entry.resetTime,
  };
}

/**
 * 레이트 제한 응답 헤더 생성
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.reset.toString(),
    "Retry-After": result.success
      ? ""
      : Math.ceil((result.reset - Date.now()) / 1000).toString(),
  };
}

/**
 * 레이트 제한 초과 응답 생성
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  message: string = "Too many requests"
): NextResponse {
  const headers = getRateLimitHeaders(result);
  return NextResponse.json(
    {
      success: false,
      error: message,
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    },
    {
      status: 429,
      headers,
    }
  );
}

// ─────────────────────────────────────────────────
// API 래퍼 함수
// ─────────────────────────────────────────────────

/**
 * API 라우트에 레이트 제한 적용
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const rateLimitResult = await withRateLimit(request, "upload");
 *   if (rateLimitResult) return rateLimitResult;
 *   // ... 나머지 로직
 * }
 */
export function withRateLimit(
  request: NextRequest,
  configKey: keyof typeof RATE_LIMIT_CONFIGS = "default",
  userId?: string
): NextResponse | null {
  const config = RATE_LIMIT_CONFIGS[configKey];
  const ip = getClientIP(request);

  // IP + 사용자 ID 조합으로 식별 (사용자별 제한 강화)
  const identifier = userId ? `${configKey}:${userId}:${ip}` : `${configKey}:${ip}`;

  const result = checkRateLimit(identifier, config);

  if (!result.success) {
    return rateLimitExceededResponse(result, config.message);
  }

  return null;
}

/**
 * 특정 작업에 대한 사용자별 레이트 제한
 * (예: 내보내기, 파일 업로드 등)
 */
export function withUserRateLimit(
  userId: string,
  action: string,
  config: RateLimitConfig
): RateLimitResult {
  const identifier = `user:${userId}:${action}`;
  return checkRateLimit(identifier, config);
}
