# Position-Candidate Hybrid Semantic Matching Architecture

> **문서 버전**: 1.1.0
> **작성일**: 2026-01-31
> **최종 수정**: 2026-01-31
> **상태**: 최종 확정

---

## 1. 개요

### 1.1 목적

JD(Job Description) 업로드 시 기존 후보자 DB에서 가장 적합한 후보자를 **빠르고 정확하게** 매칭하는 하이브리드 시맨틱 검색 시스템

### 1.2 핵심 원칙

1. **사용자 경험 최우선**: 모든 백그라운드 작업은 UX에 영향 없음
2. **점진적 학습**: 시스템이 사용될수록 매칭 정확도 향상
3. **하이브리드 검색**: 키워드 + 벡터 + 시맨틱캐시 조합으로 최적의 결과

---

## 2. 시스템 아키텍처

### 2.1 전체 흐름

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              전체 시스템 흐름                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    실시간 경로 (사용자 체감)                               │   │
│  │                                                                         │   │
│  │   [JD 업로드] ──▶ [스킬 추출] ──▶ [임베딩 벡터화] ──▶ [하이브리드 검색]    │   │
│  │                                         │                │              │   │
│  │                                         ▼                ▼              │   │
│  │                                  skill_embeddings   후보자 매칭          │   │
│  │                                      테이블          결과 반환           │   │
│  │                                         │                               │   │
│  │                                         │          ┌──────────────┐     │   │
│  │                                         └─────────▶│ 즉시 응답     │     │   │
│  │                                                    │ (1-3초 내)   │     │   │
│  │                                                    └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                       │
│                                         │ 신규 스킬 발견 시                       │
│                                         ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    백그라운드 경로 (사용자 모름)                            │   │
│  │                                                                         │   │
│  │   [신규 스킬 큐] ──▶ [LLM 분석] ──▶ [skill_semantic_cache 저장]          │   │
│  │         │                │                    │                         │   │
│  │         │                │                    ▼                         │   │
│  │         │                │           새 매칭 후보 발견?                   │   │
│  │         │                │                    │                         │   │
│  │         │                │              Yes   │   No                    │   │
│  │         │                │                ▼   │                         │   │
│  │         │                │         [토스트 알림]                         │   │
│  │         │                │         "새로운 후보자                        │   │
│  │         │                │          3명 발견!"                          │   │
│  │         │                │                                              │   │
│  │   [크론잡/배치] ─────────────▶ [지속적 학습]                              │   │
│  │   (매 시간/매일)                    │                                    │   │
│  │                                    ▼                                    │   │
│  │                          skill_semantic_cache                           │   │
│  │                          테이블 최적화/보강                               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              데이터 흐름 상세                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [JD 업로드]                                                                    │
│       │                                                                         │
│       ▼                                                                         │
│  [GPT-4 스킬 추출]                                                              │
│       │                                                                         │
│       ▼                                                                         │
│  required_skills: ["React", "AWS", "CI/CD 경험"]                                │
│       │                                                                         │
│       ├───────────────────────────────────────────────────────────────┐         │
│       │                                                               │         │
│       ▼                                                               ▼         │
│  [skill_embeddings 조회]                                    [skill_learning_queue]
│       │                                                     (신규 스킬 등록)     │
│       ├─ 있음 → 기존 벡터 사용                                        │         │
│       │                                                               │         │
│       └─ 없음 → OpenAI 임베딩 생성 → 저장 ──────────────────────────────┘         │
│                                                                                 │
│       ▼                                                                         │
│  [하이브리드 검색 실행]                                                          │
│       │                                                                         │
│       ├─ 1. 키워드 매칭 (candidates.skills 정확 일치)                           │
│       │                                                                         │
│       ├─ 2. 시맨틱 캐시 매칭 (skill_semantic_cache LLM 검증 결과)                │
│       │                                                                         │
│       └─ 3. 벡터 유사도 매칭 (skill_embeddings 코사인 유사도)                    │
│                                                                                 │
│       ▼                                                                         │
│  [점수 통합 및 정렬]                                                             │
│       │                                                                         │
│       │  가중치:                                                                │
│       │  - 키워드 매칭: 1.0                                                     │
│       │  - 시맨틱 캐시: 0.95                                                    │
│       │  - 벡터 유사도: 0.8                                                     │
│       │                                                                         │
│       ▼                                                                         │
│  [매칭 결과 반환] (상위 N명)                                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 검색 전략

### 3.1 하이브리드 검색 3단계

| 단계 | 검색 방식 | 데이터 소스 | 가중치 | 특징 |
|------|----------|------------|--------|------|
| **1단계** | 키워드 정확 매칭 | candidates.skills | 1.0 | 가장 빠름, 정확함 |
| **2단계** | 시맨틱 캐시 조회 | skill_semantic_cache | 0.95 | LLM 검증된 결과 |
| **3단계** | 벡터 유사도 | skill_embeddings | 0.8 | 새로운 조합 발견 |

### 3.2 검색 흐름 예시

```
JD 스킬: ["React", "AWS", "CI/CD 경험"]
후보자 스킬: ["리액트", "클라우드", "Jenkins"]

1단계 (키워드):
  - React = 리액트? ❌ (문자열 불일치)
  - AWS = 클라우드? ❌
  - CI/CD 경험 = Jenkins? ❌

2단계 (시맨틱 캐시):
  - skill_semantic_cache 조회
  - "React" ↔ "리액트" = 1.0 ✅ (LLM 검증됨)
  - "AWS" ↔ "클라우드" = 0.75 ✅ (LLM 검증됨)
  - "CI/CD 경험" ↔ "Jenkins" = 0.85 ✅ (LLM 검증됨)

3단계 (벡터 유사도):
  - 시맨틱 캐시에 없는 조합만 검색
  - 이 케이스에서는 스킵 (모두 캐시에 있음)

최종 점수:
  - React: 1.0 × 0.95 = 0.95
  - AWS: 0.75 × 0.95 = 0.71
  - CI/CD: 0.85 × 0.95 = 0.81
  - 평균: 0.82
```

### 3.3 시맨틱 검색의 의미

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  키워드 검색 vs 시맨틱 검색                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  검색어: "CI/CD 경험"                                                           │
│                                                                                 │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐       │
│  │      키워드 검색                 │  │      시맨틱 검색                 │       │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤       │
│  │                                 │  │                                 │       │
│  │  "CI/CD"라는 단어가 정확히      │  │  "CI/CD 경험"의 의미를 파악:     │       │
│  │  있는 문서만 검색               │  │                                 │       │
│  │                                 │  │  - 지속적 통합/배포 경험        │       │
│  │  결과:                          │  │  - Jenkins, GitHub Actions 등   │       │
│  │  - "CI/CD" 있음 ✅              │  │    도구 사용 경험               │       │
│  │  - "Jenkins" ❌ (단어 없음)     │  │  - 자동화 파이프라인 구축 경험   │       │
│  │  - "GitHub Actions" ❌          │  │                                 │       │
│  │                                 │  │  결과:                          │       │
│  │                                 │  │  - "CI/CD" ✅                   │       │
│  │                                 │  │  - "Jenkins" ✅ (의미적 관련)   │       │
│  │                                 │  │  - "GitHub Actions" ✅          │       │
│  │                                 │  │  - "DevOps" ✅ (상위 개념)      │       │
│  └─────────────────────────────────┘  └─────────────────────────────────┘       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 백그라운드 학습 시스템

### 4.1 신규 스킬 즉시 학습 (JD 업로드 직후)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  신규 스킬 발견 시 즉시 학습 프로세스                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. JD 업로드: required_skills = ["React", "AWS", "CI/CD 경험"]                 │
│                                                                                 │
│  2. skill_embeddings 조회:                                                      │
│     - "React" → 있음 ✅                                                         │
│     - "AWS" → 있음 ✅                                                           │
│     - "CI/CD 경험" → 없음 ❌ → skill_learning_queue 등록                        │
│                                                                                 │
│  3. 백그라운드 워커 즉시 실행 (사용자 모름):                                       │
│                                                                                 │
│     ┌─────────────────────────────────────────────────────────────────┐         │
│     │  LLM 분석 요청 (GPT-4o-mini 사용):                              │         │
│     │                                                                 │         │
│     │  다음 스킬을 분석해주세요: "CI/CD 경험"                           │         │
│     │                                                                 │         │
│     │  1) 이 스킬이 무엇인지 담당자가 단어로 이해할 수 있도록           │         │
│     │     아는대로 나열하세요.                                         │         │
│     │     (예시: 단어, 단어, 단어, 단어)                               │         │
│     │                                                                 │         │
│     │  2) 이 스킬을 수행하는데 필요한 또는 유사한                       │         │
│     │     스킬/툴/기술/분야/지식을 3줄 이내로 설명해주세요.             │         │
│     │                                                                 │         │
│     │     ※ 주의: 성실함, 집요함, 노력, 끈기 등                        │         │
│     │     스킬/툴/기술과 관련 없는 형용사나 능력은                      │         │
│     │     절대 사용하지 마세요.                                        │         │
│     └─────────────────────────────────────────────────────────────────┘         │
│                                                                                 │
│     ┌─────────────────────────────────────────────────────────────────┐         │
│     │  LLM 응답:                                                      │         │
│     │  {                                                              │         │
│     │    "keywords": [                                                │         │
│     │      "Jenkins", "GitHub Actions", "GitLab CI", "CircleCI",      │         │
│     │      "ArgoCD", "Travis CI", "Docker", "Kubernetes",             │         │
│     │      "자동화 파이프라인", "빌드", "배포", "테스트 자동화"          │         │
│     │    ],                                                           │         │
│     │    "description": [                                             │         │
│     │      "CI/CD 구현에는 Jenkins, GitHub Actions 등 파이프라인 도구 필요",│     │
│     │      "Docker/Kubernetes 컨테이너 기술과 YAML 설정 작성 능력 관련",   │     │
│     │      "Git 버전관리, 쉘 스크립트, 클라우드 인프라 지식 활용"         │         │
│     │    ],                                                           │         │
│     │    "related_skills": [                                          │         │
│     │      "Jenkins", "GitHub Actions", "GitLab CI",                  │         │
│     │      "CircleCI", "ArgoCD", "Travis CI"                          │         │
│     │    ],                                                           │         │
│     │    "parent_skills": ["DevOps", "자동화"],                        │         │
│     │    "category_l1": "IT",                                         │         │
│     │    "category_l2": "DevOps"                                      │         │
│     │  }                                                              │         │
│     └─────────────────────────────────────────────────────────────────┘         │
│                                                                                 │
│  4. skill_semantic_cache에 매핑 저장:                                           │
│     - "CI/CD 경험" ↔ "Jenkins" = 0.85 (includes)                               │
│     - "CI/CD 경험" ↔ "GitHub Actions" = 0.85 (includes)                        │
│     - "CI/CD 경험" ↔ "DevOps" = 0.70 (child_of)                                │
│                                                                                 │
│  5. 추가 후보자 검색:                                                           │
│     - 기존 검색에서 놓친 후보자 중                                               │
│     - skills에 "Jenkins", "GitHub Actions" 있는 사람 발견                       │
│                                                                                 │
│  6. 새 후보자 발견 시:                                                          │
│     → position_new_matches 테이블에 등록                                        │
│     → Supabase Realtime으로 클라이언트에 푸시                                   │
│     → 토스트 알림 표시                                                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 배치 학습 (크론잡)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  배치 학습 작업 (매 시간 / 매일)                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  작업 1: 미검증 스킬 쌍 학습                                                     │
│  ─────────────────────────────                                                  │
│  - 임베딩 유사도 0.5~0.9 범위인데 LLM 검증 안 된 쌍들                             │
│  - 우선순위: 사용 빈도 높은 스킬 먼저                                             │
│  - 하루 최대 1000쌍 처리 (비용 제한)                                             │
│                                                                                 │
│  작업 2: 스킬 카테고리 분류                                                      │
│  ─────────────────────────────                                                  │
│  - 새로 등록된 스킬들의 category_l1, l2 분류                                     │
│  - 분류 기준: IT/제조/금융/의료/기타                                             │
│  - 세부 분류: Frontend/Backend/DevOps/Data/Mobile 등                            │
│                                                                                 │
│  작업 3: 스킬 관계 그래프 보강                                                   │
│  ─────────────────────────────                                                  │
│  - parent/child/sibling 관계 구축                                               │
│  - 예: React → parent: "Frontend Framework" → parent: "Frontend"               │
│  - 예: React → sibling: ["Vue.js", "Angular", "Svelte"]                        │
│                                                                                 │
│  작업 4: 오래된 매핑 재검증                                                      │
│  ─────────────────────────────                                                  │
│  - 6개월 이상 지난 LLM 판단 재검토                                               │
│  - 기술 트렌드 변화 반영 (예: React 버전 업데이트)                                │
│                                                                                 │
│  작업 5: 데이터 정리                                                             │
│  ─────────────────────────────                                                  │
│  - usage_count = 0인 스킬 임베딩 삭제                                            │
│  - 6개월 이상 미사용 매핑 아카이브                                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 데이터베이스 설계

### 5.1 테이블 구조

```sql
-- 1. 스킬 임베딩 저장
CREATE TABLE skill_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name TEXT NOT NULL,
    skill_normalized TEXT NOT NULL,  -- 소문자, 공백 정규화
    embedding vector(1536) NOT NULL,
    category_l1 TEXT,                -- IT, 제조, 금융 등
    category_l2 TEXT,                -- Frontend, Backend, DevOps 등
    usage_count INTEGER DEFAULT 1,
    source TEXT DEFAULT 'auto',      -- 'jd', 'candidate', 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(skill_normalized)
);

-- 2. LLM 검증된 시맨틱 캐시
CREATE TABLE skill_semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_a TEXT NOT NULL,
    skill_b TEXT NOT NULL,
    skill_a_normalized TEXT NOT NULL,
    skill_b_normalized TEXT NOT NULL,

    -- 점수
    embedding_similarity FLOAT,      -- 벡터 유사도
    semantic_score FLOAT NOT NULL,   -- LLM 판단 유사도 (최종 사용)

    -- LLM 분석 결과
    relationship TEXT,               -- 'identical', 'includes', 'similar', 'related', 'different'
    llm_reasoning TEXT,              -- LLM 판단 근거

    -- 메타데이터
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    usage_count INTEGER DEFAULT 0,

    UNIQUE(skill_a_normalized, skill_b_normalized)
);

-- 3. 학습 대기 큐
CREATE TABLE skill_learning_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name TEXT NOT NULL,
    skill_normalized TEXT NOT NULL,
    source_position_id UUID,         -- 어떤 JD에서 발견됐는지
    priority INTEGER DEFAULT 0,      -- 높을수록 먼저 처리
    status TEXT DEFAULT 'pending',   -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    UNIQUE(skill_normalized)
);

-- 4. 새 매칭 알림
CREATE TABLE position_new_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    discovered_by TEXT NOT NULL,     -- 'realtime', 'background_llm', 'batch'
    match_reason TEXT,               -- "CI/CD 경험 → Jenkins 매핑으로 발견"
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(position_id, candidate_id)
);
```

### 5.2 인덱스

```sql
-- 스킬 임베딩 조회 최적화
CREATE INDEX idx_skill_embeddings_normalized ON skill_embeddings(skill_normalized);
CREATE INDEX idx_skill_embeddings_vector ON skill_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 시맨틱 캐시 조회 최적화
CREATE INDEX idx_skill_semantic_cache_lookup
    ON skill_semantic_cache(skill_a_normalized, skill_b_normalized);
CREATE INDEX idx_skill_semantic_cache_score
    ON skill_semantic_cache(semantic_score DESC) WHERE semantic_score >= 0.7;

-- 학습 큐 처리 최적화
CREATE INDEX idx_skill_learning_queue_status
    ON skill_learning_queue(status, priority DESC);

-- 새 매칭 알림 최적화
CREATE INDEX idx_position_new_matches_notify
    ON position_new_matches(position_id, notified) WHERE notified = false;
```

### 5.3 ERD

```
┌─────────────────────┐     ┌─────────────────────┐
│  skill_embeddings   │     │ skill_semantic_cache│
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ skill_name          │◄────│ skill_a             │
│ skill_normalized    │     │ skill_b             │
│ embedding (vector)  │     │ embedding_similarity│
│ category_l1         │     │ semantic_score      │
│ category_l2         │     │ relationship        │
│ usage_count         │     │ llm_reasoning       │
│ source              │     │ verified_at         │
│ created_at          │     │ usage_count         │
│ updated_at          │     └─────────────────────┘
└─────────────────────┘
         │
         │ (신규 스킬 발견 시)
         ▼
┌─────────────────────┐     ┌─────────────────────┐
│skill_learning_queue │     │position_new_matches │
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ skill_name          │     │ position_id (FK)    │
│ skill_normalized    │     │ candidate_id (FK)   │
│ source_position_id  │────▶│ discovered_by       │
│ priority            │     │ match_reason        │
│ status              │     │ notified            │
│ attempts            │     │ created_at          │
│ error_message       │     └─────────────────────┘
│ created_at          │
│ processed_at        │
└─────────────────────┘
```

---

## 6. API 설계

### 6.1 실시간 매칭 API

```
POST /api/positions/auto-match

Request:
- file: JD 파일 (PDF, DOCX)
- matchLimit: 반환할 최대 후보자 수 (기본 20)
- minScore: 최소 매칭 점수 (기본 0.3)

Response:
{
  "success": true,
  "data": {
    "position": { ... },
    "matches": [
      {
        "candidateId": "uuid",
        "candidateName": "홍길동",
        "overallScore": 85,
        "skillScore": 90,
        "matchedSkills": [
          {
            "jdSkill": "React",
            "candidateSkill": "리액트",
            "matchType": "semantic_cache",
            "score": 1.0
          }
        ],
        "matchSources": ["keyword", "semantic_cache"]
      }
    ],
    "matchCount": 15,
    "meta": {
      "processingTimeMs": 2500,
      "searchMethods": {
        "keyword": 5,
        "semanticCache": 8,
        "vector": 2
      }
    }
  }
}
```

### 6.2 백그라운드 학습 API (내부용)

```
POST /api/internal/skill-learning/process

Request:
{
  "skillName": "CI/CD 경험",
  "sourcePositionId": "uuid"
}

Response:
{
  "success": true,
  "data": {
    "skill": "CI/CD 경험",
    "relatedSkills": ["Jenkins", "GitHub Actions"],
    "newMappingsCreated": 6,
    "additionalCandidatesFound": 3
  }
}
```

---

## 7. 실시간 알림 시스템

### 7.1 Supabase Realtime 구독

```typescript
// 클라이언트 측 구독
const subscription = supabase
  .channel(`position_new_matches:${positionId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'position_new_matches',
      filter: `position_id=eq.${positionId}`,
    },
    (payload) => {
      // 토스트 알림 표시
      showToast({
        title: "새로운 매칭 후보자 발견!",
        description: payload.new.match_reason,
        action: "확인하기"
      });
    }
  )
  .subscribe();
```

### 7.2 알림 UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  포지션 상세 페이지                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Senior Frontend Developer                                              │   │
│  │  매칭된 후보자: 15명                                                     │   │
│  │                                                                         │   │
│  │  [후보자 목록...]                                                       │   │
│  │                                                                         │   │
│  │                      ┌────────────────────────────────────┐             │   │
│  │                      │ 🔔 새로운 매칭 후보자 3명 발견!      │             │   │
│  │                      │                                    │             │   │
│  │                      │ AI가 "CI/CD 경험" 스킬 분석을 통해 │             │   │
│  │                      │ 추가로 적합한 후보자를 찾았습니다.  │             │   │
│  │                      │                                    │             │   │
│  │                      │ [확인하기]  [나중에]                │             │   │
│  │                      └────────────────────────────────────┘             │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. 성능 고려사항

### 8.1 응답 시간 목표

| 작업 | 목표 | 측정 방법 |
|------|------|----------|
| JD 업로드 → 매칭 결과 | p95 < 3초 | API 응답 시간 |
| 하이브리드 검색 쿼리 | p95 < 500ms | DB 쿼리 시간 |
| 벡터 유사도 검색 | p95 < 200ms | pgvector 쿼리 |
| 실시간 알림 도달 | p95 < 1초 | Realtime latency |

### 8.2 확장성

```
현재 예상 규모:
- 스킬 종류: ~10,000개
- 시맨틱 캐시: ~100,000쌍
- 후보자: ~100,000명
- JD: ~10,000개

벡터 인덱스 설정:
- IVFFlat lists = 100 (스킬 10,000개 기준)
- 후보자 증가 시 lists 조정 필요
```

### 8.3 비용 추정

#### 8.3.1 모델 선택: GPT-4o-mini (권장)

스킬 분석은 복잡한 추론이 필요 없으므로 **GPT-4o-mini**로 충분합니다.

| 모델 | Input (1M tokens) | Output (1M tokens) | 일일 비용 (1000쌍) |
|------|-------------------|--------------------|--------------------|
| GPT-4 | $10.00 | $30.00 | ~$11/일 |
| **GPT-4o-mini** | **$0.15** | **$0.60** | **~$0.75/일** |

#### 8.3.2 스킬 수에 따른 비용 분석

```
스킬 쌍 조합 계산: n × (n-1) / 2
LLM 검증 대상: 벡터 유사도 0.4~0.9 범위만 (전체의 약 10%)

┌──────────┬─────────────┬─────────────────┬────────────────────┐
│ 스킬 수   │ 가능한 조합  │ LLM 검증 대상    │ GPT-4o-mini 비용   │
├──────────┼─────────────┼─────────────────┼────────────────────┤
│ 1,000    │ ~500K 쌍    │ ~50K 쌍         │ 초기 $5 (1회성)    │
│ 5,000    │ ~12.5M 쌍   │ ~1.25M 쌍       │ 초기 $125 (1회성)  │
│ 10,000   │ ~50M 쌍     │ ~5M 쌍          │ 초기 $500 (1회성)  │
└──────────┴─────────────┴─────────────────┴────────────────────┘

※ 초기 구축 후 운영 비용:
- 신규 스킬 +100/일 → ~$0.01/일
- 신규 스킬 +500/일 → ~$0.05/일
```

#### 8.3.3 비용 절감 전략

| 전략 | 절감률 | 설명 |
|------|--------|------|
| GPT-4o-mini 사용 | 90%↓ | GPT-4 대비 15배 저렴 |
| 유사도 필터링 강화 | 50%↓ | 0.5~0.85 범위만 검증 (확실한 건 스킵) |
| 배치 빈도 조정 | 비례 | 주 2회 → 월 ~$3 |
| 캐시 재사용 | 점진적↓ | 검증된 쌍 증가 → 신규 검증 감소 |

#### 8.3.4 최종 비용 요약

| 항목 | 비용 | 빈도 | 비고 |
|------|------|------|------|
| OpenAI 임베딩 | ~$0.0001/스킬 | 스킬당 1회 | text-embedding-3-small |
| LLM 분석 (신규 스킬) | ~$0.001/스킬 | 스킬당 1회 | GPT-4o-mini |
| 배치 학습 (운영) | **~$0.05~$1/일** | 일 1회 | 신규 스킬 유입량 비례 |
| 초기 시드 구축 | ~$5~$500 | 1회성 | 기존 스킬 수에 비례 |
| Supabase | 기존 플랜 내 | - | DB + Realtime |

---

## 9. 모니터링

### 9.1 핵심 메트릭

```
1. 검색 품질
   - 매칭 정확도 (사용자 피드백 기반)
   - 키워드/시맨틱/벡터 매칭 비율
   - 평균 스킬 매칭률

2. 시스템 성능
   - API 응답 시간 분포
   - 백그라운드 작업 처리량
   - 큐 대기 시간

3. 학습 현황
   - 일일 신규 스킬 수
   - 시맨틱 캐시 적중률
   - LLM API 사용량/비용
```

### 9.2 알림 설정

```
Critical:
- 매칭 API 응답 시간 > 5초
- 백그라운드 워커 다운
- LLM API 오류율 > 10%

Warning:
- 시맨틱 캐시 적중률 < 50%
- 학습 큐 대기 > 1000개
- 벡터 검색 응답 > 500ms
```

---

## 10. 한계 및 제약사항

### 10.1 알려진 한계

| 한계 | 영향 | 대응 |
|------|------|------|
| 스킬 숙련도 판단 불가 | 경력 깊이 평가 어려움 | 경력 년수로 보완 |
| 도메인 특수 스킬 | 전문 분야 이해 제한 | 수동 매핑 추가 |
| 콜드 스타트 | 초기 정확도 낮음 | 시드 데이터 준비 |
| LLM 비동기 지연 | 즉각 반영 안 됨 | 임베딩으로 1차 대응 |

### 10.2 향후 개선 방향

1. **도메인 특화 임베딩**: 산업별 파인튜닝된 임베딩 모델
2. **사용자 피드백 학습**: 매칭 결과에 대한 피드백 반영
3. **스킬 조합 분석**: 스킬 세트의 시너지 평가
4. **실시간 LLM 옵션**: 고급 플랜에서 실시간 LLM 검증 제공

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|-----|------|-------|----------|
| 1.0.0 | 2026-01-31 | AI Assistant | 최초 작성 |
| 1.0.1 | 2026-01-31 | AI Assistant | LLM 프롬프트 구체화, 비용 추정 GPT-4o-mini 기준으로 수정 |
| 1.1.0 | 2026-01-31 | AI Assistant | 아키텍처 최종 확정 |
