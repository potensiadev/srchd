/**
 * GET /api/candidates/companies
 * 사용자의 후보자들에서 고유한 회사 목록을 반환
 * 자동완성용
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiUnauthorized, apiInternalError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 검색어 파라미터 (선택)
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";

    // 고유한 회사 목록 조회 (last_company 기준)
    let queryBuilder = supabase
      .from("candidates")
      .select("last_company")
      .eq("user_id", user.id)
      .eq("is_latest", true)
      .not("last_company", "is", null);

    // 검색어가 있으면 필터링
    if (query) {
      queryBuilder = queryBuilder.ilike("last_company", `%${query}%`);
    }

    const { data, error } = await queryBuilder
      .order("last_company", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Companies fetch error:", error);
      return apiInternalError();
    }

    // 중복 제거 및 고유 회사 목록 생성
    const uniqueCompanies = Array.from(
      new Set(
        (data as { last_company: string | null }[] || [])
          .map((row) => row.last_company as string)
          .filter(Boolean)
      )
    ).sort();

    return apiSuccess({ companies: uniqueCompanies });
  } catch (error) {
    console.error("Companies API error:", error);
    return apiInternalError();
  }
}
