"use client";

import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCallback } from "react";

export interface ExpDistribution {
  entry: number;
  junior: number;
  middle: number;
  senior: number;
  lead: number;
}

export interface SkillStat {
  name: string;
  skill_count: number;
}

export interface CompanyStat {
  name: string;
  company_count: number;
}

export interface MonthlyData {
  month_key: string;
  month_label: string;
  count: number;
}

export interface TalentPoolStats {
  exp_distribution: ExpDistribution;
  top_skills: SkillStat[] | null;
  top_companies: CompanyStat[] | null;
  monthly_candidates: MonthlyData[] | null;
  monthly_placements: MonthlyData[] | null;
}

export interface FormattedExpRange {
  range: string;
  label: string;
  count: number;
  min: number;
  max: number;
}

const fetcher = async (): Promise<TalentPoolStats> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_talent_pool_stats");

  if (error) {
    throw new Error(error.message);
  }

  return data as TalentPoolStats;
};

function formatExpDistribution(dist: ExpDistribution | undefined): FormattedExpRange[] {
  if (!dist) {
    return [
      { range: "entry", label: "신입 (0-2년)", count: 0, min: 0, max: 2 },
      { range: "junior", label: "주니어 (2-5년)", count: 0, min: 2, max: 5 },
      { range: "middle", label: "미들 (5-8년)", count: 0, min: 5, max: 8 },
      { range: "senior", label: "시니어 (8-12년)", count: 0, min: 8, max: 12 },
      { range: "lead", label: "리드급 (12년+)", count: 0, min: 12, max: 100 },
    ];
  }

  return [
    { range: "entry", label: "신입 (0-2년)", count: dist.entry || 0, min: 0, max: 2 },
    { range: "junior", label: "주니어 (2-5년)", count: dist.junior || 0, min: 2, max: 5 },
    { range: "middle", label: "미들 (5-8년)", count: dist.middle || 0, min: 5, max: 8 },
    { range: "senior", label: "시니어 (8-12년)", count: dist.senior || 0, min: 8, max: 12 },
    { range: "lead", label: "리드급 (12년+)", count: dist.lead || 0, min: 12, max: 100 },
  ];
}

const TALENT_POOL_STATS_KEY = "analytics-talent-pool";

export function useTalentPoolStats() {
  const { data, error, isLoading, isValidating } = useSWR<TalentPoolStats>(
    TALENT_POOL_STATS_KEY,
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 30 * 1000,
    }
  );

  const expDistribution = formatExpDistribution(data?.exp_distribution);
  const totalCandidatesInDist = expDistribution.reduce((sum, e) => sum + e.count, 0);

  return {
    data,
    stats: data,
    expDistribution,
    totalCandidatesInDist,
    topSkills: data?.top_skills || [],
    topCompanies: data?.top_companies || [],
    monthlyCandidates: data?.monthly_candidates || [],
    monthlyPlacements: data?.monthly_placements || [],
    isLoading,
    error,
    isFetching: isValidating,
  };
}

export function useRefreshTalentPoolStats() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(TALENT_POOL_STATS_KEY), [mutate]);
}
