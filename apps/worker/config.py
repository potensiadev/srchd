"""
RAI Worker Configuration

Phase 1 리팩토링:
- Nested Settings (RetrySettings, TimeoutSettings) 추가
- 하드코딩된 값들을 중앙 집중 관리
- ChunkingConfig 유지 (하위 호환성)
"""

from enum import Enum
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import BaseModel, Field


class AnalysisMode(str, Enum):
    PHASE_1 = "phase_1"  # GPT-4o + Gemini (2-Way)
    PHASE_2 = "phase_2"  # GPT-4o + Gemini + Claude (3-Way)


# ─────────────────────────────────────────────────
# Phase 1: Nested Settings Models
# ─────────────────────────────────────────────────

class RetrySettings(BaseModel):
    """
    재시도 관련 설정 그룹

    환경변수 오버라이드:
    - RETRY__WEBHOOK_MAX=5
    - RETRY__LLM_MAX=3
    """
    # Webhook
    webhook_max: int = Field(default=3, description="Webhook 최대 재시도 횟수")
    webhook_delay: float = Field(default=1.0, description="Webhook 재시도 기본 대기(초)")

    # Storage
    storage_max: int = Field(default=3, description="Storage 다운로드 최대 재시도")
    storage_delay: float = Field(default=1.0, description="Storage 재시도 기본 대기(초)")

    # LLM
    llm_max: int = Field(default=3, description="LLM API 최대 재시도")
    llm_base_delay: float = Field(default=1.0, description="LLM 재시도 기본 대기(초) - exponential backoff")
    llm_max_delay: float = Field(default=8.0, description="LLM 재시도 최대 대기(초)")

    # Embedding
    embedding_max: int = Field(default=3, description="Embedding API 최대 재시도")
    embedding_base_wait: float = Field(default=1.0, description="Embedding 재시도 기본 대기(초)")
    embedding_max_wait: float = Field(default=10.0, description="Embedding 재시도 최대 대기(초)")


class TimeoutSettings(BaseModel):
    """
    타임아웃 관련 설정 그룹

    환경변수 오버라이드:
    - TIMEOUT__LLM=180
    - TIMEOUT__WEBHOOK=15
    """
    # Webhook
    webhook: int = Field(default=10, description="Webhook 타임아웃(초)")

    # Storage
    storage: int = Field(default=30, description="Storage 다운로드 타임아웃(초)")

    # LLM
    llm: int = Field(default=120, description="LLM API 타임아웃(초)")
    llm_connect: int = Field(default=10, description="LLM 연결 타임아웃(초)")

    # Embedding
    embedding: int = Field(default=60, description="Embedding API 타임아웃(초)")


class ChunkSettings(BaseModel):
    """
    청킹 관련 설정 그룹

    환경변수 오버라이드:
    - CHUNK__MAX_STRUCTURED=3000
    - CHUNK__KOREAN_SIZE=2500
    """
    # 구조화 데이터
    max_structured: int = Field(default=2000, description="구조화 청크 최대 문자수")

    # 원본 텍스트
    max_raw_full: int = Field(default=8000, description="raw_full 최대 문자수")
    section_size: int = Field(default=1500, description="섹션 청크 크기")
    section_overlap: int = Field(default=300, description="섹션 오버랩")
    section_min_length: int = Field(default=100, description="섹션 최소 길이")

    # 한글 최적화
    korean_threshold: float = Field(default=0.5, description="한글 판단 임계값")
    korean_size: int = Field(default=2000, description="한글 문서 청크 크기")
    korean_overlap: int = Field(default=500, description="한글 문서 오버랩")


class ChunkingConfig:
    """
    청킹 설정 (PRD v0.1 이슈 해결)

    구조화 데이터:
    - MAX_STRUCTURED_CHUNK_CHARS: 구조화 청크 최대 길이

    원본 텍스트:
    - MAX_RAW_FULL_CHARS: raw_full 최대 길이
    - RAW_SECTION_CHUNK_SIZE: 슬라이딩 윈도우 크기
    - RAW_SECTION_OVERLAP: 오버랩 크기
    - RAW_SECTION_MIN_LENGTH: 최소 청크 길이
    - RAW_TEXT_MIN_LENGTH: raw 청킹 최소 조건

    한글 최적화:
    - KOREAN_THRESHOLD: 한글 비율 임계값 (50%)
    - KOREAN_CHUNK_SIZE: 한글 문서용 청크 크기
    - KOREAN_OVERLAP: 한글 문서용 오버랩

    재시도:
    - MAX_EMBEDDING_RETRIES: 최대 재시도 횟수
    - RETRY_BASE_WAIT_SECONDS: 기본 대기 시간 (지수 백오프)
    - RETRY_MAX_WAIT_SECONDS: 최대 대기 시간
    """
    # 구조화 데이터
    MAX_STRUCTURED_CHUNK_CHARS: int = 2000

    # 원본 텍스트
    MAX_RAW_FULL_CHARS: int = 8000
    RAW_SECTION_CHUNK_SIZE: int = 1500
    RAW_SECTION_OVERLAP: int = 300
    RAW_SECTION_MIN_LENGTH: int = 100
    RAW_TEXT_MIN_LENGTH: int = 100

    # 한글 최적화 (50% 이상이면 한글로 판단)
    KOREAN_THRESHOLD: float = 0.5
    KOREAN_CHUNK_SIZE: int = 2000
    KOREAN_OVERLAP: int = 500

    # 재시도 설정 (지수 백오프)
    MAX_EMBEDDING_RETRIES: int = 3
    RETRY_BASE_WAIT_SECONDS: float = 1.0
    RETRY_MAX_WAIT_SECONDS: float = 10.0


# 청킹 설정 싱글톤
chunking_config = ChunkingConfig()


class Settings(BaseSettings):
    """Worker 설정"""

    # ─────────────────────────────────────────────────
    # 기본 설정
    # ─────────────────────────────────────────────────
    ENV: str = "development"
    DEBUG: bool = True

    # ─────────────────────────────────────────────────
    # Supabase
    # ─────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""  # Service Role Key (서버용)

    # ─────────────────────────────────────────────────
    # Redis (Job Queue)
    # ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ─────────────────────────────────────────────────
    # AI 모델 설정
    # ─────────────────────────────────────────────────
    ANALYSIS_MODE: AnalysisMode = AnalysisMode.PHASE_1

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_MINI_MODEL: str = "gpt-4o-mini"

    # Google Gemini (2026년 1월 업데이트)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3-pro-preview"

    # Anthropic Claude (Phase 2) (2026년 1월 업데이트)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    # Embedding
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ─────────────────────────────────────────────────
    # 보안 (암호화)
    # ─────────────────────────────────────────────────
    # ENCRYPTION_KEY는 반드시 환경변수로 설정해야 함 (AES-256: 64자 hex string)
    # 예: openssl rand -hex 32
    ENCRYPTION_KEY: str = ""  # 환경변수 ENCRYPTION_KEY 필수

    # ─────────────────────────────────────────────────
    # 한컴 API (HWP 파싱 백업용, 선택)
    # ─────────────────────────────────────────────────
    HANCOM_API_KEY: str = ""

    # ─────────────────────────────────────────────────
    # 파일 처리 제한
    # ─────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 50
    MAX_PAGE_COUNT: int = 50
    MIN_TEXT_LENGTH: int = 100  # 최소 유효 텍스트 길이

    # ─────────────────────────────────────────────────
    # Webhook
    # ─────────────────────────────────────────────────
    WEBHOOK_URL: str = ""  # Next.js API endpoint
    WEBHOOK_SECRET: str = ""

    # ─────────────────────────────────────────────────
    # CORS 설정
    # ─────────────────────────────────────────────────
    # 허용할 도메인 목록 (쉼표 구분)
    # 예: "https://rai.vercel.app,https://rai-staging.vercel.app"
    ALLOWED_ORIGINS: str = ""

    # ─────────────────────────────────────────────────
    # P0 최적화 Feature Flags
    # ─────────────────────────────────────────────────
    # HWP 전담 Queue 분리 (fast/slow queue)
    USE_SPLIT_QUEUES: bool = Field(
        default=True,
        description="HWP를 slow_queue로 분리 처리"
    )

    # LLM 조건부 호출 (Confidence 기반)
    USE_CONDITIONAL_LLM: bool = Field(
        default=True,
        description="고신뢰도 결과 시 추가 LLM 호출 스킵"
    )

    # LLM 병렬 호출 모드 (대량 업로드 시 속도 최적화)
    # True: GPT-4o + Gemini 동시 호출 (빠름, 비용 ↑)
    # False: 순차 호출 (느림, 비용 최적화)
    USE_PARALLEL_LLM: bool = Field(
        default=True,
        description="GPT-4o + Gemini 병렬 호출로 분석 속도 향상"
    )

    # ─────────────────────────────────────────────────
    # 로깅 설정
    # ─────────────────────────────────────────────────
    LOG_LEVEL: str = Field(
        default="INFO",
        description="로그 레벨 (DEBUG, INFO, WARNING, ERROR)"
    )

    # LLM 신뢰도 임계값
    LLM_CONFIDENCE_THRESHOLD: float = Field(
        default=0.85,
        description="단일 모델 결과 채택 임계값"
    )

    # ─────────────────────────────────────────────────
    # Phase 0 리팩토링 Feature Flags
    # ─────────────────────────────────────────────────
    # 새 async 헬퍼 사용 (Context Manager 패턴)
    USE_NEW_ASYNC_HELPER: bool = Field(
        default=True,
        description="새 async 헬퍼 사용 (False=기존 asyncio.run)"
    )

    # Shadow Mode: 기존/신규 동시 실행 후 결과 비교
    ASYNC_SHADOW_MODE: bool = Field(
        default=False,
        description="Shadow Mode: 기존/신규 방식 모두 실행하고 결과 비교 (검증용)"
    )

    # ─────────────────────────────────────────────────
    # Phase 1: Nested Settings (중앙 집중 설정 관리)
    # ─────────────────────────────────────────────────
    retry: RetrySettings = Field(default_factory=RetrySettings)
    timeout: TimeoutSettings = Field(default_factory=TimeoutSettings)
    chunk: ChunkSettings = Field(default_factory=ChunkSettings)

    class Config:
        env_file = ".env"
        extra = "ignore"
        env_nested_delimiter = "__"  # RETRY__WEBHOOK_MAX=5 형식 지원


settings = Settings()


def validate_encryption_key(key: str, env: str) -> None:
    """
    암호화 키 유효성 검증

    Args:
        key: ENCRYPTION_KEY 값
        env: 현재 환경 (production, staging, development)

    Raises:
        ValueError: 키가 유효하지 않은 경우 (production/staging)
    """
    import re
    import warnings

    # 프로덕션/스테이징: 필수
    if env in ("production", "staging"):
        if not key:
            raise ValueError(
                f"ENCRYPTION_KEY is required in {env} environment. "
                "Generate with: openssl rand -hex 32"
            )
        if len(key) != 64:
            raise ValueError(
                f"ENCRYPTION_KEY must be 64 hex characters (got {len(key)}). "
                "Generate with: openssl rand -hex 32"
            )
        if not re.match(r'^[0-9a-fA-F]{64}$', key):
            raise ValueError(
                "ENCRYPTION_KEY must contain only hexadecimal characters [0-9a-fA-F]"
            )

    # development: 경고만 출력
    elif env == "development":
        if not key or len(key) != 64:
            warnings.warn(
                "ENCRYPTION_KEY is not set or invalid in development. "
                "PII encryption will fail. Set for full testing.",
                RuntimeWarning
            )


# 환경별 필수 설정 검증
validate_encryption_key(settings.ENCRYPTION_KEY, settings.ENV)

if settings.ENV == "production":
    if not settings.WEBHOOK_SECRET:
        raise ValueError("WEBHOOK_SECRET must be set in production")

# 싱글톤 인스턴스
_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """Settings 싱글톤 인스턴스 반환"""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance
