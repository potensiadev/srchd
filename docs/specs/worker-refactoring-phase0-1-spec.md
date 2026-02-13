# Worker 리팩토링 Phase 0-1 개발 상세 기획서

**버전**: 1.0
**작성일**: 2026-02-13
**작성자**: Engineering Team
**검토자**: Senior PM

---

## 목차
1. [개요](#1-개요)
2. [Phase 0: 즉시 수정](#2-phase-0-즉시-수정)
3. [Phase 1: 단기 개선](#3-phase-1-단기-개선)
4. [리스크 분석](#4-리스크-분석)
5. [테스트 전략](#5-테스트-전략)
6. [롤백 계획](#6-롤백-계획)
7. [일정 및 마일스톤](#7-일정-및-마일스톤)

---

## 1. 개요

### 1.1 목적
`apps/worker` 코드베이스의 성능 병목과 운영 안정성 이슈를 해결하여:
- 이력서 처리 시간 1-3% 단축
- 디버깅 효율성 50% 향상
- 운영 설정 관리 일원화

### 1.2 범위

| Phase | 작업 | 예상 기간 | 우선순위 |
|-------|------|----------|----------|
| **Phase 0** | asyncio.run() 최적화, 암호화 키 검증 | 1-2일 | P0 (즉시) |
| **Phase 1** | 예외 처리 개선, 설정 통합, 로깅 정리 | 3-5일 | P1 (2주 내) |

### 1.3 대상 파일

```
apps/worker/
├── tasks.py              # Phase 0, 1
├── config.py             # Phase 1
├── services/
│   ├── llm_manager.py    # Phase 1
│   ├── database_service.py  # Phase 1
│   └── embedding_service.py # Phase 1
└── agents/
    ├── analyst_agent.py  # Phase 1
    └── privacy_agent.py  # Phase 0
```

---

## 2. Phase 0: 즉시 수정

### 2.1 P0-1: asyncio.run() 최적화

#### 현재 문제

```python
# tasks.py - 5개 위치에서 asyncio.run() 반복 호출
# Line 418
identity_result = asyncio.run(identity_checker.check(text))

# Line 447
analysis_result = asyncio.run(analyst.analyze(...))

# Line 604
embedding_result = asyncio.run(embedding_service.process_candidate(...))

# Line 705
thumbnail_result = asyncio.run(visual_agent.capture_portfolio_thumbnail(...))

# Line 859
result = asyncio.run(orchestrator.run_from_storage(...))
```

**문제점**:
- `asyncio.run()`은 매번 새 이벤트 루프 생성/삭제 (100-200ms 오버헤드)
- RQ Worker는 동기 컨텍스트 → 이벤트 루프 재사용 불가
- 이력서당 5회 호출 = 500-1000ms 순수 오버헤드

#### 해결 방안: 재사용 가능한 이벤트 루프 패턴

**Option A: 단일 이벤트 루프 재사용 (권장)**

```python
# utils/async_helpers.py (신규 파일)
"""
Async Helper Utilities for RQ Worker Context

RQ Worker는 동기 환경에서 실행되므로, async 함수 호출 시
이벤트 루프를 효율적으로 관리해야 함.
"""

import asyncio
from typing import TypeVar, Coroutine, Any
import threading

T = TypeVar('T')

# 스레드별 이벤트 루프 저장
_thread_local = threading.local()


def get_or_create_event_loop() -> asyncio.AbstractEventLoop:
    """
    현재 스레드의 이벤트 루프를 가져오거나 새로 생성.

    RQ Worker는 각 작업을 별도 스레드에서 실행할 수 있으므로,
    thread-local storage를 사용하여 이벤트 루프를 관리.
    """
    try:
        loop = getattr(_thread_local, 'event_loop', None)
        if loop is None or loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            _thread_local.event_loop = loop
        return loop
    except Exception:
        # 폴백: 새 루프 생성
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """
    동기 컨텍스트에서 async 함수를 실행.

    asyncio.run()과 달리 이벤트 루프를 재사용하여 오버헤드 최소화.

    Usage:
        result = run_async(some_async_function())

    Args:
        coro: 실행할 코루틴

    Returns:
        코루틴의 반환값
    """
    loop = get_or_create_event_loop()
    return loop.run_until_complete(coro)


def cleanup_event_loop() -> None:
    """
    현재 스레드의 이벤트 루프 정리.

    RQ Worker job 종료 시 호출하여 리소스 해제.
    """
    try:
        loop = getattr(_thread_local, 'event_loop', None)
        if loop is not None and not loop.is_closed():
            # 대기 중인 태스크 취소
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            # 루프 종료
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()
            _thread_local.event_loop = None
    except Exception:
        pass  # 정리 실패해도 계속 진행
```

**tasks.py 수정**:

```python
# 상단 import 추가
from utils.async_helpers import run_async, cleanup_event_loop

# Line 418: 기존
identity_result = asyncio.run(identity_checker.check(text))
# 수정 후
identity_result = run_async(identity_checker.check(text))

# Line 447: 기존
analysis_result = asyncio.run(analyst.analyze(...))
# 수정 후
analysis_result = run_async(analyst.analyze(...))

# Line 604: 기존
embedding_result = asyncio.run(embedding_service.process_candidate(...))
# 수정 후
embedding_result = run_async(embedding_service.process_candidate(...))

# Line 705: 기존
thumbnail_result = asyncio.run(visual_agent.capture_portfolio_thumbnail(...))
# 수정 후
thumbnail_result = run_async(visual_agent.capture_portfolio_thumbnail(...))

# Line 859: 기존
result = asyncio.run(orchestrator.run_from_storage(...))
# 수정 후
result = run_async(orchestrator.run_from_storage(...))

# job 종료 시 정리 (finally 블록에 추가)
finally:
    cleanup_event_loop()
```

**Option B: Sync Wrapper 메서드 추가 (대안)**

```python
# agents/analyst_agent.py에 추가
class AnalystAgent:
    async def analyze(self, ...) -> AnalysisResult:
        # 기존 async 구현
        ...

    def analyze_sync(self, ...) -> AnalysisResult:
        """Synchronous wrapper for RQ context"""
        return run_async(self.analyze(...))
```

#### 예상 결과

| 지표 | 현재 | 수정 후 | 개선 |
|------|------|---------|------|
| 이벤트 루프 생성 | 5회/job | 1회/job | 80% 감소 |
| 오버헤드 | 500-1000ms | 100-200ms | 80% 감소 |
| 전체 처리 시간 | 50-150초 | 49-149초 | 1-2% 개선 |

---

### 2.2 P0-2: 암호화 키 시작 시 검증 강화

#### 현재 문제

```python
# config.py - Line 182-188
# 프로덕션 환경에서만 검증
if settings.ENV == "production":
    if not settings.ENCRYPTION_KEY or len(settings.ENCRYPTION_KEY) != 64:
        raise ValueError(...)
```

**문제점**:
- staging/development 환경에서 잘못된 키로 실행 가능
- 런타임 중간에 암호화 실패 → 데이터 손실 위험
- privacy_agent.py에서 별도 검증 (코드 중복)

#### 해결 방안

```python
# config.py - 수정된 검증 로직

import re
from typing import Optional

def validate_encryption_key(key: Optional[str], env: str) -> None:
    """
    암호화 키 유효성 검증

    Args:
        key: ENCRYPTION_KEY 값
        env: 현재 환경 (production, staging, development)

    Raises:
        ValueError: 키가 유효하지 않은 경우
    """
    # 프로덕션/스테이징: 필수
    if env in ("production", "staging"):
        if not key:
            raise ValueError(
                f"ENCRYPTION_KEY is required in {env} environment. "
                "Generate with: openssl rand -hex 32"
            )
        if len(key) != 64:
            raise ValueError(
                f"ENCRYPTION_KEY must be 64 hex characters (got {len(key)}). "
                "Generate with: openssl rand -hex 32"
            )
        if not re.match(r'^[0-9a-fA-F]{64}$', key):
            raise ValueError(
                "ENCRYPTION_KEY must contain only hexadecimal characters [0-9a-fA-F]"
            )

    # development: 경고만 출력
    elif env == "development":
        if not key or len(key) != 64:
            import warnings
            warnings.warn(
                "ENCRYPTION_KEY is not set or invalid in development. "
                "PII encryption will fail. Set for full testing.",
                RuntimeWarning
            )


# 시작 시 검증 (Line 180 이후)
settings = Settings()
validate_encryption_key(settings.ENCRYPTION_KEY, settings.ENV)
```

```python
# agents/privacy_agent.py - 중복 검증 제거

# 기존 (제거)
if not self.encryption_key or len(self.encryption_key) != 64:
    raise ValueError("ENCRYPTION_KEY must be 64 hex characters")

# 수정: config.py에서 이미 검증됨을 명시
def __init__(self):
    settings = get_settings()
    # ENCRYPTION_KEY는 config.py에서 시작 시 검증됨
    self.encryption_key = settings.ENCRYPTION_KEY
    if not self.encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY not configured. Check config.py validation."
        )
```

#### 예상 결과

| 지표 | 현재 | 수정 후 |
|------|------|---------|
| 잘못된 키로 시작 가능성 | 있음 (staging) | 없음 |
| 런타임 암호화 실패 | 가능 | 시작 시 감지 |
| 디버깅 시간 | 30분+ | 즉시 감지 |

---

## 3. Phase 1: 단기 개선

### 3.1 P1-1: 예외 처리 구체화

#### 현재 문제

```python
# tasks.py - Line 611 (대표 예시)
try:
    embedding_result = asyncio.run(embedding_service.process_candidate(...))
except Exception as embed_error:
    logger.error(f"[Task] Embedding generation exception: {embed_error}")
    embeddings_failed = True
```

**문제점**:
- `Exception`은 모든 예외를 잡음 (TypeError, ValueError 포함)
- 네트워크 오류 vs 로직 오류 구분 불가
- 재시도 가능 여부 판단 어려움

#### 해결 방안

**Step 1: 커스텀 예외 클래스 정의**

```python
# exceptions.py (신규 파일)
"""
Worker Custom Exceptions

명확한 에러 분류로 디버깅 효율성 향상
"""

from typing import Optional


class WorkerBaseException(Exception):
    """Worker 기본 예외"""
    error_code: str = "WORKER_ERROR"
    retryable: bool = False

    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


# ─────────────────────────────────────────────────
# 재시도 가능한 예외 (Transient Errors)
# ─────────────────────────────────────────────────

class RetryableException(WorkerBaseException):
    """재시도 가능한 예외 (일시적 오류)"""
    retryable = True


class LLMTimeoutError(RetryableException):
    """LLM API 타임아웃"""
    error_code = "LLM_TIMEOUT"


class LLMRateLimitError(RetryableException):
    """LLM API Rate Limit"""
    error_code = "LLM_RATE_LIMIT"


class EmbeddingTimeoutError(RetryableException):
    """Embedding API 타임아웃"""
    error_code = "EMBEDDING_TIMEOUT"


class DatabaseConnectionError(RetryableException):
    """데이터베이스 연결 오류"""
    error_code = "DB_CONNECTION_ERROR"


class StorageDownloadError(RetryableException):
    """Storage 다운로드 오류"""
    error_code = "STORAGE_DOWNLOAD_ERROR"


# ─────────────────────────────────────────────────
# 재시도 불가능한 예외 (Permanent Errors)
# ─────────────────────────────────────────────────

class PermanentException(WorkerBaseException):
    """재시도 불가능한 예외 (영구 오류)"""
    retryable = False


class InvalidFileError(PermanentException):
    """유효하지 않은 파일"""
    error_code = "INVALID_FILE"


class MultiIdentityError(PermanentException):
    """다중 신원 감지"""
    error_code = "MULTI_IDENTITY"


class EncryptionError(PermanentException):
    """암호화/복호화 오류"""
    error_code = "ENCRYPTION_ERROR"


class ValidationError(PermanentException):
    """데이터 검증 실패"""
    error_code = "VALIDATION_ERROR"


class InsufficientCreditsError(PermanentException):
    """크레딧 부족"""
    error_code = "INSUFFICIENT_CREDITS"


# ─────────────────────────────────────────────────
# 부분 실패 예외 (Partial Failures)
# ─────────────────────────────────────────────────

class PartialFailureException(WorkerBaseException):
    """부분 실패 (계속 진행 가능)"""
    error_code = "PARTIAL_FAILURE"
    retryable = False  # 전체 재시도는 불필요


class EmbeddingPartialFailure(PartialFailureException):
    """임베딩 부분 실패 (검색 비활성화)"""
    error_code = "EMBEDDING_PARTIAL_FAILURE"


class VisualAgentFailure(PartialFailureException):
    """Visual Agent 실패 (썸네일 없음)"""
    error_code = "VISUAL_AGENT_FAILURE"
```

**Step 2: 서비스별 예외 처리 적용**

```python
# tasks.py - Line 603-630 수정

from exceptions import (
    EmbeddingTimeoutError,
    EmbeddingPartialFailure,
    RetryableException,
    PermanentException
)
import httpx
from openai import APITimeoutError, RateLimitError

# ─────────────────────────────────────────────────
# Step 3: 청킹 + 임베딩 (Embedding Service)
# ─────────────────────────────────────────────────
embedding_service = get_embedding_service()
embeddings_failed = False
embeddings_error = None

try:
    embedding_result = run_async(
        embedding_service.process_candidate(
            data=analyzed_data,
            generate_embeddings=True,
            raw_text=text
        )
    )

except APITimeoutError as timeout_err:
    # OpenAI 타임아웃 - 재시도 가능
    logger.warning(f"[Task] Embedding timeout (retryable): {timeout_err}")
    raise EmbeddingTimeoutError(
        message="Embedding API timeout",
        details={"original_error": str(timeout_err)}
    )

except RateLimitError as rate_err:
    # Rate limit - 재시도 가능 (백오프 필요)
    logger.warning(f"[Task] Embedding rate limit: {rate_err}")
    raise EmbeddingTimeoutError(
        message="Embedding API rate limited",
        details={"retry_after": getattr(rate_err, 'retry_after', 60)}
    )

except httpx.ConnectError as conn_err:
    # 네트워크 연결 오류 - 재시도 가능
    logger.warning(f"[Task] Embedding connection error: {conn_err}")
    raise EmbeddingTimeoutError(
        message="Failed to connect to embedding service",
        details={"original_error": str(conn_err)}
    )

except ValueError as val_err:
    # 입력 데이터 오류 - 재시도 불가
    logger.error(f"[Task] Embedding validation error: {val_err}")
    embeddings_failed = True
    embeddings_error = f"Invalid input: {val_err}"
    embedding_result = None

except Exception as unexpected_err:
    # 예상치 못한 오류 - 로그 후 부분 실패로 처리
    logger.error(
        f"[Task] Unexpected embedding error: {unexpected_err}",
        exc_info=True  # 스택 트레이스 포함
    )
    embeddings_failed = True
    embeddings_error = f"Unexpected error: {type(unexpected_err).__name__}"
    embedding_result = None
```

**Step 3: LLM 서비스 예외 처리**

```python
# tasks.py - Line 444-460 수정

from exceptions import LLMTimeoutError, LLMRateLimitError
from openai import APITimeoutError, RateLimitError as OpenAIRateLimit
from anthropic import APITimeoutError as ClaudeTimeout

try:
    analysis_result = run_async(
        analyst.analyze(resume_text=text, mode=analysis_mode, filename=file_name)
    )

except APITimeoutError as timeout_err:
    logger.error(f"[Task] LLM timeout: {timeout_err}")
    raise LLMTimeoutError(
        message="LLM analysis timed out",
        details={"timeout_seconds": LLM_TIMEOUT_SECONDS}
    )

except (OpenAIRateLimit, ) as rate_err:
    logger.warning(f"[Task] LLM rate limited: {rate_err}")
    raise LLMRateLimitError(
        message="LLM rate limit exceeded",
        details={"retry_after": 60}
    )

except json.JSONDecodeError as json_err:
    # LLM이 잘못된 JSON 반환
    logger.error(f"[Task] LLM returned invalid JSON: {json_err}")
    error_msg = "LLM 응답 파싱 실패"
    db_service.update_job_status(
        job_id, status="failed",
        error_code="LLM_PARSE_ERROR",
        error_message=error_msg
    )
    notify_webhook(job_id, "failed", error=error_msg)
    return {"success": False, "error": error_msg}
```

#### 예상 결과

| 지표 | 현재 | 수정 후 |
|------|------|---------|
| 오류 원인 파악 시간 | 30분+ | 5분 |
| 재시도 판단 정확도 | 낮음 | 높음 |
| 불필요한 재시도 | 많음 | 최소화 |

---

### 3.2 P1-2: 설정값 통합 (config.py)

#### 현재 문제: 산재된 하드코딩 값

```python
# tasks.py
max_retries=2  # Line 77
max_retries=3  # Line 172
timeout=10     # Line 55

# llm_manager.py
LLM_TIMEOUT_SECONDS = 120  # Line 31
LLM_CONNECT_TIMEOUT = 10   # Line 32

# embedding_service.py (추정)
MAX_RETRIES = 3
CHUNK_SIZE = 2000
```

#### 해결 방안

```python
# config.py - 설정 통합

class Settings(BaseSettings):
    """Worker 설정"""

    # ─────────────────────────────────────────────────
    # 기존 설정 유지...
    # ─────────────────────────────────────────────────

    # ─────────────────────────────────────────────────
    # 재시도 설정 (신규)
    # ─────────────────────────────────────────────────
    # Webhook
    WEBHOOK_MAX_RETRIES: int = Field(
        default=3,
        description="Webhook 호출 최대 재시도 횟수"
    )
    WEBHOOK_TIMEOUT_SECONDS: int = Field(
        default=10,
        description="Webhook 호출 타임아웃 (초)"
    )
    WEBHOOK_RETRY_DELAY_SECONDS: float = Field(
        default=1.0,
        description="Webhook 재시도 대기 시간 (초)"
    )

    # Storage 다운로드
    STORAGE_MAX_RETRIES: int = Field(
        default=3,
        description="Storage 다운로드 최대 재시도 횟수"
    )
    STORAGE_TIMEOUT_SECONDS: int = Field(
        default=30,
        description="Storage 다운로드 타임아웃 (초)"
    )

    # LLM
    LLM_TIMEOUT_SECONDS: int = Field(
        default=120,
        description="LLM API 호출 타임아웃 (초)"
    )
    LLM_CONNECT_TIMEOUT_SECONDS: int = Field(
        default=10,
        description="LLM API 연결 타임아웃 (초)"
    )
    LLM_MAX_RETRIES: int = Field(
        default=2,
        description="LLM API 최대 재시도 횟수"
    )

    # Embedding
    EMBEDDING_MAX_RETRIES: int = Field(
        default=3,
        description="Embedding API 최대 재시도 횟수"
    )
    EMBEDDING_TIMEOUT_SECONDS: int = Field(
        default=60,
        description="Embedding API 타임아웃 (초)"
    )
    EMBEDDING_RETRY_BASE_WAIT: float = Field(
        default=1.0,
        description="Embedding 재시도 기본 대기 시간 (지수 백오프)"
    )
    EMBEDDING_RETRY_MAX_WAIT: float = Field(
        default=10.0,
        description="Embedding 재시도 최대 대기 시간"
    )

    # ─────────────────────────────────────────────────
    # 청킹 설정 (ChunkingConfig 통합)
    # ─────────────────────────────────────────────────
    CHUNK_MAX_STRUCTURED_CHARS: int = Field(
        default=2000,
        description="구조화 청크 최대 문자 수"
    )
    CHUNK_MAX_RAW_FULL_CHARS: int = Field(
        default=8000,
        description="raw_full 최대 문자 수"
    )
    CHUNK_RAW_SECTION_SIZE: int = Field(
        default=1500,
        description="원본 텍스트 청크 크기"
    )
    CHUNK_RAW_SECTION_OVERLAP: int = Field(
        default=300,
        description="원본 텍스트 청크 오버랩"
    )

    # 한글 최적화
    CHUNK_KOREAN_THRESHOLD: float = Field(
        default=0.5,
        description="한글 문서 판단 임계값 (50%)"
    )
    CHUNK_KOREAN_SIZE: int = Field(
        default=2000,
        description="한글 문서용 청크 크기"
    )
    CHUNK_KOREAN_OVERLAP: int = Field(
        default=500,
        description="한글 문서용 오버랩"
    )
```

**사용처 수정**:

```python
# llm_manager.py - Line 31-32 수정
# 기존
LLM_TIMEOUT_SECONDS = 120
LLM_CONNECT_TIMEOUT = 10

# 수정
settings = get_settings()
LLM_TIMEOUT_SECONDS = settings.LLM_TIMEOUT_SECONDS
LLM_CONNECT_TIMEOUT = settings.LLM_CONNECT_TIMEOUT_SECONDS
```

```python
# tasks.py - notify_webhook 함수 수정
def notify_webhook(job_id: str, status: str, ...):
    settings = get_settings()
    max_retries = settings.WEBHOOK_MAX_RETRIES
    timeout = settings.WEBHOOK_TIMEOUT_SECONDS
    retry_delay = settings.WEBHOOK_RETRY_DELAY_SECONDS
    ...
```

---

### 3.3 P1-3: 로깅 레벨 정리

#### 현재 문제

```python
# llm_manager.py - Line 26
logging.basicConfig(level=logging.DEBUG)  # 항상 DEBUG
```

**문제점**:
- config.py의 `LOG_LEVEL` 설정 무시
- 프로덕션에서 과도한 로그 출력
- 디스크/메모리 낭비

#### 해결 방안

```python
# llm_manager.py - Line 25-27 수정

# 기존 (제거)
logging.basicConfig(level=logging.DEBUG)

# 수정
from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)
logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
```

```python
# 모든 서비스 파일에 공통 로거 설정 적용
# utils/logging_config.py (신규)

import logging
from config import get_settings


def setup_logger(name: str) -> logging.Logger:
    """
    표준화된 로거 생성

    Args:
        name: 로거 이름 (보통 __name__)

    Returns:
        설정된 Logger 인스턴스
    """
    settings = get_settings()
    logger = logging.getLogger(name)

    # config.py의 LOG_LEVEL 사용
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logger.setLevel(level)

    # 핸들러가 없으면 추가
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(level)
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
```

---

## 4. 리스크 분석

### 4.1 Phase 0 리스크

| 리스크 | 확률 | 영향도 | 완화 방안 |
|--------|------|--------|----------|
| **이벤트 루프 메모리 누수** | 중간 | 높음 | `cleanup_event_loop()` 호출 필수화, 메모리 모니터링 |
| **스레드 안전성 문제** | 낮음 | 높음 | thread-local storage 사용, 동시성 테스트 |
| **기존 동작 변경** | 낮음 | 중간 | 단위 테스트 추가, 스테이징 검증 |
| **롤백 필요 시 지연** | 낮음 | 낮음 | Feature flag로 즉시 롤백 가능 |

#### 리스크 상세: 이벤트 루프 메모리 누수

**시나리오**:
- `cleanup_event_loop()`이 호출되지 않으면 이벤트 루프가 계속 유지
- 장기 실행 워커에서 메모리 증가 가능

**완화**:
```python
# tasks.py - job 함수 데코레이터로 자동 정리
from functools import wraps

def with_event_loop_cleanup(func):
    """Job 종료 시 이벤트 루프 자동 정리"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        finally:
            cleanup_event_loop()
    return wrapper

@with_event_loop_cleanup
def full_pipeline(job_id: str, ...):
    ...
```

### 4.2 Phase 1 리스크

| 리스크 | 확률 | 영향도 | 완화 방안 |
|--------|------|--------|----------|
| **예외 분류 오류** | 중간 | 중간 | 기존 로그 분석으로 예외 유형 파악 |
| **설정 누락** | 낮음 | 중간 | 기본값 설정, 시작 시 검증 |
| **로그 레벨 변경으로 디버깅 어려움** | 낮음 | 낮음 | DEBUG 모드 환경변수로 활성화 가능 |
| **하위 호환성 문제** | 낮음 | 중간 | 기존 환경변수 유지, 새 변수 추가 방식 |

#### 리스크 상세: 예외 분류 오류

**시나리오**:
- 재시도 가능한 예외를 재시도 불가로 분류 → 불필요한 실패
- 재시도 불가 예외를 재시도 가능으로 분류 → 무한 재시도

**완화**:
```python
# 프로덕션 로그 분석으로 예외 유형 검증
# 1주간 staging에서 예외 발생 패턴 수집
# 분류가 잘못된 경우 exceptions.py 수정
```

---

## 5. 테스트 전략

### 5.1 Phase 0 테스트

```python
# tests/test_async_helpers.py

import pytest
import asyncio
from utils.async_helpers import run_async, get_or_create_event_loop, cleanup_event_loop


class TestRunAsync:
    """run_async 함수 테스트"""

    def test_basic_coroutine(self):
        """기본 코루틴 실행"""
        async def simple_coro():
            return 42

        result = run_async(simple_coro())
        assert result == 42

    def test_event_loop_reuse(self):
        """이벤트 루프 재사용 확인"""
        loop1 = get_or_create_event_loop()
        loop2 = get_or_create_event_loop()
        assert loop1 is loop2

    def test_cleanup(self):
        """이벤트 루프 정리"""
        loop = get_or_create_event_loop()
        cleanup_event_loop()
        # 정리 후 새 루프 생성 확인
        new_loop = get_or_create_event_loop()
        assert new_loop is not loop

    def test_exception_propagation(self):
        """예외 전파 확인"""
        async def failing_coro():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            run_async(failing_coro())

    def test_timeout_handling(self):
        """타임아웃 처리"""
        async def slow_coro():
            await asyncio.sleep(10)

        with pytest.raises(asyncio.TimeoutError):
            loop = get_or_create_event_loop()
            loop.run_until_complete(
                asyncio.wait_for(slow_coro(), timeout=0.1)
            )
```

### 5.2 Phase 1 테스트

```python
# tests/test_exceptions.py

import pytest
from exceptions import (
    LLMTimeoutError,
    EmbeddingPartialFailure,
    RetryableException,
    PermanentException
)


class TestExceptionHierarchy:
    """예외 계층 구조 테스트"""

    def test_retryable_flag(self):
        """재시도 가능 플래그"""
        retryable = LLMTimeoutError("timeout")
        assert retryable.retryable is True

        permanent = InvalidFileError("invalid")
        assert permanent.retryable is False

    def test_error_code(self):
        """에러 코드"""
        err = LLMTimeoutError("timeout")
        assert err.error_code == "LLM_TIMEOUT"

    def test_details(self):
        """상세 정보"""
        err = LLMTimeoutError(
            "timeout",
            details={"timeout_seconds": 120}
        )
        assert err.details["timeout_seconds"] == 120
```

```python
# tests/test_config_validation.py

import pytest
from config import validate_encryption_key


class TestEncryptionKeyValidation:
    """암호화 키 검증 테스트"""

    def test_valid_key_production(self):
        """프로덕션: 유효한 키"""
        valid_key = "a" * 64  # 64자 hex
        validate_encryption_key(valid_key, "production")  # 예외 없음

    def test_missing_key_production(self):
        """프로덕션: 키 누락"""
        with pytest.raises(ValueError, match="required in production"):
            validate_encryption_key("", "production")

    def test_short_key_production(self):
        """프로덕션: 짧은 키"""
        with pytest.raises(ValueError, match="64 hex characters"):
            validate_encryption_key("a" * 32, "production")

    def test_invalid_hex_production(self):
        """프로덕션: 비 hex 문자"""
        with pytest.raises(ValueError, match="hexadecimal"):
            validate_encryption_key("g" * 64, "production")

    def test_missing_key_development(self):
        """개발: 키 누락 시 경고만"""
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            validate_encryption_key("", "development")
            assert len(w) == 1
            assert "not set or invalid" in str(w[0].message)
```

### 5.3 통합 테스트

```python
# tests/integration/test_pipeline_with_new_async.py

import pytest
from tasks import full_pipeline
from unittest.mock import patch, MagicMock


class TestPipelineWithNewAsync:
    """새 async 헬퍼로 파이프라인 테스트"""

    @pytest.fixture
    def mock_services(self):
        """서비스 모킹"""
        with patch('tasks.get_identity_checker') as mock_id, \
             patch('tasks.get_analyst_agent') as mock_analyst, \
             patch('tasks.get_embedding_service') as mock_embed:

            # Identity checker mock
            mock_id.return_value.check = MagicMock(
                return_value=asyncio.coroutine(lambda: MagicMock(should_reject=False))()
            )

            yield {
                'identity': mock_id,
                'analyst': mock_analyst,
                'embedding': mock_embed
            }

    def test_pipeline_completes(self, mock_services):
        """파이프라인 정상 완료"""
        result = full_pipeline(
            job_id="test-job",
            file_path="test/path",
            user_id="test-user",
            ...
        )
        assert result["success"] is True
```

---

## 6. 롤백 계획

### 6.1 Phase 0 롤백

**즉시 롤백 방법** (1분 이내):

```python
# config.py에 Feature Flag 추가
USE_NEW_ASYNC_HELPER: bool = Field(
    default=True,
    description="새 async 헬퍼 사용 (False=기존 asyncio.run)"
)
```

```python
# tasks.py - Feature Flag 기반 분기
from config import get_settings

settings = get_settings()

if settings.USE_NEW_ASYNC_HELPER:
    from utils.async_helpers import run_async
else:
    def run_async(coro):
        return asyncio.run(coro)
```

**롤백 절차**:
1. 환경변수 설정: `USE_NEW_ASYNC_HELPER=false`
2. Worker 재시작
3. 로그 모니터링

### 6.2 Phase 1 롤백

**예외 처리 롤백**:
- 새 예외 클래스는 기존 `Exception` 상속
- 기존 `except Exception` 블록에서 여전히 잡힘
- 점진적 롤백 가능

**설정 롤백**:
- 기존 하드코딩 값을 기본값으로 설정
- 환경변수 미설정 시 기존 동작 유지

---

## 7. 일정 및 마일스톤

### 7.1 Phase 0 일정 (2일)

| 일차 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| Day 1 AM | `async_helpers.py` 구현 | Backend | 유닛 테스트 통과 |
| Day 1 PM | tasks.py 수정 | Backend | 로컬 테스트 통과 |
| Day 2 AM | 암호화 키 검증 강화 | Backend | 테스트 통과 |
| Day 2 PM | Staging 배포 및 검증 | DevOps | 10건 처리 성공 |

### 7.2 Phase 1 일정 (5일)

| 일차 | 작업 | 담당 | 완료 기준 |
|------|------|------|----------|
| Day 1 | `exceptions.py` 설계 및 구현 | Backend | 코드 리뷰 통과 |
| Day 2 | tasks.py 예외 처리 적용 | Backend | 유닛 테스트 통과 |
| Day 3 | config.py 설정 통합 | Backend | 기존 테스트 통과 |
| Day 4 | 로깅 정리, 통합 테스트 | Backend | 통합 테스트 통과 |
| Day 5 | Staging 배포 및 모니터링 | DevOps | 24시간 안정 운영 |

### 7.3 마일스톤

```
Week 1
├── [M1] Phase 0 완료 및 Staging 배포 ─────── Day 2
└── [M2] Phase 0 Production 배포 ──────────── Day 3

Week 2
├── [M3] Phase 1 예외 처리 완료 ────────────── Day 2
├── [M4] Phase 1 설정 통합 완료 ────────────── Day 3
└── [M5] Phase 1 Production 배포 ──────────── Day 5
```

---

## 8. 단점 및 트레이드오프

### 8.1 Phase 0 단점

| 단점 | 설명 | 수용 이유 |
|------|------|----------|
| **복잡도 증가** | async_helpers.py 추가로 코드 경로 증가 | 성능 개선(1-3%)이 복잡도 비용보다 큼 |
| **디버깅 어려움** | 이벤트 루프 상태 추적 필요 | 충분한 로깅으로 완화 |
| **Thread-local 의존** | 멀티스레드 환경에서 주의 필요 | RQ Worker가 단일 스레드이므로 안전 |

### 8.2 Phase 1 단점

| 단점 | 설명 | 수용 이유 |
|------|------|----------|
| **예외 클래스 증가** | 12+ 새 예외 클래스 | 디버깅 효율 50% 향상으로 정당화 |
| **설정 항목 증가** | config.py 크기 2배 | 중앙 집중 관리의 장점이 더 큼 |
| **기존 코드 수정량** | 5+ 파일 수정 | 테스트 커버리지로 안전성 확보 |
| **학습 곡선** | 팀원들이 새 예외 체계 학습 필요 | 문서화 및 온보딩 자료로 완화 |

### 8.3 하지 않기로 한 것들

| 항목 | 이유 |
|------|------|
| **Async RQ Worker 전환** | 전체 아키텍처 변경 필요, P3로 연기 |
| **전역 싱글톤 제거** | 현재 동작에 문제 없음, P2로 연기 |
| **database_service.py 분리** | 동작 중인 코드, 기술부채 스프린트에서 처리 |
| **HWP 네이티브 파서** | 개발 비용 대비 효과 불확실, 데이터 수집 후 결정 |

---

## Appendix A: 체크리스트

### Phase 0 배포 전 체크리스트

- [ ] `async_helpers.py` 유닛 테스트 100% 통과
- [ ] tasks.py의 5개 asyncio.run() 모두 수정
- [ ] cleanup_event_loop() 호출 확인 (finally 블록)
- [ ] 암호화 키 검증 테스트 통과
- [ ] Staging에서 PDF/DOCX/HWP 각 1건 처리 성공
- [ ] 메모리 사용량 모니터링 설정
- [ ] Feature Flag 롤백 테스트 완료

### Phase 1 배포 전 체크리스트

- [ ] exceptions.py 코드 리뷰 완료
- [ ] 기존 예외 처리 코드 모두 마이그레이션
- [ ] config.py 새 설정 기본값 검증
- [ ] 기존 환경변수 하위 호환성 확인
- [ ] 로깅 레벨별 출력 테스트
- [ ] Staging에서 24시간 무중단 운영
- [ ] 에러 로그 샘플 검토 (분류 정확성)

---

**문서 끝**
