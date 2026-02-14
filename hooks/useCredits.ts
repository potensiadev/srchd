/**
 * useCredits Hook
 * 사용자 크레딧 조회 (React Query)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiResponse, type PlanType } from "@/types";

interface CreditsData {
  email: string;             // 사용자 이메일
  credits: number;           // 추가 구매 크레딧
  creditsUsedThisMonth: number;
  plan: PlanType;
  planBaseCredits: number;   // 플랜 기본 크레딧
  remainingCredits: number;  // 남은 총 크레딧
}

/**
 * 크레딧 정보 조회 API 호출
 */
async function fetchUserCredits(): Promise<CreditsData> {
  console.log("[useCredits] Fetching credits...");

  const response = await fetch("/api/user/credits");
  console.log("[useCredits] Response status:", response.status);

  if (!response.ok) {
    const error: ApiResponse<null> = await response.json();
    console.error("[useCredits] Error:", error);
    throw new Error(error.error?.message || "크레딧 조회에 실패했습니다.");
  }

  const data: ApiResponse<CreditsData> = await response.json();
  console.log("[useCredits] Data:", data);

  if (!data.data) {
    throw new Error("크레딧 정보가 없습니다.");
  }

  return data.data;
}

/**
 * 크레딧 조회 훅
 * - 30초마다 자동 갱신
 * - 창이 포커스될 때 갱신
 */
export function useCredits() {
  return useQuery({
    queryKey: ["credits"],
    queryFn: fetchUserCredits,
    refetchInterval: 30000, // 30초마다 갱신
    refetchOnWindowFocus: true,
    staleTime: 1000 * 10, // 10초
  });
}

/**
 * 크레딧 무효화 (갱신 강제)
 */
export function useInvalidateCredits() {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.invalidateQueries({ queryKey: ["credits"] });
  };
}

/**
 * 크레딧 부족 여부 확인
 */
export function useHasInsufficientCredits(): boolean {
  const { data } = useCredits();
  return (data?.remainingCredits ?? 0) <= 0;
}
