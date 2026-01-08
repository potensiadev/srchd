"""
Structured Logger for RAI Worker

일관된 로그 포맷과 메타데이터 지원:
- JSON 구조화 로깅 (프로덕션)
- 컬러 콘솔 로깅 (개발)
- 요청 컨텍스트 추적
- Sentry 통합
"""

import logging
import json
import time
import sys
from datetime import datetime
from typing import Optional, Dict, Any, Callable
from functools import wraps
from dataclasses import dataclass, field, asdict
from enum import Enum

try:
    import sentry_sdk
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class LogContext:
    """로그 컨텍스트"""
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    job_id: Optional[str] = None
    candidate_id: Optional[str] = None
    action: Optional[str] = None
    duration_ms: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환 (None 제외)"""
        result = {}
        for key, value in asdict(self).items():
            if value is not None and key != "extra":
                result[key] = value
        if self.extra:
            result.update(self.extra)
        return result


class StructuredFormatter(logging.Formatter):
    """구조화된 JSON 포매터"""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "logger": record.name,
        }

        # 컨텍스트 추가
        if hasattr(record, "context") and record.context:
            log_entry["context"] = record.context

        # 에러 정보 추가
        if record.exc_info:
            log_entry["error"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
            }

        return json.dumps(log_entry, ensure_ascii=False, default=str)


class ColoredFormatter(logging.Formatter):
    """컬러 콘솔 포매터 (개발용)"""

    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.now().strftime("%H:%M:%S")

        # 기본 메시지
        message = f"{color}[{record.levelname}]{self.RESET} {timestamp} {record.getMessage()}"

        # 컨텍스트 추가
        if hasattr(record, "context") and record.context:
            ctx_str = " ".join(f"{k}={v}" for k, v in record.context.items())
            message += f" {self.COLORS['DEBUG']}({ctx_str}){self.RESET}"

        # 에러 정보 추가
        if record.exc_info:
            import traceback
            message += f"\n{color}{traceback.format_exception(*record.exc_info)[-1].strip()}{self.RESET}"

        return message


class StructuredLogger:
    """
    구조화된 로거

    Features:
    - JSON 구조화 로깅 (프로덕션)
    - 컬러 콘솔 (개발)
    - 컨텍스트 전파
    - Sentry 통합
    """

    def __init__(
        self,
        name: str = "rai.worker",
        level: str = "INFO",
        is_production: bool = False,
        context: Optional[LogContext] = None,
    ):
        self.name = name
        self.is_production = is_production
        self.context = context or LogContext()

        # 로거 설정
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))

        # 기존 핸들러 제거
        self.logger.handlers = []

        # 핸들러 추가
        handler = logging.StreamHandler(sys.stdout)

        if is_production:
            handler.setFormatter(StructuredFormatter())
        else:
            handler.setFormatter(ColoredFormatter())

        self.logger.addHandler(handler)

    def child(self, **kwargs) -> "StructuredLogger":
        """새로운 컨텍스트로 자식 로거 생성"""
        new_context = LogContext(
            request_id=kwargs.get("request_id", self.context.request_id),
            user_id=kwargs.get("user_id", self.context.user_id),
            job_id=kwargs.get("job_id", self.context.job_id),
            candidate_id=kwargs.get("candidate_id", self.context.candidate_id),
            action=kwargs.get("action", self.context.action),
            extra={**self.context.extra, **kwargs.get("extra", {})},
        )
        return StructuredLogger(
            name=self.name,
            level=self.logger.level,
            is_production=self.is_production,
            context=new_context,
        )

    def _log(
        self,
        level: int,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        exc_info: bool = False,
    ):
        """내부 로깅 메서드"""
        merged_context = {**self.context.to_dict(), **(context or {})}

        record = self.logger.makeRecord(
            self.name,
            level,
            "",
            0,
            message,
            (),
            exc_info if exc_info else None,
        )
        record.context = merged_context if merged_context else None
        self.logger.handle(record)

    def debug(self, message: str, **context):
        self._log(logging.DEBUG, message, context)

    def info(self, message: str, **context):
        self._log(logging.INFO, message, context)

    def warning(self, message: str, **context):
        self._log(logging.WARNING, message, context)

    def error(self, message: str, error: Optional[Exception] = None, **context):
        self._log(logging.ERROR, message, context, exc_info=error is not None)

        # Sentry에 에러 보고
        if error and SENTRY_AVAILABLE:
            with sentry_sdk.push_scope() as scope:
                for key, value in {**self.context.to_dict(), **context}.items():
                    scope.set_tag(key, str(value))
                sentry_sdk.capture_exception(error)

    def critical(self, message: str, error: Optional[Exception] = None, **context):
        self._log(logging.CRITICAL, message, context, exc_info=error is not None)

        if error and SENTRY_AVAILABLE:
            with sentry_sdk.push_scope() as scope:
                scope.level = "fatal"
                for key, value in {**self.context.to_dict(), **context}.items():
                    scope.set_tag(key, str(value))
                sentry_sdk.capture_exception(error)

    def timed(self, action: str):
        """작업 시간 측정 데코레이터"""
        def decorator(func: Callable):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start = time.time()
                try:
                    result = await func(*args, **kwargs)
                    duration = (time.time() - start) * 1000
                    self.info(f"{action} completed", action=action, duration_ms=round(duration, 2))
                    return result
                except Exception as e:
                    duration = (time.time() - start) * 1000
                    self.error(f"{action} failed", error=e, action=action, duration_ms=round(duration, 2))
                    raise

            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                start = time.time()
                try:
                    result = func(*args, **kwargs)
                    duration = (time.time() - start) * 1000
                    self.info(f"{action} completed", action=action, duration_ms=round(duration, 2))
                    return result
                except Exception as e:
                    duration = (time.time() - start) * 1000
                    self.error(f"{action} failed", error=e, action=action, duration_ms=round(duration, 2))
                    raise

            import asyncio
            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper
        return decorator


# ─────────────────────────────────────────────────
# 기본 로거 인스턴스
# ─────────────────────────────────────────────────

import os

_is_production = os.getenv("ENV", "development") == "production"
_log_level = os.getenv("LOG_LEVEL", "INFO")

logger = StructuredLogger(
    name="rai.worker",
    level=_log_level,
    is_production=_is_production,
)


def get_logger(name: str = "rai.worker") -> StructuredLogger:
    """로거 인스턴스 반환"""
    return StructuredLogger(
        name=name,
        level=_log_level,
        is_production=_is_production,
    )


def create_request_logger(
    request_id: Optional[str] = None,
    user_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> StructuredLogger:
    """요청별 로거 생성"""
    import uuid
    return logger.child(
        request_id=request_id or str(uuid.uuid4())[:8],
        user_id=user_id,
        job_id=job_id,
    )
