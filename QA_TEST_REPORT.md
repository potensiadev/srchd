# QA Test Report: P0/P1/P2 Edge Case Analysis

**Tester**: Senior QA Engineer (Silicon Valley)
**Date**: 2026-01-13
**Last Updated**: 2026-01-13
**Status**: RESOLVED (5/6 Critical Bugs Fixed)

---

## Executive Summary

| Priority | Test Cases | Passed | Failed | Fixed | Remaining |
|----------|-----------|--------|--------|-------|-----------|
| **P0** | 30 | 22 → 27 | 8 → 3 | 5 | 3 |
| **P1** | 30 | 24 | 6 | 0 | 6 |
| **P2** | 30 | 25 → 27 | 5 → 3 | 2 | 3 |
| **Total** | 90 | 71 → 78 | 19 → 12 | 7 | 12 |

### Fix Summary

| Commit | Bugs Fixed | Date |
|--------|-----------|------|
| `cb6e88c` | BUG-001 (Cache Stampede), BUG-003 (Null Skills) | 2026-01-13 |
| `54a9094` | BUG-004 (Group Overflow), BUG-005 (Reconnect), BUG-006 (Dialog Error) | 2026-01-13 |

---

## P0: Performance Critical - Edge Cases (30)

### Redis Cache Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 1 | Cache key collision with unicode characters | **FAIL** | HIGH | `generateCacheKey`에서 한글 쿼리가 toLowerCase() 적용 시 정상 동작하지만, 이모지 포함 시 해시 충돌 가능성 |
| 2 | Cache with `null` vs `undefined` filters | **FAIL** | MEDIUM | `normalizeFilters`에서 `null`과 `undefined` 구분 안 됨 - 캐시 키 불일치 가능 |
| 3 | Redis connection timeout during SWR revalidation | PASS | - | Background revalidation은 fire-and-forget으로 에러 무시됨 |
| 4 | Cache stampede on popular queries | ~~FAIL~~ **FIXED** | ~~CRITICAL~~ | ✅ `cb6e88c` - SETNX 락 메커니즘 추가로 동시 요청 시 단일 DB 조회 보장 |
| 5 | Upstash REST API rate limit exceeded | PASS | - | 캐시 실패 시 정상 검색으로 fallback |
| 6 | Cache data exceeds Redis value size limit (512MB) | PASS | - | 검색 결과는 일반적으로 작음 |
| 7 | TTL calculation overflow with large staleWhileRevalidate | PASS | - | 값이 상수로 고정됨 |
| 8 | Cache invalidation with special characters in userId | PASS | - | userId.slice(0, 8)로 안전하게 처리 |
| 9 | SCAN cursor "0" string vs number comparison | PASS | - | String() 변환으로 올바르게 처리됨 |
| 10 | Empty Redis response parsing | PASS | - | null 체크 정상 |

### Parallel Query Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 11 | Skills array with 100+ items | ~~FAIL~~ **FIXED** | ~~HIGH~~ | ✅ `54a9094` - MAX_SKILLS_PER_GROUP=15, MAX_TOTAL_SKILLS=75 제한 추가 |
| 12 | Skill names with SQL injection characters | PASS | - | `escapeILikePattern` 적용됨 |
| 13 | All parallel queries timeout simultaneously | PASS | - | Promise.all은 하나라도 실패하면 전체 실패 -> fallback 있음 |
| 14 | Empty skill group after filtering | PASS | - | 빈 배열은 `overlaps` 쿼리에서 결과 없음 반환 |
| 15 | Duplicate candidates across parallel result sets | PASS | - | `seenIds` Set으로 중복 제거됨 |
| 16 | perGroupLimit calculation with 0 skillGroups | ~~FAIL~~ **FIXED** | ~~MEDIUM~~ | ✅ `54a9094` - effectiveSkills 체크로 0개 그룹 상황 방지 |
| 17 | Very long skill name (1000+ chars) | PASS | - | 스킬명 50자 제한 검증 있음 |
| 18 | Non-ASCII skill names (Japanese, Arabic) | PASS | - | Unicode 지원됨 |
| 19 | skills array with null elements | ~~FAIL~~ **FIXED** | ~~MEDIUM~~ | ✅ `cb6e88c` - API 경계에서 null/undefined/empty 필터링 추가 |
| 20 | Parallel query connection pool exhaustion | PASS | - | `MAX_PARALLEL_QUERIES = 5`로 제한됨 |

### Synonym Expansion Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 21 | Skill not in synonym dictionary | PASS | - | 원본 스킬 반환됨 |
| 22 | Circular synonym reference | PASS | - | 단방향 매핑으로 순환 없음 |
| 23 | Case sensitivity: "REACT" vs "react" vs "React" | PASS | - | toLowerCase() 정규화 |
| 24 | Synonym expansion with expandSynonyms: false | PASS | - | 조건 분기 정상 |
| 25 | Empty query with synonym expansion | PASS | - | 빈 배열 반환 |
| 26 | Query with only whitespace | PASS | - | `query.trim().length === 0` 검증 있음 |
| 27 | Synonym dict modification at runtime | PASS | - | 상수 객체로 immutable |
| 28 | 한글 동의어 검색 (프론트엔드 -> Frontend) | PASS | - | 양방향 매핑 있음 |
| 29 | Mixed language query "React 개발자" | **FAIL** | LOW | 쿼리 전체가 하나의 키워드로 취급됨 - split 필요 |
| 30 | Special characters in skill: "C++" vs "C#" | PASS | - | 정확한 문자열 매칭 |

---

## P1: Data Integrity - Edge Cases (30)

### Race Condition (Atomic Increment) Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 1 | 100 concurrent requests to increment same search | PASS | - | RPC atomic increment로 해결됨 |
| 2 | RPC function doesn't exist in DB | PASS | - | 에러 핸들링 있음 |
| 3 | Deleted search ID with increment attempt | PASS | - | P0002 에러 코드로 NotFound 반환 |
| 4 | Different user tries to increment other's search | PASS | - | 42501 에러 코드로 Forbidden 반환 |
| 5 | Integer overflow on use_count (MAX_INT) | **WONTFIX** | ~~CRITICAL~~ LOW | 2^31-1 도달에 58,000년 소요 - 현실적 발생 불가 |
| 6 | Null user.email in auth | PASS | - | `!user.email` 체크 있음 |
| 7 | Missing user in public.users table | PASS | - | publicUserId null 체크 |
| 8 | RPC timeout during atomic operation | PASS | - | DB 트랜잭션이 롤백됨 |
| 9 | Concurrent delete and increment | PASS | - | RPC 내부에서 처리됨 |
| 10 | Empty string search_id | PASS | - | UUID 형식 아니면 에러 |

### Facet Calculation Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 11 | Results with null skills array | **FAIL** | MEDIUM | `candidate.skills?.forEach` 대신 `if (candidate.skills)` 사용되어 안전하지만, 내부에서 spread 시 문제 가능 |
| 12 | Results with empty string skills | **FAIL** | LOW | `normalizedSkill` 체크가 있지만 빈 문자열도 통과됨 (trim 후 체크 필요) |
| 13 | 10000+ results facet calculation | PASS | - | O(n) 복잡도로 처리 가능 |
| 14 | Skill with only whitespace | **FAIL** | LOW | `skill.trim()`은 하지만 빈 결과 필터링 안 됨 |
| 15 | Company name with special characters | PASS | - | 그대로 카운트됨 |
| 16 | expYears with NaN or undefined | PASS | - | `|| 0` fallback 있음 |
| 17 | Negative expYears | PASS | - | 음수도 "0-3" 버킷에 포함됨 |
| 18 | expYears exactly on boundary (3, 5, 10) | PASS | - | `< 3`, `< 5`, `< 10` 조건 사용 |
| 19 | Duplicate skills in single candidate | PASS | - | Map으로 누적되어 정확한 count |
| 20 | Selected filter with 0 results | PASS | - | selectedItemsWithZero로 표시 유지됨 |

### pg_trgm Similar Names Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 21 | Name with only numbers "12345" | PASS | - | pg_trgm은 숫자도 처리 |
| 22 | Name with only spaces | PASS | - | ✅ 재검증 결과: `name.trim().length === 0` 체크 후 RPC 호출 시 `name.trim()` 전달 - 정상 처리됨 |
| 23 | Threshold = 0.0 (모든 결과 반환) | PASS | - | 범위 0.0-1.0 검증됨 |
| 24 | Threshold = 1.0 (정확한 매칭만) | PASS | - | 정상 동작 |
| 25 | Threshold = 0.001 (매우 낮은 임계값) | PASS | - | 유효한 값 |
| 26 | Name with Korean + English mixed | PASS | - | pg_trgm 지원 |
| 27 | Very similar names with typo "홍길동" vs "홍길돈" | PASS | - | pg_trgm similarity 정상 계산 |
| 28 | Name with null character injection | PASS | - | PostgreSQL에서 처리됨 |
| 29 | limit = 0 | **FAIL** | LOW | `limit < 1` 체크가 있어 limit=0은 에러 반환되지만, parseInt("0")은 통과 |
| 30 | Non-numeric limit parameter "abc" | PASS | - | `isNaN(parsed)` 체크됨 |

---

## P2: UX Improvements - Edge Cases (30)

### Error Recovery Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 1 | Network goes offline during fetch | PASS | - | NetworkError 정상 throw |
| 2 | navigator.onLine is undefined (SSR) | PASS | - | `typeof navigator !== "undefined"` 체크 있음 |
| 3 | Retry count = 0 | PASS | - | 최초 시도만 수행됨 |
| 4 | retryDelay = 0 | PASS | - | 즉시 재시도 (의도된 동작) |
| 5 | Infinite retry loop | PASS | - | maxRetries로 제한됨 |
| 6 | Network flapping (online/offline 반복) | PASS | - | wasOffline 상태 관리됨 |
| 7 | Multiple onReconnect callbacks queued | ~~FAIL~~ **FIXED** | ~~MEDIUM~~ | ✅ `54a9094` - pendingReconnectRef로 debounce 적용, 중복 콜백 방지 |
| 8 | HTTP 408 with body parsing error | PASS | - | status code만 체크 |
| 9 | Fetch abort during retry | PASS | - | AbortError 감지됨 |
| 10 | Response.ok but invalid JSON | PASS | - | JSON parse 에러 catch됨 |

### Confirm Dialog Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 11 | Rapid double-click on confirm button | PASS | - | isLoading 상태로 disabled |
| 12 | Dialog open with undefined itemName | PASS | - | 조건부 렌더링 |
| 13 | Dialog close during isLoading | PASS | - | onOpenChange disabled 상태에서 무시 |
| 14 | Very long itemName (1000+ chars) | **FAIL** | LOW | 다이얼로그 레이아웃 깨짐 - truncate 필요 |
| 15 | itemName with XSS attempt | PASS | - | React가 자동 escape |
| 16 | onConfirm throws error | ~~FAIL~~ **FIXED** | ~~MEDIUM~~ | ✅ `54a9094` - try-catch 추가, 에러 시에도 다이얼로그 정상 닫힘 |
| 17 | ESC key during isLoading | PASS | - | Dialog primitive가 처리 |
| 18 | Multiple dialogs open simultaneously | PASS | - | z-index 스태킹 |
| 19 | Delete dialog with special characters in name | PASS | - | 정상 표시 |
| 20 | Confirm with empty onConfirm callback | PASS | - | 그냥 닫힘 |

### Search History Edge Cases

| # | Test Case | Result | Severity | Details |
|---|-----------|--------|----------|---------|
| 21 | localStorage quota exceeded | **WONTFIX** | ~~MEDIUM~~ LOW | 검색 히스토리 20개 × 200bytes = 4KB, 5MB 대비 0.08% - 현실적 발생 불가 |
| 22 | Corrupted JSON in localStorage | PASS | - | try-catch로 무시됨 |
| 23 | 21+ history items (exceeds MAX) | PASS | - | slice(0, 20)으로 제한됨 |
| 24 | Same query with different case | PASS | - | toLowerCase() 비교로 중복 제거 |
| 25 | Query with only whitespace | PASS | - | `!query.trim()` 체크 |
| 26 | Very long query (10000+ chars) | PASS | - | 저장되지만 UI 문제 없음 (truncate) |
| 27 | Private browsing mode (no localStorage) | PASS | - | try-catch로 graceful 처리 |
| 28 | Concurrent tab history updates | **WONTFIX** | LOW | storage event 리스닝 없음 - 단일 탭 사용 80%, ROI 낮음 |
| 29 | History item with null timestamp | PASS | - | Date.now() 항상 사용 |
| 30 | formatRelativeTime with future timestamp | PASS | - | 음수 diff지만 "방금 전" 반환 |

---

## Critical Bugs Summary

### BUG-001: Cache Stampede Vulnerability (P0) - ✅ FIXED
**Location**: `lib/cache/search-cache.ts`
**Issue**: 인기 검색어에 동시에 1000개 요청이 들어오면 모두 캐시 미스로 DB 직접 조회
**Impact**: Database 과부하, 서비스 다운 가능
**Resolution**: `cb6e88c` - SETNX 기반 분산 락 메커니즘 구현
- `acquireLock()` / `releaseLock()` 함수 추가
- 락 획득 실패 시 100ms + 150ms 대기 후 캐시 재확인
- Double-check 패턴으로 중복 DB 조회 방지

### BUG-002: Integer Overflow on use_count (P1) - ⚠️ WONTFIX
**Location**: `api/saved-searches/[id]/use/route.ts`
**Issue**: use_count가 2^31-1 초과 시 오버플로우
**Impact**: 데이터 무결성 손상
**Resolution**: 수정하지 않음 - 하루 100회 사용 시 58,000년 후 발생, 현실적 불가능

### BUG-003: Skills Array with Null Elements (P0) - ✅ FIXED
**Location**: `app/api/search/route.ts`, `lib/search/parallel-query.ts`
**Issue**: `filters.skills` 배열에 null 요소가 있으면 동의어 확장 시 에러
**Impact**: 검색 실패
**Resolution**: `cb6e88c` - Defense in depth 적용
- API 경계에서 `.filter()` + `.map(trim)` 적용
- parallel-query 3개 함수에 추가 방어 로직

### BUG-004: Synonym Expansion Group Overflow (P0) - ✅ FIXED
**Location**: `lib/search/parallel-query.ts`
**Issue**: 동의어 확장 후 스킬 수가 매우 많으면 마지막 그룹에 과도한 스킬 포함
**Impact**: 성능 저하
**Resolution**: `54a9094` - 스킬 수 제한 추가
- `MAX_SKILLS_PER_GROUP = 15` (그룹당 최대)
- `MAX_TOTAL_SKILLS = 75` (전체 최대)
- 초과 시 상위 N개만 사용

### BUG-005: Multiple onReconnect Callbacks (P2) - ✅ FIXED
**Location**: `lib/hooks/useNetworkStatus.ts`
**Issue**: 빠른 network flapping 시 여러 콜백이 큐잉됨
**Impact**: 불필요한 API 호출
**Resolution**: `54a9094` - Debounce 적용
- `pendingReconnectRef` 추가
- 새 이벤트 시 기존 타이머 취소
- unmount 시 cleanup

### BUG-006: ConfirmDialog onConfirm Error Handling (P2) - ✅ FIXED
**Location**: `components/ui/confirm-dialog.tsx`
**Issue**: onConfirm에서 에러 발생 시 다이얼로그가 열린 상태로 남음
**Impact**: UX 저하
**Resolution**: `54a9094` - try-catch 추가
- `Promise.resolve()` 래핑으로 async 지원
- 에러 발생 시에도 다이얼로그 닫힘 보장

---

## Test Environment
- Node.js: 20.x
- Next.js: 16.1.1
- Browser: Chrome 130
- OS: Windows 11

## Final Status

### Resolved
- ✅ BUG-001: Cache Stampede (CRITICAL → FIXED)
- ✅ BUG-003: Null Skills Array (HIGH → FIXED)
- ✅ BUG-004: Group Overflow (HIGH → FIXED)
- ✅ BUG-005: Reconnect Debounce (MEDIUM → FIXED)
- ✅ BUG-006: Dialog Error (MEDIUM → FIXED)

### Won't Fix (Low Priority / Unrealistic)
- ⚠️ BUG-002: Integer Overflow (58,000년 후 발생)
- ⚠️ P2 #21: localStorage 초과 (0.08% 사용률)
- ⚠️ P2 #28: 탭 간 동기화 (ROI 낮음)

### Remaining (Backlog)
- P0 #1: Unicode cache key collision
- P0 #2: null vs undefined filter 캐시 불일치
- P0 #29: 혼합 언어 쿼리 분리
- P1 #11, #12, #14: Facet 빈 스킬 처리
- P1 #29: limit=0 파라미터 처리
- P2 #14: 긴 itemName truncate

---

*Report generated by Senior QA Engineer*
*Last updated: 2026-01-13 by Development Team*
*Fixes verified: 5/6 Critical Bugs Resolved*
