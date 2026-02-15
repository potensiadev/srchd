# Phase 1 & Phase 2 상세 설계서

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0
> **Status**: Approved for Implementation

## Table of Contents

1. [개요](#1-개요)
2. [Phase 1 상세 설계](#2-phase-1-상세-설계)
3. [Phase 2 상세 설계](#3-phase-2-상세-설계)
4. [구현 명세](#4-구현-명세)
5. [마이그레이션 계획](#5-마이그레이션-계획)
6. [테스트 전략](#6-테스트-전략)

---

## 1. 개요

### 1.1 배경

현재 SRCHD 파이프라인은 다음 두 가지 핵심 문제를 가지고 있습니다:

1. **암묵적 이력서 가정**: 시스템이 "업로드된 모든 문서는 이력서"라고 가정하고 처리
2. **필드 완결성 미보장**: 문서에 데이터가 있어도 빈 필드가 발생할 수 있음

### 1.2 목표

| 목표 | 측정 지표 | 목표값 |
|------|-----------|--------|
| 비이력서 차단 | Non-resume Rejection Rate | 95%+ |
| 필드 완결성 향상 | Field Coverage Score | 90%+ |
| 처리 시간 유지 | P95 Latency | < 15초 |
| 비용 효율성 | Cost per Resume | < $0.05 |

### 1.3 Phase 구분

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 1 (2주)                                                               │
│  ├── 1A: DocumentClassifier 도입                                            │
│  ├── 1B: Context Schema 확장 (document_kind 전파)                            │
│  ├── 1C: Field Coverage Score + missing_reason 도입                         │
│  └── 1D: GapFillerAgent 추가                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 2 (1-2개월)                                                           │
│  ├── 2A: retry_gapfill 전용 큐 분리                                         │
│  ├── 2B: 운영 KPI 대시보드                                                   │
│  └── 2C: Career + Skill Agent 병렬화 POC                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 상세 설계

### 2.1 Phase 1A: DocumentClassifier 도입

#### 2.1.1 목적

파싱 직후 문서가 이력서인지 판정하여 비이력서 유입을 조기 차단합니다.

#### 2.1.2 파이프라인 위치

```
현재:
  Router → Parser → IdentityChecker → Analyst → Validation → Privacy → Embedding → DB

개선:
  Router → Parser → [DocumentClassifier] → IdentityChecker → Analyst → ...
```

#### 2.1.3 Agent 설계

```python
# apps/worker/agents/document_classifier.py

from dataclasses import dataclass
from enum import Enum
from typing import Optional, List

class DocumentKind(str, Enum):
    RESUME = "resume"
    NON_RESUME = "non_resume"
    UNCERTAIN = "uncertain"

class NonResumeType(str, Enum):
    COVER_LETTER = "cover_letter"        # 자기소개서
    RECOMMENDATION = "recommendation"    # 추천서
    PORTFOLIO = "portfolio"              # 포트폴리오
    CONTRACT = "contract"                # 계약서
    JOB_DESCRIPTION = "job_description"  # 채용공고
    CERTIFICATE = "certificate"          # 자격증/증명서
    OTHER = "other"

@dataclass
class ClassificationResult:
    document_kind: DocumentKind
    doc_confidence: float                    # 0.0 ~ 1.0
    non_resume_type: Optional[NonResumeType] # document_kind가 non_resume일 때
    rejection_reason: Optional[str]
    signals: List[str]                       # 판정 근거 신호들
    processing_time_ms: int

class DocumentClassifier:
    """
    문서 분류 에이전트

    전략:
    1. Rule-based 사전 필터링 (비용 0)
    2. 불확실 시 GPT-4o-mini 호출 (저비용)

    판정 기준:
    - 이력서 신호: 경력, 학력, 기술스택, 연락처 패턴
    - 비이력서 신호: "지원동기", "추천합니다", "계약조건" 등
    """

    # 이력서 신호 키워드 (한글/영문)
    RESUME_SIGNALS = [
        # 섹션 헤더
        r"경력\s*사항", r"학력\s*사항", r"기술\s*스택", r"자격증",
        r"work\s*experience", r"education", r"skills",
        # 연락처 패턴
        r"010-\d{4}-\d{4}", r"[a-z0-9]+@[a-z0-9]+\.[a-z]+",
        # 날짜 패턴 (경력 기간)
        r"\d{4}\.\d{2}\s*[-~]\s*\d{4}\.\d{2}",
        r"\d{4}년\s*\d{1,2}월\s*[-~]",
    ]

    # 비이력서 신호 키워드
    NON_RESUME_SIGNALS = {
        "cover_letter": [r"지원\s*동기", r"입사\s*후\s*포부", r"성장\s*과정"],
        "recommendation": [r"추천합니다", r"추천서", r"recommendation"],
        "job_description": [r"채용\s*공고", r"모집\s*요강", r"자격\s*요건"],
        "contract": [r"계약\s*조건", r"근로\s*계약", r"연봉\s*협상"],
    }

    async def classify(
        self,
        parsed_text: str,
        filename: str,
        sections: Optional[List[str]] = None
    ) -> ClassificationResult:
        """
        문서 분류 수행

        Args:
            parsed_text: 파싱된 텍스트 전문
            filename: 원본 파일명
            sections: 파싱 시 분리된 섹션들 (optional)

        Returns:
            ClassificationResult
        """
        start_time = time.time()

        # Step 1: Rule-based 사전 필터링
        rule_result = self._rule_based_classification(parsed_text, filename)

        if rule_result.doc_confidence >= 0.9:
            # 높은 확신 → LLM 호출 없이 반환
            rule_result.processing_time_ms = int((time.time() - start_time) * 1000)
            return rule_result

        # Step 2: 불확실 시 LLM 호출
        llm_result = await self._llm_classification(parsed_text, filename)

        # Step 3: 결과 병합 (rule + llm)
        final_result = self._merge_results(rule_result, llm_result)
        final_result.processing_time_ms = int((time.time() - start_time) * 1000)

        return final_result

    def _rule_based_classification(
        self,
        text: str,
        filename: str
    ) -> ClassificationResult:
        """규칙 기반 1차 분류"""
        signals = []
        resume_score = 0
        non_resume_score = 0
        detected_non_resume_type = None

        # 이력서 신호 탐지
        for pattern in self.RESUME_SIGNALS:
            if re.search(pattern, text, re.IGNORECASE):
                resume_score += 1
                signals.append(f"resume_signal:{pattern[:20]}")

        # 비이력서 신호 탐지
        for doc_type, patterns in self.NON_RESUME_SIGNALS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    non_resume_score += 1
                    detected_non_resume_type = NonResumeType(doc_type)
                    signals.append(f"non_resume_signal:{doc_type}")

        # 파일명 힌트
        filename_lower = filename.lower()
        if any(kw in filename_lower for kw in ["이력서", "resume", "cv"]):
            resume_score += 2
            signals.append("filename_hint:resume")
        elif any(kw in filename_lower for kw in ["자소서", "자기소개", "cover"]):
            non_resume_score += 2
            signals.append("filename_hint:cover_letter")

        # 점수 기반 판정
        total = resume_score + non_resume_score
        if total == 0:
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                doc_confidence=0.5,
                non_resume_type=None,
                rejection_reason=None,
                signals=signals
            )

        resume_ratio = resume_score / total

        if resume_ratio >= 0.7:
            return ClassificationResult(
                document_kind=DocumentKind.RESUME,
                doc_confidence=min(0.9, 0.5 + resume_ratio * 0.4),
                non_resume_type=None,
                rejection_reason=None,
                signals=signals
            )
        elif resume_ratio <= 0.3:
            return ClassificationResult(
                document_kind=DocumentKind.NON_RESUME,
                doc_confidence=min(0.9, 0.5 + (1 - resume_ratio) * 0.4),
                non_resume_type=detected_non_resume_type,
                rejection_reason=f"비이력서 문서로 판정됨: {detected_non_resume_type}",
                signals=signals
            )
        else:
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                doc_confidence=0.5 + abs(resume_ratio - 0.5),
                non_resume_type=None,
                rejection_reason=None,
                signals=signals
            )

    async def _llm_classification(
        self,
        text: str,
        filename: str
    ) -> ClassificationResult:
        """LLM 기반 2차 분류 (GPT-4o-mini)"""
        # 텍스트 truncate (비용 절감)
        truncated_text = text[:3000] if len(text) > 3000 else text

        prompt = f"""
        다음 문서가 이력서(Resume/CV)인지 판정하세요.

        파일명: {filename}

        문서 내용:
        {truncated_text}

        JSON 형식으로 응답:
        {{
            "document_type": "resume" | "cover_letter" | "recommendation" | "portfolio" | "job_description" | "other",
            "confidence": 0.0-1.0,
            "reason": "판정 이유"
        }}
        """

        response = await self.llm_manager.call_openai(
            prompt=prompt,
            model="gpt-4o-mini",
            temperature=0.1
        )

        # 응답 파싱 및 ClassificationResult 변환
        # ...
```

#### 2.1.4 분기 처리 로직

```python
# apps/worker/orchestrator/pipeline_orchestrator.py 수정

async def _stage_document_classification(self) -> None:
    """Stage 2.5: 문서 분류"""
    self.ctx.start_stage("document_classification", "DocumentClassifier")

    try:
        result = await self.document_classifier.classify(
            parsed_text=self.ctx.parsed_data.raw_text,
            filename=self.ctx.raw_input.filename,
            sections=self.ctx.parsed_data.sections
        )

        # 컨텍스트에 결과 저장
        self.ctx.metadata.document_kind = result.document_kind
        self.ctx.metadata.doc_confidence = result.doc_confidence

        # 분기 처리
        if result.document_kind == DocumentKind.NON_RESUME:
            # 즉시 실패 + 크레딧 환불
            raise PermanentError(
                code="NON_RESUME_DOCUMENT",
                message=result.rejection_reason or "이력서가 아닌 문서입니다",
                details={"non_resume_type": result.non_resume_type}
            )

        elif result.document_kind == DocumentKind.UNCERTAIN:
            # 경고와 함께 진행
            self.ctx.warning_collector.add(
                code="UNCERTAIN_DOCUMENT_TYPE",
                message="문서 유형이 불확실합니다. 이력서가 아닐 수 있습니다.",
                severity="warning",
                field_name="document_kind",
                stage_name="document_classification"
            )
            # requires_review 플래그 설정
            self.ctx.metadata.requires_review = True

        self.ctx.complete_stage("document_classification", result)

    except Exception as e:
        self.ctx.fail_stage("document_classification", str(e))
        raise
```

---

### 2.2 Phase 1B: Context Schema 확장

#### 2.2.1 PipelineMetadata 확장

```python
# apps/worker/context/pipeline_context.py 수정

@dataclass
class PipelineMetadata:
    """파이프라인 메타데이터"""
    pipeline_id: str
    job_id: str
    user_id: str
    mode: AnalysisMode

    # 신규 필드
    document_kind: Optional[DocumentKind] = None
    doc_confidence: Optional[float] = None
    requires_review: bool = False

    # 기존 필드
    start_time: float = field(default_factory=time.time)
    timeout_seconds: int = 120
    feature_flags: Dict[str, bool] = field(default_factory=dict)
```

#### 2.2.2 PipelineRequest 확장

```python
# apps/worker/schemas/pipeline_request.py 수정

class PipelineRequest(BaseModel):
    """파이프라인 요청 스키마"""
    file_url: str
    file_name: str
    user_id: str
    job_id: str
    mode: AnalysisMode = AnalysisMode.PHASE_1
    candidate_id: Optional[str] = None

    # 신규 필드 (사전 분류된 경우)
    document_kind: Optional[DocumentKind] = None
    doc_confidence: Optional[float] = None
```

#### 2.2.3 Context 전파 보장

```python
# 모든 에이전트가 document_kind에 접근 가능하도록 보장

class AnalystAgent:
    async def analyze(
        self,
        resume_text: str,
        mode: AnalysisMode,
        filename: str,
        context: Optional[PipelineContext] = None  # 컨텍스트 전달
    ) -> AnalysisResult:

        # document_kind에 따른 프롬프트 조정
        if context and context.metadata.document_kind == DocumentKind.UNCERTAIN:
            # 보수적 추출 모드
            system_prompt = self._get_conservative_prompt()
        else:
            system_prompt = self._get_standard_prompt()
```

---

### 2.3 Phase 1C: Field Coverage Score 도입

#### 2.3.1 데이터 모델

```python
# apps/worker/schemas/field_coverage.py (신규)

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Any, Dict, List

class MissingReason(str, Enum):
    """필드 누락 사유"""
    NOT_FOUND_IN_SOURCE = "not_found_in_source"    # 원문에 정보 없음
    PARSER_ERROR = "parser_error"                   # 파싱 실패
    LLM_EXTRACTION_FAILED = "llm_extraction_failed" # LLM 추출 실패
    LOW_CONFIDENCE = "low_confidence"               # 신뢰도 부족
    SCHEMA_MISMATCH = "schema_mismatch"             # 스키마 불일치
    TIMEOUT = "timeout"                             # 시간 초과

@dataclass
class FieldStatus:
    """개별 필드 상태"""
    field_name: str
    filled: bool
    value: Optional[Any] = None
    evidence: Optional[str] = None        # 원문에서 추출한 근거 (최대 200자)
    evidence_span: Optional[tuple] = None # (start_idx, end_idx) in original text
    confidence: float = 0.0
    missing_reason: Optional[MissingReason] = None
    extraction_attempts: int = 1

@dataclass
class FieldCoverageResult:
    """전체 필드 커버리지 결과"""
    coverage_score: float                   # 0.0 ~ 1.0
    evidence_backed_ratio: float            # 근거 있는 필드 비율
    total_fields: int
    filled_fields: int
    missing_fields: int
    field_statuses: Dict[str, FieldStatus]
    low_confidence_fields: List[str]        # 재추출 후보
    critical_missing: List[str]             # 핵심 필드 누락
```

#### 2.3.2 Coverage 계산 로직

```python
# apps/worker/services/coverage_calculator.py (신규)

class CoverageCalculator:
    """필드 커버리지 계산기"""

    # 필수 필드 (하나라도 없으면 경고)
    CRITICAL_FIELDS = ["name", "phone", "email"]

    # 중요 필드 (커버리지 점수에 가중치)
    IMPORTANT_FIELDS = ["exp_years", "skills", "last_company", "last_position"]

    # 선택 필드
    OPTIONAL_FIELDS = ["birth_year", "gender", "address", "portfolio_url",
                       "github_url", "linkedin_url", "summary"]

    # 복합 필드 (배열)
    ARRAY_FIELDS = ["careers", "educations", "projects", "skills", "strengths"]

    # 가중치
    WEIGHTS = {
        "critical": 3.0,
        "important": 2.0,
        "optional": 1.0,
        "array": 1.5
    }

    def calculate(
        self,
        analyzed_data: Dict[str, Any],
        field_confidence: Dict[str, float],
        raw_text: str
    ) -> FieldCoverageResult:
        """커버리지 계산"""
        field_statuses = {}
        total_weight = 0
        filled_weight = 0
        evidence_count = 0

        # 각 필드 검사
        all_fields = (
            self.CRITICAL_FIELDS +
            self.IMPORTANT_FIELDS +
            self.OPTIONAL_FIELDS +
            self.ARRAY_FIELDS
        )

        for field_name in all_fields:
            weight = self._get_weight(field_name)
            total_weight += weight

            value = analyzed_data.get(field_name)
            confidence = field_confidence.get(field_name, 0.0)

            # 채워짐 여부 판정
            filled = self._is_filled(value, field_name)

            # 근거 추출
            evidence = None
            evidence_span = None
            if filled and value:
                evidence, evidence_span = self._extract_evidence(
                    field_name, value, raw_text
                )

            # 누락 사유 판정
            missing_reason = None
            if not filled:
                missing_reason = self._determine_missing_reason(
                    field_name, value, confidence, raw_text
                )

            field_statuses[field_name] = FieldStatus(
                field_name=field_name,
                filled=filled,
                value=value if filled else None,
                evidence=evidence,
                evidence_span=evidence_span,
                confidence=confidence,
                missing_reason=missing_reason
            )

            if filled:
                filled_weight += weight
                if evidence:
                    evidence_count += 1

        # 점수 계산
        coverage_score = filled_weight / total_weight if total_weight > 0 else 0
        filled_count = sum(1 for fs in field_statuses.values() if fs.filled)
        evidence_ratio = evidence_count / filled_count if filled_count > 0 else 0

        # 낮은 신뢰도 필드 (재추출 후보)
        low_confidence_fields = [
            name for name, fs in field_statuses.items()
            if fs.filled and fs.confidence < 0.7
        ]

        # 핵심 필드 누락
        critical_missing = [
            name for name in self.CRITICAL_FIELDS
            if not field_statuses.get(name, FieldStatus(name, False)).filled
        ]

        return FieldCoverageResult(
            coverage_score=round(coverage_score, 3),
            evidence_backed_ratio=round(evidence_ratio, 3),
            total_fields=len(all_fields),
            filled_fields=filled_count,
            missing_fields=len(all_fields) - filled_count,
            field_statuses=field_statuses,
            low_confidence_fields=low_confidence_fields,
            critical_missing=critical_missing
        )

    def _is_filled(self, value: Any, field_name: str) -> bool:
        """필드가 채워졌는지 판정"""
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        if field_name in self.ARRAY_FIELDS and isinstance(value, list):
            # 배열 필드는 최소 1개 이상 유효 항목 필요
            return any(self._is_valid_array_item(item) for item in value)
        return True

    def _is_valid_array_item(self, item: Any) -> bool:
        """배열 항목 유효성"""
        if isinstance(item, dict):
            # 핵심 키가 있는지
            return any(v for v in item.values() if v)
        return bool(item)

    def _extract_evidence(
        self,
        field_name: str,
        value: Any,
        raw_text: str
    ) -> tuple:
        """원문에서 근거 추출"""
        if isinstance(value, str):
            # 문자열 값의 경우 원문에서 검색
            idx = raw_text.find(value[:50])  # 처음 50자로 검색
            if idx >= 0:
                # 앞뒤 컨텍스트 포함
                start = max(0, idx - 20)
                end = min(len(raw_text), idx + len(value) + 20)
                evidence = raw_text[start:end]
                return evidence[:200], (start, end)

        elif isinstance(value, list) and value:
            # 배열의 경우 첫 번째 항목으로 검색
            first_item = value[0] if value else None
            if isinstance(first_item, str):
                return self._extract_evidence(field_name, first_item, raw_text)
            elif isinstance(first_item, dict):
                # 주요 값으로 검색
                for key in ["company", "school", "name", "position"]:
                    if key in first_item and first_item[key]:
                        return self._extract_evidence(field_name, first_item[key], raw_text)

        return None, None

    def _determine_missing_reason(
        self,
        field_name: str,
        value: Any,
        confidence: float,
        raw_text: str
    ) -> MissingReason:
        """누락 사유 판정"""
        # 신뢰도가 있지만 값이 없음 → LLM 추출 실패
        if confidence > 0:
            return MissingReason.LLM_EXTRACTION_FAILED

        # 원문에서 관련 키워드 검색
        keywords = self._get_field_keywords(field_name)
        for kw in keywords:
            if kw in raw_text.lower():
                # 키워드는 있지만 추출 실패
                return MissingReason.PARSER_ERROR

        # 원문에 정보 없음
        return MissingReason.NOT_FOUND_IN_SOURCE

    def _get_weight(self, field_name: str) -> float:
        if field_name in self.CRITICAL_FIELDS:
            return self.WEIGHTS["critical"]
        elif field_name in self.IMPORTANT_FIELDS:
            return self.WEIGHTS["important"]
        elif field_name in self.ARRAY_FIELDS:
            return self.WEIGHTS["array"]
        return self.WEIGHTS["optional"]

    def _get_field_keywords(self, field_name: str) -> List[str]:
        """필드별 검색 키워드"""
        keywords_map = {
            "phone": ["전화", "연락처", "핸드폰", "휴대폰", "010"],
            "email": ["이메일", "email", "@"],
            "birth_year": ["생년", "출생", "년생"],
            "address": ["주소", "거주지"],
            "skills": ["기술", "스킬", "skill", "언어", "프레임워크"],
            "careers": ["경력", "경험", "근무", "재직"],
            "educations": ["학력", "졸업", "대학", "학교"],
            "projects": ["프로젝트", "project", "수행"],
        }
        return keywords_map.get(field_name, [])
```

#### 2.3.3 DB 스키마 변경

```sql
-- supabase/migrations/20260214200000_add_field_metadata.sql

-- candidates 테이블에 field_metadata 컬럼 추가
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS field_metadata JSONB DEFAULT '{}';

-- document_kind enum 타입 추가
DO $$ BEGIN
    CREATE TYPE document_kind AS ENUM ('resume', 'non_resume', 'uncertain');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- candidates 테이블에 document_kind 컬럼 추가
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS document_kind document_kind DEFAULT 'resume';

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS doc_confidence DECIMAL(3,2);

-- field_metadata 인덱스 (coverage_score로 필터링용)
CREATE INDEX IF NOT EXISTS idx_candidates_coverage_score
ON candidates ((field_metadata->>'coverage_score')::float);

-- 낮은 커버리지 후보자 조회용
CREATE INDEX IF NOT EXISTS idx_candidates_low_coverage
ON candidates (user_id, created_at DESC)
WHERE (field_metadata->>'coverage_score')::float < 0.7;

-- 코멘트 추가
COMMENT ON COLUMN candidates.field_metadata IS
'필드별 추출 상태 및 커버리지 점수.
예: {"coverage_score": 0.85, "fields": {"name": {"filled": true, "evidence": "홍길동"}}}';

COMMENT ON COLUMN candidates.document_kind IS
'문서 유형 (resume: 이력서, non_resume: 비이력서, uncertain: 불확실)';
```

---

### 2.4 Phase 1D: GapFillerAgent 추가

#### 2.4.1 Agent 설계

```python
# apps/worker/agents/gap_filler_agent.py (신규)

from dataclasses import dataclass
from typing import Dict, List, Any, Optional
import asyncio

@dataclass
class GapFillAttempt:
    """단일 필드 재추출 시도"""
    field_name: str
    original_value: Any
    new_value: Any
    success: bool
    confidence: float
    evidence: Optional[str]
    attempt_number: int

@dataclass
class GapFillResult:
    """Gap Fill 전체 결과"""
    success: bool
    attempts: List[GapFillAttempt]
    fields_recovered: int
    fields_failed: int
    total_time_ms: int
    coverage_before: float
    coverage_after: float

class GapFillerAgent:
    """
    빈 필드 재추출 에이전트

    전략:
    1. 낮은 신뢰도 / 빈 필드 식별
    2. 필드별 targeted 프롬프트로 재추출 시도
    3. 최대 2회 시도 후 포기

    비용 최적화:
    - 빈 필드만 대상
    - 동일 모델 사용 (escalate 옵션)
    - 배치 처리 (여러 필드 동시)
    """

    MAX_RETRIES = 2
    TIMEOUT_SECONDS = 5
    BATCH_SIZE = 3  # 동시 처리 필드 수

    # 재추출 대상 필드 우선순위
    PRIORITY_FIELDS = [
        "phone", "email",           # 연락처 (핵심)
        "skills",                   # 기술스택
        "exp_years", "last_company", "last_position",  # 경력 요약
        "careers",                  # 상세 경력
        "educations",               # 학력
    ]

    def __init__(self, llm_manager, coverage_calculator):
        self.llm_manager = llm_manager
        self.coverage_calculator = coverage_calculator

    async def fill_gaps(
        self,
        analyzed_data: Dict[str, Any],
        coverage_result: FieldCoverageResult,
        raw_text: str,
        context: Optional[PipelineContext] = None
    ) -> GapFillResult:
        """
        빈 필드 재추출 수행

        Args:
            analyzed_data: 현재까지 추출된 데이터
            coverage_result: 커버리지 분석 결과
            raw_text: 원본 텍스트
            context: 파이프라인 컨텍스트

        Returns:
            GapFillResult
        """
        start_time = time.time()

        # 재추출 대상 필드 선정
        target_fields = self._select_target_fields(coverage_result)

        if not target_fields:
            return GapFillResult(
                success=True,
                attempts=[],
                fields_recovered=0,
                fields_failed=0,
                total_time_ms=0,
                coverage_before=coverage_result.coverage_score,
                coverage_after=coverage_result.coverage_score
            )

        # 배치 처리
        all_attempts = []
        updated_data = analyzed_data.copy()

        for i in range(0, len(target_fields), self.BATCH_SIZE):
            batch = target_fields[i:i + self.BATCH_SIZE]

            # 타임아웃 체크
            elapsed = time.time() - start_time
            if elapsed > self.TIMEOUT_SECONDS:
                # 남은 필드는 포기
                for field in target_fields[i:]:
                    all_attempts.append(GapFillAttempt(
                        field_name=field,
                        original_value=None,
                        new_value=None,
                        success=False,
                        confidence=0,
                        evidence=None,
                        attempt_number=0
                    ))
                break

            # 배치 재추출
            batch_results = await self._extract_batch(
                batch, updated_data, raw_text
            )

            for result in batch_results:
                all_attempts.append(result)
                if result.success:
                    updated_data[result.field_name] = result.new_value

        # 최종 커버리지 재계산
        new_coverage = self.coverage_calculator.calculate(
            updated_data,
            {},  # 새로운 confidence는 attempts에서
            raw_text
        )

        # 통계
        recovered = sum(1 for a in all_attempts if a.success)
        failed = sum(1 for a in all_attempts if not a.success)

        return GapFillResult(
            success=True,
            attempts=all_attempts,
            fields_recovered=recovered,
            fields_failed=failed,
            total_time_ms=int((time.time() - start_time) * 1000),
            coverage_before=coverage_result.coverage_score,
            coverage_after=new_coverage.coverage_score
        )

    def _select_target_fields(
        self,
        coverage_result: FieldCoverageResult
    ) -> List[str]:
        """재추출 대상 필드 선정"""
        targets = []

        # 1. 누락된 핵심 필드 (최우선)
        for field in coverage_result.critical_missing:
            if field in self.PRIORITY_FIELDS:
                targets.append(field)

        # 2. 낮은 신뢰도 필드
        for field in coverage_result.low_confidence_fields:
            if field not in targets and field in self.PRIORITY_FIELDS:
                targets.append(field)

        # 3. 나머지 빈 필드 (우선순위 순)
        for field in self.PRIORITY_FIELDS:
            status = coverage_result.field_statuses.get(field)
            if status and not status.filled and field not in targets:
                targets.append(field)

        return targets[:6]  # 최대 6개 필드만

    async def _extract_batch(
        self,
        fields: List[str],
        current_data: Dict[str, Any],
        raw_text: str
    ) -> List[GapFillAttempt]:
        """배치 재추출"""
        tasks = [
            self._extract_single_field(field, current_data, raw_text)
            for field in fields
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        attempts = []
        for field, result in zip(fields, results):
            if isinstance(result, Exception):
                attempts.append(GapFillAttempt(
                    field_name=field,
                    original_value=current_data.get(field),
                    new_value=None,
                    success=False,
                    confidence=0,
                    evidence=None,
                    attempt_number=1
                ))
            else:
                attempts.append(result)

        return attempts

    async def _extract_single_field(
        self,
        field_name: str,
        current_data: Dict[str, Any],
        raw_text: str
    ) -> GapFillAttempt:
        """단일 필드 재추출"""
        prompt = self._build_targeted_prompt(field_name, raw_text)

        try:
            response = await self.llm_manager.call_openai(
                prompt=prompt,
                model="gpt-4o",
                temperature=0.1,
                max_tokens=500
            )

            # 응답 파싱
            extracted_value, confidence, evidence = self._parse_response(
                response, field_name
            )

            success = extracted_value is not None and self._validate_value(
                field_name, extracted_value
            )

            return GapFillAttempt(
                field_name=field_name,
                original_value=current_data.get(field_name),
                new_value=extracted_value if success else None,
                success=success,
                confidence=confidence,
                evidence=evidence,
                attempt_number=1
            )

        except Exception as e:
            return GapFillAttempt(
                field_name=field_name,
                original_value=current_data.get(field_name),
                new_value=None,
                success=False,
                confidence=0,
                evidence=None,
                attempt_number=1
            )

    def _build_targeted_prompt(self, field_name: str, raw_text: str) -> str:
        """필드별 targeted 프롬프트"""
        field_prompts = {
            "phone": """
                다음 문서에서 연락처(휴대폰 번호)를 찾아주세요.
                형식: 010-XXXX-XXXX
                없으면 null을 반환하세요.
            """,
            "email": """
                다음 문서에서 이메일 주소를 찾아주세요.
                없으면 null을 반환하세요.
            """,
            "skills": """
                다음 문서에서 기술 스택/프로그래밍 언어/도구를 모두 찾아 배열로 반환하세요.
                예: ["Python", "JavaScript", "PostgreSQL"]
            """,
            "exp_years": """
                다음 문서에서 총 경력 연수를 계산하세요.
                경력 기간들을 합산하여 소수점 1자리까지 반환하세요.
            """,
            # ... 다른 필드들
        }

        base_prompt = field_prompts.get(field_name, f"""
            다음 문서에서 '{field_name}' 정보를 찾아주세요.
            없으면 null을 반환하세요.
        """)

        return f"""
        {base_prompt}

        문서 내용:
        {raw_text[:4000]}

        JSON 형식으로 응답:
        {{
            "value": <추출된 값 또는 null>,
            "confidence": <0.0-1.0>,
            "evidence": "<원문에서 찾은 근거 문장>"
        }}
        """
```

#### 2.4.2 파이프라인 통합

```python
# apps/worker/orchestrator/pipeline_orchestrator.py 수정

async def _stage_gap_filling(self) -> None:
    """Stage 6.5: Gap Filling"""

    # 커버리지가 충분하면 스킵
    if self.ctx.coverage_result.coverage_score >= 0.85:
        return

    self.ctx.start_stage("gap_filling", "GapFillerAgent")

    try:
        result = await self.gap_filler.fill_gaps(
            analyzed_data=self.ctx.current_data.to_dict(),
            coverage_result=self.ctx.coverage_result,
            raw_text=self.ctx.parsed_data.raw_text,
            context=self.ctx
        )

        # 결과 반영
        for attempt in result.attempts:
            if attempt.success:
                self.ctx.current_data.set_field(
                    attempt.field_name,
                    attempt.new_value
                )
                self.ctx.add_evidence(
                    field_name=attempt.field_name,
                    value=attempt.new_value,
                    llm_provider="gap_filler",
                    confidence=attempt.confidence,
                    reasoning=attempt.evidence
                )

        # 메트릭 기록
        self.ctx.metadata.gap_fill_result = {
            "recovered": result.fields_recovered,
            "failed": result.fields_failed,
            "coverage_improvement": result.coverage_after - result.coverage_before
        }

        self.ctx.complete_stage("gap_filling", result)

    except Exception as e:
        # Gap Fill 실패는 치명적이지 않음 → 경고만
        self.ctx.warning_collector.add(
            code="GAP_FILL_FAILED",
            message=str(e),
            severity="warning",
            stage_name="gap_filling"
        )
```

---

## 3. Phase 2 상세 설계

### 3.1 Phase 2A: retry_gapfill 전용 큐 분리

#### 3.1.1 큐 구조

```python
# apps/worker/services/queue_service.py 수정

class QueueConfig:
    QUEUES = {
        "fast_queue": {
            "file_types": ["pdf", "docx"],
            "timeout": 120,
            "retry_count": 2
        },
        "slow_queue": {
            "file_types": ["hwp", "hwpx"],
            "timeout": 180,
            "retry_count": 2
        },
        "gapfill_queue": {  # 신규
            "purpose": "retry_extraction",
            "timeout": 60,
            "retry_count": 1,
            "priority": "low"
        }
    }
```

#### 3.1.2 Gap Fill 재시도 태스크

```python
# apps/worker/tasks.py 추가

@rq_job("gapfill_queue", timeout=60)
async def retry_gap_fill(
    candidate_id: str,
    user_id: str,
    target_fields: List[str]
) -> Dict:
    """
    Gap Fill 재시도 태스크

    기존 후보자의 빈 필드에 대해 재추출 시도
    """
    # 1. 기존 데이터 로드
    candidate = await db.get_candidate(candidate_id)

    # 2. 원본 텍스트 로드 (저장되어 있다면)
    raw_text = await storage.get_raw_text(candidate_id)

    # 3. Gap Fill 수행
    result = await gap_filler.fill_gaps(
        analyzed_data=candidate.to_dict(),
        coverage_result=None,  # 새로 계산
        raw_text=raw_text,
        target_fields=target_fields
    )

    # 4. 결과 저장
    if result.fields_recovered > 0:
        await db.update_candidate_fields(
            candidate_id,
            {a.field_name: a.new_value for a in result.attempts if a.success}
        )

    return {
        "candidate_id": candidate_id,
        "recovered": result.fields_recovered,
        "failed": result.fields_failed
    }
```

---

### 3.2 Phase 2B: 운영 KPI 대시보드

#### 3.2.1 메트릭 수집

```python
# apps/worker/metrics/collector.py (신규)

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List

@dataclass
class ProcessingMetrics:
    """처리 메트릭"""
    job_id: str
    user_id: str
    timestamp: datetime

    # 시간 메트릭
    total_time_ms: int
    parsing_time_ms: int
    classification_time_ms: int
    analysis_time_ms: int
    gap_fill_time_ms: int
    embedding_time_ms: int

    # 품질 메트릭
    coverage_score: float
    evidence_backed_ratio: float
    confidence_score: float

    # Gap Fill 메트릭
    gap_fill_attempted: int
    gap_fill_recovered: int
    gap_fill_success_rate: float

    # 분류 메트릭
    document_kind: str
    doc_confidence: float

    # 비용 메트릭
    llm_calls: int
    total_tokens: int
    estimated_cost_usd: float

class MetricsCollector:
    """메트릭 수집기"""

    async def collect_from_context(
        self,
        ctx: PipelineContext
    ) -> ProcessingMetrics:
        """컨텍스트에서 메트릭 수집"""
        # 각 스테이지 시간 계산
        stage_times = {}
        for stage_name, stage_result in ctx.stage_results.items():
            stage_times[stage_name] = stage_result.duration_ms

        # Gap Fill 메트릭
        gap_fill_result = ctx.metadata.gap_fill_result or {}
        gap_fill_attempted = gap_fill_result.get("recovered", 0) + gap_fill_result.get("failed", 0)
        gap_fill_recovered = gap_fill_result.get("recovered", 0)

        return ProcessingMetrics(
            job_id=ctx.metadata.job_id,
            user_id=ctx.metadata.user_id,
            timestamp=datetime.utcnow(),

            total_time_ms=int((time.time() - ctx.metadata.start_time) * 1000),
            parsing_time_ms=stage_times.get("parsing", 0),
            classification_time_ms=stage_times.get("document_classification", 0),
            analysis_time_ms=stage_times.get("analysis", 0),
            gap_fill_time_ms=stage_times.get("gap_filling", 0),
            embedding_time_ms=stage_times.get("embedding", 0),

            coverage_score=ctx.coverage_result.coverage_score if ctx.coverage_result else 0,
            evidence_backed_ratio=ctx.coverage_result.evidence_backed_ratio if ctx.coverage_result else 0,
            confidence_score=ctx.final_confidence_score,

            gap_fill_attempted=gap_fill_attempted,
            gap_fill_recovered=gap_fill_recovered,
            gap_fill_success_rate=gap_fill_recovered / gap_fill_attempted if gap_fill_attempted > 0 else 0,

            document_kind=ctx.metadata.document_kind.value if ctx.metadata.document_kind else "unknown",
            doc_confidence=ctx.metadata.doc_confidence or 0,

            llm_calls=ctx.llm_call_count,
            total_tokens=ctx.total_tokens_used,
            estimated_cost_usd=self._estimate_cost(ctx)
        )

    def _estimate_cost(self, ctx: PipelineContext) -> float:
        """비용 추정"""
        # GPT-4o: $5/1M input, $15/1M output
        # GPT-4o-mini: $0.15/1M input, $0.6/1M output
        # text-embedding-3-small: $0.02/1M tokens

        # 대략적인 추정
        return ctx.total_tokens_used * 0.00001  # 평균 $0.01/1000 tokens
```

#### 3.2.2 KPI 정의

```sql
-- 운영 KPI 뷰

-- 일별 처리 통계
CREATE OR REPLACE VIEW daily_processing_stats AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_processed,
    AVG((field_metadata->>'coverage_score')::float) as avg_coverage,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_latency_ms,
    SUM(CASE WHEN document_kind = 'non_resume' THEN 1 ELSE 0 END) as non_resume_rejected,
    AVG(CASE WHEN (field_metadata->>'gap_fill_recovered')::int > 0
        THEN (field_metadata->>'gap_fill_recovered')::float /
             ((field_metadata->>'gap_fill_recovered')::float + (field_metadata->>'gap_fill_failed')::float)
        ELSE 0 END) as gap_fill_success_rate
FROM candidates
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 사용자별 품질 통계
CREATE OR REPLACE VIEW user_quality_stats AS
SELECT
    user_id,
    COUNT(*) as total_candidates,
    AVG((field_metadata->>'coverage_score')::float) as avg_coverage,
    SUM(CASE WHEN (field_metadata->>'coverage_score')::float < 0.7 THEN 1 ELSE 0 END) as low_coverage_count
FROM candidates
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id;
```

---

### 3.3 Phase 2C: Career + Skill Agent 병렬화 POC

#### 3.3.1 설계 개요

```
현재 (직렬):
  AnalystAgent (단일 LLM 호출, ~4초)
      ↓
  모든 필드 추출

POC (병렬):
  ┌─ CareerExtractor (경력 전문) ─┐
  │                                │
  │                                ├─► FieldMerger ─► 통합 결과
  │                                │
  └─ SkillExtractor (기술 전문) ──┘

  예상 시간: ~2.5초 (40% 단축)
  추가 비용: ~1.5x (context 중복)
```

#### 3.3.2 POC 구현

```python
# apps/worker/agents/parallel_extractors.py (신규)

class CareerExtractor:
    """경력 전문 추출기"""

    SCHEMA = {
        "careers": [...],
        "exp_years": float,
        "last_company": str,
        "last_position": str
    }

    async def extract(self, text: str) -> Dict:
        prompt = """
        다음 이력서에서 경력 정보만 추출하세요.

        추출 대상:
        - 각 경력의 회사명, 직책, 기간, 업무 내용
        - 총 경력 연수
        - 최근 회사 및 직책
        """
        # ...

class SkillExtractor:
    """기술 스택 전문 추출기"""

    SCHEMA = {
        "skills": [str],
        "skill_categories": {
            "languages": [str],
            "frameworks": [str],
            "tools": [str],
            "databases": [str]
        }
    }

    async def extract(self, text: str) -> Dict:
        prompt = """
        다음 이력서에서 기술 스택 정보만 추출하세요.

        추출 대상:
        - 프로그래밍 언어
        - 프레임워크/라이브러리
        - 도구/플랫폼
        - 데이터베이스
        """
        # ...

class ParallelAnalystPOC:
    """병렬 분석 POC"""

    async def analyze(self, text: str) -> AnalysisResult:
        # 병렬 실행
        career_task = self.career_extractor.extract(text)
        skill_task = self.skill_extractor.extract(text)
        base_task = self.base_extractor.extract(text)  # 나머지 필드

        results = await asyncio.gather(
            career_task,
            skill_task,
            base_task,
            return_exceptions=True
        )

        # 병합
        merged = self._merge_results(results)

        # Cross-check (기존 로직 유지)
        if self.mode == AnalysisMode.PHASE_2:
            merged = await self._cross_check(merged, text)

        return merged
```

#### 3.3.3 A/B 테스트 설계

```python
# Feature flag로 A/B 테스트
class FeatureFlags:
    @staticmethod
    def use_parallel_extraction(user_id: str) -> bool:
        """
        사용자의 10%에게만 병렬 추출 적용
        """
        hash_value = hash(user_id) % 100
        return hash_value < 10  # 10% 롤아웃
```

---

## 4. 구현 명세

### 4.1 파일 구조 변경

```
apps/worker/
├── agents/
│   ├── document_classifier.py    # 신규 (Phase 1A)
│   ├── gap_filler_agent.py       # 신규 (Phase 1D)
│   ├── parallel_extractors.py    # 신규 (Phase 2C, POC)
│   └── ... (기존 파일들)
├── schemas/
│   ├── field_coverage.py         # 신규 (Phase 1C)
│   └── ... (기존 파일들)
├── services/
│   ├── coverage_calculator.py    # 신규 (Phase 1C)
│   └── ... (기존 파일들)
├── metrics/
│   └── collector.py              # 신규 (Phase 2B)
└── orchestrator/
    └── pipeline_orchestrator.py  # 수정 (전 Phase)
```

### 4.2 환경 변수 추가

```bash
# .env 추가

# Document Classification
DOC_CLASSIFIER_CONFIDENCE_THRESHOLD=0.7  # 이 이상이면 LLM 스킵

# Gap Filler
GAP_FILLER_ENABLED=true
GAP_FILLER_MAX_RETRIES=2
GAP_FILLER_TIMEOUT_SECONDS=5
GAP_FILLER_MIN_COVERAGE_THRESHOLD=0.85  # 이 이상이면 스킵

# Parallel Extraction (Phase 2C)
PARALLEL_EXTRACTION_ENABLED=false
PARALLEL_EXTRACTION_ROLLOUT_PERCENT=10
```

---

## 5. 마이그레이션 계획

### 5.1 Phase 1 마이그레이션

```sql
-- Step 1: 컬럼 추가 (무중단)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS field_metadata JSONB DEFAULT '{}';

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS document_kind VARCHAR(20) DEFAULT 'resume';

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS doc_confidence DECIMAL(3,2);

-- Step 2: 기존 데이터 기본값 설정
UPDATE candidates
SET document_kind = 'resume', doc_confidence = 1.0
WHERE document_kind IS NULL;

-- Step 3: 인덱스 추가
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_coverage_score
ON candidates ((field_metadata->>'coverage_score')::float);
```

### 5.2 롤백 계획

```sql
-- 롤백 시 (필요한 경우)
ALTER TABLE candidates DROP COLUMN IF EXISTS field_metadata;
ALTER TABLE candidates DROP COLUMN IF EXISTS document_kind;
ALTER TABLE candidates DROP COLUMN IF EXISTS doc_confidence;
```

---

## 6. 테스트 전략

### 6.1 단위 테스트

```python
# tests/unit/test_document_classifier.py

class TestDocumentClassifier:

    async def test_classify_resume_korean(self):
        """한글 이력서 분류"""
        text = "경력사항\n삼성전자 2020.01 - 2024.12\n학력사항\n서울대학교"
        result = await classifier.classify(text, "홍길동_이력서.pdf")
        assert result.document_kind == DocumentKind.RESUME
        assert result.doc_confidence >= 0.8

    async def test_classify_non_resume_cover_letter(self):
        """자기소개서 분류"""
        text = "지원동기\n저는 귀사에 지원하게 된 동기는..."
        result = await classifier.classify(text, "자기소개서.docx")
        assert result.document_kind == DocumentKind.NON_RESUME
        assert result.non_resume_type == NonResumeType.COVER_LETTER

    async def test_classify_uncertain(self):
        """불확실한 문서"""
        text = "프로젝트 포트폴리오\n기술 스택: Python, React"
        result = await classifier.classify(text, "portfolio.pdf")
        assert result.document_kind == DocumentKind.UNCERTAIN
```

### 6.2 통합 테스트

```python
# tests/integration/test_full_pipeline.py

class TestFullPipelineWithNewStages:

    async def test_pipeline_with_document_classification(self):
        """문서 분류 포함 전체 파이프라인"""
        result = await orchestrator.run(
            file_bytes=SAMPLE_RESUME_BYTES,
            filename="테스트_이력서.pdf",
            user_id="test-user"
        )

        assert result.success
        assert result.context_summary["document_kind"] == "resume"
        assert result.context_summary["coverage_score"] >= 0.7

    async def test_non_resume_rejection(self):
        """비이력서 거부 테스트"""
        result = await orchestrator.run(
            file_bytes=COVER_LETTER_BYTES,
            filename="자기소개서.docx",
            user_id="test-user"
        )

        assert not result.success
        assert result.error_code == "NON_RESUME_DOCUMENT"

    async def test_gap_filling_improves_coverage(self):
        """Gap Fill이 커버리지 향상시키는지"""
        result = await orchestrator.run(
            file_bytes=SPARSE_RESUME_BYTES,
            filename="이력서_정보부족.pdf",
            user_id="test-user"
        )

        gap_fill = result.context_summary.get("gap_fill_result", {})
        assert gap_fill.get("coverage_improvement", 0) > 0
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Phase 1 & Phase 2 상세 설계 초안 |
