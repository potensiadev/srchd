# Phase 1 개발 요구사항 및 아키텍처 설계

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0
> **Status**: 설계 완료, 구현 대기 (TIER 4 - 피드백 기반)

---

## 1. Executive Summary

### 1.1 현재 상태

| 구분 | 상태 | 상세 |
|------|------|------|
| **구현 완료 (6개)** | ✅ | RouterAgent, IdentityChecker, AnalystAgent, ValidationAgent, PrivacyAgent, VisualAgent |
| **Phase 1 계획 (3개)** | 📋 | DocumentClassifier, CoverageCalculator, GapFillerAgent |
| **필드 완성도** | ~78% | 목표: 90%+ |
| **파이프라인 지연** | 8-15초 | 목표 P95: <18초 |

### 1.2 Phase 1 목표

1. **필드 완성도 향상**: 78% → 90%+ (`CoverageCalculator` + `GapFillerAgent`)
2. **비이력서 필터링**: 크레딧 낭비 방지 (`DocumentClassifier`)
3. **Unified Context 강화**: 모든 에이전트가 `evidence_map` 공유

### 1.3 구현 우선순위 (백로그 기준)

```
현재 위치: TIER 4 (데이터 기반 개선)
트리거 조건:
- 필드 누락 불만 10건+ → CoverageCalculator + GapFiller
- 비이력서 업로드 비율 >5% → DocumentClassifier
```

**권장**: Beta 피드백 수집 후 데이터 기반 의사결정

---

## 2. Phase 1 신규 컴포넌트 상세 설계

### 2.1 DocumentClassifier (ResumeIntentGuard)

**역할**: 이력서 vs 비이력서 분류

**파일 위치**: `apps/worker/agents/document_classifier.py`

```python
from enum import Enum
from dataclasses import dataclass
from typing import Optional, List

class DocumentKind(str, Enum):
    RESUME = "resume"
    NON_RESUME = "non_resume"
    UNCERTAIN = "uncertain"

class NonResumeType(str, Enum):
    JOB_DESCRIPTION = "job_description"
    CERTIFICATE = "certificate"
    COMPANY_PROFILE = "company_profile"
    PORTFOLIO_ONLY = "portfolio_only"
    OTHER = "other"

@dataclass
class ClassificationResult:
    document_kind: DocumentKind
    confidence: float  # 0.0-1.0
    non_resume_type: Optional[NonResumeType]
    signals: List[str]  # 분류 근거
    llm_used: bool  # LLM 호출 여부

class DocumentClassifier:
    """
    2단계 분류기:
    1. Rule-based (빠름, 무료)
    2. LLM Fallback (정확함, 비용)
    """

    # Rule-based 신호
    RESUME_SIGNALS = [
        "이름", "연락처", "경력", "학력", "기술",
        "name", "contact", "experience", "education", "skills"
    ]

    NON_RESUME_SIGNALS = {
        "job_description": ["채용", "모집", "지원자격", "우대사항"],
        "certificate": ["수료증", "자격증", "certificate"],
        "company_profile": ["회사소개", "about us", "사업영역"],
    }

    async def classify(
        self,
        text: str,
        filename: str,
        confidence_threshold: float = 0.7
    ) -> ClassificationResult:
        """
        분류 수행

        Args:
            text: 파싱된 텍스트
            filename: 파일명 (힌트로 활용)
            confidence_threshold: LLM fallback 기준

        Returns:
            ClassificationResult
        """
        # Step 1: Rule-based 분류
        rule_result = self._classify_by_rules(text, filename)

        if rule_result.confidence >= confidence_threshold:
            return rule_result

        # Step 2: LLM Fallback (GPT-4o-mini)
        return await self._classify_by_llm(text, filename)

    def _classify_by_rules(self, text: str, filename: str) -> ClassificationResult:
        """규칙 기반 분류"""
        signals = []
        resume_score = 0

        # 이력서 신호 탐지
        for signal in self.RESUME_SIGNALS:
            if signal in text.lower():
                signals.append(f"resume_signal:{signal}")
                resume_score += 1

        # 비이력서 신호 탐지
        non_resume_type = None
        for nr_type, keywords in self.NON_RESUME_SIGNALS.items():
            if any(kw in text.lower() for kw in keywords):
                non_resume_type = NonResumeType(nr_type)
                signals.append(f"non_resume_signal:{nr_type}")
                resume_score -= 2

        # 신뢰도 계산
        confidence = min(0.9, resume_score * 0.15) if resume_score > 0 else 0.3

        return ClassificationResult(
            document_kind=DocumentKind.RESUME if resume_score > 2 else DocumentKind.UNCERTAIN,
            confidence=confidence,
            non_resume_type=non_resume_type,
            signals=signals,
            llm_used=False
        )

    async def _classify_by_llm(self, text: str, filename: str) -> ClassificationResult:
        """LLM 기반 분류 (GPT-4o-mini)"""
        # LLM 호출 구현
        pass
```

**파이프라인 위치**: RouterAgent → Parser → **DocumentClassifier** → IdentityChecker

**LLM 비용 분석**:

| 방식 | 비용/건 | 정확도 | 지연 |
|------|---------|--------|------|
| Rule-based only | $0 | 80-85% | +0.1초 |
| Rule + LLM fallback | ~$0.001 | 95%+ | +1-2초 (fallback 시) |

**트리거 조건**: 비이력서 업로드 비율 >5%

---

### 2.2 CoverageCalculator

**역할**: 필드 완성도 점수 산출 + missing_reason 추적

**파일 위치**: `apps/worker/agents/coverage_calculator.py`

```python
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from enum import Enum

class MissingReason(str, Enum):
    NOT_FOUND_IN_SOURCE = "not_found_in_source"
    PARSER_ERROR = "parser_error"
    LLM_EXTRACTION_FAILED = "llm_extraction_failed"
    LOW_CONFIDENCE = "low_confidence"
    SCHEMA_MISMATCH = "schema_mismatch"
    TIMEOUT = "timeout"

class FieldPriority(str, Enum):
    CRITICAL = "critical"      # 가중치 0.3
    IMPORTANT = "important"    # 가중치 0.15
    OPTIONAL = "optional"      # 가중치 0.05

@dataclass
class FieldCoverage:
    field_name: str
    has_value: bool
    has_evidence: bool
    confidence: float
    missing_reason: Optional[MissingReason]
    evidence_span: Optional[str]  # 원문 위치 참조

@dataclass
class CoverageResult:
    coverage_score: float  # 0-100
    evidence_backed_ratio: float  # 0-1
    field_coverages: Dict[str, FieldCoverage]
    missing_fields: List[str]
    low_confidence_fields: List[str]
    gap_fill_candidates: List[str]  # GapFiller 대상

class CoverageCalculator:
    """
    필드 완성도 계산기

    LLM 호출: 0 (순수 계산)
    """

    # 필드 가중치 정의
    FIELD_WEIGHTS = {
        # Critical (30%)
        "name": (FieldPriority.CRITICAL, 0.08),
        "phone": (FieldPriority.CRITICAL, 0.08),
        "email": (FieldPriority.CRITICAL, 0.07),
        "careers": (FieldPriority.CRITICAL, 0.07),

        # Important (45%)
        "skills": (FieldPriority.IMPORTANT, 0.10),
        "educations": (FieldPriority.IMPORTANT, 0.08),
        "exp_years": (FieldPriority.IMPORTANT, 0.07),
        "current_company": (FieldPriority.IMPORTANT, 0.05),
        "current_position": (FieldPriority.IMPORTANT, 0.05),
        "summary": (FieldPriority.IMPORTANT, 0.05),
        "strengths": (FieldPriority.IMPORTANT, 0.05),

        # Optional (25%)
        "birth_year": (FieldPriority.OPTIONAL, 0.04),
        "gender": (FieldPriority.OPTIONAL, 0.03),
        "address": (FieldPriority.OPTIONAL, 0.03),
        "projects": (FieldPriority.OPTIONAL, 0.05),
        "certifications": (FieldPriority.OPTIONAL, 0.05),
        "links": (FieldPriority.OPTIONAL, 0.05),
    }

    GAP_FILL_THRESHOLD = 0.85  # 이 이상이면 GapFiller 스킵
    LOW_CONFIDENCE_THRESHOLD = 0.6

    def calculate(
        self,
        analyzed_data: Dict[str, Any],
        evidence_map: Dict[str, Any],
        original_text: str
    ) -> CoverageResult:
        """
        필드 완성도 계산

        Args:
            analyzed_data: AnalystAgent 출력
            evidence_map: 필드별 원문 근거
            original_text: 파싱된 원문

        Returns:
            CoverageResult
        """
        field_coverages = {}
        total_weight = 0
        achieved_weight = 0
        evidence_count = 0

        for field_name, (priority, weight) in self.FIELD_WEIGHTS.items():
            value = analyzed_data.get(field_name)
            evidence = evidence_map.get(field_name)
            confidence = analyzed_data.get("field_confidence", {}).get(field_name, 0.5)

            has_value = self._has_meaningful_value(value)
            has_evidence = evidence is not None and len(str(evidence)) > 0

            # Missing reason 결정
            missing_reason = None
            if not has_value:
                missing_reason = self._determine_missing_reason(
                    field_name, value, evidence, original_text
                )

            field_coverages[field_name] = FieldCoverage(
                field_name=field_name,
                has_value=has_value,
                has_evidence=has_evidence,
                confidence=confidence,
                missing_reason=missing_reason,
                evidence_span=evidence
            )

            total_weight += weight
            if has_value and confidence >= self.LOW_CONFIDENCE_THRESHOLD:
                achieved_weight += weight
            if has_evidence:
                evidence_count += 1

        # 점수 계산
        coverage_score = (achieved_weight / total_weight) * 100 if total_weight > 0 else 0
        evidence_backed_ratio = evidence_count / len(self.FIELD_WEIGHTS)

        # GapFiller 대상 식별
        missing_fields = [
            f for f, c in field_coverages.items()
            if not c.has_value
        ]
        low_confidence_fields = [
            f for f, c in field_coverages.items()
            if c.has_value and c.confidence < self.LOW_CONFIDENCE_THRESHOLD
        ]
        gap_fill_candidates = self._prioritize_gap_fill(
            missing_fields, low_confidence_fields
        )

        return CoverageResult(
            coverage_score=coverage_score,
            evidence_backed_ratio=evidence_backed_ratio,
            field_coverages=field_coverages,
            missing_fields=missing_fields,
            low_confidence_fields=low_confidence_fields,
            gap_fill_candidates=gap_fill_candidates
        )

    def _has_meaningful_value(self, value: Any) -> bool:
        """의미 있는 값인지 확인"""
        if value is None:
            return False
        if isinstance(value, str) and len(value.strip()) == 0:
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        return True

    def _determine_missing_reason(
        self,
        field_name: str,
        value: Any,
        evidence: Any,
        original_text: str
    ) -> MissingReason:
        """Missing reason 결정"""
        # 원문에서 관련 키워드 검색
        field_keywords = {
            "phone": ["전화", "연락처", "핸드폰", "010", "phone"],
            "email": ["이메일", "email", "@"],
            "skills": ["기술", "스킬", "역량", "skill"],
            "educations": ["학력", "학교", "대학", "education"],
        }

        keywords = field_keywords.get(field_name, [])
        found_in_source = any(kw in original_text.lower() for kw in keywords)

        if not found_in_source:
            return MissingReason.NOT_FOUND_IN_SOURCE
        if evidence is not None:
            return MissingReason.LLM_EXTRACTION_FAILED
        return MissingReason.PARSER_ERROR

    def _prioritize_gap_fill(
        self,
        missing: List[str],
        low_confidence: List[str]
    ) -> List[str]:
        """GapFiller 우선순위 결정"""
        # Critical > Important > Optional 순서
        priority_order = ["phone", "email", "skills", "careers", "name"]

        candidates = missing + low_confidence
        return [f for f in priority_order if f in candidates][:5]  # 최대 5개
```

**파이프라인 위치**: AnalystAgent → ValidationAgent → **CoverageCalculator** → GapFillerAgent

---

### 2.3 GapFillerAgent

**역할**: 빈 필드 타겟 재추출 (최대 2회)

**파일 위치**: `apps/worker/agents/gap_filler_agent.py`

```python
from dataclasses import dataclass
from typing import Dict, List, Any, Optional

@dataclass
class GapFillResult:
    success: bool
    filled_fields: Dict[str, Any]  # 채워진 필드
    still_missing: List[str]  # 여전히 빈 필드
    retries_used: int
    total_llm_calls: int

class GapFillerAgent:
    """
    빈 필드 타겟 재추출

    전략:
    1. CoverageCalculator에서 받은 gap_fill_candidates만 처리
    2. 필드별 targeted prompt 사용
    3. 최대 2회 재시도, 5초 타임아웃
    4. coverage >= 85% 이면 스킵
    """

    MAX_RETRIES = 2
    TIMEOUT_SECONDS = 5
    SKIP_THRESHOLD = 0.85  # 85% 이상이면 스킵

    # 필드별 targeted prompt 템플릿
    FIELD_PROMPTS = {
        "phone": """
Extract ONLY the phone number from this resume text.
Return in format: 010-XXXX-XXXX
If not found, return null.
""",
        "email": """
Extract ONLY the email address from this resume text.
If not found, return null.
""",
        "skills": """
Extract ONLY the technical skills and tools mentioned in this resume.
Return as a JSON array of strings.
If none found, return empty array.
""",
        "careers": """
Extract ONLY the work experience/career history from this resume.
For each position, extract: company, position, start_date, end_date.
Return as a JSON array.
If none found, return empty array.
""",
    }

    async def fill_gaps(
        self,
        gap_candidates: List[str],
        current_data: Dict[str, Any],
        original_text: str,
        coverage_score: float
    ) -> GapFillResult:
        """
        빈 필드 채우기

        Args:
            gap_candidates: CoverageCalculator에서 받은 대상 필드
            current_data: 현재까지 분석된 데이터
            original_text: 원문
            coverage_score: 현재 coverage 점수

        Returns:
            GapFillResult
        """
        # Skip if coverage is high enough
        if coverage_score >= self.SKIP_THRESHOLD * 100:
            return GapFillResult(
                success=True,
                filled_fields={},
                still_missing=[],
                retries_used=0,
                total_llm_calls=0
            )

        filled = {}
        still_missing = []
        total_calls = 0

        for field in gap_candidates:
            if field not in self.FIELD_PROMPTS:
                still_missing.append(field)
                continue

            # Targeted extraction with retries
            result = await self._extract_field_with_retry(
                field, original_text
            )
            total_calls += result["calls"]

            if result["value"] is not None:
                filled[field] = result["value"]
            else:
                still_missing.append(field)

        return GapFillResult(
            success=len(filled) > 0,
            filled_fields=filled,
            still_missing=still_missing,
            retries_used=total_calls,
            total_llm_calls=total_calls
        )

    async def _extract_field_with_retry(
        self,
        field: str,
        text: str
    ) -> Dict[str, Any]:
        """단일 필드 재추출 (with retry)"""
        prompt = self.FIELD_PROMPTS[field]
        calls = 0

        for attempt in range(self.MAX_RETRIES):
            calls += 1
            try:
                result = await self._call_llm_with_timeout(
                    prompt, text, self.TIMEOUT_SECONDS
                )
                if result is not None:
                    return {"value": result, "calls": calls}
            except TimeoutError:
                continue

        return {"value": None, "calls": calls}

    async def _call_llm_with_timeout(
        self,
        prompt: str,
        text: str,
        timeout: int
    ) -> Optional[Any]:
        """타임아웃이 있는 LLM 호출"""
        # LLM Manager를 통한 호출 구현
        pass
```

**파이프라인 위치**: CoverageCalculator → **GapFillerAgent** → PrivacyAgent

---

## 3. 통합 아키텍처 변경

### 3.1 수정된 Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1 ENHANCED PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  STAGE 1: VALIDATION                                                     │
│  ├─ RouterAgent (Magic number, DRM, Size) ─────► Reject or Continue     │
│  ├─ File Parser (HWP/PDF/DOCX) ─────────────► raw_text                  │
│  └─ [NEW] DocumentClassifier ───────────────► document_kind             │
│           │                                                              │
│           ├─ resume ────────────────────────► Continue                  │
│           ├─ non_resume ────────────────────► Reject + Refund           │
│           └─ uncertain ─────────────────────► Continue with warning     │
│                                                                          │
│  STAGE 2: PRE-SCREENING                                                  │
│  └─ IdentityChecker (Multi-person detection) ─► Reject or Continue      │
│                                                                          │
│  STAGE 3: AI ANALYSIS                                                    │
│  ├─ AnalystAgent (GPT-4o + Gemini Cross-Check)                          │
│  │     └─► analyzed_data + field_confidence + evidence_map              │
│  │                                                                       │
│  ├─ ValidationAgent (Rule-based verification)                           │
│  │     └─► corrected_data + confidence_adjustments                      │
│  │                                                                       │
│  ├─ [NEW] CoverageCalculator                                            │
│  │     └─► coverage_score + missing_fields + gap_fill_candidates        │
│  │                                                                       │
│  └─ [NEW] GapFillerAgent (if coverage < 85%)                            │
│        └─► filled_fields (0-2 LLM calls per field)                      │
│                                                                          │
│  STAGE 4: PRIVACY & STORAGE                                              │
│  ├─ PrivacyAgent (AES-256-GCM encryption)                               │
│  ├─ EmbeddingService (text-embedding-3-small)                           │
│  ├─ DatabaseService (Supabase + pgvector)                               │
│  └─ VisualAgent (Portfolio capture, optional)                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Unified Resume Context Contract

모든 에이전트가 공유해야 하는 컨텍스트:

```json
{
  "resume_intent": true,
  "document_type": "resume",
  "resume_id": "uuid",
  "pipeline_id": "uuid",
  "raw_text": "...",
  "sections": ["profile", "career", "education", "skills", "projects"],
  "evidence_map": {
    "name": {"text": "홍길동", "span": [0, 15], "page": 1},
    "phone": {"text": "010-1234-5678", "span": [20, 35], "page": 1}
  },
  "field_metadata": {
    "name": {"source": "analyst", "confidence": 0.95},
    "phone": {"source": "gap_filler", "confidence": 0.88}
  },
  "missing_policy": "allow_null_only_if_not_found_in_source"
}
```

**Rules**:
1. `document_type != resume` → LLM-heavy 단계 전 중단
2. 모든 agent output에 field-level evidence 포함
3. Orchestrator는 `value + evidence` 또는 `missing_reason`만 저장
4. GapFiller는 동일 `resume_id` 컨텍스트 유지

### 3.3 PipelineOrchestrator 수정

```python
# apps/worker/orchestrator/pipeline_orchestrator.py 수정 사항

class PipelineOrchestrator:
    async def run(self, ...) -> OrchestratorResult:
        # ... 기존 코드 ...

        # Stage 1.5: Document Classification (NEW)
        if self.feature_flags.use_document_classifier:
            classification = await self.document_classifier.classify(
                text=parsed_text,
                filename=filename
            )

            if classification.document_kind == DocumentKind.NON_RESUME:
                return self._create_rejection_result(
                    reason="non_resume",
                    non_resume_type=classification.non_resume_type
                )

            ctx.set_document_kind(classification)

        # ... 기존 분석 코드 ...

        # Stage 3.5: Coverage Calculation (NEW)
        if self.feature_flags.use_coverage_calculator:
            coverage = self.coverage_calculator.calculate(
                analyzed_data=ctx.current_data.to_dict(),
                evidence_map=ctx.evidence_store.get_all(),
                original_text=parsed_text
            )

            ctx.set_coverage(coverage)

            # Stage 3.6: Gap Filling (NEW)
            if (self.feature_flags.use_gap_filler and
                coverage.coverage_score < 85):
                gap_result = await self.gap_filler.fill_gaps(
                    gap_candidates=coverage.gap_fill_candidates,
                    current_data=ctx.current_data.to_dict(),
                    original_text=parsed_text,
                    coverage_score=coverage.coverage_score
                )

                ctx.merge_filled_fields(gap_result.filled_fields)

        # ... 이후 코드 ...
```

---

## 4. 데이터베이스 스키마 변경

### 4.1 candidates 테이블 확장

```sql
-- Migration: add_phase1_fields.sql

-- 1. ENUM 타입 생성
CREATE TYPE document_kind_enum AS ENUM ('resume', 'non_resume', 'uncertain');
CREATE TYPE missing_reason_enum AS ENUM (
  'not_found_in_source',
  'parser_error',
  'llm_extraction_failed',
  'low_confidence',
  'schema_mismatch',
  'timeout'
);

-- 2. 컬럼 추가
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS document_kind document_kind_enum DEFAULT 'resume',
  ADD COLUMN IF NOT EXISTS doc_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS field_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coverage_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS evidence_backed_ratio DECIMAL(3,2);

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_candidates_document_kind
  ON candidates(document_kind);
CREATE INDEX IF NOT EXISTS idx_candidates_coverage_score
  ON candidates(coverage_score);

-- 4. field_metadata JSONB 구조 예시
COMMENT ON COLUMN candidates.field_metadata IS '
{
  "name": {
    "source": "analyst",
    "confidence": 0.95,
    "evidence_span": [0, 15],
    "missing_reason": null
  },
  "phone": {
    "source": "gap_filler",
    "confidence": 0.88,
    "evidence_span": [20, 35],
    "missing_reason": null
  },
  "address": {
    "source": null,
    "confidence": null,
    "evidence_span": null,
    "missing_reason": "not_found_in_source"
  }
}';
```

### 4.2 processing_jobs 테이블 확장

```sql
-- processing_jobs에 Phase 1 메타데이터 추가
ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS document_classification JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coverage_metrics JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gap_fill_attempts INT DEFAULT 0;
```

---

## 5. Feature Flags 추가

```python
# apps/worker/orchestrator/feature_flags.py

@dataclass
class FeatureFlags:
    # 기존 플래그
    debug_pipeline: bool = False
    use_llm_validation: bool = True
    use_hallucination_detection: bool = True
    use_evidence_tracking: bool = True

    # Phase 1 신규 플래그
    use_document_classifier: bool = False  # T4-4
    use_coverage_calculator: bool = False  # T4-3
    use_gap_filler: bool = False           # T4-3
    gap_filler_max_retries: int = 2
    gap_filler_timeout: int = 5
    coverage_threshold: float = 0.85
```

---

## 6. 리스크 및 단점 분석

### 6.1 기술적 리스크

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|----------|
| **LLM 비용 증가** | MEDIUM | GapFiller: coverage >= 85% 시 스킵, 최대 2회 재시도 |
| **파이프라인 지연** | LOW | DocumentClassifier: Rule-based 우선, LLM fallback은 ~1초 |
| **복잡도 증가** | MEDIUM | Feature flag로 점진적 활성화, 롤백 용이 |
| **스키마 마이그레이션** | LOW | 호환성 유지 (기존 컬럼 영향 없음) |

### 6.2 비즈니스 리스크

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|----------|
| **오분류로 인한 크레딧 환불** | MEDIUM | DocumentClassifier confidence < 0.7 시 uncertain 처리, 통과 |
| **GapFiller 실패 시 사용자 기대치** | LOW | coverage_score를 UI에 표시하여 투명성 확보 |
| **비이력서 차단으로 인한 불만** | LOW | 환불 + 명확한 사유 안내 |

### 6.3 구현 우선순위 권고

```
현재 권장: 구현 보류 (TIER 4)

트리거 조건:
1. 필드 누락 불만 10건+ → CoverageCalculator + GapFiller 구현
2. 비이력서 업로드 >5% → DocumentClassifier 구현
3. Pro 유저 10명+ → 3-Way Cross-Check 검토

근거:
- 현재 95% 성공률로 Beta 운영 가능
- 8-15초 처리 시간은 허용 범위
- 피드백 없이 과도한 최적화는 Over-engineering
```

---

## 7. 구현 체크리스트

### Phase 1A: DocumentClassifier

- [ ] `apps/worker/agents/document_classifier.py` 생성
- [ ] Rule-based 분류 로직 구현
- [ ] LLM fallback 구현 (GPT-4o-mini)
- [ ] `pipeline_orchestrator.py`에 통합
- [ ] Feature flag 추가: `use_document_classifier`
- [ ] 단위 테스트 작성
- [ ] DB 스키마 마이그레이션

### Phase 1B: CoverageCalculator

- [ ] `apps/worker/agents/coverage_calculator.py` 생성
- [ ] 필드 가중치 정의
- [ ] Missing reason 로직 구현
- [ ] `pipeline_orchestrator.py`에 통합
- [ ] Feature flag 추가: `use_coverage_calculator`
- [ ] 단위 테스트 작성

### Phase 1C: GapFillerAgent

- [ ] `apps/worker/agents/gap_filler_agent.py` 생성
- [ ] 필드별 targeted prompt 정의
- [ ] 재시도 로직 구현
- [ ] `pipeline_orchestrator.py`에 통합
- [ ] Feature flag 추가: `use_gap_filler`
- [ ] 단위 테스트 작성
- [ ] 통합 테스트 작성

### 공통

- [ ] `CLAUDE.md` 업데이트 (새 에이전트 추가)
- [ ] `MULTI_AGENT_PIPELINE.md` 상태 업데이트
- [ ] E2E 테스트 추가

---

## 8. 예상 공수

| 작업 | 공수 | 의존성 |
|------|------|--------|
| DocumentClassifier | 6h | 없음 |
| CoverageCalculator | 4h | 없음 |
| GapFillerAgent | 8h | CoverageCalculator |
| DB 마이그레이션 | 2h | 없음 |
| 테스트 작성 | 6h | 전체 |
| 통합 및 검증 | 4h | 전체 |
| **합계** | **30h** | - |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Initial Phase 1 development requirements |
