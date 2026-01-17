/**
 * GET /api/positions/[id] - 포지션 상세 조회
 * PATCH /api/positions/[id] - 포지션 수정
 * DELETE /api/positions/[id] - 포지션 삭제
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embedding";
import { withRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
} from "@/lib/api-response";
import { type UpdatePositionRequest, toPosition } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/positions/[id] - 포지션 상세 조회
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

    // 포지션 조회 (매칭 통계 포함)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: position, error } = await (supabase as any)
      .from("positions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !position) {
      return apiNotFound("포지션을 찾을 수 없습니다.");
    }

    // 매칭 통계 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stageStats } = await (supabase as any)
      .from("position_candidates")
      .select("stage")
      .eq("position_id", id);

    const stats: Record<string, number> = {};
    for (const row of stageStats || []) {
      const stage = row.stage as string;
      stats[stage] = (stats[stage] || 0) + 1;
    }

    const result = toPosition(position as Record<string, unknown>);
    result.matchCount = stageStats?.length || 0;
    result.stageStats = stats as Record<
      | "matched"
      | "reviewed"
      | "contacted"
      | "interviewing"
      | "offered"
      | "placed"
      | "rejected"
      | "withdrawn",
      number
    >;

    return apiSuccess(result);
  } catch (error) {
    console.error("Get position error:", error);
    return apiInternalError();
  }
}

/**
 * PATCH /api/positions/[id] - 포지션 수정
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    // 기존 포지션 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchError } = await (supabase as any)
      .from("positions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound("포지션을 찾을 수 없습니다.");
    }

    // 요청 파싱
    const body: UpdatePositionRequest = await request.json();

    // 유효성 검증
    if (body.title !== undefined && (!body.title || body.title.length > 200)) {
      return apiBadRequest("포지션명은 1-200자로 입력해주세요.");
    }

    if (body.requiredSkills !== undefined) {
      if (!Array.isArray(body.requiredSkills) || body.requiredSkills.length === 0) {
        return apiBadRequest("최소 하나의 필수 스킬을 입력해주세요.");
      }
      if (body.requiredSkills.length > 20) {
        return apiBadRequest("필수 스킬은 최대 20개까지 입력할 수 있습니다.");
      }
    }

    if (body.minExpYears !== undefined && (body.minExpYears < 0 || body.minExpYears > 100)) {
      return apiBadRequest("최소 경력은 0-100년 사이로 입력해주세요.");
    }

    if (
      body.maxExpYears !== undefined &&
      body.maxExpYears !== null &&
      body.minExpYears !== undefined &&
      body.maxExpYears < body.minExpYears
    ) {
      return apiBadRequest("최대 경력은 최소 경력보다 크거나 같아야 합니다.");
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.clientCompany !== undefined) updateData.client_company = body.clientCompany;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.responsibilities !== undefined) updateData.responsibilities = body.responsibilities;
    if (body.qualifications !== undefined) updateData.qualifications = body.qualifications;
    if (body.preferredQualifications !== undefined) updateData.preferred_qualifications = body.preferredQualifications;
    if (body.benefits !== undefined) updateData.benefits = body.benefits;
    if (body.requiredSkills !== undefined) updateData.required_skills = body.requiredSkills;
    if (body.preferredSkills !== undefined) updateData.preferred_skills = body.preferredSkills;
    if (body.minExpYears !== undefined) updateData.min_exp_years = body.minExpYears;
    if (body.maxExpYears !== undefined) updateData.max_exp_years = body.maxExpYears;
    if (body.requiredEducationLevel !== undefined)
      updateData.required_education_level = body.requiredEducationLevel;
    if (body.preferredMajors !== undefined) updateData.preferred_majors = body.preferredMajors;
    if (body.locationCity !== undefined) updateData.location_city = body.locationCity;
    if (body.jobType !== undefined) updateData.job_type = body.jobType;
    if (body.salaryMin !== undefined) updateData.salary_min = body.salaryMin;
    if (body.salaryMax !== undefined) updateData.salary_max = body.salaryMax;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.deadline !== undefined) updateData.deadline = body.deadline;

    // description, responsibilities, qualifications, 또는 스킬이 변경되면 임베딩 재생성
    const needsReembedding =
      body.description !== undefined ||
      body.responsibilities !== undefined ||
      body.qualifications !== undefined ||
      body.requiredSkills !== undefined ||
      body.preferredSkills !== undefined ||
      body.title !== undefined;

    if (needsReembedding) {
      const newDescription = body.description ?? existing.description;
      const newTitle = body.title ?? existing.title;
      const newResponsibilities = body.responsibilities ?? existing.responsibilities;
      const newQualifications = body.qualifications ?? existing.qualifications;
      const newRequiredSkills = body.requiredSkills ?? existing.required_skills;
      const newPreferredSkills = body.preferredSkills ?? existing.preferred_skills;

      // 임베딩에 더 풍부한 컨텍스트 포함
      const hasContent = newDescription || newResponsibilities || newQualifications;
      if (hasContent) {
        try {
          const embeddingText = [
            newTitle,
            newResponsibilities,
            newQualifications,
            newRequiredSkills?.length ? `필수 스킬: ${newRequiredSkills.join(", ")}` : "",
            newPreferredSkills?.length ? `우대 스킬: ${newPreferredSkills.join(", ")}` : "",
            newDescription,
          ]
            .filter(Boolean)
            .join("\n");

          updateData.embedding = await generateEmbedding(embeddingText);
        } catch (embeddingError) {
          console.warn("Position embedding regeneration failed:", embeddingError);
        }
      }
    }

    // 업데이트할 필드가 없으면 기존 데이터 반환
    if (Object.keys(updateData).length === 0) {
      return apiSuccess(toPosition(existing as Record<string, unknown>), {
        message: "변경된 내용이 없습니다.",
      });
    }

    // 업데이트 실행
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (supabase as any)
      .from("positions")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Position update error:", updateError);
      return apiInternalError("포지션 수정에 실패했습니다.");
    }

    // 활동 로그 기록 (실패해도 무시)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("position_activities").insert({
        position_id: id,
        activity_type: "position_updated",
        description: "포지션 정보가 수정되었습니다.",
        metadata: { updated_fields: Object.keys(updateData) },
        created_by: user.id,
      });
    } catch (activityError) {
      console.warn("Activity log insert failed:", activityError);
    }

    // 스킬/경력 변경 시 자동 재매칭
    if (
      body.requiredSkills !== undefined ||
      body.minExpYears !== undefined ||
      body.maxExpYears !== undefined
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("save_position_matches", {
          p_position_id: id,
          p_user_id: user.id,
          p_limit: 50,
          p_min_score: 0.3,
        });
      } catch (matchError) {
        console.warn("Re-matching failed:", matchError);
      }
    }

    return apiSuccess(toPosition(updated as Record<string, unknown>), {
      message: "포지션이 수정되었습니다.",
    });
  } catch (error) {
    console.error("Update position error:", error);
    return apiInternalError();
  }
}

/**
 * DELETE /api/positions/[id] - 포지션 삭제
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // 포지션 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchError } = await (supabase as any)
      .from("positions")
      .select("id, title")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound("포지션을 찾을 수 없습니다.");
    }

    // 삭제 실행 (CASCADE로 관련 데이터도 삭제됨)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from("positions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Position delete error:", deleteError);
      return apiInternalError();
    }

    return apiSuccess(null, {
      message: `"${existing.title}" 포지션이 삭제되었습니다.`,
    });
  } catch (error) {
    console.error("Delete position error:", error);
    return apiInternalError();
  }
}
