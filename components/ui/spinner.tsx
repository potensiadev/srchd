"use client";

import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-3",
  xl: "w-12 h-12 border-4",
};

/**
 * 로딩 스피너 컴포넌트
 */
export function Spinner({ size = "md", className, label }: SpinnerProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-primary/30 border-t-primary",
          sizeClasses[size]
        )}
        role="status"
        aria-label={label || "Loading"}
      />
      {label && <span className="text-sm text-gray-400">{label}</span>}
    </div>
  );
}

/**
 * 전체 화면 로딩 오버레이
 */
export function LoadingOverlay({
  message = "로딩 중...",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-dark-bg/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
        <p className="text-sm text-gray-300">{message}</p>
      </div>
    </div>
  );
}

/**
 * 버튼 내 로딩 스피너 (버튼 크기에 맞춤)
 */
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * 인라인 로딩 상태 (텍스트 옆에 표시)
 */
export function InlineLoader({
  text = "처리 중...",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-gray-400", className)}>
      <Spinner size="sm" />
      <span>{text}</span>
    </div>
  );
}
