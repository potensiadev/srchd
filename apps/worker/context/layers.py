"""
PipelineContext의 데이터 레이어들

각 레이어는 파이프라인의 특정 단계 또는 데이터 유형을 담당합니다.
"""

import re
import os
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class RawInput:
    """
    원본 입력 데이터 레이어

    업로드된 파일의 원본 데이터와 메타데이터를 보존합니다.
    file_bytes는 메모리 효율을 위해 lazy loading으로 처리합니다.
    """
    file_bytes: Optional[bytes] = None
    file_path: Optional[str] = None
    filename: str = ""
    file_extension: str = ""
    file_size: int = 0
    mime_type: str = ""
    upload_timestamp: datetime = field(default_factory=datetime.now)
    source: str = ""  # "upload", "url", "email"

    # S3 정보 (file_bytes 대신 참조)
    s3_bucket: Optional[str] = None
    s3_key: Optional[str] = None

    def set_file(self, file_bytes: bytes, filename: str, **kwargs):
        """파일 데이터 설정"""
        self.file_bytes = file_bytes
        self.filename = filename
        self.file_extension = os.path.splitext(filename)[1].lower()
        self.file_size = len(file_bytes)

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def clear_bytes(self):
        """메모리 절약을 위해 file_bytes 제거"""
        self.file_bytes = None


@dataclass
class ParsedData:
    """
    파싱된 데이터 레이어

    파싱된 텍스트와 구조화된 데이터를 저장합니다.
    raw_text와 cleaned_text를 분리하여 환각 검증 시 원본 대조가 가능합니다.
    """
    raw_text: str = ""
    cleaned_text: str = ""
    text_length: int = 0

    # 구조화된 섹션
    sections: Dict[str, str] = field(default_factory=dict)
    # {"경력": "...", "학력": "...", "기술스택": "..."}

    # 파싱 품질 지표
    parsing_confidence: float = 0.0
    parsing_method: str = ""  # "pdfplumber", "hwp5", "docx"
    parsing_warnings: List[str] = field(default_factory=list)

    # 테이블 데이터
    tables: List[Dict[str, Any]] = field(default_factory=list)

    # 이미지/시각 요소
    has_images: bool = False
    image_count: int = 0

    def set_text(self, raw_text: str, cleaned_text: str = None, **kwargs):
        """파싱된 텍스트 설정"""
        self.raw_text = raw_text
        self.cleaned_text = cleaned_text or raw_text
        self.text_length = len(raw_text)

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)


@dataclass
class PIIStore:
    """
    개인정보 저장소 레이어

    정규식으로 추출한 PII를 안전하게 저장합니다.
    이 데이터는 LLM에 절대 전송하지 않습니다.
    """
    # 정규식으로 추출된 PII
    name: Optional[str] = None
    name_confidence: float = 0.0
    name_source: str = ""  # "filename", "text_header", "regex"

    phone: Optional[str] = None
    phone_confidence: float = 0.0
    phone_original_format: str = ""

    email: Optional[str] = None
    email_confidence: float = 0.0

    # 추가 PII (필요시)
    birth_date: Optional[str] = None
    address: Optional[str] = None

    # 마스킹된 텍스트 (LLM용)
    masked_text: str = ""
    masking_map: Dict[str, str] = field(default_factory=dict)
    # {"[NAME]": "김철수", "[PHONE]": "010-1234-5678"}

    # 추출 시각
    extracted_at: Optional[datetime] = None

    # 정규식 패턴
    KOREAN_NAME_PATTERN = re.compile(r'^[가-힣]{2,4}$')
    ENGLISH_NAME_PATTERN = re.compile(r'^[A-Za-z\s\-\.]+$')
    PHONE_PATTERN = re.compile(r'01[0-9][-\s]?\d{3,4}[-\s]?\d{4}')
    EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

    def extract_from_text(self, text: str, filename: Optional[str] = None):
        """
        텍스트에서 PII 추출 (정규식만 사용, LLM 없음)

        우선순위:
        - 이름: 파일명 → 텍스트 상단 200자 → 정규식 패턴
        - 전화번호: 정규식
        - 이메일: 정규식
        """
        self._extract_name(text, filename)
        self._extract_phone(text)
        self._extract_email(text)
        self.extracted_at = datetime.now()

        logger.info(f"[PIIStore] PII 추출 완료 - name: {bool(self.name)}, phone: {bool(self.phone)}, email: {bool(self.email)}")

    def _extract_name(self, text: str, filename: Optional[str] = None):
        """이름 추출"""
        # 1. 파일명에서 추출
        if filename:
            name_part = re.sub(r'\.(pdf|hwp|hwpx|doc|docx)$', '', filename, flags=re.IGNORECASE)
            name_part = re.sub(r'[_\-\s]*(이력서|경력기술서|resume|cv|자기소개서|지원서).*', '', name_part, flags=re.IGNORECASE)
            name_part = re.sub(r'_\d{6,}.*$', '', name_part)
            name_part = name_part.strip('_- ')

            if self.KOREAN_NAME_PATTERN.match(name_part):
                self.name = name_part
                self.name_confidence = 0.85
                self.name_source = "filename"
                logger.info(f"[PIIStore] 파일명에서 이름 추출: {self.name}")
                return

        # 2. 텍스트 상단에서 추출
        first_part = text[:200]
        korean_names = re.findall(r'[가-힣]{2,4}', first_part)

        exclude_words = ['이력서', '경력서', '자기소', '개서', '성명', '이름',
                        '생년월', '휴대폰', '이메일', '주소', '경력', '학력',
                        '기술', '자격', '프로', '젝트']

        for name in korean_names:
            if name not in exclude_words:
                self.name = name
                self.name_confidence = 0.70
                self.name_source = "text_header"
                logger.info(f"[PIIStore] 텍스트 상단에서 이름 추출: {self.name}")
                return

    def _extract_phone(self, text: str):
        """전화번호 추출"""
        phones = self.PHONE_PATTERN.findall(text)
        if phones:
            self.phone = phones[0]
            self.phone_original_format = phones[0]
            self.phone_confidence = 0.90
            logger.info(f"[PIIStore] 전화번호 추출: {self.phone}")

    def _extract_email(self, text: str):
        """이메일 추출"""
        emails = self.EMAIL_PATTERN.findall(text)
        if emails:
            self.email = emails[0]
            self.email_confidence = 0.95
            logger.info(f"[PIIStore] 이메일 추출: {self.email}")

    def mask_pii_for_llm(self, text: str) -> str:
        """
        LLM 전송 전 PII 마스킹

        PII를 [NAME], [PHONE], [EMAIL] 등의 플레이스홀더로 대체합니다.
        masking_map에 원본 값을 저장하여 나중에 복원할 수 있습니다.
        """
        masked = text
        self.masking_map = {}

        if self.name:
            masked = masked.replace(self.name, "[NAME]")
            self.masking_map["[NAME]"] = self.name

        if self.phone:
            # 다양한 형식의 전화번호 마스킹
            phone_digits = re.sub(r'\D', '', self.phone)
            phone_patterns = [
                self.phone,
                phone_digits,
                f"{phone_digits[:3]}-{phone_digits[3:7]}-{phone_digits[7:]}",
                f"{phone_digits[:3]} {phone_digits[3:7]} {phone_digits[7:]}",
            ]
            for pattern in phone_patterns:
                if pattern in masked:
                    masked = masked.replace(pattern, "[PHONE]")
            self.masking_map["[PHONE]"] = self.phone

        if self.email:
            masked = masked.replace(self.email, "[EMAIL]")
            self.masking_map["[EMAIL]"] = self.email

        self.masked_text = masked
        return masked

    def unmask_text(self, masked_text: str) -> str:
        """마스킹된 텍스트를 원본으로 복원"""
        unmasked = masked_text
        for placeholder, original in self.masking_map.items():
            unmasked = unmasked.replace(placeholder, original)
        return unmasked


@dataclass
class StageResult:
    """단일 스테이지 결과"""
    stage_name: str = ""
    agent_name: str = ""
    status: str = "pending"  # "pending", "running", "completed", "failed", "skipped"

    # 결과 데이터
    output: Dict[str, Any] = field(default_factory=dict)

    # 실행 정보
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: int = 0

    # LLM 사용 정보
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    token_usage: Dict[str, int] = field(default_factory=dict)

    # 에러 정보
    error: Optional[str] = None
    error_code: Optional[str] = None
    retry_count: int = 0

    def start(self):
        """스테이지 시작"""
        self.status = "running"
        self.started_at = datetime.now()

    def complete(self, output: Dict[str, Any] = None, **kwargs):
        """스테이지 완료"""
        self.status = "completed"
        self.completed_at = datetime.now()
        if output:
            self.output = output
        if self.started_at:
            self.duration_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def fail(self, error: str, error_code: str = None):
        """스테이지 실패"""
        self.status = "failed"
        self.completed_at = datetime.now()
        self.error = error
        self.error_code = error_code
        if self.started_at:
            self.duration_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)


@dataclass
class StageResults:
    """모든 스테이지 결과 컬렉션"""
    results: Dict[str, StageResult] = field(default_factory=dict)
    execution_order: List[str] = field(default_factory=list)
    current_stage: Optional[str] = None

    # 스테이지 정의
    STAGES = [
        "parsing",
        "pii_extraction",
        "identity_check",
        "analysis",
        "validation",
        "privacy",
        "embedding",
        "save"
    ]

    def get_or_create(self, stage_name: str, agent_name: str = "") -> StageResult:
        """스테이지 결과 조회 또는 생성"""
        if stage_name not in self.results:
            self.results[stage_name] = StageResult(
                stage_name=stage_name,
                agent_name=agent_name
            )
        return self.results[stage_name]

    def start_stage(self, stage_name: str, agent_name: str = "") -> StageResult:
        """스테이지 시작"""
        result = self.get_or_create(stage_name, agent_name)
        result.start()
        self.current_stage = stage_name
        return result

    def complete_stage(self, stage_name: str, output: Dict[str, Any] = None, **kwargs):
        """스테이지 완료"""
        if stage_name in self.results:
            self.results[stage_name].complete(output, **kwargs)
            if stage_name not in self.execution_order:
                self.execution_order.append(stage_name)

    def fail_stage(self, stage_name: str, error: str, error_code: str = None):
        """스테이지 실패"""
        if stage_name in self.results:
            self.results[stage_name].fail(error, error_code)

    def get_completed_stages(self) -> List[str]:
        """완료된 스테이지 목록"""
        return [
            name for name, result in self.results.items()
            if result.status == "completed"
        ]

    def get_failed_stages(self) -> List[str]:
        """실패한 스테이지 목록"""
        return [
            name for name, result in self.results.items()
            if result.status == "failed"
        ]


@dataclass
class CurrentData:
    """
    현재 확정된 데이터 레이어

    파이프라인이 점진적으로 구축하는 최종 결과입니다.
    """
    # 기본 정보 (PII Store에서 가져옴)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    # LLM 분석 결과
    exp_years: Optional[float] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None

    # 구조화된 데이터
    careers: List[Dict[str, Any]] = field(default_factory=list)
    educations: List[Dict[str, Any]] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)
    certifications: List[Dict[str, Any]] = field(default_factory=list)
    projects: List[Dict[str, Any]] = field(default_factory=list)

    # 요약
    summary: Optional[str] = None
    strengths: List[str] = field(default_factory=list)

    # 신뢰도 점수 (0-100 정수)
    confidence_scores: Dict[str, int] = field(default_factory=dict)

    # 전체 신뢰도
    overall_confidence: int = 0

    # 임베딩
    embedding: Optional[List[float]] = None
    embedding_model: Optional[str] = None

    # 필드별 가중치
    CONFIDENCE_WEIGHTS = {
        "name": 0.15,
        "exp_years": 0.20,
        "careers": 0.25,
        "skills": 0.20,
        "educations": 0.10,
        "summary": 0.10
    }

    def set_confidence(self, field_name: str, confidence: float):
        """필드 신뢰도 설정 (0.0-1.0 → 0-100)"""
        self.confidence_scores[field_name] = int(confidence * 100)

    def calculate_overall_confidence(self) -> int:
        """전체 신뢰도 계산"""
        total = 0
        weight_sum = 0

        for field, weight in self.CONFIDENCE_WEIGHTS.items():
            if field in self.confidence_scores:
                total += self.confidence_scores[field] * weight
                weight_sum += weight

        if weight_sum > 0:
            self.overall_confidence = int(total / weight_sum)

        return self.overall_confidence

    def to_candidate_dict(self) -> Dict[str, Any]:
        """DB 저장용 후보자 딕셔너리 반환"""
        return {
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "exp_years": self.exp_years,
            "current_company": self.current_company,
            "current_position": self.current_position,
            "careers": self.careers,
            "educations": self.educations,
            "skills": self.skills,
            "certifications": self.certifications,
            "projects": self.projects,
            "summary": self.summary,
            "strengths": self.strengths,
            "confidence": self.overall_confidence,
            "confidence_scores": self.confidence_scores,
            "embedding": self.embedding,
        }


@dataclass
class PipelineMetadata:
    """파이프라인 메타데이터"""
    # 식별자
    pipeline_id: str = ""
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None

    # 실행 정보
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str = "pending"  # "pending", "running", "completed", "failed"

    # 소스 정보
    organization_id: Optional[str] = None
    user_id: Optional[str] = None

    # 설정
    config: Dict[str, Any] = field(default_factory=dict)

    # 통계
    total_llm_calls: int = 0
    total_tokens_used: int = 0
    total_cost_usd: float = 0.0

    # 체크포인트 (재시도용)
    checkpoint: Optional[Dict[str, Any]] = None
    checkpoint_created_at: Optional[datetime] = None
    checkpoint_ttl_seconds: int = 120  # 2분

    # 버전
    pipeline_version: str = "1.0.0"

    def start(self):
        """파이프라인 시작"""
        self.pipeline_id = f"pipeline_{datetime.now().timestamp()}"
        self.started_at = datetime.now()
        self.status = "running"

    def complete(self):
        """파이프라인 완료"""
        self.completed_at = datetime.now()
        self.status = "completed"

    def fail(self):
        """파이프라인 실패"""
        self.completed_at = datetime.now()
        self.status = "failed"

    def add_llm_usage(self, tokens: int, cost_usd: float = 0.0):
        """LLM 사용량 추가"""
        self.total_llm_calls += 1
        self.total_tokens_used += tokens
        self.total_cost_usd += cost_usd

    def get_duration_ms(self) -> int:
        """실행 시간 (밀리초)"""
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds() * 1000)
        return 0

    def is_checkpoint_valid(self) -> bool:
        """체크포인트 유효성 확인"""
        if not self.checkpoint or not self.checkpoint_created_at:
            return False

        elapsed = (datetime.now() - self.checkpoint_created_at).total_seconds()
        return elapsed <= self.checkpoint_ttl_seconds
