"use client";

/**
 * 온보딩 Step 5: 블라인드 내보내기 가이드
 * PRD v0.1 Section 14.2
 */

import { Button } from "@/components/ui/button";
import { Download, Eye, EyeOff, Shield, Lightbulb } from "lucide-react";

interface ExportGuideStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const MASKED_FIELDS = [
  { original: "010-1234-5678", masked: "010-****-5678", label: "전화번호" },
  { original: "user@example.com", masked: "u***@example.com", label: "이메일" },
  { original: "서울시 강남구 역삼동 123", masked: "서울시 강남구 ***", label: "주소" },
];

export function ExportGuideStep({ onNext, onSkip }: ExportGuideStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="text-6xl mb-6">📋</div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        블라인드 이력서 다운로드
      </h2>

      <p className="text-gray-600 mb-8">
        개인정보가 자동으로 마스킹된 안전한 이력서를 한 클릭으로 생성합니다
      </p>

      {/* Export Button Preview */}
      <div className="w-full max-w-md mb-6">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">블라인드 내보내기</p>
              <p className="text-xs text-gray-500">PDF 형식으로 다운로드</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-primary">
            <Shield className="w-4 h-4" />
            <span>개인정보 자동 마스킹</span>
          </div>
        </div>
      </div>

      {/* Masking Preview */}
      <div className="w-full max-w-md mb-6">
        <p className="text-xs text-gray-500 mb-3">마스킹 예시:</p>
        <div className="space-y-2">
          {MASKED_FIELDS.map(({ original, masked, label }) => (
            <div
              key={label}
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16">{label}</span>
                <div className="flex items-center gap-2">
                  <Eye className="w-3 h-3 text-gray-400" />
                  <span className="text-sm text-gray-600 line-through">
                    {original}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <EyeOff className="w-3 h-3 text-primary" />
                <span className="text-sm font-medium text-primary">{masked}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Note */}
      <div className="w-full max-w-md p-4 rounded-xl bg-emerald-50 border border-emerald-100 mb-8">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-medium text-emerald-800 mb-1">
              직거래 리스크 차단
            </p>
            <p className="text-xs text-emerald-700">
              연락처가 완전히 제거된 블라인드 이력서로 안전하게 후보자를 소개하세요.
              모든 내보내기 이력은 자동으로 기록됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Tip */}
      <div className="w-full max-w-md p-4 rounded-xl bg-gray-50 border border-gray-100 mb-8">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 text-left">
            후보자 상세 페이지에서 &quot;블라인드 내보내기&quot; 버튼을 클릭하면 바로 다운로드됩니다.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 w-full max-w-md">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          건너뛰기
        </Button>
        <Button onClick={onNext} className="flex-1">
          완료하기 →
        </Button>
      </div>
    </div>
  );
}
