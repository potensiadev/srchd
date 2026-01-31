# PRD: Position-Candidate Hybrid Semantic Matching v1.1

> **문서 버전**: 1.2.0
> **작성일**: 2026-01-31
> **최종 수정**: 2026-02-01
> **상태**: 검토 대기
> **관련 문서**: [Architecture v1.1.0](../architecture/position_search_architecture.md)

---

## 1. 개요

### 1.1 요약

| 항목 | 내용 |
|-----|-----|
| **기능명** | Position-Candidate Hybrid Semantic Matching |
| **우선순위** | P0 (Critical) |
| **예상 릴리즈** | 4주 (Week 1-4) |
| **담당** | Backend Team, AI Team |

### 1.2 배경

현재 JD-후보자 매칭 시스템의 한계:

**문제점 1: 스킬 매칭의 정확 문자열 의존**
```
JD: required_skills = ["React", "Node.js"]
이력서: skills = ["리액트", "NodeJS"]

현재 시스템: 매칭 0% (문자열 불일치)
실제: 동일한 기술, 100% 매칭되어야 함
```

**문제점 2: skill_synonyms 테이블의 한계**
- 수동으로 동의어 사전 관리 필요
- 새로운 기술/표기법 대응 불가
- 한글/영어 혼용, 오타 대응 불가

**문제점 3: 의미적 연관성 이해 부재**
```
JD: "CI/CD 경험자 우대"
이력서: skills = ["Jenkins", "GitHub Actions"]

현재 시스템: 연관성 인식 불가
실제: CI/CD 도구 경험자로 매칭되어야 함
```

### 1.3 목표

1. **스킬 매칭 정확도 향상**: 동의어, 유사 스킬 자동 인식
2. **검색 커버리지 확대**: 의미적으로 연관된 스킬까지 매칭
3. **사용자 경험 유지**: 모든 AI 학습은 백그라운드, UX 영향 0
4. **점진적 학습**: 시스템 사용 시 자동으로 매칭 품질 향상

### 1.4 성공 지표 (KPIs)

| 지표 | 현재 | 목표 | 측정 방법 |
|-----|-----|-----|---------|
| 스킬 매칭률 | 60% (추정) | > 90% | 동의어 포함 매칭 비율 |
| JD 매칭 응답 시간 | 2-3초 | < 3초 (유지) | API p95 latency |
| 시맨틱 캐시 적중률 | 0% (미구현) | > 70% | 캐시 사용 비율 |
| 새 후보자 발견률 | 0% | > 15% | 백그라운드 학습으로 추가 발견 |

### 1.5 범위 (Scope)

#### In Scope (포함)
- 스킬명 동의어/유사어 자동 매칭 (React ↔ 리액트)
- 의미적 연관 스킬 매칭 (CI/CD ↔ Jenkins)
- 백그라운드 LLM 학습 (사용자 UX 영향 없음)
- 실시간 알림 (새 후보자 발견 시)
- 하이브리드 검색 (키워드 + 시맨틱캐시 + 벡터)

#### Out of Scope (제외)
| 항목 | 이유 | 대응 |
|------|------|------|
| **스킬 숙련도 판단** | LLM으로 정확한 숙련도 판단 어려움 | 총 경력 년수로 보완 |
| **도메인 특수 스킬** | 전문 분야 LLM 이해 제한 | 수동 매핑 추가 지원 |
| **실시간 LLM 검증** | UX 지연 발생 | 백그라운드 학습으로 대체 |
| **스킬 조합 시너지** | 복잡도 높음, Phase 2 고려 | 향후 개선 |
| **사용자별 맞춤 가중치** | 초기 버전 복잡도 | 향후 개선 |

---

## 2. 기능 요구사항 (Functional Requirements)

### FR-001: 스킬 임베딩 자동 생성

| ID | FR-001 |
|---|---|
| **설명** | JD 또는 이력서에서 새로운 스킬 발견 시 자동으로 임베딩 벡터 생성 |
| **트리거** | Position 생성, Candidate 분석 완료 |
| **처리** | 1. 스킬명 정규화 (소문자, 공백 제거)<br>2. skill_embeddings 테이블 조회<br>3. 없으면 OpenAI 임베딩 생성 후 저장 |
| **수용 기준** | 1. 신규 스킬 100% 임베딩 생성<br>2. 중복 스킬 재생성 안 함<br>3. 임베딩 생성 실패 시 재시도 (최대 3회) |

### FR-002: 하이브리드 검색 실행

| ID | FR-002 |
|---|---|
| **설명** | JD 업로드 시 키워드 + 시맨틱캐시 + 벡터 3가지 방식으로 동시 검색 |
| **검색 순서** | 1. 키워드 정확 매칭 (가중치 1.0)<br>2. 시맨틱 캐시 조회 (가중치 0.95)<br>3. 벡터 유사도 검색 (가중치 0.8) |
| **결과 통합** | 각 방식의 매칭 결과를 가중 평균하여 최종 점수 산출 |
| **수용 기준** | 1. 3가지 검색 방식 모두 실행<br>2. 중복 매칭 제거<br>3. 응답 시간 3초 이내 |

### FR-003: 백그라운드 LLM 학습 (즉시)

| ID | FR-003 |
|---|---|
| **설명** | JD 업로드 직후 신규 스킬에 대해 LLM 분석 실행 (백그라운드) |
| **트리거** | skill_learning_queue에 신규 스킬 등록 |
| **처리** | 1. LLM에 스킬 분석 요청<br>2. 관련 스킬 매핑 생성<br>3. skill_semantic_cache 저장<br>4. 추가 후보자 검색<br>5. 발견 시 알림 등록 |
| **수용 기준** | 1. 사용자 응답에 영향 없음<br>2. 분석 완료 후 즉시 캐시 반영<br>3. 새 후보자 발견 시 알림 |

### FR-004: 배치 학습 (크론잡)

| ID | FR-004 |
|---|---|
| **설명** | 정기적으로 미검증 스킬 쌍 학습 및 캐시 최적화 |
| **주기** | 매 시간 (경량) / 매일 (전체) |
| **작업 내용** | 1. 미검증 스킬 쌍 LLM 분석 (유사도 0.4~0.9 범위만, 전체의 ~10%)<br>2. 스킬 카테고리 분류 (category_l1, l2)<br>3. 스킬 관계 그래프 보강 (parent/child/sibling)<br>4. 오래된 매핑 재검증 (6개월 이상)<br>5. 미사용 데이터 정리 (usage_count=0) |
| **수용 기준** | 1. 일일 처리량 > 1000쌍<br>2. 시스템 부하 < 10%<br>3. 비용 < $1/일 (GPT-4o-mini 사용) |

### FR-005: 실시간 알림

| ID | FR-005 |
|---|---|
| **설명** | 백그라운드 학습으로 새 후보자 발견 시 실시간 알림 |
| **채널** | Supabase Realtime → 토스트 UI |
| **내용** | "새로운 매칭 후보자 N명 발견!" + 발견 사유 |
| **수용 기준** | 1. 알림 도달 < 1초<br>2. 사용자가 해당 Position 페이지에 있을 때만<br>3. 중복 알림 방지 |

---

## 3. 비기능 요구사항 (Non-Functional Requirements)

### NFR-001: 성능

| 지표 | 요구사항 | 측정 방법 |
|-----|---------|---------|
| JD 매칭 API 응답 | p95 < 3초 | Sentry/DataDog |
| 하이브리드 검색 쿼리 | p95 < 500ms | DB slow query log |
| 벡터 유사도 검색 | p95 < 200ms | pgvector metrics |
| 실시간 알림 지연 | p95 < 1초 | Supabase Realtime |
| 백그라운드 작업 | 사용자 API 영향 0% | 별도 워커 프로세스 |

### NFR-002: 확장성

| 항목 | 현재 예상 | 1년 후 목표 |
|-----|----------|-----------|
| 스킬 종류 | 10,000개 | 50,000개 |
| 시맨틱 캐시 | 100,000쌍 | 1,000,000쌍 |
| 후보자 수 | 100,000명 | 500,000명 |
| JD 수 | 10,000개 | 50,000개 |
| 동시 접속 | 100명 | 1,000명 |

**벡터 인덱스 설정**:
- IVFFlat lists = 100 (스킬 10,000개 기준)
- 스킬 증가 시 lists 조정 필요 (sqrt(n) 권장)

### NFR-003: 비용

> **모델 선택**: GPT-4o-mini (스킬 분석에 충분한 성능, GPT-4 대비 90% 비용 절감)

| 항목 | 단가 | 월 예상 비용 | 비고 |
|-----|-----|------------|------|
| OpenAI 임베딩 | $0.0001/스킬 | $10 | 10만 스킬 기준, 1회성 |
| LLM 분석 (즉시) | $0.001/스킬 | $10 | 1만 신규 스킬, GPT-4o-mini |
| LLM 배치 학습 | $0.05~$1/일 | $1.5~$30 | 신규 스킬 유입량 비례 |
| **총계** | | **~$20~$50/월** | 초기 구축 제외 |

**초기 시드 구축 비용 (1회성)**:
| 기존 스킬 수 | LLM 검증 대상 (10%) | GPT-4o-mini 비용 |
|------------|-------------------|-----------------|
| 1,000개 | ~50K 쌍 | ~$5 |
| 5,000개 | ~1.25M 쌍 | ~$125 |
| 10,000개 | ~5M 쌍 | ~$500 |

### NFR-004: 가용성

- 시스템 가용성: 99.9%
- 백그라운드 워커 장애 시: 실시간 매칭에 영향 없음 (벡터 검색으로 대체)
- LLM API 장애 시: 임베딩 유사도로 폴백

### NFR-005: 데이터 보안

- 스킬 데이터: 민감 정보 아님, 암호화 불필요
- LLM 전송 데이터: 스킬명만 전송 (개인정보 없음)
- 로그: 스킬명, 유사도 점수만 기록

---

## 4. 사용자 스토리

### US-001: 스킬 동의어 자동 매칭

```
AS A 헤드헌터
I WANT TO "React" 검색 시 "리액트" 보유자도 매칭
SO THAT 표기법 차이로 적합한 후보자를 놓치지 않음

Acceptance Criteria:
- GIVEN JD에 "React" 스킬이 있을 때
- WHEN 후보자가 "리액트"를 스킬로 보유하고 있으면
- THEN 해당 후보자가 매칭 결과에 포함됨 (유사도 > 0.9)
```

### US-002: 관련 스킬 자동 발견

```
AS A 헤드헌터
I WANT TO "CI/CD 경험" 검색 시 Jenkins 경험자도 발견
SO THAT 의미적으로 연관된 스킬 보유자도 찾을 수 있음

Acceptance Criteria:
- GIVEN JD에 "CI/CD 경험"이 있을 때
- WHEN 백그라운드 LLM 분석이 완료되면
- THEN Jenkins, GitHub Actions 등 보유자도 매칭 결과에 추가됨
- AND 토스트 알림으로 "새로운 후보자 N명 발견" 표시
```

### US-003: 즉각적인 매칭 결과

```
AS A 헤드헌터
I WANT TO JD 업로드 후 3초 내에 매칭 결과 확인
SO THAT 빠르게 후보자 검토 시작 가능

Acceptance Criteria:
- GIVEN JD 파일을 업로드하면
- WHEN 스킬 추출 및 매칭이 완료되면
- THEN 3초 이내에 상위 20명의 매칭 후보자 표시
- AND 백그라운드 학습은 별도로 진행 (UX 영향 없음)
```

### US-004: 점진적 품질 향상

```
AS A 시스템 관리자
I WANT TO 시스템 사용 시 자동으로 매칭 품질 향상
SO THAT 수동 관리 없이 검색 정확도 개선

Acceptance Criteria:
- GIVEN 새로운 스킬/표기법이 등장하면
- WHEN 배치 학습이 실행되면
- THEN skill_semantic_cache에 새 매핑 추가
- AND 다음 검색부터 해당 매핑 활용
```

---

## 5. 기술 설계

### 5.1 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              시스템 구성요소                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │
│  │   Next.js   │   │   Worker    │   │  Supabase   │   │   OpenAI    │         │
│  │   Frontend  │   │   (Python)  │   │     DB      │   │     API     │         │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘         │
│         │                 │                 │                 │                 │
│         │  API 호출       │  백그라운드      │  데이터 저장     │  임베딩/LLM     │
│         │                 │  학습           │                 │                 │
│         ▼                 ▼                 ▼                 ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           핵심 기능                                      │   │
│  │                                                                         │   │
│  │   [JD 업로드] → [스킬 추출] → [하이브리드 검색] → [결과 반환]              │   │
│  │                      │                                                  │   │
│  │                      ▼                                                  │   │
│  │   [신규 스킬] → [학습 큐] → [LLM 분석] → [캐시 저장] → [알림]             │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 데이터베이스 스키마

```sql
-- 1. 스킬 임베딩
CREATE TABLE skill_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name TEXT NOT NULL,
    skill_normalized TEXT NOT NULL UNIQUE,
    embedding vector(1536) NOT NULL,
    category_l1 TEXT,
    category_l2 TEXT,
    usage_count INTEGER DEFAULT 1,
    source TEXT DEFAULT 'auto',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 시맨틱 캐시
CREATE TABLE skill_semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_a TEXT NOT NULL,
    skill_b TEXT NOT NULL,
    skill_a_normalized TEXT NOT NULL,
    skill_b_normalized TEXT NOT NULL,
    embedding_similarity FLOAT,
    semantic_score FLOAT NOT NULL,
    relationship TEXT,
    llm_reasoning TEXT,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    usage_count INTEGER DEFAULT 0,
    UNIQUE(skill_a_normalized, skill_b_normalized)
);

-- 3. 학습 큐
CREATE TABLE skill_learning_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name TEXT NOT NULL,
    skill_normalized TEXT NOT NULL UNIQUE,
    source_position_id UUID,
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- 4. 새 매칭 알림
CREATE TABLE position_new_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    discovered_by TEXT NOT NULL,
    match_reason TEXT,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(position_id, candidate_id)
);
```

### 5.3 하이브리드 검색 알고리즘

```python
def hybrid_skill_match(jd_skills: List[str], candidate_skills: List[str]) -> float:
    """
    3단계 하이브리드 스킬 매칭

    1단계: 키워드 정확 매칭 (가중치 1.0)
    2단계: 시맨틱 캐시 조회 (가중치 0.95)
    3단계: 벡터 유사도 (가중치 0.8)
    """
    total_score = 0
    matched_pairs = []

    for jd_skill in jd_skills:
        best_score = 0
        best_match = None
        match_type = None

        for cand_skill in candidate_skills:
            # 1단계: 키워드 정확 매칭
            if normalize(jd_skill) == normalize(cand_skill):
                score = 1.0
                if score > best_score:
                    best_score = score
                    best_match = cand_skill
                    match_type = "keyword"
                continue

            # 2단계: 시맨틱 캐시 조회
            cached = get_semantic_cache(jd_skill, cand_skill)
            if cached and cached.semantic_score >= 0.7:
                score = cached.semantic_score * 0.95
                if score > best_score:
                    best_score = score
                    best_match = cand_skill
                    match_type = "semantic_cache"
                continue

            # 3단계: 벡터 유사도
            similarity = cosine_similarity(
                get_embedding(jd_skill),
                get_embedding(cand_skill)
            )
            if similarity >= 0.85:
                score = similarity * 0.8
                if score > best_score:
                    best_score = score
                    best_match = cand_skill
                    match_type = "vector"

        if best_match:
            matched_pairs.append({
                "jd_skill": jd_skill,
                "candidate_skill": best_match,
                "score": best_score,
                "match_type": match_type
            })
            total_score += best_score

    return total_score / len(jd_skills) if jd_skills else 0
```

### 5.4 LLM 프롬프트 설계

> **모델**: GPT-4o-mini (스킬 분석에 충분, 비용 효율적)

```python
SKILL_ANALYSIS_PROMPT = """
다음 스킬을 분석해주세요: "{skill_name}"

1) 이 스킬이 무엇인지 담당자가 단어로 이해할 수 있도록 아는대로 나열하세요.
   (예시: 단어, 단어, 단어, 단어)

2) 이 스킬을 수행하는데 필요한 또는 유사한 스킬/툴/기술/분야/지식을
   3줄 이내로 설명해주세요.

   ※ 주의: 성실함, 집요함, 노력, 끈기 등 스킬/툴/기술과 관련 없는
   형용사나 능력은 절대 사용하지 마세요.

JSON으로 응답해주세요:
{{
  "keywords": ["관련 키워드들을 나열"],
  "description": ["3줄 이내 설명"],
  "related_skills": [
    {{
      "name": "관련 스킬명",
      "relationship": "identical|includes|similar|related",
      "score": 0.0-1.0
    }}
  ],
  "parent_skills": ["상위 개념 스킬"],
  "category_l1": "IT|제조|금융|의료|기타",
  "category_l2": "Frontend|Backend|DevOps|Data|Mobile|etc"
}}

relationship 설명:
- identical: 완전히 같은 스킬 (React = 리액트)
- includes: 포함 관계 (CI/CD는 Jenkins 포함)
- similar: 유사한 스킬 (React ~ Vue.js)
- related: 관련 있는 스킬 (React ~ Redux)
"""
```

**예시 응답 (스킬: "CI/CD 경험")**:
```json
{
  "keywords": [
    "Jenkins", "GitHub Actions", "GitLab CI", "CircleCI",
    "ArgoCD", "Travis CI", "Docker", "Kubernetes",
    "자동화 파이프라인", "빌드", "배포", "테스트 자동화"
  ],
  "description": [
    "CI/CD 구현에는 Jenkins, GitHub Actions 등 파이프라인 도구가 필요",
    "Docker/Kubernetes 컨테이너 기술과 YAML 설정 작성 능력이 관련됨",
    "Git 버전관리, 쉘 스크립트, 클라우드 인프라 지식 활용"
  ],
  "related_skills": [
    {"name": "Jenkins", "relationship": "includes", "score": 0.85},
    {"name": "GitHub Actions", "relationship": "includes", "score": 0.85},
    {"name": "DevOps", "relationship": "related", "score": 0.70}
  ],
  "parent_skills": ["DevOps", "자동화"],
  "category_l1": "IT",
  "category_l2": "DevOps"
}
```

---

## 6. 구현 계획

### 6.1 Phase 1: 데이터베이스 및 기본 인프라 (Week 1)

| Task | 설명 | 담당 |
|------|------|------|
| DB 마이그레이션 | skill_embeddings, skill_semantic_cache 등 테이블 생성 | Backend |
| 인덱스 최적화 | pgvector 인덱스, 조회 최적화 | Backend |
| 임베딩 서비스 | OpenAI 임베딩 생성 유틸리티 | Backend |
| 스킬 정규화 | 스킬명 정규화 함수 | Backend |

**산출물**:
- [ ] `supabase/migrations/xxx_skill_semantic_tables.sql`
- [ ] `apps/worker/services/skill_embedding_service.py`
- [ ] `lib/skill-normalization.ts`

### 6.2 Phase 2: 하이브리드 검색 구현 (Week 2)

| Task | 설명 | 담당 |
|------|------|------|
| RPC 함수 | match_candidates_hybrid SQL 함수 | Backend |
| API 수정 | /api/positions/auto-match 하이브리드 검색 적용 | Backend |
| 매칭 결과 UI | matchSources, matchedSkills 표시 | Frontend |

**산출물**:
- [ ] `supabase/migrations/xxx_hybrid_search_rpc.sql`
- [ ] `app/api/positions/auto-match/route.ts` 수정
- [ ] `components/positions/MatchedSkillsDisplay.tsx`

### 6.3 Phase 3: 백그라운드 학습 시스템 (Week 3)

| Task | 설명 | 담당 |
|------|------|------|
| 학습 큐 워커 | skill_learning_queue 처리 워커 | AI Team |
| LLM 분석 서비스 | 스킬 분석 프롬프트 및 파싱 | AI Team |
| 배치 크론잡 | 시간별/일별 배치 학습 | Backend |
| 실시간 알림 | Supabase Realtime 연동 | Frontend |

**산출물**:
- [ ] `apps/worker/services/skill_learning_service.py`
- [ ] `apps/worker/jobs/skill_batch_learning.py`
- [ ] `hooks/usePositionNewMatches.ts`
- [ ] `components/ui/NewMatchToast.tsx`

### 6.4 Phase 4: 테스트 및 최적화 (Week 4)

| Task | 설명 | 담당 |
|------|------|------|
| 단위 테스트 | 각 서비스 테스트 | All |
| 통합 테스트 | E2E 매칭 플로우 테스트 | QA |
| 성능 테스트 | 응답 시간, 부하 테스트 | Backend |
| 시드 데이터 | 주요 스킬 시맨틱 캐시 준비 | AI Team |

**산출물**:
- [ ] `apps/worker/tests/test_skill_learning.py`
- [ ] `tests/e2e/hybrid-matching.spec.ts`
- [ ] `scripts/seed_skill_semantic_cache.py`

---

## 7. 릴리즈 계획

| Phase | 범위 | 일정 | 상태 |
|-------|-----|-----|-----|
| **Phase 1** | DB 스키마, 임베딩 서비스 | Week 1 | ⏳ 예정 |
| **Phase 2** | 하이브리드 검색 RPC, API | Week 2 | ⏳ 예정 |
| **Phase 3** | 백그라운드 학습, 알림 | Week 3 | ⏳ 예정 |
| **Phase 4** | 테스트, 시드 데이터, 배포 | Week 4 | ⏳ 예정 |

---

## 8. 리스크 및 완화 방안

| 리스크 | 영향 | 확률 | 완화 방안 |
|-------|-----|-----|---------|
| **LLM API 지연/장애** | 백그라운드 학습 중단 | Medium | 벡터 검색으로 폴백, 재시도 로직 |
| **임베딩 품질 낮음** | 매칭 정확도 저하 | Medium | 시맨틱 캐시로 보완, 피드백 반영 |
| **비용 초과** | 운영 비용 증가 | Low | GPT-4o-mini 사용으로 90% 절감, 캐시 적극 활용 |
| **콜드 스타트** | 초기 정확도 낮음 | High | 시드 데이터 준비 (~$5-125), 점진적 롤아웃 |
| **실시간 알림 과다** | 사용자 피로 | Medium | 알림 빈도 제한, 설정 옵션 제공 |

### 8.1 Rollback 계획

하이브리드 매칭에 심각한 문제 발생 시 기존 키워드 매칭으로 즉시 롤백 가능해야 함.

| 단계 | 조건 | 액션 |
|------|------|------|
| **Level 1** | 응답 시간 > 5초 지속 | 벡터 검색 비활성화, 키워드+캐시만 사용 |
| **Level 2** | 매칭 정확도 50% 이하 | 시맨틱 캐시 비활성화, 키워드만 사용 |
| **Level 3** | 시스템 장애 | Feature flag로 전체 기능 비활성화, 기존 로직 사용 |

**Feature Flag 설정**:
```
HYBRID_MATCHING_ENABLED=true
SEMANTIC_CACHE_ENABLED=true
VECTOR_SEARCH_ENABLED=true
BACKGROUND_LEARNING_ENABLED=true
```

### 8.2 A/B 테스트 계획

Phase 4에서 기존 매칭 vs 하이브리드 매칭 비교 테스트 실시.

| 그룹 | 비율 | 매칭 방식 |
|------|------|----------|
| Control (A) | 20% | 기존 키워드 매칭만 |
| Treatment (B) | 80% | 하이브리드 매칭 |

**측정 지표**:
- 매칭 후보자 수 (평균)
- 사용자 클릭률 (후보자 상세 조회)
- 매칭 결과 만족도 (피드백 수집)
- API 응답 시간

**성공 기준**:
- 매칭 후보자 수 30% 이상 증가
- 응답 시간 3초 이내 유지
- 사용자 부정 피드백 5% 미만

### 8.3 사용자 피드백 수집

| 수집 방법 | 구현 | 활용 |
|----------|------|------|
| **매칭 결과 평가** | 👍/👎 버튼 | 잘못된 매핑 식별 및 수정 |
| **"이 후보자가 왜 매칭?" 툴팁** | matchReason 표시 | 사용자 이해도 향상 |
| **"관련 없는 후보자" 신고** | 신고 버튼 | 시맨틱 캐시 재검증 큐 등록 |
| **주간 NPS 조사** | 인앱 설문 | 전반적 만족도 측정 |

---

## 9. 모니터링 및 알림

### 9.1 핵심 메트릭 대시보드

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Skill Semantic Matching Dashboard                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  검색 품질                              시스템 성능                              │
│  ───────────                           ───────────                              │
│  • 평균 스킬 매칭률: 87%                • API 응답 p95: 2.3s                     │
│  • 시맨틱 캐시 적중률: 72%              • 백그라운드 큐 대기: 45개                │
│  • 새 후보자 발견률: 18%                • LLM 호출 성공률: 99.2%                 │
│                                                                                 │
│  매칭 방식 분포                          학습 현황                               │
│  ───────────                           ───────────                              │
│  • 키워드: 35%                          • 총 스킬 임베딩: 8,234개                │
│  • 시맨틱 캐시: 45%                     • 총 시맨틱 캐시: 52,891쌍               │
│  • 벡터: 20%                           • 오늘 학습: 342쌍                       │
│                                                                                 │
│  비용                                                                           │
│  ───────────                                                                    │
│  • 이번 달 LLM 비용: $32 / $100 한도                                            │
│  • 일 평균: $1.1 (GPT-4o-mini)                                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 알림 설정

| 레벨 | 조건 | 알림 대상 |
|------|------|----------|
| **Critical** | API 응답 > 5초, 워커 다운, LLM 오류율 > 10% | Slack #alerts, PagerDuty |
| **Warning** | 캐시 적중률 < 50%, 큐 대기 > 1000, 비용 > 80% | Slack #monitoring |
| **Info** | 일일 학습 완료, 새 스킬 1000개 돌파 | Slack #dev |

---

## 10. 체크리스트

### 10.1 Phase 1 체크리스트

- [ ] skill_embeddings 테이블 생성
- [ ] skill_semantic_cache 테이블 생성
- [ ] skill_learning_queue 테이블 생성
- [ ] position_new_matches 테이블 생성
- [ ] pgvector 인덱스 최적화
- [ ] 스킬 정규화 함수 구현
- [ ] OpenAI 임베딩 서비스 구현
- [ ] 단위 테스트 작성

### 10.2 Phase 2 체크리스트

- [ ] match_candidates_hybrid RPC 함수 구현
- [ ] /api/positions/auto-match API 수정
- [ ] 하이브리드 검색 결과 UI 구현
- [ ] 매칭 소스 표시 (keyword/semantic/vector)
- [ ] E2E 테스트 작성

### 10.3 Phase 3 체크리스트

- [ ] skill_learning_queue 워커 구현
- [ ] LLM 스킬 분석 프롬프트 설계
- [ ] 분석 결과 파싱 및 저장 로직
- [ ] 시간별 배치 크론잡 구현
- [ ] 일별 배치 크론잡 구현
- [ ] Supabase Realtime 연동
- [ ] 토스트 알림 UI 구현

### 10.4 Phase 4 체크리스트

- [ ] 성능 테스트 (부하 테스트)
- [ ] 시드 데이터 준비 (주요 IT 스킬 500개)
- [ ] 모니터링 대시보드 구축
- [ ] 알림 설정
- [ ] 문서화
- [ ] 프로덕션 배포
- [ ] 롤아웃 모니터링

---

## 11. 승인

| 역할 | 의견 | 승인 |
|-----|-----|-----|
| **Product Manager** | | ⏳ 대기 |
| **Tech Lead** | | ⏳ 대기 |
| **AI Team Lead** | | ⏳ 대기 |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|-----|------|-------|----------|
| 1.0.0 | 2026-01-31 | AI Assistant | 최초 작성 |
| 1.1.0 | 2026-01-31 | AI Assistant | LLM 프롬프트 구체화, 비용 추정 GPT-4o-mini 기준으로 수정 |
| 1.2.0 | 2026-02-01 | AI Assistant | Senior PM 검토 반영: Out of Scope 추가, Rollback 계획, A/B 테스트 계획, 피드백 수집 방안, 확장성 수치 아키텍처와 일치 |
