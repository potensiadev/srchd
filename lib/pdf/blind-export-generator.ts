import { escape } from "html-escaper";

export interface BlindExportOptions {
    includePhoto: boolean;
    includePortfolio: boolean;
}

/**
 * 블라인드 이력서 HTML 생성
 */
export function generateBlindResumeHTML(
    candidate: Record<string, unknown>,
    _options: BlindExportOptions
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
    // strengths is extracted but not displayed in blind resume (future feature)

    // Helper to escape HTML to prevent XSS in generated report
    const safe = (str: string | undefined | null) => str ? escape(String(str)) : "";

    return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safe(candidate.name as string) || "이력서"} - 블라인드 이력서</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

    :root {
      --primary-color: #2563eb;
      --text-color: #1f2937;
      --light-text: #6b7280;
      --border-color: #e5e7eb;
      --bg-color: #f9fafb;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Noto Sans KR', sans-serif;
      font-size: 10pt;
      line-height: 1.6;
      color: var(--text-color);
      max-width: 210mm; /* A4 width */
      margin: 0 auto;
      background: white;
    }

    @media screen {
      body {
        padding: 40px;
        background: #f3f4f6;
      }
      .page {
        background: white;
        padding: 40px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        margin: 0 auto;
      }
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }
      .page {
        padding: 0;
        box-shadow: none;
      }
      @page {
        margin: 15mm;
        size: A4;
      }
    }

    .header {
      padding-bottom: 20px;
      border-bottom: 2px solid var(--text-color);
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 24pt;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }

    .header .subtitle {
      font-size: 11pt;
      color: var(--light-text);
      font-weight: 500;
    }

    .section {
      margin-bottom: 25px;
      break-inside: avoid;
    }

    .section-title {
      font-size: 13pt;
      font-weight: 700;
      color: var(--primary-color);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-box {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid var(--primary-color);
      font-style: italic;
      color: #4b5563;
      font-size: 10pt;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px 20px;
    }

    .info-item {
      display: flex;
      align-items: center;
    }

    .info-label {
      font-weight: 600;
      color: var(--light-text);
      width: 80px;
      flex-shrink: 0;
      font-size: 9pt;
    }

    .info-value {
      color: var(--text-color);
      font-weight: 500;
    }

    .timeline-item {
      margin-bottom: 20px;
      position: relative;
    }

    .timeline-item:last-child {
      margin-bottom: 0;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 6px;
    }

    .item-title {
      font-size: 11pt;
      font-weight: 700;
      color: #111827;
    }

    .item-subtitle {
      font-size: 10pt;
      color: #4b5563;
      font-weight: 500;
    }

    .item-period {
      font-size: 9pt;
      color: #6b7280;
      font-family: 'Roboto', sans-serif;
    }

    .item-description {
      font-size: 10pt;
      color: #374151;
      white-space: pre-wrap;
      margin-top: 8px;
      line-height: 1.6;
    }

    .skills-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .skill-tag {
      background: #eff6ff;
      color: #1e40af;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 9pt;
      font-weight: 500;
      border: 1px solid #dbeafe;
    }

    .project-tech {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }

    .tech-tag {
      font-size: 8pt;
      color: #6b7280;
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .blind-wartermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80pt;
      color: rgba(0, 0, 0, 0.03);
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      font-weight: 900;
      text-transform: uppercase;
    }

    .blind-notice {
      text-align: center;
      padding: 12px;
      background: #fff7ed;
      border: 1px solid #ffedd5;
      border-radius: 6px;
      margin-top: 40px;
      font-size: 9pt;
      color: #9a3412;
    }

    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      font-size: 8pt;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="blind-wartermark">CONFIDENTIAL / BLIND</div>

  <div class="page">
    <div class="header">
      <h1>${safe(candidate.name as string) || "이름 비공개"}</h1>
      <div class="subtitle">
        ${safe(candidate.last_position as string) || "직책 미확인"} 
        ${candidate.last_company ? ` • ${safe(candidate.last_company as string)}` : ""}
      </div>
    </div>

    ${candidate.summary ? `
    <div class="section">
      <h2 class="section-title">Professional Summary</h2>
      <div class="summary-box">${safe(candidate.summary as string)}</div>
    </div>
    ` : ""}

    <div class="section">
      <h2 class="section-title">Candidate Info</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">경력</span>
          <span class="info-value">${candidate.exp_years || 0}년</span>
        </div>
        <div class="info-item">
          <span class="info-label">지역</span>
          <span class="info-value">${safe(candidate.location_city as string) || "-"}</span>
        </div>
        <div class="info-item">
          <span class="info-label">연락처</span>
          <span class="info-value text-gray-400">[블라인드 처리됨]</span>
        </div>
        <div class="info-item">
          <span class="info-label">이메일</span>
          <span class="info-value text-gray-400">[블라인드 처리됨]</span>
        </div>
      </div>
    </div>

    ${skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Skills</h2>
      <div class="skills-container">
        ${skills.map(skill => `<span class="skill-tag">${safe(skill)}</span>`).join("")}
      </div>
    </div>
    ` : ""}

    ${careers.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Experience</h2>
      ${careers.map(career => `
      <div class="timeline-item">
        <div class="item-header">
          <div>
            <div class="item-title">${safe(career.company)}</div>
            <div class="item-subtitle">${safe(career.position)}</div>
          </div>
          <div class="item-period">
            ${safe(career.start_date)} – ${career.is_current ? "Present" : safe(career.end_date)}
          </div>
        </div>
        ${career.description ? `<div class="item-description">${safe(career.description)}</div>` : ""}
      </div>
      `).join("")}
    </div>
    ` : ""}

    ${projects.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Key Projects</h2>
      ${projects.map(project => `
      <div class="timeline-item">
        <div class="item-header">
          <div class="item-title">${safe(project.name)} ${project.role ? `<span style="font-weight:400; color:#666">(${safe(project.role)})</span>` : ""}</div>
          <div class="item-period">${safe(project.period)}</div>
        </div>
        ${project.description ? `<div class="item-description">${safe(project.description)}</div>` : ""}
        ${project.technologies && project.technologies.length > 0 ? `
        <div class="project-tech">
          ${project.technologies.map(tech => `<span class="tech-tag">${safe(tech)}</span>`).join("")}
        </div>
        ` : ""}
      </div>
      `).join("")}
    </div>
    ` : ""}

    ${education.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Education</h2>
      ${education.map(edu => `
      <div class="timeline-item">
        <div class="item-header">
          <div>
            <div class="item-title">${safe(edu.school)}</div>
            <div class="item-subtitle">${safe(edu.major)} ${edu.degree ? `(${safe(edu.degree)})` : ""}</div>
          </div>
          <div class="item-period">
            ${edu.graduation_year ? `${edu.graduation_year}년 졸업` : ""}
          </div>
        </div>
      </div>
      `).join("")}
    </div>
    ` : ""}

    <div class="blind-notice">
      본 문서는 블라인드 채용을 위해 개인 식별 정보를 마스킹 처리하였습니다.<br/>
      상세 정보 및 원본 열람은 채용 담당자에게 문의 바랍니다.
    </div>

    <div class="footer">
      Generated by RAI • Recruitment Asset Intelligence<br/>
      ${new Date().toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>
</body>
</html>
  `.trim();
}
