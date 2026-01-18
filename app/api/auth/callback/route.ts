import { createServerClient } from "@supabase/ssr";
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

  // 안전한 경로만 허용, 그 외는 기본값 사용
  const next = isValidRedirectPath(requestedNext) ? requestedNext : "/consent";

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 에러 발생 시 로그인 페이지로 조용히 리다이렉트
  return NextResponse.redirect(`${origin}/login`);
}
