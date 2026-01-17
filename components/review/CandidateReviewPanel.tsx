"use client";

import { useState, useMemo, useRef } from "react";
import {
  User,
  Briefcase,
  GraduationCap,
  Code,
  FolderKanban,
  Save,
  RotateCcw,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Shield,
  AlertTriangle,
} from "lucide-react";
import EditableField from "./EditableField";
import CareerTimelineOrbit from "@/components/detail/CareerTimelineOrbit";
import type { CandidateDetail, Career, Education, Project } from "@/types";

// ─────────────────────────────────────────────────
// 경력 기간 계산 유틸리티
// ─────────────────────────────────────────────────

interface ExperienceDuration {
  years: number;
  months: number;
  totalMonths: number;
}

/**
 * 경력 목록에서 총 경력 기간 계산
 * - 중복 기간은 한 번만 계산 (병렬 경력 고려)
 * - isCurrent가 true면 현재 날짜까지 계산
 */
function calculateTotalExperience(careers: Career[]): ExperienceDuration {
  if (!careers || careers.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  // 각 경력의 기간을 월 단위 범위로 변환
  const ranges: { start: number; end: number }[] = [];

  for (const career of careers) {
    if (!career.startDate) continue;

    // startDate 파싱 (YYYY-MM 또는 YYYY-MM-DD 또는 YYYY)
    const startParts = career.startDate.split("-");
    const startYear = parseInt(startParts[0], 10);
    const startMonth = startParts[1] ? parseInt(startParts[1], 10) : 1;

    if (isNaN(startYear)) continue;

    const startMonthIndex = startYear * 12 + startMonth;

    let endMonthIndex: number;

    if (career.isCurrent || !career.endDate) {
      // 현재 진행 중인 경력은 현재 날짜까지
      const now = new Date();
      endMonthIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
    } else {
      // endDate 파싱
      const endParts = career.endDate.split("-");
      const endYear = parseInt(endParts[0], 10);
      const endMonth = endParts[1] ? parseInt(endParts[1], 10) : 12;

      if (isNaN(endYear)) continue;

      endMonthIndex = endYear * 12 + endMonth;
    }

    // 유효한 범위만 추가
    if (endMonthIndex >= startMonthIndex) {
      ranges.push({ start: startMonthIndex, end: endMonthIndex });
    }
  }

  if (ranges.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  // 범위 정렬 (시작일 기준)
  ranges.sort((a, b) => a.start - b.start);

  // 중복 범위 병합
  const mergedRanges: { start: number; end: number }[] = [];
  let currentRange = { ...ranges[0] };

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start <= currentRange.end + 1) {
      // 중복 또는 연속 → 병합
      currentRange.end = Math.max(currentRange.end, range.end);
    } else {
      // 분리된 범위 → 저장 후 새 범위 시작
      mergedRanges.push(currentRange);
      currentRange = { ...range };
    }
  }
  mergedRanges.push(currentRange);

  // 총 월수 계산
  const totalMonths = mergedRanges.reduce(
    (sum, range) => sum + (range.end - range.start + 1),
    0
  );

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  return { years, months, totalMonths };
}

/**
 * 경력 기간을 "N년 M개월" 형식으로 포맷
 */
function formatExperience(exp: ExperienceDuration): string {
  if (exp.totalMonths === 0) {
    return "경력 없음";
  }

  if (exp.years === 0) {
    return `${exp.months}개월`;
  }

  if (exp.months === 0) {
    return `${exp.years}년`;
  }

  return `${exp.years}년 ${exp.months}개월`;
}

interface FieldConfidence {
  [key: string]: number;
}

interface CandidateReviewPanelProps {
  candidate: CandidateDetail;
  fieldConfidence?: FieldConfidence;
  onSave?: (updates: Partial<CandidateDetail>) => Promise<void>;
  isLoading?: boolean;
  onKeywordSelect?: (keyword: string) => void;
}

// Warning detection based on field confidence
function getFieldWarnings(
  fieldConfidence: FieldConfidence,
  warnings: string[]
): Record<string, string> {
  const fieldWarnings: Record<string, string> = {};

  // Parse warnings to extract field-specific issues
  warnings.forEach((warning) => {
    if (warning.includes("name")) fieldWarnings.name = warning;
    if (warning.includes("phone") || warning.includes("전화")) fieldWarnings.phone = warning;
    if (warning.includes("email") || warning.includes("이메일")) fieldWarnings.email = warning;
    if (warning.includes("경력") || warning.includes("exp")) fieldWarnings.expYears = warning;
    if (warning.includes("학력") || warning.includes("education")) fieldWarnings.education = warning;
  });

  // Add warnings for low confidence fields
  Object.entries(fieldConfidence).forEach(([key, conf]) => {
    if (conf < 0.8 && !fieldWarnings[key]) {
      fieldWarnings[key] = `AI 신뢰도가 낮습니다 (${Math.round(conf * 100)}%)`;
    }
  });

  return fieldWarnings;
}

export default function CandidateReviewPanel({
  candidate,
  fieldConfidence = {},
  onSave,
  isLoading = false,
  onKeywordSelect,
}: CandidateReviewPanelProps) {
  const [changes, setChanges] = useState<Partial<CandidateDetail>>({});
  const [isSaving, setIsSaving] = useState(false);

  // 연타 방지: 저장 버튼 클릭 후 일정 시간 동안 재클릭 방지
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const DEBOUNCE_MS = 500; // 500ms 이내 재클릭 무시

  const fieldWarnings = useMemo(
    () => getFieldWarnings(fieldConfidence, candidate.warnings || []),
    [fieldConfidence, candidate.warnings]
  );

  // 경력에서 총 경력 기간 계산 (useMemo로 캐싱)
  const calculatedExperience = useMemo(
    () => calculateTotalExperience(candidate.careers || []),
    [candidate.careers]
  );

  const hasChanges = Object.keys(changes).length > 0;

  const handleFieldChange = (key: string, value: string | number) => {
    setChanges((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!onSave || !hasChanges) return;

    // ─────────────────────────────────────────────────
    // 연타 방지 (Debounce)
    // ─────────────────────────────────────────────────
    const now = Date.now();
    if (now - lastClickTimeRef.current < DEBOUNCE_MS) {
      console.log("[ReviewPanel] Save click debounced");
      return;
    }
    lastClickTimeRef.current = now;

    // 이미 저장 중이면 무시
    if (isSaving) {
      console.log("[ReviewPanel] Already saving, ignoring");
      return;
    }

    // ─────────────────────────────────────────────────
    // 1. 현재 변경사항 저장 (롤백용)
    // ─────────────────────────────────────────────────
    const pendingChanges = { ...changes };

    // ─────────────────────────────────────────────────
    // 2. 즉시 UI 반영 - 변경사항 배너 숨김
    // ─────────────────────────────────────────────────
    setChanges({});
    setIsSaving(true);

    try {
      await onSave(pendingChanges);
      // 3. 성공 - 부모 컴포넌트가 toast 표시 + optimistic update 완료
    } catch (error) {
      // 4. 실패 - 변경사항 복원 (배너 다시 표시)
      // 부모 컴포넌트가 이미 toast 표시 + 롤백 완료
      setChanges(pendingChanges);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setChanges({});
  };

  const getMergedValue = <K extends keyof CandidateDetail>(key: K): CandidateDetail[K] => {
    return (changes[key] ?? candidate[key]) as CandidateDetail[K];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Field Confidence Summary - PRD P2 */}
      {Object.keys(fieldConfidence).length > 0 && (
        <FieldConfidenceSummary fieldConfidence={fieldConfidence} />
      )}

      {/* Save Actions */}
      {hasChanges && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 border border-blue-200 shadow-sm sticky top-4 z-20">
          <div className="flex items-center gap-2 text-blue-700">
            <Save className="w-5 h-5" />
            <span className="text-sm font-medium">
              {Object.keys(changes).length}개 필드가 수정되었습니다
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50
                       text-gray-600 text-sm font-medium transition-colors
                       disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              초기화
            </button>
            <button
              ref={saveButtonRef}
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90
                       text-white text-sm font-semibold transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              변경사항 저장
            </button>
          </div>
        </div>
      )}

      {/* Basic Info Section */}
      <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">기본 정보</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EditableField
            label="이름"
            fieldKey="name"
            value={getMergedValue("name")}
            confidence={fieldConfidence.name}
            hasWarning={!!fieldWarnings.name}
            warningMessage={fieldWarnings.name}
            onSave={handleFieldChange}
          />
          <EditableField
            label="출생연도"
            fieldKey="birthYear"
            type="number"
            value={getMergedValue("birthYear")}
            confidence={fieldConfidence.birth_year}
            onSave={handleFieldChange}
          />
        </div>

        {/* 개인정보 영역 - Issue #4: PII는 DB만 보호, UI는 전체 표시 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700 font-mono">
              {candidate.phone || "미등록"}
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700 font-mono">
              {candidate.email || "미등록"}
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700">
              {candidate.address || "미등록"}
            </span>
          </div>
        </div>
      </section>

      {/* Career Section */}
      <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">경력</h2>
        </div>

        {/* 총 경력 연수 - 읽기 전용 (경력에서 자동 계산) */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
            총 경력 연수
          </label>
          <div className="px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 inline-flex items-center gap-2">
            <span className="text-base text-gray-900 font-medium">
              {formatExperience(calculatedExperience)}
            </span>
            <span className="text-xs text-gray-400">
              (경력 기간에서 자동 계산)
            </span>
          </div>
        </div>

        {/* Career Timeline with Orbit Animation */}
        <CareerTimelineOrbit careers={candidate.careers || []} />
      </section>

      {/* Education Section */}
      <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-gray-900">학력</h2>
        </div>

        <div className="space-y-3">
          {candidate.education?.map((edu: Education, index: number) => (
            <EducationItem key={index} education={edu} />
          ))}
          {(!candidate.education || candidate.education.length === 0) && (
            <p className="text-sm text-gray-400 italic">학력 정보가 없습니다</p>
          )}
        </div>
      </section>

      {/* Skills Section */}
      <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">스킬</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {candidate.skills?.map((skill: string, index: number) => (
            <span
              key={index}
              onClick={() => onKeywordSelect?.(skill)}
              className={`px-3 py-1 rounded-full bg-gray-50 text-sm text-gray-700
                       border border-gray-200 font-medium transition-colors
                       ${onKeywordSelect ? "cursor-pointer hover:border-primary hover:text-primary hover:bg-primary/5" : ""}`}
            >
              {skill}
            </span>
          ))}
          {(!candidate.skills || candidate.skills.length === 0) && (
            <p className="text-sm text-gray-400 italic">스킬 정보가 없습니다</p>
          )}
        </div>
      </section>

      {/* Projects Section */}
      {candidate.projects && candidate.projects.length > 0 && (
        <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">프로젝트</h2>
          </div>

          <div className="space-y-4">
            {candidate.projects.map((project: Project, index: number) => (
              <ProjectItem key={index} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Summary Section */}
      <section className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900">AI 요약</h2>
        </div>

        <EditableField
          label="요약"
          fieldKey="summary"
          type="textarea"
          value={getMergedValue("summary")}
          placeholder="AI가 생성한 요약이 없습니다"
          onSave={handleFieldChange}
        />

        {candidate.strengths && candidate.strengths.length > 0 && (
          <div className="mt-6">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              강점
            </span>
            <div className="flex flex-wrap gap-2 mt-3">
              {candidate.strengths.map((strength: string, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-lg bg-emerald-50 text-sm text-emerald-600
                           border border-emerald-100 font-medium"
                >
                  {strength}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// Education Item Component
function EducationItem({ education }: { education: Education }) {
  return (
    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{education.school}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {education.major} • {education.degree}
          </p>
        </div>
        <span className="text-xs text-gray-400 font-medium">
          {education.endYear || "재학중"}
        </span>
      </div>
    </div>
  );
}

// Project Item Component
function ProjectItem({ project }: { project: Project }) {
  return (
    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{project.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{project.role}</p>
        </div>
        <span className="text-xs text-gray-400 font-medium">{project.period}</span>
      </div>
      {project.description && (
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{project.description}</p>
      )}
      {project.technologies && project.technologies.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {project.technologies.map((tech: string, index: number) => (
            <span
              key={index}
              className="px-2 py-0.5 text-xs rounded bg-white border border-gray-200 text-gray-600"
            >
              {tech}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Field Confidence Summary Component - PRD P2
function FieldConfidenceSummary({ fieldConfidence }: { fieldConfidence: Record<string, number> }) {
  // 필드 이름 한글화
  const fieldLabels: Record<string, string> = {
    name: "이름",
    birth_year: "출생연도",
    phone: "전화번호",
    email: "이메일",
    address: "주소",
    skills: "스킬",
    exp_years: "경력 연수",
    last_company: "최근 회사",
    last_position: "최근 직책",
    education_level: "학력",
    education_school: "학교",
    education_major: "전공",
    summary: "요약",
    careers: "경력 이력",
  };

  // 신뢰도별 색상
  const getConfidenceConfig = (conf: number) => {
    if (conf >= 0.95) return { color: "text-emerald-600", bg: "bg-emerald-500", border: "border-emerald-200", bgLight: "bg-emerald-50", label: "높음" };
    if (conf >= 0.8) return { color: "text-yellow-600", bg: "bg-yellow-500", border: "border-yellow-200", bgLight: "bg-yellow-50", label: "보통" };
    return { color: "text-red-600", bg: "bg-red-500", border: "border-red-200", bgLight: "bg-red-50", label: "낮음" };
  };

  // 평균 신뢰도 계산
  const values = Object.values(fieldConfidence);
  const avgConfidence = values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;

  // 신뢰도별 필드 분류
  const highConfFields = Object.entries(fieldConfidence).filter(([, v]) => v >= 0.95);
  const medConfFields = Object.entries(fieldConfidence).filter(([, v]) => v >= 0.8 && v < 0.95);
  const lowConfFields = Object.entries(fieldConfidence).filter(([, v]) => v < 0.8);

  return (
    <section className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-gray-900">AI 분석 신뢰도</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">평균</span>
          <span className={`text-sm font-mono font-bold ${getConfidenceConfig(avgConfidence).color}`}>
            {Math.round(avgConfidence * 100)}%
          </span>
        </div>
      </div>

      {/* 신뢰도 분포 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700 font-medium">높음 (95%+)</span>
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{highConfFields.length}개</p>
        </div>
        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-100">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-xs text-yellow-700 font-medium">보통 (80-94%)</span>
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{medConfFields.length}개</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border border-red-100">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-red-700 font-medium">낮음 (&lt;80%)</span>
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{lowConfFields.length}개</p>
        </div>
      </div>

      {/* 낮은 신뢰도 필드 상세 (80% 미만인 경우에만 표시) */}
      {lowConfFields.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
          <div className="flex items-center gap-2 mb-2 text-red-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            <p className="text-xs font-semibold">검토가 필요한 필드:</p>
          </div>
          <div className="space-y-2">
            {lowConfFields.map(([key, value]) => {
              const config = getConfidenceConfig(value);
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 font-medium">
                    {fieldLabels[key] || key}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Progress bar */}
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${config.bg}`}
                        style={{ width: `${Math.round(value * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono font-medium ${config.color}`}>
                      {Math.round(value * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
