"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Edit2,
  Trash2,
  Users,
  Building2,
  Calendar,
  MapPin,
  GraduationCap,
  Briefcase,
  Target,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  X,
  Check,
  AlertCircle,
  FileText,
  DollarSign,
  Clock,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DetailPageSkeleton } from "@/components/ui/empty-state";
import type { Position, PositionCandidate, MatchStage, PositionStatus } from "@/types/position";

const STAGE_CONFIG: Record<MatchStage, { label: string; color: string; bgColor: string; borderColor: string }> = {
  matched: { label: "매칭됨", color: "text-gray-500", bgColor: "bg-gray-100", borderColor: "border-gray-200" },
  reviewed: { label: "검토완료", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  contacted: { label: "연락중", color: "text-cyan-600", bgColor: "bg-cyan-50", borderColor: "border-cyan-200" },
  interviewing: { label: "면접진행", color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  offered: { label: "오퍼", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  placed: { label: "채용완료", color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  rejected: { label: "불합격", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200" },
  withdrawn: { label: "지원철회", color: "text-gray-500", bgColor: "bg-gray-100", borderColor: "border-gray-200" },
};

const STAGE_ORDER: MatchStage[] = [
  "matched", "reviewed", "contacted", "interviewing", "offered", "placed"
];

const STATUS_CONFIG: Record<PositionStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  open: { label: "진행중", color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  paused: { label: "일시중지", color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  closed: { label: "마감", color: "text-gray-500", bgColor: "bg-gray-100", borderColor: "border-gray-200" },
  filled: { label: "채용완료", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  urgent: { label: "긴급", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200" },
  high: { label: "높음", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  normal: { label: "보통", color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
  low: { label: "낮음", color: "text-gray-500", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  "full-time": "정규직",
  "contract": "계약직",
  "freelance": "프리랜서",
  "internship": "인턴",
};

const EDUCATION_LABELS: Record<string, string> = {
  "high_school": "고졸",
  "associate": "전문학사",
  "bachelor": "학사",
  "master": "석사",
  "doctorate": "박사",
};

interface ScoreDistribution {
  excellent: number;
  good: number;
  fair: number;
  low: number;
}

export default function PositionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const positionId = params.id as string;

  const [position, setPosition] = useState<Position | null>(null);
  const [matches, setMatches] = useState<PositionCandidate[]>([]);
  const [isJdExpanded, setIsJdExpanded] = useState(true);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution>({
    excellent: 0, good: 0, fair: 0, low: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const [selectedStage, setSelectedStage] = useState<MatchStage | "all">("all");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState<string | null>(null);

  // 포지션 상세 조회
  const fetchPosition = useCallback(async () => {
    try {
      const response = await fetch(`/api/positions/${positionId}`);
      if (!response.ok) {
        if (response.status === 404) {
          // 삭제 후 리다이렉션 중에는 에러 토스트 표시하지 않음
          if (!isDeletingRef.current) {
            toast.error("오류", "포지션을 찾을 수 없습니다.");
          }
          router.push("/positions");
          return;
        }
        throw new Error("Failed to fetch position");
      }
      const data = await response.json();
      setPosition(data.data);
    } catch (error) {
      console.error("Fetch position error:", error);
      toast.error("오류", "포지션 정보를 불러오는데 실패했습니다.");
    }
  }, [positionId, router, toast]);

  // 매칭 결과 조회
  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch(`/api/positions/${positionId}/matches`);
      if (!response.ok) throw new Error("Failed to fetch matches");
      const data = await response.json();
      setMatches(data.data.matches || []);
      setScoreDistribution(data.data.scoreDistribution || { excellent: 0, good: 0, fair: 0, low: 0 });
    } catch (error) {
      console.error("Fetch matches error:", error);
    }
  }, [positionId]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchPosition(), fetchMatches()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchPosition, fetchMatches]);

  // 매칭 새로고침
  const handleRefreshMatches = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/positions/${positionId}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, minScore: 30 }),
      });
      if (!response.ok) throw new Error("Failed to refresh matches");
      const data = await response.json();
      toast.success("성공", data.meta?.message || "매칭이 새로고침되었습니다.");
      await fetchMatches();
    } catch (error) {
      console.error("Refresh matches error:", error);
      toast.error("오류", "매칭 새로고침에 실패했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // 스테이지 변경
  const handleStageChange = async (candidateId: string, newStage: MatchStage) => {
    try {
      const response = await fetch(`/api/positions/${positionId}/matches/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!response.ok) throw new Error("Failed to update stage");

      // Optimistic update
      setMatches((prev) =>
        prev.map((m) =>
          m.candidateId === candidateId ? { ...m, stage: newStage } : m
        )
      );
      toast.success("성공", `상태가 "${STAGE_CONFIG[newStage].label}"로 변경되었습니다.`);
    } catch (error) {
      console.error("Update stage error:", error);
      toast.error("오류", "상태 변경에 실패했습니다.");
    }
  };

  // 메모 저장
  const handleSaveNote = async (candidateId: string) => {
    setSavingNote(candidateId);
    try {
      const response = await fetch(`/api/positions/${positionId}/matches/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteInput }),
      });
      if (!response.ok) throw new Error("Failed to save note");

      setMatches((prev) =>
        prev.map((m) =>
          m.candidateId === candidateId ? { ...m, notes: noteInput } : m
        )
      );
      setExpandedMatch(null);
      setNoteInput("");
      toast.success("성공", "메모가 저장되었습니다.");
    } catch (error) {
      console.error("Save note error:", error);
      toast.error("오류", "메모 저장에 실패했습니다.");
    } finally {
      setSavingNote(null);
    }
  };

  // 포지션 삭제
  const handleDelete = async () => {
    if (!confirm("정말 이 포지션을 삭제하시겠습니까? 모든 매칭 정보가 함께 삭제됩니다.")) {
      return;
    }

    setIsDeleting(true);
    isDeletingRef.current = true;
    try {
      const response = await fetch(`/api/positions/${positionId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete position");

      toast.success("성공", "포지션이 삭제되었습니다.");
      router.push("/positions");
    } catch (error) {
      console.error("Delete position error:", error);
      toast.error("오류", "포지션 삭제에 실패했습니다.");
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // 필터링된 매칭
  const filteredMatches = selectedStage === "all"
    ? matches
    : matches.filter((m) => m.stage === selectedStage);

  // 스테이지별 카운트
  const stageCounts = matches.reduce((acc, m) => {
    acc[m.stage] = (acc[m.stage] || 0) + 1;
    return acc;
  }, {} as Record<MatchStage, number>);

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (!position) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-gray-500">포지션을 찾을 수 없습니다.</p>
        <Link href="/positions" className="text-primary hover:underline">
          포지션 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[position.status];
  const priorityConfig = PRIORITY_CONFIG[position.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/positions"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors mt-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{position.title}</h1>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium border",
                statusConfig.bgColor,
                statusConfig.color,
                statusConfig.borderColor
              )}>
                {statusConfig.label}
              </span>
              {position.priority && position.priority !== "normal" && (
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium border",
                  priorityConfig.bgColor,
                  priorityConfig.color,
                  priorityConfig.borderColor
                )}>
                  {priorityConfig.label}
                </span>
              )}
            </div>
            {position.clientCompany && (
              <p className="text-gray-500 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {position.clientCompany}
                {position.department && ` / ${position.department}`}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshMatches}
            disabled={isRefreshing}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-colors shadow-sm",
              isRefreshing
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-white border border-primary/20 text-primary hover:bg-primary/5"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            매칭 새로고침
          </button>
          <Link
            href={`/positions/${positionId}/edit`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
          >
            <Edit2 className="w-4 h-4" />
            수정
          </Link>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors shadow-sm"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            삭제
          </button>
        </div>
      </div>

      {/* Position Info */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Briefcase className="w-4 h-4" />
            경력
          </div>
          <p className="text-gray-900 font-medium">
            {!position.minExpYears && !position.maxExpYears
              ? "경력무관"
              : position.maxExpYears
                ? `${position.minExpYears}년 ~ ${position.maxExpYears}년`
                : `${position.minExpYears}년 이상`}
          </p>
        </div>
        {position.requiredEducationLevel && (
          <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <GraduationCap className="w-4 h-4" />
              학력
            </div>
            <p className="text-gray-900 font-medium">
              {EDUCATION_LABELS[position.requiredEducationLevel] || position.requiredEducationLevel}
            </p>
          </div>
        )}
        {position.locationCity && (
          <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <MapPin className="w-4 h-4" />
              근무지
            </div>
            <p className="text-gray-900 font-medium">{position.locationCity}</p>
          </div>
        )}
        {position.deadline && (
          <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Calendar className="w-4 h-4" />
              마감일
            </div>
            <p className="text-gray-900 font-medium">
              {new Date(position.deadline).toLocaleDateString("ko-KR")}
            </p>
          </div>
        )}
        {position.jobType && (
          <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Clock className="w-4 h-4" />
              근무 형태
            </div>
            <p className="text-gray-900 font-medium">
              {JOB_TYPE_LABELS[position.jobType] || position.jobType}
            </p>
          </div>
        )}
        {(position.salaryMin || position.salaryMax) && (
          <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              연봉
            </div>
            <p className="text-gray-900 font-medium">
              {position.salaryMin && position.salaryMax
                ? `${position.salaryMin.toLocaleString()}만원 ~ ${position.salaryMax.toLocaleString()}만원`
                : position.salaryMin
                  ? `${position.salaryMin.toLocaleString()}만원 이상`
                  : `${position.salaryMax?.toLocaleString()}만원 이하`}
            </p>
          </div>
        )}
      </div>

      {/* Job Description - Collapsible */}
      {position.description && (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsJdExpanded(!isJdExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <FileText className="w-4 h-4 text-gray-400" />
              상세 설명 (JD)
            </div>
            {isJdExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {isJdExpanded && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line pt-4">
                {position.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Skills & Qualifications */}
      {((position.requiredSkills && position.requiredSkills.length > 0) ||
        (position.preferredSkills && position.preferredSkills.length > 0) ||
        (position.preferredMajors && position.preferredMajors.length > 0)) && (
        <div className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
          {position.requiredSkills && position.requiredSkills.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-3 font-medium">
                <Target className="w-4 h-4" />
                필수 자격
              </div>
              <div className="flex flex-wrap gap-2">
                {position.requiredSkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </>
          )}
          {position.preferredSkills && position.preferredSkills.length > 0 && (
            <>
              <div className={cn(
                "flex items-center gap-2 text-gray-500 text-sm mb-3 font-medium",
                position.requiredSkills && position.requiredSkills.length > 0 && "mt-6"
              )}>
                우대사항
              </div>
              <div className="flex flex-wrap gap-2">
                {position.preferredSkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-sm"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </>
          )}
          {position.preferredMajors && position.preferredMajors.length > 0 && (
            <>
              <div className={cn(
                "flex items-center gap-2 text-gray-500 text-sm mb-3 font-medium",
                ((position.requiredSkills && position.requiredSkills.length > 0) ||
                 (position.preferredSkills && position.preferredSkills.length > 0)) && "mt-6"
              )}>
                <BookOpen className="w-4 h-4" />
                우대 전공
              </div>
              <div className="flex flex-wrap gap-2">
                {position.preferredMajors.map((major, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-lg bg-blue-50 text-blue-600 text-sm border border-blue-100"
                  >
                    {major}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Score Distribution */}
      <div className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
            <Users className="w-5 h-5 text-primary" />
            매칭된 후보자 ({matches.length}명)
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-600">우수 ({scoreDistribution.excellent})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-gray-600">양호 ({scoreDistribution.good})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="text-gray-600">보통 ({scoreDistribution.fair})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
              <span className="text-gray-600">낮음 ({scoreDistribution.low})</span>
            </span>
          </div>
        </div>

        {/* Stage Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedStage("all")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
              selectedStage === "all"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            전체 ({matches.length})
          </button>
          {STAGE_ORDER.map((stage) => (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                selectedStage === stage
                  ? cn(STAGE_CONFIG[stage].bgColor, STAGE_CONFIG[stage].color, STAGE_CONFIG[stage].borderColor, "shadow-sm")
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              {STAGE_CONFIG[stage].label} ({stageCounts[stage] || 0})
            </button>
          ))}
        </div>

        {/* Matches List */}
        {filteredMatches.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
            {matches.length === 0
              ? "아직 매칭된 후보자가 없습니다. 매칭 새로고침을 시도해보세요."
              : "해당 상태의 후보자가 없습니다."}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMatches.map((match) => {
              const stageConfig = STAGE_CONFIG[match.stage];
              const scoreColor =
                match.overallScore >= 80
                  ? "text-emerald-600"
                  : match.overallScore >= 60
                    ? "text-blue-600"
                    : match.overallScore >= 40
                      ? "text-yellow-600"
                      : "text-gray-400";

              return (
                <div
                  key={match.id}
                  className="p-5 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
                >
                  <div className="flex items-center justify-between">
                    {/* Candidate Info */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center text-primary font-bold text-lg">
                        {match.candidate?.name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <Link
                          href={`/candidates/${match.candidateId}`}
                          className="font-bold text-gray-900 hover:text-primary transition-colors flex items-center gap-1.5 text-lg"
                        >
                          {match.candidate?.name || "이름 미확인"}
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </Link>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {match.candidate?.lastPosition || "직책 미확인"}
                          {match.candidate?.lastCompany && ` @ ${match.candidate.lastCompany}`}
                        </p>
                      </div>
                    </div>

                    {/* Scores */}
                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <p className={cn("text-2xl font-bold", scoreColor)}>
                          {match.overallScore}%
                        </p>
                        <p className="text-xs text-gray-400 font-medium">종합점수</p>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-gray-900 font-semibold">{match.skillScore}%</p>
                          <p className="text-xs text-gray-400">스킬</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-900 font-semibold">{match.experienceScore}%</p>
                          <p className="text-xs text-gray-400">경력</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-900 font-semibold">{match.semanticScore}%</p>
                          <p className="text-xs text-gray-400">적합도</p>
                        </div>
                      </div>

                      {/* Stage Dropdown */}
                      <div className="relative group">
                        <button
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                            stageConfig.bgColor,
                            stageConfig.color,
                            stageConfig.borderColor
                          )}
                        >
                          {stageConfig.label}
                          <ChevronDown className="w-4 h-4 opacity-50" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-white border border-gray-200 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
                          {STAGE_ORDER.map((stage) => (
                            <button
                              key={stage}
                              onClick={() => handleStageChange(match.candidateId, stage)}
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors font-medium",
                                stage === match.stage
                                  ? STAGE_CONFIG[stage].color
                                  : "text-gray-600"
                              )}
                            >
                              {STAGE_CONFIG[stage].label}
                            </button>
                          ))}
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => handleStageChange(match.candidateId, "rejected")}
                            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 transition-colors font-medium"
                          >
                            불합격
                          </button>
                          <button
                            onClick={() => handleStageChange(match.candidateId, "withdrawn")}
                            className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors font-medium"
                          >
                            지원철회
                          </button>
                        </div>
                      </div>

                      {/* Note Button */}
                      <button
                        onClick={() => {
                          if (expandedMatch === match.id) {
                            setExpandedMatch(null);
                            setNoteInput("");
                          } else {
                            setExpandedMatch(match.id);
                            setNoteInput(match.notes || "");
                          }
                        }}
                        className={cn(
                          "p-2 rounded-lg transition-colors border shadow-sm",
                          match.notes
                            ? "bg-amber-50 border-amber-200 text-amber-600"
                            : "bg-white border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300"
                        )}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Matched Skills with Synonym Info */}
                  {match.matchedSkills && match.matchedSkills.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-medium">매칭 스킬:</span>
                      {match.matchedSkills.map((skill, idx) => {
                        // 동의어 매칭 정보 찾기
                        const synonymMatch = match.synonymMatches?.find(
                          (sm) => sm.matched_to === skill && sm.is_synonym
                        );

                        return (
                          <span
                            key={idx}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs border font-medium",
                              synonymMatch
                                ? "bg-purple-50 text-purple-600 border-purple-100"
                                : "bg-emerald-50 text-emerald-600 border-emerald-100"
                            )}
                            title={synonymMatch ? `동의어 매칭: ${synonymMatch.candidate_skill} → ${skill}` : undefined}
                          >
                            {synonymMatch ? (
                              <>
                                {synonymMatch.candidate_skill}
                                <span className="mx-1 opacity-50">→</span>
                                {skill}
                              </>
                            ) : (
                              skill
                            )}
                          </span>
                        );
                      })}
                      {match.missingSkills && match.missingSkills.length > 0 && (
                        <>
                          <span className="text-xs text-gray-400 ml-2 font-medium">부족:</span>
                          {match.missingSkills.slice(0, 3).map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-red-50 text-red-500 text-xs border border-red-100 font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                          {match.missingSkills.length > 3 && (
                            <span className="text-xs text-gray-400 font-medium">
                              +{match.missingSkills.length - 3}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Note Input */}
                  {expandedMatch === match.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50/50 -mx-5 -mb-5 p-5 rounded-b-xl">
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="메모를 입력하세요..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200
                                 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                      />
                      <div className="flex items-center justify-end gap-2 mt-3">
                        <button
                          onClick={() => {
                            setExpandedMatch(null);
                            setNoteInput("");
                          }}
                          className="px-4 py-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleSaveNote(match.candidateId)}
                          disabled={savingNote === match.candidateId}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium shadow-sm"
                        >
                          {savingNote === match.candidateId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          저장
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Note Display */}
                  {match.notes && expandedMatch !== match.id && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 text-sm text-amber-700 leading-relaxed border border-amber-100">
                      <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 opacity-60" />
                      {match.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
