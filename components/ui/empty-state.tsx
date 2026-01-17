"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

type EmptyStateVariant =
  | "search-results"
  | "saved-searches"
  | "candidates"
  | "positions"
  | "generic";

interface CTAButton {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  cta?: CTAButton;
  className?: string;
  children?: ReactNode;
}

// ─────────────────────────────────────────────────
// SVG Illustrations
// ─────────────────────────────────────────────────

function SearchIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background circle */}
      <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
      {/* Magnifying glass circle */}
      <circle cx="52" cy="52" r="22" stroke="#2563EB" strokeWidth="4" fill="white" />
      {/* Search handle */}
      <line x1="68" y1="68" x2="85" y2="85" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
      {/* Document lines inside */}
      <rect x="42" y="45" width="20" height="3" rx="1.5" fill="#E5E7EB" />
      <rect x="42" y="52" width="14" height="3" rx="1.5" fill="#E5E7EB" />
      {/* Decorative dots */}
      <circle cx="90" cy="35" r="4" fill="#DBEAFE" />
      <circle cx="25" cy="75" r="3" fill="#DBEAFE" />
    </svg>
  );
}

function CandidatesIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
      {/* Main person */}
      <circle cx="60" cy="45" r="14" fill="#2563EB" />
      <path d="M38 82C38 69.85 47.85 60 60 60C72.15 60 82 69.85 82 82" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" fill="white" />
      {/* Left person (smaller) */}
      <circle cx="32" cy="50" r="8" fill="#93C5FD" />
      <path d="M20 70C20 63.37 25.37 58 32 58" stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
      {/* Right person (smaller) */}
      <circle cx="88" cy="50" r="8" fill="#93C5FD" />
      <path d="M100 70C100 63.37 94.63 58 88 58" stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
      {/* Plus sign */}
      <circle cx="95" cy="85" r="12" fill="#2563EB" />
      <line x1="95" y1="80" x2="95" y2="90" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="85" x2="100" y2="85" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PositionsIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
      {/* Briefcase */}
      <rect x="32" y="45" width="56" height="40" rx="6" fill="white" stroke="#2563EB" strokeWidth="3" />
      <path d="M45 45V38C45 34.69 47.69 32 51 32H69C72.31 32 75 34.69 75 38V45" stroke="#2563EB" strokeWidth="3" />
      {/* Center clasp */}
      <rect x="52" y="58" width="16" height="10" rx="2" fill="#2563EB" />
      {/* Document icons */}
      <rect x="80" y="30" width="20" height="24" rx="2" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1.5" />
      <line x1="84" y1="36" x2="96" y2="36" stroke="#93C5FD" strokeWidth="1.5" />
      <line x1="84" y1="42" x2="92" y2="42" stroke="#93C5FD" strokeWidth="1.5" />
      {/* Decorative */}
      <circle cx="25" cy="70" r="4" fill="#DBEAFE" />
    </svg>
  );
}

function SavedSearchIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
      {/* Bookmark shape */}
      <path d="M40 30H80V90L60 75L40 90V30Z" fill="white" stroke="#2563EB" strokeWidth="3" strokeLinejoin="round" />
      {/* Star inside */}
      <path d="M60 45L63.09 54.26H72.94L65.17 60.04L68.26 69.3L60 63.52L51.74 69.3L54.83 60.04L47.06 54.26H56.91L60 45Z" fill="#FBBF24" />
      {/* Decorative */}
      <circle cx="90" cy="40" r="5" fill="#DBEAFE" />
      <circle cx="28" cy="55" r="3" fill="#DBEAFE" />
    </svg>
  );
}

function GenericIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <circle cx="60" cy="60" r="50" fill="#F3F4F6" />
      {/* Empty box */}
      <rect x="35" y="40" width="50" height="45" rx="4" fill="white" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="6 3" />
      {/* Folder tab */}
      <path d="M35 48V44C35 41.79 36.79 40 39 40H50L55 45H81C83.21 45 85 46.79 85 49V48" stroke="#9CA3AF" strokeWidth="2" />
      {/* Question mark */}
      <text x="60" y="72" textAnchor="middle" fontSize="24" fill="#9CA3AF" fontWeight="500">?</text>
    </svg>
  );
}

const illustrations: Record<EmptyStateVariant, () => React.ReactElement> = {
  "search-results": SearchIllustration,
  "saved-searches": SavedSearchIllustration,
  candidates: CandidatesIllustration,
  positions: PositionsIllustration,
  generic: GenericIllustration,
};

// ─────────────────────────────────────────────────
// Variant Configs
// ─────────────────────────────────────────────────

const variantConfigs: Record<
  EmptyStateVariant,
  {
    defaultTitle: string;
    defaultDescription: string;
  }
> = {
  "search-results": {
    defaultTitle: "검색 결과가 없습니다",
    defaultDescription: "다른 조건으로 검색해보세요. 필터를 조정하거나 검색어를 변경하면 더 많은 결과를 찾을 수 있습니다.",
  },
  "saved-searches": {
    defaultTitle: "저장된 검색이 없습니다",
    defaultDescription: "자주 사용하는 검색 조건을 저장해보세요. 검색 후 저장 버튼을 클릭하면 빠르게 재사용할 수 있습니다.",
  },
  candidates: {
    defaultTitle: "후보자가 없습니다",
    defaultDescription: "이력서를 업로드하여 후보자 풀을 구축해보세요.",
  },
  positions: {
    defaultTitle: "포지션이 없습니다",
    defaultDescription: "새 포지션을 등록하여 후보자 매칭을 시작해보세요.",
  },
  generic: {
    defaultTitle: "데이터가 없습니다",
    defaultDescription: "표시할 데이터가 없습니다.",
  },
};

// ─────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────

export function EmptyState({
  variant,
  title,
  description,
  cta,
  className = "",
  children,
}: EmptyStateProps) {
  const config = variantConfigs[variant];
  const Illustration = illustrations[variant];

  const displayTitle = title || config.defaultTitle;
  const displayDescription = description || config.defaultDescription;

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {/* Illustration */}
      <div className="mb-6">
        <Illustration />
      </div>

      {/* Text */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
        {displayTitle}
      </h3>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
        {displayDescription}
      </p>

      {/* CTA Button */}
      {cta && (
        cta.href ? (
          <Link
            href={cta.href}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary/90 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            {variant === "candidates" || variant === "positions" ? (
              <Plus className="w-4 h-4" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {cta.label}
          </Link>
        ) : (
          <button
            onClick={cta.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary/90 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            {variant === "candidates" || variant === "positions" ? (
              <Plus className="w-4 h-4" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {cta.label}
          </button>
        )
      )}

      {/* Custom content */}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Skeleton Components (Updated for light theme)
// ─────────────────────────────────────────────────

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white border border-gray-100 p-4 animate-pulse"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gray-100" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="w-16 h-8 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex gap-4 animate-pulse">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-4 bg-gray-100 rounded"
            style={{ width: `${100 / cols}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="px-4 py-4 border-b border-gray-50 last:border-b-0 flex gap-4 animate-pulse"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-4 bg-gray-100 rounded"
              style={{ width: `${100 / cols}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 animate-pulse"
        >
          <div className="w-8 h-8 rounded-full bg-gray-100" />
          <div className="flex-1">
            <div className="h-4 bg-gray-100 rounded w-2/3 mb-1" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-white border border-gray-100 animate-pulse"
        >
          <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-6 bg-gray-100 rounded w-2/3" />
        </div>
      ))}
    </>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8 pb-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 bg-gray-100 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-64" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCardSkeleton count={4} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1 */}
        <div className="p-6 rounded-xl bg-white border border-gray-100">
          <div className="h-5 bg-gray-100 rounded w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 bg-gray-100 rounded w-16" />
                <div className="flex-1 h-6 bg-gray-100 rounded" style={{ width: `${80 - i * 12}%` }} />
              </div>
            ))}
          </div>
        </div>
        {/* Chart 2 */}
        <div className="p-6 rounded-xl bg-white border border-gray-100">
          <div className="h-5 bg-gray-100 rounded w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 bg-gray-100 rounded w-20" />
                <div className="flex-1 h-6 bg-gray-100 rounded" style={{ width: `${70 - i * 10}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 bg-gray-100 rounded w-32 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-48" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100 pb-2">
        <div className="h-10 bg-gray-100 rounded-lg w-24" />
        <div className="h-10 bg-gray-100 rounded-lg w-20" />
      </div>

      {/* Form Fields */}
      <div className="p-6 rounded-xl bg-white border border-gray-100 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
            <div className="h-10 bg-gray-100 rounded w-full" />
          </div>
        ))}
        <div className="h-10 bg-gray-100 rounded w-32" />
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back Button */}
      <div className="h-4 bg-gray-100 rounded w-20" />

      {/* Header Card */}
      <div className="p-6 rounded-xl bg-white border border-gray-100">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-gray-100" />
          <div className="flex-1">
            <div className="h-6 bg-gray-100 rounded w-48 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
            <div className="flex gap-2">
              <div className="h-6 bg-gray-100 rounded-full w-16" />
              <div className="h-6 bg-gray-100 rounded-full w-20" />
              <div className="h-6 bg-gray-100 rounded-full w-14" />
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 rounded-xl bg-white border border-gray-100">
            <div className="h-5 bg-gray-100 rounded w-24 mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
              <div className="h-4 bg-gray-100 rounded w-4/6" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="p-6 rounded-xl bg-white border border-gray-100">
            <div className="h-5 bg-gray-100 rounded w-20 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 bg-gray-100 rounded w-16" />
                  <div className="h-4 bg-gray-100 rounded w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
