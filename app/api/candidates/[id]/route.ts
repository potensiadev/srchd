/**
 * GET /api/candidates/[id]
 * 후보자 상세 조회
 *
 * PATCH /api/candidates/[id]
 * 후보자 정보 수정 (검토 후 편집)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type CandidateDetail,
  type ApiResponse,
  getConfidenceLevel,
  type Career,
  type Project,
  type Education,
  type RiskLevel,
} from "@/types";

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
    phone: row.phone_masked as string | undefined,
    email: row.email_masked as string | undefined,
    address: row.address_masked as string | undefined,

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse<null>>(
        { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
        { status: 401 }
      );
    }

    // 후보자 상세 조회 (RLS가 user_id 필터 자동 적용)
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json<ApiResponse<null>>(
          { error: { code: "NOT_FOUND", message: "후보자를 찾을 수 없습니다." } },
          { status: 404 }
        );
      }
      console.error("Candidate fetch error:", error);
      return NextResponse.json<ApiResponse<null>>(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 }
      );
    }

    const row = data as Record<string, unknown>;
    const candidate = toCandidateDetail(row);

    return NextResponse.json<ApiResponse<CandidateDetail>>({
      data: candidate,
    });
  } catch (error) {
    console.error("Candidate detail API error:", error);
    return NextResponse.json<ApiResponse<null>>(
      { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse<null>>(
        { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
        { status: 401 }
      );
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
      return NextResponse.json<ApiResponse<null>>(
        { error: { code: "INVALID_REQUEST", message: "업데이트할 필드가 없습니다." } },
        { status: 400 }
      );
    }

    // 후보자 업데이트 (RLS가 user_id 검증)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("candidates")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json<ApiResponse<null>>(
          { error: { code: "NOT_FOUND", message: "후보자를 찾을 수 없습니다." } },
          { status: 404 }
        );
      }
      console.error("Candidate update error:", error);
      return NextResponse.json<ApiResponse<null>>(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 }
      );
    }

    const candidate = toCandidateDetail(data as unknown as Record<string, unknown>);

    return NextResponse.json<ApiResponse<CandidateDetail>>({
      data: candidate,
    });
  } catch (error) {
    console.error("Candidate update API error:", error);
    return NextResponse.json<ApiResponse<null>>(
      { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}
