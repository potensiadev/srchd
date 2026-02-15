"use client";

import { useEffect } from "react";

/**
 * 이전 배포에서 등록된 Service Worker/Cache를 정리해
 * 제거된 오프라인 배너가 계속 노출되는 현상을 방지한다.
 */
export function DisableLegacyOfflineNotice() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const cleanupLegacyOfflineArtifacts = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if (!("caches" in window)) {
        return;
      }

      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    };

    void cleanupLegacyOfflineArtifacts();
  }, []);

  return null;
}
