"use client";

/**
 * 온보딩 Provider
 *
 * 대시보드 레이아웃에서 사용하여 온보딩 모달을 자동으로 표시
 * - 첫 로그인 시 (동의 완료 직후) 온보딩 시작
 * - 온보딩 미완료 사용자에게 모달 표시
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingModal } from "./OnboardingModal";
import { ONBOARDING_STEPS } from "@/types/onboarding";

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const supabase = createClient();

        // 현재 사용자 조회
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setIsChecking(false);
          return;
        }

        setUserEmail(user.email ?? undefined);

        // 온보딩 상태 조회
        const { data } = await supabase
          .from("users")
          .select("onboarding_completed, onboarding_step")
          .eq("id", user.id)
          .single();

        if (!data) {
          setIsChecking(false);
          return;
        }

        // Type assertion
        const userData = data as {
          onboarding_completed: boolean | null;
          onboarding_step: number | null;
        };

        const completed = userData.onboarding_completed ?? false;
        const step = userData.onboarding_step ?? 0;

        // 온보딩 미완료 + step이 0이면 자동 시작
        if (!completed && step === 0) {
          // 온보딩 시작 (step = 1로 설정)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("users")
            .update({
              onboarding_step: ONBOARDING_STEPS.WELCOME,
            })
            .eq("id", user.id);

          setShouldShowOnboarding(true);
        } else if (!completed && step > 0) {
          // 온보딩 진행 중
          setShouldShowOnboarding(true);
        }

        setIsChecking(false);
      } catch (error) {
        console.error("[OnboardingProvider] Error:", error);
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();
  }, []);

  return (
    <>
      {children}
      {!isChecking && shouldShowOnboarding && (
        <OnboardingModal userEmail={userEmail} />
      )}
    </>
  );
}
