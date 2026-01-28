"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Filter,
  Users,
  Loader2,
  Building2,
  Calendar,
  Briefcase,
  Code,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, CardSkeleton } from "@/components/ui/empty-state";

// Progressive Loading: ProcessingCard
import ProcessingCard from "@/components/dashboard/ProcessingCard";
import ResumeUploadDrawer from "@/components/upload/ResumeUploadDrawer";
import type { CandidateStatus } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────
// 경력 계산 유틸리티
// ─────────────────────────────────────────────────
interface Career {
  company?: string;
  position?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  is_current?: boolean;
  isCurrent?: boolean;
}

interface ExperienceDuration {
  years: number;
  months: number;
  totalMonths: number;
}

function calculateTotalExperience(careers: Career[]): ExperienceDuration {
  if (!careers || careers.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  const ranges: { start: number; end: number }[] = [];

  for (const career of careers) {
    const startDate = career.start_date || career.startDate;
    if (!startDate) continue;

    const startParts = startDate.split("-");
    const startYear = parseInt(startParts[0], 10);
    const startMonth = startParts[1] ? parseInt(startParts[1], 10) : 1;

    if (isNaN(startYear)) continue;

    const startMonthIndex = startYear * 12 + startMonth;
    let endMonthIndex: number;

    const isCurrent = career.is_current || career.isCurrent;
    const endDate = career.end_date || career.endDate;

    if (isCurrent || !endDate) {
      const now = new Date();
      endMonthIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
    } else {
      const endParts = endDate.split("-");
      const endYear = parseInt(endParts[0], 10);
      const endMonth = endParts[1] ? parseInt(endParts[1], 10) : 12;
      if (isNaN(endYear)) continue;
      endMonthIndex = endYear * 12 + endMonth;
    }

    if (endMonthIndex >= startMonthIndex) {
      ranges.push({ start: startMonthIndex, end: endMonthIndex });
    }
  }

  if (ranges.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  ranges.sort((a, b) => a.start - b.start);

  const mergedRanges: { start: number; end: number }[] = [];
  let currentRange = { ...ranges[0] };

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start <= currentRange.end + 1) {
      currentRange.end = Math.max(currentRange.end, range.end);
    } else {
      mergedRanges.push(currentRange);
      currentRange = { ...range };
    }
  }
  mergedRanges.push(currentRange);

  const totalMonths = mergedRanges.reduce(
    (sum, range) => sum + (range.end - range.start + 1),
    0
  );

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    totalMonths,
  };
}

function formatExperience(exp: ExperienceDuration): string {
  if (exp.totalMonths === 0) return "경력 없음";
  if (exp.years === 0) return `${exp.months}개월`;
  if (exp.months === 0) return `${exp.years}년`;
  return `${exp.years}년 ${exp.months}개월`;
}

interface QuickExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

interface Candidate {
  id: string;
  name: string;
  last_position: string | null;
  last_company: string | null;
  exp_years: number;
  skills: string[];
  confidence_score: number;
  created_at: string;
  summary: string | null;
  careers: Career[] | null;
  // Progressive Loading 필드
  status?: CandidateStatus;
  quick_extracted?: QuickExtractedData;
  // 매칭 여부 (검토 필요 지표용)
  hasBeenMatched?: boolean;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "confidence" | "exp">("recent");
  const [userId, setUserId] = useState<string | undefined>();
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);

  const supabase = createClient();

  // candidates 조회 함수
  // RLS가 user_id 필터를 자동으로 적용하므로 user_id 파라미터는 Realtime 구독용
  const fetchCandidates = async (_currentUserId: string): Promise<Candidate[]> => {
    console.log("[Candidates] Fetching candidates...");

    // 1. 후보자 목록 조회 (RLS가 자동으로 현재 사용자의 데이터만 반환)
    const { data, error } = await supabase
      .from("candidates")
      .select("id, name, last_position, last_company, exp_years, skills, confidence_score, created_at, summary, careers, status")
      .in("status", ["processing", "parsed", "analyzed", "completed"])
      .eq("is_latest", true)
      .order("created_at", { ascending: false });

    console.log("[Candidates] Query result:", { data, error, count: data?.length });

    if (error) {
      console.error("[Candidates] Query error:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Type assertion for Supabase data
    const candidatesData = data as unknown as Array<{
      id: string;
      name: string;
      last_position: string | null;
      last_company: string | null;
      exp_years: number;
      skills: string[];
      confidence_score: number;
      created_at: string;
      summary: string | null;
      careers: Career[] | null;
      status?: CandidateStatus;
    }>;

    // 2. 매칭된 후보자 ID 목록 조회 (position_candidates 테이블에서)
    const candidateIds = candidatesData.map((c) => c.id);
    const { data: matchedData } = await supabase
      .from("position_candidates")
      .select("candidate_id")
      .in("candidate_id", candidateIds);

    const matchedCandidateIds = new Set(
      (matchedData as { candidate_id: string }[] | null)?.map(m => m.candidate_id) || []
    );

    // 3. 각 후보자에 매칭 여부 표시
    return candidatesData.map((candidate) => ({
      ...candidate,
      hasBeenMatched: matchedCandidateIds.has(candidate.id),
    }));
  };

  // 페이지 로드 시 사용자 ID 가져오고 candidates 조회
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log("[Candidates] Auth user:", user?.id, user?.email);

        if (!user || !user.email) {
          console.log("[Candidates] No user found");
          setIsLoading(false);
          return;
        }

        // public.users 테이블에서 실제 user_id 조회 (Realtime 구독용)
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("email", user.email)
          .single<{ id: string }>();

        if (userError || !userData) {
          console.error("[Candidates] Failed to get public user:", userError);
          // public.users에 레코드가 없어도 RLS를 통해 조회 시도
        }

        const currentUserId = userData?.id || user.id;
        console.log("[Candidates] Using userId for realtime:", currentUserId);
        setUserId(currentUserId);

        const data = await fetchCandidates(currentUserId);
        setCandidates(data);
      } catch (error) {
        console.error("[Candidates] Failed to load:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Realtime 구독 - candidates 테이블 변경 감지
  useEffect(() => {
    if (!userId) return;

    console.log("[Realtime] Subscribing to candidates changes for user:", userId);

    const channel = supabase
      .channel("candidates-page-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${userId}`,
        },
        async (payload: RealtimePostgresChangesPayload<Candidate>) => {
          console.log("[Realtime] Candidate change:", payload.eventType, payload);

          // 변경 시 전체 목록 다시 조회
          const data = await fetchCandidates(userId);
          setCandidates(data);
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    return () => {
      console.log("[Realtime] Unsubscribing");
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    filterAndSort();
  }, [candidates, searchQuery, sortBy]);

  const filterAndSort = () => {
    let result = [...candidates];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.last_position?.toLowerCase().includes(query) ||
          c.last_company?.toLowerCase().includes(query) ||
          c.skills?.some((s) => s.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sortBy) {
      case "confidence":
        result.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
        break;
      case "exp":
        // 실제 경력 계산값으로 정렬
        result.sort((a, b) => {
          const expA = calculateTotalExperience(a.careers || []).totalMonths;
          const expB = calculateTotalExperience(b.careers || []).totalMonths;
          return expB - expA;
        });
        break;
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredCandidates(result);
  };

  const getConfidenceColor = (score: number) => {
    const percent = score * 100;
    if (percent >= 95) return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
    if (percent >= 80) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
    return "text-red-400 bg-red-500/20 border-red-500/30";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 mt-1">
            등록된 모든 후보자를 확인하고 관리하세요
          </p>
        </div>
        {/* 후보자가 1명 이상일 때만 업로드 버튼 표시 */}
        {candidates.length > 0 && (
          <button
            onClick={() => setIsUploadDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90
                     text-white font-medium transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            이력서 업로드
          </button>
        )}
      </div>

      {/* Upload Drawer */}
      <ResumeUploadDrawer
        isOpen={isUploadDrawerOpen}
        onClose={() => setIsUploadDrawerOpen(false)}
      />

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="이름, 직책, 회사, 스킬로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="search-input"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            data-testid="filter-sort"
            className="px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            <option value="recent">최근 등록순</option>
            <option value="confidence">신뢰도순</option>
            <option value="exp">경력순</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{candidates.length}</p>
              <p className="text-sm text-gray-500">전체 후보자</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Briefcase className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {candidates.filter((c) => c.status === "completed" && !c.hasBeenMatched).length}
              </p>
              <p className="text-sm text-gray-500">검토 필요</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {candidates.filter((c) => {
                  const date = new Date(c.created_at);
                  const now = new Date();
                  return now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
                }).length}
              </p>
              <p className="text-sm text-gray-500">최근 7일</p>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Cards - Issue #9: 카드 UI로 변환 */}
      {/* Progressive Loading: 처리 중 후보자 수 표시 */}
      {candidates.filter(c => c.status && c.status !== "completed").length > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {candidates.filter(c => c.status && c.status !== "completed").length}개의 이력서 분석 중...
          </span>
        </div>
      )}

      {isLoading ? (
        <div data-testid="loading-state">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton count={6} />
          </div>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div data-testid="empty-state">
          <EmptyState
            variant={searchQuery ? "search-results" : "candidates"}
            title={searchQuery ? "검색 결과가 없습니다" : undefined}
            description={searchQuery ? "다른 조건으로 검색해보세요." : undefined}
            cta={!searchQuery ? {
              label: "이력서 업로드",
              onClick: () => setIsUploadDrawerOpen(true),
            } : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="candidate-list">
          {filteredCandidates.map((candidate) => {
            // Progressive Loading: 처리 중인 후보자는 ProcessingCard로 표시
            if (candidate.status && candidate.status !== "completed") {
              return (
                <ProcessingCard
                  key={candidate.id}
                  candidate={{
                    id: candidate.id,
                    status: candidate.status,
                    name: candidate.name || undefined,
                    last_company: candidate.last_company || undefined,
                    last_position: candidate.last_position || undefined,
                    quick_extracted: candidate.quick_extracted,
                    created_at: candidate.created_at,
                  }}
                />
              );
            }

            // 완료된 후보자는 기존 카드로 표시
            return (
              <Link
                key={candidate.id}
                href={`/candidates/${candidate.id}`}
                data-testid="candidate-item"
                className="group p-5 rounded-2xl bg-white
                       border border-gray-100 hover:border-primary
                       transition-all duration-300 hover:shadow-lg hover:shadow-primary/5
                       hover:-translate-y-1 block h-full"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 
                                  flex items-center justify-center text-primary font-semibold text-lg
                                  group-hover:bg-primary group-hover:text-white transition-all">
                      {candidate.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
                        {candidate.name || "이름 미확인"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {candidate.last_position || "직책 미확인"}
                      </p>
                    </div>
                  </div>
                  {/* Confidence Badge */}
                  <span
                    className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium border",
                      candidate.confidence_score >= 0.95 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        candidate.confidence_score >= 0.8 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          "bg-red-50 text-red-700 border-red-200"
                    )}
                    data-testid="ai-confidence"
                  >
                    {Math.round((candidate.confidence_score || 0) * 100)}%
                  </span>
                </div>

                {/* Company & Experience */}
                <div className="flex items-center gap-4 mb-3 text-sm">
                  {candidate.last_company && (
                    <span className="flex items-center gap-1.5 text-gray-700" data-testid="candidate-company">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      {candidate.last_company}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-gray-700" data-testid="candidate-exp-years">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    {formatExperience(calculateTotalExperience(candidate.careers || []))}
                  </span>
                </div>

                {/* Summary */}
                {candidate.summary && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {candidate.summary}
                  </p>
                )}

                {/* Skills */}
                {candidate.skills && candidate.skills.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap" data-testid="candidate-skills">
                    <Code className="w-4 h-4 text-gray-400" />
                    {candidate.skills.slice(0, 3).map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600"
                      >
                        {skill}
                      </span>
                    ))}
                    {candidate.skills.length > 3 && (
                      <span className="text-xs text-gray-500">
                        +{candidate.skills.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Date */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {new Date(candidate.created_at).toLocaleDateString("ko-KR")}
                  </span>
                  <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    상세 보기 →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
