/**
 * GET /api/positions/[id]/matches - 매칭된 후보자 목록 조회
 * POST /api/positions/[id]/matches/refresh - 매칭 새로고침
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiInternalError,
} from "@/lib/api-response";
import { type PositionCandidate, type PositionMatchesResponse } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/positions/[id]/matches - 매칭된 후보자 목록 조회
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 포지션 소유권 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: position, error: positionError } = await (supabase as any)
      .from("positions")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (positionError || !position) {
      return apiNotFound("포지션을 찾을 수 없습니다.");
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage"); // matched, reviewed, contacted, etc.
    const minScore = parseFloat(searchParams.get("minScore") || "0");
    const sortBy = searchParams.get("sortBy") || "score"; // score, recent
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 매칭 결과 조회 (후보자 정보 조인)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from("position_candidates")
      .select(
        `
        *,
        candidates!inner (
          id,
          name,
          last_position,
          last_company,
          exp_years,
          skills,
          photo_url
        )
      `,
        { count: "exact" }
      )
      .eq("position_id", id)
      .gte("overall_score", minScore / 100); // 0-1 스케일로 변환

    // 단계 필터
    if (stage) {
      query = query.eq("stage", stage);
    }

    // 정렬
    if (sortBy === "recent") {
      query = query.order("matched_at", { ascending: false });
    } else {
      query = query.order("overall_score", { ascending: false });
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data: matches, error: matchError, count } = await query;

    if (matchError) {
      console.error("Fetch matches error:", matchError);
      return apiInternalError();
    }

    // 점수 분포 계산
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allScores } = await (supabase as any)
      .from("position_candidates")
      .select("overall_score")
      .eq("position_id", id);

    const scoreDistribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      low: 0,
    };

    for (const row of allScores || []) {
      const score = (row.overall_score as number) * 100;
      if (score >= 80) scoreDistribution.excellent++;
      else if (score >= 60) scoreDistribution.good++;
      else if (score >= 40) scoreDistribution.fair++;
      else scoreDistribution.low++;
    }

    // 결과 변환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: PositionCandidate[] = (matches || []).map((row: any) => {
      const candidate = row.candidates as Record<string, unknown>;
      return {
        id: row.id as string,
        positionId: row.position_id as string,
        candidateId: row.candidate_id as string,
        overallScore: Math.round(((row.overall_score as number) || 0) * 100),
        skillScore: Math.round(((row.skill_score as number) || 0) * 100),
        experienceScore: Math.round(((row.experience_score as number) || 0) * 100),
        educationScore: Math.round(((row.education_score as number) || 0) * 100),
        semanticScore: Math.round(((row.semantic_score as number) || 0) * 100),
        matchedSkills: (row.matched_skills as string[]) || [],
        missingSkills: (row.missing_skills as string[]) || [],
        synonymMatches: (row.synonym_matches as PositionCandidate["synonymMatches"]) || [],
        matchExplanation: row.match_explanation as PositionCandidate["matchExplanation"],
        stage: (row.stage as PositionCandidate["stage"]) || "matched",
        rejectionReason: row.rejection_reason as string | undefined,
        notes: row.notes as string | undefined,
        matchedAt: row.matched_at as string,
        stageUpdatedAt: row.stage_updated_at as string,
        candidate: {
          id: candidate.id as string,
          name: candidate.name as string,
          lastPosition: candidate.last_position as string | undefined,
          lastCompany: candidate.last_company as string | undefined,
          expYears: (candidate.exp_years as number) || 0,
          skills: (candidate.skills as string[]) || [],
          photoUrl: candidate.photo_url as string | undefined,
        },
      };
    });

    const response: PositionMatchesResponse = {
      matches: results,
      total: count || 0,
      scoreDistribution,
    };

    return apiSuccess(response, {
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  } catch (error) {
    console.error("Get matches error:", error);
    return apiInternalError();
  }
}

/**
 * POST /api/positions/[id]/matches - 매칭 새로고침
 */
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
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 포지션 소유권 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: position, error: positionError } = await (supabase as any)
      .from("positions")
      .select("id, title")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (positionError || !position) {
      return apiNotFound("포지션을 찾을 수 없습니다.");
    }

    // 요청 파라미터 파싱
    let body: { limit?: number; minScore?: number } = {};
    try {
      body = await request.json();
    } catch {
      // 빈 body 허용
    }

    const limit = Math.min(body.limit || 50, 100);
    const minScore = (body.minScore || 30) / 100; // 0-1 스케일로 변환

    // 매칭 실행
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchCount, error: matchError } = await (supabase as any).rpc(
      "save_position_matches",
      {
        p_position_id: id,
        p_user_id: user.id,
        p_limit: limit,
        p_min_score: minScore,
      }
    );

    if (matchError) {
      console.error("Refresh matches error:", matchError);
      return apiInternalError();
    }

    return apiSuccess(
      { matchCount: matchCount || 0 },
      { message: `${matchCount || 0}명의 후보자가 매칭되었습니다.` }
    );
  } catch (error) {
    console.error("Refresh matches error:", error);
    return apiInternalError();
  }
}
