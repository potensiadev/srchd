/**
 * POST /api/saved-searches/[id]/use
 * 저장된 검색 사용 기록 (use_count 증가)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiInternalError,
  apiForbidden,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 소유권 확인 및 현재 값 조회
    const { data: existing, error: fetchError } = await supabase
      .from("saved_searches")
      .select("user_id, query, filters, use_count")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound("저장된 검색을 찾을 수 없습니다.");
    }

    const existingRow = existing as {
      user_id: string;
      query: string;
      filters: Record<string, unknown> | null;
      use_count: number;
    };
    if (existingRow.user_id !== publicUserId) {
      return apiForbidden("이 검색을 사용할 권한이 없습니다.");
    }

    // use_count 증가 및 last_used_at 업데이트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("saved_searches")
      .update({
        use_count: (existingRow.use_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", id);

    return apiSuccess({
      query: existingRow.query,
      filters: existingRow.filters || {},
    });
  } catch (error) {
    console.error("Saved search use API error:", error);
    return apiInternalError();
  }
}
