/**
 * Redirect URL Sanitization
 *
 * Open Redirect 취약점 방지를 위한 URL 검증 유틸리티
 * - 내부 경로만 허용 (/ 시작)
 * - 프로토콜 상대 URL 차단 (//)
 * - 외부 URL 차단 (http:, https:, javascript:, data:)
 */

// 차단할 패턴
const BLOCKED_PATTERNS = [
  /^\/\//,           // Protocol-relative URL (//)
  /^[a-z]+:/i,       // Any protocol (http:, https:, javascript:, data:, etc.)
  /%2f%2f/i,         // URL-encoded //
  /\\/,              // Backslash (IE quirk)
  /%5c/i,            // URL-encoded backslash
];

// 기본 리다이렉트 경로
const DEFAULT_REDIRECT = "/candidates";

/**
 * 리다이렉트 경로 검증 및 정제
 *
 * @param path - 검증할 경로 (null 가능)
 * @returns 안전한 내부 경로 또는 기본 경로
 *
 * @example
 * sanitizeRedirectPath("/candidates/123") // "/candidates/123"
 * sanitizeRedirectPath("//evil.com") // "/candidates"
 * sanitizeRedirectPath("https://evil.com") // "/candidates"
 * sanitizeRedirectPath(null) // "/candidates"
 */
export function sanitizeRedirectPath(path: string | null): string {
  // null/undefined → 기본 경로
  if (!path) {
    return DEFAULT_REDIRECT;
  }

  // 공백 제거
  const trimmed = path.trim();

  // 빈 문자열 → 기본 경로
  if (!trimmed) {
    return DEFAULT_REDIRECT;
  }

  // / 로 시작하지 않으면 → 기본 경로
  if (!trimmed.startsWith("/")) {
    console.warn(`[Security] Redirect path must start with /: ${trimmed}`);
    return DEFAULT_REDIRECT;
  }

  // 차단 패턴 검사
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`[Security] Blocked redirect attempt: ${trimmed}`);
      return DEFAULT_REDIRECT;
    }
  }

  // URL 파싱 검증 (추가 안전장치)
  try {
    const url = new URL(trimmed, "http://localhost");

    // hostname이 localhost가 아니면 외부 URL 시도로 간주
    if (url.hostname !== "localhost") {
      console.warn(`[Security] External redirect blocked: ${trimmed}`);
      return DEFAULT_REDIRECT;
    }
  } catch {
    // URL 파싱 실패 → 안전하지 않음
    console.warn(`[Security] Invalid redirect URL: ${trimmed}`);
    return DEFAULT_REDIRECT;
  }

  return trimmed;
}

/**
 * 허용된 내부 경로 목록 (화이트리스트 방식 - 선택적 사용)
 */
const ALLOWED_PATH_PREFIXES = [
  "/candidates",
  "/positions",
  "/upload",
  "/search",
  "/settings",
  "/analytics",
  "/consent",
  "/review",
  "/projects",
];

/**
 * 화이트리스트 기반 경로 검증 (더 엄격한 검증이 필요한 경우)
 *
 * @param path - 검증할 경로
 * @returns 허용된 경로인지 여부
 */
export function isAllowedRedirectPath(path: string): boolean {
  const sanitized = sanitizeRedirectPath(path);

  // 루트 경로 허용
  if (sanitized === "/") {
    return true;
  }

  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => sanitized === prefix || sanitized.startsWith(`${prefix}/`)
  );
}
