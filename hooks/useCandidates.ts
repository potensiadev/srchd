/**
 * useCandidates Hook
 * 후보자 목록 조회 (React Query)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CandidateListItem,
  type CandidateDetail,
  type ApiResponse,
} from "@/types";

interface UseCandidatesOptions {
  status?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
  /** Progressive Loading: 처리 중 후보자 포함 여부 */
  includeProcessing?: boolean;
}

interface CandidatesResponse {
  candidates: CandidateListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 후보자 목록 조회 API 호출
 */
async function fetchCandidates(options: UseCandidatesOptions = {}): Promise<CandidatesResponse> {
  const { status = "completed", page = 1, limit = 20, includeProcessing = false } = options;

  const params = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
  });

  // Progressive Loading: 처리 중 후보자 포함
  if (includeProcessing) {
    params.set("includeProcessing", "true");
  }

  const response = await fetch(`/api/candidates?${params}`);

  if (!response.ok) {
    const error: ApiResponse<null> = await response.json();
    throw new Error(error.error?.message || "후보자 목록 조회에 실패했습니다.");
  }

  const data: ApiResponse<CandidateListItem[]> = await response.json();

  return {
    candidates: data.data || [],
    total: data.meta?.total || 0,
    page: data.meta?.page || 1,
    limit: data.meta?.limit || 20,
  };
}

/**
 * 후보자 상세 조회 API 호출
 */
async function fetchCandidate(id: string): Promise<CandidateDetail> {
  const response = await fetch(`/api/candidates/${id}`);

  if (!response.ok) {
    const error: ApiResponse<null> = await response.json();
    throw new Error(error.error?.message || "후보자 상세 조회에 실패했습니다.");
  }

  const data: ApiResponse<CandidateDetail> = await response.json();

  if (!data.data) {
    throw new Error("후보자를 찾을 수 없습니다.");
  }

  return data.data;
}

/**
 * 후보자 목록 조회 훅
 */
export function useCandidates(options: UseCandidatesOptions = {}) {
  const { enabled = true, includeProcessing = false, ...queryOptions } = options;

  return useQuery({
    queryKey: ["candidates", { ...queryOptions, includeProcessing }],
    queryFn: () => fetchCandidates({ ...queryOptions, includeProcessing }),
    enabled,
    // Progressive Loading: Realtime으로 보완하므로 staleTime 단축
    staleTime: includeProcessing ? 1000 * 30 : 1000 * 60, // 30초 또는 1분
  });
}

/**
 * 처리 중 후보자만 조회하는 훅 (Progressive Loading)
 * Realtime 백업용 폴링
 */
export function useProcessingCandidates() {
  return useQuery({
    queryKey: ["candidates", { status: "processing", includeProcessing: true }],
    queryFn: () => fetchCandidates({ includeProcessing: true }),
    refetchInterval: 5000, // 5초마다 폴링 (Realtime 백업)
    staleTime: 1000 * 10, // 10초
  });
}

/**
 * 후보자 상세 조회 훅
 */
export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: () => fetchCandidate(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 후보자 목록 프리페칭
 */
export function usePrefetchCandidates() {
  const queryClient = useQueryClient();

  return (options: UseCandidatesOptions = {}) => {
    return queryClient.prefetchQuery({
      queryKey: ["candidates", options],
      queryFn: () => fetchCandidates(options),
    });
  };
}

/**
 * 후보자 목록 무효화 (갱신)
 */
export function useInvalidateCandidates() {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };
}
