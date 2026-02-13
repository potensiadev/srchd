"use client";

/**
 * 온보딩 Step 3: 검색 체험 가이드
 * PRD v0.1 Section 14.2
 */

import { Button } from "@/components/ui/button";
import { Search, Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";

interface SearchGuideStepProps {
  suggestedQuery?: string;
  onNext: () => void;
  onSkip: () => void;
}

const EXAMPLE_QUERIES = [
  "Java 백엔드 5년차",
  "결제 도메인 경력 3년 이상",
  "React",
  "PM",
];

export function SearchGuideStep({
  suggestedQuery,
  onNext,
  onSkip,
}: SearchGuideStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="text-6xl mb-6">🔍</div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        이제 검색해볼까요?
      </h2>

      <p className="text-gray-600 mb-8">
        분석된 후보자를 다양한 방식으로 검색해보세요
      </p>

      {/* Search Bar Preview */}
      <div className="w-full max-w-md mb-6">
        <Link href="/candidates">
          <div className="relative group">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-primary hover:shadow-md transition-all cursor-pointer">
              <Search className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
              <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                {suggestedQuery || "검색어를 입력하세요..."}
              </span>
              <div className="ml-auto px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-500">
                Enter
              </div>
            </div>
            {/* Pulse Animation */}
            <div className="absolute inset-0 rounded-xl ring-2 ring-primary/30 animate-pulse pointer-events-none" />
          </div>
        </Link>
      </div>

      {/* Example Queries */}
      <div className="w-full max-w-md mb-6">
        <p className="text-xs text-gray-500 mb-3">예시 검색어:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_QUERIES.map((query) => (
            <Link
              key={query}
              href={`/candidates?q=${encodeURIComponent(query)}`}
              className="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-primary/10 hover:text-primary text-sm text-gray-600 transition-colors"
            >
              {query}
            </Link>
          ))}
        </div>
      </div>

      {/* Search Types Info */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gray-50 text-left">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">키워드 검색</span>
          </div>
          <p className="text-xs text-gray-500">
            스킬, 회사명, 직급 등 짧은 키워드
          </p>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 text-left">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-gray-700">AI 검색</span>
          </div>
          <p className="text-xs text-gray-500">
            자연어 문장으로 시맨틱 검색
          </p>
        </div>
      </div>

      {/* Tip */}
      <div className="w-full max-w-md p-4 rounded-xl bg-blue-50 border border-blue-100 mb-8">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 text-left">
            <strong>Tip:</strong> 10자 이하는 키워드 검색, 10자 초과는 AI 시맨틱 검색이 자동 적용됩니다.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 w-full max-w-md">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          건너뛰기
        </Button>
        <Button asChild className="flex-1">
          <Link href="/candidates">
            검색 페이지로 이동 →
          </Link>
        </Button>
      </div>
    </div>
  );
}
