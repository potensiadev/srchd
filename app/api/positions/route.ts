/**
 * POST /api/positions - 새 포지션 생성
 * GET /api/positions - 포지션 목록 조회
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embedding";
import { withRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import {
  type CreatePositionRequest,
  type PositionListItem,
  toPosition,
  toPositionListItem,
} from "@/types";

// 입력 검증
function validateCreatePositionRequest(body: unknown): {
  valid: boolean;
  error?: string;
  data?: CreatePositionRequest;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "요청 본문이 필요합니다." };
  }

  const req = body as Record<string, unknown>;

  // 필수 필드 검증
  if (!req.title || typeof req.title !== "string" || req.title.trim().length === 0) {
    return { valid: false, error: "포지션명은 필수입니다." };
  }

  if (req.title.length > 200) {
    return { valid: false, error: "포지션명은 200자 이하로 입력해주세요." };
  }

  if (!Array.isArray(req.requiredSkills)) {
    return { valid: false, error: "필수 스킬은 배열 형식이어야 합니다." };
  }

  if (req.requiredSkills.length === 0) {
    return { valid: false, error: "최소 하나의 필수 스킬을 입력해주세요." };
  }

  if (req.requiredSkills.length > 20) {
    return { valid: false, error: "필수 스킬은 최대 20개까지 입력할 수 있습니다." };
  }

  if (typeof req.minExpYears !== "number" || req.minExpYears < 0) {
    return { valid: false, error: "최소 경력은 0 이상의 숫자여야 합니다." };
  }

  if (req.maxExpYears !== undefined && req.maxExpYears !== null) {
    if (typeof req.maxExpYears !== "number" || req.maxExpYears < req.minExpYears) {
      return { valid: false, error: "최대 경력은 최소 경력보다 크거나 같아야 합니다." };
    }
  }

  if (req.description && typeof req.description === "string" && req.description.length > 10000) {
    return { valid: false, error: "상세 설명은 10000자 이하로 입력해주세요." };
  }

  return {
    valid: true,
    data: {
      title: req.title as string,
      clientCompany: req.clientCompany as string | undefined,
      department: req.department as string | undefined,
      description: req.description as string | undefined,
      responsibilities: req.responsibilities as string | undefined,
      qualifications: req.qualifications as string | undefined,
      preferredQualifications: req.preferredQualifications as string | undefined,
      benefits: req.benefits as string | undefined,
      requiredSkills: req.requiredSkills as string[],
      preferredSkills: (req.preferredSkills as string[] | undefined) || [],
      minExpYears: req.minExpYears as number,
      maxExpYears: req.maxExpYears as number | undefined,
      requiredEducationLevel: req.requiredEducationLevel as string | undefined,
      preferredMajors: (req.preferredMajors as string[] | undefined) || [],
      locationCity: req.locationCity as string | undefined,
      jobType: req.jobType ? (req.jobType as CreatePositionRequest["jobType"]) : undefined,
      salaryMin: req.salaryMin as number | undefined,
      salaryMax: req.salaryMax as number | undefined,
      priority: (req.priority as CreatePositionRequest["priority"]) || "normal",
      deadline: req.deadline as string | undefined,
    },
  };
}

/**
 * POST /api/positions - 새 포지션 생성
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 요청 검증
    const body = await request.json();
    const validation = validateCreatePositionRequest(body);
    if (!validation.valid || !validation.data) {
      return apiBadRequest(validation.error || "잘못된 요청입니다.");
    }

    const data = validation.data;

    // JD 임베딩 생성 (description, responsibilities, 또는 qualifications가 있는 경우)
    let embedding: number[] | null = null;
    const hasContent = data.description || data.responsibilities || data.qualifications;
    if (hasContent) {
      try {
        // 임베딩용 텍스트: 제목 + 주요업무 + 자격요건 + 스킬 + 설명 (더 풍부한 컨텍스트)
        const embeddingText = [
          data.title,
          data.responsibilities,
          data.qualifications,
          `필수 스킬: ${data.requiredSkills.join(", ")}`,
          data.preferredSkills?.length ? `우대 스킬: ${data.preferredSkills.join(", ")}` : "",
          data.description,
        ]
          .filter(Boolean)
          .join("\n");

        embedding = await generateEmbedding(embeddingText);
      } catch (embeddingError) {
        console.warn("Position embedding generation failed:", embeddingError);
        // 임베딩 실패해도 포지션 생성은 진행
      }
    }

    // 포지션 저장
    // 빈 문자열을 null로 변환 (DB는 빈 문자열을 날짜로 파싱할 수 없음)
    const toNullIfEmpty = (val: string | undefined | null): string | null =>
      val && val.trim() ? val.trim() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: position, error: insertError } = await (supabase as any)
      .from("positions")
      .insert({
        user_id: user.id,
        title: data.title,
        client_company: toNullIfEmpty(data.clientCompany),
        department: toNullIfEmpty(data.department),
        description: toNullIfEmpty(data.description),
        responsibilities: toNullIfEmpty(data.responsibilities),
        qualifications: toNullIfEmpty(data.qualifications),
        preferred_qualifications: toNullIfEmpty(data.preferredQualifications),
        benefits: toNullIfEmpty(data.benefits),
        required_skills: data.requiredSkills,
        preferred_skills: data.preferredSkills,
        min_exp_years: data.minExpYears,
        max_exp_years: data.maxExpYears,
        required_education_level: toNullIfEmpty(data.requiredEducationLevel),
        preferred_majors: data.preferredMajors,
        location_city: toNullIfEmpty(data.locationCity),
        job_type: data.jobType,
        salary_min: data.salaryMin,
        salary_max: data.salaryMax,
        priority: data.priority,
        deadline: toNullIfEmpty(data.deadline),
        embedding,
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Position insert error:", JSON.stringify(insertError, null, 2));
      console.error("Insert data:", JSON.stringify({
        user_id: user.id,
        title: data.title,
        client_company: data.clientCompany,
        required_skills: data.requiredSkills,
        min_exp_years: data.minExpYears,
        embedding_length: embedding?.length,
      }, null, 2));
      return apiInternalError(`포지션 생성 실패: ${insertError.message || insertError.code || 'Unknown error'}`);
    }

    // 자동 매칭 및 활동 로그는 non-blocking으로 실행 (응답 속도 최적화)
    // Promise.allSettled를 사용하여 병렬로 실행하고 결과를 기다리지 않음
    const backgroundTasks = async () => {
      try {
        await Promise.allSettled([
          // 자동 매칭 실행
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc("save_position_matches", {
            p_position_id: position.id,
            p_user_id: user.id,
            p_limit: 50,
            p_min_score: 0.3,
          }),
          // 활동 로그 기록
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("position_activities").insert({
            position_id: position.id,
            activity_type: "position_created",
            description: `"${data.title}" 포지션이 생성되었습니다.`,
            created_by: user.id,
          }),
        ]);
      } catch (error) {
        console.warn("Background tasks error:", error);
      }
    };

    // Fire-and-forget: don't await background tasks for faster response
    backgroundTasks().catch((err) => console.warn("Background tasks failed:", err));

    return apiSuccess(toPosition(position as Record<string, unknown>), {
      message: "포지션이 생성되었습니다.",
    });
  } catch (error) {
    console.error("Create position error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return apiInternalError(`포지션 생성 중 예외 발생: ${errorMessage}`);
  }
}

/**
 * GET /api/positions - 포지션 목록 조회
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
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // open, paused, closed, filled
    const priority = searchParams.get("priority"); // urgent, high, normal, low
    const sortBy = searchParams.get("sortBy") || "created_at"; // created_at, deadline, priority
    const sortOrder = searchParams.get("sortOrder") || "desc"; // asc, desc
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 쿼리 빌드
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from("positions")
      .select("*, position_candidates(count)", { count: "exact" })
      .eq("user_id", user.id);

    // 필터 적용
    if (status) {
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    // 정렬 적용
    const validSortColumns = ["created_at", "updated_at", "deadline", "priority", "title"];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : "created_at";
    query = query.order(sortColumn, { ascending: sortOrder === "asc" });

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data: positions, error, count } = await query;

    if (error) {
      console.error("Positions list error:", error);
      return apiInternalError();
    }

    // 결과 변환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: PositionListItem[] = (positions || []).map((row: any) => {
      const item = toPositionListItem(row as Record<string, unknown>);
      // position_candidates count 추가
      const countData = row.position_candidates as { count: number }[] | undefined;
      item.matchCount = countData?.[0]?.count || 0;
      return item;
    });

    return apiSuccess(items, {
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  } catch (error) {
    console.error("List positions error:", error);
    return apiInternalError();
  }
}
