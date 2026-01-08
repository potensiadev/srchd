/**
 * POST /api/search/feedback
 * 검색 피드백 저장 (👍/👎)
 * - 검색 품질 개선용 데이터 수집
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";

// ─────────────────────────────────────────────────
// Zod 스키마 정의 (입력 검증 강화)
// ─────────────────────────────────────────────────
const feedbackSchema = z.object({
  candidateId: z.string().uuid("유효하지 않은 후보자 ID입니다."),
  searchQuery: z.string()
    .min(1, "검색어는 필수입니다.")
    .max(500, "검색어는 500자 이하로 입력해주세요."),
  feedbackType: z.enum(["relevant", "not_relevant", "clicked", "contacted"], {
    message: "유효하지 않은 피드백 타입입니다.",
  }),
  resultPosition: z.number()
    .int("결과 위치는 정수여야 합니다.")
    .min(0, "결과 위치는 0 이상이어야 합니다.")
    .max(1000, "결과 위치가 범위를 초과했습니다.")
    .optional()
    .default(0),
  relevanceScore: z.number()
    .min(0, "관련성 점수는 0 이상이어야 합니다.")
    .max(100, "관련성 점수는 100 이하여야 합니다.")
    .optional()
    .default(0),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 요청 바디 파싱 및 Zod 검증
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("잘못된 JSON 형식입니다.");
    }

    const parseResult = feedbackSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return apiBadRequest(firstError.message);
    }

    const {
      candidateId,
      searchQuery,
      feedbackType,
      resultPosition,
      relevanceScore,
    } = parseResult.data;

    // 피드백 저장
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("search_feedback")
      .insert({
        user_id: user.id,
        candidate_id: candidateId,
        search_query: searchQuery,
        feedback_type: feedbackType,
        result_position: resultPosition,
        relevance_score: relevanceScore,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Feedback insert error:", error);
      return apiInternalError();
    }

    return apiSuccess({ id: (data as { id: string }).id });
  } catch (error) {
    console.error("Feedback API error:", error);
    return apiInternalError();
  }
}
