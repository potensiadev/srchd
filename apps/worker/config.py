"""
RAI Worker Configuration
"""

from enum import Enum
from typing import Optional
from pydantic_settings import BaseSettings


class AnalysisMode(str, Enum):
    PHASE_1 = "phase_1"  # GPT-4o + Gemini (2-Way)
    PHASE_2 = "phase_2"  # GPT-4o + Gemini + Claude (3-Way)


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

    # Google Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.0-flash-preview"

    # Anthropic Claude (Phase 2)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"

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
