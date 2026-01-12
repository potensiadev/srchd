/**
 * Unified API Response Utilities
 *
 * 모든 API 응답에 일관된 형식을 적용하기 위한 헬퍼 함수
 */

import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────
// 보안 헤더 설정
// ─────────────────────────────────────────────────

/**
 * API 응답용 보안 헤더
 * - Cache-Control: 민감한 데이터 캐싱 방지
 * - Pragma: HTTP/1.0 호환 캐시 방지
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

/**
 * 에러 코드 (표준화된 에러 코드)
 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "INSUFFICIENT_CREDITS"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "CONFLICT";

/**
 * API 에러 객체
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * API 응답 메타데이터
 */
export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  message?: string;
  cached?: boolean;
  cacheAge?: number;
  responseTime?: number;
}

/**
 * 통합 API 응답 타입
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

// ─────────────────────────────────────────────────
// 성공 응답 헬퍼
// ─────────────────────────────────────────────────

/**
 * 성공 응답 생성
 */
export function apiSuccess<T>(
  data: T,
  meta?: ApiMeta,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
    },
    { status, headers: SECURITY_HEADERS }
  );
}

/**
 * 생성 성공 응답 (201)
 */
export function apiCreated<T>(data: T, meta?: ApiMeta): NextResponse<ApiResponse<T>> {
  return apiSuccess(data, meta, 201);
}

/**
 * 빈 성공 응답 (204 대신 200 + success)
 */
export function apiNoContent(): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: true,
      data: null,
    },
    { headers: SECURITY_HEADERS }
  );
}

// ─────────────────────────────────────────────────
// 에러 응답 헬퍼
// ─────────────────────────────────────────────────

/**
 * 에러 응답 생성
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status, headers: SECURITY_HEADERS }
  );
}

/**
 * 400 Bad Request
 */
export function apiBadRequest(
  message: string = "잘못된 요청입니다.",
  details?: Record<string, unknown>
): NextResponse<ApiResponse<null>> {
  return apiError("BAD_REQUEST", message, 400, details);
}

/**
 * 401 Unauthorized
 */
export function apiUnauthorized(
  message: string = "인증이 필요합니다."
): NextResponse<ApiResponse<null>> {
  return apiError("UNAUTHORIZED", message, 401);
}

/**
 * 403 Forbidden
 */
export function apiForbidden(
  message: string = "접근 권한이 없습니다."
): NextResponse<ApiResponse<null>> {
  return apiError("FORBIDDEN", message, 403);
}

/**
 * 404 Not Found
 */
export function apiNotFound(
  message: string = "리소스를 찾을 수 없습니다."
): NextResponse<ApiResponse<null>> {
  return apiError("NOT_FOUND", message, 404);
}

/**
 * 402 Payment Required (크레딧 부족)
 */
export function apiInsufficientCredits(
  message: string = "크레딧이 부족합니다."
): NextResponse<ApiResponse<null>> {
  return apiError("INSUFFICIENT_CREDITS", message, 402);
}

/**
 * 409 Conflict
 */
export function apiConflict(
  message: string = "리소스 충돌이 발생했습니다."
): NextResponse<ApiResponse<null>> {
  return apiError("CONFLICT", message, 409);
}

/**
 * 429 Too Many Requests
 */
export function apiRateLimitExceeded(
  message: string = "요청 횟수가 제한을 초과했습니다.",
  retryAfter?: number
): NextResponse<ApiResponse<null>> {
  return apiError("RATE_LIMIT_EXCEEDED", message, 429, retryAfter ? { retryAfter } : undefined);
}

/**
 * 500 Internal Server Error
 */
export function apiInternalError(
  message: string = "서버 오류가 발생했습니다."
): NextResponse<ApiResponse<null>> {
  return apiError("INTERNAL_ERROR", message, 500);
}

/**
 * 503 Service Unavailable
 */
export function apiServiceUnavailable(
  message: string = "서비스를 일시적으로 사용할 수 없습니다."
): NextResponse<ApiResponse<null>> {
  return apiError("SERVICE_UNAVAILABLE", message, 503);
}

// ─────────────────────────────────────────────────
// 검증 에러 헬퍼
// ─────────────────────────────────────────────────

/**
 * 파일 검증 에러
 */
export function apiFileValidationError(
  message: string
): NextResponse<ApiResponse<null>> {
  return apiError("VALIDATION_ERROR", message, 400);
}

/**
 * 파일 크기 초과 에러
 */
export function apiFileTooLarge(
  maxSizeMB: number = 50
): NextResponse<ApiResponse<null>> {
  return apiError("FILE_TOO_LARGE", `파일 크기가 ${maxSizeMB}MB를 초과합니다.`, 400);
}

/**
 * 파일 타입 에러
 */
export function apiInvalidFileType(
  allowedTypes: string[]
): NextResponse<ApiResponse<null>> {
  return apiError(
    "INVALID_FILE_TYPE",
    `지원하지 않는 파일 형식입니다. 허용: ${allowedTypes.join(", ")}`,
    400
  );
}
