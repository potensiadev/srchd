"use client";

import { useState, useCallback } from "react";

interface UseBulkRetryOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UseBulkRetryResult {
  isRetrying: boolean;
  retryOne: (candidateId: string) => Promise<boolean>;
  retryBulk: (candidateIds: string[]) => Promise<void>;
}

export function useBulkRetry({
  onSuccess,
  onError,
}: UseBulkRetryOptions = {}): UseBulkRetryResult {
  const [isRetrying, setIsRetrying] = useState(false);

  const retryOne = useCallback(async (candidateId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/candidates/${candidateId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
        }

        const errorMessage = errorData?.error?.message || "재시도에 실패했습니다.";
        console.error("[Retry] Failed:", errorMessage);
        return false;
      }

      console.log("[Retry] Success, waiting for Realtime update...");
      return true;
    } catch (error) {
      console.error("[Retry] Network error:", error);
      return false;
    }
  }, []);

  const retryBulk = useCallback(
    async (candidateIds: string[]): Promise<void> => {
      if (candidateIds.length === 0 || isRetrying) return;

      setIsRetrying(true);
      try {
        const response = await fetch("/api/candidates/bulk-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds }),
        });

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
          }

          const message = errorData?.error?.message || "일괄 재시도 실패";
          console.error("[Bulk Retry] Failed:", message);
          onError?.(message);
          return;
        }

        const result = await response.json();
        console.log("[Bulk Retry] Success:", result.data?.summary);
        onSuccess?.();
      } catch (error) {
        console.error("[Bulk Retry] Network error:", error);
        onError?.("네트워크 오류");
      } finally {
        setIsRetrying(false);
      }
    },
    [isRetrying, onSuccess, onError]
  );

  return {
    isRetrying,
    retryOne,
    retryBulk,
  };
}
