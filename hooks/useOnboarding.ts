"use client";

/**
 * 온보딩 상태 관리 훅
 * PRD v0.1 Section 14: 온보딩 플로우
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  OnboardingStep,
  OnboardingState,
  ONBOARDING_STEPS,
} from "@/types/onboarding";

interface UseOnboardingReturn extends OnboardingState {
  nextStep: () => Promise<void>;
  skipStep: () => Promise<void>;
  skipAll: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useState<OnboardingState>({
    completed: false,
    currentStep: ONBOARDING_STEPS.NOT_STARTED,
    isLoading: true,
    error: null,
  });

  const supabase = createClient();

  // 온보딩 상태 조회
  const fetchOnboardingState = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "인증이 필요합니다.",
        }));
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("onboarding_completed, onboarding_step")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("[useOnboarding] Fetch error:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "온보딩 상태를 조회할 수 없습니다.",
        }));
        return;
      }

      // Type assertion for new columns
      const userData = data as {
        onboarding_completed: boolean | null;
        onboarding_step: number | null;
      };

      setState({
        completed: userData.onboarding_completed ?? false,
        currentStep: (userData.onboarding_step ?? 0) as OnboardingStep,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error("[useOnboarding] Error:", err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "오류가 발생했습니다.",
      }));
    }
  }, [supabase]);

  // 온보딩 상태 업데이트
  const updateOnboardingState = useCallback(
    async (step: OnboardingStep, completed: boolean = false) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("users")
          .update({
            onboarding_step: step,
            onboarding_completed: completed,
          })
          .eq("id", user.id);

        if (error) {
          console.error("[useOnboarding] Update error:", error);
          throw error;
        }

        setState((prev) => ({
          ...prev,
          currentStep: step,
          completed,
        }));
      } catch (err) {
        console.error("[useOnboarding] Update failed:", err);
        setState((prev) => ({
          ...prev,
          error: "상태 업데이트에 실패했습니다.",
        }));
      }
    },
    [supabase]
  );

  // 다음 단계로 이동
  const nextStep = useCallback(async () => {
    const next = (state.currentStep + 1) as OnboardingStep;

    if (next >= ONBOARDING_STEPS.COMPLETED) {
      await updateOnboardingState(ONBOARDING_STEPS.COMPLETED, true);
    } else {
      await updateOnboardingState(next);
    }
  }, [state.currentStep, updateOnboardingState]);

  // 현재 단계 건너뛰기 (다음으로)
  const skipStep = useCallback(async () => {
    await nextStep();
  }, [nextStep]);

  // 전체 온보딩 건너뛰기
  const skipAll = useCallback(async () => {
    await updateOnboardingState(ONBOARDING_STEPS.COMPLETED, true);
  }, [updateOnboardingState]);

  // 온보딩 리셋 (설정에서 "가이드 다시 보기" 용)
  const resetOnboarding = useCallback(async () => {
    await updateOnboardingState(ONBOARDING_STEPS.WELCOME, false);
  }, [updateOnboardingState]);

  // 초기 로드
  useEffect(() => {
    fetchOnboardingState();
  }, [fetchOnboardingState]);

  return {
    ...state,
    nextStep,
    skipStep,
    skipAll,
    resetOnboarding,
    refetch: fetchOnboardingState,
  };
}
