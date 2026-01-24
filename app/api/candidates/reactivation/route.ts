/**
 * GET /api/candidates/reactivation
 * 재활성 대상 후보자 목록 조회 (P1-B)
 *
 * 헤드헌터 인터뷰 기반:
 * "분기 1회 Warm Pool 상태 갱신 캠페인"
 * "마지막 대화에서 후보자가 말한 진짜 이직 동기" 기반 개인화
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type CandidateListItem,
  type InterestLevel,
  getConfidenceLevel,
  type RiskLevel,
} from "@/types";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

interface ReactivationCandidate extends CandidateListItem {
  lastContactAt?: string;
  interestLevel: InterestLevel;
  contactCount: number;
  salaryExpectationMin?: number;
  salaryExpectationMax?: number;
  availabilityNotes?: string;
}

interface ReactivationResponse {
  candidates: ReactivationCandidate[];
  total: number;
}

/**
 * GET /api/candidates/reactivation
 * 재활성 대상 후보자 목록 조회
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

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 재활성 필터
    const lastContactBefore = searchParams.get("lastContactBefore"); // ISO date
    const interestLevels = searchParams.get("interestLevel")?.split(",") as
      | InterestLevel[]
      | undefined;
    const excludeRejected = searchParams.get("excludeRejected") === "true";
    const skills = searchParams.get("skills")?.split(",");
    const expYearsMin = searchParams.get("expYearsMin")
      ? parseInt(searchParams.get("expYearsMin")!)
      : undefined;
    const expYearsMax = searchParams.get("expYearsMax")
      ? parseInt(searchParams.get("expYearsMax")!)
      : undefined;

    // 기본값: 30일 이상 미접촉
    const defaultLastContactBefore = new Date();
    defaultLastContactBefore.setDate(defaultLastContactBefore.getDate() - 30);

    // RPC 함수 호출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "get_reactivation_candidates",
      {
        p_user_id: publicUserId,
        p_limit: limit,
        p_offset: offset,
        p_last_contact_before:
          lastContactBefore ||
          defaultLastContactBefore.toISOString().split("T")[0],
        p_interest_levels: interestLevels || null,
        p_exclude_rejected: excludeRejected,
        p_skills: skills || null,
        p_exp_years_min: expYearsMin || null,
        p_exp_years_max: expYearsMax || null,
      }
    );

    if (error) {
      console.error("Reactivation search RPC error:", error);
      return apiInternalError("재활성 후보자 조회에 실패했습니다.");
    }

    // 결과 변환
    const candidates: ReactivationCandidate[] = (data || []).map(
      (row: Record<string, unknown>) => {
        const confidence = (row.confidence_score as number) ?? 0;
        return {
          id: row.id as string,
          name: row.name as string,
          role: (row.last_position as string) ?? "",
          company: (row.last_company as string) ?? "",
          expYears: (row.exp_years as number) ?? 0,
          skills: (row.skills as string[]) ?? [],
          photoUrl: row.photo_url as string | undefined,
          summary: row.summary as string | undefined,
          aiConfidence: Math.round(confidence * 100),
          confidenceLevel: getConfidenceLevel(confidence * 100),
          riskLevel: (row.risk_level as RiskLevel) ?? "low",
          requiresReview: (row.requires_review as boolean) ?? false,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          // 재활성 필드
          lastContactAt: row.last_contact_at as string | undefined,
          interestLevel: (row.interest_level as InterestLevel) ?? "unknown",
          contactCount: (row.contact_count as number) ?? 0,
          salaryExpectationMin: row.salary_expectation_min as number | undefined,
          salaryExpectationMax: row.salary_expectation_max as number | undefined,
          availabilityNotes: row.availability_notes as string | undefined,
        };
      }
    );

    // 첫 번째 행에서 total_count 추출
    const total = data?.[0]?.total_count ?? candidates.length;

    const response: ReactivationResponse = {
      candidates,
      total,
    };

    return apiSuccess(response, {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  } catch (error) {
    console.error("Get reactivation candidates error:", error);
    return apiInternalError();
  }
}
