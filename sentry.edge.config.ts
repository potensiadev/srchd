/**
 * Sentry Edge Runtime Configuration
 *
 * Edge 함수에서 발생하는 에러를 추적합니다.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 환경 설정
  environment: process.env.NODE_ENV,

  // 트레이스 샘플링 비율
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // 디버그 모드 (개발 환경에서만)
  debug: process.env.NODE_ENV === "development",

  // 민감한 데이터 필터링
  beforeSend(event) {
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    return event;
  },
});
