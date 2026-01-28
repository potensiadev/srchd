/**
 * 검색 서비스 상수 정의
 * Single Source of Truth for all search-related limits and configurations
 */

// ─────────────────────────────────────────────────
// 페이지네이션 상수
// ─────────────────────────────────────────────────

/** 검색 결과 최대 반환 개수 */
export const MAX_LIMIT = 100;

/** 검색 결과 최소 반환 개수 */
export const MIN_LIMIT = 1;

/** 오프셋 최소값 */
export const MIN_OFFSET = 0;

// ─────────────────────────────────────────────────
// 필터 파라미터 상수
// ─────────────────────────────────────────────────

/** 최대 경력 연수 (검증용) */
export const MAX_EXP_YEARS = 100;

/** 필터에서 선택 가능한 최대 스킬 수 */
export const MAX_SKILLS_COUNT = 20;

/** 지역 필터 최대 길이 */
export const MAX_LOCATION_LENGTH = 100;

/** 회사 필터 최대 개수 */
export const MAX_COMPANIES_COUNT = 10;

/** 제외 회사 필터 최대 개수 */
export const MAX_EXCLUDE_COMPANIES_COUNT = 10;

// ─────────────────────────────────────────────────
// 쿼리 및 키워드 상수
// ─────────────────────────────────────────────────

/** 검색 쿼리 최대 길이 */
export const MAX_QUERY_LENGTH = 500;

/** 개별 검색 키워드 최대 길이 */
export const MAX_KEYWORD_LENGTH = 50;

// ─────────────────────────────────────────────────
// 스킬 배열 상수
// ─────────────────────────────────────────────────

/** 스킬 배열 최대 처리 개수 (DoS 방지) */
export const MAX_SKILLS_ARRAY_SIZE = 100;

/** 개별 스킬명 최대 길이 */
export const MAX_SKILL_LENGTH = 100;

// ─────────────────────────────────────────────────
// 병렬 쿼리 상수
// ─────────────────────────────────────────────────

/** 최대 병렬 쿼리 수 (DB 연결 풀 고갈 방지) */
export const MAX_PARALLEL_QUERIES = 5;

/** 병렬 쿼리 그룹당 최대 스킬 수 (성능 보장) */
export const MAX_SKILLS_PER_GROUP = 15;

/** 병렬 쿼리 처리 가능 총 스킬 수 */
export const MAX_TOTAL_SKILLS = MAX_PARALLEL_QUERIES * MAX_SKILLS_PER_GROUP; // 75

// ─────────────────────────────────────────────────
// 동의어 캐시 상수
// ─────────────────────────────────────────────────

/** 동의어 캐시 TTL (5분) */
export const SYNONYM_CACHE_TTL_MS = 5 * 60 * 1000;

/** 동의어 캐시 최대 크기 (메모리 누수 방지) */
export const MAX_SYNONYM_CACHE_SIZE = 10000;

/** 스킬당 최대 동의어 수 (쿼리 폭발 방지) */
export const MAX_SYNONYMS_PER_SKILL = 10;
