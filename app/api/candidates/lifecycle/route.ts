/**
 * GET /api/candidates/lifecycle
 * 후보자 라이프사이클 통계 조회
 *
 * P0: 후보자 라이프사이클 관리 (헤드헌터 인터뷰 기반)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type CandidateLifecycleStats } from "@/types";
import {
  apiSuccess,
  apiUnauthorized,
  apiInternalError,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/candidates/lifecycle
 * 후보자 라이프사이클 통계 조회
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // RPC 함수로 통계 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "get_candidate_lifecycle_stats",
      {
        p_user_id: publicUserId,
      }
    );

    if (error) {
      console.error("Lifecycle stats RPC error:", error);
      return apiInternalError("통계 조회에 실패했습니다.");
    }

    // RPC 결과가 배열로 오므로 첫 번째 행 사용
    const row = Array.isArray(data) ? data[0] : data;

    const stats: CandidateLifecycleStats = {
      totalCandidates: row?.total_candidates ?? 0,
      hotCount: row?.hot_count ?? 0,
      warmCount: row?.warm_count ?? 0,
      coldCount: row?.cold_count ?? 0,
      unknownCount: row?.unknown_count ?? 0,
      noContact30Days: row?.no_contact_30_days ?? 0,
      noContact90Days: row?.no_contact_90_days ?? 0,
      upcomingFollowups: row?.upcoming_followups ?? 0,
    };

    return apiSuccess(stats);
  } catch (error) {
    console.error("Get lifecycle stats error:", error);
    return apiInternalError();
  }
}
