"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Candidate, Career } from "@/lib/candidates/types";

interface UseCandidatesQueryResult {
  candidates: Candidate[];
  userId: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useCandidatesQuery(): UseCandidatesQueryResult {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const supabase = createClient();

  const fetchCandidates = useCallback(async (_currentUserId: string): Promise<Candidate[]> => {
    console.log("[Candidates] Fetching candidates...");

    // 1. 후보자 목록 조회 (RLS가 자동으로 현재 사용자의 데이터만 반환)
    const { data, error: queryError } = await supabase
      .from("candidates")
      .select("id, name, last_position, last_company, exp_years, skills, confidence_score, created_at, summary, careers, status")
      .in("status", ["processing", "parsed", "analyzed", "completed", "failed"])
      .eq("is_latest", true)
      .order("created_at", { ascending: false });

    console.log("[Candidates] Query result:", { count: data?.length, error: queryError });

    if (queryError) {
      console.error("[Candidates] Query error:", queryError);
      throw queryError;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Type assertion for Supabase data
    const candidatesData = data as unknown as Candidate[];

    // 2. 매칭된 후보자 ID 목록 조회
    const candidateIds = candidatesData.map((c) => c.id);
    const { data: matchedData } = await supabase
      .from("position_candidates")
      .select("candidate_id")
      .in("candidate_id", candidateIds);

    const matchedCandidateIds = new Set(
      (matchedData as { candidate_id: string }[] | null)?.map(m => m.candidate_id) || []
    );

    // 3. 실패한 후보자들의 에러 메시지 조회
    const failedCandidateIds = candidatesData
      .filter((c) => c.status === "failed")
      .map((c) => c.id);

    const errorMessageMap: Record<string, string> = {};
    if (failedCandidateIds.length > 0) {
      const { data: jobsData } = await supabase
        .from("processing_jobs")
        .select("candidate_id, error_message")
        .in("candidate_id", failedCandidateIds)
        .eq("status", "failed")
        .order("created_at", { ascending: false });

      if (jobsData) {
        const seenIds = new Set<string>();
        for (const job of jobsData as { candidate_id: string; error_message: string | null }[]) {
          if (job.candidate_id && !seenIds.has(job.candidate_id)) {
            seenIds.add(job.candidate_id);
            if (job.error_message) {
              errorMessageMap[job.candidate_id] = job.error_message;
            }
          }
        }
      }
    }

    // 4. 각 후보자에 매칭 여부 + 에러 메시지 표시
    return candidatesData.map((candidate) => ({
      ...candidate,
      careers: candidate.careers as Career[] | null,
      hasBeenMatched: matchedCandidateIds.has(candidate.id),
      errorMessage: errorMessageMap[candidate.id],
    }));
  }, [supabase]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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
        .single();

      if (userError) {
        console.error("[Candidates] Failed to get public user:", userError);
      }

      const currentUserId = (userData as { id: string } | null)?.id || user.id;
      console.log("[Candidates] Using userId for realtime:", currentUserId);
      setUserId(currentUserId);

      const data = await fetchCandidates(currentUserId);
      setCandidates(data);
    } catch (err) {
      console.error("[Candidates] Failed to load:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, fetchCandidates]);

  const refetch = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchCandidates(userId);
      setCandidates(data);
    } catch (err) {
      console.error("[Candidates] Refetch failed:", err);
    }
  }, [userId, fetchCandidates]);

  // Initial load - use useState to track if we've loaded
  const [hasInitialized, setHasInitialized] = useState(false);
  if (!hasInitialized) {
    setHasInitialized(true);
    loadData();
  }

  return {
    candidates,
    userId,
    isLoading,
    error,
    refetch,
  };
}
