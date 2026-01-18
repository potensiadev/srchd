"use client";

import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCallback } from "react";
import { type PositionStatus, type PositionPriority } from "@/types";

export interface PositionHealth {
  id: string;
  title: string;
  client_company: string | null;
  status: PositionStatus;
  priority: PositionPriority;
  created_at: string;
  deadline: string | null;
  days_open: number;
  match_count: number;
  stuck_count: number;
  health_status: "critical" | "warning" | "good";
}

const POSITION_HEALTH_KEY = "analytics-position-health";

const createFetcher = (limit: number) => async (): Promise<PositionHealth[]> => {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_position_health", {
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as PositionHealth[]) || [];
};

export function usePositionHealth(limit: number = 10) {
  const { data, error, isLoading, isValidating } = useSWR<PositionHealth[]>(
    [POSITION_HEALTH_KEY, limit],
    () => createFetcher(limit)(),
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 30 * 1000,
    }
  );

  const sortedPositions = [...(data || [])].sort((a, b) => {
    const healthOrder = { critical: 0, warning: 1, good: 2 };
    return healthOrder[a.health_status] - healthOrder[b.health_status];
  });

  const criticalCount = sortedPositions.filter(
    (p) => p.health_status === "critical"
  ).length;
  const warningCount = sortedPositions.filter(
    (p) => p.health_status === "warning"
  ).length;

  return {
    data,
    positions: sortedPositions.slice(0, 5),
    allPositions: sortedPositions,
    criticalCount,
    warningCount,
    isLoading,
    error,
    isFetching: isValidating,
  };
}

export function useRefreshPositionHealth() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(
    (key) => Array.isArray(key) && key[0] === POSITION_HEALTH_KEY
  ), [mutate]);
}
