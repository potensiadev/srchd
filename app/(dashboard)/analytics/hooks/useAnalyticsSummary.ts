"use client";

import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCallback } from "react";

export interface AnalyticsSummary {
  total_candidates: number;
  this_month_count: number;
  last_month_count: number;
  total_exports: number;
  active_positions: number;
  urgent_positions: number;
}

const ANALYTICS_SUMMARY_KEY = "analytics-summary";

const fetcher = async (): Promise<AnalyticsSummary> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_analytics_summary");

  if (error) {
    throw new Error(error.message);
  }

  return data as AnalyticsSummary;
};

export function useAnalyticsSummary() {
  const { data, error, isLoading, isValidating } = useSWR<AnalyticsSummary>(
    ANALYTICS_SUMMARY_KEY,
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000, // 5 minutes
      revalidateOnFocus: false,
      dedupingInterval: 30 * 1000, // 30 seconds
    }
  );

  return {
    data,
    isLoading,
    error,
    isFetching: isValidating,
  };
}

export function useRefreshAnalyticsSummary() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(ANALYTICS_SUMMARY_KEY), [mutate]);
}
