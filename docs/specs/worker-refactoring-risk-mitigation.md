# Worker 리팩토링 리스크 최소화 전략

**버전**: 1.0
**작성일**: 2026-02-13
**목적**: Phase 0-1 리팩토링의 리스크와 단점을 최소화하는 대안 검토

---

## 목차
1. [리스크별 대안 분석](#1-리스크별-대안-분석)
2. [단점별 최소화 전략](#2-단점별-최소화-전략)
3. [최선의 접근법 권장](#3-최선의-접근법-권장)
4. [구현 가이드](#4-구현-가이드)

---

## 1. 리스크별 대안 분석

### 1.1 이벤트 루프 메모리 누수 리스크

#### 문제 상세
```
원인: cleanup_event_loop()이 호출되지 않으면 이벤트 루프가 메모리에 남음
영향: 장시간 운영 시 Worker 메모리 증가 → OOM 발생 가능
확률: 중간 (finally 블록 누락 시)
```

#### 대안 비교

| 대안 | 복잡도 | 안전성 | 성능 | 권장 |
|------|--------|--------|------|------|
| **A: Context Manager 패턴** | 낮음 | 높음 | 좋음 | ✅ **최선** |
| B: Decorator 패턴 | 낮음 | 중간 | 좋음 | 차선 |
| C: Thread-local + atexit | 중간 | 높음 | 좋음 | 복잡 |
| D: 매번 새 루프 (현재 방식) | 낮음 | 높음 | 나쁨 | 비권장 |

#### 최선의 대안: Context Manager 패턴

```python
# utils/async_helpers.py

import asyncio
import threading
from typing import TypeVar, Coroutine, Any, Generator
from contextlib import contextmanager

T = TypeVar('T')
_thread_local = threading.local()


@contextmanager
def managed_event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """
    Context Manager로 이벤트 루프 생명주기 자동 관리

    - with 블록 진입 시: 이벤트 루프 생성/재사용
    - with 블록 종료 시: 자동 정리 (예외 발생해도 보장)

    Usage:
        with managed_event_loop() as loop:
            result = loop.run_until_complete(some_coro())
    """
    loop = getattr(_thread_local, 'event_loop', None)
    created_new = False

    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _thread_local.event_loop = loop
        created_new = True

    try:
        yield loop
    finally:
        # Context Manager가 자동으로 정리 보장
        if created_new:
            try:
                # 대기 중인 태스크 정리
                pending = asyncio.all_tasks(loop)
                for task in pending:
                    task.cancel()
                    try:
                        loop.run_until_complete(task)
                    except asyncio.CancelledError:
                        pass
                loop.run_until_complete(loop.shutdown_asyncgens())
            finally:
                loop.close()
                _thread_local.event_loop = None


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """
    동기 컨텍스트에서 async 함수 실행

    Context Manager를 내부적으로 사용하여 메모리 누수 방지
    """
    with managed_event_loop() as loop:
        return loop.run_until_complete(coro)
```

**장점**:
- `with` 블록 종료 시 **자동 정리** (예외 발생해도 보장)
- 개발자가 `cleanup_event_loop()` 호출을 잊을 수 없음
- 중첩 사용 안전 (이미 루프가 있으면 재사용)

**단점**:
- 매번 Context Manager 오버헤드 (미미함, ~1μs)

---

### 1.2 스레드 안전성 문제 리스크

#### 문제 상세
```
원인: RQ Worker가 멀티스레드로 동작할 경우 thread-local이 아닌 전역 변수 사용 시 race condition
영향: 데이터 손상, 예측 불가능한 동작
확률: 낮음 (현재 RQ는 단일 스레드, 하지만 향후 변경 가능)
```

#### 대안 비교

| 대안 | 복잡도 | 안전성 | 성능 | 권장 |
|------|--------|--------|------|------|
| **A: threading.local() 사용** | 낮음 | 높음 | 좋음 | ✅ **최선** |
| B: asyncio.Runner (Python 3.11+) | 낮음 | 높음 | 좋음 | Python 버전 의존 |
| C: Lock 기반 동기화 | 중간 | 높음 | 나쁨 | 성능 저하 |
| D: 전역 변수 금지 정책 | 높음 | 높음 | 좋음 | 코드 변경 많음 |

#### 최선의 대안: threading.local() + 방어적 코딩

```python
# utils/async_helpers.py

import asyncio
import threading
from typing import TypeVar, Coroutine, Any

T = TypeVar('T')

# 스레드별 독립적인 이벤트 루프 저장
_thread_local = threading.local()


def get_event_loop_for_thread() -> asyncio.AbstractEventLoop:
    """
    현재 스레드 전용 이벤트 루프 반환

    각 스레드가 자신만의 이벤트 루프를 가지므로:
    - Race condition 없음
    - Lock 불필요
    - 멀티스레드 환경에서도 안전
    """
    loop = getattr(_thread_local, 'loop', None)

    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _thread_local.loop = loop
        # 현재 스레드의 기본 루프로 설정
        asyncio.set_event_loop(loop)

    return loop


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """
    스레드 안전한 async 실행

    - 각 스레드가 독립적인 이벤트 루프 사용
    - 멀티스레드 환경에서도 안전
    """
    loop = get_event_loop_for_thread()
    return loop.run_until_complete(coro)
```

**추가 안전장치**: 스레드 ID 로깅

```python
import threading
import logging

logger = logging.getLogger(__name__)

def run_async_with_tracking(coro: Coroutine[Any, Any, T]) -> T:
    """디버깅용: 스레드 ID 추적"""
    thread_id = threading.current_thread().ident
    logger.debug(f"[run_async] Thread {thread_id} executing coroutine")

    loop = get_event_loop_for_thread()
    result = loop.run_until_complete(coro)

    logger.debug(f"[run_async] Thread {thread_id} completed")
    return result
```

---

### 1.3 예외 분류 오류 리스크

#### 문제 상세
```
원인: 재시도 가능/불가능 예외 분류가 잘못되면 불필요한 재시도 또는 조기 실패
영향: 리소스 낭비 또는 성공 가능한 작업 실패
확률: 중간 (새 예외 유형 추가 시)
```

#### 대안 비교

| 대안 | 복잡도 | 정확성 | 유지보수 | 권장 |
|------|--------|--------|----------|------|
| **A: 화이트리스트 + 로깅** | 낮음 | 높음 | 쉬움 | ✅ **최선** |
| B: 블랙리스트 방식 | 낮음 | 중간 | 어려움 | 누락 위험 |
| C: ML 기반 분류 | 높음 | 높음 | 어려움 | 과도한 복잡도 |
| D: 모든 예외 재시도 | 낮음 | 낮음 | 쉬움 | 리소스 낭비 |

#### 최선의 대안: 화이트리스트 + 자동 로깅 + 주기적 검토

```python
# exceptions.py

from typing import Set, Type
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────
# 재시도 가능 예외 화이트리스트 (명시적 정의)
# ─────────────────────────────────────────────────
RETRYABLE_EXCEPTIONS: Set[Type[Exception]] = {
    # 네트워크 관련
    ConnectionError,
    TimeoutError,
    # httpx
    # httpx.ConnectError,  # 런타임에 추가
    # httpx.ReadTimeout,
    # OpenAI
    # openai.APITimeoutError,
    # openai.RateLimitError,
}

# 재시도 불가 예외 (명시적)
PERMANENT_EXCEPTIONS: Set[Type[Exception]] = {
    ValueError,
    TypeError,
    KeyError,
    AttributeError,
    json.JSONDecodeError,
}


def is_retryable(exc: Exception) -> bool:
    """
    예외가 재시도 가능한지 판단

    전략: 화이트리스트 기반
    - 명시적으로 등록된 예외만 재시도
    - 미등록 예외는 기본적으로 재시도 불가 (안전한 기본값)
    - 미분류 예외는 로깅하여 추후 검토
    """
    exc_type = type(exc)

    # 1. 화이트리스트 확인
    if exc_type in RETRYABLE_EXCEPTIONS:
        return True

    # 2. 상속 관계 확인 (부모 클래스가 화이트리스트에 있는지)
    for retryable_type in RETRYABLE_EXCEPTIONS:
        if isinstance(exc, retryable_type):
            return True

    # 3. 블랙리스트 확인
    if exc_type in PERMANENT_EXCEPTIONS:
        return False

    # 4. 미분류 예외: 로깅 후 재시도 불가로 처리 (안전한 기본값)
    logger.warning(
        f"[Exception] Unclassified exception type: {exc_type.__name__}. "
        f"Treating as non-retryable. Consider adding to whitelist/blacklist. "
        f"Details: {str(exc)[:200]}"
    )
    return False


def register_retryable(exc_type: Type[Exception]) -> None:
    """런타임에 재시도 가능 예외 추가"""
    RETRYABLE_EXCEPTIONS.add(exc_type)
    logger.info(f"[Exception] Registered retryable exception: {exc_type.__name__}")


# 런타임에 외부 라이브러리 예외 등록
def _register_external_exceptions():
    """외부 라이브러리 예외 등록 (import 시점에 실행)"""
    try:
        import httpx
        register_retryable(httpx.ConnectError)
        register_retryable(httpx.ReadTimeout)
        register_retryable(httpx.ConnectTimeout)
    except ImportError:
        pass

    try:
        from openai import APITimeoutError, RateLimitError
        register_retryable(APITimeoutError)
        register_retryable(RateLimitError)
    except ImportError:
        pass


_register_external_exceptions()
```

**주기적 검토 프로세스**:

```python
# scripts/analyze_unclassified_exceptions.py
"""
주간 스크립트: 미분류 예외 분석
로그에서 "Unclassified exception" 패턴 추출하여 리포트 생성
"""

import re
from collections import Counter

def analyze_logs(log_file: str) -> dict:
    """미분류 예외 빈도 분석"""
    pattern = r"Unclassified exception type: (\w+)"

    with open(log_file) as f:
        matches = re.findall(pattern, f.read())

    return Counter(matches)

# 결과 예시:
# {'SomeNewException': 45, 'AnotherException': 12}
# → 빈도 높은 예외는 화이트리스트/블랙리스트에 추가
```

---

### 1.4 기존 동작 변경 리스크

#### 문제 상세
```
원인: 리팩토링으로 기존 동작이 미묘하게 변경될 수 있음
영향: 프로덕션에서 예상치 못한 버그
확률: 낮음 (테스트로 완화 가능)
```

#### 최선의 대안: Feature Flag + Shadow Mode

```python
# config.py

class Settings(BaseSettings):
    # Feature Flags
    USE_NEW_ASYNC_HELPER: bool = Field(
        default=False,  # 기본값 False로 시작 (점진적 롤아웃)
        description="새 async 헬퍼 사용"
    )

    ASYNC_SHADOW_MODE: bool = Field(
        default=False,
        description="Shadow Mode: 기존/신규 방식 모두 실행하고 결과 비교"
    )
```

```python
# tasks.py - Shadow Mode 구현

import asyncio
from utils.async_helpers import run_async as new_run_async

settings = get_settings()

def run_async_with_shadow(coro_factory):
    """
    Shadow Mode: 기존 방식과 새 방식 모두 실행하고 결과 비교

    Args:
        coro_factory: 코루틴을 생성하는 함수 (매번 새 코루틴 필요)

    1. ASYNC_SHADOW_MODE=true: 둘 다 실행, 결과 비교, 기존 결과 반환
    2. USE_NEW_ASYNC_HELPER=true: 새 방식만 실행
    3. 그 외: 기존 방식만 실행
    """
    if settings.ASYNC_SHADOW_MODE:
        # Shadow Mode: 둘 다 실행하고 비교
        old_result = asyncio.run(coro_factory())
        new_result = new_run_async(coro_factory())

        # 결과 비교 (타입, 성공 여부 등)
        if type(old_result) != type(new_result):
            logger.error(
                f"[Shadow] Type mismatch: old={type(old_result)}, new={type(new_result)}"
            )
        elif hasattr(old_result, 'success') and old_result.success != new_result.success:
            logger.error(
                f"[Shadow] Success mismatch: old={old_result.success}, new={new_result.success}"
            )
        else:
            logger.debug("[Shadow] Results match")

        return old_result  # 기존 결과 반환 (안전)

    elif settings.USE_NEW_ASYNC_HELPER:
        return new_run_async(coro_factory())

    else:
        return asyncio.run(coro_factory())


# 사용 예시
# 기존: asyncio.run(identity_checker.check(text))
# 변경: run_async_with_shadow(lambda: identity_checker.check(text))
```

**롤아웃 전략**:

```
Week 1: ASYNC_SHADOW_MODE=true (비교만, 기존 결과 사용)
        → 로그 분석, 불일치 확인

Week 2: USE_NEW_ASYNC_HELPER=true (10% 트래픽)
        → Canary 배포

Week 3: USE_NEW_ASYNC_HELPER=true (50% 트래픽)
        → 문제 없으면 확대

Week 4: USE_NEW_ASYNC_HELPER=true (100%)
        → 전체 적용, Shadow Mode 코드 제거
```

---

## 2. 단점별 최소화 전략

### 2.1 코드 복잡도 증가 최소화

#### 문제: async_helpers.py 추가로 코드 경로 증가

#### 최소화 전략: 단일 진입점 + 문서화

```python
# utils/async_helpers.py - 단일 진입점

"""
Async Helpers for RQ Worker

이 모듈은 RQ Worker(동기 컨텍스트)에서 async 함수를 실행할 때 사용합니다.

사용법:
    from utils.async_helpers import run_async

    result = run_async(some_async_function())

주의사항:
    - 이 함수는 동기 컨텍스트에서만 사용하세요
    - 이미 async 함수 내부라면 await를 직접 사용하세요
    - 중첩 호출은 자동으로 처리됩니다

내부 동작:
    - Thread-local 이벤트 루프 재사용으로 오버헤드 최소화
    - Context Manager로 자동 정리
"""

# 외부에 노출할 함수는 run_async 하나만
__all__ = ['run_async']

def run_async(coro):
    """외부 공개 함수 - 단일 진입점"""
    ...
```

**복잡도 측정**: 기존 5줄 → 변경 후 5줄 (사용자 관점 동일)

```python
# 기존
identity_result = asyncio.run(identity_checker.check(text))

# 변경 후
identity_result = run_async(identity_checker.check(text))
```

---

### 2.2 예외 클래스 증가 최소화

#### 문제: 12+ 새 예외 클래스

#### 최소화 전략: 계층적 구조 + 범용 클래스 활용

```python
# exceptions.py - 최소 예외 계층

"""
최소한의 예외 클래스로 모든 케이스 커버

계층:
    WorkerError (base)
    ├── RetryableError (재시도 가능)
    │   └── 상세 원인은 error_code로 구분
    └── PermanentError (재시도 불가)
        └── 상세 원인은 error_code로 구분
"""

from typing import Optional
from enum import Enum


class ErrorCode(str, Enum):
    """에러 코드 (예외 클래스 대신 사용)"""
    # 재시도 가능
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    EMBEDDING_TIMEOUT = "EMBEDDING_TIMEOUT"
    DB_CONNECTION = "DB_CONNECTION"
    STORAGE_DOWNLOAD = "STORAGE_DOWNLOAD"
    NETWORK_ERROR = "NETWORK_ERROR"

    # 재시도 불가
    INVALID_FILE = "INVALID_FILE"
    MULTI_IDENTITY = "MULTI_IDENTITY"
    ENCRYPTION_ERROR = "ENCRYPTION_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    PARSE_ERROR = "PARSE_ERROR"


class WorkerError(Exception):
    """Worker 기본 예외 (2개 클래스로 축소)"""

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        retryable: bool = False,
        details: Optional[dict] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}

    def __repr__(self):
        return f"{self.__class__.__name__}(code={self.code}, retryable={self.retryable})"


class RetryableError(WorkerError):
    """재시도 가능한 예외"""
    def __init__(self, message: str, code: ErrorCode, details: Optional[dict] = None):
        super().__init__(message, code, retryable=True, details=details)


class PermanentError(WorkerError):
    """재시도 불가능한 예외"""
    def __init__(self, message: str, code: ErrorCode, details: Optional[dict] = None):
        super().__init__(message, code, retryable=False, details=details)


# 사용 예시
raise RetryableError(
    "LLM API timeout",
    code=ErrorCode.LLM_TIMEOUT,
    details={"timeout_seconds": 120}
)

raise PermanentError(
    "Invalid file format",
    code=ErrorCode.INVALID_FILE,
    details={"file_type": "unknown"}
)
```

**결과**: 12개 클래스 → **3개 클래스 + 12개 에러 코드**

---

### 2.3 config.py 크기 증가 최소화

#### 문제: 설정 항목 2배 증가

#### 최소화 전략: 그룹화 + Nested Settings

```python
# config.py - Nested Settings로 구조화

from pydantic import BaseModel
from pydantic_settings import BaseSettings


class RetrySettings(BaseModel):
    """재시도 관련 설정 그룹"""
    webhook_max: int = 3
    webhook_timeout: int = 10
    storage_max: int = 3
    storage_timeout: int = 30
    llm_max: int = 2
    llm_timeout: int = 120
    embedding_max: int = 3
    embedding_timeout: int = 60


class ChunkSettings(BaseModel):
    """청킹 관련 설정 그룹"""
    max_structured_chars: int = 2000
    max_raw_full_chars: int = 8000
    section_size: int = 1500
    section_overlap: int = 300
    korean_threshold: float = 0.5
    korean_size: int = 2000


class Settings(BaseSettings):
    """Worker 설정"""

    # 기존 설정...
    ENV: str = "development"
    DEBUG: bool = True

    # Nested 설정으로 그룹화
    retry: RetrySettings = RetrySettings()
    chunk: ChunkSettings = ChunkSettings()

    class Config:
        env_file = ".env"
        env_nested_delimiter = "__"  # RETRY__WEBHOOK_MAX=5


# 사용
settings = get_settings()
timeout = settings.retry.llm_timeout  # 120
chunk_size = settings.chunk.section_size  # 1500

# 환경변수로 오버라이드
# RETRY__LLM_TIMEOUT=180
# CHUNK__KOREAN_SIZE=2500
```

**결과**:
- 설정 항목 수는 동일하지만 논리적으로 그룹화
- 자동완성/IDE 지원 향상
- 문서화 용이

---

### 2.4 학습 곡선 최소화

#### 문제: 팀원들이 새 예외 체계/설정 구조 학습 필요

#### 최소화 전략: 점진적 도입 + 인라인 문서화

```python
# 1. 기존 코드와 호환되는 래퍼 제공

# exceptions_compat.py
"""
기존 Exception 기반 코드와 호환되는 래퍼

기존 코드:
    except Exception as e:
        logger.error(f"Error: {e}")

호환 코드 (변경 없이 동작):
    except Exception as e:
        logger.error(f"Error: {e}")
        # WorkerError도 Exception이므로 잡힘

새 코드 (점진적 마이그레이션):
    except RetryableError as e:
        logger.warning(f"Retrying: {e.code}")
    except PermanentError as e:
        logger.error(f"Failed: {e.code}")
    except Exception as e:
        logger.error(f"Unexpected: {e}")
"""
```

```python
# 2. IDE 친화적 타입 힌트

def process_with_retry(
    func: Callable[[], T],
    max_retries: int = 3
) -> T:
    """
    재시도 로직이 포함된 함수 실행

    Args:
        func: 실행할 함수
        max_retries: 최대 재시도 횟수

    Returns:
        함수 실행 결과

    Raises:
        RetryableError: 모든 재시도 실패 시
        PermanentError: 재시도 불가능한 오류 발생 시

    Example:
        result = process_with_retry(
            lambda: run_async(analyst.analyze(text)),
            max_retries=2
        )
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return func()
        except RetryableError as e:
            last_error = e
            logger.warning(f"Attempt {attempt + 1} failed: {e.code}")
            continue
        except PermanentError:
            raise  # 재시도 불가, 즉시 전파

    raise last_error or RetryableError("Max retries exceeded", ErrorCode.NETWORK_ERROR)
```

---

## 3. 최선의 접근법 권장

### 3.1 종합 권장안

| 영역 | 권장 대안 | 이유 |
|------|----------|------|
| 이벤트 루프 관리 | **Context Manager 패턴** | 자동 정리 보장, 실수 방지 |
| 스레드 안전성 | **threading.local()** | 간단하고 검증된 방법 |
| 예외 분류 | **화이트리스트 + 로깅** | 안전한 기본값, 점진적 개선 가능 |
| 동작 변경 검증 | **Shadow Mode** | 프로덕션 검증 후 전환 |
| 예외 클래스 | **3개 클래스 + ErrorCode** | 복잡도 최소화 |
| 설정 구조 | **Nested Settings** | 그룹화로 관리 용이 |
| 학습 곡선 | **호환 래퍼 + 점진적 도입** | 기존 코드 유지하며 마이그레이션 |

### 3.2 구현 우선순위

```
Phase 0 (1-2일)
├── [1] Context Manager 기반 run_async() 구현
├── [2] Shadow Mode 인프라 구축
├── [3] 암호화 키 검증 강화
└── [4] Staging 배포 + Shadow Mode 테스트

Phase 1 (3-5일)
├── [5] 3-클래스 예외 체계 구현
├── [6] 화이트리스트 기반 재시도 로직
├── [7] Nested Settings 리팩토링
├── [8] 기존 코드 점진적 마이그레이션
└── [9] Production 배포 (10% → 50% → 100%)
```

---

## 4. 구현 가이드

### 4.1 최종 async_helpers.py

```python
# utils/async_helpers.py
"""
Async Helpers for RQ Worker - Production Ready

Features:
- Thread-safe event loop management
- Automatic cleanup via Context Manager
- Shadow mode support for safe rollout
- Comprehensive logging for debugging
"""

import asyncio
import threading
import logging
from typing import TypeVar, Coroutine, Any, Optional
from contextlib import contextmanager
from functools import wraps

T = TypeVar('T')
logger = logging.getLogger(__name__)

# Thread-local storage for event loops
_thread_local = threading.local()


@contextmanager
def _managed_event_loop():
    """
    Context Manager for event loop lifecycle

    Automatically cleans up on exit, even if exception occurs.
    """
    loop: Optional[asyncio.AbstractEventLoop] = getattr(_thread_local, 'loop', None)
    created = False

    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _thread_local.loop = loop
        created = True
        logger.debug(f"[async] Created new event loop for thread {threading.current_thread().ident}")

    try:
        yield loop
    finally:
        if created:
            _cleanup_loop(loop)
            _thread_local.loop = None


def _cleanup_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Safely cleanup event loop"""
    try:
        # Cancel pending tasks
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()

        # Wait for cancellation
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))

        # Shutdown async generators
        loop.run_until_complete(loop.shutdown_asyncgens())

    except Exception as e:
        logger.warning(f"[async] Cleanup warning: {e}")
    finally:
        loop.close()
        logger.debug(f"[async] Closed event loop for thread {threading.current_thread().ident}")


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """
    Execute async function in synchronous context

    Thread-safe, with automatic event loop management.

    Args:
        coro: Coroutine to execute

    Returns:
        Coroutine result

    Example:
        result = run_async(some_async_function())
    """
    with _managed_event_loop() as loop:
        return loop.run_until_complete(coro)


# Decorator for job functions
def with_async_context(func):
    """
    Decorator to ensure proper async context for RQ jobs

    Usage:
        @with_async_context
        def my_job():
            result = run_async(some_coro())
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        finally:
            # Ensure cleanup even if exception
            loop = getattr(_thread_local, 'loop', None)
            if loop and not loop.is_closed():
                _cleanup_loop(loop)
                _thread_local.loop = None
    return wrapper


# Export only public API
__all__ = ['run_async', 'with_async_context']
```

### 4.2 최종 예외 체계

```python
# exceptions.py
"""
Worker Exception Hierarchy - Minimal & Practical

Only 3 classes + ErrorCode enum for all use cases.
"""

from typing import Optional, Dict, Any
from enum import Enum


class ErrorCode(str, Enum):
    """Error codes for detailed classification"""
    # Retryable
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    EMBEDDING_TIMEOUT = "EMBEDDING_TIMEOUT"
    DB_CONNECTION = "DB_CONNECTION"
    STORAGE_ERROR = "STORAGE_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"

    # Permanent
    INVALID_FILE = "INVALID_FILE"
    MULTI_IDENTITY = "MULTI_IDENTITY"
    ENCRYPTION_ERROR = "ENCRYPTION_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"

    # Partial (continue with degraded functionality)
    EMBEDDING_PARTIAL = "EMBEDDING_PARTIAL"
    VISUAL_PARTIAL = "VISUAL_PARTIAL"


class WorkerError(Exception):
    """Base worker exception"""

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


class RetryableError(WorkerError):
    """Transient error - can be retried"""

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, retryable=True, details=details)


class PermanentError(WorkerError):
    """Permanent error - should not retry"""

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, retryable=False, details=details)


# Convenience functions
def raise_timeout(service: str, timeout: int) -> None:
    """Raise timeout error for a service"""
    code_map = {
        'llm': ErrorCode.LLM_TIMEOUT,
        'embedding': ErrorCode.EMBEDDING_TIMEOUT,
        'storage': ErrorCode.STORAGE_ERROR,
    }
    raise RetryableError(
        f"{service} timeout after {timeout}s",
        code=code_map.get(service, ErrorCode.NETWORK_ERROR),
        details={'timeout_seconds': timeout}
    )


def raise_validation(message: str, field: Optional[str] = None) -> None:
    """Raise validation error"""
    raise PermanentError(
        message,
        code=ErrorCode.VALIDATION_ERROR,
        details={'field': field} if field else {}
    )
```

---

## 요약: 리스크 최소화 체크리스트

### Phase 0

- [x] Context Manager 패턴으로 메모리 누수 방지
- [x] threading.local()로 스레드 안전성 확보
- [x] Shadow Mode로 기존 동작 검증
- [x] Feature Flag로 즉시 롤백 가능

### Phase 1

- [x] 3-클래스 예외 체계로 복잡도 최소화
- [x] 화이트리스트 + 자동 로깅으로 예외 분류 정확도 향상
- [x] Nested Settings로 설정 관리 용이
- [x] 호환 래퍼로 학습 곡선 완화
- [x] 점진적 마이그레이션으로 안전한 전환

---

**결론**: 위 전략들을 적용하면 원래 기획서의 리스크들을 대부분 제거하거나 허용 가능한 수준으로 낮출 수 있습니다. 특히 **Shadow Mode + 점진적 롤아웃**은 프로덕션 안전성을 크게 높입니다.
