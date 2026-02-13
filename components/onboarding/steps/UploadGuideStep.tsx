"use client";

/**
 * 온보딩 Step 2: 첫 업로드 가이드
 * PRD v0.1 Section 14.2
 */

import { Button } from "@/components/ui/button";
import { Upload, FileText, Lightbulb } from "lucide-react";
import Link from "next/link";

interface UploadGuideStepProps {
  onNext: () => void;
  onSkip: () => void;
  onUseSample?: () => void;
}

export function UploadGuideStep({
  onNext,
  onSkip,
  onUseSample,
}: UploadGuideStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="text-6xl mb-6">📥</div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        첫 이력서를 올려볼까요?
      </h2>

      <p className="text-gray-600 mb-8">
        이력서 파일을 드래그 & 드롭하거나 클릭해서 선택하세요
      </p>

      {/* Upload Zone Preview */}
      <div className="w-full max-w-md mb-6">
        <Link href="/upload">
          <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-medium text-gray-700 group-hover:text-primary mb-1">
                여기에 파일을 드래그 & 드롭
              </p>
              <p className="text-xs text-gray-500">
                HWP, PDF, DOCX 모두 지원
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Supported Formats */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {["HWP", "PDF", "DOCX"].map((format) => (
          <div
            key={format}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-600"
          >
            <FileText className="w-3 h-3" />
            {format}
          </div>
        ))}
      </div>

      {/* Tip */}
      <div className="w-full max-w-md p-4 rounded-xl bg-amber-50 border border-amber-100 mb-8">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 text-left">
            <strong>Tip:</strong> 여러 파일을 한 번에 올릴 수 있어요. 최대 50MB, 50페이지까지 지원합니다.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        {onUseSample && (
          <Button variant="outline" onClick={onUseSample} className="flex-1">
            샘플 이력서로 체험
          </Button>
        )}
        <Button variant="outline" onClick={onSkip} className="flex-1">
          건너뛰기
        </Button>
        <Button asChild className="flex-1">
          <Link href="/upload">
            업로드 페이지로 이동 →
          </Link>
        </Button>
      </div>
    </div>
  );
}
