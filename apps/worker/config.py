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
    SUPABASE_SERVICE_KEY: str = ""  # Service Role Key (서버용)

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
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro"

    # Anthropic Claude (Phase 2)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"

    # Embedding
    EMBEDDING_MODEL: str = "text-embedding-3-small"

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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
