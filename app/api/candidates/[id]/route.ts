/**
 * GET /api/candidates/[id]
 * 후보자 상세 조회
 *
 * PATCH /api/candidates/[id]
 * 후보자 정보 수정 (검토 후 편집)
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
} from "@/types";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
} from "@/lib/api-response";

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
    // Issue #4: PII는 UI에서 전체 표시 (row.phone, email, address 사용)
    phone: (row.phone as string) || (row.phone_masked as string) || undefined,
    email: (row.email as string) || (row.email_masked as string) || undefined,
    address: (row.address as string) || (row.address_masked as string) || undefined,

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
  };
}

// 후보자 상세 조회에 필요한 컬럼
const CANDIDATE_DETAIL_COLUMNS = `
  id, name, last_position, last_company, exp_years, skills,
  photo_url, summary, confidence_score, risk_level, requires_review,
  created_at, updated_at, birth_year, gender,
  phone, phone_masked, email, email_masked, address, address_masked,
  education_level, education_school, education_major, location_city,
  careers, projects, education, strengths,
  portfolio_thumbnail_url, portfolio_url, github_url, linkedin_url,
  version, parent_id, is_latest, analysis_mode, warnings, field_confidence,
  source_file, file_type
`;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 후보자 상세 조회 (RLS가 user_id 필터 자동 적용)
    const { data, error } = await supabase
      .from("candidates")
      .select(CANDIDATE_DETAIL_COLUMNS)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      console.error("Candidate fetch error:", error);
      return apiInternalError(error.message);
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
    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 요청 바디 파싱
    const body = await request.json();

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

    // 후보자 업데이트 (RLS가 user_id 검증)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("candidates")
      .update(updateData)
      .eq("id", id)
      .select(CANDIDATE_DETAIL_COLUMNS)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("후보자를 찾을 수 없습니다.");
      }
      console.error("Candidate update error:", error);
      return apiInternalError(error.message);
    }

    const candidate = toCandidateDetail(data as unknown as Record<string, unknown>);

    return apiSuccess(candidate);
  } catch (error) {
    console.error("Candidate update API error:", error);
    return apiInternalError();
  }
}
