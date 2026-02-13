"use client";

/**
 * 온보딩 리셋 버튼
 * 설정 페이지에서 "가이드 다시 보기" 기능 제공
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/useOnboarding";
import { BookOpen, Loader2 } from "lucide-react";

interface ResetOnboardingButtonProps {
  className?: string;
}

export function ResetOnboardingButton({ className }: ResetOnboardingButtonProps) {
  const { resetOnboarding, completed } = useOnboarding();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetOnboarding();
      // 페이지 새로고침으로 온보딩 모달 다시 표시
      window.location.reload();
    } catch (error) {
      console.error("Failed to reset onboarding:", error);
    } finally {
      setIsResetting(false);
    }
  };

  // 온보딩 미완료 상태에서는 표시하지 않음
  if (!completed) {
    return null;
  }

  return (
    <Button
      variant="outline"
      onClick={handleReset}
      disabled={isResetting}
      className={className}
    >
      {isResetting ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <BookOpen className="w-4 h-4 mr-2" />
      )}
      가이드 다시 보기
    </Button>
  );
}
