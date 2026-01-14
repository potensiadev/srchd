/**
 * 검색 관련 sanitization 유틸리티
 * - 스킬 배열 정제
 * - 위험 문자 제거
 * - 쿼리 파싱
 */

// ─────────────────────────────────────────────────
// 상수 정의
// ─────────────────────────────────────────────────

/** 스킬 배열 최대 처리 개수 (DoS 방지, 필터 검증용 MAX_SKILLS_COUNT와 구분) */
export const MAX_SKILLS_ARRAY_SIZE = 100;

/** 개별 스킬명 최대 길이 */
export const MAX_SKILL_LENGTH = 100;

/** 검색 키워드 최대 길이 */
export const MAX_KEYWORD_LENGTH = 50;

/** 검색 쿼리 최대 길이 */
export const MAX_QUERY_LENGTH = 500;

// ─────────────────────────────────────────────────
// 위험 문자 패턴
// ─────────────────────────────────────────────────

/**
 * 위험한 제어 문자 패턴
 * - Null byte (\u0000)
 * - 제어 문자 (\u0001-\u001F, \u007F)
 * - Zero-width 문자 (\u200B-\u200D, \uFEFF)
 */
export const DANGEROUS_CHARS_PATTERN = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;

/**
 * 한영/특수문자 경계 분리 패턴 (확장)
 * - 한글 뒤 영문: (?<=[가-힣])(?=[a-zA-Z])
 * - 영문/특수문자(.+#) 뒤 한글: (?<=[a-zA-Z.+#])(?=[가-힣])
 *
 * 숫자-한글 경계는 분리하지 않음 (5년차, 3년차 같은 단위 보존)
 *
 * @example
 * "C++개발자" → ["C++", "개발자"]
 * "C#개발자" → ["C#", "개발자"]
 * "Node.js개발자" → ["Node.js", "개발자"]
 * "iOS개발자" → ["iOS", "개발자"]
 * "5년차" → ["5년차"] (단위 보존)
 */
export const KOREAN_ENGLISH_BOUNDARY_PATTERN = /(?<=[가-힣])(?=[a-zA-Z])|(?<=[a-zA-Z.+#])(?=[가-힣])/;

/**
 * 공백 및 쉼표 패턴
 */
export const WHITESPACE_COMMA_PATTERN = /[\s,]+/;

// ─────────────────────────────────────────────────
// 스킬 sanitization
// ─────────────────────────────────────────────────

/**
 * 개별 스킬 문자열 정제
 * @param skill 원본 스킬 (unknown 타입 허용)
 * @returns 정제된 스킬 문자열 또는 null (유효하지 않은 경우)
 */
export function sanitizeSkill(skill: unknown): string | null {
  if (typeof skill !== "string") return null;

  const sanitized = skill.trim().replace(DANGEROUS_CHARS_PATTERN, "");

  if (sanitized.length === 0 || sanitized.length > MAX_SKILL_LENGTH) {
    return null;
  }

  return sanitized;
}

/**
 * 스킬 배열 정제
 * - 배열 길이 제한 (DoS 방지)
 * - null, undefined, 빈 문자열 필터링
 * - 위험 문자 제거
 * - 길이 제한 적용
 *
 * @param skills 원본 스킬 배열 (unknown 타입 허용)
 * @returns 정제된 스킬 문자열 배열
 */
export function sanitizeSkillsArray(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];

  return skills
    .slice(0, MAX_SKILLS_ARRAY_SIZE)
    .map(sanitizeSkill)
    .filter((s): s is string => s !== null);
}

// ─────────────────────────────────────────────────
// 검색 쿼리 파싱
// ─────────────────────────────────────────────────

/**
 * Mixed Language Query Parser
 * 한영 혼합 쿼리를 개별 토큰으로 분리
 *
 * @example
 * parseSearchQuery("React개발자") → ["React", "개발자"]
 * parseSearchQuery("시니어 Developer") → ["시니어", "Developer"]
 * parseSearchQuery("React, Vue, Angular") → ["React", "Vue", "Angular"]
 *
 * @param query 검색 쿼리
 * @param maxKeywordLength 개별 키워드 최대 길이 (기본값: MAX_KEYWORD_LENGTH)
 * @returns 분리된 키워드 배열
 */
export function parseSearchQuery(
  query: string,
  maxKeywordLength: number = MAX_KEYWORD_LENGTH
): string[] {
  if (!query || typeof query !== "string") return [];

  return query
    .trim()
    .split(WHITESPACE_COMMA_PATTERN)
    .flatMap(token => {
      // 한영 경계 분리 시도
      try {
        return token.split(KOREAN_ENGLISH_BOUNDARY_PATTERN);
      } catch {
        // Lookbehind 미지원 환경 대비 폴백
        return [token];
      }
    })
    .map(t => t.trim().replace(DANGEROUS_CHARS_PATTERN, ""))
    .filter(t => t.length > 0)
    .map(t => t.slice(0, maxKeywordLength));  // Truncate instead of filter
}

/**
 * SQL/XSS 위험 문자 패턴
 * - SQL injection: ', ", `, ;, --
 * - XSS: <, >
 * - Command injection: \
 */
export const SQL_XSS_DANGEROUS_PATTERN = /[<>'"`;\\]|--/g;

/**
 * 제어 문자만 제거 (SQL/XSS 문자는 유지)
 * 스킬명이나 일반 텍스트에서 제어 문자만 제거할 때 사용
 *
 * @param value 원본 문자열
 * @param maxLength 최대 길이
 * @returns 제어 문자가 제거된 문자열
 */
export function removeControlChars(value: string, maxLength: number = MAX_KEYWORD_LENGTH): string {
  if (!value || typeof value !== "string") return "";

  return value
    .trim()
    .slice(0, maxLength)
    .replace(DANGEROUS_CHARS_PATTERN, "");
}

/**
 * 데이터베이스/HTML 출력용 완전한 sanitization
 * SQL injection, XSS, 제어 문자 모두 제거
 *
 * @param value 원본 문자열
 * @param maxLength 최대 길이
 * @returns 안전하게 정제된 문자열
 */
export function sanitizeString(value: string, maxLength: number = MAX_KEYWORD_LENGTH): string {
  if (!value || typeof value !== "string") return "";

  return value
    .replace(SQL_XSS_DANGEROUS_PATTERN, "")  // SQL/XSS 위험 문자 제거
    .replace(DANGEROUS_CHARS_PATTERN, "")     // 제어 문자 제거
    .trim()
    .slice(0, maxLength);
}
