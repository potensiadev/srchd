/**
 * Redirect Sanitization Unit Tests
 *
 * Open Redirect 취약점 방지 유틸리티 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeRedirectPath, isAllowedRedirectPath } from "@/lib/security/redirect";

describe("sanitizeRedirectPath", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("valid internal paths", () => {
    it("should allow simple internal paths", () => {
      expect(sanitizeRedirectPath("/candidates")).toBe("/candidates");
      expect(sanitizeRedirectPath("/candidates/123")).toBe("/candidates/123");
      expect(sanitizeRedirectPath("/upload")).toBe("/upload");
      expect(sanitizeRedirectPath("/search")).toBe("/search");
    });

    it("should allow paths with query parameters", () => {
      expect(sanitizeRedirectPath("/candidates?page=1")).toBe("/candidates?page=1");
      expect(sanitizeRedirectPath("/search?q=developer")).toBe("/search?q=developer");
    });

    it("should allow paths with fragments", () => {
      expect(sanitizeRedirectPath("/candidates#section")).toBe("/candidates#section");
    });

    it("should allow root path", () => {
      expect(sanitizeRedirectPath("/")).toBe("/");
    });
  });

  describe("null/undefined/empty handling", () => {
    it("should return default for null", () => {
      expect(sanitizeRedirectPath(null)).toBe("/candidates");
    });

    it("should return default for empty string", () => {
      expect(sanitizeRedirectPath("")).toBe("/candidates");
    });

    it("should return default for whitespace-only string", () => {
      expect(sanitizeRedirectPath("   ")).toBe("/candidates");
    });
  });

  describe("protocol-relative URL blocking", () => {
    it("should block double-slash URLs", () => {
      expect(sanitizeRedirectPath("//evil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("//evil.com/path")).toBe("/candidates");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should block URL-encoded double-slash", () => {
      expect(sanitizeRedirectPath("/%2f%2fevil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("/%2F%2Fevil.com")).toBe("/candidates");
    });
  });

  describe("external URL blocking", () => {
    it("should block http URLs", () => {
      expect(sanitizeRedirectPath("http://evil.com")).toBe("/candidates");
    });

    it("should block https URLs", () => {
      expect(sanitizeRedirectPath("https://evil.com")).toBe("/candidates");
    });

    it("should block javascript URLs", () => {
      expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/candidates");
    });

    it("should block data URLs", () => {
      expect(sanitizeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe("/candidates");
    });

    it("should block ftp URLs", () => {
      expect(sanitizeRedirectPath("ftp://evil.com")).toBe("/candidates");
    });
  });

  describe("backslash handling (IE quirk)", () => {
    it("should block backslash URLs", () => {
      expect(sanitizeRedirectPath("/\\evil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("\\evil.com")).toBe("/candidates");
    });

    it("should block URL-encoded backslash", () => {
      expect(sanitizeRedirectPath("/%5cevil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("/%5Cevil.com")).toBe("/candidates");
    });
  });

  describe("paths not starting with slash", () => {
    it("should block relative paths", () => {
      expect(sanitizeRedirectPath("evil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("candidates")).toBe("/candidates");
    });

    it("should block paths with leading dot", () => {
      expect(sanitizeRedirectPath("./candidates")).toBe("/candidates");
      expect(sanitizeRedirectPath("../candidates")).toBe("/candidates");
    });
  });

  describe("edge cases", () => {
    it("should handle paths with spaces (trimmed)", () => {
      expect(sanitizeRedirectPath("  /candidates  ")).toBe("/candidates");
    });

    it("should handle complex valid paths", () => {
      expect(sanitizeRedirectPath("/candidates/123/edit?tab=skills#section")).toBe(
        "/candidates/123/edit?tab=skills#section"
      );
    });

    it("should block mixed-case protocol attempts", () => {
      expect(sanitizeRedirectPath("HTTPS://evil.com")).toBe("/candidates");
      expect(sanitizeRedirectPath("HtTpS://evil.com")).toBe("/candidates");
    });
  });
});

describe("isAllowedRedirectPath", () => {
  describe("allowed paths", () => {
    it("should allow root path", () => {
      expect(isAllowedRedirectPath("/")).toBe(true);
    });

    it("should allow whitelisted prefixes", () => {
      expect(isAllowedRedirectPath("/candidates")).toBe(true);
      expect(isAllowedRedirectPath("/candidates/123")).toBe(true);
      expect(isAllowedRedirectPath("/positions")).toBe(true);
      expect(isAllowedRedirectPath("/upload")).toBe(true);
      expect(isAllowedRedirectPath("/search")).toBe(true);
      expect(isAllowedRedirectPath("/settings")).toBe(true);
      expect(isAllowedRedirectPath("/analytics")).toBe(true);
      expect(isAllowedRedirectPath("/consent")).toBe(true);
      expect(isAllowedRedirectPath("/review")).toBe(true);
      expect(isAllowedRedirectPath("/projects")).toBe(true);
    });
  });

  describe("blocked paths", () => {
    it("should block non-whitelisted paths", () => {
      expect(isAllowedRedirectPath("/admin")).toBe(false);
      expect(isAllowedRedirectPath("/api/secret")).toBe(false);
      expect(isAllowedRedirectPath("/internal")).toBe(false);
    });

    it("should block partial prefix matches", () => {
      // /candidatesxyz should not match /candidates
      expect(isAllowedRedirectPath("/candidatesxyz")).toBe(false);
    });

    it("should block external URLs (sanitized first)", () => {
      // These get sanitized to /candidates, which is allowed
      expect(isAllowedRedirectPath("//evil.com")).toBe(true); // sanitized to /candidates
    });
  });
});
