"""
RAI Worker Configuration
"""

from enum import Enum
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class AnalysisMode(str, Enum):
    PHASE_1 = "phase_1"  # GPT-4o + Gemini (2-Way)
    PHASE_2 = "phase_2"  # GPT-4o + Gemini + Claude (3-Way)


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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# 프로덕션 환경에서 필수 설정 검증
if settings.ENV == "production":
    if not settings.ENCRYPTION_KEY or len(settings.ENCRYPTION_KEY) != 64:
        raise ValueError(
            "ENCRYPTION_KEY must be set in production (64-character hex string). "
            "Generate with: openssl rand -hex 32"
        )
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
