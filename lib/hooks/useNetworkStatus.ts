"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;  // 이전에 오프라인이었는지 (재연결 감지용)
  lastOnline: Date | null;
}

/**
 * 네트워크 상태 감지 Hook
 * - 온라인/오프라인 상태 감지
 * - 재연결 시 콜백 실행 (debounce 적용)
 * - 마지막 온라인 시간 추적
 */
export function useNetworkStatus(onReconnect?: () => void) {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    wasOffline: false,
    lastOnline: null,
  });

  // BUG-005: 중복 콜백 방지를 위한 pending timeout ref
  const pendingReconnectRef = useRef<NodeJS.Timeout | null>(null);

  const handleOnline = useCallback(() => {
    setStatus((prev) => {
      const wasActuallyOffline = !prev.isOnline;

      // 재연결 콜백 실행 (debounce 적용)
      if (wasActuallyOffline && onReconnect) {
        // BUG-005: 기존 pending timeout 취소 (중복 실행 방지)
        if (pendingReconnectRef.current) {
          clearTimeout(pendingReconnectRef.current);
        }

        // 약간의 딜레이 후 실행 (네트워크 안정화 대기)
        pendingReconnectRef.current = setTimeout(() => {
          onReconnect();
          pendingReconnectRef.current = null;
        }, 1000);
      }

      return {
        isOnline: true,
        wasOffline: wasActuallyOffline,
        lastOnline: new Date(),
      };
    });
  }, [onReconnect]);

  const handleOffline = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      isOnline: false,
    }));
  }, []);

  useEffect(() => {
    // 초기 상태 설정
    setStatus((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
      lastOnline: navigator.onLine ? new Date() : null,
    }));

    // 이벤트 리스너 등록
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      // BUG-005: cleanup pending timeout on unmount
      if (pendingReconnectRef.current) {
        clearTimeout(pendingReconnectRef.current);
      }
    };
  }, [handleOnline, handleOffline]);

  return status;
}

/**
 * 네트워크 상태에 따른 fetch wrapper
 * - 오프라인 시 에러 반환
 * - 네트워크 에러 시 자동 재시도
 */
export interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  retryDelay?: number;
  retryStatusCodes?: number[];
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryStatusCodes = [408, 429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  // 오프라인 체크
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new NetworkError("오프라인 상태입니다. 네트워크 연결을 확인해주세요.", "OFFLINE");
  }

  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const response = await fetch(url, fetchOptions);

      // 재시도 가능한 상태 코드 체크
      if (retryStatusCodes.includes(response.status) && retryCount < maxRetries) {
        retryCount++;
        await delay(retryDelay * retryCount); // 지수 백오프
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // 네트워크 에러인 경우에만 재시도
      if (isNetworkError(error) && retryCount < maxRetries) {
        retryCount++;
        await delay(retryDelay * retryCount);
        continue;
      }

      break;
    }
  }

  // 최대 재시도 횟수 초과
  throw new NetworkError(
    lastError?.message || "네트워크 오류가 발생했습니다.",
    "NETWORK_ERROR",
    { originalError: lastError, retryCount }
  );
}

/**
 * 커스텀 네트워크 에러 클래스
 */
export class NetworkError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "NetworkError";
    this.code = code;
    this.details = details;
  }
}

/**
 * 네트워크 에러 여부 확인
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // fetch 실패 시 TypeError 발생
    return error.message.includes("Failed to fetch") ||
           error.message.includes("NetworkError") ||
           error.message.includes("Network request failed");
  }
  return false;
}

/**
 * 딜레이 유틸리티
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
