"use client";

/**
 * useCandidatesRealtime - Supabase Realtime 기반 후보자 실시간 업데이트
 *
 * Progressive Data Loading:
 * - candidates 테이블 변경 감지
 * - status 변경 시 React Query 캐시 자동 갱신
 * - RLS 정책으로 본인 데이터만 수신
 */

import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { CandidateStatus } from "@/types";

interface CandidateChange {
  id: string;
  status: CandidateStatus;
  name?: string;
  last_company?: string;
  last_position?: string;
  quick_extracted?: Record<string, unknown>;
  confidence_score?: number;
  created_at: string;
  updated_at?: string;
}

/**
 * Supabase Realtime을 통해 후보자 데이터 실시간 업데이트
 *
 * @param userId - 현재 사용자 ID (RLS 필터링용)
 *
 * @example
 * ```tsx
 * function CandidatesPage() {
 *   const { data: user } = useUser();
 *   useCandidatesRealtime(user?.id);
 *   // ...
 * }
 * ```
 */
export function useCandidatesRealtime(userId?: string) {
  const queryClient = useQueryClient();

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<CandidateChange>) => {
      console.log("[Realtime] Candidate change:", payload.eventType);

      if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
        const newData = payload.new as CandidateChange;
        const status = newData.status;

        // 개별 후보자 캐시 업데이트
        queryClient.setQueryData(
          ["candidate", newData.id],
          (old: CandidateChange | undefined) =>
            old ? { ...old, ...newData } : newData
        );

        // 상태가 변경된 경우 목록 캐시 무효화
        // parsed, analyzed, completed 상태로 변경 시 목록 갱신
        if (["parsed", "analyzed", "completed"].includes(status)) {
          console.log(
            `[Realtime] Invalidating candidates cache: status=${status}, id=${newData.id}`
          );
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
        }
      }

      if (payload.eventType === "DELETE") {
        const oldData = payload.old as { id: string };
        // 삭제된 후보자 캐시에서 제거
        queryClient.removeQueries({ queryKey: ["candidate", oldData.id] });
        queryClient.invalidateQueries({ queryKey: ["candidates"] });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!userId) {
      console.log("[Realtime] No userId, skipping subscription");
      return;
    }

    const supabase = createClient();

    console.log(`[Realtime] Subscribing to candidates changes for user: ${userId}`);

    const channel = supabase
      .channel("candidates-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${userId}`,
        },
        handleChange
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status: ${status}`);
      });

    return () => {
      console.log("[Realtime] Unsubscribing from candidates changes");
      supabase.removeChannel(channel);
    };
  }, [userId, handleChange]);
}

/**
 * 처리 중인 후보자 실시간 모니터링
 * - processing, parsed, analyzed 상태인 후보자 추적
 * - 상태 변경 시 콜백 호출
 *
 * @param userId - 현재 사용자 ID
 * @param onStatusChange - 상태 변경 시 호출되는 콜백
 */
export function useProcessingCandidatesRealtime(
  userId?: string,
  onStatusChange?: (candidateId: string, newStatus: CandidateStatus) => void
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    const channel = supabase
      .channel("processing-candidates-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<CandidateChange>) => {
          const newData = payload.new as CandidateChange;
          const oldData = payload.old as { status?: CandidateStatus };

          // 상태가 변경된 경우에만 처리
          if (oldData.status !== newData.status) {
            console.log(
              `[Realtime] Status changed: ${oldData.status} -> ${newData.status} (${newData.id})`
            );

            // 콜백 호출
            onStatusChange?.(newData.id, newData.status);

            // 캐시 갱신
            queryClient.invalidateQueries({ queryKey: ["candidates"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onStatusChange, queryClient]);
}

export default useCandidatesRealtime;
