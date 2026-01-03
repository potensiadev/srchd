"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import ReviewBanner from "./ReviewBanner";
import EditableField from "./EditableField";
import PrivacyShield from "@/components/detail/PrivacyShield";
import CareerTimelineOrbit from "@/components/detail/CareerTimelineOrbit";
import type { CandidateDetail, ConfidenceLevel, Career, Education, Project } from "@/types";

interface FieldConfidence {
  [key: string]: number;
}

interface CandidateReviewPanelProps {
  candidate: CandidateDetail;
  fieldConfidence?: FieldConfidence;
  onSave?: (updates: Partial<CandidateDetail>) => Promise<void>;
  isLoading?: boolean;
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
}: CandidateReviewPanelProps) {
  const [changes, setChanges] = useState<Partial<CandidateDetail>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fieldWarnings = useMemo(
    () => getFieldWarnings(fieldConfidence, candidate.warnings || []),
    [fieldConfidence, candidate.warnings]
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

    setIsSaving(true);
    try {
      await onSave(changes);
      setChanges({});
    } catch (error) {
      console.error("Failed to save:", error);
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
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review Banner */}
      <ReviewBanner
        confidenceScore={candidate.aiConfidence}
        confidenceLevel={candidate.confidenceLevel}
        requiresReview={candidate.requiresReview}
        warnings={candidate.warnings}
        analysisMode={candidate.analysisMode}
      />

      {/* Save Actions */}
      {hasChanges && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 text-blue-400">
            <Save className="w-5 h-5" />
            <span className="text-sm font-medium">
              {Object.keys(changes).length}개 필드가 수정되었습니다
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600
                       text-slate-300 text-sm font-medium transition-colors
                       disabled:opacity-50 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              초기화
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-neon-cyan hover:bg-neon-cyan/80
                       text-deep-space text-sm font-medium transition-colors
                       disabled:opacity-50 flex items-center gap-2"
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
      <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-neon-cyan" />
          <h2 className="text-lg font-semibold text-white">기본 정보</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-700/50">
            <Phone className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300 font-mono">
              {candidate.phone || "미등록"}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-700/50">
            <Mail className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300 font-mono">
              {candidate.email || "미등록"}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-700/50">
            <MapPin className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              {candidate.address || "미등록"}
            </span>
          </div>
        </div>
      </section>

      {/* Career Section */}
      <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="w-5 h-5 text-neon-purple" />
          <h2 className="text-lg font-semibold text-white">경력</h2>
          <span className="text-sm text-slate-400">
            ({candidate.expYears}년)
          </span>
        </div>

        <EditableField
          label="총 경력 연수"
          fieldKey="expYears"
          type="number"
          value={getMergedValue("expYears")}
          confidence={fieldConfidence.exp_years}
          hasWarning={!!fieldWarnings.expYears}
          warningMessage={fieldWarnings.expYears}
          onSave={handleFieldChange}
        />

        {/* Career Timeline with Orbit Animation */}
        <CareerTimelineOrbit careers={candidate.careers || []} />
      </section>

      {/* Education Section */}
      <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">학력</h2>
        </div>

        <div className="space-y-3">
          {candidate.education?.map((edu: Education, index: number) => (
            <EducationItem key={index} education={edu} />
          ))}
          {(!candidate.education || candidate.education.length === 0) && (
            <p className="text-sm text-slate-500 italic">학력 정보가 없습니다</p>
          )}
        </div>
      </section>

      {/* Skills Section */}
      <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">스킬</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {candidate.skills?.map((skill: string, index: number) => (
            <span
              key={index}
              className="px-3 py-1 rounded-full bg-slate-700 text-sm text-slate-300
                       border border-slate-600 hover:border-neon-cyan/50 transition-colors"
            >
              {skill}
            </span>
          ))}
          {(!candidate.skills || candidate.skills.length === 0) && (
            <p className="text-sm text-slate-500 italic">스킬 정보가 없습니다</p>
          )}
        </div>
      </section>

      {/* Projects Section */}
      {candidate.projects && candidate.projects.length > 0 && (
        <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">프로젝트</h2>
          </div>

          <div className="space-y-4">
            {candidate.projects.map((project: Project, index: number) => (
              <ProjectItem key={index} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* Summary Section */}
      <section className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">AI 요약</h2>
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
          <div className="mt-4">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              강점
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {candidate.strengths.map((strength: string, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-lg bg-emerald-500/10 text-sm text-emerald-400
                           border border-emerald-500/30"
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
    <div className="p-4 rounded-lg bg-slate-700/30 border border-slate-600/50">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-white">{education.school}</h3>
          <p className="text-sm text-slate-400">
            {education.major} • {education.degree}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {education.endYear || "재학중"}
        </span>
      </div>
    </div>
  );
}

// Project Item Component
function ProjectItem({ project }: { project: Project }) {
  return (
    <div className="p-4 rounded-lg bg-slate-700/30 border border-slate-600/50">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-white">{project.name}</h3>
          <p className="text-sm text-slate-400">{project.role}</p>
        </div>
        <span className="text-xs text-slate-500">{project.period}</span>
      </div>
      {project.description && (
        <p className="mt-2 text-sm text-slate-400">{project.description}</p>
      )}
      {project.technologies && project.technologies.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {project.technologies.map((tech: string, index: number) => (
            <span
              key={index}
              className="px-2 py-0.5 text-xs rounded bg-slate-600 text-slate-300"
            >
              {tech}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
