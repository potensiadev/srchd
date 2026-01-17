"use client";

/**
 * ProcessingCard - 처리 중인 후보자 카드
 *
 * Progressive Data Loading:
 * - processing: 분석 준비 중 (프로그레스 10%)
 * - parsed: 기본 정보 추출 완료 (프로그레스 40%)
 * - analyzed: AI 분석 완료 (프로그레스 80%)
 * - completed: 전체 완료 (프로그레스 100%)
 */

import { motion } from "framer-motion";
import { Loader2, User, Building2, Phone, Mail, Briefcase } from "lucide-react";
import type { CandidateStatus, QuickExtractedData } from "@/types";

interface ProcessingCardProps {
  candidate: {
    id: string;
    status: CandidateStatus;
    name?: string;
    last_company?: string;
    last_position?: string;
    quick_extracted?: QuickExtractedData;
    created_at: string;
  };
}

const STATUS_CONFIG = {
  processing: {
    label: "분석 준비 중...",
    progress: 10,
    color: "from-gray-500 to-gray-400",
  },
  parsed: {
    label: "기본 정보 추출 완료",
    progress: 40,
    color: "from-blue-500 to-blue-400",
  },
  analyzed: {
    label: "AI 분석 완료",
    progress: 80,
    color: "from-purple-500 to-purple-400",
  },
  completed: {
    label: "완료",
    progress: 100,
    color: "from-emerald-500 to-emerald-400",
  },
  failed: {
    label: "처리 실패",
    progress: 0,
    color: "from-red-500 to-red-400",
  },
  rejected: {
    label: "거부됨",
    progress: 0,
    color: "from-orange-500 to-orange-400",
  },
} as const;

export default function ProcessingCard({ candidate }: ProcessingCardProps) {
  const config =
    STATUS_CONFIG[candidate.status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.processing;

  // quick_extracted 또는 메인 필드에서 데이터 추출
  const quickData = candidate.quick_extracted;
  const displayName = quickData?.name || candidate.name;
  const displayCompany = quickData?.last_company || candidate.last_company;
  const displayPosition = quickData?.last_position || candidate.last_position;
  const displayPhone = quickData?.phone;
  const displayEmail = quickData?.email;

  // 표시할 정보가 있는지 확인
  const hasBasicInfo =
    candidate.status !== "processing" &&
    (displayName || displayCompany || displayPosition);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative p-5 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* Animated Background Glow - Subtler for Light Mode */}
      <motion.div
        className="absolute inset-0 opacity-10"
        animate={{
          background: [
            "radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)",
            "radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.2) 0%, transparent 50%)",
            "radial-gradient(circle at 0% 100%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)",
            "radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />

      {/* Progress Bar */}
      <div className="relative h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${config.progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full bg-gradient-to-r ${config.color} rounded-full`}
        />
        {/* Shimmer Effect */}
        {candidate.status !== "completed" &&
          candidate.status !== "failed" &&
          candidate.status !== "rejected" && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          )}
      </div>

      {/* Status Indicator */}
      <div className="relative flex items-center gap-2 mb-4">
        {candidate.status !== "completed" &&
          candidate.status !== "failed" &&
          candidate.status !== "rejected" ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : (
          <div
            className={`w-2 h-2 rounded-full ${candidate.status === "completed"
                ? "bg-emerald-500"
                : "bg-red-500"
              }`}
          />
        )}
        <span className="text-sm font-medium text-gray-700">
          {config.label}
        </span>
        <span className="ml-auto text-xs text-gray-500">
          {config.progress}%
        </span>
      </div>

      {/* Basic Info (Phase 1 이후 표시) */}
      {hasBasicInfo && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 }}
          className="relative space-y-3 pt-3 border-t border-gray-100"
        >
          {/* Name */}
          {displayName && (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50">
                <User size={14} className="text-gray-400" />
              </div>
              <span className="text-base font-semibold text-gray-900">
                {displayName}
              </span>
            </div>
          )}

          {/* Company & Position */}
          {(displayCompany || displayPosition) && (
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50">
                <Building2 size={14} className="text-gray-400" />
              </div>
              <div className="flex flex-col">
                {displayCompany && (
                  <span className="text-sm text-gray-700">{displayCompany}</span>
                )}
                {displayPosition && (
                  <span className="text-xs text-gray-500">{displayPosition}</span>
                )}
              </div>
            </div>
          )}

          {/* Contact Info (parsed 단계에서 표시) */}
          {(displayPhone || displayEmail) && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {displayPhone && (
                <div className="flex items-center gap-1">
                  <Phone size={12} />
                  <span>{displayPhone}</span>
                </div>
              )}
              {displayEmail && (
                <div className="flex items-center gap-1">
                  <Mail size={12} />
                  <span>{displayEmail}</span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Processing Message (정보 없을 때) */}
      {!hasBasicInfo && (
        <div className="relative flex items-center gap-3 text-gray-400">
          <Briefcase size={14} />
          <span className="text-sm">이력서 분석 중...</span>
        </div>
      )}

      {/* Time Indicator */}
      <div className="relative mt-4 text-xs text-gray-400">
        {new Date(candidate.created_at).toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </motion.div>
  );
}
