"use client";

/**
 * Global Error Boundary
 *
 * 전역 에러를 캐치하고 Sentry에 보고합니다.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry에 에러 보고
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              문제가 발생했습니다
            </h1>
            <p className="text-gray-600 mb-6">
              예기치 않은 오류가 발생했습니다. 문제가 지속되면 관리자에게 문의해주세요.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
