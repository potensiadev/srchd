import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock NextResponse properly for testing
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(data),
      data,
    })),
  },
}));

import {
  apiSuccess,
  apiCreated,
  apiNoContent,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInsufficientCredits,
  apiConflict,
  apiRateLimitExceeded,
  apiInternalError,
  apiServiceUnavailable,
  apiFileValidationError,
  apiFileTooLarge,
  apiInvalidFileType,
} from "@/lib/api-response";

describe("API Response Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────
  // 성공 응답 테스트
  // ─────────────────────────────────────────────────

  describe("apiSuccess", () => {
    it("기본 성공 응답 생성", () => {
      const data = { id: 1, name: "test" };
      const response = apiSuccess(data);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data, meta: undefined },
        { status: 200 }
      );
    });

    it("메타데이터 포함 응답", () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = { total: 100, page: 1, limit: 10, hasMore: true };
      apiSuccess(data, meta);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data, meta },
        { status: 200 }
      );
    });

    it("커스텀 상태 코드", () => {
      apiSuccess({ status: "ok" }, undefined, 202);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        { status: 202 }
      );
    });
  });

  describe("apiCreated", () => {
    it("201 상태 코드로 응답", () => {
      const data = { id: 1 };
      apiCreated(data);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: true, data, meta: undefined },
        { status: 201 }
      );
    });
  });

  describe("apiNoContent", () => {
    it("빈 성공 응답", () => {
      apiNoContent();

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });
  });

  // ─────────────────────────────────────────────────
  // 에러 응답 테스트
  // ─────────────────────────────────────────────────

  describe("apiError", () => {
    it("기본 에러 응답 생성", () => {
      apiError("BAD_REQUEST", "잘못된 요청", 400);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "잘못된 요청",
            details: undefined,
          },
        },
        { status: 400 }
      );
    });

    it("상세 정보 포함 에러", () => {
      apiError("VALIDATION_ERROR", "검증 실패", 400, { field: "email" });

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "검증 실패",
            details: { field: "email" },
          },
        },
        { status: 400 }
      );
    });
  });

  describe("apiBadRequest", () => {
    it("기본 메시지", () => {
      apiBadRequest();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "BAD_REQUEST",
            message: "잘못된 요청입니다.",
          }),
        }),
        { status: 400 }
      );
    });

    it("커스텀 메시지", () => {
      apiBadRequest("파일이 누락되었습니다.");

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: "파일이 누락되었습니다.",
          }),
        }),
        { status: 400 }
      );
    });
  });

  describe("apiUnauthorized", () => {
    it("401 상태 코드", () => {
      apiUnauthorized();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "UNAUTHORIZED",
          }),
        }),
        { status: 401 }
      );
    });
  });

  describe("apiForbidden", () => {
    it("403 상태 코드", () => {
      apiForbidden();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "FORBIDDEN",
          }),
        }),
        { status: 403 }
      );
    });
  });

  describe("apiNotFound", () => {
    it("404 상태 코드", () => {
      apiNotFound("후보자를 찾을 수 없습니다.");

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "NOT_FOUND",
            message: "후보자를 찾을 수 없습니다.",
          }),
        }),
        { status: 404 }
      );
    });
  });

  describe("apiInsufficientCredits", () => {
    it("402 상태 코드", () => {
      apiInsufficientCredits();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "INSUFFICIENT_CREDITS",
          }),
        }),
        { status: 402 }
      );
    });
  });

  describe("apiConflict", () => {
    it("409 상태 코드", () => {
      apiConflict("이미 존재하는 후보자입니다.");

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "CONFLICT",
            message: "이미 존재하는 후보자입니다.",
          }),
        }),
        { status: 409 }
      );
    });
  });

  describe("apiRateLimitExceeded", () => {
    it("429 상태 코드", () => {
      apiRateLimitExceeded();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "RATE_LIMIT_EXCEEDED",
          }),
        }),
        { status: 429 }
      );
    });

    it("retryAfter 포함", () => {
      apiRateLimitExceeded("너무 많은 요청", 60);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: { retryAfter: 60 },
          }),
        }),
        { status: 429 }
      );
    });
  });

  describe("apiInternalError", () => {
    it("500 상태 코드", () => {
      apiInternalError();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "INTERNAL_ERROR",
          }),
        }),
        { status: 500 }
      );
    });
  });

  describe("apiServiceUnavailable", () => {
    it("503 상태 코드", () => {
      apiServiceUnavailable();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "SERVICE_UNAVAILABLE",
          }),
        }),
        { status: 503 }
      );
    });
  });

  // ─────────────────────────────────────────────────
  // 파일 검증 에러 테스트
  // ─────────────────────────────────────────────────

  describe("apiFileValidationError", () => {
    it("파일 검증 에러", () => {
      apiFileValidationError("파일이 손상되었습니다.");

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "VALIDATION_ERROR",
            message: "파일이 손상되었습니다.",
          }),
        }),
        { status: 400 }
      );
    });
  });

  describe("apiFileTooLarge", () => {
    it("기본 크기 제한 메시지", () => {
      apiFileTooLarge();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "FILE_TOO_LARGE",
            message: "파일 크기가 50MB를 초과합니다.",
          }),
        }),
        { status: 400 }
      );
    });

    it("커스텀 크기 제한", () => {
      apiFileTooLarge(100);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: "파일 크기가 100MB를 초과합니다.",
          }),
        }),
        { status: 400 }
      );
    });
  });

  describe("apiInvalidFileType", () => {
    it("허용 타입 목록 포함", () => {
      apiInvalidFileType([".pdf", ".docx", ".hwp"]);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "INVALID_FILE_TYPE",
            message: "지원하지 않는 파일 형식입니다. 허용: .pdf, .docx, .hwp",
          }),
        }),
        { status: 400 }
      );
    });
  });
});
