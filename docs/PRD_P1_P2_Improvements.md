# RAI P1/P2 Feature Improvement PRD

**Document Version:** 1.1
**Author:** Product Management Team
**Date:** 2026-01-12
**Target Audience:** Senior Engineering Team
**Priority Framework:** CRITICAL > HIGH > MEDIUM > LOW

---

## Executive Summary

QA 분석 결과, P1/P2 기능에서 **보안 이슈(RLS로 보호됨)**와 **20개 이상의 기능/UX 이슈**가 발견되었습니다. 본 PRD는 사용자 관점에서 발견된 문제점을 분석하고, 개선 방향을 제시합니다.

### Impact Assessment
- **Security Risk:** LOW (RLS 정책 적용됨, Defense in Depth 권장)
- **Data Integrity:** HIGH (중복/충돌 문제)
- **User Experience:** MEDIUM (기능 불완전)
- **Performance:** HIGH (검색 속도 최적화 필요 - 헤드헌터 핵심 요구사항)

---

## Part 1: Security Enhancements (P1 - Defense in Depth)

### 1.1 Risk Dashboard - Explicit User Filtering

**Status:** RLS 정책으로 보호됨, 명시적 필터 추가 권장

**Current State:**
- `candidates` 테이블에 RLS 정책 적용됨: `user_id = get_current_user_id()`
- `/api/candidates/duplicates` API에 명시적 `user_id` 필터 있음

**Recommendation:**
Defense in Depth 원칙에 따라 클라이언트 사이드 쿼리도 Server Component 또는 API Route로 이동 권장.

**Priority:** P1-MEDIUM
**Risk Level:** LOW (RLS 보호 중)

---

### 1.2 Duplicate Hash Collision Improvement

**Problem:**
현재 `phone_hash`, `email_hash`로 중복 감지하지만, 동명이인 처리가 불완전함.

**Current Implementation:**
- phone_hash, email_hash 기반 중복 감지 (정상 동작)

**Recommended Enhancement:**
```typescript
// 복합 키 기반 유사도 점수
const similarityScore = calculateSimilarity({
  name: candidate.name,
  email: candidate.email,
  phone: candidate.phone,
  company: candidate.last_company
});
```

**Acceptance Criteria:**
- [ ] 동명이인 구분을 위한 추가 필드 비교
- [ ] 유사도 임계값 설정 가능

**Priority:** P1-MEDIUM
**Estimated Effort:** 3 hours

---

## Part 2: Data Integrity Issues (P1 - This Sprint)

### 2.1 Race Condition in Saved Search Use Count

**Problem:**
동시에 같은 저장된 검색을 사용할 때 use_count 증가가 정확하지 않음.

**Required Fix:**
```sql
-- Atomic increment
UPDATE saved_searches
SET use_count = use_count + 1,
    last_used_at = NOW()
WHERE id = $1;
```

**Acceptance Criteria:**
- [ ] Atomic increment 구현
- [ ] 동시성 테스트 (100 concurrent requests)
- [ ] 결과 일관성 99.99% 이상

**Priority:** P1-HIGH
**Estimated Effort:** 1 hour

---

### 2.2 Facet Count Inconsistency

**Problem:**
Facet 계산이 필터 적용 전 전체 결과 기준으로 수행됨.

**Required Behavior:**
- 필터 적용 후 남은 결과 기준으로 facet 재계산
- 선택된 필터 항목은 현재 count 유지

**Acceptance Criteria:**
- [ ] 필터 적용 시 facet count 재계산
- [ ] 0건인 facet 항목 숨김 또는 비활성화

**Priority:** P1-HIGH
**Estimated Effort:** 3 hours

---

## Part 3: Performance Optimization (P0 - Critical for UX)

### 3.1 Search Speed Optimization (동의어 확장 유지)

**Business Context:**
> "헤드헌터는 시간이 생명이야. 빠른 검색 결과 응답이 중요해."

**Current Behavior (유지):**
```
"React" → ["React", "ReactJS", "React.js", "리액트"]
"Python" → ["Python", "python", "Python3", "py", "파이썬"]
```
동의어 확장은 검색 정확도를 높이는 핵심 기능이므로 **반드시 유지**합니다.

**Problem:**
동의어 확장 시 OR 조건이 많아져 쿼리 성능 저하 (현재 P95: ~800ms)

---

#### 해결 방안 분석 (Senior Engineer Perspective)

| 방안 | 장점 | 단점 | 복잡도 | 권장 |
|------|------|------|--------|------|
| **1. Redis 캐싱** | 빠른 구현, 즉시 효과 | 캐시 무효화 복잡 | LOW | Phase 1 |
| **2. Parallel Query** | 인프라 변경 없음 | DB 부하 증가 | LOW | Phase 1 |
| **3. PostgreSQL FTS + Thesaurus** | 네이티브 지원, 빠름 | 설정 복잡 | MEDIUM | Phase 2 |
| **4. Pre-indexed Synonym Table** | JOIN으로 단일 쿼리 | 마이그레이션 필요 | MEDIUM | Phase 2 |
| **5. Meilisearch/Typesense** | 업계 표준, 초고속 | 추가 인프라 | HIGH | Phase 3 |

---

#### Phase 1: Quick Wins (1-2일)

**3.1.1 Query Result Caching (Redis/Vercel KV)**

```typescript
// lib/cache/search-cache.ts
import { kv } from '@vercel/kv';

const CACHE_TTL = 300; // 5분

export async function getCachedSearch(key: string) {
  return await kv.get(`search:${key}`);
}

export async function setCachedSearch(key: string, results: SearchResponse) {
  await kv.set(`search:${key}`, results, { ex: CACHE_TTL });
}

// 캐시 키 생성 (쿼리 + 필터 해시)
export function generateCacheKey(query: string, filters: SearchFilters): string {
  const normalized = JSON.stringify({ q: query.toLowerCase(), f: filters });
  return crypto.createHash('md5').update(normalized).digest('hex');
}
```

**적용 위치:** `app/api/search/route.ts`
```typescript
// 캐시 확인
const cacheKey = generateCacheKey(query, filters);
const cached = await getCachedSearch(cacheKey);
if (cached) {
  return apiSuccess(cached, { cached: true });
}

// 검색 실행 후 캐시 저장
const results = await executeSearch(...);
await setCachedSearch(cacheKey, results);
```

**Expected Impact:**
- 반복 검색 응답 시간: ~800ms → **<50ms**
- Cache hit ratio (예상): 40-60%

---

**3.1.2 Synonym Expansion Caching**

```typescript
// lib/search/synonyms.ts - 메모이제이션 추가
const synonymCache = new Map<string, string[]>();

export function getSkillSynonyms(skill: string): string[] {
  const cacheKey = skill.toLowerCase();
  if (synonymCache.has(cacheKey)) {
    return synonymCache.get(cacheKey)!;
  }

  const normalized = normalizeSkill(skill);
  const synonyms = SKILL_SYNONYMS[normalized] || [];
  const result = [normalized, ...synonyms];

  synonymCache.set(cacheKey, result);
  return result;
}
```

---

**3.1.3 Parallel Query Execution**

```typescript
// 동의어 그룹별 병렬 쿼리 실행
async function parallelSynonymSearch(
  skills: string[],
  baseQuery: PostgrestFilterBuilder
): Promise<CandidateSearchResult[]> {
  // 스킬별로 쿼리 분리
  const queries = skills.map(skill =>
    baseQuery.clone().contains('skills', [skill])
  );

  // 병렬 실행
  const results = await Promise.all(
    queries.map(q => q.limit(20))
  );

  // 중복 제거 및 병합
  const seen = new Set<string>();
  const merged: CandidateSearchResult[] = [];

  for (const batch of results) {
    for (const candidate of batch.data || []) {
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        merged.push(candidate);
      }
    }
  }

  return merged;
}
```

---

#### Phase 2: Database Optimization (1주)

**3.1.4 Pre-indexed Synonym Table**

```sql
-- Migration: 023_skill_synonyms.sql
CREATE TABLE skill_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_skill VARCHAR(100) NOT NULL,
  variant VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 모든 동의어를 테이블에 저장
INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
  ('React', 'React'),
  ('React', 'ReactJS'),
  ('React', 'React.js'),
  ('React', '리액트'),
  ('Python', 'Python'),
  ('Python', 'python'),
  ('Python', 'py'),
  ('Python', '파이썬'),
  -- ... 전체 동의어 사전
;

-- 인덱스 생성
CREATE INDEX idx_skill_synonyms_variant ON skill_synonyms(LOWER(variant));
CREATE INDEX idx_skill_synonyms_canonical ON skill_synonyms(canonical_skill);
```

**검색 쿼리 최적화:**
```sql
-- 기존: OR 조건 다수
WHERE skills && ARRAY['React', 'ReactJS', 'React.js', '리액트']

-- 개선: JOIN 기반 단일 조건
SELECT DISTINCT c.*
FROM candidates c
JOIN skill_synonyms s ON s.variant = ANY(c.skills)
WHERE s.canonical_skill IN ('React', 'Python')
  AND c.user_id = $1;
```

---

#### Phase 3: Dedicated Search Engine (장기)

**Meilisearch Integration (권장)**

```typescript
// lib/search/meilisearch.ts
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_API_KEY
});

// 동의어 설정 (한 번만)
await client.index('candidates').updateSynonyms({
  'react': ['reactjs', 'react.js', '리액트'],
  'python': ['py', 'python3', '파이썬'],
  // ...
});

// 검색 실행 (자동 동의어 확장)
const results = await client.index('candidates').search(query, {
  filter: `user_id = "${userId}"`,
  limit: 50
});
```

**Expected Performance:**
- 검색 응답 시간: **<20ms**
- 동의어 확장: 자동 처리
- 오타 교정: 내장 기능

---

**Acceptance Criteria:**
- [ ] Phase 1 완료 후 P95 < 300ms
- [ ] Phase 2 완료 후 P95 < 150ms
- [ ] 동의어 확장 기능 100% 유지
- [ ] Cache hit ratio > 40%

**Priority:** P0-CRITICAL
**Estimated Effort:** Phase 1: 2일, Phase 2: 5일, Phase 3: 2주

---

**Decision Points & Risks:**

| 결정 사항 | 옵션 | 권장 | 리스크 |
|-----------|------|------|--------|
| 캐시 솔루션 | Redis vs Vercel KV | Vercel KV (이미 Next.js 사용) | 비용 (월 $150+) |
| Phase 2 진입 시점 | 즉시 vs Phase 1 결과 후 | Phase 1 결과 확인 후 | 불필요한 복잡성 추가 |
| Meilisearch 도입 | 자체 호스팅 vs Cloud | Cloud (Meilisearch Cloud) | 비용 (월 $30+) |

---

### 3.2 Similar Names Query Optimization

**Problem:**
유사 이름 검색 시 클라이언트 사이드에서 전체 후보자 비교.

**Required Fix:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_candidates_name_trgm ON candidates USING gin(name gin_trgm_ops);

SELECT * FROM candidates
WHERE user_id = $1
  AND similarity(name, $2) > 0.3
ORDER BY similarity(name, $2) DESC
LIMIT 10;
```

**Priority:** P1-HIGH
**Estimated Effort:** 4 hours

---

## Part 4: User Experience Issues (P2)

### 4.1 Filter Reset on Search Query Change

**Problem:**
검색어 변경 시 facet 필터가 초기화됨.

**Required Behavior:**
- 검색어 변경 시 필터 유지
- 결과 0건 시 경고 표시

**Priority:** P2-MEDIUM
**Estimated Effort:** 2 hours

---

### 4.2 Missing Loading States

**Required:**
- 모든 비동기 작업에 로딩 인디케이터
- Skeleton UI 또는 Spinner 표시
- 작업 완료/실패 토스트 알림

**Priority:** P2-MEDIUM
**Estimated Effort:** 3 hours

---

### 4.3 Saved Search UX Improvements

**Current Feature Status:**
- SavedSearches 컴포넌트 구현됨 (`components/dashboard/SavedSearches.tsx`)
- API 엔드포인트 구현됨 (`/api/saved-searches/*`)
- 기능: 저장, 불러오기, 삭제, 사용 횟수 추적

**Required Improvements:**
1. 저장 성공/실패 Toast 알림
2. 중복 이름 에러 메시지 개선
3. 삭제 확인 다이얼로그
4. 빈 검색 조건 시 저장 버튼 비활성화

**Priority:** P2-MEDIUM
**Estimated Effort:** 2 hours

---

### 4.4 Field Confidence Visualization

**Current:** 숫자로만 표시 (`이름: 95%`)

**Required:**
- Progress bar 시각화
- 색상 코딩 (Green/Yellow/Red)
- 툴팁으로 상세 설명

**Priority:** P2-MEDIUM
**Estimated Effort:** 3 hours

---

## Part 5: Missing Features (P2)

### 5.1 Bulk Actions in Risk Dashboard

**Problem:**
중복 후보자 처리 시 개별 작업만 가능.

**Required Features:**
- 전체 선택 / 해제
- 선택 항목 일괄 병합/삭제
- 작업 진행률 표시

**Priority:** P2-MEDIUM
**Estimated Effort:** 6 hours

---

### 5.2 Search History

**Problem:**
이전 검색 기록을 볼 수 없음.

**Required Features:**
- 최근 검색 20개 자동 저장 (localStorage)
- 검색창 포커스 시 최근 검색 드롭다운
- 개별/전체 기록 삭제

**Priority:** P2-MEDIUM
**Estimated Effort:** 4 hours

---

## Part 6: Edge Cases & Error Handling

### 6.1 Empty State Handling

**Current Feature Check:**
- Saved Searches 기능: **구현됨** (`SavedSearches.tsx`)

**Required Empty States:**
| Screen | Current | Required |
|--------|---------|----------|
| 검색 결과 0건 | 빈 화면 | "검색 결과가 없습니다. 다른 조건으로 검색해보세요." + CTA 버튼 |
| 저장된 검색 0건 | 빈 리스트 | "저장된 검색이 없습니다." + "검색을 저장하려면 검색 후 저장 버튼을 클릭하세요." |
| Risk Dashboard 0건 | 빈 탭 | "리스크 항목이 없습니다. 모든 데이터가 정상입니다." |

**Acceptance Criteria:**
- [ ] 모든 empty state에 안내 메시지
- [ ] 적절한 일러스트/아이콘
- [ ] 다음 액션 유도 (CTA 버튼)

**Priority:** P2-MEDIUM
**Estimated Effort:** 2 hours

---

### 6.2 Error Recovery

**Required:**
- 자동 재시도 (3회)
- 수동 재시도 버튼
- 오프라인 감지 및 알림

**Priority:** P2-MEDIUM
**Estimated Effort:** 4 hours

---

## Implementation Roadmap

### Week 1: Performance (P0) + Data Integrity (P1)
- [ ] Search caching (Phase 1) (Day 1-2)
- [ ] Parallel query execution (Day 2)
- [ ] Race condition fix (Day 3)
- [ ] Facet count recalculation (Day 3-4)
- [ ] pg_trgm index for similar names (Day 4)

### Week 2: Performance Phase 2 + UX (P2)
- [ ] Synonym table + JOIN optimization (Day 1-3)
- [ ] Loading states (Day 3)
- [ ] Saved search UX improvements (Day 4)
- [ ] Filter persistence (Day 4)
- [ ] Field confidence visualization (Day 5)

### Week 3: Features + Polish (P2)
- [ ] Bulk actions (Day 1-2)
- [ ] Search history (Day 2-3)
- [ ] Empty states (Day 4)
- [ ] Error recovery (Day 4-5)

### Week 4: Performance Phase 3 (Optional)
- [ ] Meilisearch evaluation
- [ ] POC implementation
- [ ] Performance comparison

---

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 2 Target |
|--------|---------|----------------|----------------|
| P95 Search latency | ~800ms | <300ms | <150ms |
| Cache hit ratio | 0% | >40% | >60% |
| Data integrity issues | 2 | 0 | 0 |
| User task completion rate | Unknown | >90% | >95% |

---

## Decision Log

| Date | Decision | Rationale | Owner |
|------|----------|-----------|-------|
| 2026-01-12 | 동의어 확장 유지 | 검색 정확도가 속도보다 중요 (헤드헌터 피드백) | PM |
| 2026-01-12 | Export 기능 스펙 제외 | 우선순위 조정 | PM |
| 2026-01-12 | Phase 1 캐싱 우선 | 빠른 효과, 낮은 리스크 | Eng Lead |

---

## Open Questions & Hurdles

### 허들 (Hurdles)
1. **Vercel KV 비용**: 월 $150+ 예상, 예산 승인 필요
2. **PostgreSQL FTS Thesaurus**: Supabase에서 커스텀 thesaurus 설정 가능 여부 확인 필요
3. **Meilisearch 데이터 동기화**: 실시간 동기화 vs 배치 동기화 결정 필요

### 리스크 (Risks)
1. **캐시 무효화**: 후보자 데이터 변경 시 관련 검색 캐시 무효화 전략 필요
2. **Phase 2 복잡성**: Synonym table 마이그레이션 시 기존 검색 로직과 호환성 테스트 필요
3. **동시성 이슈**: Parallel query 실행 시 DB 커넥션 풀 고갈 가능성

### 의사결정 필요 사항
1. **캐싱 솔루션 선택**: Vercel KV vs Redis (Upstash) vs 자체 호스팅
2. **Phase 2 진입 기준**: Phase 1 완료 후 성능 목표 달성 여부에 따라 결정
3. **Meilisearch 도입 시점**: Phase 2로 충분하지 않을 경우에만 고려

---

## Appendix: QA Test Results Summary

### Critical (Security - RLS Protected)
1. ✅ Risk API - RLS 정책으로 보호됨
2. ⚠️ Duplicate hash - 개선 권장 (동명이인 구분)

### High (Fix This Sprint)
3. ⚠️ Race condition in use_count increment
4. ⚠️ Facet count inconsistency
5. ⚠️ Search performance (동의어 확장 유지하며 최적화)
6. ⚠️ N+1 query in similar names

### Medium (Fix Next Sprint)
7. 📝 Filter reset on query change
8. 📝 Missing loading states
9. 📝 Saved search UX improvements
10. 📝 No bulk actions
11. 📝 No search history
12. 📝 Inconsistent empty states
13. 📝 Poor field confidence visualization

### Low (Backlog)
14. 💡 Keyboard navigation improvements
15. 💡 Mobile responsiveness
16. 💡 Accessibility (ARIA labels)
17. 💡 Analytics dashboard
18. 💡 Match reason explanation

---

**Document Approved By:**
- [ ] Engineering Lead
- [ ] Product Manager
- [ ] Security Team

**Review Date:** _______________
