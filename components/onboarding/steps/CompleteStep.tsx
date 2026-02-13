"use client";

/**
 * 온보딩 완료 화면
 * PRD v0.1 Section 14.3
 */

import { Button } from "@/components/ui/button";
import { CheckCircle2, Users, Settings } from "lucide-react";
import Link from "next/link";

interface CompleteStepProps {
  remainingCredits: number;
  analyzedCandidates: number;
  onComplete: () => void;
}

export function CompleteStep({
  remainingCredits,
  analyzedCandidates,
  onComplete,
}: CompleteStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Success Icon */}
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        🎉 준비 완료!
      </h2>

      <p className="text-gray-600 mb-8">
        서치드를 사용할 준비가 되었습니다.
      </p>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-3xl font-bold text-primary mb-1">
            {remainingCredits}
          </p>
          <p className="text-sm text-gray-600">남은 크레딧</p>
        </div>
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-3xl font-bold text-gray-900 mb-1">
            {analyzedCandidates}
          </p>
          <p className="text-sm text-gray-600">분석된 후보자</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="w-full max-w-md space-y-3 mb-8">
        <Link href="/upload" className="block">
          <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <span className="text-lg">📥</span>
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 group-hover:text-primary transition-colors">
                이력서 업로드하기
              </p>
              <p className="text-xs text-gray-500">
                HWP, PDF, DOCX 파일을 분석하세요
              </p>
            </div>
          </div>
        </Link>

        <Link href="/candidates" className="block">
          <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <Users className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 group-hover:text-primary transition-colors">
                후보자 검색하기
              </p>
              <p className="text-xs text-gray-500">
                키워드나 문장으로 후보자를 찾으세요
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Settings Hint */}
      <div className="w-full max-w-md p-4 rounded-xl bg-gray-50 border border-gray-100 mb-8">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-gray-400" />
          <p className="text-sm text-gray-600 text-left">
            언제든 <Link href="/settings" className="text-primary hover:underline">설정</Link>에서 가이드를 다시 볼 수 있어요
          </p>
        </div>
      </div>

      {/* Complete Button */}
      <Button onClick={onComplete} size="lg" className="w-full max-w-md">
        대시보드로 가기 →
      </Button>
    </div>
  );
}
