/**
 * Refund Request Modal Component
 *
 * PRD: prd_refund_policy_v0.4.md Section 8
 * QA: refund_policy_test_scenarios_v1.0.md (UI-001 ~ UI-010)
 *
 * 환불 신청 모달
 * - 환불 예상 금액 미리보기
 * - 환불 사유 선택
 * - 확인 후 환불 처리
 */

"use client";

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Calendar,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RefundPreview {
  eligible: boolean;
  refundAmount: number;
  originalAmount: number;
  remainingDays: number;
  totalDays: number;
  usageRate: number;
  adjustmentFactor: number;
  usedCreditsCost: number;
  isFullRefundEligible: boolean;
  rejectionReason?: string;
  currency: string;
}

interface RefundRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  plan: string;
}

const REFUND_REASONS = [
  { value: "not_using", label: "서비스를 더 이상 사용하지 않음" },
  { value: "too_expensive", label: "가격이 너무 비쌈" },
  { value: "missing_features", label: "필요한 기능이 없음" },
  { value: "found_alternative", label: "대안 서비스를 찾음" },
  { value: "quality_issues", label: "분석 품질에 만족하지 못함" },
  { value: "other", label: "기타" },
];

export function RefundRequestModal({
  isOpen,
  onClose,
  onSuccess,
  plan,
}: RefundRequestModalProps) {
  const [step, setStep] = useState<"preview" | "confirm" | "processing" | "success" | "error">("preview");
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [error, setError] = useState("");
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);

  // 환불 미리보기 조회
  useEffect(() => {
    if (isOpen && step === "preview") {
      fetchRefundPreview();
    }
  }, [isOpen, step]);

  // 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setStep("preview");
      setPreview(null);
      setSelectedReason("");
      setOtherReason("");
      setError("");
      setCancelAtPeriodEnd(true);
    }
  }, [isOpen]);

  const fetchRefundPreview = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "GET",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "환불 정보를 가져올 수 없습니다.");
      }

      const { data } = await response.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      setError("환불 사유를 선택해주세요.");
      return;
    }

    setStep("processing");
    setError("");

    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: selectedReason === "other" ? otherReason : selectedReason,
          cancelAtPeriodEnd,
          requestRefund: !cancelAtPeriodEnd, // 즉시 취소 시에만 환불 요청
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "환불 처리에 실패했습니다.");
      }

      setStep("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setStep("error");
    }
  };

  if (!isOpen) return null;

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "KRW") {
      return `₩${amount.toLocaleString()}`;
    }
    return `$${(amount / 100).toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-white/10 rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">
            {step === "success" ? "환불 신청 완료" : "구독 취소 및 환불"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="mt-4 text-gray-400">환불 정보를 불러오는 중...</p>
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && !isLoading && preview && (
            <div className="space-y-6">
              {/* Refund Info */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">현재 플랜</p>
                    <p className="font-semibold text-white capitalize">{plan}</p>
                  </div>
                </div>

                <hr className="border-white/10" />

                {preview.eligible ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-400">남은 기간</p>
                          <p className="text-white">
                            {preview.remainingDays}일 / {preview.totalDays}일
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-400">사용률</p>
                          <p className="text-white">
                            {(preview.usageRate * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <hr className="border-white/10" />

                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">결제 금액</span>
                      <span className="text-white">
                        {formatCurrency(preview.originalAmount, preview.currency)}
                      </span>
                    </div>
                    {preview.usedCreditsCost > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">사용 크레딧 비용</span>
                        <span className="text-red-400">
                          -{formatCurrency(preview.usedCreditsCost, preview.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-lg font-semibold">
                      <span className="text-white">예상 환불 금액</span>
                      <span className="text-primary">
                        {formatCurrency(preview.refundAmount, preview.currency)}
                      </span>
                    </div>

                    {preview.isFullRefundEligible && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-sm text-green-400">
                          결제일로부터 14일 이내로 전액 환불 대상입니다.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    <span className="text-sm text-yellow-400">
                      {preview.rejectionReason === "refund_period_expired_14_days"
                        ? "결제일로부터 14일이 경과하여 환불이 불가능합니다."
                        : "현재 환불 대상이 아닙니다."}
                    </span>
                  </div>
                )}
              </div>

              {/* Cancel Options */}
              <div className="space-y-3">
                <p className="font-medium text-white">취소 옵션</p>
                <label className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:border-primary/50 transition-colors">
                  <input
                    type="radio"
                    name="cancelOption"
                    checked={cancelAtPeriodEnd}
                    onChange={() => setCancelAtPeriodEnd(true)}
                    className="mt-1 accent-primary"
                  />
                  <div>
                    <p className="font-medium text-white">기간 종료 시 취소</p>
                    <p className="text-sm text-gray-400">
                      현재 결제 기간이 끝날 때까지 서비스를 이용할 수 있습니다.
                      환불은 없습니다.
                    </p>
                  </div>
                </label>
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:border-primary/50 transition-colors",
                    !preview.eligible && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input
                    type="radio"
                    name="cancelOption"
                    checked={!cancelAtPeriodEnd}
                    onChange={() => preview.eligible && setCancelAtPeriodEnd(false)}
                    disabled={!preview.eligible}
                    className="mt-1 accent-primary"
                  />
                  <div>
                    <p className="font-medium text-white">즉시 취소 (환불)</p>
                    <p className="text-sm text-gray-400">
                      서비스가 즉시 중단되고 비례 환불이 처리됩니다.
                      {preview.eligible && (
                        <span className="text-primary">
                          {" "}
                          ({formatCurrency(preview.refundAmount, preview.currency)})
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              </div>

              {/* Reason Selection */}
              <div className="space-y-3">
                <p className="font-medium text-white">취소 사유</p>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10
                           text-white focus:outline-none focus:border-primary/50"
                >
                  <option value="">사유를 선택해주세요</option>
                  {REFUND_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
                {selectedReason === "other" && (
                  <textarea
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                    placeholder="취소 사유를 입력해주세요"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10
                             text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50
                             resize-none h-24"
                  />
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20
                           text-white font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => setStep("confirm")}
                  disabled={!selectedReason}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600
                           text-white font-medium transition-colors disabled:opacity-50"
                >
                  구독 취소
                </button>
              </div>
            </div>
          )}

          {/* Confirm Step */}
          {step === "confirm" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center py-4">
                <AlertTriangle className="w-16 h-16 text-yellow-400" />
                <h3 className="mt-4 text-lg font-semibold text-white">
                  정말 구독을 취소하시겠습니까?
                </h3>
                <p className="mt-2 text-gray-400">
                  {cancelAtPeriodEnd
                    ? "결제 기간 종료 후 구독이 자동으로 취소됩니다."
                    : "즉시 구독이 취소되고 서비스 이용이 중단됩니다."}
                </p>
                {!cancelAtPeriodEnd && preview && (
                  <p className="mt-2 text-primary font-semibold">
                    환불 예정 금액: {formatCurrency(preview.refundAmount, preview.currency)}
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("preview")}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20
                           text-white font-medium transition-colors"
                >
                  돌아가기
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600
                           text-white font-medium transition-colors"
                >
                  취소 확인
                </button>
              </div>
            </div>
          )}

          {/* Processing Step */}
          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="mt-4 text-white font-medium">처리 중...</p>
              <p className="mt-2 text-gray-400">잠시만 기다려주세요.</p>
            </div>
          )}

          {/* Success Step */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <p className="mt-4 text-white font-medium">
                {cancelAtPeriodEnd ? "구독 취소 예약 완료" : "구독 취소 및 환불 신청 완료"}
              </p>
              <p className="mt-2 text-gray-400 text-center">
                {cancelAtPeriodEnd
                  ? "결제 기간 종료 후 구독이 자동으로 취소됩니다."
                  : "환불은 영업일 기준 3-5일 내에 처리됩니다."}
              </p>
            </div>
          )}

          {/* Error Step */}
          {step === "error" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-10 h-10 text-red-400" />
                </div>
                <p className="mt-4 text-white font-medium">오류가 발생했습니다</p>
                <p className="mt-2 text-gray-400">{error}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("preview")}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20
                           text-white font-medium transition-colors"
                >
                  돌아가기
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600
                           text-white font-medium transition-colors"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {/* Initial Error */}
          {step === "preview" && !isLoading && !preview && error && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-10 h-10 text-red-400" />
                </div>
                <p className="mt-4 text-white font-medium">정보를 불러올 수 없습니다</p>
                <p className="mt-2 text-gray-400">{error}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20
                           text-white font-medium transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={fetchRefundPreview}
                  className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary/90
                           text-white font-medium transition-colors"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
