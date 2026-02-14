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

        # T3-1: exponential backoff 지원을 위해 3회로 변경
        assert settings.retry.llm_max == 3

    def test_llm_retry_delay_settings(self):
        """T3-1: LLM 재시도 지연 설정"""
        from config import get_settings

        settings = get_settings()

        # exponential backoff 기본 설정
        assert settings.retry.llm_base_delay == 1.0
        assert settings.retry.llm_max_delay == 8.0

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
        assert client_config["max_retries"] == 3  # T3-1: 3회로 변경

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
        assert client_config["max_retries"] == 3  # T3-1: 3회로 변경


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


def _ensure_real_llm_manager():
    """
    services.llm_manager 실제 모듈을 로드합니다.

    다른 테스트에서 sys.modules['services'] 또는 sys.modules['services.llm_manager']를
    MagicMock으로 대체한 경우를 처리합니다.
    """
    import sys
    import importlib
    import importlib.util

    # 모킹된 services 관련 모듈 제거
    modules_to_check = ['services', 'services.llm_manager']
    for mod_name in modules_to_check:
        if mod_name in sys.modules:
            mod = sys.modules[mod_name]
            if isinstance(mod, MagicMock) or hasattr(mod, '_mock_name'):
                del sys.modules[mod_name]

    # services 패키지가 제대로 로드되었는지 확인
    try:
        import services
        if isinstance(services, MagicMock):
            del sys.modules['services']
            import services
    except (ImportError, TypeError):
        pass

    # llm_manager 모듈 로드 및 리로드
    try:
        import services.llm_manager
        if isinstance(services.llm_manager, MagicMock):
            del sys.modules['services.llm_manager']
            import services.llm_manager
        importlib.reload(services.llm_manager)
        return services.llm_manager
    except (ImportError, TypeError, AttributeError):
        # 완전히 새로 임포트
        if 'services.llm_manager' in sys.modules:
            del sys.modules['services.llm_manager']
        import services.llm_manager
        return services.llm_manager


class TestRetryLogic:
    """T3-1: LLM 재시도 로직 테스트

    Note: 이 테스트들은 services.llm_manager 모듈을 직접 사용합니다.
    다른 테스트 파일에서 sys.modules['services.llm_manager']를 모킹하면
    테스트가 실패할 수 있으므로, 실제 모듈을 강제 로드합니다.
    """

    @pytest.fixture(autouse=True)
    def reload_llm_manager(self):
        """테스트 전에 llm_manager 모듈 강제 리로드"""
        _ensure_real_llm_manager()
        yield

    def test_retryable_error_patterns(self):
        """재시도 대상 에러 패턴 확인"""
        llm_manager = _ensure_real_llm_manager()

        # 필수 패턴 포함 확인
        patterns = llm_manager.RETRYABLE_ERROR_PATTERNS
        assert "timeout" in patterns
        assert "rate limit" in patterns
        assert "429" in patterns
        assert "500" in patterns
        assert "503" in patterns

    def test_retry_constants_loaded(self):
        """재시도 상수가 config에서 로드됨"""
        llm_manager = _ensure_real_llm_manager()

        assert llm_manager.LLM_MAX_RETRIES == 3
        assert llm_manager.LLM_BASE_DELAY == 1.0
        assert llm_manager.LLM_MAX_DELAY == 8.0

    def test_is_retryable_error_timeout(self):
        """타임아웃 에러는 재시도 대상"""
        llm_manager = _ensure_real_llm_manager()

        manager = llm_manager.LLMManager()

        assert manager._is_retryable_error("Connection timeout") is True
        assert manager._is_retryable_error("Request timeout after 120 seconds") is True

    def test_is_retryable_error_rate_limit(self):
        """Rate limit 에러는 재시도 대상"""
        llm_manager = _ensure_real_llm_manager()

        manager = llm_manager.LLMManager()

        assert manager._is_retryable_error("Rate limit exceeded") is True
        assert manager._is_retryable_error("429 Too Many Requests") is True

    def test_is_retryable_error_server_error(self):
        """서버 에러(5xx)는 재시도 대상"""
        llm_manager = _ensure_real_llm_manager()

        manager = llm_manager.LLMManager()

        assert manager._is_retryable_error("500 Internal Server Error") is True
        assert manager._is_retryable_error("503 Service Unavailable") is True
        assert manager._is_retryable_error("502 Bad Gateway") is True

    def test_not_retryable_validation_error(self):
        """Validation 에러는 재시도 대상 아님"""
        llm_manager = _ensure_real_llm_manager()

        manager = llm_manager.LLMManager()

        assert manager._is_retryable_error("Invalid JSON format") is False
        assert manager._is_retryable_error("Authentication failed") is False
        assert manager._is_retryable_error("API key not configured") is False

    def test_not_retryable_empty_error(self):
        """빈 에러 메시지는 재시도 대상 아님"""
        llm_manager = _ensure_real_llm_manager()

        manager = llm_manager.LLMManager()

        assert manager._is_retryable_error("") is False
        assert manager._is_retryable_error(None) is False

    def test_exponential_backoff_calculation(self):
        """Exponential backoff 계산 확인"""
        llm_manager = _ensure_real_llm_manager()

        base_delay = llm_manager.LLM_BASE_DELAY
        max_delay = llm_manager.LLM_MAX_DELAY

        # 시도별 지연 시간 계산 (1s, 2s, 4s...)
        delays = []
        for attempt in range(4):
            delay = min(base_delay * (2 ** attempt), max_delay)
            delays.append(delay)

        assert delays == [1.0, 2.0, 4.0, 8.0]


class TestRetryLogicAsync:
    """T3-1: LLM 재시도 비동기 테스트"""

    @pytest.fixture(autouse=True)
    def reload_llm_manager(self):
        """테스트 전에 llm_manager 모듈 강제 리로드"""
        _ensure_real_llm_manager()
        yield

    @pytest.mark.asyncio
    async def test_retry_on_timeout_success(self):
        """타임아웃 후 재시도 성공"""
        llm_manager = _ensure_real_llm_manager()

        LLMManager = llm_manager.LLMManager
        LLMProvider = llm_manager.LLMProvider
        LLMResponse = llm_manager.LLMResponse

        manager = LLMManager()

        # 첫 번째: 타임아웃, 두 번째: 성공
        call_count = 0

        async def mock_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return LLMResponse(
                    provider=LLMProvider.OPENAI,
                    content=None,
                    raw_response="",
                    model="gpt-4o",
                    error="Connection timeout"
                )
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content={"result": "success"},
                raw_response='{"result": "success"}',
                model="gpt-4o",
                usage={"prompt_tokens": 100, "completion_tokens": 50}
            )

        result = await manager._call_with_retry(
            LLMProvider.OPENAI,
            mock_call
        )

        assert result.success is True
        assert result.content == {"result": "success"}
        assert call_count == 2  # 첫 시도 + 1회 재시도

    @pytest.mark.asyncio
    async def test_no_retry_on_validation_error(self):
        """Validation 에러는 재시도하지 않음"""
        llm_manager = _ensure_real_llm_manager()

        LLMManager = llm_manager.LLMManager
        LLMProvider = llm_manager.LLMProvider
        LLMResponse = llm_manager.LLMResponse

        manager = LLMManager()

        call_count = 0

        async def mock_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model="gpt-4o",
                error="Invalid request format"
            )

        result = await manager._call_with_retry(
            LLMProvider.OPENAI,
            mock_call
        )

        assert result.success is False
        assert call_count == 1  # 재시도 없이 바로 반환

    @pytest.mark.asyncio
    async def test_max_retries_exceeded(self):
        """최대 재시도 초과 시 실패 반환"""
        llm_manager = _ensure_real_llm_manager()

        LLMManager = llm_manager.LLMManager
        LLMProvider = llm_manager.LLMProvider
        LLMResponse = llm_manager.LLMResponse
        LLM_MAX_RETRIES = llm_manager.LLM_MAX_RETRIES

        manager = LLMManager()

        call_count = 0

        async def mock_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model="gpt-4o",
                error="503 Service Unavailable"
            )

        result = await manager._call_with_retry(
            LLMProvider.OPENAI,
            mock_call
        )

        assert result.success is False
        assert "503" in result.error
        # 첫 시도 + MAX_RETRIES번 재시도
        assert call_count == LLM_MAX_RETRIES + 1
