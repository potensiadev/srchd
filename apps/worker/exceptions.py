"""
Worker Exception Hierarchy - Minimal & Practical

3개 클래스 + ErrorCode Enum으로 모든 케이스 커버.

계층:
    WorkerError (base)
    ├── RetryableError (재시도 가능 - 일시적 오류)
    │   └── 상세 원인은 ErrorCode로 구분
    └── PermanentError (재시도 불가 - 영구 오류)
        └── 상세 원인은 ErrorCode로 구분

사용 예시:
    # 재시도 가능 오류
    raise RetryableError(
        "LLM API timeout",
        code=ErrorCode.LLM_TIMEOUT,
        details={"timeout_seconds": 120}
    )

    # 재시도 불가 오류
    raise PermanentError(
        "Invalid file format",
        code=ErrorCode.INVALID_FILE,
        details={"file_type": "unknown"}
    )

    # 예외 처리
    try:
        result = run_async(analyst.analyze(text))
    except RetryableError as e:
        logger.warning(f"Retryable error [{e.code}]: {e.message}")
        # 재시도 로직
    except PermanentError as e:
        logger.error(f"Permanent error [{e.code}]: {e.message}")
        # 실패 처리
"""

from typing import Optional, Dict, Any, Set, Type
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    """
    에러 코드 (예외 클래스 대신 사용)

    재시도 가능/불가 여부는 예외 클래스로 구분,
    상세 원인은 ErrorCode로 구분.
    """
    # ─────────────────────────────────────────────────
    # 재시도 가능 (Retryable)
    # ─────────────────────────────────────────────────
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    EMBEDDING_TIMEOUT = "EMBEDDING_TIMEOUT"
    EMBEDDING_RATE_LIMIT = "EMBEDDING_RATE_LIMIT"
    DB_CONNECTION = "DB_CONNECTION"
    DB_TIMEOUT = "DB_TIMEOUT"
    STORAGE_ERROR = "STORAGE_ERROR"
    STORAGE_TIMEOUT = "STORAGE_TIMEOUT"
    NETWORK_ERROR = "NETWORK_ERROR"
    WEBHOOK_ERROR = "WEBHOOK_ERROR"

    # ─────────────────────────────────────────────────
    # 재시도 불가 (Permanent)
    # ─────────────────────────────────────────────────
    INVALID_FILE = "INVALID_FILE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    MULTI_IDENTITY = "MULTI_IDENTITY"
    ENCRYPTION_ERROR = "ENCRYPTION_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    PARSE_ERROR = "PARSE_ERROR"
    TEXT_TOO_SHORT = "TEXT_TOO_SHORT"
    ANALYSIS_FAILED = "ANALYSIS_FAILED"
    DB_SAVE_FAILED = "DB_SAVE_FAILED"

    # ─────────────────────────────────────────────────
    # 부분 실패 (계속 진행 가능)
    # ─────────────────────────────────────────────────
    EMBEDDING_PARTIAL = "EMBEDDING_PARTIAL"
    VISUAL_PARTIAL = "VISUAL_PARTIAL"
    THUMBNAIL_FAILED = "THUMBNAIL_FAILED"

    # ─────────────────────────────────────────────────
    # 기타
    # ─────────────────────────────────────────────────
    INTERNAL_ERROR = "INTERNAL_ERROR"
    UNKNOWN = "UNKNOWN"


class WorkerError(Exception):
    """
    Worker 기본 예외

    모든 Worker 예외의 기본 클래스.
    retryable 속성으로 재시도 가능 여부 판단.
    """

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        retryable: bool,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"code={self.code.value}, "
            f"retryable={self.retryable}, "
            f"message='{self.message[:50]}...')"
        )

    def __str__(self) -> str:
        return f"[{self.code.value}] {self.message}"

    def to_dict(self) -> Dict[str, Any]:
        """예외 정보를 딕셔너리로 변환"""
        return {
            "error_code": self.code.value,
            "error_message": self.message,
            "retryable": self.retryable,
            "details": self.details,
        }


class RetryableError(WorkerError):
    """
    재시도 가능한 예외 (일시적 오류)

    네트워크 타임아웃, API Rate Limit 등
    일시적인 문제로 인해 발생하며, 재시도하면 성공할 수 있음.
    """

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, retryable=True, details=details)


class PermanentError(WorkerError):
    """
    재시도 불가능한 예외 (영구 오류)

    유효하지 않은 파일, 다중 신원 감지 등
    재시도해도 결과가 동일한 오류.
    """

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, retryable=False, details=details)


# ─────────────────────────────────────────────────
# 화이트리스트 기반 재시도 판단
# ─────────────────────────────────────────────────

# 재시도 가능 예외 화이트리스트 (명시적 정의)
RETRYABLE_EXCEPTIONS: Set[Type[Exception]] = {
    ConnectionError,
    TimeoutError,
}

# 재시도 불가 예외 (명시적)
PERMANENT_EXCEPTIONS: Set[Type[Exception]] = {
    ValueError,
    TypeError,
    KeyError,
    AttributeError,
}


def register_retryable(exc_type: Type[Exception]) -> None:
    """런타임에 재시도 가능 예외 추가"""
    RETRYABLE_EXCEPTIONS.add(exc_type)
    logger.debug(f"[Exception] Registered retryable exception: {exc_type.__name__}")


def register_permanent(exc_type: Type[Exception]) -> None:
    """런타임에 재시도 불가 예외 추가"""
    PERMANENT_EXCEPTIONS.add(exc_type)
    logger.debug(f"[Exception] Registered permanent exception: {exc_type.__name__}")


def _register_external_exceptions() -> None:
    """외부 라이브러리 예외 등록 (import 시점에 실행)"""
    # httpx
    try:
        import httpx
        register_retryable(httpx.ConnectError)
        register_retryable(httpx.ReadTimeout)
        register_retryable(httpx.ConnectTimeout)
        register_retryable(httpx.WriteTimeout)
    except ImportError:
        pass

    # OpenAI
    try:
        from openai import APITimeoutError, RateLimitError, APIConnectionError
        register_retryable(APITimeoutError)
        register_retryable(RateLimitError)
        register_retryable(APIConnectionError)
    except ImportError:
        pass

    # JSON
    try:
        import json
        register_permanent(json.JSONDecodeError)
    except ImportError:
        pass


# 모듈 로드 시 외부 예외 등록
_register_external_exceptions()


def is_retryable(exc: Exception) -> bool:
    """
    예외가 재시도 가능한지 판단

    전략: 화이트리스트 기반
    - 명시적으로 등록된 예외만 재시도
    - 미등록 예외는 기본적으로 재시도 불가 (안전한 기본값)
    - 미분류 예외는 로깅하여 추후 검토

    Args:
        exc: 판단할 예외

    Returns:
        True면 재시도 가능, False면 재시도 불가
    """
    # 1. WorkerError 계열 직접 판단
    if isinstance(exc, WorkerError):
        return exc.retryable

    exc_type = type(exc)

    # 2. 화이트리스트 확인
    if exc_type in RETRYABLE_EXCEPTIONS:
        return True

    # 3. 상속 관계 확인 (부모 클래스가 화이트리스트에 있는지)
    for retryable_type in RETRYABLE_EXCEPTIONS:
        if isinstance(exc, retryable_type):
            return True

    # 4. 블랙리스트 확인
    if exc_type in PERMANENT_EXCEPTIONS:
        return False

    for permanent_type in PERMANENT_EXCEPTIONS:
        if isinstance(exc, permanent_type):
            return False

    # 5. 미분류 예외: 로깅 후 재시도 불가로 처리 (안전한 기본값)
    logger.warning(
        f"[Exception] Unclassified exception type: {exc_type.__name__}. "
        f"Treating as non-retryable. Consider adding to whitelist/blacklist. "
        f"Details: {str(exc)[:200]}"
    )
    return False


# ─────────────────────────────────────────────────
# 편의 함수
# ─────────────────────────────────────────────────

def raise_timeout(service: str, timeout: int) -> None:
    """타임아웃 에러 발생 헬퍼"""
    code_map = {
        'llm': ErrorCode.LLM_TIMEOUT,
        'embedding': ErrorCode.EMBEDDING_TIMEOUT,
        'storage': ErrorCode.STORAGE_TIMEOUT,
        'db': ErrorCode.DB_TIMEOUT,
        'webhook': ErrorCode.WEBHOOK_ERROR,
    }
    raise RetryableError(
        f"{service} timeout after {timeout}s",
        code=code_map.get(service, ErrorCode.NETWORK_ERROR),
        details={'timeout_seconds': timeout, 'service': service}
    )


def raise_rate_limit(service: str, retry_after: Optional[int] = None) -> None:
    """Rate Limit 에러 발생 헬퍼"""
    code_map = {
        'llm': ErrorCode.LLM_RATE_LIMIT,
        'embedding': ErrorCode.EMBEDDING_RATE_LIMIT,
    }
    raise RetryableError(
        f"{service} rate limit exceeded",
        code=code_map.get(service, ErrorCode.NETWORK_ERROR),
        details={'retry_after': retry_after, 'service': service}
    )


def raise_validation(message: str, field: Optional[str] = None) -> None:
    """검증 에러 발생 헬퍼"""
    raise PermanentError(
        message,
        code=ErrorCode.VALIDATION_ERROR,
        details={'field': field} if field else {}
    )


def raise_invalid_file(message: str, file_type: Optional[str] = None) -> None:
    """유효하지 않은 파일 에러 발생 헬퍼"""
    raise PermanentError(
        message,
        code=ErrorCode.INVALID_FILE,
        details={'file_type': file_type} if file_type else {}
    )


# Export public API
__all__ = [
    # 예외 클래스
    'WorkerError',
    'RetryableError',
    'PermanentError',
    # 에러 코드
    'ErrorCode',
    # 유틸리티
    'is_retryable',
    'register_retryable',
    'register_permanent',
    # 헬퍼
    'raise_timeout',
    'raise_rate_limit',
    'raise_validation',
    'raise_invalid_file',
]
