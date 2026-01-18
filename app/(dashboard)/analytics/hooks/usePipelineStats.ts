"use client";

import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCallback } from "react";
import { type MatchStage } from "@/types";

export interface PipelineStage {
  stage: MatchStage;
  count: number;
  total_entered: number;
  total_exited_forward: number;
}

export interface StageConversion {
  from_stage: MatchStage;
  to_stage: MatchStage;
  count: number;
}

export interface PipelineStats {
  stages: PipelineStage[];
  total_in_pipeline: number;
  placed_count: number;
  conversions: StageConversion[] | null;
}

export interface ComputedConversionRate {
  from: MatchStage;
  to: MatchStage;
  rate: number;
  count: number;
  total: number;
  // Aliases for component compatibility
  movedCount: number;
  totalFromStage: number;
}

const STAGE_ORDER: MatchStage[] = [
  "matched",
  "reviewed",
  "contacted",
  "interviewing",
  "offered",
  "placed",
];

const fetcher = async (): Promise<PipelineStats> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_pipeline_stats");

  if (error) {
    throw new Error(error.message);
  }

  return data as PipelineStats;
};

function computeConversionRates(stats: PipelineStats): ComputedConversionRate[] {
  if (!stats.conversions || stats.conversions.length === 0) {
    return computeFallbackConversionRates(stats);
  }

  const rates: ComputedConversionRate[] = [];

  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const fromStage = STAGE_ORDER[i];
    const toStage = STAGE_ORDER[i + 1];

    const transition = stats.conversions.find(
      (c) => c.from_stage === fromStage && c.to_stage === toStage
    );

    const fromStageData = stats.stages?.find((s) => s.stage === fromStage);
    const totalEntered = fromStageData?.total_entered || 0;
    const currentInStage = fromStageData?.count || 0;
    const transitionCount = transition?.count || 0;

    const denominator = totalEntered > 0 ? totalEntered : currentInStage + transitionCount;
    const rate = denominator > 0 ? (transitionCount / denominator) * 100 : 0;

    rates.push({
      from: fromStage,
      to: toStage,
      rate,
      count: transitionCount,
      total: denominator,
      movedCount: transitionCount,
      totalFromStage: denominator,
    });
  }

  return rates;
}

function computeFallbackConversionRates(stats: PipelineStats): ComputedConversionRate[] {
  const rates: ComputedConversionRate[] = [];

  if (!stats.stages) return rates;

  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const fromStage = STAGE_ORDER[i];
    const toStage = STAGE_ORDER[i + 1];

    const cumulativeFrom = stats.stages
      .filter((s) => STAGE_ORDER.indexOf(s.stage as MatchStage) >= i)
      .reduce((sum, s) => sum + s.count, 0);

    const cumulativeTo = stats.stages
      .filter((s) => STAGE_ORDER.indexOf(s.stage as MatchStage) >= i + 1)
      .reduce((sum, s) => sum + s.count, 0);

    const rate = cumulativeFrom > 0 ? (cumulativeTo / cumulativeFrom) * 100 : 0;

    rates.push({
      from: fromStage,
      to: toStage,
      rate,
      count: cumulativeTo,
      total: cumulativeFrom,
      movedCount: cumulativeTo,
      totalFromStage: cumulativeFrom,
    });
  }

  return rates;
}

const PIPELINE_STATS_KEY = "analytics-pipeline";

export function usePipelineStats() {
  const { data: rawData, error, isLoading, isValidating } = useSWR<PipelineStats>(
    PIPELINE_STATS_KEY,
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 30 * 1000,
    }
  );

  const conversionRates = rawData ? computeConversionRates(rawData) : [];

  const placementRate =
    rawData && rawData.total_in_pipeline > 0
      ? (rawData.placed_count / rawData.total_in_pipeline) * 100
      : 0;

  // Combine raw data with computed values for convenience
  const data = rawData ? {
    ...rawData,
    conversionRates,
    placementRate,
  } : null;

  return {
    data,
    stats: rawData,
    conversionRates,
    placementRate,
    isLoading,
    error,
    isFetching: isValidating,
  };
}

export function useRefreshPipelineStats() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(PIPELINE_STATS_KEY), [mutate]);
}
