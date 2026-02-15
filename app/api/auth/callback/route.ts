import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 허용된 리다이렉트 경로 (화이트리스트)
const ALLOWED_REDIRECT_PATHS = [
  "/consent",
  "/dashboard",
  "/candidates",
  "/upload",
  "/profile",
  "/settings",
];

/**
 * 안전한 리다이렉트 경로인지 검증
 * - 상대 경로만 허용 (절대 URL 차단)
 * - 화이트리스트에 있는 경로만 허용
 * - 경로 조작 시도 차단 (//, .., etc)
 */
function isValidRedirectPath(path: string | null): boolean {
  if (!path) return false;

  // 상대 경로여야 함 (/ 로 시작)
  if (!path.startsWith("/")) return false;

  // 프로토콜 포함 URL 차단 (//evil.com, javascript:, etc)
  if (path.startsWith("//") || path.includes(":")) return false;

  // 경로 조작 시도 차단
  if (path.includes("..") || path.includes("\\")) return false;

  // 쿼리스트링/프래그먼트 제거 후 기본 경로 추출
  const basePath = path.split("?")[0].split("#")[0];

  // 화이트리스트 검증 (정확히 일치하거나 하위 경로)
  return ALLOWED_REDIRECT_PATHS.some(
    allowed => basePath === allowed || basePath.startsWith(`${allowed}/`)
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const errorFromProvider = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // OAuth 제공자에서 에러가 반환된 경우
  if (errorFromProvider) {
    console.error("[Auth Callback] OAuth error:", errorFromProvider, errorDescription);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "oauth_error");
    loginUrl.searchParams.set("message", errorDescription || errorFromProvider);
    return NextResponse.redirect(loginUrl.toString());
  }

  // 안전한 경로만 허용, 그 외는 기본값 사용
  const next = isValidRedirectPath(requestedNext) ? requestedNext : "/candidates";

  if (code) {
    const cookieStore = await cookies();

    // 디버그: PKCE 코드 검증자 쿠키 확인
    const allCookies = cookieStore.getAll();
    const codeVerifierCookie = allCookies.find(c => c.name.includes("code-verifier"));
    if (!codeVerifierCookie) {
      console.warn("[Auth Callback] PKCE code verifier cookie not found. Available cookies:",
        allCookies.map(c => c.name).join(", "));
    }

    // 세션 교환 후 설정할 쿠키들을 저장
    const cookiesToSetOnResponse: { name: string; value: string; options: CookieOptions }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            // 쿠키를 배열에 저장 (나중에 응답에 포함)
            cookiesToSet.forEach(({ name, value, options }) => {
              cookiesToSetOnResponse.push({ name, value, options });
            });
            // cookieStore에도 설정 시도 (Server Component 호환)
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component에서 호출 시 무시 (응답에 직접 설정됨)
            }
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[Auth Callback] exchangeCodeForSession failed:", error.message, error.status);
    }

    if (!error && sessionData?.session) {
      // 세션에서 사용자 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // public.users 레코드 확인
        const { data: existingUser } = await supabase
          .from("users")
          .select("id, consents_completed")
          .eq("id", user.id)
          .single();

        let redirectPath = next;

        if (!existingUser) {
          // public.users 레코드가 없으면 생성 (트리거 실패 대비 안전망)
          const provider = user.app_metadata?.provider || "email";
          const { error: insertError } = await supabase.from("users").insert({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url,
            signup_provider: provider,
          });

          if (insertError) {
            console.error("[Auth Callback] Failed to create user record:", insertError.message, insertError.code);
          }

          // 신규 생성 → consent 페이지로
          redirectPath = "/consent";
        } else if (!existingUser.consents_completed) {
          // 동의 미완료 → consent 페이지로
          redirectPath = "/consent";
        }

        // 리다이렉트 응답 생성 후 쿠키 포함
        const response = NextResponse.redirect(`${origin}${redirectPath}`);

        // 세션 쿠키를 응답에 명시적으로 포함
        cookiesToSetOnResponse.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            // 프로덕션에서 보안 설정 강화
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        });

        return response;
      }

      // user가 없으면 consent로 (비정상 케이스)
      const response = NextResponse.redirect(`${origin}/consent`);
      cookiesToSetOnResponse.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
      });
      return response;
    }
  }

  // 에러 발생 시 로그인 페이지로 리다이렉트
  console.error("[Auth Callback] No auth code provided or session exchange failed");
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(loginUrl.toString());
}
