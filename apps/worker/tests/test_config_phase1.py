"""
Phase 1 테스트: config.py Nested Settings 변경사항

테스트 대상:
- RetrySettings 모델
- TimeoutSettings 모델
- ChunkSettings 모델
- 환경변수 오버라이드 (env_nested_delimiter)
- Settings에서 Nested Settings 접근
"""

import pytest
import os
from unittest.mock import patch


class TestRetrySettings:
    """RetrySettings 모델 테스트"""

    def test_default_values(self):
        """기본값 확인"""
        from config import RetrySettings

        retry = RetrySettings()

        # Webhook
        assert retry.webhook_max == 3
        assert retry.webhook_delay == 1.0

        # Storage
        assert retry.storage_max == 3
        assert retry.storage_delay == 1.0

        # LLM (T3-1: exponential backoff 지원을 위해 3으로 변경)
        assert retry.llm_max == 3
        assert retry.llm_base_delay == 1.0
        assert retry.llm_max_delay == 8.0

        # Embedding
        assert retry.embedding_max == 3
        assert retry.embedding_base_wait == 1.0
        assert retry.embedding_max_wait == 10.0

    def test_custom_values(self):
        """커스텀 값으로 생성"""
        from config import RetrySettings

        retry = RetrySettings(
            webhook_max=5,
            webhook_delay=2.0,
            storage_max=4,
            llm_max=3,
            embedding_max=5,
        )

        assert retry.webhook_max == 5
        assert retry.webhook_delay == 2.0
        assert retry.storage_max == 4
        assert retry.llm_max == 3
        assert retry.embedding_max == 5

    def test_partial_override(self):
        """일부 값만 오버라이드"""
        from config import RetrySettings

        retry = RetrySettings(webhook_max=10)

        assert retry.webhook_max == 10
        assert retry.webhook_delay == 1.0  # 기본값 유지
        assert retry.llm_max == 3  # 기본값 유지 (T3-1: 3으로 변경됨)


class TestTimeoutSettings:
    """TimeoutSettings 모델 테스트"""

    def test_default_values(self):
        """기본값 확인"""
        from config import TimeoutSettings

        timeout = TimeoutSettings()

        assert timeout.webhook == 10
        assert timeout.storage == 30
        assert timeout.llm == 120
        assert timeout.llm_connect == 10
        assert timeout.embedding == 60

    def test_custom_values(self):
        """커스텀 값으로 생성"""
        from config import TimeoutSettings

        timeout = TimeoutSettings(
            webhook=15,
            storage=60,
            llm=180,
            llm_connect=20,
            embedding=90,
        )

        assert timeout.webhook == 15
        assert timeout.storage == 60
        assert timeout.llm == 180
        assert timeout.llm_connect == 20
        assert timeout.embedding == 90

    def test_llm_timeout_reasonable_range(self):
        """LLM 타임아웃이 합리적인 범위인지"""
        from config import TimeoutSettings

        timeout = TimeoutSettings()

        # LLM 타임아웃은 연결 타임아웃보다 커야 함
        assert timeout.llm > timeout.llm_connect
        # 너무 짧으면 안 됨 (최소 30초)
        assert timeout.llm >= 30
        # 너무 길면 안 됨 (최대 10분)
        assert timeout.llm <= 600


class TestChunkSettings:
    """ChunkSettings 모델 테스트"""

    def test_default_values(self):
        """기본값 확인"""
        from config import ChunkSettings

        chunk = ChunkSettings()

        # 구조화 데이터
        assert chunk.max_structured == 2000

        # 원본 텍스트
        assert chunk.max_raw_full == 8000
        assert chunk.section_size == 1500
        assert chunk.section_overlap == 300
        assert chunk.section_min_length == 100

        # 한글 최적화
        assert chunk.korean_threshold == 0.5
        assert chunk.korean_size == 2000
        assert chunk.korean_overlap == 500

    def test_overlap_less_than_size(self):
        """오버랩이 청크 크기보다 작아야 함"""
        from config import ChunkSettings

        chunk = ChunkSettings()

        assert chunk.section_overlap < chunk.section_size
        assert chunk.korean_overlap < chunk.korean_size

    def test_korean_threshold_valid_range(self):
        """한글 임계값이 0~1 사이"""
        from config import ChunkSettings

        chunk = ChunkSettings()

        assert 0.0 <= chunk.korean_threshold <= 1.0


class TestSettingsNestedAccess:
    """Settings에서 Nested Settings 접근 테스트"""

    def test_retry_settings_accessible(self):
        """Settings.retry 접근 가능"""
        from config import Settings

        settings = Settings()

        assert hasattr(settings, 'retry')
        assert settings.retry.webhook_max == 3
        assert settings.retry.llm_max == 3  # T3-1: 3으로 변경

    def test_timeout_settings_accessible(self):
        """Settings.timeout 접근 가능"""
        from config import Settings

        settings = Settings()

        assert hasattr(settings, 'timeout')
        assert settings.timeout.llm == 120
        assert settings.timeout.embedding == 60

    def test_chunk_settings_accessible(self):
        """Settings.chunk 접근 가능"""
        from config import Settings

        settings = Settings()

        assert hasattr(settings, 'chunk')
        assert settings.chunk.max_structured == 2000
        assert settings.chunk.korean_threshold == 0.5

    def test_nested_settings_are_models(self):
        """Nested Settings가 Pydantic 모델인지"""
        from config import Settings, RetrySettings, TimeoutSettings, ChunkSettings

        settings = Settings()

        assert isinstance(settings.retry, RetrySettings)
        assert isinstance(settings.timeout, TimeoutSettings)
        assert isinstance(settings.chunk, ChunkSettings)


class TestEnvironmentVariableOverride:
    """환경변수 오버라이드 테스트 (env_nested_delimiter)"""

    def test_retry_override_via_env(self):
        """RETRY__WEBHOOK_MAX 형식으로 오버라이드"""
        with patch.dict(os.environ, {
            'RETRY__WEBHOOK_MAX': '10',
            'RETRY__LLM_MAX': '5',
        }):
            from config import Settings

            settings = Settings()

            assert settings.retry.webhook_max == 10
            assert settings.retry.llm_max == 5

    def test_timeout_override_via_env(self):
        """TIMEOUT__LLM 형식으로 오버라이드"""
        with patch.dict(os.environ, {
            'TIMEOUT__LLM': '180',
            'TIMEOUT__WEBHOOK': '15',
        }):
            from config import Settings

            settings = Settings()

            assert settings.timeout.llm == 180
            assert settings.timeout.webhook == 15

    def test_chunk_override_via_env(self):
        """CHUNK__MAX_STRUCTURED 형식으로 오버라이드"""
        with patch.dict(os.environ, {
            'CHUNK__MAX_STRUCTURED': '3000',
            'CHUNK__KOREAN_SIZE': '2500',
        }):
            from config import Settings

            settings = Settings()

            assert settings.chunk.max_structured == 3000
            assert settings.chunk.korean_size == 2500

    def test_mixed_override(self):
        """여러 Nested Settings 동시 오버라이드"""
        with patch.dict(os.environ, {
            'RETRY__WEBHOOK_MAX': '7',
            'TIMEOUT__LLM': '200',
            'CHUNK__SECTION_SIZE': '2000',
        }):
            from config import Settings

            settings = Settings()

            assert settings.retry.webhook_max == 7
            assert settings.timeout.llm == 200
            assert settings.chunk.section_size == 2000


class TestBackwardCompatibility:
    """하위 호환성 테스트"""

    def test_chunking_config_still_exists(self):
        """ChunkingConfig 클래스가 여전히 존재"""
        from config import ChunkingConfig, chunking_config

        assert ChunkingConfig is not None
        assert chunking_config is not None

    def test_chunking_config_values_match(self):
        """ChunkingConfig와 ChunkSettings 값이 일치"""
        from config import ChunkingConfig, ChunkSettings

        legacy = ChunkingConfig()
        new = ChunkSettings()

        assert legacy.MAX_STRUCTURED_CHUNK_CHARS == new.max_structured
        assert legacy.MAX_RAW_FULL_CHARS == new.max_raw_full
        assert legacy.RAW_SECTION_CHUNK_SIZE == new.section_size
        assert legacy.RAW_SECTION_OVERLAP == new.section_overlap
        assert legacy.KOREAN_THRESHOLD == new.korean_threshold
        assert legacy.KOREAN_CHUNK_SIZE == new.korean_size
        assert legacy.KOREAN_OVERLAP == new.korean_overlap

    def test_existing_settings_unchanged(self):
        """기존 Settings 필드들이 유지됨"""
        from config import Settings

        settings = Settings()

        # 기존 필드들
        assert hasattr(settings, 'ENV')
        assert hasattr(settings, 'DEBUG')
        assert hasattr(settings, 'OPENAI_API_KEY')
        assert hasattr(settings, 'GEMINI_API_KEY')
        assert hasattr(settings, 'USE_PARALLEL_LLM')
        assert hasattr(settings, 'USE_CONDITIONAL_LLM')
        assert hasattr(settings, 'LLM_CONFIDENCE_THRESHOLD')


class TestSettingsIntegrationPhase1:
    """Phase 1 통합 테스트"""

    def test_get_settings_returns_nested(self):
        """get_settings()로 Nested Settings 접근"""
        from config import get_settings

        settings = get_settings()

        assert settings.retry.webhook_max > 0
        assert settings.timeout.llm > 0
        assert settings.chunk.max_structured > 0

    def test_settings_singleton_has_nested(self):
        """싱글톤 인스턴스에 Nested Settings 포함"""
        from config import settings

        assert settings.retry is not None
        assert settings.timeout is not None
        assert settings.chunk is not None

    def test_all_nested_settings_have_descriptions(self):
        """모든 Nested Settings 필드에 description 있음"""
        from config import RetrySettings, TimeoutSettings, ChunkSettings

        # RetrySettings 필드 검증
        for field_name, field_info in RetrySettings.model_fields.items():
            assert field_info.description is not None, f"RetrySettings.{field_name} has no description"

        # TimeoutSettings 필드 검증
        for field_name, field_info in TimeoutSettings.model_fields.items():
            assert field_info.description is not None, f"TimeoutSettings.{field_name} has no description"

        # ChunkSettings 필드 검증
        for field_name, field_info in ChunkSettings.model_fields.items():
            assert field_info.description is not None, f"ChunkSettings.{field_name} has no description"


class TestRealWorldUsagePhase1:
    """실제 사용 시나리오 테스트"""

    def test_llm_timeout_usage(self):
        """LLM 타임아웃 설정 사용 시나리오"""
        from config import get_settings

        settings = get_settings()

        # httpx 클라이언트 설정 예시
        timeout_config = {
            "timeout": settings.timeout.llm,
            "connect": settings.timeout.llm_connect,
        }

        assert timeout_config["timeout"] == 120
        assert timeout_config["connect"] == 10

    def test_retry_config_usage(self):
        """재시도 설정 사용 시나리오"""
        from config import get_settings

        settings = get_settings()

        # tenacity 설정 예시
        retry_config = {
            "max_attempts": settings.retry.llm_max,
            "wait_min": settings.retry.embedding_base_wait,
            "wait_max": settings.retry.embedding_max_wait,
        }

        assert retry_config["max_attempts"] == 3  # T3-1: 3으로 변경
        assert retry_config["wait_min"] == 1.0
        assert retry_config["wait_max"] == 10.0

    def test_chunking_usage(self):
        """청킹 설정 사용 시나리오"""
        from config import get_settings

        settings = get_settings()

        # 텍스트 청킹 예시
        text = "가나다라마바사" * 1000  # 한글 텍스트

        # 한글 비율 체크
        korean_ratio = len([c for c in text if '가' <= c <= '힣']) / len(text)
        is_korean = korean_ratio >= settings.chunk.korean_threshold

        assert is_korean is True

        # 청크 크기 선택
        chunk_size = settings.chunk.korean_size if is_korean else settings.chunk.section_size
        assert chunk_size == 2000


class TestConfigDocumentation:
    """설정 문서화 테스트"""

    def test_retry_settings_has_docstring(self):
        """RetrySettings에 docstring 존재"""
        from config import RetrySettings

        assert RetrySettings.__doc__ is not None
        assert "재시도" in RetrySettings.__doc__

    def test_timeout_settings_has_docstring(self):
        """TimeoutSettings에 docstring 존재"""
        from config import TimeoutSettings

        assert TimeoutSettings.__doc__ is not None
        assert "타임아웃" in TimeoutSettings.__doc__

    def test_chunk_settings_has_docstring(self):
        """ChunkSettings에 docstring 존재"""
        from config import ChunkSettings

        assert ChunkSettings.__doc__ is not None
        assert "청킹" in ChunkSettings.__doc__

    def test_env_override_documented_in_docstring(self):
        """환경변수 오버라이드 방법이 docstring에 문서화"""
        from config import RetrySettings, TimeoutSettings

        assert "RETRY__" in RetrySettings.__doc__
        assert "TIMEOUT__" in TimeoutSettings.__doc__
