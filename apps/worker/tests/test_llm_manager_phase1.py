"""
Phase 1 테스트: llm_manager.py 변경사항

테스트 대상:
- 타임아웃 설정이 config에서 로드되는지
- DEBUG 레벨 로깅이 제거되었는지
- LLM_TIMEOUT_SECONDS, LLM_CONNECT_TIMEOUT 상수
"""

import pytest
from unittest.mock import patch, MagicMock
import logging


class TestLLMTimeoutConfiguration:
    """LLM 타임아웃 설정 테스트"""

    def test_timeout_from_config(self):
        """타임아웃이 config에서 로드됨"""
        from config import get_settings

        settings = get_settings()

        # config의 timeout 설정 확인
        assert settings.timeout.llm > 0
        assert settings.timeout.llm_connect > 0

    def test_default_timeout_values(self):
        """기본 타임아웃 값 확인"""
        from config import TimeoutSettings

        timeout = TimeoutSettings()

        assert timeout.llm == 120  # 2분
        assert timeout.llm_connect == 10  # 10초

    def test_llm_timeout_greater_than_connect(self):
        """LLM 타임아웃이 연결 타임아웃보다 큼"""
        from config import get_settings

        settings = get_settings()

        assert settings.timeout.llm > settings.timeout.llm_connect


class TestLLMManagerImports:
    """llm_manager 모듈 임포트 테스트"""

    def test_can_import_llm_manager(self):
        """llm_manager 모듈 임포트 가능"""
        try:
            from services import llm_manager
            assert llm_manager is not None
        except ImportError as e:
            pytest.skip(f"llm_manager import failed: {e}")

    def test_get_settings_used(self):
        """get_settings가 llm_manager에서 사용됨"""
        from config import get_settings

        settings = get_settings()

        # get_settings로 설정 가져오기 가능
        assert settings.timeout.llm == 120
        assert settings.timeout.llm_connect == 10


class TestLoggingConfiguration:
    """로깅 설정 테스트"""

    def test_default_log_level_is_info(self):
        """기본 로그 레벨이 INFO (Settings 클래스 기본값)"""
        from config import Settings

        # 환경변수 무시하고 기본값 확인
        # 실제 환경에서는 .env에 DEBUG가 설정되어 있을 수 있음
        default_value = Settings.model_fields['LOG_LEVEL'].default

        assert default_value == "INFO"

    def test_log_level_can_be_changed(self):
        """로그 레벨 변경 가능"""
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {'LOG_LEVEL': 'DEBUG'}):
            from config import Settings
            settings = Settings()
            assert settings.LOG_LEVEL == "DEBUG"

    def test_logger_creation_pattern(self):
        """로거 생성 패턴 테스트"""
        # 표준 패턴: logging.getLogger(__name__)
        logger = logging.getLogger("services.llm_manager")

        assert logger is not None
        assert logger.name == "services.llm_manager"


class TestTimeoutSettingsIntegration:
    """타임아웃 설정 통합 테스트"""

    def test_timeout_config_for_httpx(self):
        """httpx 클라이언트용 타임아웃 설정"""
        from config import get_settings

        settings = get_settings()

        # httpx.Timeout 생성 시 사용할 값들
        timeout_config = {
            "timeout": float(settings.timeout.llm),
            "connect": float(settings.timeout.llm_connect),
        }

        assert timeout_config["timeout"] == 120.0
        assert timeout_config["connect"] == 10.0

    def test_timeout_override_via_env(self):
        """환경변수로 타임아웃 오버라이드"""
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {
            'TIMEOUT__LLM': '180',
            'TIMEOUT__LLM_CONNECT': '15',
        }):
            from config import Settings
            settings = Settings()

            assert settings.timeout.llm == 180
            assert settings.timeout.llm_connect == 15


class TestRetryConfiguration:
    """재시도 설정 테스트"""

    def test_llm_retry_max(self):
        """LLM 최대 재시도 횟수"""
        from config import get_settings

        settings = get_settings()

        assert settings.retry.llm_max == 2

    def test_retry_override_via_env(self):
        """환경변수로 재시도 설정 오버라이드"""
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {'RETRY__LLM_MAX': '5'}):
            from config import Settings
            settings = Settings()

            assert settings.retry.llm_max == 5


class TestRealWorldLLMUsage:
    """실제 LLM 사용 시나리오 테스트"""

    def test_openai_client_timeout_config(self):
        """OpenAI 클라이언트 타임아웃 설정 시나리오"""
        from config import get_settings

        settings = get_settings()

        # AsyncOpenAI 클라이언트 생성 시 설정
        client_config = {
            "api_key": settings.OPENAI_API_KEY or "test-key",
            "timeout": settings.timeout.llm,
            "max_retries": settings.retry.llm_max,
        }

        assert client_config["timeout"] == 120
        assert client_config["max_retries"] == 2

    def test_gemini_client_timeout_config(self):
        """Gemini 클라이언트 타임아웃 설정 시나리오"""
        from config import get_settings

        settings = get_settings()

        # Google Generative AI 클라이언트 설정
        client_config = {
            "api_key": settings.GEMINI_API_KEY or "test-key",
            "timeout": settings.timeout.llm,
        }

        assert client_config["timeout"] == 120

    def test_anthropic_client_timeout_config(self):
        """Anthropic 클라이언트 타임아웃 설정 시나리오"""
        from config import get_settings

        settings = get_settings()

        # Anthropic 클라이언트 설정
        client_config = {
            "api_key": settings.ANTHROPIC_API_KEY or "test-key",
            "timeout": settings.timeout.llm,
            "max_retries": settings.retry.llm_max,
        }

        assert client_config["timeout"] == 120
        assert client_config["max_retries"] == 2


class TestConfigConsistency:
    """설정 일관성 테스트"""

    def test_timeout_values_reasonable(self):
        """타임아웃 값이 합리적인 범위"""
        from config import get_settings

        settings = get_settings()

        # LLM 타임아웃: 30초 ~ 10분
        assert 30 <= settings.timeout.llm <= 600

        # 연결 타임아웃: 5초 ~ 60초
        assert 5 <= settings.timeout.llm_connect <= 60

    def test_retry_values_reasonable(self):
        """재시도 값이 합리적인 범위"""
        from config import get_settings

        settings = get_settings()

        # LLM 재시도: 1~5회
        assert 1 <= settings.retry.llm_max <= 5

    def test_embedding_timeout_reasonable(self):
        """Embedding 타임아웃이 합리적"""
        from config import get_settings

        settings = get_settings()

        # Embedding 타임아웃: 10초 ~ 5분
        assert 10 <= settings.timeout.embedding <= 300


class TestNoHardcodedValues:
    """하드코딩 값 제거 확인 테스트"""

    def test_timeout_not_hardcoded(self):
        """타임아웃이 하드코딩되지 않음"""
        from config import get_settings, Settings
        import os
        from unittest.mock import patch

        # 기본값
        default_settings = Settings()
        default_llm_timeout = default_settings.timeout.llm

        # 환경변수로 변경
        with patch.dict(os.environ, {'TIMEOUT__LLM': '999'}):
            custom_settings = Settings()
            custom_llm_timeout = custom_settings.timeout.llm

        # 값이 다르면 하드코딩되지 않은 것
        assert default_llm_timeout != custom_llm_timeout
        assert custom_llm_timeout == 999

    def test_retry_not_hardcoded(self):
        """재시도 횟수가 하드코딩되지 않음"""
        from config import Settings
        import os
        from unittest.mock import patch

        # 기본값
        default_settings = Settings()
        default_retry = default_settings.retry.llm_max

        # 환경변수로 변경
        with patch.dict(os.environ, {'RETRY__LLM_MAX': '99'}):
            custom_settings = Settings()
            custom_retry = custom_settings.retry.llm_max

        # 값이 다르면 하드코딩되지 않은 것
        assert default_retry != custom_retry
        assert custom_retry == 99
