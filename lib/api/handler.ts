/**
 * API Handler Wrapper
 *
 * 모든 API 라우트에 공통 로직(인증, Rate Limit, 에러 처리)을 적용하는 래퍼
 *
 * @example
 * // 인증 필수 API
 * export const GET = withApiHandler({
 *   auth: true,
 *   rateLimit: 'default',
 * }, async ({ supabase, user, request }) => {
 *   const data = await fetchData(supabase, user.id);
 *   return apiSuccess(data);
 * });
 *
 * // 인증 선택 API
 * export const GET = withApiHandler({
 *   auth: 'optional',
 *   rateLimit: 'search',
 * }, async ({ supabase, user, request }) => {
 *   // user가 null일 수 있음
 *   return apiSuccess({ loggedIn: !!user });
 * });
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient, User } from "@supabase/supabase-js";
import {
  withRateLimit,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";
import {
  apiUnauthorized,
  apiInternalError,
  ApiResponse,
} from "@/lib/api-response";

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

export type RateLimitKey = keyof typeof RATE_LIMIT_CONFIGS;

export interface ApiHandlerOptions {
  /** 인증 요구 수준: true = 필수, 'optional' = 선택, false = 불필요 */
  auth?: boolean | "optional";
  /** Rate Limit 설정 키 (default, search, upload, auth, export) */
  rateLimit?: RateLimitKey | false;
}

export interface AuthenticatedContext {
  request: NextRequest;
  supabase: SupabaseClient;
  user: User;
}

export interface OptionalAuthContext {
  request: NextRequest;
  supabase: SupabaseClient;
  user: User | null;
}

export interface UnauthenticatedContext {
  request: NextRequest;
  supabase: SupabaseClient;
}

type HandlerContext<TAuth extends boolean | "optional" | undefined> =
  TAuth extends true
    ? AuthenticatedContext
    : TAuth extends "optional"
      ? OptionalAuthContext
      : UnauthenticatedContext;

type ApiHandler<TAuth extends boolean | "optional" | undefined> = (
  context: HandlerContext<TAuth>
) => Promise<NextResponse<ApiResponse<unknown>>>;

// ─────────────────────────────────────────────────
// 메인 래퍼 함수
// ─────────────────────────────────────────────────

/**
 * API 핸들러 래퍼
 *
 * 공통 로직을 추상화하여 보일러플레이트 제거:
 * 1. Rate Limit 체크
 * 2. 인증 확인 (옵션)
 * 3. 에러 핸들링
 */
export function withApiHandler<TAuth extends boolean | "optional" | undefined>(
  options: ApiHandlerOptions & { auth?: TAuth },
  handler: ApiHandler<TAuth>
): (request: NextRequest) => Promise<NextResponse> {
  const { auth = false, rateLimit = "default" } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Rate Limit 체크
      if (rateLimit !== false) {
        const rateLimitResponse = await withRateLimit(request, rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // 2. Supabase 클라이언트 생성
      const supabase = await createClient();

      // 3. 인증 처리
      if (auth === true) {
        // 인증 필수
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          return apiUnauthorized();
        }

        return handler({
          request,
          supabase,
          user,
        } as HandlerContext<TAuth>);
      } else if (auth === "optional") {
        // 인증 선택
        const {
          data: { user },
        } = await supabase.auth.getUser();

        return handler({
          request,
          supabase,
          user: user ?? null,
        } as HandlerContext<TAuth>);
      } else {
        // 인증 불필요
        return handler({
          request,
          supabase,
        } as HandlerContext<TAuth>);
      }
    } catch (error) {
      console.error("[API Handler] Unhandled error:", error);
      return apiInternalError();
    }
  };
}

// ─────────────────────────────────────────────────
// 편의 함수
// ─────────────────────────────────────────────────

/**
 * 인증 필수 API 핸들러 (단축 버전)
 */
export function withAuth(
  handler: ApiHandler<true>,
  rateLimit: RateLimitKey = "default"
) {
  return withApiHandler({ auth: true, rateLimit }, handler);
}

/**
 * 인증 선택 API 핸들러 (단축 버전)
 */
export function withOptionalAuth(
  handler: ApiHandler<"optional">,
  rateLimit: RateLimitKey = "default"
) {
  return withApiHandler({ auth: "optional", rateLimit }, handler);
}

/**
 * 공개 API 핸들러 (인증 불필요, 단축 버전)
 */
export function withPublic(
  handler: ApiHandler<false>,
  rateLimit: RateLimitKey = "default"
) {
  return withApiHandler({ auth: false, rateLimit }, handler);
}
