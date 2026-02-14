"""
Phase 1 공통 타입 및 스키마 정의

이 모듈은 Phase 1 신규 에이전트들이 공유하는 타입을 정의합니다:
- DocumentClassifier
- CoverageCalculator
- GapFillerAgent
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================================================
# DocumentClassifier 관련 타입
# ============================================================================

class DocumentKind(str, Enum):
    """문서 분류 결과"""
    RESUME = "resume"                         # 이력서 (연락처, 학력, 경력 포함)
    CAREER_DESCRIPTION = "career_description"  # 경력기술서 (프로젝트 중심, 연락처/학력 선택적)
    NON_RESUME = "non_resume"                 # 비이력서
    UNCERTAIN = "uncertain"                   # 불확실 (LLM fallback 필요)


class NonResumeType(str, Enum):
    """비이력서 세부 유형"""
    JOB_DESCRIPTION = "job_description"   # 채용공고
    CERTIFICATE = "certificate"           # 자격증/수료증
    COMPANY_PROFILE = "company_profile"   # 회사소개서
    PORTFOLIO_ONLY = "portfolio_only"     # 포트폴리오 (이력서 아님)
    CONTRACT = "contract"                 # 계약서
    OTHER = "other"                       # 기타


@dataclass
class ClassificationResult:
    """DocumentClassifier 출력"""
    document_kind: DocumentKind
    confidence: float  # 0.0-1.0
    non_resume_type: Optional[NonResumeType] = None
    signals: List[str] = field(default_factory=list)  # 분류 근거
    llm_used: bool = False  # LLM 호출 여부
    processing_time_ms: int = 0


# ============================================================================
# CoverageCalculator 관련 타입
# ============================================================================

class MissingReason(str, Enum):
    """필드 누락 사유"""
    NOT_FOUND_IN_SOURCE = "not_found_in_source"     # 원문에 정보 없음
    PARSER_ERROR = "parser_error"                   # 파서 오류
    LLM_EXTRACTION_FAILED = "llm_extraction_failed" # LLM 추출 실패
    LOW_CONFIDENCE = "low_confidence"               # 신뢰도 낮음
    SCHEMA_MISMATCH = "schema_mismatch"             # 스키마 불일치
    TIMEOUT = "timeout"                             # 타임아웃


class FieldPriority(str, Enum):
    """필드 우선순위 (가중치 결정)"""
    CRITICAL = "critical"     # 필수 (30%)
    IMPORTANT = "important"   # 중요 (45%)
    OPTIONAL = "optional"     # 선택 (25%)


@dataclass
class FieldCoverage:
    """개별 필드의 커버리지 정보"""
    field_name: str
    has_value: bool
    has_evidence: bool
    confidence: float  # 0.0-1.0
    priority: FieldPriority
    weight: float  # 가중치 (0.0-1.0)
    missing_reason: Optional[MissingReason] = None
    evidence_span: Optional[str] = None  # 원문 위치 참조
    source_agent: Optional[str] = None   # 값을 추출한 에이전트


@dataclass
class CoverageResult:
    """CoverageCalculator 출력"""
    coverage_score: float  # 0-100
    evidence_backed_ratio: float  # 0-1 (증거 기반 비율)
    field_coverages: Dict[str, FieldCoverage] = field(default_factory=dict)
    missing_fields: List[str] = field(default_factory=list)
    low_confidence_fields: List[str] = field(default_factory=list)
    gap_fill_candidates: List[str] = field(default_factory=list)  # GapFiller 대상

    # 우선순위별 통계
    critical_coverage: float = 0.0  # Critical 필드 커버리지
    important_coverage: float = 0.0  # Important 필드 커버리지
    optional_coverage: float = 0.0   # Optional 필드 커버리지


# ============================================================================
# GapFillerAgent 관련 타입
# ============================================================================

@dataclass
class GapFillAttempt:
    """단일 필드 재추출 시도 결과"""
    field_name: str
    success: bool
    value: Optional[Any] = None
    confidence: float = 0.0
    retries_used: int = 0
    error: Optional[str] = None
    processing_time_ms: int = 0


@dataclass
class GapFillResult:
    """GapFillerAgent 출력"""
    success: bool
    filled_fields: Dict[str, Any] = field(default_factory=dict)  # 채워진 필드
    still_missing: List[str] = field(default_factory=list)       # 여전히 빈 필드
    attempts: List[GapFillAttempt] = field(default_factory=list) # 시도 기록
    total_retries: int = 0
    total_llm_calls: int = 0
    skipped: bool = False  # coverage >= threshold 로 스킵됨
    processing_time_ms: int = 0


# ============================================================================
# 필드 가중치 정의 (CoverageCalculator에서 사용)
# ============================================================================

# 필드별 (우선순위, 가중치) 매핑
# 총합 = 1.0 (100%)
FIELD_WEIGHTS: Dict[str, tuple[FieldPriority, float]] = {
    # Critical (30%) - 필수 정보
    "name": (FieldPriority.CRITICAL, 0.08),
    "phone": (FieldPriority.CRITICAL, 0.08),
    "email": (FieldPriority.CRITICAL, 0.07),
    "careers": (FieldPriority.CRITICAL, 0.07),

    # Important (45%) - 중요 정보
    "skills": (FieldPriority.IMPORTANT, 0.10),
    "educations": (FieldPriority.IMPORTANT, 0.08),
    "exp_years": (FieldPriority.IMPORTANT, 0.07),
    "current_company": (FieldPriority.IMPORTANT, 0.05),
    "current_position": (FieldPriority.IMPORTANT, 0.05),
    "summary": (FieldPriority.IMPORTANT, 0.05),
    "strengths": (FieldPriority.IMPORTANT, 0.05),

    # Optional (25%) - 선택 정보
    "birth_year": (FieldPriority.OPTIONAL, 0.04),
    "gender": (FieldPriority.OPTIONAL, 0.03),
    "address": (FieldPriority.OPTIONAL, 0.03),
    "projects": (FieldPriority.OPTIONAL, 0.05),
    "certifications": (FieldPriority.OPTIONAL, 0.05),
    "links": (FieldPriority.OPTIONAL, 0.05),
}


# GapFiller 대상 필드 우선순위 (Critical/Important 필드만)
GAP_FILL_PRIORITY_ORDER = [
    "phone",
    "email",
    "skills",
    "careers",
    "name",
    "educations",
    "exp_years",
    "current_company",
    "current_position",
]

# GapFiller 최대 대상 필드 수
GAP_FILL_MAX_FIELDS = 5

# Coverage 임계값 (이상이면 GapFiller 스킵)
COVERAGE_THRESHOLD = 0.85


# ============================================================================
# DocumentClassifier 분류 신호
# ============================================================================

# 이력서 신호 키워드
RESUME_SIGNALS_KO = [
    "이름", "성명", "연락처", "휴대폰", "이메일",
    "경력", "경력사항", "근무경력", "직장경력",
    "학력", "학력사항", "최종학력",
    "기술", "보유기술", "기술스택", "스킬",
    "자기소개", "지원동기", "자격증",
]

RESUME_SIGNALS_EN = [
    "name", "contact", "phone", "email",
    "experience", "work experience", "employment",
    "education", "academic",
    "skills", "technical skills", "expertise",
    "summary", "objective", "profile",
]

# 경력기술서 신호 키워드 (이력서와 구분되는 특징)
# 경력기술서는 프로젝트 중심으로 작성되며, 연락처/학력이 없는 경우가 많음
CAREER_DESCRIPTION_SIGNALS_KO = [
    "경력기술서", "경력기술", "프로젝트 경력",
    "배경", "문제 정의", "역할", "성과",  # 프로젝트 기술 구조
    "협업", "기획", "개선", "구축", "설계",
    "PM", "Product Manager", "기획자",
]

CAREER_DESCRIPTION_SIGNALS_EN = [
    "career description", "project history",
    "background", "problem definition", "role", "achievement",
    "collaboration", "designed", "built", "improved",
]

# 비이력서 신호 키워드
NON_RESUME_SIGNALS = {
    NonResumeType.JOB_DESCRIPTION: [
        "채용", "모집", "지원자격", "우대사항", "근무조건",
        "job description", "requirements", "qualifications",
        "we are looking for", "job opening", "position available",
    ],
    NonResumeType.CERTIFICATE: [
        "수료증", "자격증", "certificate", "certification",
        "hereby certify", "has completed", "is awarded",
    ],
    NonResumeType.COMPANY_PROFILE: [
        "회사소개", "회사개요", "사업영역", "비전",
        "about us", "our company", "company profile",
        "mission", "vision", "our services",
    ],
    NonResumeType.CONTRACT: [
        "계약서", "근로계약", "contract", "agreement",
        "terms and conditions", "hereby agree",
    ],
}


# ============================================================================
# 유틸리티 함수
# ============================================================================

def get_field_priority(field_name: str) -> FieldPriority:
    """필드의 우선순위 반환"""
    if field_name in FIELD_WEIGHTS:
        return FIELD_WEIGHTS[field_name][0]
    return FieldPriority.OPTIONAL


def get_field_weight(field_name: str) -> float:
    """필드의 가중치 반환"""
    if field_name in FIELD_WEIGHTS:
        return FIELD_WEIGHTS[field_name][1]
    return 0.0


def is_gap_fill_candidate(field_name: str) -> bool:
    """GapFiller 대상 필드인지 확인"""
    return field_name in GAP_FILL_PRIORITY_ORDER
