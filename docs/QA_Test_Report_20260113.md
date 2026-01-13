# QA 테스트 보고서: DB 기반 동의어 검색

> **보고일**: 2026-01-13
> **작성자**: Senior QA Engineer (FAANG Background)
> **수신**: Product Manager

---

## 1. Executive Summary

### 테스트 목적
PM이 선정한 6개 직군 600개 핵심 키워드를 기반으로 DB 기반 동의어 검색의 정확성 및 AI 유사성 매칭 가능 여부를 검증

### 테스트 결과 요약

| 테스트 유형 | 총 케이스 | 통과 | 실패 | 성공률 |
|------------|----------|------|------|--------|
| **DB 동의어 매칭** | 27 | 24 | 3 | **88.9%** |
| **AI 유사성 매칭** | 8 | 3 | 5 | **37.5%** |

---

## 2. 직군별 테스트 커버리지

| 직군 | 테스트 케이스 | 통과 | 실패 | 커버리지 |
|------|-------------|------|------|---------|
| Frontend | 7 | 6 | 1 | 85.7% |
| Backend | 5 | 5 | 0 | 100% |
| Data/ML | 4 | 3 | 1 | 75% |
| Mobile | 3 | 3 | 0 | 100% |
| DevOps | 3 | 3 | 0 | 100% |
| PM/Design | 3 | 2 | 1 | 66.7% |
| Edge Cases | 3 | 3 | 0 | 100% |

---

## 3. 테스트 상세 결과

### 3.1 ✅ 정상 작동 확인된 기능

#### 한글 혼합 쿼리 (Mixed Language Query)
```
✅ "React개발자" → ["React", "개발자"] 분리 성공
✅ "자바개발자" → ["Java", "개발자"] 분리 성공
✅ "시니어React" → ["시니어", "React"] 분리 성공
✅ "C++개발자" → ["C++", "개발자"] 특수문자 보존
✅ "Node.js시니어" → ["Node.js", "시니어"] 분리 성공
✅ "5년차React개발자" → ["5년차", "React", "개발자"] 숫자+한글 보존
```

#### DB 동의어 확장
```
✅ "리액트" → ["React", "React.js", "ReactJS", "리액트"]
✅ "스프링" → ["Spring", "SpringBoot", "Spring Boot", "스프링", "스프링부트"]
✅ "쿠버네티스" → ["Kubernetes", "K8s", "k8s", "쿠버네티스"]
✅ "머신러닝" → ["Machine Learning", "ML", "머신러닝"]
```

#### 직책 동의어
```
✅ "프론트엔드개발자" → ["Frontend Developer", "FE개발자", "프론트엔드엔지니어"]
✅ "백엔드개발자" → ["Backend Developer", "BE개발자", "서버개발자"]
✅ "DevOps엔지니어" → ["DevOps Engineer", "데브옵스"]
```

### 3.2 ❌ 실패한 테스트 케이스

| # | 입력 | 기대 결과 | 실제 결과 | 원인 |
|---|------|----------|----------|------|
| 1 | `웹접근성` | ["a11y", "WCAG"] | ["웹접근성"] | DB에 동의어 미등록 |
| 2 | `데이터엔지니어` | ["DE"] | ["Data Engineer"] | "DE" 약어 누락 |
| 3 | `프로덕트매니저` | ["PM"] | ["Product Manager"] | "PM" 약어 누락 |

---

## 4. AI 유사성 매칭 테스트 (DB에 없는 키워드)

### 4.1 테스트 결과

| 입력 | 기대 매칭 | 실제 결과 | 상태 |
|------|----------|----------|------|
| `ReactJS전문가` | React | React | ✅ 성공 (동의어 등록됨) |
| `프런트앤드` | 프론트엔드 | ❌ 매칭 실패 | ⚠️ 오타 미지원 |
| `백앤드` | 백엔드 | ❌ 매칭 실패 | ⚠️ 오타 미지원 |
| `Golang개발자` | Go | Go | ✅ 성공 (동의어 등록됨) |
| `쿠베르네티스` | Kubernetes | ❌ 매칭 실패 | ⚠️ 발음 유사성 미지원 |
| `NextJS개발` | Next.js | Next.js | ✅ 성공 (동의어 등록됨) |
| `타스` | TypeScript | ❌ 매칭 실패 | ⚠️ 구어체 미지원 |
| `노션` | Notion | Notion | ✅ 성공 (동의어 등록됨) |

### 4.2 AI 유사성 미지원 현황

**현재 시스템은 다음 기능을 지원하지 않습니다:**

1. **오타 교정** (Typo Correction)
   - `프런트앤드` → `프론트엔드` ❌
   - `백앤드` → `백엔드` ❌

2. **발음 기반 매칭** (Phonetic Matching)
   - `쿠베르네티스` → `쿠버네티스` ❌

3. **구어체/속어 매칭** (Colloquial)
   - `타스` → `TypeScript` ❌

4. **유사 철자 매칭** (Fuzzy Matching)
   - `Reactjs` vs `React.js` (현재는 DB 등록 필요)

---

## 5. 발견된 이슈 및 개선사항

### 5.1 Critical Issues (즉시 수정 필요)

| # | 이슈 | 영향도 | 권장 조치 |
|---|------|-------|----------|
| C1 | 일부 약어(DE, PM, DS 등) 동의어 누락 | High | Migration 027에 추가 |
| C2 | 접근성 관련 동의어(a11y, WCAG) 누락 | Medium | Migration 027에 추가 |

### 5.2 High Priority (다음 스프린트)

| # | 이슈 | 영향도 | 권장 조치 |
|---|------|-------|----------|
| H1 | AI 유사성 매칭 미구현 | High | Semantic Search 확장 |
| H2 | 오타 교정 미지원 | Medium | Levenshtein Distance 적용 |
| H3 | 동의어 자동 학습 부재 | Medium | 검색 로그 분석 시스템 |

### 5.3 Medium Priority (로드맵)

| # | 이슈 | 영향도 | 권장 조치 |
|---|------|-------|----------|
| M1 | 발음 기반 매칭 미지원 | Low | 한글 발음 변환 알고리즘 |
| M2 | 구어체/속어 사전 부재 | Low | 커뮤니티 기반 사전 구축 |

---

## 6. 테스트되지 않은 영역

### 6.1 테스트 미수행 항목

1. **성능 테스트**
   - 동의어 캐시 TTL(5분) 만료 시 DB 쿼리 지연
   - 대량 동시 검색 요청 시 캐시 갱신 충돌

2. **통합 테스트**
   - 실제 candidates 테이블과 연동 검색
   - Vector 검색 + 동의어 확장 조합

3. **UI 테스트**
   - 검색 결과에 동의어 확장 결과 표시 여부
   - 파싱된 키워드 태그 표시

### 6.2 추가 테스트 필요 영역

- **경력 연차 + 스킬 조합 검색**: "5년차 React시니어"
- **복합 필터 + 동의어**: 스킬 필터 + 회사 필터 + 동의어 확장
- **대소문자 변환**: "REACT", "react", "React" 동일 처리 여부

---

## 7. 권장 조치사항

### 즉시 조치 (P0)

```sql
-- 누락된 동의어 추가
INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
    ('웹접근성', 'a11y'),
    ('웹접근성', 'WCAG'),
    ('데이터엔지니어', 'DE'),
    ('데이터과학자', 'DS'),
    ('Product Manager', 'PM'),
    ('UX디자이너', 'UXD'),
    ('UI디자이너', 'UID')
ON CONFLICT (variant) DO NOTHING;
```

### Phase 2 개발 (P1)

1. **AI 유사성 매칭 구현**
   ```typescript
   // OpenAI Embedding 기반 유사도 계산
   async function findSimilarSkills(query: string): Promise<string[]> {
     const queryEmbedding = await generateEmbedding(query);
     const { data } = await supabase.rpc('search_similar_skills', {
       p_embedding: queryEmbedding,
       p_threshold: 0.8
     });
     return data.map(r => r.skill);
   }
   ```

2. **오타 교정 구현**
   ```typescript
   // Levenshtein Distance 기반
   function correctTypo(input: string, dictionary: string[]): string | null {
     const closest = dictionary.find(word =>
       levenshteinDistance(input, word) <= 2
     );
     return closest;
   }
   ```

---

## 8. 결론

### 테스트 요약

- **DB 동의어 매칭**: 88.9% 성공률, 3건 동의어 누락
- **AI 유사성 매칭**: 37.5% 성공률, 미구현 기능으로 인한 한계
- **한글 혼합 쿼리**: 100% 정상 작동

### QA 판정

| 항목 | 판정 | 비고 |
|------|------|------|
| DB 동의어 매칭 | **PASS** | 누락 동의어 추가 후 재테스트 필요 |
| 한글 혼합 쿼리 | **PASS** | 모든 케이스 통과 |
| AI 유사성 매칭 | **CONDITIONAL** | 기능 미구현, Phase 2 개발 필요 |

### 최종 권고

1. ✅ **DB 기반 동의어 검색은 Production Ready**
2. ⚠️ **누락된 동의어 즉시 추가 필요**
3. 🔄 **AI 유사성 매칭은 Phase 2로 로드맵 반영**

---

*Senior QA Engineer*
*FAANG Background*
