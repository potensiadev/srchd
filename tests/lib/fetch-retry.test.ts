import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "@/lib/fetch-retry";

// ─────────────────────────────────────────────────
// Mock fetch
// ─────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("성공 케이스", () => {
    it("첫 요청 성공 시 즉시 반환", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "success" }),
      });

      const resultPromise = fetchWithRetry("http://test.com/api");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "success" });
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("POST 요청 전달", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      const resultPromise = fetchWithRetry("http://test.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://test.com/api",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "test" }),
        })
      );
    });
  });

  describe("재시도 케이스", () => {
    it("500 에러 후 재시도 성공", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "success" }),
        });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 3,
        initialDelayMs: 100,
      });

      // 첫 번째 시도
      await vi.advanceTimersByTimeAsync(0);
      // 대기 후 재시도
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("503 에러 후 재시도 성공", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve("Service Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "recovered" }),
        });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 2,
        initialDelayMs: 50,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it("네트워크 에러 후 재시도", async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "success" }),
        });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 2,
        initialDelayMs: 50,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe("실패 케이스", () => {
    it("재시도 불가능한 상태 코드 (400)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 3,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("400");
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("재시도 불가능한 상태 코드 (401)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const resultPromise = fetchWithRetry("http://test.com/api");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it("모든 재시도 실패", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 2,
        initialDelayMs: 50,
        maxDelayMs: 100,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // 초기 + 2 재시도
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("콜백", () => {
    it("재시도 콜백 호출", async () => {
      const onRetry = vi.fn();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Error"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 2,
        initialDelayMs: 100,
        onRetry,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1, // attempt
        expect.any(Error), // error
        expect.any(Number) // delay
      );
    });
  });

  describe("설정 옵션", () => {
    it("커스텀 재시도 상태 코드", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 418, // I'm a teapot (커스텀)
          text: () => Promise.resolve("I'm a teapot"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 1,
        initialDelayMs: 50,
        retryableStatusCodes: [418], // 418도 재시도
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it("maxRetries 0이면 재시도 안함", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Error"),
      });

      const resultPromise = fetchWithRetry("http://test.com/api", {}, {
        maxRetries: 0,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("결과 형식", () => {
    it("성공 시 totalTimeMs 포함", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const resultPromise = fetchWithRetry("http://test.com/api");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("실패 시 error 메시지 포함", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      });

      const resultPromise = fetchWithRetry("http://test.com/api");
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.error).toContain("404");
    });
  });
});
