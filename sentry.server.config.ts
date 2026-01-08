/**
 * Sentry Server-side Configuration
 *
 * 서버에서 발생하는 에러를 추적합니다.
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

  // 무시할 에러
  ignoreErrors: [
    // Supabase 인증 에러 (정상적인 플로우)
    "Invalid login credentials",
    "Email not confirmed",
    // Next.js 라우팅 에러
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],

  // 민감한 데이터 필터링
  beforeSend(event) {
    // 요청 헤더에서 인증 정보 제거
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }

    // 개발 환경에서는 콘솔에만 출력
    if (process.env.NODE_ENV === "development") {
      console.error("[Sentry Server]", event.exception?.values?.[0]?.value);
      return null;
    }

    return event;
  },

  // 서버 전용 인테그레이션
  integrations: [],
});
