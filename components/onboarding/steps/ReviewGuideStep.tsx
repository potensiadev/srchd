"use client";

/**
 * 온보딩 Step 4: 검토 UI 가이드
 * PRD v0.1 Section 14.2
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lightbulb, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import Link from "next/link";

interface ReviewGuideStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const CONFIDENCE_LEVELS = [
  {
    level: "high",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    label: "95% 이상",
    description: "AI가 확신하는 항목",
    example: "Java, Spring Boot",
  },
  {
    level: "medium",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: AlertCircle,
    iconColor: "text-amber-500",
    label: "80~95%",
    description: "확인이 필요한 항목",
    example: "경력 5년 (추정)",
  },
  {
    level: "low",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    icon: XCircle,
    iconColor: "text-rose-500",
    label: "80% 미만",
    description: "수정이 필요한 항목",
    example: "연락처 미확인",
  },
];

export function ReviewGuideStep({ onNext, onSkip }: ReviewGuideStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="text-6xl mb-6">✏️</div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        AI 분석 결과를 확인하세요
      </h2>

      <p className="text-gray-600 mb-8">
        색상으로 AI의 신뢰도를 확인하고, 클릭해서 바로 수정할 수 있어요
      </p>

      {/* Confidence Level Cards */}
      <div className="w-full max-w-md space-y-3 mb-6">
        {CONFIDENCE_LEVELS.map(
          ({ level, color, icon: Icon, iconColor, label, description, example }) => (
            <div
              key={level}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl border transition-all",
                color
              )}
            >
              <Icon className={cn("w-6 h-6 flex-shrink-0", iconColor)} />
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold">{label}</span>
                  <span className="text-xs opacity-75">— {description}</span>
                </div>
                <p className="text-xs opacity-75">예: {example}</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Interactive Hint */}
      <div className="w-full max-w-md p-4 rounded-xl bg-gray-50 border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <span className="text-sm">🖱️</span>
          </div>
          <span className="text-sm font-medium text-gray-700">
            클릭하면 바로 수정 가능
          </span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-200">
          <span className="text-sm text-gray-500">경력:</span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-sm cursor-pointer hover:bg-amber-200 transition-colors">
            5년 (추정)
          </span>
          <span className="text-xs text-gray-400 ml-auto">← 클릭해서 수정</span>
        </div>
      </div>

      {/* Tip */}
      <div className="w-full max-w-md p-4 rounded-xl bg-purple-50 border border-purple-100 mb-8">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-purple-800 text-left">
            <strong>Tip:</strong> 수정 사항은 즉시 저장됩니다. 검토가 필요한 후보자는 Review Queue에서 한 번에 확인할 수 있어요.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 w-full max-w-md">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          건너뛰기
        </Button>
        <Button asChild className="flex-1">
          <Link href="/review">
            Review Queue 가기 →
          </Link>
        </Button>
      </div>
    </div>
  );
}
