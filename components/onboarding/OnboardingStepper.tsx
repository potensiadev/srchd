"use client";

/**
 * 온보딩 진행 상태 표시 (Step Indicator)
 */

import { cn } from "@/lib/utils";
import { OnboardingStep, ONBOARDING_STEPS } from "@/types/onboarding";
import { Check } from "lucide-react";

interface OnboardingStepperProps {
  currentStep: OnboardingStep;
  className?: string;
}

const STEPS = [
  { step: 1, label: "환영" },
  { step: 2, label: "업로드" },
  { step: 3, label: "검색" },
  { step: 4, label: "검토" },
  { step: 5, label: "내보내기" },
];

export function OnboardingStepper({
  currentStep,
  className,
}: OnboardingStepperProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {STEPS.map(({ step, label }, index) => {
        const isCompleted = currentStep > step;
        const isCurrent = currentStep === step;

        return (
          <div key={step} className="flex items-center">
            {/* Step Circle */}
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all duration-300",
                isCompleted && "bg-primary text-white",
                isCurrent && "bg-primary/10 text-primary ring-2 ring-primary",
                !isCompleted && !isCurrent && "bg-gray-100 text-gray-400"
              )}
            >
              {isCompleted ? (
                <Check className="w-4 h-4" />
              ) : (
                step
              )}
            </div>

            {/* Step Label (only show on desktop) */}
            <span
              className={cn(
                "hidden sm:inline ml-2 text-xs font-medium transition-colors",
                isCurrent ? "text-gray-900" : "text-gray-400"
              )}
            >
              {label}
            </span>

            {/* Connector Line */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 sm:w-12 h-0.5 mx-2 transition-colors duration-300",
                  currentStep > step ? "bg-primary" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
