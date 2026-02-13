"use client";

import { useMemo, useState } from "react";
import type { Candidate, SortBy, CandidatesStats } from "@/lib/candidates/types";
import { calculateTotalExperience } from "@/lib/candidates/career-utils";

interface UseCandidatesFilterOptions {
  candidates: Candidate[];
}

interface UseCandidatesFilterResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  filteredCandidates: Candidate[];
  stats: CandidatesStats;
}

export function useCandidatesFilter({
  candidates,
}: UseCandidatesFilterOptions): UseCandidatesFilterResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const filteredCandidates = useMemo(() => {
    let result = [...candidates];

    // 검색 필터
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

    // 정렬
    switch (sortBy) {
      case "confidence":
        result.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
        break;
      case "exp":
        result.sort((a, b) => {
          const expA = calculateTotalExperience(a.careers || []).totalMonths;
          const expB = calculateTotalExperience(b.careers || []).totalMonths;
          return expB - expA;
        });
        break;
      default: // recent
        result.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return result;
  }, [candidates, searchQuery, sortBy]);

  // 통계 계산
  const stats = useMemo((): CandidatesStats => {
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return {
      total: candidates.length,
      needsReview: candidates.filter(
        (c) => c.status === "completed" && !c.hasBeenMatched
      ).length,
      recentWeek: candidates.filter(
        (c) => new Date(c.created_at).getTime() > weekAgo
      ).length,
      processing: candidates.filter(
        (c) => c.status && !["completed", "failed"].includes(c.status)
      ).length,
      failed: candidates.filter((c) => c.status === "failed").length,
    };
  }, [candidates]);

  return {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredCandidates,
    stats,
  };
}
