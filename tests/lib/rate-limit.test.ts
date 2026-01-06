import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  getClientIP,
  getRateLimitHeaders,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";

// Mock NextRequest
function createMockRequest(headers: Record<string, string> = {}): {
  headers: { get: (key: string) => string | null };
} {
  return {
    headers: {
      get: (key: string) => headers[key] || null,
    },
  };
}

// ─────────────────────────────────────────────────
// getClientIP 테스트
// ─────────────────────────────────────────────────

describe("getClientIP", () => {
  it("x-forwarded-for 헤더에서 IP 추출", () => {
    const request = createMockRequest({
      "x-forwarded-for": "192.168.1.1, 10.0.0.1",
    });
    // @ts-expect-error 테스트용 모의 객체
    const ip = getClientIP(request);
    expect(ip).toBe("192.168.1.1");
  });

  it("cf-connecting-ip 헤더에서 IP 추출 (Cloudflare)", () => {
    const request = createMockRequest({
      "cf-connecting-ip": "203.0.113.1",
    });
    // @ts-expect-error 테스트용 모의 객체
    const ip = getClientIP(request);
    expect(ip).toBe("203.0.113.1");
  });

  it("x-real-ip 헤더에서 IP 추출", () => {
    const request = createMockRequest({
      "x-real-ip": "172.16.0.1",
    });
    // @ts-expect-error 테스트용 모의 객체
    const ip = getClientIP(request);
    expect(ip).toBe("172.16.0.1");
  });

  it("헤더 없으면 unknown 반환", () => {
    const request = createMockRequest({});
    // @ts-expect-error 테스트용 모의 객체
    const ip = getClientIP(request);
    expect(ip).toBe("unknown");
  });

  it("x-forwarded-for 우선순위", () => {
    const request = createMockRequest({
      "x-forwarded-for": "1.1.1.1",
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "3.3.3.3",
    });
    // @ts-expect-error 테스트용 모의 객체
    const ip = getClientIP(request);
    expect(ip).toBe("1.1.1.1");
  });
});

// ─────────────────────────────────────────────────
// checkRateLimit 테스트
// ─────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    // 캐시 초기화를 위해 새 식별자 사용
    vi.useFakeTimers();
  });

  it("첫 요청은 성공", () => {
    const identifier = `test-${Date.now()}-${Math.random()}`;
    const result = checkRateLimit(identifier, { limit: 10, windowMs: 60000 });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
  });

  it("제한 내 요청은 모두 성공", () => {
    const identifier = `test-${Date.now()}-${Math.random()}`;
    const config = { limit: 5, windowMs: 60000 };

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(identifier, config);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("제한 초과 시 실패", () => {
    const identifier = `test-${Date.now()}-${Math.random()}`;
    const config = { limit: 3, windowMs: 60000 };

    // 3번 성공
    for (let i = 0; i < 3; i++) {
      checkRateLimit(identifier, config);
    }

    // 4번째 실패
    const result = checkRateLimit(identifier, config);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("윈도우 만료 후 리셋", () => {
    const identifier = `test-${Date.now()}-${Math.random()}`;
    const config = { limit: 2, windowMs: 1000 }; // 1초

    // 2번 사용
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);

    // 3번째 실패
    let result = checkRateLimit(identifier, config);
    expect(result.success).toBe(false);

    // 1초 후
    vi.advanceTimersByTime(1001);

    // 리셋되어 성공
    result = checkRateLimit(identifier, config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("다른 식별자는 독립적", () => {
    const id1 = `test-${Date.now()}-1`;
    const id2 = `test-${Date.now()}-2`;
    const config = { limit: 2, windowMs: 60000 };

    // id1: 2번 사용
    checkRateLimit(id1, config);
    checkRateLimit(id1, config);

    // id1: 실패
    expect(checkRateLimit(id1, config).success).toBe(false);

    // id2: 성공 (독립적)
    expect(checkRateLimit(id2, config).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// getRateLimitHeaders 테스트
// ─────────────────────────────────────────────────

describe("getRateLimitHeaders", () => {
  it("성공 시 헤더 생성", () => {
    const result = {
      success: true,
      limit: 10,
      remaining: 5,
      reset: Date.now() + 60000,
    };

    const headers = getRateLimitHeaders(result);

    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
    expect(headers["X-RateLimit-Reset"]).toBeDefined();
    expect(headers["Retry-After"]).toBe("");
  });

  it("실패 시 Retry-After 포함", () => {
    const now = Date.now();
    const result = {
      success: false,
      limit: 10,
      remaining: 0,
      reset: now + 30000, // 30초 후
    };

    vi.setSystemTime(now);
    const headers = getRateLimitHeaders(result);

    expect(headers["Retry-After"]).toBe("30");
  });
});

// ─────────────────────────────────────────────────
// RATE_LIMIT_CONFIGS 테스트
// ─────────────────────────────────────────────────

describe("RATE_LIMIT_CONFIGS", () => {
  it("업로드 설정", () => {
    expect(RATE_LIMIT_CONFIGS.upload.limit).toBe(10);
    expect(RATE_LIMIT_CONFIGS.upload.windowMs).toBe(60000);
  });

  it("검색 설정", () => {
    expect(RATE_LIMIT_CONFIGS.search.limit).toBe(30);
    expect(RATE_LIMIT_CONFIGS.search.windowMs).toBe(60000);
  });

  it("인증 설정 (브루트포스 방지)", () => {
    expect(RATE_LIMIT_CONFIGS.auth.limit).toBe(5);
    expect(RATE_LIMIT_CONFIGS.auth.windowMs).toBe(60000);
  });

  it("내보내기 설정", () => {
    expect(RATE_LIMIT_CONFIGS.export.limit).toBe(20);
    expect(RATE_LIMIT_CONFIGS.export.windowMs).toBe(3600000); // 1시간
  });

  it("기본 설정", () => {
    expect(RATE_LIMIT_CONFIGS.default.limit).toBe(60);
    expect(RATE_LIMIT_CONFIGS.default.windowMs).toBe(60000);
  });
});
