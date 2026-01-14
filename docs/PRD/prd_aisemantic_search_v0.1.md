# PRD: 이력서 원본 텍스트 Semantic 검색 v0.1

> **문서 버전**: 0.1.2
> **작성일**: 2026-01-14
> **상태**: Phase 2 E2E 테스트 완료 ✅ | 프로덕션 배포 대기

---

## 1. 개요

### 1.1 요약

| 항목 | 내용 |
|-----|-----|
| **기능명** | 이력서 원본 텍스트 Semantic 검색 |
| **우선순위** | P0 (Critical) |
| **예상 릴리즈** | Sprint 15 |
| **담당** | Backend Team |

### 1.2 배경

현재 AI Semantic 검색은 AI가 구조화한 데이터(이름, 경력, 기술 등)만 검색 가능합니다. 이력서 원본에 있는 세부 정보(프로젝트 상세, 자기소개 내용, 특수 자격증 등)가 AI 구조화 과정에서 누락되면 검색되지 않습니다.

**사용자 페인포인트:**
- "이력서에 분명히 'EUV 공정'이 있는데 검색이 안 돼요"
- "자기소개서에 쓴 내용으로 검색하고 싶어요"
- "특정 프로젝트명으로 후보자를 찾고 싶어요"

### 1.3 목표

1. **검색 커버리지 100%**: 이력서에 있는 모든 텍스트가 검색 가능해야 함
2. **검색 품질 유지**: 구조화 데이터 우선, 원본 텍스트는 보조적 역할
3. **성능 유지**: 검색 응답 시간 500ms 이하 유지

---

## 2. 현재 아키텍처 분석

### 2.1 현재 데이터 파이프라인

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         현재 데이터 파이프라인                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [이력서 파일] ──▶ [Parser] ──▶ [원본 텍스트] ──▶ [Analyst Agent]        │
│                                       │              │                  │
│                                       │              ▼                  │
│                                       │        [구조화 데이터]           │
│                                       │              │                  │
│                                       ▼              ▼                  │
│                                   ❌ 폐기      [EmbeddingService]        │
│                                                      │                  │
│                                                      ▼                  │
│                                              [candidate_chunks]         │
│                                              - summary (1개)            │
│                                              - career (N개)             │
│                                              - project (N개)            │
│                                              - skill (1개)              │
│                                              - education (1개)          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 문제점

- `tasks.py:573-575`에서 `embedding_service.process_candidate(data=analyzed_data)`
- 원본 텍스트(`text`)가 임베딩 서비스에 전달되지 않음
- **정보 손실**: AI가 구조화하지 못한 텍스트는 검색 불가

---

## 3. 제안 아키텍처

### 3.1 제안 데이터 파이프라인

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         제안 데이터 파이프라인                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [이력서 파일] ──▶ [Parser] ──▶ [원본 텍스트] ──▶ [Analyst Agent]        │
│                                       │              │                  │
│                                       │              ▼                  │
│                                       │        [구조화 데이터]           │
│                                       │              │                  │
│                                       ▼              ▼                  │
│                              [EmbeddingService] ◀────┘                  │
│                                       │                                 │
│                           ┌───────────┴───────────┐                     │
│                           ▼                       ▼                     │
│                    [RAW 청크들]            [구조화 청크들]               │
│                    - raw_full (1개)        - summary                    │
│                    - raw_section (N개)     - career                     │
│                                            - project                    │
│                                            - skill                      │
│                                            - education                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 변경 범위 (Impact Analysis)

| 컴포넌트 | 파일 경로 | 변경 유형 |
|---------|----------|----------|
| **DB Schema** | `supabase/migrations/` | ENUM 확장 |
| **RPC 함수** | `search_candidates()` | 가중치 추가 |
| **Python 서비스** | `apps/worker/services/embedding_service.py` | 청킹 로직 추가 |
| **Python 태스크** | `apps/worker/tasks.py` | 원본 텍스트 전달 |
| **TypeScript 타입** | `types/candidate.ts` | ChunkType 확장 |

### 3.3 기술 설계

#### A. DB Schema Migration

```sql
-- chunk_type ENUM에 새 값 추가
ALTER TYPE chunk_type ADD VALUE 'raw_full';
ALTER TYPE chunk_type ADD VALUE 'raw_section';

-- RPC 함수 가중치 수정
CASE cc.chunk_type
    WHEN 'summary' THEN 1.0
    WHEN 'career' THEN 0.9
    WHEN 'skill' THEN 0.85
    WHEN 'project' THEN 0.8
    WHEN 'raw_full' THEN 0.7      -- 신규
    WHEN 'raw_section' THEN 0.65  -- 신규
    WHEN 'education' THEN 0.5
END
```

#### B. 청킹 전략

```
원본 텍스트 (예: 5000자)
├── raw_full: 전체 텍스트 (1개, 최대 8000자)
│   → 전체 문맥 보존, 긴 쿼리에 적합
│
└── raw_section: 섹션별 분할 (N개, 각 500~1500자)
    → 슬라이딩 윈도우 (1500자 청크, 300자 오버랩)
    → 짧은 키워드 검색에 적합
```

---

## 4. 기능 요구사항 (Functional Requirements)

### FR-001: 원본 텍스트 청킹

| ID | FR-001 |
|---|---|
| **설명** | 이력서 파싱 후 원본 텍스트를 청크로 분할하여 임베딩 생성 |
| **입력** | 파싱된 이력서 원본 텍스트 |
| **출력** | raw_full (1개), raw_section (N개) 청크 |
| **수용 기준** | 1. 전체 텍스트가 raw_full 청크에 포함<br>2. 500자 이상 텍스트는 섹션별 분할<br>3. 각 청크에 임베딩 생성 |

### FR-002: 가중치 기반 검색 순위

| ID | FR-002 |
|---|---|
| **설명** | 검색 결과에서 구조화 청크를 원본 청크보다 우선 표시 |
| **가중치** | summary(1.0) > career(0.9) > skill(0.85) > project(0.8) > **raw_full(0.7)** > **raw_section(0.65)** > education(0.5) |
| **수용 기준** | 1. 동일 키워드가 summary와 raw에 모두 있으면 summary 매칭 후보자가 상위<br>2. 원본에만 있는 키워드도 검색 가능 |

### FR-003: 청크 타입 필터 (선택적)

| ID | FR-003 |
|---|---|
| **설명** | 검색 시 특정 청크 타입만 검색하는 옵션 |
| **기본값** | 모든 청크 타입 검색 |
| **옵션** | `searchMode: 'structured' \| 'raw' \| 'all'` |
| **우선순위** | P2 (향후 검토) |

---

## 5. 비기능 요구사항 (Non-Functional Requirements)

### NFR-001: 성능

| 지표 | 목표 | 측정 방법 |
|-----|-----|---------|
| 검색 응답 시간 | p95 < 500ms | DataDog APM |
| 임베딩 생성 시간 | 후보자당 < 10초 | Worker 로그 |
| 스토리지 증가 | < 200% | Supabase 대시보드 |

### NFR-002: 데이터 품질

| 지표 | 목표 |
|-----|-----|
| 검색 커버리지 | 100% (원본 텍스트 전체) |
| 검색 정확도 (Precision) | > 85% |
| 검색 재현율 (Recall) | > 95% |

### NFR-003: 하위 호환성

- 기존 후보자 데이터는 원본 청크 없이 정상 동작
- 기존 API 응답 형식 유지
- 기존 검색 결과 순위에 영향 최소화

---

## 6. 사용자 스토리

### US-001: 원본 텍스트 검색

```
AS A 채용담당자
I WANT TO 이력서 원본에 있는 모든 내용으로 검색
SO THAT 특정 키워드가 포함된 후보자를 놓치지 않음

Acceptance Criteria:
- GIVEN 이력서에 "삼성전자 반도체 사업부 EUV 공정 개발"이 있을 때
- WHEN "EUV 공정"으로 검색하면
- THEN 해당 후보자가 검색 결과에 포함됨
```

### US-002: 구조화 데이터 우선 표시

```
AS A 채용담당자
I WANT TO 검색 결과에서 명확한 매칭을 먼저 보기
SO THAT 관련성 높은 후보자를 빠르게 찾음

Acceptance Criteria:
- GIVEN "React" 스킬이 skills 배열에 있는 후보자 A
- AND "React" 단어가 원본 텍스트에만 있는 후보자 B
- WHEN "React"로 검색하면
- THEN 후보자 A가 후보자 B보다 상위에 표시됨
```

---

## 7. 성능 영향 분석

| 지표 | 현재 | 변경 후 | 영향 |
|-----|------|--------|-----|
| **청크 수 (평균)** | 5~10개 | 10~20개 | +100% |
| **임베딩 API 호출** | 5~10회 | 10~20회 | +100% |
| **Storage 사용량** | 1MB/후보자 | 2MB/후보자 | +100% |
| **검색 정확도** | 70% (추정) | 95% (목표) | +35% |
| **벡터 인덱스 크기** | 100MB/10K | 200MB/10K | +100% |

---

## 8. 릴리즈 계획

| Phase | 범위 | 일정 | 상태 |
|-------|-----|-----|-----|
| **Phase 1** | DB 스키마 마이그레이션, Python 청킹 로직 | Week 1 | ✅ 완료 |
| **Phase 2** | RPC 함수 수정, 검색 API 테스트 | Week 2 | ✅ 완료 |
| **Phase 3** | QA 검증, 기존 데이터 백필 (선택) | Week 3 | ⏳ 대기 |
| **Phase 4** | 프로덕션 배포, 모니터링 | Week 4 | ⏳ 대기 |

---

## 9. 성공 지표 (KPIs)

| 지표 | 현재 | 목표 | 측정 방법 |
|-----|-----|-----|---------|
| 검색 결과 없음 비율 | 15% | < 5% | 검색 로그 분석 |
| 검색 만족도 (CSAT) | - | > 4.0/5.0 | 사용자 피드백 |
| 검색 클릭률 (CTR) | 30% | > 45% | Analytics |

---

## 10. 리스크 및 완화 방안

| 리스크 | 영향 | 확률 | 완화 방안 |
|-------|-----|-----|---------|
| **임베딩 API 비용 증가** | Medium | High | 배치 API 사용, 청크 수 제한 |
| **검색 성능 저하** | High | Medium | 벡터 인덱스 튜닝, 캐시 확대 |
| **스토리지 용량 증가** | Low | High | pgvector 압축, 오래된 청크 정리 |
| **기존 검색 결과 변화** | Medium | Medium | A/B 테스트, 점진적 롤아웃 |

---

## 11. 구현 체크리스트

### Backend (Python Worker)

#### DB Migration ✅
- [x] chunk_type ENUM에 'raw_full', 'raw_section' 추가
- [x] search_candidates RPC 함수에 새 청크 타입 가중치 추가
- [x] search_candidates_parallel RPC 함수 동일 수정

#### embedding_service.py ✅
- [x] ChunkType Enum 확장
- [x] _build_raw_text_chunks() 메서드 추가
- [x] process_candidate() 시그니처 변경 (raw_text 파라미터)
- [x] 슬라이딩 윈도우 청킹 로직 구현
- [x] 단위 테스트 추가 (15개 통과)

#### tasks.py ✅
- [x] process_resume()에서 원본 텍스트 전달
- [x] embedding_service.process_candidate(data, raw_text=text) 호출

#### main.py ✅ (추가)
- [x] run_pipeline()에서 원본 텍스트 전달
- [x] /process 엔드포인트에서 원본 텍스트 전달

### Frontend (TypeScript)

#### types/candidate.ts ✅
- [x] ChunkType 타입에 'raw_full' | 'raw_section' 추가
- [x] CHUNK_WEIGHTS에 새 가중치 추가

### 추가 산출물

#### 백필 스크립트 ✅
- [x] `apps/worker/scripts/backfill_raw_chunks.py` 생성
- [x] 기존 후보자 대상 raw 청크 생성 로직
- [x] --dry-run, --limit, --user-id, --batch-size 옵션 지원
- [ ] 실행 완료 (기존 데이터에 파일 경로 없어 스킵됨)

---

## 12. 승인

| 역할 | 의견 | 승인 |
|-----|-----|-----|
| **Senior Technical Architect** | Dual-Track 청킹 아키텍처 승인 | ✅ |
| **Senior Product Manager** | PRD 작성 완료, Sprint 15 릴리즈 목표 | ✅ |
| **Senior Engineer** | 조건부 승인 (슬라이딩 윈도우, 모니터링 필수) | ✅ |

**최종 결정: 구현 진행 승인** 🟢

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|-----|-----|-------|----------|
| 0.1 | 2026-01-14 | AI Assistant | 최초 작성 |
| 0.1.1 | 2026-01-14 | AI Assistant | Phase 1 구현 완료, 체크리스트 업데이트 |
| 0.1.2 | 2026-01-14 | AI Assistant | Phase 2 E2E 테스트 완료, 테스트 결과 추가 |

---

## 13. 구현 세부 내역

### 수정된 파일 목록

| 파일 경로 | 변경 내용 |
|----------|----------|
| `supabase/migrations/032_raw_text_chunks.sql` | ENUM 확장 및 RPC 함수 가중치 수정 |
| `apps/worker/services/embedding_service.py` | ChunkType 확장, _build_raw_text_chunks() 추가 |
| `apps/worker/tasks.py` | raw_text 파라미터 전달 |
| `apps/worker/main.py` | run_pipeline(), /process에 raw_text 전달 |
| `apps/worker/scripts/backfill_raw_chunks.py` | 백필 스크립트 신규 생성 |
| `apps/worker/tests/test_raw_text_chunks.py` | 유닛 테스트 15개 추가 |
| `apps/worker/run_local.py` | 로컬 개발용 실행 스크립트 |
| `types/candidate.ts` | ChunkType, CHUNK_WEIGHTS 확장 |

### 청킹 로직 상세

```python
# _build_raw_text_chunks() 메서드
# 입력: 원본 텍스트 (파싱된 이력서)
# 출력: [raw_full (1개), raw_section (N개)]

# raw_full: 최대 8000자, truncated 메타데이터 포함
# raw_section: 1500자 윈도우, 300자 오버랩, 100자 미만 제외
```

### 가중치 설정

```python
CHUNK_WEIGHTS = {
    'summary': 1.0,
    'career': 0.9,
    'skill': 0.85,
    'project': 0.8,
    'raw_full': 0.7,      # 신규
    'raw_section': 0.65,  # 신규
    'education': 0.5,
}
```

---

## 14. E2E 테스트 결과

### 테스트 환경
- Worker: localhost:8000 (uvicorn)
- OpenAI: GPT-4o (임베딩: text-embedding-3-small)
- 테스트 일자: 2026-01-14

### 테스트 케이스 결과

| TC ID | 테스트 내용 | 결과 |
|-------|-----------|-----|
| TC-01 | Worker Health Check | ✅ PASSED |
| TC-02 | Raw Chunk Creation (short text) | ✅ PASSED |
| TC-03 | Raw Chunk Creation (long text > 1500 chars) | ✅ PASSED |
| TC-04 | Sliding Window Chunking | ✅ PASSED |
| TC-05 | Keywords Only in Raw Text | ✅ PASSED |
| TC-06 | process_candidate with raw_text | ✅ PASSED |

### 상세 결과

```
=== process_candidate with raw_text ===
Total Chunks: 7
- summary: 1
- career: 1
- project: 1
- skill: 1
- raw_full: 1
- raw_section: 2

Keywords only in raw text (not in structured data):
- "ASML EUV scanners": FOUND
- "Defect Inspection": FOUND
- "MATLAB": FOUND

=== ALL TESTS PASSED ===
```

### 테스트 파일
- `tests/e2e/raw-text-search.spec.ts` - Playwright E2E 테스트
- `apps/worker/tests/test_raw_text_chunks.py` - 유닛 테스트 (15개)
