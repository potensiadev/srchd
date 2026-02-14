import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const supabase = await createClient();

    // 서버 사이드 로그아웃 (모든 세션 종료)
    await supabase.auth.signOut({ scope: "global" });

    // 응답 생성
    const response = NextResponse.redirect(`${requestUrl.origin}/?logged_out=true`);

    // Supabase 관련 쿠키 명시적 삭제
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    for (const cookie of allCookies) {
        // sb- 로 시작하는 Supabase 쿠키 모두 삭제
        if (cookie.name.startsWith("sb-")) {
            response.cookies.set(cookie.name, "", {
                expires: new Date(0),
                path: "/",
                maxAge: 0,
            });
        }
    }

    return response;
}
