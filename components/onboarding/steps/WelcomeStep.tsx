"use client";

/**
 * 온보딩 Step 1: 환영 + 서비스 소개
 * PRD v0.1 Section 14.2
 */

import { Button } from "@/components/ui/button";
import { Upload, Search, Shield, FileText } from "lucide-react";

interface WelcomeStepProps {
  userName?: string;
  freeCredits: number;
  onNext: () => void;
  onSkip: () => void;
}

const FEATURES = [
  {
    icon: Upload,
    title: "AI 자동 분석",
    description: "이력서를 올리면 AI가 자동으로 분석합니다",
  },
  {
    icon: Search,
    title: "즉시 검색",
    description: "키워드나 문장으로 후보자를 instantly 검색",
  },
  {
    icon: Shield,
    title: "개인정보 보호",
    description: "AES-256으로 안전하게 암호화",
  },
  {
    icon: FileText,
    title: "블라인드 생성",
    description: "한 클릭으로 블라인드 이력서 생성",
  },
];

export function WelcomeStep({
  userName,
  freeCredits,
  onNext,
  onSkip,
}: WelcomeStepProps) {
  const displayName = userName?.split("@")[0] || "회원";

  return (
    <div className="flex flex-col items-center text-center">
      {/* Welcome Icon */}
      <div className="text-6xl mb-6">👋</div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        서치드에 오신 것을 환영합니다!
      </h2>

      {/* Personalized Message */}
      <p className="text-gray-600 mb-8">
        {displayName}님, 서치드가 도와드릴 것들:
      </p>

      {/* Features Grid */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex flex-col items-center p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>

      {/* Free Credits Notice */}
      <div className="w-full max-w-md p-4 rounded-xl bg-primary/5 border border-primary/10 mb-8">
        <p className="text-sm text-primary font-medium">
          🎁 무료 크레딧 {freeCredits}건이 제공됩니다!
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 w-full max-w-md">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          나중에
        </Button>
        <Button onClick={onNext} className="flex-1">
          시작하기 →
        </Button>
      </div>
    </div>
  );
}
