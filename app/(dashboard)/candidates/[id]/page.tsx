"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { useToast } from "@/components/ui/toast";
import DOMPurify from "dompurify";
import { sanitizeExternalUrl } from "@/lib/security/url-validator";
import type { CandidateDetail, ConfidenceLevel } from "@/types";
import { DetailPageSkeleton } from "@/components/ui/empty-state";


// ─────────────────────────────────────────────────
// Error Types for Proper Handling
// ─────────────────────────────────────────────────

interface SaveError extends Error {
  code?: string;
  status?: number;
  canRetry?: boolean;
}

function createSaveError(message: string, status: number, code?: string): SaveError {
  const error = new Error(message) as SaveError;
  error.status = status;
  error.code = code;
  error.canRetry = status >= 500 || status === 0; // 서버 오류나 네트워크 오류만 재시도
  return error;
}

// Transform API response to CandidateDetail
// API 응답은 이미 camelCase로 변환된 상태이므로, snake_case와 camelCase 모두 처리
function transformCandidate(data: Record<string, unknown>): CandidateDetail {
  // confidence_score (snake) 또는 aiConfidence (camel) 처리
  const rawConfidence = (data.confidence_score as number) ?? (data.aiConfidence as number) ?? 0;
  const confidencePercent = rawConfidence > 1 ? rawConfidence : Math.round(rawConfidence * 100);

  let confidenceLevel: ConfidenceLevel = "low";
  if (confidencePercent >= 95) confidenceLevel = "high";
  else if (confidencePercent >= 80) confidenceLevel = "medium";

  // Transform careers - snake_case와 camelCase 모두 처리
  const rawCareers = (data.careers as Array<Record<string, unknown>>) || [];
  const transformedCareers = rawCareers.map((career) => ({
    company: career.company as string || "",
    position: career.position as string || "",
    department: career.department as string | undefined,
    startDate: (career.start_date as string) || (career.startDate as string) || "",
    endDate: (career.end_date as string) || (career.endDate as string) || undefined,
    isCurrent: (career.is_current as boolean) || (career.isCurrent as boolean) || false,
    description: career.description as string | undefined,
    skills: career.skills as string[] | undefined,
  }));

  return {
    id: data.id as string,
    name: (data.name as string) || "이름 미확인",
    // snake_case (last_position) 또는 camelCase (role) 처리
    role: (data.last_position as string) || (data.role as string) || "",
    company: (data.last_company as string) || (data.company as string) || "",
    expYears: (data.exp_years as number) ?? (data.expYears as number) ?? 0,
    skills: (data.skills as string[]) || [],
    photoUrl: (data.photo_url as string) || (data.photoUrl as string) || undefined,
    summary: data.summary as string | undefined,
    aiConfidence: confidencePercent,
    confidenceLevel: (data.confidenceLevel as ConfidenceLevel) || confidenceLevel,
    riskLevel: (data.riskLevel as "low" | "medium" | "high") || (confidencePercent >= 80 ? "low" : confidencePercent >= 60 ? "medium" : "high"),
    requiresReview: (data.requires_review as boolean) ?? (data.requiresReview as boolean) ?? confidencePercent < 95,
    createdAt: (data.created_at as string) || (data.createdAt as string),
    updatedAt: (data.updated_at as string) || (data.updatedAt as string),

    // Detail fields - snake_case와 camelCase 모두 처리
    birthYear: (data.birth_year as number) ?? (data.birthYear as number) ?? undefined,
    gender: data.gender as "male" | "female" | "other" | undefined,
    // Issue #4: Show full PII in UI
    phone: (data.phone as string) || (data.phone_masked as string) || (data.phoneMasked as string) || undefined,
    email: (data.email as string) || (data.email_masked as string) || (data.emailMasked as string) || undefined,
    address: (data.address as string) || (data.address_masked as string) || (data.addressMasked as string) || undefined,

    // 교육 정보 분리 필드
    educationLevel: (data.education_level as string) || (data.educationLevel as string) || undefined,
    educationSchool: (data.education_school as string) || (data.educationSchool as string) || undefined,
    educationMajor: (data.education_major as string) || (data.educationMajor as string) || undefined,
    locationCity: (data.location_city as string) || (data.locationCity as string) || undefined,

    careers: transformedCareers,
    projects: (data.projects as CandidateDetail["projects"]) || [],
    education: (data.education as CandidateDetail["education"]) || [],
    strengths: (data.strengths as string[]) || [],
    portfolioThumbnailUrl: (data.portfolio_thumbnail_url as string) || (data.portfolioThumbnailUrl as string) || undefined,
    // Issue #3: Get URL fields for conditional rendering
    portfolioUrl: (data.portfolio_url as string) || (data.portfolioUrl as string) || undefined,
    githubUrl: (data.github_url as string) || (data.githubUrl as string) || undefined,
    linkedinUrl: (data.linkedin_url as string) || (data.linkedinUrl as string) || undefined,
    version: (data.version as number) || 1,
    parentId: (data.parent_id as string) || (data.parentId as string) || undefined,
    isLatest: (data.is_latest as boolean) ?? (data.isLatest as boolean) ?? true,
    analysisMode: (data.analysis_mode as "phase_1" | "phase_2") || (data.analysisMode as "phase_1" | "phase_2") || "phase_1",
    warnings: (data.warnings as string[]) || [],
    fieldConfidence: (data.field_confidence as Record<string, number>) || (data.fieldConfidence as Record<string, number>) || undefined,
    // Issue #2: Get source file for split view
    sourceFile: (data.source_file as string) || (data.sourceFile as string) || undefined,
    fileType: (data.file_type as string) || (data.fileType as string) || undefined,
  };
}

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const candidateId = params.id as string;

  // ─────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: string;
    version: number;
    createdAt: string;
  }>>([]);
  // New state for highlighting
  const [highlightKeyword, setHighlightKeyword] = useState<string | null>(null);

  // ─────────────────────────────────────────────────
  // Refs for concurrency control
  // ─────────────────────────────────────────────────
  const saveInFlightRef = useRef(false);
  const lastSaveRequestRef = useRef<string | null>(null); // Idempotency key

  // Fetch PDF URL when split view is enabled
  useEffect(() => {
    if (showSplitView && candidateId && !pdfUrl) {
      setPdfLoading(true);
      fetch(`/api/candidates/${candidateId}/source`)
        .then(res => res.json())
        .then(response => {
          if (response.data?.url) {
            setPdfUrl(response.data.url);
          } else if (response.data?.error) {
            console.warn("PDF preview not available:", response.data.error);
          }
        })
        .catch(err => console.error("Failed to fetch PDF URL:", err))
        .finally(() => setPdfLoading(false));
    }
  }, [showSplitView, candidateId, pdfUrl]);

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

      // Fetch real version history from API
      try {
        const versionsResponse = await fetch(`/api/candidates/${candidateId}/versions`);
        if (versionsResponse.ok) {
          const versionsData = await versionsResponse.json();
          if (versionsData.data?.versions && versionsData.data.versions.length > 0) {
            setVersions(versionsData.data.versions.map((v: { id: string; version: number; createdAt: string }) => ({
              id: v.id,
              version: v.version,
              createdAt: v.createdAt,
            })));
          } else {
            // Fallback: current version only
            setVersions([{
              id: transformedCandidate.id,
              version: transformedCandidate.version,
              createdAt: transformedCandidate.createdAt,
            }]);
          }
        } else {
          // API error fallback
          setVersions([{
            id: transformedCandidate.id,
            version: transformedCandidate.version,
            createdAt: transformedCandidate.createdAt,
          }]);
        }
      } catch (versionErr) {
        console.error("Failed to fetch version history:", versionErr);
        // Error fallback
        setVersions([{
          id: transformedCandidate.id,
          version: transformedCandidate.version,
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

  // ─────────────────────────────────────────────────
  // Save with Optimistic Update + Proper Error Handling
  // ─────────────────────────────────────────────────
  const handleSave = useCallback(async (
    updates: Partial<CandidateDetail>,
    options?: { isRetry?: boolean }
  ): Promise<void> => {
    if (!candidate) return;

    // ─────────────────────────────────────────────────
    // 1. 연타 방지 (In-flight request check)
    // ─────────────────────────────────────────────────
    if (saveInFlightRef.current && !options?.isRetry) {
      console.log("[Save] Request already in flight, ignoring");
      return;
    }

    saveInFlightRef.current = true;

    // 멱등성 키 생성 (동일 요청 중복 방지)
    const idempotencyKey = options?.isRetry
      ? lastSaveRequestRef.current
      : `save-${candidateId}-${Date.now()}`;
    lastSaveRequestRef.current = idempotencyKey;

    // ─────────────────────────────────────────────────
    // 2. 이전 상태 저장 (롤백용)
    // ─────────────────────────────────────────────────
    const previousCandidate = { ...candidate };

    // ─────────────────────────────────────────────────
    // 3. Optimistic Update - UI 즉시 반영
    // ─────────────────────────────────────────────────
    setCandidate(prev => prev ? { ...prev, ...updates } : prev);
    setIsSaving(true);

    try {
      // 낙관적 락을 위해 현재 updatedAt 포함
      const payload = {
        ...updates,
        _expectedUpdatedAt: candidate.updatedAt, // 동시 수정 충돌 방지
      };

      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idempotencyKey && { "X-Idempotency-Key": idempotencyKey }),
        },
        body: JSON.stringify(payload),
      });

      // ─────────────────────────────────────────────────
      // 4. 응답 처리
      // ─────────────────────────────────────────────────
      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error?.message || "저장 중 오류가 발생했습니다";
        const errorCode = data.error?.code;
        throw createSaveError(errorMessage, response.status, errorCode);
      }

      // ─────────────────────────────────────────────────
      // 5. 성공 - 서버 응답으로 최종 동기화 (Source of Truth)
      // ─────────────────────────────────────────────────
      if (data.data) {
        setCandidate(transformCandidate(data.data));
      }

      toast.success("저장 완료", "변경사항이 저장되었습니다.");

    } catch (err) {
      // ─────────────────────────────────────────────────
      // 6. 실패 - 롤백 + 에러 타입별 처리
      // ─────────────────────────────────────────────────
      console.error("Save error:", err);
      setCandidate(previousCandidate);

      const saveError = err as SaveError;
      const status = saveError.status || 0;
      const errorMessage = saveError.message || "저장 중 오류가 발생했습니다";

      // 에러 타입별 토스트 메시지 + 재시도 버튼
      if (status === 401) {
        // Unauthorized - 로그인 필요
        toast.error("인증 만료", "다시 로그인해주세요.");
        router.push("/login");
      } else if (status === 403) {
        // Forbidden - 권한 없음 (롤백 필수, 재시도 불가)
        toast.error("권한 없음", errorMessage);
      } else if (status === 409) {
        // Conflict - 동시 수정 충돌 (롤백 필수)
        toast.error(
          "수정 충돌",
          errorMessage,
          {
            label: "새로고침",
            onClick: () => {
              fetchCandidate();
            },
          }
        );
      } else if (status === 404) {
        // Not Found
        toast.error("찾을 수 없음", "후보자가 삭제되었거나 존재하지 않습니다.");
      } else if (saveError.canRetry) {
        // Server Error or Network Error - 재시도 가능
        toast.error(
          "저장 실패",
          errorMessage,
          {
            label: "다시 시도",
            onClick: () => {
              handleSave(updates, { isRetry: true });
            },
          }
        );
      } else {
        // 기타 에러
        toast.error("저장 실패", errorMessage);
      }

      throw err; // 상위로 전파 (CandidateReviewPanel에서 changes 복원)

    } finally {
      setIsSaving(false);
      saveInFlightRef.current = false;
    }
  }, [candidate, candidateId, toast, router, fetchCandidate]);

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

  // Handle keyword selection from review panel
  const handleKeywordSelect = (keyword: string) => {
    setHighlightKeyword(keyword);
    setShowSplitView(true);
  };

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

      // Open print window with sanitized HTML (XSS 방지)
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        // DOMPurify로 HTML 살균 (스크립트, 이벤트 핸들러 등 제거)
        const sanitizedHtml = DOMPurify.sanitize(data.data.html, {
          ALLOWED_TAGS: [
            "html", "head", "body", "style", "title", "meta", "link",
            "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
            "table", "thead", "tbody", "tr", "th", "td",
            "ul", "ol", "li", "br", "hr", "strong", "em", "b", "i",
            "img", "a", "section", "article", "header", "footer",
          ],
          ALLOWED_ATTR: [
            "class", "id", "style", "href", "src", "alt", "title",
            "colspan", "rowspan", "width", "height",
          ],
          ALLOW_DATA_ATTR: false,  // data-* 속성 차단
          FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
          FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        });
        printWindow.document.write(sanitizedHtml);
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
    return <DetailPageSkeleton />;
  }

  if (error || !candidate) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900">
            {error || "후보자를 찾을 수 없습니다"}
          </h2>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50
                     text-gray-600 transition-colors flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  // Issue #3: Check if GitHub/LinkedIn URLs exist (with security validation)
  const safePortfolioUrl = sanitizeExternalUrl(candidate.portfolioUrl);
  const safeGithubUrl = sanitizeExternalUrl(candidate.githubUrl);
  const safeLinkedinUrl = sanitizeExternalUrl(candidate.linkedinUrl);
  const hasExternalLinks = safePortfolioUrl || safeGithubUrl || safeLinkedinUrl;

  return (

    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-gray-100
                     text-gray-400 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <p className="text-gray-500">
              {candidate.role}
              {candidate.company && ` @ ${candidate.company}`}
              {/* Issue #5: Show experience years in header */}
              {candidate.expYears > 0 && ` • ${candidate.expYears}년`}
            </p>
          </div>
        </div>

        {/* Actions - Issue #3: Conditional rendering with layout adjustment */}
        <div className="flex items-center gap-2">
          {/* External Links - Only show if URLs exist and are safe */}
          {safePortfolioUrl && (
            <a
              href={safePortfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50
                       text-gray-400 hover:text-primary transition-colors shadow-sm"
              title="포트폴리오"
            >
              <Globe className="w-5 h-5" />
            </a>
          )}
          {safeGithubUrl && (
            <a
              href={safeGithubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50
                       text-gray-400 hover:text-gray-900 transition-colors shadow-sm"
              title="GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
          )}
          {safeLinkedinUrl && (
            <a
              href={safeLinkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50
                       text-gray-400 hover:text-blue-600 transition-colors shadow-sm"
              title="LinkedIn"
            >
              <Linkedin className="w-5 h-5" />
            </a>
          )}


          {/* Blind Export Button */}
          <button
            onClick={handleBlindExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg
                     bg-white border border-primary/20 hover:bg-primary/5
                     text-primary transition-colors disabled:opacity-50 shadow-sm"
            title={exportUsage ? `블라인드 내보내기 (${exportUsage.used}/${exportUsage.limit === "unlimited" ? "∞" : exportUsage.limit})` : "블라인드 내보내기"}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">블라인드 내보내기</span>
            {exportUsage && exportUsage.limit !== "unlimited" && (
              <span className="text-xs text-gray-400">
                ({exportUsage.used}/{exportUsage.limit})
              </span>
            )}
          </button>

          {/* Split View Toggle */}
          <button
            onClick={() => setShowSplitView(!showSplitView)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors shadow-sm ${showSplitView
              ? "bg-primary text-white border-primary"
              : "bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            title={showSplitView ? "분할 보기 끄기" : "분할 보기 켜기"}
          >
            {showSplitView ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            <span className="text-sm font-medium">Split View</span>
          </button>
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
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
        <SplitViewer pdfUrl={pdfUrl || undefined} isLoading={pdfLoading} highlightKeyword={highlightKeyword}>
          <CandidateReviewPanel
            candidate={candidate}
            fieldConfidence={fieldConfidence}
            onSave={handleSave}
            isLoading={isSaving}
            onKeywordSelect={handleKeywordSelect}
          />
        </SplitViewer>
      ) : (
        <CandidateReviewPanel
          candidate={candidate}
          fieldConfidence={fieldConfidence}
          onSave={handleSave}
          isLoading={isSaving}
          onKeywordSelect={handleKeywordSelect}
        />
      )}
    </div>
  );
}
