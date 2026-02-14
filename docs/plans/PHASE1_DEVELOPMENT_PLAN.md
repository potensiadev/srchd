# Phase 1 개발 계획

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0
> **Status**: 계획 수립 완료

---

## 1. Executive Summary

### 1.1 개발 목표

| 목표 | 현재 | 목표치 | KPI |
|------|------|--------|-----|
| **필드 완성도** | ~78% | 90%+ | `coverage_score` 평균 |
| **비이력서 필터링** | 0% | 95%+ | 비이력서 차단율 |
| **파이프라인 지연** | 8-15초 | P95 <18초 | `processing_time_ms` |
| **크레딧 낭비 방지** | - | 비이력서 0건 | 환불 건수 감소 |

### 1.2 개발 범위

```
Phase 1 신규 컴포넌트:
├── DocumentClassifier (ResumeIntentGuard)  # 이력서 vs 비이력서 분류
├── CoverageCalculator                       # 필드 완성도 점수 산출
├── GapFillerAgent                           # 빈 필드 타겟 재추출
├── DB Schema Migration                      # field_metadata, document_kind 등
└── Feature Flags                            # 점진적 롤아웃
```

### 1.3 선행 조건

> **중요**: Phase 1 개발은 TIER 0-3 완료 후 진행

| TIER | 내용 | 상태 | 완료 기준 |
|------|------|------|----------|
| TIER 0 | Paddle 결제 연동 | ⏳ | 실제 카드 결제 → 크레딧 확인 |
| TIER 1 | 이메일 알림 + Sentry | ⏳ | 분석 완료/실패 이메일 수신 |
| TIER 2 | 온보딩 + 크레딧 리셋 | ⏳ | 신규 가입 E2E 통과 |
| TIER 3 | LLM 재시도 + E2E CI | ⏳ | Timeout 시 자동 재시도 |

**예상 TIER 0-3 완료일**: Week 3 (약 3주)

---

## 2. 개발 일정

### 2.1 마일스톤 개요

```
Week 4-5: Sprint 1 - 기반 구축
Week 6:   Sprint 2 - DocumentClassifier
Week 7:   Sprint 3 - CoverageCalculator
Week 8:   Sprint 4 - GapFillerAgent
Week 9:   Sprint 5 - 통합 및 최적화
Week 10:  Beta 배포 및 모니터링
```

### 2.2 상세 일정

#### Sprint 1: 기반 구축 (Week 4-5, 16h)

| Task ID | 작업 | 공수 | 담당 | 산출물 |
|---------|------|------|------|--------|
| S1-1 | DB 스키마 마이그레이션 설계 | 2h | Backend | Migration SQL |
| S1-2 | Feature Flags 확장 | 2h | Backend | feature_flags.py |
| S1-3 | 공통 타입/스키마 정의 | 4h | Backend | schemas/ 파일들 |
| S1-4 | PipelineContext 확장 | 4h | Backend | pipeline_context.py |
| S1-5 | 단위 테스트 프레임워크 | 4h | Backend | tests/ 구조 |

**완료 기준**:
- [ ] `document_kind`, `field_metadata` 컬럼 추가 마이그레이션 준비
- [ ] Feature flags에 `use_document_classifier`, `use_coverage_calculator`, `use_gap_filler` 추가
- [ ] `MissingReason`, `FieldCoverage` 등 공통 타입 정의

---

#### Sprint 2: DocumentClassifier (Week 6, 10h)

| Task ID | 작업 | 공수 | 의존성 | 산출물 |
|---------|------|------|--------|--------|
| S2-1 | Rule-based 분류 로직 | 3h | S1-3 | document_classifier.py |
| S2-2 | LLM Fallback 구현 | 3h | S2-1 | LLM 호출 로직 |
| S2-3 | Orchestrator 통합 | 2h | S2-2 | pipeline_orchestrator.py |
| S2-4 | 단위 테스트 | 2h | S2-3 | test_document_classifier.py |

**완료 기준**:
- [ ] Rule-based 분류 정확도 80%+ (테스트 셋 기준)
- [ ] LLM Fallback 시 95%+ 정확도
- [ ] 비이력서 업로드 시 환불 + 명확한 사유 반환

**파이프라인 위치**:
```
RouterAgent → Parser → [DocumentClassifier] → IdentityChecker → ...
```

---

#### Sprint 3: CoverageCalculator (Week 7, 8h)

| Task ID | 작업 | 공수 | 의존성 | 산출물 |
|---------|------|------|--------|--------|
| S3-1 | 필드 가중치 정의 | 2h | S1-3 | FIELD_WEIGHTS 상수 |
| S3-2 | Coverage 계산 로직 | 3h | S3-1 | coverage_calculator.py |
| S3-3 | Missing Reason 결정 | 2h | S3-2 | _determine_missing_reason() |
| S3-4 | 단위 테스트 | 1h | S3-3 | test_coverage_calculator.py |

**완료 기준**:
- [ ] 필드별 가중치 적용하여 0-100 점수 산출
- [ ] 빈 필드마다 `missing_reason` 할당
- [ ] `gap_fill_candidates` 리스트 생성 (우선순위 기반)

**필드 가중치 (총합 100%)**:
```
Critical (30%): name(8%), phone(8%), email(7%), careers(7%)
Important (45%): skills(10%), educations(8%), exp_years(7%), ...
Optional (25%): birth_year(4%), gender(3%), projects(5%), ...
```

---

#### Sprint 4: GapFillerAgent (Week 8, 12h)

| Task ID | 작업 | 공수 | 의존성 | 산출물 |
|---------|------|------|--------|--------|
| S4-1 | Targeted Prompt 설계 | 3h | S3-4 | FIELD_PROMPTS 상수 |
| S4-2 | 재시도 로직 구현 | 4h | S4-1 | gap_filler_agent.py |
| S4-3 | Orchestrator 통합 | 3h | S4-2 | pipeline_orchestrator.py |
| S4-4 | 단위 테스트 | 2h | S4-3 | test_gap_filler_agent.py |

**완료 기준**:
- [ ] 빈 필드별 targeted prompt로 재추출
- [ ] 최대 2회 재시도, 5초 타임아웃
- [ ] coverage >= 85% 시 자동 스킵

**파이프라인 위치**:
```
... → ValidationAgent → [CoverageCalculator] → [GapFillerAgent] → PrivacyAgent → ...
```

---

#### Sprint 5: 통합 및 최적화 (Week 9, 14h)

| Task ID | 작업 | 공수 | 의존성 | 산출물 |
|---------|------|------|--------|--------|
| S5-1 | 전체 파이프라인 통합 테스트 | 4h | S4-4 | test_e2e_phase1.py |
| S5-2 | 성능 최적화 | 4h | S5-1 | 벤치마크 결과 |
| S5-3 | 에러 핸들링 보강 | 3h | S5-2 | exceptions.py |
| S5-4 | 문서화 | 3h | S5-3 | 아키텍처 문서 업데이트 |

**완료 기준**:
- [ ] E2E 테스트 통과 (10개 이력서 + 5개 비이력서)
- [ ] P95 처리 시간 < 18초
- [ ] 에러 시 자동 롤백 및 크레딧 환불

---

### 2.3 Gantt Chart

```
Week 4  | Week 5  | Week 6  | Week 7  | Week 8  | Week 9  | Week 10
--------|---------|---------|---------|---------|---------|----------
[===== Sprint 1: 기반 구축 =====]
                  [== Sprint 2: DocumentClassifier ==]
                            [== Sprint 3: CoverageCalculator ==]
                                      [=== Sprint 4: GapFillerAgent ===]
                                                [=== Sprint 5: 통합 ===]
                                                          [Beta 배포]
```

---

## 3. 작업 분해 (WBS)

### 3.1 전체 WBS

```
Phase 1 개발
├── 1. 기반 구축 (16h)
│   ├── 1.1 DB 스키마 마이그레이션 (2h)
│   │   ├── document_kind_enum 생성
│   │   ├── missing_reason_enum 생성
│   │   ├── candidates 테이블 확장
│   │   └── processing_jobs 테이블 확장
│   ├── 1.2 Feature Flags 확장 (2h)
│   │   ├── use_document_classifier
│   │   ├── use_coverage_calculator
│   │   └── use_gap_filler
│   ├── 1.3 공통 타입/스키마 (4h)
│   │   ├── DocumentKind, NonResumeType
│   │   ├── MissingReason, FieldPriority
│   │   └── FieldCoverage, CoverageResult
│   ├── 1.4 PipelineContext 확장 (4h)
│   │   ├── set_document_kind()
│   │   ├── set_coverage()
│   │   └── merge_filled_fields()
│   └── 1.5 테스트 프레임워크 (4h)
│       ├── 픽스처 정의
│       └── 모킹 유틸
│
├── 2. DocumentClassifier (10h)
│   ├── 2.1 Rule-based 분류 (3h)
│   │   ├── RESUME_SIGNALS 정의
│   │   ├── NON_RESUME_SIGNALS 정의
│   │   └── _classify_by_rules() 구현
│   ├── 2.2 LLM Fallback (3h)
│   │   ├── 프롬프트 설계
│   │   └── _classify_by_llm() 구현
│   ├── 2.3 Orchestrator 통합 (2h)
│   │   └── Stage 1.5 추가
│   └── 2.4 테스트 (2h)
│       ├── 이력서 10개 테스트
│       └── 비이력서 10개 테스트
│
├── 3. CoverageCalculator (8h)
│   ├── 3.1 필드 가중치 (2h)
│   │   └── FIELD_WEIGHTS 상수
│   ├── 3.2 Coverage 계산 (3h)
│   │   ├── calculate() 메인 로직
│   │   └── _has_meaningful_value()
│   ├── 3.3 Missing Reason (2h)
│   │   └── _determine_missing_reason()
│   └── 3.4 테스트 (1h)
│
├── 4. GapFillerAgent (12h)
│   ├── 4.1 Targeted Prompt (3h)
│   │   └── FIELD_PROMPTS 상수
│   ├── 4.2 재시도 로직 (4h)
│   │   ├── fill_gaps() 메인 로직
│   │   └── _extract_field_with_retry()
│   ├── 4.3 Orchestrator 통합 (3h)
│   │   └── Stage 3.5-3.6 추가
│   └── 4.4 테스트 (2h)
│
└── 5. 통합 및 최적화 (14h)
    ├── 5.1 E2E 테스트 (4h)
    ├── 5.2 성능 최적화 (4h)
    ├── 5.3 에러 핸들링 (3h)
    └── 5.4 문서화 (3h)

총 공수: 60h (약 7.5일)
```

### 3.2 의존성 그래프

```
                    [S1-1: DB Schema]
                           │
                           ▼
[S1-2: Feature Flags] ←── [S1-3: 공통 타입] ──→ [S1-4: PipelineContext]
         │                      │                        │
         │                      │                        │
         ▼                      ▼                        ▼
         └──────────────► [S1-5: 테스트 프레임워크] ◄────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        [S2: DocumentClassifier]  [S3: CoverageCalculator]
                │               │
                │               ▼
                │         [S4: GapFillerAgent]
                │               │
                ▼               ▼
        [S5-1: 통합 테스트] ◄───┘
                │
                ▼
        [S5-2~4: 최적화/문서화]
                │
                ▼
          [Beta 배포]
```

---

## 4. 기술 설계 요약

### 4.1 수정된 파이프라인 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1 ENHANCED PIPELINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  STAGE 1: VALIDATION                                                 │
│  ├─ RouterAgent ────────────────────────► Reject or Continue        │
│  ├─ File Parser ────────────────────────► raw_text                  │
│  └─ [NEW] DocumentClassifier ───────────► document_kind             │
│           │                                                          │
│           ├─ resume ────────────────────► Continue                  │
│           ├─ non_resume ────────────────► Reject + Refund           │
│           └─ uncertain ─────────────────► Continue with warning     │
│                                                                      │
│  STAGE 2: PRE-SCREENING                                              │
│  └─ IdentityChecker ────────────────────► Reject or Continue        │
│                                                                      │
│  STAGE 3: AI ANALYSIS                                                │
│  ├─ AnalystAgent (GPT-4o + Gemini)                                  │
│  ├─ ValidationAgent                                                  │
│  ├─ [NEW] CoverageCalculator ───────────► coverage_score            │
│  └─ [NEW] GapFillerAgent (if < 85%) ────► filled_fields             │
│                                                                      │
│  STAGE 4: PRIVACY & STORAGE                                          │
│  ├─ PrivacyAgent                                                     │
│  ├─ EmbeddingService                                                 │
│  ├─ DatabaseService                                                  │
│  └─ VisualAgent                                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 DB 스키마 변경

```sql
-- Migration: 20260301_add_phase1_fields.sql

-- ENUM 타입
CREATE TYPE document_kind_enum AS ENUM ('resume', 'non_resume', 'uncertain');
CREATE TYPE missing_reason_enum AS ENUM (
  'not_found_in_source', 'parser_error', 'llm_extraction_failed',
  'low_confidence', 'schema_mismatch', 'timeout'
);

-- candidates 테이블 확장
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS document_kind document_kind_enum DEFAULT 'resume',
  ADD COLUMN IF NOT EXISTS doc_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS field_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coverage_score DECIMAL(5,2);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_candidates_document_kind ON candidates(document_kind);
CREATE INDEX IF NOT EXISTS idx_candidates_coverage_score ON candidates(coverage_score);
```

### 4.3 Feature Flags

```python
@dataclass
class FeatureFlags:
    # 기존
    debug_pipeline: bool = False
    use_llm_validation: bool = True
    use_hallucination_detection: bool = True
    use_evidence_tracking: bool = True

    # Phase 1 신규
    use_document_classifier: bool = False      # DocumentClassifier 활성화
    use_coverage_calculator: bool = False      # CoverageCalculator 활성화
    use_gap_filler: bool = False               # GapFillerAgent 활성화

    # GapFiller 설정
    gap_filler_max_retries: int = 2
    gap_filler_timeout: int = 5
    coverage_threshold: float = 0.85
```

---

## 5. 테스트 전략

### 5.1 테스트 레벨

| 레벨 | 대상 | 커버리지 목표 | 도구 |
|------|------|--------------|------|
| Unit | 개별 Agent 메서드 | 80%+ | pytest |
| Integration | Agent 간 연동 | 70%+ | pytest + fixtures |
| E2E | 전체 파이프라인 | - | pytest + 실제 파일 |

### 5.2 테스트 케이스

#### DocumentClassifier
| ID | 케이스 | 입력 | 기대 결과 |
|----|--------|------|----------|
| DC-1 | 표준 이력서 (한글) | 이름+경력+학력 포함 | `resume`, confidence > 0.8 |
| DC-2 | 영문 이력서 | name+experience 포함 | `resume`, confidence > 0.8 |
| DC-3 | 채용공고 | "채용", "모집" 포함 | `non_resume`, type=job_description |
| DC-4 | 자격증 | "수료증", "certificate" | `non_resume`, type=certificate |
| DC-5 | 모호한 문서 | 신호 부족 | `uncertain`, LLM 호출 |

#### CoverageCalculator
| ID | 케이스 | 입력 | 기대 결과 |
|----|--------|------|----------|
| CC-1 | 완전한 이력서 | 모든 필드 있음 | coverage > 90 |
| CC-2 | 연락처 없음 | phone, email 없음 | coverage ~70, gap_fill_candidates 포함 |
| CC-3 | 최소 정보 | 이름만 있음 | coverage < 30 |

#### GapFillerAgent
| ID | 케이스 | 입력 | 기대 결과 |
|----|--------|------|----------|
| GF-1 | 전화번호 누락 | 원문에 전화번호 있음 | phone 추출 성공 |
| GF-2 | 이메일 누락 | 원문에 이메일 있음 | email 추출 성공 |
| GF-3 | 정보 없음 | 원문에 정보 없음 | still_missing에 포함 |
| GF-4 | 높은 coverage | coverage >= 85% | 스킵, 0 LLM calls |

### 5.3 테스트 데이터셋

```
tests/fixtures/
├── resumes/                    # 이력서 샘플
│   ├── standard_korean.pdf     # 표준 한글 이력서
│   ├── standard_english.docx   # 영문 이력서
│   ├── minimal.hwp             # 최소 정보
│   └── complete.pdf            # 완전한 정보
├── non_resumes/                # 비이력서 샘플
│   ├── job_description.pdf     # 채용공고
│   ├── certificate.pdf         # 자격증
│   └── company_profile.docx    # 회사소개
└── edge_cases/                 # 엣지 케이스
    ├── mixed_content.pdf       # 이력서 + JD 혼합
    └── ambiguous.pdf           # 모호한 문서
```

---

## 6. 배포 전략

### 6.1 롤아웃 단계

```
Stage 1: Internal Testing (Week 9)
├── 환경: Staging
├── 대상: 개발팀 내부
├── Feature Flags: 모두 활성화
└── 목표: 버그 발견 및 수정

Stage 2: Canary Release (Week 10 Day 1-3)
├── 환경: Production
├── 대상: 5% 트래픽
├── Feature Flags: use_document_classifier만 활성화
└── 목표: 비이력서 차단 검증

Stage 3: Gradual Rollout (Week 10 Day 4-7)
├── 환경: Production
├── 대상: 25% → 50% → 100%
├── Feature Flags: 점진적 활성화
└── 목표: 전체 기능 검증

Stage 4: Full Release (Week 11)
├── 환경: Production
├── 대상: 100%
├── Feature Flags: 모두 활성화
└── 목표: 정상 운영
```

### 6.2 롤백 계획

```
롤백 트리거:
- P95 처리 시간 > 25초
- 에러율 > 5%
- coverage_score 평균 < 70 (현재보다 저하)

롤백 절차:
1. Feature Flags 비활성화 (즉시 효과)
2. Sentry 에러 분석
3. 원인 파악 및 수정
4. 재배포
```

### 6.3 모니터링 대시보드

| 메트릭 | 알림 조건 | 확인 주기 |
|--------|----------|----------|
| `processing_time_ms` P95 | > 20초 | 실시간 |
| `coverage_score` 평균 | < 75 | 1시간 |
| `document_kind` 분포 | non_resume > 10% | 일간 |
| `gap_filler_llm_calls` 평균 | > 3 | 1시간 |
| 에러율 | > 3% | 실시간 |

---

## 7. 리스크 관리

### 7.1 리스크 매트릭스

| ID | 리스크 | 확률 | 영향 | 완화 방안 |
|----|--------|------|------|----------|
| R1 | LLM 비용 증가 | Medium | Medium | GapFiller 스킵 임계값, 재시도 제한 |
| R2 | 파이프라인 지연 | Low | High | DocumentClassifier Rule-based 우선 |
| R3 | 오분류 (이력서→비이력서) | Low | High | uncertain 처리, 환불 정책 |
| R4 | DB 마이그레이션 실패 | Low | Medium | 롤백 스크립트 준비 |
| R5 | 통합 테스트 실패 | Medium | Medium | 충분한 테스트 기간 확보 |

### 7.2 대응 계획

**R1: LLM 비용 증가**
```
예방:
- coverage >= 85% 시 GapFiller 스킵
- 필드당 최대 2회 재시도

모니터링:
- 일일 LLM 비용 리포트
- 필드당 평균 호출 수 추적

대응:
- 임계값 상향 조정 (85% → 80%)
- 재시도 횟수 감소 (2 → 1)
```

**R3: 오분류**
```
예방:
- Rule-based + LLM 2단계 분류
- confidence < 0.7 시 uncertain 처리

모니터링:
- 비이력서 차단 건수
- 사용자 이의 제기 건수

대응:
- uncertain을 통과시키도록 정책 변경
- 분류 임계값 조정
```

---

## 8. 커뮤니케이션

### 8.1 체크포인트

| 시점 | 내용 | 참석자 |
|------|------|--------|
| Sprint 시작 | 목표 및 작업 확인 | 개발팀 |
| Sprint 중간 | 진행 상황 공유 | 개발팀 |
| Sprint 종료 | 데모 및 회고 | 개발팀 + PM |
| Beta 배포 전 | Go/No-Go 결정 | 전체 |

### 8.2 문서화

| 문서 | 담당 | 완료 시점 |
|------|------|----------|
| 기술 설계서 | Backend | Sprint 1 종료 |
| API 문서 | Backend | Sprint 5 종료 |
| 운영 매뉴얼 | Backend | Beta 배포 전 |
| 릴리즈 노트 | PM | Beta 배포 시 |

---

## 9. 성공 지표

### 9.1 기술 지표

| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|----------|
| 필드 완성도 | ~78% | 90%+ | `coverage_score` 평균 |
| 비이력서 차단율 | 0% | 95%+ | `document_kind=non_resume` 비율 |
| P95 처리 시간 | 15초 | <18초 | `processing_time_ms` |
| 파이프라인 성공률 | 95% | 98%+ | `status=completed` 비율 |

### 9.2 비즈니스 지표

| 지표 | 현재 | 목표 | 측정 방법 |
|------|------|------|----------|
| 크레딧 환불 건수 | - | 감소 | 환불 API 호출 수 |
| 분석 품질 불만 | - | 감소 | CS 티켓 수 |
| 사용자 재방문율 | - | 증가 | 세션 분석 |

---

## Appendix

### A. 파일 구조

```
apps/worker/
├── agents/
│   ├── document_classifier.py   # [NEW] Sprint 2
│   ├── coverage_calculator.py   # [NEW] Sprint 3
│   ├── gap_filler_agent.py      # [NEW] Sprint 4
│   └── ...                      # 기존 에이전트
├── orchestrator/
│   ├── pipeline_orchestrator.py # [MODIFY] Sprint 2-4
│   └── feature_flags.py         # [MODIFY] Sprint 1
├── context/
│   └── pipeline_context.py      # [MODIFY] Sprint 1
├── schemas/
│   └── phase1_types.py          # [NEW] Sprint 1
└── tests/
    ├── test_document_classifier.py  # [NEW] Sprint 2
    ├── test_coverage_calculator.py  # [NEW] Sprint 3
    ├── test_gap_filler_agent.py     # [NEW] Sprint 4
    └── test_e2e_phase1.py           # [NEW] Sprint 5
```

### B. 관련 문서

| 문서 | 경로 |
|------|------|
| 기술 요구사항 | `docs/architecture/PHASE1_DEVELOPMENT_REQUIREMENTS.md` |
| 멀티에이전트 아키텍처 | `docs/architecture/MULTI_AGENT_PIPELINE.md` |
| 시스템 아키텍처 | `docs/architecture/SYSTEM_ARCHITECTURE.md` |
| 운영 백로그 | `docs/backlog/20260214.md` |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Initial Phase 1 development plan |
