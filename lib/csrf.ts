/**
 * CSRF Protection Utilities
 *
 * Origin 헤더 검증을 통한 CSRF 공격 방지
 * - Same-Origin 요청만 허용
 * - 신뢰할 수 있는 Origin 화이트리스트 지원
 */

import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────

/**
 * 허용된 Origin 목록
 * 환경 변수에서 설정하거나 기본값 사용
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // 환경 변수에서 앱 URL 추가
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Vercel 배포 URL
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  // Vercel Preview URL
  if (process.env.VERCEL_BRANCH_URL) {
    origins.push(`https://${process.env.VERCEL_BRANCH_URL}`);
  }

  // 개발 환경 localhost
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://localhost:3001");
    origins.push("http://127.0.0.1:3000");
  }

  return origins;
}

// ─────────────────────────────────────────────────
// CSRF 검증 결과 타입
// ─────────────────────────────────────────────────

export interface CSRFValidationResult {
  valid: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────
// 핵심 함수
// ─────────────────────────────────────────────────

/**
 * Origin 헤더 검증
 *
 * @param request NextRequest 객체
 * @returns 검증 결과
 */
export function validateOrigin(request: NextRequest): CSRFValidationResult {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Origin 헤더가 없는 경우 (Same-Origin 요청 또는 직접 요청)
  // Referer로 폴백 체크
  if (!origin) {
    // Referer도 없으면 Same-Origin으로 간주 (브라우저가 보내지 않은 경우)
    // 단, 프로덕션에서는 API 클라이언트 요청일 수 있으므로 허용
    if (!referer) {
      return { valid: true };
    }

    // Referer에서 Origin 추출
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      const allowedOrigins = getAllowedOrigins();

      if (allowedOrigins.length === 0) {
        // 허용된 Origin이 설정되지 않은 경우 host 비교
        if (host && refererUrl.host === host) {
          return { valid: true };
        }
      } else if (allowedOrigins.includes(refererOrigin)) {
        return { valid: true };
      }

      return {
        valid: false,
        error: "Invalid referer"
      };
    } catch {
      return { valid: false, error: "Invalid referer format" };
    }
  }

  // Origin 헤더 검증
  const allowedOrigins = getAllowedOrigins();

  // 허용된 Origin 목록이 비어있는 경우 (설정 누락)
  // host 헤더와 비교
  if (allowedOrigins.length === 0) {
    if (host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host === host) {
          return { valid: true };
        }
      } catch {
        return { valid: false, error: "Invalid origin format" };
      }
    }
    // 설정이 없고 host도 없으면 거부
    return { valid: false, error: "CSRF validation failed" };
  }

  // 허용된 Origin 목록에 있는지 확인
  if (allowedOrigins.includes(origin)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: "Origin not allowed"
  };
}

/**
 * CSRF 보호가 필요한 HTTP 메서드인지 확인
 */
export function requiresCSRFProtection(method: string): boolean {
  const protectedMethods = ["POST", "PUT", "DELETE", "PATCH"];
  return protectedMethods.includes(method.toUpperCase());
}

/**
 * API 라우트에 CSRF 보호 적용
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const csrfResult = withCSRFProtection(request);
 *   if (csrfResult) return csrfResult;
 *   // ... 나머지 로직
 * }
 */
export function withCSRFProtection(request: NextRequest): NextResponse | null {
  // CSRF 보호가 필요한 메서드인지 확인
  if (!requiresCSRFProtection(request.method)) {
    return null;
  }

  const result = validateOrigin(request);

  if (!result.valid) {
    return NextResponse.json(
      {
        success: false,
        error: "CSRF validation failed",
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * 미들웨어용 CSRF 검증 (API 경로에만 적용)
 */
export function validateCSRFForAPI(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  // API 경로만 체크
  if (!pathname.startsWith("/api/")) {
    return true;
  }

  // CSRF 보호가 필요한 메서드만 체크
  if (!requiresCSRFProtection(request.method)) {
    return true;
  }

  const result = validateOrigin(request);
  return result.valid;
}
