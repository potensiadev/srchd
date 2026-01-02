"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Github,
  Linkedin,
  Globe,
  Loader2,
  AlertCircle,
  FileDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { CandidateReviewPanel } from "@/components/review";
import SplitViewer from "@/components/detail/SplitViewer";
import VersionStack from "@/components/detail/VersionStack";
import type { CandidateDetail, ConfidenceLevel } from "@/types";

// Transform DB row to CandidateDetail
function transformCandidate(row: Record<string, unknown>): CandidateDetail {
  const confidence = (row.confidence_score as number) ?? 0;
  const confidencePercent = Math.round(confidence * 100);

  let confidenceLevel: ConfidenceLevel = "low";
  if (confidencePercent >= 95) confidenceLevel = "high";
  else if (confidencePercent >= 80) confidenceLevel = "medium";

  return {
    id: row.id as string,
    name: (row.name as string) || "이름 미확인",
    role: (row.last_position as string) || "",
    company: (row.last_company as string) || "",
    expYears: (row.exp_years as number) || 0,
    skills: (row.skills as string[]) || [],
    photoUrl: row.photo_url as string | undefined,
    summary: row.summary as string | undefined,
    aiConfidence: confidencePercent,
    confidenceLevel,
    riskLevel: confidencePercent >= 80 ? "low" : confidencePercent >= 60 ? "medium" : "high",
    requiresReview: (row.requires_review as boolean) ?? confidencePercent < 95,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,

    // Detail fields
    birthYear: row.birth_year as number | undefined,
    gender: row.gender as "male" | "female" | "other" | undefined,
    phone: row.phone_masked as string | undefined,
    email: row.email_masked as string | undefined,
    careers: (row.careers as CandidateDetail["careers"]) || [],
    projects: (row.projects as CandidateDetail["projects"]) || [],
    education: (row.education as CandidateDetail["education"]) || [],
    strengths: (row.strengths as string[]) || [],
    portfolioThumbnailUrl: row.portfolio_thumbnail_url as string | undefined,
    version: (row.version as number) || 1,
    parentId: row.parent_id as string | undefined,
    isLatest: (row.is_latest as boolean) ?? true,
    analysisMode: (row.analysis_mode as "phase_1" | "phase_2") || "phase_1",
    warnings: (row.warnings as string[]) || [],
  };
}

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params.id as string;

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUsage, setExportUsage] = useState<{
    limit: number | "unlimited";
    used: number;
  } | null>(null);
  const [showSplitView, setShowSplitView] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: string;
    version: number;
    createdAt: string;
  }>>([]);

  // Fetch candidate data
  const fetchCandidate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/candidates/${candidateId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("후보자를 찾을 수 없습니다");
        }
        throw new Error("데이터를 불러오는 중 오류가 발생했습니다");
      }

      const data = await response.json();
      const transformedCandidate = transformCandidate(data.data);
      setCandidate(transformedCandidate);

      // Set field confidence if available (at root level of response)
      if (data.field_confidence) {
        setFieldConfidence(data.field_confidence);
      }

      // Set versions (mock data - 실제로는 API에서 가져와야 함)
      if (transformedCandidate.version > 1) {
        const mockVersions = Array.from({ length: transformedCandidate.version }, (_, i) => ({
          id: i === transformedCandidate.version - 1 ? transformedCandidate.id : `${transformedCandidate.id}-v${i + 1}`,
          version: i + 1,
          createdAt: new Date(Date.now() - (transformedCandidate.version - i - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
        }));
        setVersions(mockVersions);
      } else {
        setVersions([{
          id: transformedCandidate.id,
          version: 1,
          createdAt: transformedCandidate.createdAt,
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchCandidate();
  }, [fetchCandidate]);

  // Save changes
  const handleSave = async (updates: Partial<CandidateDetail>) => {
    if (!candidate) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error("저장 중 오류가 발생했습니다");
      }

      // Refresh data
      await fetchCandidate();
    } catch (err) {
      console.error("Save error:", err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch export usage
  const fetchExportUsage = useCallback(async () => {
    try {
      const response = await fetch(`/api/candidates/${candidateId}/export`);
      if (response.ok) {
        const data = await response.json();
        setExportUsage({
          limit: data.limit,
          used: data.used,
        });
      }
    } catch (err) {
      console.error("Export usage fetch error:", err);
    }
  }, [candidateId]);

  useEffect(() => {
    if (candidateId) {
      fetchExportUsage();
    }
  }, [candidateId, fetchExportUsage]);

  // Blind export handler
  const handleBlindExport = async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "pdf",
          includePhoto: false,
          includePortfolio: false,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 429) {
          alert(`월 내보내기 한도를 초과했습니다.\n사용: ${data.used}/${data.limit}회`);
          return;
        }
        throw new Error(data.error || "내보내기 실패");
      }

      const data = await response.json();

      // Open print window with HTML
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(data.data.html);
        printWindow.document.close();
        printWindow.focus();
        // Auto print after load
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      // Refresh usage count
      await fetchExportUsage();
    } catch (err) {
      console.error("Export error:", err);
      alert(err instanceof Error ? err.message : "내보내기 중 오류가 발생했습니다");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-neon-cyan animate-spin" />
          <p className="text-slate-400">후보자 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <h2 className="text-xl font-semibold text-white">
            {error || "후보자를 찾을 수 없습니다"}
          </h2>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600
                     text-slate-300 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700
                     text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-white">{candidate.name}</h1>
            <p className="text-slate-400">
              {candidate.role}
              {candidate.company && ` @ ${candidate.company}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Split View Toggle */}
          <button
            onClick={() => setShowSplitView(!showSplitView)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              showSplitView
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
            }`}
            title={showSplitView ? "분할 보기 끄기" : "분할 보기 켜기"}
          >
            {showSplitView ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            <span className="text-sm">Split View</span>
          </button>

          {/* Blind Export Button */}
          <button
            onClick={handleBlindExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg
                     bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30
                     text-neon-cyan transition-colors disabled:opacity-50"
            title={exportUsage ? `블라인드 내보내기 (${exportUsage.used}/${exportUsage.limit === "unlimited" ? "∞" : exportUsage.limit})` : "블라인드 내보내기"}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            <span className="text-sm">블라인드 내보내기</span>
            {exportUsage && exportUsage.limit !== "unlimited" && (
              <span className="text-xs text-slate-400">
                ({exportUsage.used}/{exportUsage.limit})
              </span>
            )}
          </button>

          {/* External Links */}
          {candidate.portfolioThumbnailUrl && (
            <a
              href="#"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700
                       text-slate-400 hover:text-neon-cyan transition-colors"
              title="포트폴리오"
            >
              <Globe className="w-5 h-5" />
            </a>
          )}
          <a
            href="#"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700
                     text-slate-400 hover:text-white transition-colors"
            title="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
          <a
            href="#"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700
                     text-slate-400 hover:text-blue-400 transition-colors"
            title="LinkedIn"
          >
            <Linkedin className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span>버전 {candidate.version}</span>
        <span>•</span>
        <span>
          등록일:{" "}
          {new Date(candidate.createdAt).toLocaleDateString("ko-KR")}
        </span>
        <span>•</span>
        <span>
          수정일:{" "}
          {new Date(candidate.updatedAt).toLocaleDateString("ko-KR")}
        </span>
      </div>

      {/* Version Stack (다중 버전이 있을 때만 표시) */}
      {versions.length > 1 && (
        <VersionStack
          versions={versions}
          currentVersion={candidate.version}
          onVersionSelect={(id) => {
            router.push(`/candidates/${id}`);
          }}
        />
      )}

      {/* Main Content - Split View or Regular */}
      {showSplitView ? (
        <SplitViewer pdfUrl={undefined /* 실제로는 원본 PDF URL을 전달 */}>
          <CandidateReviewPanel
            candidate={candidate}
            fieldConfidence={fieldConfidence}
            onSave={handleSave}
            isLoading={isSaving}
          />
        </SplitViewer>
      ) : (
        <CandidateReviewPanel
          candidate={candidate}
          fieldConfidence={fieldConfidence}
          onSave={handleSave}
          isLoading={isSaving}
        />
      )}
    </div>
  );
}
