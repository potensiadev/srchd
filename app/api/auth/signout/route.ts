import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const supabase = await createClient();

    // 서버 사이드 로그아웃 (쿠키 삭제 헤더 설정됨)
    await supabase.auth.signOut();

    // 로그인 페이지로 리다이렉트
    return NextResponse.redirect(`${requestUrl.origin}/login?error=session_expired`);
}
