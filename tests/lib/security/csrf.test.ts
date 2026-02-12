/**
 * CSRF Protection Unit Tests
 *
 * Origin/Referer 헤더 검증을 통한 CSRF 공격 방지 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateOrigin, requiresCSRFProtection, validateCSRFForAPI } from "@/lib/csrf";
import { NextRequest } from "next/server";

// Mock NextRequest
function createMockRequest(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const url = options.url || "http://localhost:3000/api/test";
  const headers = new Headers(options.headers || {});

  return {
    method: options.method || "POST",
    headers,
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

describe("validateOrigin", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe("production environment - strict mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("should REJECT requests without Origin AND Referer headers", () => {
      const request = createMockRequest({
        headers: { host: "example.com" },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing Origin header");
    });

    it("should accept requests with valid Origin matching host", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          origin: "https://example.com",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(true);
    });

    it("should accept requests with valid Referer matching host (no Origin)", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          referer: "https://example.com/page",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(true);
    });

    it("should reject requests with mismatched Origin", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          origin: "https://evil.com",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(false);
    });

    it("should reject requests with mismatched Referer", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          referer: "https://evil.com/attack",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(false);
    });
  });

  describe("development environment - permissive mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should allow requests without Origin AND Referer (for curl/Postman)", () => {
      const request = createMockRequest({
        headers: { host: "localhost:3000" },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(true);
    });

    it("should accept localhost origins", () => {
      const request = createMockRequest({
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid header formats", () => {
    it("should reject malformed Origin", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          origin: "not-a-valid-url",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid origin format");
    });

    it("should reject malformed Referer", () => {
      const request = createMockRequest({
        headers: {
          host: "example.com",
          referer: "not-a-valid-url",
        },
      });

      const result = validateOrigin(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid referer format");
    });
  });
});

describe("requiresCSRFProtection", () => {
  it("should require protection for state-changing methods", () => {
    expect(requiresCSRFProtection("POST")).toBe(true);
    expect(requiresCSRFProtection("PUT")).toBe(true);
    expect(requiresCSRFProtection("DELETE")).toBe(true);
    expect(requiresCSRFProtection("PATCH")).toBe(true);
  });

  it("should not require protection for safe methods", () => {
    expect(requiresCSRFProtection("GET")).toBe(false);
    expect(requiresCSRFProtection("HEAD")).toBe(false);
    expect(requiresCSRFProtection("OPTIONS")).toBe(false);
  });

  it("should handle case-insensitively", () => {
    expect(requiresCSRFProtection("post")).toBe(true);
    expect(requiresCSRFProtection("Post")).toBe(true);
    expect(requiresCSRFProtection("get")).toBe(false);
  });
});

describe("validateCSRFForAPI", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should skip validation for non-API paths", () => {
    const request = createMockRequest({
      url: "http://example.com/candidates",
      method: "POST",
      headers: {},
    });

    const result = validateCSRFForAPI(request);
    expect(result).toBe(true);
  });

  it("should skip validation for safe methods", () => {
    const request = createMockRequest({
      url: "http://example.com/api/candidates",
      method: "GET",
      headers: {},
    });

    const result = validateCSRFForAPI(request);
    expect(result).toBe(true);
  });

  it("should validate API POST requests", () => {
    const request = createMockRequest({
      url: "http://example.com/api/candidates",
      method: "POST",
      headers: { host: "example.com" },
    });

    const result = validateCSRFForAPI(request);
    expect(result).toBe(false); // No Origin/Referer in production
  });

  it("should pass API POST with valid Origin", () => {
    const request = createMockRequest({
      url: "http://example.com/api/candidates",
      method: "POST",
      headers: {
        host: "example.com",
        origin: "http://example.com",
      },
    });

    const result = validateCSRFForAPI(request);
    expect(result).toBe(true);
  });
});
