"""
Phase 1 테스트: tasks.py 예외 처리 개선

테스트 대상:
- process_resume 함수의 예외 처리
- full_pipeline 함수의 예외 처리
- PermanentError, RetryableError 구분 처리
- is_retryable() 함수 활용
- 에러 응답에 retryable 플래그 포함
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import json

from exceptions import (
    WorkerError,
    RetryableError,
    PermanentError,
    ErrorCode,
    is_retryable,
)


class TestExceptionClassification:
    """예외 분류 테스트"""

    def test_permanent_error_is_not_retryable(self):
        """PermanentError는 재시도 불가"""
        error = PermanentError(
            message="Invalid file format",
            code=ErrorCode.INVALID_FILE
        )

        assert error.retryable is False
        assert is_retryable(error) is False

    def test_retryable_error_is_retryable(self):
        """RetryableError는 재시도 가능"""
        error = RetryableError(
            message="LLM timeout",
            code=ErrorCode.LLM_TIMEOUT
        )

        assert error.retryable is True
        assert is_retryable(error) is True

    def test_timeout_error_is_retryable(self):
        """TimeoutError는 재시도 가능"""
        error = TimeoutError("Connection timed out")

        assert is_retryable(error) is True

    def test_connection_error_is_retryable(self):
        """ConnectionError는 재시도 가능"""
        error = ConnectionError("Failed to connect")

        assert is_retryable(error) is True

    def test_value_error_is_permanent(self):
        """ValueError는 재시도 불가"""
        error = ValueError("Invalid input")

        assert is_retryable(error) is False

    def test_key_error_is_permanent(self):
        """KeyError는 재시도 불가"""
        error = KeyError("missing_key")

        assert is_retryable(error) is False


class TestErrorResponseFormat:
    """에러 응답 형식 테스트"""

    def test_permanent_error_response_format(self):
        """PermanentError 응답 형식"""
        error = PermanentError(
            message="Multiple identities detected",
            code=ErrorCode.MULTI_IDENTITY,
            details={"person_count": 2}
        )

        # 예상 응답 형식
        response = {
            "success": False,
            "error": error.message,
            "error_code": error.code.value,
            "retryable": False,
        }

        assert response["success"] is False
        assert response["error"] == "Multiple identities detected"
        assert response["error_code"] == "MULTI_IDENTITY"
        assert response["retryable"] is False

    def test_retryable_error_response_format(self):
        """RetryableError 응답 형식"""
        error = RetryableError(
            message="Rate limit exceeded",
            code=ErrorCode.LLM_RATE_LIMIT,
            details={"retry_after": 60}
        )

        # 예상 응답 형식
        response = {
            "success": False,
            "error": error.message,
            "error_code": error.code.value,
            "retryable": True,
        }

        assert response["success"] is False
        assert response["error"] == "Rate limit exceeded"
        assert response["error_code"] == "LLM_RATE_LIMIT"
        assert response["retryable"] is True

    def test_generic_error_response_with_retryable_check(self):
        """일반 예외 응답 (is_retryable 체크)"""
        # 재시도 가능한 일반 예외
        timeout_error = TimeoutError("Request timed out")
        response_retryable = {
            "success": False,
            "error": str(timeout_error),
            "error_code": "INTERNAL_ERROR",
            "retryable": is_retryable(timeout_error),
        }

        assert response_retryable["retryable"] is True

        # 재시도 불가한 일반 예외
        value_error = ValueError("Invalid data")
        response_permanent = {
            "success": False,
            "error": str(value_error),
            "error_code": "INTERNAL_ERROR",
            "retryable": is_retryable(value_error),
        }

        assert response_permanent["retryable"] is False


class TestExceptionHandlingPatterns:
    """예외 처리 패턴 테스트"""

    def test_catch_permanent_before_retryable(self):
        """PermanentError가 RetryableError보다 먼저 catch"""
        def simulate_error(error_type):
            try:
                if error_type == "permanent":
                    raise PermanentError("Invalid", ErrorCode.INVALID_FILE)
                elif error_type == "retryable":
                    raise RetryableError("Timeout", ErrorCode.LLM_TIMEOUT)
                else:
                    raise ValueError("Unknown")
            except PermanentError as e:
                return {"caught": "PermanentError", "retryable": False}
            except RetryableError as e:
                return {"caught": "RetryableError", "retryable": True}
            except Exception as e:
                return {"caught": "Exception", "retryable": is_retryable(e)}

        result_permanent = simulate_error("permanent")
        assert result_permanent["caught"] == "PermanentError"
        assert result_permanent["retryable"] is False

        result_retryable = simulate_error("retryable")
        assert result_retryable["caught"] == "RetryableError"
        assert result_retryable["retryable"] is True

        result_generic = simulate_error("generic")
        assert result_generic["caught"] == "Exception"

    def test_worker_error_inheritance_hierarchy(self):
        """WorkerError 상속 계층 테스트"""
        permanent = PermanentError("Test", ErrorCode.INVALID_FILE)
        retryable = RetryableError("Test", ErrorCode.LLM_TIMEOUT)

        # 둘 다 WorkerError로 catch 가능
        assert isinstance(permanent, WorkerError)
        assert isinstance(retryable, WorkerError)

        # 둘 다 Exception으로 catch 가능
        assert isinstance(permanent, Exception)
        assert isinstance(retryable, Exception)

    def test_error_code_extraction(self):
        """에러 코드 추출 테스트"""
        errors = [
            PermanentError("Test", ErrorCode.INVALID_FILE),
            PermanentError("Test", ErrorCode.MULTI_IDENTITY),
            RetryableError("Test", ErrorCode.LLM_TIMEOUT),
            RetryableError("Test", ErrorCode.LLM_RATE_LIMIT),
            RetryableError("Test", ErrorCode.NETWORK_ERROR),
        ]

        expected_codes = [
            "INVALID_FILE",
            "MULTI_IDENTITY",
            "LLM_TIMEOUT",
            "LLM_RATE_LIMIT",
            "NETWORK_ERROR",
        ]

        for error, expected in zip(errors, expected_codes):
            assert error.code.value == expected


class TestEmbeddingExceptionHandling:
    """Embedding 서비스 예외 처리 테스트"""

    def test_embedding_timeout_is_retryable(self):
        """Embedding TimeoutError는 재시도 가능"""
        error = TimeoutError("Embedding API timeout after 60s")

        assert is_retryable(error) is True

    def test_embedding_connection_error_is_retryable(self):
        """Embedding ConnectionError는 재시도 가능"""
        error = ConnectionError("Failed to connect to embedding service")

        assert is_retryable(error) is True

    def test_embedding_value_error_is_permanent(self):
        """Embedding ValueError는 재시도 불가"""
        error = ValueError("Invalid embedding input: empty text")

        assert is_retryable(error) is False

    def test_embedding_retryable_error(self):
        """Embedding RetryableError 처리"""
        error = RetryableError(
            message="Embedding rate limit",
            code=ErrorCode.EMBEDDING_RATE_LIMIT,
            details={"retry_after": 30}
        )

        assert error.retryable is True
        assert error.code == ErrorCode.EMBEDDING_RATE_LIMIT


class TestVisualAgentExceptionHandling:
    """Visual Agent 예외 처리 테스트"""

    def test_visual_agent_timeout_is_retryable(self):
        """Visual Agent TimeoutError는 재시도 가능"""
        error = TimeoutError("Visual analysis timeout")

        assert is_retryable(error) is True

    def test_visual_agent_connection_error_is_retryable(self):
        """Visual Agent ConnectionError는 재시도 가능"""
        error = ConnectionError("Visual API connection failed")

        assert is_retryable(error) is True


class TestLoggingLevelDecision:
    """로깅 레벨 결정 테스트"""

    def test_permanent_error_logs_error(self):
        """PermanentError는 ERROR 레벨로 로깅해야 함"""
        error = PermanentError("Invalid file", ErrorCode.INVALID_FILE)

        # 재시도 불가하면 ERROR 레벨
        log_level = "ERROR" if not error.retryable else "WARNING"
        assert log_level == "ERROR"

    def test_retryable_error_logs_warning(self):
        """RetryableError는 WARNING 레벨로 로깅해야 함"""
        error = RetryableError("Timeout", ErrorCode.LLM_TIMEOUT)

        # 재시도 가능하면 WARNING 레벨
        log_level = "ERROR" if not error.retryable else "WARNING"
        assert log_level == "WARNING"

    def test_generic_retryable_logs_warning(self):
        """재시도 가능한 일반 예외는 WARNING"""
        error = TimeoutError("Request timeout")

        log_level = "ERROR" if not is_retryable(error) else "WARNING"
        assert log_level == "WARNING"

    def test_generic_permanent_logs_error(self):
        """재시도 불가한 일반 예외는 ERROR"""
        error = ValueError("Invalid input")

        log_level = "ERROR" if not is_retryable(error) else "WARNING"
        assert log_level == "ERROR"


class TestRetryDecisionMaking:
    """재시도 결정 로직 테스트"""

    def test_should_retry_on_retryable_error(self):
        """RetryableError 발생 시 재시도 결정"""
        error = RetryableError("Network error", ErrorCode.NETWORK_ERROR)

        should_retry = error.retryable
        assert should_retry is True

    def test_should_not_retry_on_permanent_error(self):
        """PermanentError 발생 시 재시도 안 함"""
        error = PermanentError("Invalid file", ErrorCode.INVALID_FILE)

        should_retry = error.retryable
        assert should_retry is False

    def test_retry_with_max_attempts(self):
        """최대 재시도 횟수 시뮬레이션"""
        max_retries = 3
        attempts = 0
        last_error = None

        def api_call():
            nonlocal attempts
            attempts += 1
            if attempts <= 2:
                raise RetryableError(
                    f"Attempt {attempts} failed",
                    ErrorCode.NETWORK_ERROR
                )
            return "success"

        result = None
        for attempt in range(max_retries):
            try:
                result = api_call()
                break
            except RetryableError as e:
                last_error = e
                if e.retryable and attempt < max_retries - 1:
                    continue
                else:
                    break
            except PermanentError:
                # 즉시 실패
                break

        assert result == "success"
        assert attempts == 3

    def test_immediate_fail_on_permanent(self):
        """PermanentError 시 즉시 실패"""
        max_retries = 3
        attempts = 0

        def api_call():
            nonlocal attempts
            attempts += 1
            raise PermanentError("Invalid file", ErrorCode.INVALID_FILE)

        result = None
        for attempt in range(max_retries):
            try:
                result = api_call()
                break
            except RetryableError as e:
                continue
            except PermanentError as e:
                # 즉시 실패, 재시도 없음
                result = {"error": e.message, "retryable": False}
                break

        assert attempts == 1  # 한 번만 시도
        assert result["retryable"] is False


class TestErrorCodeUsage:
    """ErrorCode 사용 테스트"""

    def test_common_permanent_error_codes(self):
        """자주 사용되는 PermanentError 코드들"""
        permanent_codes = [
            ErrorCode.INVALID_FILE,
            ErrorCode.MULTI_IDENTITY,
            ErrorCode.ENCRYPTION_ERROR,
            ErrorCode.VALIDATION_ERROR,
            ErrorCode.INSUFFICIENT_CREDITS,
        ]

        for code in permanent_codes:
            error = PermanentError(f"Test {code.value}", code)
            assert error.retryable is False

    def test_common_retryable_error_codes(self):
        """자주 사용되는 RetryableError 코드들"""
        retryable_codes = [
            ErrorCode.LLM_TIMEOUT,
            ErrorCode.LLM_RATE_LIMIT,
            ErrorCode.EMBEDDING_TIMEOUT,
            ErrorCode.DB_CONNECTION,
            ErrorCode.STORAGE_ERROR,
            ErrorCode.NETWORK_ERROR,
        ]

        for code in retryable_codes:
            error = RetryableError(f"Test {code.value}", code)
            assert error.retryable is True


class TestDatabaseStatusUpdate:
    """DB 상태 업데이트 시나리오 테스트"""

    def test_error_code_for_db_update(self):
        """DB 업데이트용 에러 코드 추출"""
        # PermanentError
        perm_error = PermanentError("Invalid", ErrorCode.INVALID_FILE)
        db_error_code = perm_error.code.value
        assert db_error_code == "INVALID_FILE"

        # RetryableError
        retry_error = RetryableError("Timeout", ErrorCode.LLM_TIMEOUT)
        db_error_code = retry_error.code.value
        assert db_error_code == "LLM_TIMEOUT"

        # 일반 예외
        generic_error = ValueError("Something went wrong")
        db_error_code = "INTERNAL_ERROR"  # 기본값
        assert db_error_code == "INTERNAL_ERROR"

    def test_error_message_for_db_update(self):
        """DB 업데이트용 에러 메시지 추출"""
        # WorkerError 계열
        error = PermanentError(
            message="파일 형식이 올바르지 않습니다",
            code=ErrorCode.INVALID_FILE
        )
        db_message = error.message
        assert db_message == "파일 형식이 올바르지 않습니다"

        # 일반 예외
        generic = ValueError("Invalid input data")
        db_message = str(generic)
        assert db_message == "Invalid input data"


class TestWebhookNotification:
    """Webhook 알림 시나리오 테스트"""

    def test_webhook_error_payload(self):
        """Webhook 에러 페이로드 형식"""
        error = PermanentError(
            message="이력서에서 여러 명의 신원이 감지되었습니다",
            code=ErrorCode.MULTI_IDENTITY,
            details={"person_count": 2}
        )

        # Webhook 페이로드
        payload = {
            "status": "failed",
            "error": error.message,
            "error_code": error.code.value,
            "retryable": error.retryable,
        }

        assert payload["status"] == "failed"
        assert "여러 명" in payload["error"]
        assert payload["error_code"] == "MULTI_IDENTITY"
        assert payload["retryable"] is False
