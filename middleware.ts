/**
 * Next.js Middleware
 * 인증 + 동의 체크
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

interface UserRow {
  consents_completed: boolean | null;
}

interface ConsentRow {
  third_party_data_guarantee: boolean | null;
}

// 보호된 경로
const PROTECTED_PATHS = [
  "/dashboard",
  "/candidates",
  "/upload",
  "/search",
  "/settings",
];

// 인증 경로
const AUTH_PATHS = ["/login", "/signup"];

// 동의 경로
const CONSENT_PATH = "/consent";

// 개발 모드 여부 (DB 스키마 미적용 시)
const isDevelopment = process.env.NODE_ENV === "development";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase 세션 업데이트
  const { supabase, user, response } = await updateSession(request);

  // Supabase가 설정되지 않은 경우 - 모든 페이지 접근 허용
  if (!supabase) {
    return response;
  }

  // 보호된 경로 체크
  const isProtectedPath = PROTECTED_PATHS.some((path) =>
    pathname.startsWith(path)
  );

  // 인증 경로 체크
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path));

  // 동의 경로 체크
  const isConsentPath = pathname === CONSENT_PATH;

  // 개발 모드: 인증/동의 페이지는 DB 체크 없이 바로 접근 허용
  if (isDevelopment && (isAuthPath || isConsentPath)) {
    return response;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 보호된 경로 접근 시
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isProtectedPath) {
    // 로그인 안 됨 → 로그인 페이지로
    if (!user) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 동의 완료 여부 체크
    try {
      const { data: userProfile } = await supabase
        .from("users")
        .select("consents_completed")
        .eq("id", user.id)
        .single() as { data: UserRow | null };

      // 동의 미완료 → 동의 페이지로
      if (!userProfile?.consents_completed) {
        return NextResponse.redirect(new URL("/consent", request.url));
      }

      // PRD 요구사항: third_party_data_guarantee 필수 확인
      // 이 동의 없이는 후보자 데이터 처리 불가 (법적 요건)
      const { data: consentRecord } = await supabase
        .from("user_consents")
        .select("third_party_data_guarantee")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single() as { data: ConsentRow | null };

      // 제3자 정보 보증 동의 미완료 → 동의 페이지로
      if (!consentRecord?.third_party_data_guarantee) {
        return NextResponse.redirect(new URL("/consent", request.url));
      }
    } catch {
      // DB 오류 시 동의 페이지로
      return NextResponse.redirect(new URL("/consent", request.url));
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 동의 페이지 접근 시
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isConsentPath) {
    // 로그인 안 됨 → 그냥 동의 페이지 표시 (미리보기)
    if (!user) {
      return response;
    }

    // 이미 동의 완료 → 대시보드로
    try {
      const { data: consentProfile } = await supabase
        .from("users")
        .select("consents_completed")
        .eq("id", user.id)
        .single() as { data: UserRow | null };

      if (consentProfile?.consents_completed) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      // DB 오류 시 그냥 동의 페이지 표시
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 인증 페이지 접근 시 (이미 로그인된 경우)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isAuthPath && user) {
    // 동의 완료 여부에 따라 리다이렉트
    try {
      const { data: authProfile } = await supabase
        .from("users")
        .select("consents_completed")
        .eq("id", user.id)
        .single() as { data: UserRow | null };

      if (authProfile?.consents_completed) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      } else {
        return NextResponse.redirect(new URL("/consent", request.url));
      }
    } catch {
      // DB 오류 시 동의 페이지로
      return NextResponse.redirect(new URL("/consent", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
