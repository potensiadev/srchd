"""
Phase 0 테스트: exceptions.py

테스트 대상:
- WorkerError, RetryableError, PermanentError 예외 클래스
- ErrorCode Enum
- is_retryable() 함수
- 화이트리스트/블랙리스트 기반 예외 분류
- 헬퍼 함수들
"""

import pytest
import json
from unittest.mock import patch

from exceptions import (
    WorkerError,
    RetryableError,
    PermanentError,
    ErrorCode,
    is_retryable,
    register_retryable,
    register_permanent,
    raise_timeout,
    raise_rate_limit,
    raise_validation,
    raise_invalid_file,
    RETRYABLE_EXCEPTIONS,
    PERMANENT_EXCEPTIONS,
)


class TestErrorCode:
    """ErrorCode Enum 테스트"""

    def test_retryable_codes_exist(self):
        """재시도 가능 에러 코드 존재 확인"""
        retryable_codes = [
            ErrorCode.LLM_TIMEOUT,
            ErrorCode.LLM_RATE_LIMIT,
            ErrorCode.EMBEDDING_TIMEOUT,
            ErrorCode.DB_CONNECTION,
            ErrorCode.STORAGE_ERROR,
            ErrorCode.NETWORK_ERROR,
        ]
        for code in retryable_codes:
            assert code is not None
            assert isinstance(code.value, str)

    def test_permanent_codes_exist(self):
        """재시도 불가 에러 코드 존재 확인"""
        permanent_codes = [
            ErrorCode.INVALID_FILE,
            ErrorCode.MULTI_IDENTITY,
            ErrorCode.ENCRYPTION_ERROR,
            ErrorCode.VALIDATION_ERROR,
            ErrorCode.INSUFFICIENT_CREDITS,
        ]
        for code in permanent_codes:
            assert code is not None
            assert isinstance(code.value, str)

    def test_error_code_string_value(self):
        """에러 코드가 문자열 값을 가짐"""
        assert ErrorCode.LLM_TIMEOUT.value == "LLM_TIMEOUT"
        assert ErrorCode.INVALID_FILE.value == "INVALID_FILE"

    def test_error_code_is_string_enum(self):
        """ErrorCode가 str Enum임"""
        assert isinstance(ErrorCode.LLM_TIMEOUT, str)
        assert ErrorCode.LLM_TIMEOUT == "LLM_TIMEOUT"


class TestWorkerError:
    """WorkerError 기본 예외 테스트"""

    def test_creation_with_all_params(self):
        """모든 파라미터로 생성"""
        error = WorkerError(
            message="Test error",
            code=ErrorCode.INTERNAL_ERROR,
            retryable=True,
            details={"key": "value"}
        )

        assert error.message == "Test error"
        assert error.code == ErrorCode.INTERNAL_ERROR
        assert error.retryable is True
        assert error.details == {"key": "value"}

    def test_creation_with_minimal_params(self):
        """최소 파라미터로 생성"""
        error = WorkerError(
            message="Minimal",
            code=ErrorCode.UNKNOWN,
            retryable=False
        )

        assert error.message == "Minimal"
        assert error.details == {}

    def test_str_representation(self):
        """문자열 표현"""
        error = WorkerError(
            message="Error message",
            code=ErrorCode.LLM_TIMEOUT,
            retryable=True
        )

        assert str(error) == "[LLM_TIMEOUT] Error message"

    def test_repr_representation(self):
        """repr 표현"""
        error = WorkerError(
            message="A very long error message that exceeds fifty characters limit",
            code=ErrorCode.DB_CONNECTION,
            retryable=True
        )

        repr_str = repr(error)
        assert "WorkerError" in repr_str
        assert "DB_CONNECTION" in repr_str
        assert "retryable=True" in repr_str

    def test_to_dict(self):
        """딕셔너리 변환"""
        error = WorkerError(
            message="Dict test",
            code=ErrorCode.NETWORK_ERROR,
            retryable=True,
            details={"timeout": 30}
        )

        result = error.to_dict()

        assert result["error_code"] == "NETWORK_ERROR"
        assert result["error_message"] == "Dict test"
        assert result["retryable"] is True
        assert result["details"] == {"timeout": 30}

    def test_inheritance_from_exception(self):
        """Exception 상속 확인"""
        error = WorkerError("Test", ErrorCode.UNKNOWN, False)
        assert isinstance(error, Exception)

    def test_can_be_raised_and_caught(self):
        """raise/catch 가능 확인"""
        with pytest.raises(WorkerError) as exc_info:
            raise WorkerError("Raised", ErrorCode.INTERNAL_ERROR, False)

        assert exc_info.value.message == "Raised"


class TestRetryableError:
    """RetryableError 테스트"""

    def test_always_retryable(self):
        """항상 retryable=True"""
        error = RetryableError(
            message="Timeout occurred",
            code=ErrorCode.LLM_TIMEOUT
        )

        assert error.retryable is True

    def test_inherits_from_worker_error(self):
        """WorkerError 상속"""
        error = RetryableError("Test", ErrorCode.LLM_TIMEOUT)
        assert isinstance(error, WorkerError)
        assert isinstance(error, Exception)

    def test_with_details(self):
        """details와 함께 생성"""
        error = RetryableError(
            message="Rate limited",
            code=ErrorCode.LLM_RATE_LIMIT,
            details={"retry_after": 60}
        )

        assert error.details["retry_after"] == 60

    def test_can_catch_as_worker_error(self):
        """WorkerError로 catch 가능"""
        with pytest.raises(WorkerError):
            raise RetryableError("Test", ErrorCode.NETWORK_ERROR)


class TestPermanentError:
    """PermanentError 테스트"""

    def test_always_not_retryable(self):
        """항상 retryable=False"""
        error = PermanentError(
            message="Invalid file",
            code=ErrorCode.INVALID_FILE
        )

        assert error.retryable is False

    def test_inherits_from_worker_error(self):
        """WorkerError 상속"""
        error = PermanentError("Test", ErrorCode.INVALID_FILE)
        assert isinstance(error, WorkerError)
        assert isinstance(error, Exception)

    def test_with_details(self):
        """details와 함께 생성"""
        error = PermanentError(
            message="Multi identity detected",
            code=ErrorCode.MULTI_IDENTITY,
            details={"person_count": 3}
        )

        assert error.details["person_count"] == 3


class TestIsRetryable:
    """is_retryable 함수 테스트"""

    def test_retryable_error_returns_true(self):
        """RetryableError는 True 반환"""
        error = RetryableError("Test", ErrorCode.LLM_TIMEOUT)
        assert is_retryable(error) is True

    def test_permanent_error_returns_false(self):
        """PermanentError는 False 반환"""
        error = PermanentError("Test", ErrorCode.INVALID_FILE)
        assert is_retryable(error) is False

    def test_worker_error_respects_flag(self):
        """WorkerError는 retryable 플래그에 따름"""
        retryable = WorkerError("Test", ErrorCode.UNKNOWN, retryable=True)
        permanent = WorkerError("Test", ErrorCode.UNKNOWN, retryable=False)

        assert is_retryable(retryable) is True
        assert is_retryable(permanent) is False

    def test_builtin_timeout_error_is_retryable(self):
        """내장 TimeoutError는 재시도 가능"""
        assert is_retryable(TimeoutError("timeout")) is True

    def test_builtin_connection_error_is_retryable(self):
        """내장 ConnectionError는 재시도 가능"""
        assert is_retryable(ConnectionError("connection failed")) is True

    def test_value_error_is_permanent(self):
        """ValueError는 재시도 불가"""
        assert is_retryable(ValueError("invalid")) is False

    def test_type_error_is_permanent(self):
        """TypeError는 재시도 불가"""
        assert is_retryable(TypeError("wrong type")) is False

    def test_key_error_is_permanent(self):
        """KeyError는 재시도 불가"""
        assert is_retryable(KeyError("missing key")) is False

    def test_unclassified_exception_logs_warning(self):
        """미분류 예외는 경고 로깅 후 False 반환"""
        class UnknownError(Exception):
            pass

        with patch('exceptions.logger') as mock_logger:
            result = is_retryable(UnknownError("unknown"))

            assert result is False
            mock_logger.warning.assert_called_once()
            assert "Unclassified" in str(mock_logger.warning.call_args)


class TestRegisterExceptions:
    """예외 등록 함수 테스트"""

    def test_register_retryable(self):
        """재시도 가능 예외 등록"""
        class CustomRetryable(Exception):
            pass

        # 등록 전
        assert CustomRetryable not in RETRYABLE_EXCEPTIONS

        # 등록
        register_retryable(CustomRetryable)

        # 등록 후
        assert CustomRetryable in RETRYABLE_EXCEPTIONS
        assert is_retryable(CustomRetryable("test")) is True

        # 정리 (다른 테스트에 영향 없도록)
        RETRYABLE_EXCEPTIONS.discard(CustomRetryable)

    def test_register_permanent(self):
        """재시도 불가 예외 등록"""
        class CustomPermanent(Exception):
            pass

        # 등록 전
        assert CustomPermanent not in PERMANENT_EXCEPTIONS

        # 등록
        register_permanent(CustomPermanent)

        # 등록 후
        assert CustomPermanent in PERMANENT_EXCEPTIONS
        assert is_retryable(CustomPermanent("test")) is False

        # 정리
        PERMANENT_EXCEPTIONS.discard(CustomPermanent)


class TestExternalExceptionRegistration:
    """외부 라이브러리 예외 등록 테스트"""

    def test_httpx_exceptions_registered(self):
        """httpx 예외가 등록되어 있음"""
        try:
            import httpx

            # httpx가 설치되어 있으면 예외가 등록되어야 함
            assert is_retryable(httpx.ConnectError("test")) is True
            assert is_retryable(httpx.ReadTimeout("test")) is True
        except ImportError:
            pytest.skip("httpx not installed")

    def test_json_decode_error_is_permanent(self):
        """JSONDecodeError는 재시도 불가"""
        error = json.JSONDecodeError("error", "doc", 0)
        assert is_retryable(error) is False


class TestHelperFunctions:
    """헬퍼 함수 테스트"""

    def test_raise_timeout_llm(self):
        """raise_timeout - LLM"""
        with pytest.raises(RetryableError) as exc_info:
            raise_timeout("llm", 120)

        error = exc_info.value
        assert error.code == ErrorCode.LLM_TIMEOUT
        assert error.retryable is True
        assert "120" in error.message
        assert error.details["timeout_seconds"] == 120

    def test_raise_timeout_embedding(self):
        """raise_timeout - Embedding"""
        with pytest.raises(RetryableError) as exc_info:
            raise_timeout("embedding", 60)

        assert exc_info.value.code == ErrorCode.EMBEDDING_TIMEOUT

    def test_raise_timeout_unknown_service(self):
        """raise_timeout - 알 수 없는 서비스"""
        with pytest.raises(RetryableError) as exc_info:
            raise_timeout("unknown_service", 30)

        assert exc_info.value.code == ErrorCode.NETWORK_ERROR

    def test_raise_rate_limit_llm(self):
        """raise_rate_limit - LLM"""
        with pytest.raises(RetryableError) as exc_info:
            raise_rate_limit("llm", retry_after=60)

        error = exc_info.value
        assert error.code == ErrorCode.LLM_RATE_LIMIT
        assert error.details["retry_after"] == 60

    def test_raise_rate_limit_without_retry_after(self):
        """raise_rate_limit - retry_after 없음"""
        with pytest.raises(RetryableError) as exc_info:
            raise_rate_limit("embedding")

        assert exc_info.value.details["retry_after"] is None

    def test_raise_validation(self):
        """raise_validation"""
        with pytest.raises(PermanentError) as exc_info:
            raise_validation("Email format invalid", field="email")

        error = exc_info.value
        assert error.code == ErrorCode.VALIDATION_ERROR
        assert error.retryable is False
        assert error.details["field"] == "email"

    def test_raise_validation_without_field(self):
        """raise_validation - field 없음"""
        with pytest.raises(PermanentError) as exc_info:
            raise_validation("General validation error")

        assert exc_info.value.details == {}

    def test_raise_invalid_file(self):
        """raise_invalid_file"""
        with pytest.raises(PermanentError) as exc_info:
            raise_invalid_file("Corrupted file", file_type="pdf")

        error = exc_info.value
        assert error.code == ErrorCode.INVALID_FILE
        assert error.details["file_type"] == "pdf"


class TestExceptionHierarchy:
    """예외 계층 구조 테스트"""

    def test_catch_all_with_worker_error(self):
        """WorkerError로 모든 Worker 예외 catch"""
        exceptions = [
            RetryableError("test", ErrorCode.LLM_TIMEOUT),
            PermanentError("test", ErrorCode.INVALID_FILE),
            WorkerError("test", ErrorCode.UNKNOWN, True),
        ]

        for exc in exceptions:
            try:
                raise exc
            except WorkerError as caught:
                assert caught is exc

    def test_catch_with_exception(self):
        """기본 Exception으로도 catch 가능 (호환성)"""
        exceptions = [
            RetryableError("test", ErrorCode.LLM_TIMEOUT),
            PermanentError("test", ErrorCode.INVALID_FILE),
        ]

        for exc in exceptions:
            try:
                raise exc
            except Exception as caught:
                assert caught is exc

    def test_specific_catch_before_general(self):
        """구체적 예외가 먼저 catch됨"""
        def raise_retryable():
            raise RetryableError("test", ErrorCode.LLM_TIMEOUT)

        caught_type = None
        try:
            raise_retryable()
        except RetryableError:
            caught_type = "RetryableError"
        except WorkerError:
            caught_type = "WorkerError"
        except Exception:
            caught_type = "Exception"

        assert caught_type == "RetryableError"


class TestRealWorldScenarios:
    """실제 사용 시나리오 테스트"""

    def test_retry_loop_pattern(self):
        """재시도 루프 패턴"""
        max_retries = 3
        attempts = 0
        last_error = None

        def simulated_call():
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise RetryableError(
                    f"Attempt {attempts} failed",
                    code=ErrorCode.NETWORK_ERROR
                )
            return "success"

        for attempt in range(max_retries):
            try:
                result = simulated_call()
                break
            except RetryableError as e:
                last_error = e
                continue
            except PermanentError as e:
                # 재시도 불가, 즉시 실패
                raise
        else:
            raise last_error

        assert result == "success"
        assert attempts == 3

    def test_error_logging_pattern(self):
        """에러 로깅 패턴"""
        error = RetryableError(
            "LLM API timeout after 120s",
            code=ErrorCode.LLM_TIMEOUT,
            details={"timeout_seconds": 120, "model": "gpt-4o"}
        )

        # 로그 메시지 생성
        log_message = f"[{error.code.value}] {error.message}"
        assert log_message == "[LLM_TIMEOUT] LLM API timeout after 120s"

        # 상세 정보
        error_dict = error.to_dict()
        assert error_dict["error_code"] == "LLM_TIMEOUT"
        assert error_dict["details"]["model"] == "gpt-4o"

    def test_error_response_pattern(self):
        """API 에러 응답 패턴"""
        error = PermanentError(
            "Multiple identities detected",
            code=ErrorCode.MULTI_IDENTITY,
            details={"person_count": 2}
        )

        # API 응답 생성
        response = {
            "success": False,
            **error.to_dict()
        }

        assert response["success"] is False
        assert response["error_code"] == "MULTI_IDENTITY"
        assert response["retryable"] is False
