/**
 * useSearch Hook
 * 하이브리드 검색 (React Query Mutation)
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type SearchRequest,
  type SearchResponse,
  type CandidateSearchResult,
  type FeedbackType,
  type ApiResponse,
} from "@/types";

/**
 * 검색 API 호출
 */
async function searchCandidates(request: SearchRequest): Promise<SearchResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiResponse<null> = await response.json();
    throw new Error(error.error?.message || "검색에 실패했습니다.");
  }

  const data: ApiResponse<SearchResponse> = await response.json();

  if (!data.data) {
    throw new Error("검색 결과가 없습니다.");
  }

  return data.data;
}

/**
 * 검색 피드백 저장 API 호출
 */
interface FeedbackRequest {
  candidateId: string;
  searchQuery: string;
  feedbackType: FeedbackType;
  resultPosition?: number;
  relevanceScore?: number;
}

async function submitFeedback(request: FeedbackRequest): Promise<{ id: string }> {
  const response = await fetch("/api/search/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiResponse<null> = await response.json();
    throw new Error(error.error?.message || "피드백 저장에 실패했습니다.");
  }

  const data: ApiResponse<{ id: string }> = await response.json();

  if (!data.data) {
    throw new Error("피드백 저장에 실패했습니다.");
  }

  return data.data;
}

/**
 * 검색 훅 (Mutation)
 */
export function useSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: searchCandidates,
    onSuccess: (data, variables) => {
      // 검색 결과를 캐시에 저장
      queryClient.setQueryData(
        ["searchResults", variables.query],
        data
      );
    },
  });
}

/**
 * 검색 피드백 훅 (Mutation)
 */
export function useSearchFeedback() {
  return useMutation({
    mutationFn: submitFeedback,
  });
}

/**
 * 검색 결과 타입 가드
 */
export function isSearchResult(
  item: CandidateSearchResult | unknown
): item is CandidateSearchResult {
  return (
    typeof item === "object" &&
    item !== null &&
    "matchScore" in item &&
    typeof (item as CandidateSearchResult).matchScore === "number"
  );
}
