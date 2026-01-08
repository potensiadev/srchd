/**
 * Sentry Client-side Configuration
 *
 * 브라우저에서 발생하는 에러를 추적합니다.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 환경 설정
  environment: process.env.NODE_ENV,

  // 트레이스 샘플링 비율 (프로덕션에서는 10%)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // 리플레이 샘플링 (세션 리플레이)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // 디버그 모드 (개발 환경에서만)
  debug: process.env.NODE_ENV === "development",

  // 무시할 에러 패턴
  ignoreErrors: [
    // 네트워크 에러 (일시적)
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    // 브라우저 확장 에러
    "Non-Error exception captured",
    // 취소된 요청
    "AbortError",
    // ResizeObserver 에러 (브라우저 버그)
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],

  // 민감한 데이터 필터링
  beforeSend(event) {
    // URL에서 민감한 정보 제거
    if (event.request?.url) {
      const url = new URL(event.request.url);
      url.searchParams.delete("token");
      url.searchParams.delete("access_token");
      event.request.url = url.toString();
    }

    // 개발 환경에서는 콘솔에만 출력
    if (process.env.NODE_ENV === "development") {
      console.error("[Sentry]", event);
      return null; // 개발 환경에서는 Sentry로 전송하지 않음
    }

    return event;
  },

  // 인테그레이션 설정
  integrations: [
    Sentry.replayIntegration({
      // 민감한 요소 마스킹
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
