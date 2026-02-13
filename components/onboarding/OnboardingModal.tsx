"use client";

/**
 * 온보딩 메인 모달 컴포넌트
 * PRD v0.1 Section 14: 온보딩 플로우
 *
 * 5단계 인터랙티브 가이드:
 * 1. 환영 + 서비스 소개
 * 2. 첫 업로드 가이드
 * 3. 검색 체험 가이드
 * 4. 검토 UI 가이드
 * 5. 블라인드 내보내기 가이드
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { OnboardingStepper } from "./OnboardingStepper";
import {
  WelcomeStep,
  UploadGuideStep,
  SearchGuideStep,
  ReviewGuideStep,
  ExportGuideStep,
  CompleteStep,
} from "./steps";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCredits } from "@/hooks/useCredits";
import { ONBOARDING_STEPS, OnboardingStep } from "@/types/onboarding";
import { Spinner } from "@/components/ui/spinner";

interface OnboardingModalProps {
  userEmail?: string;
}

export function OnboardingModal({ userEmail }: OnboardingModalProps) {
  const router = useRouter();
  const {
    completed,
    currentStep,
    isLoading,
    nextStep,
    skipStep,
    skipAll,
  } = useOnboarding();

  const { data: creditsData } = useCredits();

  // 모달 열림 상태 (온보딩 미완료 + 1단계 이상일 때만 표시)
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 온보딩이 완료되지 않았고, 현재 단계가 1 이상이면 모달 표시
    if (!isLoading && !completed && currentStep >= ONBOARDING_STEPS.WELCOME) {
      setIsOpen(true);
    }
  }, [isLoading, completed, currentStep]);

  // 모달 닫기 (나중에 버튼)
  const handleClose = async () => {
    setIsOpen(false);
    // 온보딩 건너뛰기 처리
    await skipAll();
  };

  // 완료 처리
  const handleComplete = () => {
    setIsOpen(false);
    router.push("/candidates");
  };

  // 로딩 중이거나 완료된 경우 렌더링 안함
  if (isLoading || completed) {
    return null;
  }

  const freeCredits = creditsData?.planBaseCredits ?? 30;
  const remainingCredits = creditsData?.remainingCredits ?? 0;

  // 단계별 컴포넌트 렌더링
  const renderStep = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WELCOME:
        return (
          <WelcomeStep
            userName={userEmail}
            freeCredits={freeCredits}
            onNext={nextStep}
            onSkip={handleClose}
          />
        );

      case ONBOARDING_STEPS.UPLOAD_GUIDE:
        return (
          <UploadGuideStep
            onNext={nextStep}
            onSkip={skipStep}
          />
        );

      case ONBOARDING_STEPS.SEARCH_GUIDE:
        return (
          <SearchGuideStep
            onNext={nextStep}
            onSkip={skipStep}
          />
        );

      case ONBOARDING_STEPS.REVIEW_GUIDE:
        return (
          <ReviewGuideStep
            onNext={nextStep}
            onSkip={skipStep}
          />
        );

      case ONBOARDING_STEPS.EXPORT_GUIDE:
        return (
          <ExportGuideStep
            onNext={nextStep}
            onSkip={skipStep}
          />
        );

      case ONBOARDING_STEPS.COMPLETED:
        return (
          <CompleteStep
            remainingCredits={remainingCredits}
            analyzedCandidates={0}
            onComplete={handleComplete}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
        {/* Stepper (Step 1~5에서만 표시) */}
        {currentStep >= ONBOARDING_STEPS.WELCOME &&
          currentStep < ONBOARDING_STEPS.COMPLETED && (
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <OnboardingStepper currentStep={currentStep} />
            </div>
          )}

        {/* Content */}
        <div className="px-6 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            renderStep()
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
