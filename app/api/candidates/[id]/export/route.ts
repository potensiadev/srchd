import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiInternalError,
  apiRateLimitExceeded,
} from "@/lib/api-response";
import { PLAN_CONFIG } from "@/lib/file-validation";
import { type PlanType } from "@/types/auth";

/**
 * Blind Export API
 *
 * 후보자 이력서를 블라인드 처리하여 내보내기
 * - 연락처 정보 마스킹
 * - 월별 내보내기 횟수 제한 (Starter: 30회)
 * - 내보내기 기록 저장
 */

// 중앙화된 플랜 설정 사용
const PLAN_LIMITS = PLAN_CONFIG.EXPORT_LIMITS;

// 내보내기에 필요한 후보자 컬럼
const EXPORT_CANDIDATE_COLUMNS = `
  id, user_id, name, last_position, last_company, exp_years, skills,
  photo_url, summary, confidence_score, birth_year, gender,
  phone_masked, email_masked, address_masked,
  phone_encrypted, email_encrypted, address_encrypted,
  phone_hash, email_hash,
  education_level, education_school, education_major, location_city,
  careers, projects, education, strengths,
  portfolio_thumbnail_url, portfolio_url, github_url, linkedin_url,
  created_at
`;

interface ExportRequest {
  format?: "pdf" | "docx";
  includePhoto?: boolean;
  includePortfolio?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    // 요청 파싱
    const body: ExportRequest = await request.json().catch(() => ({}));
    const format = body.format || "pdf";

    // 사용자 플랜 조회
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      return apiNotFound("사용자를 찾을 수 없습니다.");
    }

    const plan = ((userData as { plan: string }).plan || "starter") as PlanType;
    const monthlyLimit = PLAN_LIMITS[plan] ?? 30;

    // 월별 내보내기 횟수 체크
    if (monthlyLimit !== Infinity) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: countResult } = await (supabase as any).rpc(
        "get_monthly_blind_export_count",
        { p_user_id: user.id }
      );

      const currentCount = (countResult as unknown as number) || 0;
      if (currentCount >= monthlyLimit) {
        return apiRateLimitExceeded(`월 내보내기 한도(${monthlyLimit}회)를 초과했습니다.`);
      }
    }

    // 후보자 데이터 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: candidateError } = await (supabase as any)
      .from("candidates")
      .select(EXPORT_CANDIDATE_COLUMNS)
      .eq("id", candidateId)
      .eq("user_id", user.id)
      .single();

    if (candidateError || !candidate) {
      return apiNotFound("후보자를 찾을 수 없습니다.");
    }

    // 블라인드 데이터 생성 (연락처 마스킹)
    const blindData = {
      ...candidate,
      // 연락처 완전 마스킹
      phone_masked: "[연락처 비공개]",
      email_masked: "[이메일 비공개]",
      address_masked: "[주소 비공개]",
      // 암호화 필드 제거
      phone_encrypted: null,
      email_encrypted: null,
      address_encrypted: null,
      phone_hash: null,
      email_hash: null,
    };

    const maskedFields = ["phone", "email", "address"];

    // 내보내기 기록 저장
    const fileName = `${blindData.name || "이력서"}_블라인드_${new Date().toISOString().split("T")[0]}.${format}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("blind_exports").insert({
      user_id: user.id,
      candidate_id: candidateId,
      format,
      file_name: fileName,
      masked_fields: maskedFields,
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    });

    // HTML 템플릿 생성 (클라이언트에서 PDF로 변환)
    const htmlContent = generateBlindResumeHTML(blindData, {
      includePhoto: body.includePhoto ?? false,
      includePortfolio: body.includePortfolio ?? false,
    });

    return apiSuccess({
      html: htmlContent,
      fileName,
      format,
      candidate: {
        id: blindData.id,
        name: blindData.name,
        // 마스킹된 정보만 포함
        phone: "[연락처 비공개]",
        email: "[이메일 비공개]",
        summary: blindData.summary,
        expYears: blindData.exp_years,
        skills: blindData.skills,
        careers: blindData.careers,
        education: blindData.education,
        projects: blindData.projects,
        strengths: blindData.strengths,
      },
    });
  } catch (error) {
    console.error("Blind export error:", error);
    return apiInternalError();
  }
}

// 월별 내보내기 횟수 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // params 사용 표시
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    // 사용자 플랜 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData } = await (supabase as any)
      .from("users")
      .select("plan")
      .eq("id", user.id)
      .single();

    const plan = (((userData as { plan?: string } | null)?.plan) || "starter") as PlanType;
    const monthlyLimit = PLAN_LIMITS[plan] ?? 30;

    // 월별 사용량 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: countResult } = await (supabase as any).rpc(
      "get_monthly_blind_export_count",
      { p_user_id: user.id }
    );

    const used = (countResult as unknown as number) || 0;

    return apiSuccess({
      plan,
      limit: monthlyLimit === Infinity ? "unlimited" : monthlyLimit,
      used,
      remaining: monthlyLimit === Infinity ? "unlimited" : monthlyLimit - used,
    });
  } catch (error) {
    console.error("Export status error:", error);
    return apiInternalError();
  }
}

// 블라인드 이력서 HTML 생성
function generateBlindResumeHTML(
  candidate: Record<string, unknown>,
  options: { includePhoto: boolean; includePortfolio: boolean }
): string {
  const careers = (candidate.careers as Array<{
    company: string;
    position?: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    description?: string;
  }>) || [];

  const education = (candidate.education as Array<{
    school: string;
    degree?: string;
    major?: string;
    graduation_year?: number;
  }>) || [];

  const projects = (candidate.projects as Array<{
    name: string;
    role?: string;
    period?: string;
    description?: string;
    technologies?: string[];
  }>) || [];

  const skills = (candidate.skills as string[]) || [];
  const strengths = (candidate.strengths as string[]) || [];

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${candidate.name || "이력서"} - 블라인드 이력서</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #333;
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 24pt;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .header .subtitle {
      font-size: 12pt;
      color: #666;
    }

    .section {
      margin-bottom: 25px;
    }

    .section-title {
      font-size: 14pt;
      font-weight: 700;
      color: #1a1a1a;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 15px;
    }

    .summary {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      font-style: italic;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 15px;
    }

    .info-label {
      font-weight: 500;
      color: #666;
    }

    .info-value {
      color: #333;
    }

    .career-item, .education-item, .project-item {
      margin-bottom: 15px;
      padding-left: 15px;
      border-left: 3px solid #4a90d9;
    }

    .career-item h4, .education-item h4, .project-item h4 {
      font-size: 12pt;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .career-item .period, .education-item .period, .project-item .period {
      font-size: 10pt;
      color: #888;
      margin-bottom: 5px;
    }

    .career-item .description {
      font-size: 10pt;
      color: #555;
    }

    .skills-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .skill-tag {
      background: #e3f2fd;
      color: #1976d2;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 10pt;
    }

    .strengths-list {
      list-style: none;
    }

    .strengths-list li {
      padding: 5px 0;
      padding-left: 20px;
      position: relative;
    }

    .strengths-list li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #4caf50;
    }

    .blind-notice {
      text-align: center;
      padding: 15px;
      background: #fff3e0;
      border: 1px solid #ffcc80;
      border-radius: 8px;
      margin-top: 30px;
      font-size: 10pt;
      color: #e65100;
    }

    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #999;
    }

    @media print {
      body {
        padding: 20px;
      }
      .blind-notice {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${candidate.name || "이름 비공개"}</h1>
    <div class="subtitle">
      ${candidate.last_position || ""} ${candidate.last_company ? `@ ${candidate.last_company}` : ""}
    </div>
  </div>

  ${candidate.summary ? `
  <div class="section">
    <h2 class="section-title">요약</h2>
    <div class="summary">${candidate.summary}</div>
  </div>
  ` : ""}

  <div class="section">
    <h2 class="section-title">기본 정보</h2>
    <div class="info-grid">
      <span class="info-label">경력</span>
      <span class="info-value">${candidate.exp_years || 0}년</span>

      <span class="info-label">연락처</span>
      <span class="info-value">[연락처 비공개]</span>

      <span class="info-label">이메일</span>
      <span class="info-value">[이메일 비공개]</span>

      ${candidate.location_city ? `
      <span class="info-label">지역</span>
      <span class="info-value">${candidate.location_city}</span>
      ` : ""}
    </div>
  </div>

  ${skills.length > 0 ? `
  <div class="section">
    <h2 class="section-title">기술 스택</h2>
    <div class="skills-list">
      ${skills.map(skill => `<span class="skill-tag">${skill}</span>`).join("")}
    </div>
  </div>
  ` : ""}

  ${careers.length > 0 ? `
  <div class="section">
    <h2 class="section-title">경력 사항</h2>
    ${careers.map(career => `
    <div class="career-item">
      <h4>${career.company} ${career.position ? `- ${career.position}` : ""}</h4>
      <div class="period">
        ${career.start_date || ""} ~ ${career.is_current ? "현재" : (career.end_date || "")}
      </div>
      ${career.description ? `<div class="description">${career.description}</div>` : ""}
    </div>
    `).join("")}
  </div>
  ` : ""}

  ${education.length > 0 ? `
  <div class="section">
    <h2 class="section-title">학력</h2>
    ${education.map(edu => `
    <div class="education-item">
      <h4>${edu.school} ${edu.major ? `- ${edu.major}` : ""}</h4>
      <div class="period">
        ${edu.degree || ""} ${edu.graduation_year ? `(${edu.graduation_year}년)` : ""}
      </div>
    </div>
    `).join("")}
  </div>
  ` : ""}

  ${projects.length > 0 ? `
  <div class="section">
    <h2 class="section-title">프로젝트</h2>
    ${projects.map(project => `
    <div class="project-item">
      <h4>${project.name} ${project.role ? `(${project.role})` : ""}</h4>
      ${project.period ? `<div class="period">${project.period}</div>` : ""}
      ${project.description ? `<div class="description">${project.description}</div>` : ""}
      ${project.technologies && project.technologies.length > 0 ? `
      <div class="skills-list" style="margin-top: 8px;">
        ${project.technologies.map(tech => `<span class="skill-tag">${tech}</span>`).join("")}
      </div>
      ` : ""}
    </div>
    `).join("")}
  </div>
  ` : ""}

  ${strengths.length > 0 ? `
  <div class="section">
    <h2 class="section-title">강점</h2>
    <ul class="strengths-list">
      ${strengths.map(s => `<li>${s}</li>`).join("")}
    </ul>
  </div>
  ` : ""}

  <div class="blind-notice">
    본 이력서는 블라인드 처리되었습니다.<br>
    연락처 정보는 별도 문의를 통해 확인하실 수 있습니다.
  </div>

  <div class="footer">
    HR Screener에서 생성 | ${new Date().toLocaleDateString("ko-KR")}
  </div>
</body>
</html>
  `.trim();
}
