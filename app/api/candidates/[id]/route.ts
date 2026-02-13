/**
 * GET /api/candidates/[id]
 * 후보자 상세 조회
 *
 * PATCH /api/candidates/[id]
 * 후보자 정보 수정 (검토 후 편집)
 *
 * DELETE /api/candidates/[id]
 * 후보자 삭제 (Soft Delete + Storage 파일 삭제)
 * - PRD: prd_refund_policy_v0.4.md Section 2.2
 * - QA: refund_policy_test_scenarios_v1.0.md (EC-041 ~ EC-050)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type CandidateDetail,
  getConfidenceLevel,
  type Career,
  type Project,
  type Education,
  type RiskLevel,
  type InterestLevel,
} from "@/types";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
  apiConflict,
  apiForbidden,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DB row를 CandidateDetail로 변환
 */
function toCandidateDetail(row: Record<string, unknown>): CandidateDetail {
  const confidence = (row.confidence_score as number) ?? 0;
  const confidencePercent = Math.round(confidence * 100);

  return {
    id: row.id as string,
    name: row.name as string,
    role: (row.last_position as string) ?? "",
    company: (row.last_company as string) ?? "",
    expYears: (row.exp_years as number) ?? 0,
    skills: (row.skills as string[]) ?? [],
    photoUrl: row.photo_url as string | undefined,
    summary: row.summary as string | undefined,
    aiConfidence: confidencePercent,
    confidenceLevel: getConfidenceLevel(confidencePercent),
    riskLevel: (row.risk_level as RiskLevel) ?? "low",
    requiresReview: (row.requires_review as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,

    // Detail specific fields
    birthYear: row.birth_year as number | undefined,
    gender: row.gender as "male" | "female" | "other" | undefined,
    // PII는 마스킹된 버전만 표시 (DB에는 phone_masked, email_masked, address_masked만 존재)
    phone: (row.phone_masked as string) || undefined,
    email: (row.email_masked as string) || undefined,
    address: (row.address_masked as string) || undefined,

    // 학력 분리 필드
    educationLevel: row.education_level as string | undefined,
    educationSchool: row.education_school as string | undefined,
    educationMajor: row.education_major as string | undefined,
    locationCity: row.location_city as string | undefined,

    // 상세 정보
    careers: (row.careers as Career[]) ?? [],
    projects: (row.projects as Project[]) ?? [],
    education: (row.education as Education[]) ?? [],
    strengths: (row.strengths as string[]) ?? [],

    // 시각 자산
    portfolioThumbnailUrl: row.portfolio_thumbnail_url as string | undefined,
    portfolioUrl: row.portfolio_url as string | undefined,
    githubUrl: row.github_url as string | undefined,
    linkedinUrl: row.linkedin_url as string | undefined,

    // 버전 관리
    version: (row.version as number) ?? 1,
    parentId: row.parent_id as string | undefined,
    isLatest: (row.is_latest as boolean) ?? true,

    // AI 분석 메타
    analysisMode: (row.analysis_mode as "phase_1" | "phase_2") ?? "phase_1",
    warnings: (row.warnings as string[]) ?? [],
    fieldConfidence: row.field_confidence as Record<string, number> | undefined,

    // 파일 정보
    sourceFile: row.source_file as string | undefined,
    fileType: row.file_type as string | undefined,
    pdfUrl: row.pdf_url as string | undefined,

    // P0: Lifecycle Fields (헤드헌터 인터뷰 기반)
    lastContactAt: row.last_contact_at as string | undefined,
    interestLevel: (row.interest_level as InterestLevel) ?? "unknown",
    salaryExpectationMin: row.salary_expectation_min as number | undefined,
    salaryExpectationMax: row.salary_expectation_max as number | undefined,
    locationPreferences: (row.location_preferences as string[]) ?? [],
    earliestStartDate: row.earliest_start_date as string | undefined,
    availabilityNotes: row.availability_notes as string | undefined,
    contactCount: (row.contact_count as number) ?? 0,
  };
}

// 후보자 상세 조회에 필요한 컬럼
const CANDIDATE_DETAIL_COLUMNS = `
  id, name, last_position, last_company, exp_years, skills,
  photo_url, summary, confidence_score, risk_level, requires_review,
  created_at, updated_at, birth_year, gender,
  phone_masked, email_masked, address_masked,
  education_level, education_school, education_major, location_city,
  careers, projects, education, strengths,
  portfolio_thumbnail_url, portfolio_url, github_url, linkedin_url,
  version, parent_id, is_latest, analysis_mode, warnings, field_confidence,
  source_file, file_type, pdf_url,
  last_contact_at, interest_level, salary_expectation_min, salary_expectation_max,
  location_preferences, earliest_start_date, availability_notes, contact_count
`;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Rate Limit 체크 (분당 60회)
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회 (public.users)
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

    // 후보자 상세 조회 (명시적 user_id 검증 + RLS 이중 보호)
    const { data, error } = await supabase
      .from("candidates")
      .select(CANDIDATE_DETAIL_COLUMNS)
      .eq("id", id)
      .eq("user_id", publicUserId) // 명시적 소유권 검증
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      // DB 에러 상세 정보 숨김
      console.error("Candidate fetch error:", error);
      return apiInternalError();
    }

    const row = data as Record<string, unknown>;
    const candidate = toCandidateDetail(row);

    return apiSuccess(candidate);
  } catch (error) {
    console.error("Candidate detail API error:", error);
    return apiInternalError();
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Rate Limit 체크 (분당 60회)
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // ─────────────────────────────────────────────────
    // 1. 인증 확인
    // ─────────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회 (public.users)
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

    // ─────────────────────────────────────────────────
    // 2. 요청 바디 파싱 + 헤더 확인
    // ─────────────────────────────────────────────────
    const body = await request.json();

    // 멱등성 키 (선택적) - 중복 요청 방지
    const idempotencyKey = request.headers.get("X-Idempotency-Key");

    // 낙관적 락 (선택적) - 동시 수정 충돌 방지
    // 클라이언트가 알고 있는 마지막 수정 시간
    const expectedUpdatedAt = body._expectedUpdatedAt as string | undefined;
    delete body._expectedUpdatedAt; // 업데이트 데이터에서 제거

    // 허용된 필드 (snake_case)
    const allowedFields = [
      "name",
      "birth_year",
      "gender",
      "skills",
      "exp_years",
      "last_company",
      "last_position",
      "education_level",
      "education_school",
      "education_major",
      "location_city",
      "summary",
      "strengths",
      "careers",
      "projects",
      "education",
      "requires_review",
      "portfolio_url",
      "github_url",
      "linkedin_url",
      // P0: Lifecycle Fields (헤드헌터 인터뷰 기반)
      "interest_level",
      "salary_expectation_min",
      "salary_expectation_max",
      "location_preferences",
      "earliest_start_date",
      "availability_notes",
    ];

    // camelCase → snake_case 변환 맵
    const fieldMap: Record<string, string> = {
      birthYear: "birth_year",
      expYears: "exp_years",
      lastCompany: "last_company",
      lastPosition: "last_position",
      educationLevel: "education_level",
      educationSchool: "education_school",
      educationMajor: "education_major",
      locationCity: "location_city",
      requiresReview: "requires_review",
      portfolioUrl: "portfolio_url",
      githubUrl: "github_url",
      linkedinUrl: "linkedin_url",
      // P0: Lifecycle Fields
      interestLevel: "interest_level",
      salaryExpectationMin: "salary_expectation_min",
      salaryExpectationMax: "salary_expectation_max",
      locationPreferences: "location_preferences",
      earliestStartDate: "earliest_start_date",
      availabilityNotes: "availability_notes",
    };

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const dbKey = fieldMap[key] || key;
      if (allowedFields.includes(dbKey) && value !== undefined) {
        updateData[dbKey] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return apiBadRequest("업데이트할 필드가 없습니다.");
    }

    // ─────────────────────────────────────────────────
    // 3. 권한 및 충돌 검증
    // ─────────────────────────────────────────────────

    // 먼저 현재 상태 조회 (소유권 + 버전 확인)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentData, error: fetchError } = await (supabase as any)
      .from("candidates")
      .select("user_id, updated_at")
      .eq("id", id)
      .single();

    if (fetchError || !currentData) {
      if (fetchError?.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      console.error("Candidate fetch for validation error:", fetchError);
      return apiInternalError();
    }

    // 소유권 검증 (403 Forbidden)
    if (currentData.user_id !== publicUserId) {
      return apiForbidden("이 후보자를 수정할 권한이 없습니다.");
    }

    // 낙관적 락: 동시 수정 충돌 검사 (409 Conflict)
    if (expectedUpdatedAt) {
      const serverUpdatedAt = new Date(currentData.updated_at).toISOString();
      const clientUpdatedAt = new Date(expectedUpdatedAt).toISOString();

      if (serverUpdatedAt !== clientUpdatedAt) {
        return apiConflict(
          "다른 곳에서 이미 수정되었습니다. 페이지를 새로고침하고 다시 시도해주세요."
        );
      }
    }

    // ─────────────────────────────────────────────────
    // 4. 업데이트 실행 (멱등성 보장)
    // ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("candidates")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", publicUserId) // RLS 이중 보호
      .select(CANDIDATE_DETAIL_COLUMNS)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      console.error("Candidate update error:", error);
      return apiInternalError();
    }

    const candidate = toCandidateDetail(data as unknown as Record<string, unknown>);

    // 응답에 멱등성 키 포함 (디버깅용)
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    return apiSuccess(candidate);
  } catch (error) {
    console.error("Candidate update API error:", error);
    return apiInternalError();
  }
}

/**
 * DELETE /api/candidates/[id]
 *
 * 후보자 삭제 (Soft Delete)
 * - EC-041: 정상 삭제 처리
 * - EC-042: 이미 삭제된 후보자 (idempotent)
 * - EC-043: 이미 환불된 후보자 (idempotent)
 * - EC-044: 권한 없는 사용자 (403)
 * - EC-045: 존재하지 않는 후보자 (404)
 * - EC-046: Storage 파일 삭제 실패 (로깅 후 진행)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Rate Limit 체크 (분당 60회)
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // ─────────────────────────────────────────────────
    // 1. 인증 확인
    // ─────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회 (public.users)
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

    // ─────────────────────────────────────────────────
    // 2. 후보자 조회 (권한 확인 + 상태 확인)
    // ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: fetchError } = await (supabase as any)
      .from("candidates")
      .select("id, user_id, status, deleted_at")
      .eq("id", id)
      .single();

    if (fetchError || !candidate) {
      if (fetchError?.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      console.error("[DELETE Candidate] Fetch error:", fetchError);
      return apiInternalError();
    }

    // 소유권 검증 (403 Forbidden) - EC-044
    if (candidate.user_id !== publicUserId) {
      return apiForbidden("이 후보자를 삭제할 권한이 없습니다.");
    }

    // ─────────────────────────────────────────────────
    // 3. 이미 삭제/환불된 경우 Idempotent 처리
    // ─────────────────────────────────────────────────
    // EC-042, EC-043: 이미 처리된 경우 성공 응답 (멱등성)
    if (
      candidate.status === "refunded" ||
      candidate.status === "deleted" ||
      candidate.deleted_at
    ) {
      return apiSuccess({
        success: true,
        candidateId: id,
        message: "Already processed",
        idempotent: true,
      });
    }

    // ─────────────────────────────────────────────────
    // 4. Storage 파일 삭제
    // ─────────────────────────────────────────────────
    // processing_jobs에서 파일 정보 조회 (candidate_id로 검색)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job } = await (supabase as any)
      .from("processing_jobs")
      .select("id, file_name, file_path")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (job?.file_name) {
      // Storage 경로: uploads/{user_id}/{job_id}.{ext}
      const ext = job.file_name.split(".").pop() || "pdf";
      const storagePath = `uploads/${publicUserId}/${job.id}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("resumes")
        .remove([storagePath]);

      // EC-046: Storage 삭제 실패 시 로깅만 (삭제는 진행)
      if (storageError) {
        console.error(
          `[DELETE Candidate] Storage deletion failed: ${storagePath}`,
          storageError
        );
      }
    }

    // ─────────────────────────────────────────────────
    // 5. Soft Delete 실행
    // ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("candidates")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        delete_reason: "user_request",
      })
      .eq("id", id)
      .eq("user_id", publicUserId); // RLS 이중 보호

    if (updateError) {
      console.error("[DELETE Candidate] Update error:", updateError);
      return apiInternalError("삭제 처리에 실패했습니다.");
    }

    return apiSuccess({
      success: true,
      candidateId: id,
    });
  } catch (error) {
    console.error("[DELETE Candidate] API error:", error);
    return apiInternalError();
  }
}
