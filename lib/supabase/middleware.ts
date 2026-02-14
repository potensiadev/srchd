/**
 * Supabase Middleware Client
 * Next.js 미들웨어에서 사용
 * - 쿠키 보안 설정 강화 (httpOnly, secure, sameSite)
 * - 세션 만료는 Supabase가 자체 관리 (기본 1시간, refresh token으로 갱신)
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types";

// ─────────────────────────────────────────────────
// 세션 보안 설정
// ─────────────────────────────────────────────────
const SESSION_CONFIG = {
  /** 쿠키 보안 설정 (maxAge는 Supabase가 관리하도록 제거) */
  COOKIE_OPTIONS: {
    // httpOnly: false - 클라이언트 측 Supabase SDK가 세션 쿠키를 읽을 수 있어야 함
    // (Storage 업로드, 실시간 구독 등 클라이언트 기능에 필요)
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  },
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 환경변수가 없으면 Supabase 없이 진행 (개발 모드)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { supabase: null as any, user: null, response: supabaseResponse };
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            // 쿠키 보안 설정 강화 (maxAge는 Supabase 기본값 사용)
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...SESSION_CONFIG.COOKIE_OPTIONS,
            })
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response: supabaseResponse };
}
