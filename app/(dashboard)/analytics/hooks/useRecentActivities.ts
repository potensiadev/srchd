"use client";

import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCallback } from "react";

export type ActivityDisplayType =
  | "placement"
  | "position_created"
  | "stage_change"
  | "other";

export interface RecentActivity {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  display_type: ActivityDisplayType;
}

const RECENT_ACTIVITIES_KEY = "analytics-recent-activities";

const createFetcher = (limit: number) => async (): Promise<RecentActivity[]> => {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_recent_activities", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as RecentActivity[]) || [];
};

export function useRecentActivities(limit: number = 10) {
  const { data, error, isLoading, isValidating } = useSWR<RecentActivity[]>(
    [RECENT_ACTIVITIES_KEY, limit],
    () => createFetcher(limit)(),
    {
      refreshInterval: 2 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 30 * 1000,
    }
  );

  return {
    data: data || [],
    activities: data || [],
    isLoading,
    error,
    isFetching: isValidating,
  };
}

export function useRefreshActivityFeed() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(
    (key) => Array.isArray(key) && key[0] === RECENT_ACTIVITIES_KEY
  ), [mutate]);
}

// Alias for backward compatibility
export const useRefreshRecentActivities = useRefreshActivityFeed;

export function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
