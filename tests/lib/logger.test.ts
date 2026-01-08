import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, createRequestLogger, logApiError, logger } from "@/lib/logger";

describe("Logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────
  // Logger 클래스 테스트
  // ─────────────────────────────────────────────────

  describe("Logger class", () => {
    it("기본 로거 생성", () => {
      const log = new Logger();
      expect(log).toBeInstanceOf(Logger);
    });

    it("컨텍스트와 함께 생성", () => {
      const log = new Logger({ userId: "user-123" });
      log.info("테스트 메시지");

      expect(console.log).toHaveBeenCalled();
      const logOutput = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logOutput).toContain("테스트 메시지");
    });

    it("child 로거 생성", () => {
      const parentLog = new Logger({ requestId: "req-123" });
      const childLog = parentLog.child({ action: "upload" });

      childLog.info("파일 업로드");

      expect(console.log).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────
  // 로그 레벨 테스트
  // ─────────────────────────────────────────────────

  describe("Log levels", () => {
    it("info 로그", () => {
      const log = new Logger();
      log.info("정보 메시지");

      expect(console.log).toHaveBeenCalled();
    });

    it("warn 로그", () => {
      const log = new Logger();
      log.warn("경고 메시지");

      expect(console.warn).toHaveBeenCalled();
    });

    it("error 로그", () => {
      const log = new Logger();
      log.error("에러 메시지");

      expect(console.error).toHaveBeenCalled();
    });

    it("error 로그 with Error object", () => {
      const log = new Logger();
      const error = new Error("테스트 에러");
      log.error("에러 발생", error);

      expect(console.error).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────
  // 컨텍스트 테스트
  // ─────────────────────────────────────────────────

  describe("Context handling", () => {
    it("로그에 추가 컨텍스트 전달", () => {
      const log = new Logger({ requestId: "req-123" });
      log.info("액션 수행", { action: "create", duration: 100 });

      expect(console.log).toHaveBeenCalled();
    });

    it("컨텍스트 병합", () => {
      const log = new Logger({ requestId: "req-123" });
      const childLog = log.child({ userId: "user-456" });
      childLog.info("작업 완료", { candidateId: "cand-789" });

      expect(console.log).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────
  // timed 메서드 테스트
  // ─────────────────────────────────────────────────

  describe("timed method", () => {
    it("성공 시 결과 반환 및 로그", async () => {
      const log = new Logger();
      const result = await log.timed("데이터 조회", async () => {
        return { data: "test" };
      });

      expect(result).toEqual({ data: "test" });
      expect(console.log).toHaveBeenCalled();
    });

    it("실패 시 에러 throw 및 로그", async () => {
      const log = new Logger();
      const error = new Error("조회 실패");

      await expect(
        log.timed("데이터 조회", async () => {
          throw error;
        })
      ).rejects.toThrow("조회 실패");

      expect(console.error).toHaveBeenCalled();
    });

    it("실행 시간 측정", async () => {
      const log = new Logger();
      await log.timed("지연 작업", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      });

      expect(console.log).toHaveBeenCalled();
      const logOutput = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logOutput).toContain("completed");
    });
  });

  // ─────────────────────────────────────────────────
  // 헬퍼 함수 테스트
  // ─────────────────────────────────────────────────

  describe("createRequestLogger", () => {
    it("요청 ID 자동 생성", () => {
      const log = createRequestLogger();
      expect(log).toBeInstanceOf(Logger);
    });

    it("요청 ID와 사용자 ID 포함", () => {
      const log = createRequestLogger("req-123", "user-456");
      log.info("요청 처리");

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe("logApiError", () => {
    it("API 에러 로깅", () => {
      const error = new Error("API 호출 실패");
      logApiError("/api/upload", error, { userId: "user-123" });

      expect(console.error).toHaveBeenCalled();
      const logOutput = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logOutput).toContain("/api/upload");
    });
  });

  // ─────────────────────────────────────────────────
  // 기본 로거 인스턴스 테스트
  // ─────────────────────────────────────────────────

  describe("Default logger instance", () => {
    it("기본 로거 존재", () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it("기본 로거로 로깅", () => {
      logger.info("기본 로거 테스트");
      expect(console.log).toHaveBeenCalled();
    });
  });
});
