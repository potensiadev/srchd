"use client";

import { useState, useCallback, useMemo } from "react";
import { Search, Filter, Upload, Loader2, RotateCcw } from "lucide-react";
import { EmptyState, CardSkeleton } from "@/components/ui/empty-state";
import ProcessingCard from "@/components/dashboard/ProcessingCard";
import ResumeUploadDrawer from "@/components/upload/ResumeUploadDrawer";

// Hooks
import {
  useCandidatesQuery,
  useCandidatesRealtime,
  useCandidatesFilter,
  useBulkRetry,
} from "./hooks";

// Components
import { CandidateCard, CandidateStats } from "./components";

export default function CandidatesPage() {
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);

  // 데이터 페칭
  const { candidates, userId, isLoading, refetch } = useCandidatesQuery();

  // Realtime 구독
  useCandidatesRealtime({
    userId,
    onUpdate: refetch,
    enabled: !!userId,
  });

  // 필터/정렬
  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredCandidates,
    stats,
  } = useCandidatesFilter({ candidates });

  // 일괄 재시도
  const { isRetrying, retryOne, retryBulk } = useBulkRetry({
    onSuccess: refetch,
  });

  const failedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "failed"),
    [candidates]
  );

  const handleBulkRetry = useCallback(() => {
    retryBulk(failedCandidates.map((c) => c.id));
  }, [retryBulk, failedCandidates]);

  // ProcessingCard에 맞는 타입으로 래핑
  const handleRetryOne = useCallback(
    async (candidateId: string): Promise<void> => {
      await retryOne(candidateId);
    },
    [retryOne]
  );

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
      <CandidateStats stats={stats} />

      {/* Processing Status & Bulk Retry */}
      <div className="flex items-center justify-between">
        {stats.processing > 0 && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{stats.processing}개의 이력서 분석 중...</span>
          </div>
        )}
        {failedCandidates.length >= 2 && (
          <button
            onClick={handleBulkRetry}
            disabled={isRetrying}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                     bg-red-50 hover:bg-red-100 disabled:bg-red-50/50
                     text-red-600 text-sm font-medium transition-colors"
          >
            {isRetrying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                재시도 중...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                실패 {failedCandidates.length}개 모두 재시도
              </>
            )}
          </button>
        )}
      </div>

      {/* Candidate List */}
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
            cta={
              !searchQuery
                ? {
                    label: "이력서 업로드",
                    onClick: () => setIsUploadDrawerOpen(true),
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="candidate-list"
        >
          {filteredCandidates.map((candidate) => {
            // 처리 중/실패 후보자는 ProcessingCard로 표시
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
                  errorMessage={candidate.errorMessage}
                  onRetry={handleRetryOne}
                />
              );
            }

            // 완료된 후보자는 CandidateCard로 표시
            return <CandidateCard key={candidate.id} candidate={candidate} />;
          })}
        </div>
      )}
    </div>
  );
}
