# 🚀 스킬 매칭 혁신: 48시간 내 90% 정확도 달성

> **"The best part is no part. The best process is no process."** - Elon Musk
> **"Start with the customer and work backwards."** - Jeff Bezos

---

## Press Release (Working Backwards)

**서울, 2026년 2월** — 헤드헌터 플랫폼 Srchd가 오늘 스킬 매칭 정확도를 60%에서 90%로 향상시키는 업데이트를 발표했습니다.

**김지현 헤드헌터(가상 페르소나)의 화요일 오후가 달라집니다:**

> "어제 'React' 개발자를 찾느라 3시간을 썼는데, '리액트'라고 적은 5명의 우수 후보자를 놓쳤어요.
> 오늘 같은 검색을 했더니 30초 만에 15명을 찾았고, 그 중 3명과 통화 일정을 잡았습니다.
> 이번 달 수수료가 2건 더 나올 것 같아요."

**핵심 가치:**
- 후보자 검색 시간: 3시간 → 30초
- 놓치는 후보자: 5명 → 0명
- 월간 추가 계약: +2건 (약 1,500만원 수수료)

---

## 1. 문제 정의 (Problem Statement)

### 고객의 진짜 고통

| 고통 | 측정 | 비용 |
|-----|------|------|
| "React"로 검색하면 "리액트"가 안 나와요 | 매일 30분 낭비 | 월 10시간 |
| 같은 스킬인데 표기법이 달라서 놓쳐요 | 후보자 5명/건 누락 | 계약 1건/월 손실 |
| 동의어를 수동으로 검색해야 해요 | 추가 검색 3-5회/건 | 정신적 피로 |

### 원인 분석 (First Principles)

```
현재: JD 스킬 → 문자열 비교 → 후보자 스킬
문제: "React" ≠ "리액트" (문자열 불일치)

근본 원인: 스킬은 "문자열"이 아니라 "개념"이다
해결책: 개념 수준에서 매칭하면 된다

가장 단순한 해결책?
→ 동의어 사전 (Dictionary)
```

---

## 2. 해결책 (Solution)

### 2.1 48시간 MVP (Phase 0)

> "If you had to ship in 48 hours, what would you build?"

**Day 1 (8시간):**
```sql
-- 동의어 테이블에 500개 IT 스킬 추가
INSERT INTO skill_synonyms (canonical_skill, variant) VALUES
('react', '리액트'), ('react', 'reactjs'), ('react', 'react.js'),
('nodejs', 'node.js'), ('nodejs', 'node'), ('nodejs', '노드'),
('javascript', 'js'), ('javascript', '자바스크립트'),
('typescript', 'ts'), ('typescript', '타입스크립트'),
-- ... 500개 (IT 스킬 상위 95% 커버)
```

**Day 2 (8시간):**
```sql
-- 기존 match_candidates_to_position 수정
-- 동의어 JOIN 추가
WHERE c.skills && p_required_skills
   OR c.skills && (SELECT array_agg(variant) FROM skill_synonyms
                   WHERE canonical_skill = ANY(p_required_skills))
```

**예상 결과:**
- 정확도: 60% → **85%**
- 비용: **$0/월**
- 유지보수: **0시간/월** (정적 데이터)

### 2.2 2주 검증 (Phase 0.5)

MVP 배포 후 2주간 측정:

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 스킬 매칭률 | > 85% | 검색 로그 분석 |
| 헤드헌터 NPS | > 50 | 설문 (10명) |
| 누락 스킬 쌍 | < 50개 | 미매칭 로그 수집 |

**의사결정 기준:**
- ✅ 85% 달성 + NPS 50+ → Phase 0.5로 유지, LLM 투자 불필요
- ⚠️ 80-85% + 누락 스킬 50개 이하 → 수동 큐레이션으로 보완
- ❌ < 80% 또는 누락 스킬 100개+ → Phase 1 진행

### 2.3 4주 확장 (Phase 1) - 조건부

> **이 단계는 Phase 0.5에서 85% 미달 시에만 진행**

Phase 0.5 누락 스킬 분석 결과에 따라:

**Option A: 수동 큐레이션 (권장)**
- 누락 스킬 50개를 수동으로 동의어 추가
- 비용: 4시간 PM 작업
- 예상 결과: 85% → 90%

**Option B: 퍼지 매칭 추가**
- pg_trgm 확장 활용 (이미 설치됨)
- 편집 거리 0.3 이상 매칭
- 비용: 2일 개발
- 예상 결과: 85% → 88%

**Option C: 임베딩 유사도 (최후 수단)**
- 스킬 임베딩 생성 + 코사인 유사도
- 비용: 1주 개발 + $10/월
- 예상 결과: 88% → 92%

---

## 3. 기능 명세 (Minimal Spec)

### FR-001: 동의어 매칭

```
입력: JD 스킬 ["React", "Node.js"]
처리: skill_synonyms 테이블 JOIN
출력: ["React", "리액트", "reactjs", "Node.js", "nodejs", "노드"]
```

**수용 기준:**
- [ ] "React" 검색 시 "리액트" 후보자 포함
- [ ] 응답 시간 변화 < 100ms
- [ ] 기존 테스트 모두 통과

### FR-002: 매칭 이유 표시

```
UI: "리액트 → React (동의어 매칭)"
```

**수용 기준:**
- [ ] 매칭된 스킬에 배지 표시
- [ ] 툴팁으로 매칭 유형 설명

---

## 4. 성공 지표 (Only What Matters)

| 지표 | 현재 | 목표 | 왜 중요한가? |
|------|------|------|------------|
| **헤드헌터 월간 계약 수** | N건 | N+2건 | 고객 비즈니스 성과 |
| **검색-통화 전환율** | X% | X+10% | 매칭 품질 지표 |
| **주간 활성 검색 수** | Y회 | Y+20% | 신뢰도 지표 |

~~스킬 매칭률~~, ~~캐시 적중률~~, ~~p95 응답시간~~ → 이건 내부 지표, 고객은 관심 없음

---

## 5. 비용 분석 (Frugality)

### Phase 0 (48시간 MVP)
| 항목 | 비용 |
|------|------|
| 개발 시간 | 16시간 (2일) |
| 인프라 | $0 |
| 월 운영 | $0 |
| **총계** | **2일 개발** |

### Phase 1 (LLM 방식) - 비교용
| 항목 | 비용 |
|------|------|
| 개발 시간 | 160시간 (4주) |
| 인프라 | $50/월 |
| 월 운영 | 10시간/월 |
| **총계** | **10x 비용** |

**질문: 10x 비용으로 5% 추가 개선이 가치 있는가?**

85% → 90% (5% 개선)을 위해:
- 4주 개발 vs 2일 개발 = 10x
- $50/월 vs $0/월 = ∞x
- 10시간/월 운영 vs 0시간/월 = ∞x

**답: 아니오.** 85%에서 시작하고 데이터를 보고 결정.

---

## 6. 리스크 및 킬 크라이테리아

### 킬 크라이테리아 (언제 포기하는가?)

| 상황 | 액션 |
|------|------|
| 2주 후 매칭률 < 80% | Phase 1 재검토 |
| 헤드헌터 NPS 변화 없음 | 문제 재정의 |
| 동의어 추가 요청 > 100개/주 | 자동화 검토 |

### 롤백 계획

```sql
-- 1분 내 롤백 가능
ALTER TABLE skill_synonyms DISABLE TRIGGER ALL;
-- 또는 feature flag
SET app.use_synonym_matching = false;
```

---

## 7. 구현 일정

### Week 1 (필수)
| 일 | 작업 | 담당 | 완료 기준 |
|----|------|------|----------|
| Mon | 동의어 500개 데이터 준비 | PM | CSV 파일 |
| Tue | SQL 마이그레이션 배포 | Backend | 프로덕션 반영 |
| Wed | 매칭 결과 UI 수정 | Frontend | 배지 표시 |
| Thu | QA 테스트 | QA | 버그 0개 |
| Fri | 프로덕션 배포 | Backend | 100% 롤아웃 |

### Week 2 (측정)
| 작업 | 담당 |
|------|------|
| 검색 로그 분석 | Data |
| 헤드헌터 5명 인터뷰 | PM |
| NPS 설문 | PM |
| 누락 스킬 리스트 작성 | PM |

### Week 3-4 (조건부)
- Phase 0.5 결과에 따라 결정
- **Default: 추가 개발 없음**

---

## 8. 경쟁 분석

| 경쟁사 | 스킬 매칭 방식 | 우리 차별점 |
|-------|--------------|------------|
| LinkedIn | 키워드 + 시맨틱 | 한국어 동의어 특화 |
| Wanted | 키워드 | 더 정확 |
| 사람인 | 키워드 | 더 정확 |

**진짜 경쟁우위:** 한국 IT 스킬 동의어 DB (리액트↔React)

**따라하는데 걸리는 시간:** 2주 (방어 불가)

**그래서?** 빠르게 배포하고 사용자 데이터로 개선

---

## 9. FAQ (Bezos가 물을 질문들)

**Q: 60% 매칭률이라는 숫자는 어디서 왔나요?**
A: 추정치입니다. Phase 0 배포 후 실측하겠습니다.

**Q: 왜 LLM 없이 시작하나요?**
A: 동의어 사전으로 85% 달성 가능합니다. 나머지 5%를 위해 10x 복잡도를 추가할 필요가 없습니다.

**Q: 헤드헌터 5명에게 보여줬나요?**
A: 아직입니다. Week 2에 인터뷰 예정입니다.

**Q: 이거 말고 뭘 더 빌드할 수 있나요?**
A: Paddle 결제 연동 (매출 차단 중), 벌크 내보내기, 모바일 안정화. 이 기능은 2일이라 다른 것도 가능합니다.

**Q: 실패하면 어떻게 되나요?**
A: 2일 개발 손실. 롤백 1분. 리스크 최소.

---

## 10. 승인

| 역할 | 질문 | 승인 |
|-----|------|------|
| CEO | 2일 개발로 월 2건 추가 계약? | ⏳ |
| CTO | 복잡도 최소, 롤백 가능? | ⏳ |

---

## Appendix A: 동의어 데이터 샘플

```csv
canonical_skill,variant
react,리액트
react,reactjs
react,react.js
react,react 18
nodejs,node.js
nodejs,node
nodejs,노드
javascript,js
javascript,자바스크립트
typescript,ts
typescript,타입스크립트
python,파이썬
java,자바
kotlin,코틀린
swift,스위프트
golang,go
golang,고랭
kubernetes,k8s
kubernetes,쿠버네티스
docker,도커
aws,아마존웹서비스
aws,amazon web services
gcp,google cloud
gcp,구글클라우드
cicd,ci/cd
cicd,jenkins
cicd,github actions
cicd,gitlab ci
```

**총 500개 스킬 커버 목표** (IT 스킬 검색의 95%)

---

## Appendix B: 확장 계획 (Phase 1 이후)

> **이 섹션은 Phase 0.5에서 85% 미달 시에만 검토**

### B.1 퍼지 매칭 (pg_trgm)

```sql
-- 이미 설치됨
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 오타 허용 매칭
WHERE similarity(jd_skill, candidate_skill) > 0.3
```

### B.2 임베딩 유사도

```python
# 기존 embedding_service.py 활용
embedding = get_embedding(skill_name)
similarity = cosine_similarity(jd_embedding, candidate_embedding)
if similarity > 0.85:
    match = True
```

### B.3 LLM 학습 (최후 수단)

> **이 옵션은 Phase 0.5 + 퍼지 + 임베딩으로도 90% 미달 시에만 검토**
> **예상: 필요 없을 확률 90%**

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|------|----------|
| 1.0 | 2026-01-31 | 최초 작성 (LLM 중심 4주 계획) |
| 2.0 | 2026-02-01 | 전문가 리뷰 반영 (770줄) |
| **3.0** | 2026-02-01 | **완전 재작성: 48시간 MVP + 조건부 확장** |

---

## 핵심 원칙 체크리스트

- [x] **Customer Obsession**: 헤드헌터 김지현의 화요일 오후가 달라짐
- [x] **Simplicity**: 동의어 사전 500개 = 85% 해결
- [x] **Frugality**: $0/월, 2일 개발
- [x] **Bias for Action**: 48시간 내 배포 가능
- [x] **Data-Driven**: Phase 0.5에서 측정 후 결정
- [x] **Reversible Decision**: 1분 내 롤백
- [x] **First Principles**: 스킬은 문자열이 아니라 개념
- [x] **Kill Criteria**: 80% 미달 시 재검토

---

**"Move fast. Break things. But measure first."**

문서 끝.
 