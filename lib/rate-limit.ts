/**
 * Rate Limiting Utilities
 *
 * API 요청 제한을 위한 유틸리티
 * - IP 기반 레이트 제한
 * - 사용자 기반 레이트 제한
 * - 슬라이딩 윈도우 알고리즘
 *
 * Supabase 기반 분산 레이트 제한 (서버리스 환경 지원)
 * 로컬 캐시와 Supabase를 병행하여 성능 최적화
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logRateLimitExceeded } from "@/lib/logger";

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

// IP 기반 Rate Limit (사무실 공용 IP 대응)
export const IP_RATE_LIMIT = {
  limit: 50,
  windowMs: 60 * 1000,
  message: "요청이 너무 많아요. 1분 후 다시 시도해 주세요.",
} as const;

// 플랜별 Rate Limit (userId 기반)
export const PLAN_RATE_LIMITS = {
  free: { limit: 5, windowMs: 60 * 1000 },
  starter: { limit: 5, windowMs: 60 * 1000 },
  pro: { limit: 30, windowMs: 60 * 1000 }, // Pro 플랜: 더 높은 한도
} as const;


export type PlanType = keyof typeof PLAN_RATE_LIMITS;

export const RATE_LIMIT_CONFIGS = {
  // 업로드 API: IP 기반 분당 50회 (플랜별 userId 제한은 별도 적용)
  upload: {
    limit: 50,
    windowMs: 60 * 1000,
    message: "업로드 요청이 너무 많아요. 1분 후 다시 시도해 주세요.",
  },
  // 검색 API: 분당 30회
  search: {
    limit: 30,
    windowMs: 60 * 1000,
    message: "검색 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  },
  // 일반 API: 분당 60회
  default: {
    limit: 60,
    windowMs: 60 * 1000,
    message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  },
  // 인증 API: 분당 5회 (브루트포스 방지)
  auth: {
    limit: 5,
    windowMs: 60 * 1000,
    message: "인증 시도가 너무 많아요. 1분 후 다시 시도해 주세요.",
  },
  // 내보내기 API: 시간당 20회
  export: {
    limit: 20,
    windowMs: 60 * 60 * 1000,
    message: "내보내기 제한에 도달했어요. 잠시 후 다시 시도해 주세요.",
  },
} as const;

// ─────────────────────────────────────────────────
// Supabase 클라이언트 (Rate Limit 전용)
// ─────────────────────────────────────────────────

function getRateLimitSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("[RateLimit] Supabase credentials not found, falling back to in-memory");
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// ─────────────────────────────────────────────────
// 인메모리 캐시 (로컬 폴백 + 성능 최적화)
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
 * IP 주소 추출 (보안 강화)
 *
 * X-Forwarded-For 스푸핑 방지:
 * 1. Vercel에서 설정하는 신뢰할 수 있는 헤더 우선 사용
 * 2. X-Forwarded-For의 마지막 IP 사용 (신뢰할 수 있는 프록시가 추가한 IP)
 * 3. 사설 IP는 무시 (스푸핑 시도 차단)
 */
export function getClientIP(request: NextRequest): string {
  // 1. Vercel의 신뢰할 수 있는 헤더 (Vercel Edge가 설정, 스푸핑 불가)
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    const ip = vercelForwardedFor.split(",")[0].trim();
    if (isValidPublicIP(ip)) return ip;
  }

  // 2. Cloudflare의 신뢰할 수 있는 헤더 (CF가 설정, 스푸핑 불가)
  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP && isValidPublicIP(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // 3. Vercel의 x-real-ip (신뢰할 수 있음)
  const realIP = request.headers.get("x-real-ip");
  if (realIP && isValidPublicIP(realIP)) {
    return realIP;
  }

  // 4. X-Forwarded-For (마지막 IP 사용 - 신뢰할 수 있는 프록시가 추가)
  // 주의: 첫 번째 IP는 클라이언트가 스푸핑 가능
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map(ip => ip.trim());
    // 마지막 비사설 IP를 찾음 (신뢰할 수 있는 프록시가 추가한 IP)
    for (let i = ips.length - 1; i >= 0; i--) {
      if (isValidPublicIP(ips[i])) {
        return ips[i];
      }
    }
  }

  return "unknown";
}

/**
 * 유효한 공개 IP인지 확인 (사설 IP, 루프백, 예약 IP 제외)
 */
function isValidPublicIP(ip: string): boolean {
  if (!ip || ip === "unknown") return false;

  // IPv4 사설 IP 범위 제외
  const privateIPv4Patterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (Loopback)
    /^0\./,                     // 0.0.0.0/8
    /^169\.254\./,              // 169.254.0.0/16 (Link-local)
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  ];

  for (const pattern of privateIPv4Patterns) {
    if (pattern.test(ip)) return false;
  }

  // IPv6 사설/루프백 제외
  if (ip.startsWith("::1") || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return false;
  }

  // IPv4 형식 및 범위 검증 (0-255)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4Regex);
  if (ipv4Match) {
    // 각 옥텟이 0-255 범위인지 확인
    const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]];
    return octets.every(octet => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6 형식 검증
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

/**
 * 레이트 제한 체크 (인메모리 - 로컬 폴백용)
 */
function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
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
 * 레이트 제한 체크 (Supabase 분산 - 서버리스 환경 지원)
 */
export async function checkRateLimitDistributed(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.default
): Promise<RateLimitResult> {
  const supabase = getRateLimitSupabase();

  // Supabase 사용 불가 시 인메모리 폴백
  if (!supabase) {
    return checkRateLimitInMemory(identifier, config);
  }

  const now = Date.now();

  try {
    // 현재 윈도우의 요청 수 조회 및 새 요청 기록 (단일 트랜잭션)
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_window_ms: config.windowMs,
      p_limit: config.limit,
    });

    if (error) {
      console.warn("[RateLimit] Supabase RPC error, falling back to in-memory:", error.message);
      return checkRateLimitInMemory(identifier, config);
    }

    const result = data as { allowed: boolean; count: number; reset_at: string } | null;

    if (!result) {
      return checkRateLimitInMemory(identifier, config);
    }

    const resetTime = new Date(result.reset_at).getTime();

    return {
      success: result.allowed,
      limit: config.limit,
      remaining: Math.max(0, config.limit - result.count),
      reset: resetTime,
    };
  } catch (err) {
    console.warn("[RateLimit] Exception, falling back to in-memory:", err);
    return checkRateLimitInMemory(identifier, config);
  }
}

/**
 * 레이트 제한 체크 (동기 래퍼 - 기존 호환성 유지)
 * 주의: 서버리스 환경에서 정확한 제한을 위해 checkRateLimitDistributed 사용 권장
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.default
): RateLimitResult {
  return checkRateLimitInMemory(identifier, config);
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
 * 레이트 제한 초과 응답 생성 (상세 정보 포함)
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  message: string = "요청이 너무 많아요.",
  plan?: PlanType
): NextResponse {
  const headers = getRateLimitHeaders(result);
  const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message,
        retryAfter: retryAfterSeconds,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: new Date(result.reset).toISOString(),
        plan: plan || undefined,
      },
    },
    {
      status: 429,
      headers,
    }
  );
}

// ─────────────────────────────────────────────────
// 악용 감지 추적
// ─────────────────────────────────────────────────

const abuseTracker = new Map<string, { count: number; firstHit: number }>();
const ABUSE_THRESHOLD = 5; // 연속 5회 Rate Limit 히트 시 악용 의심
const ABUSE_WINDOW = 5 * 60 * 1000; // 5분 내 연속 히트

function trackAbuse(identifier: string): boolean {
  const now = Date.now();
  const entry = abuseTracker.get(identifier);

  if (!entry || now - entry.firstHit > ABUSE_WINDOW) {
    abuseTracker.set(identifier, { count: 1, firstHit: now });
    return false;
  }

  entry.count++;
  return entry.count >= ABUSE_THRESHOLD;
}

// ─────────────────────────────────────────────────
// API 래퍼 함수
// ─────────────────────────────────────────────────

/**
 * IP 기반 Rate Limit 체크 (1단계)
 */
export async function checkIPRateLimit(
  request: NextRequest
): Promise<{ result: RateLimitResult; ip: string }> {
  const ip = getClientIP(request);
  const identifier = `ip:${ip}`;
  const result = await checkRateLimitDistributed(identifier, IP_RATE_LIMIT);
  return { result, ip };
}

/**
 * 플랜별 userId Rate Limit 체크 (2단계)
 */
export async function checkUserRateLimit(
  userId: string,
  plan: PlanType = "free",
  action: string = "upload"
): Promise<RateLimitResult> {
  const config = PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.free;
  const identifier = `user:${userId}:${action}`;
  return checkRateLimitDistributed(identifier, {
    ...config,
    message: `업로드 요청이 너무 많아요. 1분 후 다시 시도해 주세요.`,
  });
}

/**
 * 이중 Rate Limit 적용 (IP → 인증 → userId)
 * 
 * 순서:
 * 1. IP 기반 체크 (분당 50회) - 사무실 공용 IP 대응
 * 2. 인증 확인 후 userId 기반 체크 (플랜별)
 * 
 * @example
 * export async function POST(request: NextRequest) {
 *   const { user, plan } = await getAuthenticatedUser();
 *   const rateLimitResult = await withDualRateLimit(request, user.id, plan);
 *   if (rateLimitResult) return rateLimitResult;
 *   // ... 나머지 로직
 * }
 */
export async function withDualRateLimit(
  request: NextRequest,
  userId: string,
  plan: PlanType = "free",
  action: string = "upload"
): Promise<{ response: NextResponse | null; remaining: number | null }> {
  const ip = getClientIP(request);

  // 1단계: IP 기반 체크
  const ipIdentifier = `ip:${ip}`;
  const ipResult = await checkRateLimitDistributed(ipIdentifier, IP_RATE_LIMIT);

  if (!ipResult.success) {
    const isAbuse = trackAbuse(ipIdentifier);

    // 보안 이벤트 로깅
    logRateLimitExceeded({
      ip,
      userId,
      endpoint: action,
      limit: IP_RATE_LIMIT.limit,
      isAbuse,
    });

    return {
      response: rateLimitExceededResponse(ipResult, IP_RATE_LIMIT.message, plan),
      remaining: null,
    };
  }

  // 2단계: userId 기반 체크 (플랜별)
  const userResult = await checkUserRateLimit(userId, plan, action);

  if (!userResult.success) {
    const userIdentifier = `user:${userId}:${action}`;
    const isAbuse = trackAbuse(userIdentifier);

    const planConfig = PLAN_RATE_LIMITS[plan];
    const message = `업로드 제한에 도달했어요. 플랜 업그레이드로 더 많이 업로드할 수 있어요.`;

    logRateLimitExceeded({
      ip,
      userId,
      endpoint: action,
      limit: planConfig.limit,
      plan,
      isAbuse,
    });

    return {
      response: rateLimitExceededResponse(userResult, message, plan),
      remaining: null,
    };
  }

  return {
    response: null,
    remaining: userResult.remaining,
  };
}

/**
 * API 라우트에 레이트 제한 적용 (기존 호환성 유지)
 */
export async function withRateLimit(
  request: NextRequest,
  configKey: keyof typeof RATE_LIMIT_CONFIGS = "default",
  userId?: string
): Promise<NextResponse | null> {
  const config = RATE_LIMIT_CONFIGS[configKey];
  const ip = getClientIP(request);

  // IP + 사용자 ID 조합으로 식별 (사용자별 제한 강화)
  const identifier = userId ? `${configKey}:${userId}:${ip}` : `${configKey}:${ip}`;

  const result = await checkRateLimitDistributed(identifier, config);

  if (!result.success) {
    const isAbuse = trackAbuse(identifier);

    // 보안 이벤트 로깅
    logRateLimitExceeded({
      ip,
      userId,
      endpoint: configKey,
      limit: config.limit,
      isAbuse,
    });
    return rateLimitExceededResponse(result, config.message);
  }

  return null;
}

/**
 * 특정 작업에 대한 사용자별 레이트 제한
 * (예: 내보내기, 파일 업로드 등)
 */
export function withUserRateLimitSync(
  userId: string,
  action: string,
  config: RateLimitConfig
): RateLimitResult {
  const identifier = `user:${userId}:${action}`;
  return checkRateLimit(identifier, config);
}

/**
 * 남은 업로드 횟수 조회 (UI 표시용)
 */
export async function getRemainingUploads(
  userId: string,
  plan: PlanType = "free"
): Promise<{ remaining: number; limit: number; resetAt: Date }> {
  const config = PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.free;
  const identifier = `user:${userId}:upload`;

  // 현재 상태만 조회 (카운트 증가 없이)
  const entry = rateLimitCache.get(identifier);
  const now = Date.now();

  if (!entry || entry.resetTime < now) {
    return {
      remaining: config.limit,
      limit: config.limit,
      resetAt: new Date(now + config.windowMs),
    };
  }

  return {
    remaining: Math.max(0, config.limit - entry.count),
    limit: config.limit,
    resetAt: new Date(entry.resetTime),
  };
}
