/**
 * Refund History Component
 *
 * PRD: prd_refund_policy_v0.4.md Section 8
 * QA: refund_policy_test_scenarios_v1.0.md (UI-011 ~ UI-020)
 *
 * 환불 내역 표시
 * - 품질 환불 내역
 * - 구독 환불 내역
 * - 장애 보상 내역
 */

"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RefundRecord {
  id: string;
  type: "quality" | "subscription" | "incident";
  status: "pending" | "processing" | "completed" | "failed";
  amount: number | null;
  creditsRefunded: number | null;
  reason: string;
  createdAt: string;
  processedAt: string | null;
  metadata?: Record<string, unknown>;
}

interface RefundHistoryProps {
  className?: string;
}

export function RefundHistory({ className }: RefundHistoryProps) {
  const [records, setRecords] = useState<RefundRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/refunds/history");

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "내역을 불러올 수 없습니다.");
      }

      const { data } = await response.json();
      setRecords(data.records || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: RefundRecord["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case "pending":
      case "processing":
        return <Clock className="w-5 h-5 text-yellow-400" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusLabel = (status: RefundRecord["status"]) => {
    switch (status) {
      case "completed":
        return "완료";
      case "pending":
        return "대기 중";
      case "processing":
        return "처리 중";
      case "failed":
        return "실패";
    }
  };

  const getTypeLabel = (type: RefundRecord["type"]) => {
    switch (type) {
      case "quality":
        return "품질 환불";
      case "subscription":
        return "구독 환불";
      case "incident":
        return "장애 보상";
    }
  };

  const getTypeBadgeColor = (type: RefundRecord["type"]) => {
    switch (type) {
      case "quality":
        return "bg-blue-500/20 text-blue-400";
      case "subscription":
        return "bg-purple-500/20 text-purple-400";
      case "incident":
        return "bg-orange-500/20 text-orange-400";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return `₩${amount.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20
                   text-white text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          다시 시도
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className={cn("text-center py-12 text-gray-400", className)}>
        환불 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">환불/보상 내역</h3>
        <button
          onClick={fetchHistory}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="space-y-2">
        {records.map((record) => (
          <div
            key={record.id}
            className="rounded-xl bg-white/5 border border-white/10 overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                {getStatusIcon(record.status)}
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        getTypeBadgeColor(record.type)
                      )}
                    >
                      {getTypeLabel(record.type)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(record.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white">
                    {record.type === "incident"
                      ? `장애 보상 크레딧: ${record.creditsRefunded}건`
                      : record.amount
                        ? formatCurrency(record.amount)
                        : `${record.creditsRefunded}크레딧 환불`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-sm",
                    record.status === "completed"
                      ? "text-green-400"
                      : record.status === "failed"
                        ? "text-red-400"
                        : "text-yellow-400"
                  )}
                >
                  {getStatusLabel(record.status)}
                </span>
                {expandedId === record.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded Details */}
            {expandedId === record.id && (
              <div className="px-4 pb-4 pt-0 border-t border-white/10 space-y-3">
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-400">유형</p>
                    <p className="text-sm text-white">{getTypeLabel(record.type)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">상태</p>
                    <p className="text-sm text-white">{getStatusLabel(record.status)}</p>
                  </div>
                  {record.amount && (
                    <div>
                      <p className="text-xs text-gray-400">환불 금액</p>
                      <p className="text-sm text-white">{formatCurrency(record.amount)}</p>
                    </div>
                  )}
                  {record.creditsRefunded && (
                    <div>
                      <p className="text-xs text-gray-400">환불 크레딧</p>
                      <p className="text-sm text-white">{record.creditsRefunded}건</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-400">사유</p>
                  <p className="text-sm text-white">{record.reason}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">신청일</p>
                    <p className="text-sm text-white">{formatDate(record.createdAt)}</p>
                  </div>
                  {record.processedAt && (
                    <div>
                      <p className="text-xs text-gray-400">처리일</p>
                      <p className="text-sm text-white">{formatDate(record.processedAt)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
