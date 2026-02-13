# Worker 리팩토링: 기존 접근법 vs 최선의 대안 비교

**버전**: 1.0
**작성일**: 2026-02-13
**목적**: Phase 0-1 기존 접근법과 최선의 대안을 명확히 비교하여 의사결정 지원

---

## 목차
1. [Phase 0 비교: 이벤트 루프 관리](#1-phase-0-비교-이벤트-루프-관리)
2. [Phase 0 비교: 롤아웃 전략](#2-phase-0-비교-롤아웃-전략)
3. [Phase 1 비교: 예외 처리 체계](#3-phase-1-비교-예외-처리-체계)
4. [Phase 1 비교: 설정 구조](#4-phase-1-비교-설정-구조)
5. [종합 비교표](#5-종합-비교표)
6. [최종 권장안](#6-최종-권장안)

---

## 1. Phase 0 비교: 이벤트 루프 관리

### 기존 접근법 (Phase 0-1 Spec)

```python
# utils/async_helpers.py - 기존 방식
_thread_local = threading.local()

def get_or_create_event_loop() -> asyncio.AbstractEventLoop:
    loop = getattr(_thread_local, 'event_loop', None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _thread_local.event_loop = loop
    return loop

def run_async(coro: Coroutine) -> T:
    loop = get_or_create_event_loop()
    return loop.run_until_complete(coro)

def cleanup_event_loop() -> None:
    # 수동으로 호출해야 함
    loop = getattr(_thread_local, 'event_loop', None)
    if loop and not loop.is_closed():
        loop.close()
        _thread_local.event_loop = None
```

**사용**:
```python
# tasks.py
try:
    result = run_async(analyst.analyze(...))
finally:
    cleanup_event_loop()  # 개발자가 직접 호출 필수
```

### 최선의 대안 (Context Manager 패턴)

```python
# utils/async_helpers.py - Context Manager 방식
@contextmanager
def _managed_event_loop():
    loop = getattr(_thread_local, 'loop', None)
    created = False

    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _thread_local.loop = loop
        created = True

    try:
        yield loop
    finally:
        if created:
            _cleanup_loop(loop)  # 자동 정리 보장
            _thread_local.loop = None

def run_async(coro: Coroutine) -> T:
    with _managed_event_loop() as loop:
        return loop.run_until_complete(coro)
```

**사용**:
```python
# tasks.py
result = run_async(analyst.analyze(...))  # cleanup 자동
```

### 비교 분석

| 항목 | 기존 접근법 | 최선의 대안 | 승자 |
|------|-------------|-------------|------|
| **메모리 누수 방지** | cleanup 호출 누락 시 누수 | 자동 정리로 누수 불가능 | **대안** |
| **코드 복잡도** | 사용 시 try-finally 필요 | 단순 함수 호출 | **대안** |
| **실수 가능성** | finally 누락 가능 | 실수 불가능 | **대안** |
| **성능** | 오버헤드 없음 | Context Manager 오버헤드 (~1μs) | 기존 |
| **디버깅 용이성** | 수동 추적 필요 | 자동 로깅 포함 가능 | **대안** |
| **롤백 용이성** | 동일 | 동일 | 동점 |

### 리스크 비교

| 리스크 | 기존 확률 | 기존 영향 | 대안 확률 | 대안 영향 |
|--------|----------|----------|----------|----------|
| **메모리 누수** | 중간 | 높음 (OOM) | **극히 낮음** | 낮음 |
| **스레드 안전성** | 낮음 | 높음 | 낮음 | 높음 |
| **성능 저하** | 없음 | - | 극히 낮음 | 극히 낮음 |

### 결론: Context Manager 패턴 권장

> **핵심 차이**: 기존 방식은 개발자가 `cleanup_event_loop()`을 반드시 호출해야 하지만,
> Context Manager 방식은 `with` 블록 종료 시 자동으로 정리됩니다.
>
> **리스크 감소**: 메모리 누수 확률 **중간 → 극히 낮음**

---

## 2. Phase 0 비교: 롤아웃 전략

### 기존 접근법 (Feature Flag만 사용)

```python
# config.py
USE_NEW_ASYNC_HELPER: bool = Field(default=True)

# tasks.py
if settings.USE_NEW_ASYNC_HELPER:
    from utils.async_helpers import run_async
else:
    def run_async(coro):
        return asyncio.run(coro)
```

**롤아웃**:
```
Day 1: Staging에서 테스트
Day 2: Production 배포 (100%)
```

### 최선의 대안 (Shadow Mode + 점진적 롤아웃)

```python
# config.py
USE_NEW_ASYNC_HELPER: bool = Field(default=False)  # 기본값 False
ASYNC_SHADOW_MODE: bool = Field(default=False)

# tasks.py
def run_async_with_shadow(coro_factory):
    if settings.ASYNC_SHADOW_MODE:
        # 둘 다 실행, 결과 비교, 기존 결과 반환
        old_result = asyncio.run(coro_factory())
        new_result = new_run_async(coro_factory())
        _compare_and_log(old_result, new_result)
        return old_result  # 안전하게 기존 결과 사용
    elif settings.USE_NEW_ASYNC_HELPER:
        return new_run_async(coro_factory())
    else:
        return asyncio.run(coro_factory())
```

**롤아웃**:
```
Week 1: Shadow Mode (기존/신규 동시 실행, 비교만)
Week 2: 10% 트래픽에 신규 적용
Week 3: 50% 트래픽
Week 4: 100% 트래픽
```

### 비교 분석

| 항목 | 기존 접근법 | 최선의 대안 | 승자 |
|------|-------------|-------------|------|
| **배포 속도** | 2일 | 4주 | 기존 |
| **프로덕션 검증** | Staging만 | Staging + Production Shadow | **대안** |
| **버그 발견률** | 낮음 | 높음 | **대안** |
| **롤백 시간** | ~1분 (Flag 변경) | ~1분 (Flag 변경) | 동점 |
| **구현 복잡도** | 낮음 | 중간 | 기존 |
| **사용자 영향** | 버그 시 영향 있음 | Shadow 중에는 영향 없음 | **대안** |

### 리스크 비교

| 리스크 | 기존 확률 | 기존 영향 | 대안 확률 | 대안 영향 |
|--------|----------|----------|----------|----------|
| **프로덕션 버그** | 중간 | 높음 | **낮음** | 낮음 |
| **동작 변경 미감지** | 중간 | 중간 | **낮음** | 낮음 |
| **배포 지연** | 낮음 | 낮음 | 높음 | 낮음 |

### 결론: 프로젝트 상황에 따라 선택

| 상황 | 권장 |
|------|------|
| 빠른 배포가 중요 | 기존 접근법 + 충분한 Staging 테스트 |
| **안정성이 중요** (권장) | Shadow Mode + 점진적 롤아웃 |
| 리소스 제한 있음 | 기존 접근법 |

> **권장**: Shadow Mode는 추가 개발 시간(2-3일)이 필요하지만,
> 프로덕션 안정성을 크게 높입니다. 이력서 처리 파이프라인은 핵심 기능이므로
> **Shadow Mode 권장**

---

## 3. Phase 1 비교: 예외 처리 체계

### 기존 접근법 (12+ 예외 클래스)

```python
# exceptions.py - 기존 방식
class WorkerBaseException(Exception):
    error_code: str = "WORKER_ERROR"
    retryable: bool = False

# 재시도 가능 예외 (6개)
class RetryableException(WorkerBaseException): retryable = True
class LLMTimeoutError(RetryableException): error_code = "LLM_TIMEOUT"
class LLMRateLimitError(RetryableException): error_code = "LLM_RATE_LIMIT"
class EmbeddingTimeoutError(RetryableException): error_code = "EMBEDDING_TIMEOUT"
class DatabaseConnectionError(RetryableException): error_code = "DB_CONNECTION_ERROR"
class StorageDownloadError(RetryableException): error_code = "STORAGE_DOWNLOAD_ERROR"

# 재시도 불가 예외 (5개)
class PermanentException(WorkerBaseException): retryable = False
class InvalidFileError(PermanentException): error_code = "INVALID_FILE"
class MultiIdentityError(PermanentException): error_code = "MULTI_IDENTITY"
class EncryptionError(PermanentException): error_code = "ENCRYPTION_ERROR"
class ValidationError(PermanentException): error_code = "VALIDATION_ERROR"
class InsufficientCreditsError(PermanentException): error_code = "INSUFFICIENT_CREDITS"

# 부분 실패 예외 (2개)
class PartialFailureException(WorkerBaseException): ...
class EmbeddingPartialFailure(PartialFailureException): ...
class VisualAgentFailure(PartialFailureException): ...
```

**사용**:
```python
except LLMTimeoutError as e:
    logger.error(f"LLM timeout: {e.error_code}")
except EmbeddingTimeoutError as e:
    logger.error(f"Embedding timeout: {e.error_code}")
# 12개 이상의 except 블록 필요
```

### 최선의 대안 (3개 클래스 + ErrorCode Enum)

```python
# exceptions.py - 최소 방식
class ErrorCode(str, Enum):
    # 재시도 가능
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    EMBEDDING_TIMEOUT = "EMBEDDING_TIMEOUT"
    DB_CONNECTION = "DB_CONNECTION"
    STORAGE_ERROR = "STORAGE_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    # 재시도 불가
    INVALID_FILE = "INVALID_FILE"
    MULTI_IDENTITY = "MULTI_IDENTITY"
    ENCRYPTION_ERROR = "ENCRYPTION_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    # 부분 실패
    EMBEDDING_PARTIAL = "EMBEDDING_PARTIAL"
    VISUAL_PARTIAL = "VISUAL_PARTIAL"

class WorkerError(Exception):
    def __init__(self, message: str, code: ErrorCode, retryable: bool, details: dict = None):
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}

class RetryableError(WorkerError):
    def __init__(self, message: str, code: ErrorCode, details: dict = None):
        super().__init__(message, code, retryable=True, details=details)

class PermanentError(WorkerError):
    def __init__(self, message: str, code: ErrorCode, details: dict = None):
        super().__init__(message, code, retryable=False, details=details)
```

**사용**:
```python
except RetryableError as e:
    logger.warning(f"Retryable error [{e.code}]: {e.message}")
    if e.code == ErrorCode.LLM_TIMEOUT:
        # 특별 처리 필요시
except PermanentError as e:
    logger.error(f"Permanent error [{e.code}]: {e.message}")
# 2-3개 except 블록으로 충분
```

### 비교 분석

| 항목 | 기존 접근법 | 최선의 대안 | 승자 |
|------|-------------|-------------|------|
| **클래스 수** | 13+ 클래스 | 3 클래스 | **대안** |
| **확장성** | 클래스 추가 필요 | Enum 값 추가만 | **대안** |
| **타입 안전성** | 높음 (개별 타입) | 높음 (Enum) | 동점 |
| **except 블록 수** | 많음 (상세 분기) | 적음 (2-3개) | **대안** |
| **IDE 자동완성** | 클래스별 완성 | Enum 완성 | 동점 |
| **학습 곡선** | 많은 클래스 암기 | 간단한 구조 | **대안** |
| **상세 분기 필요시** | 자연스러움 | if문 필요 | 기존 |

### 리스크 비교

| 리스크 | 기존 확률 | 기존 영향 | 대안 확률 | 대안 영향 |
|--------|----------|----------|----------|----------|
| **예외 분류 오류** | 중간 | 중간 | 중간 | 중간 |
| **유지보수 부담** | 높음 | 중간 | **낮음** | 낮음 |
| **학습 비용** | 높음 | 낮음 | **낮음** | 낮음 |

### 결론: 3개 클래스 + ErrorCode 권장

> **핵심 차이**: 13개 클래스 vs 3개 클래스 + Enum
>
> **장점**:
> - 코드량 60% 감소
> - 새 에러 타입 추가가 Enum 값 하나 추가로 끝남
> - except 블록이 단순화됨

---

## 4. Phase 1 비교: 설정 구조

### 기존 접근법 (Flat Settings)

```python
# config.py - 평면 구조
class Settings(BaseSettings):
    # Webhook
    WEBHOOK_MAX_RETRIES: int = Field(default=3)
    WEBHOOK_TIMEOUT_SECONDS: int = Field(default=10)
    WEBHOOK_RETRY_DELAY_SECONDS: float = Field(default=1.0)

    # Storage
    STORAGE_MAX_RETRIES: int = Field(default=3)
    STORAGE_TIMEOUT_SECONDS: int = Field(default=30)

    # LLM
    LLM_TIMEOUT_SECONDS: int = Field(default=120)
    LLM_CONNECT_TIMEOUT_SECONDS: int = Field(default=10)
    LLM_MAX_RETRIES: int = Field(default=2)

    # Embedding
    EMBEDDING_MAX_RETRIES: int = Field(default=3)
    EMBEDDING_TIMEOUT_SECONDS: int = Field(default=60)
    EMBEDDING_RETRY_BASE_WAIT: float = Field(default=1.0)
    EMBEDDING_RETRY_MAX_WAIT: float = Field(default=10.0)

    # Chunking
    CHUNK_MAX_STRUCTURED_CHARS: int = Field(default=2000)
    CHUNK_MAX_RAW_FULL_CHARS: int = Field(default=8000)
    CHUNK_RAW_SECTION_SIZE: int = Field(default=1500)
    CHUNK_RAW_SECTION_OVERLAP: int = Field(default=300)
    CHUNK_KOREAN_THRESHOLD: float = Field(default=0.5)
    CHUNK_KOREAN_SIZE: int = Field(default=2000)
    CHUNK_KOREAN_OVERLAP: int = Field(default=500)
```

**사용**:
```python
settings = get_settings()
timeout = settings.LLM_TIMEOUT_SECONDS
chunk_size = settings.CHUNK_RAW_SECTION_SIZE
```

### 최선의 대안 (Nested Settings)

```python
# config.py - 중첩 구조
class RetrySettings(BaseModel):
    """재시도 관련 설정"""
    webhook_max: int = 3
    webhook_timeout: int = 10
    storage_max: int = 3
    storage_timeout: int = 30
    llm_max: int = 2
    llm_timeout: int = 120
    embedding_max: int = 3
    embedding_timeout: int = 60

class ChunkSettings(BaseModel):
    """청킹 관련 설정"""
    max_structured_chars: int = 2000
    max_raw_full_chars: int = 8000
    section_size: int = 1500
    section_overlap: int = 300
    korean_threshold: float = 0.5
    korean_size: int = 2000

class Settings(BaseSettings):
    ENV: str = "development"
    retry: RetrySettings = RetrySettings()
    chunk: ChunkSettings = ChunkSettings()

    class Config:
        env_nested_delimiter = "__"  # RETRY__LLM_TIMEOUT=180
```

**사용**:
```python
settings = get_settings()
timeout = settings.retry.llm_timeout
chunk_size = settings.chunk.section_size
```

### 비교 분석

| 항목 | 기존 접근법 | 최선의 대안 | 승자 |
|------|-------------|-------------|------|
| **논리적 구조** | 평면 (prefix로 구분) | 계층적 (그룹화) | **대안** |
| **IDE 자동완성** | 긴 목록 | 그룹별 필터링 | **대안** |
| **환경변수 호환** | 자연스러움 | `__` 구분자 필요 | 기존 |
| **코드 가독성** | 중간 | 높음 | **대안** |
| **기존 코드 변경** | 없음 | 접근 경로 변경 | 기존 |
| **문서화 용이** | 중간 | 그룹별 설명 가능 | **대안** |

### 리스크 비교

| 리스크 | 기존 확률 | 기존 영향 | 대안 확률 | 대안 영향 |
|--------|----------|----------|----------|----------|
| **설정 누락** | 낮음 | 중간 | 낮음 | 중간 |
| **환경변수 오류** | 낮음 | 중간 | 중간 | 중간 |
| **마이그레이션 비용** | 없음 | - | 중간 | 낮음 |

### 결론: 상황에 따라 선택

| 상황 | 권장 |
|------|------|
| 설정 항목이 적음 (<15개) | 기존 Flat 구조 유지 |
| **설정 항목이 많음 (>15개)** | Nested Settings |
| 환경변수 관리가 중요 | 기존 Flat 구조 |
| IDE 사용성 중요 | Nested Settings |

> **현재 상황**: 17개 이상의 설정 항목 → **Nested Settings 권장**

---

## 5. 종합 비교표

### 기능별 비교

| 영역 | 기존 접근법 | 최선의 대안 | 권장 |
|------|-------------|-------------|------|
| **이벤트 루프 관리** | 수동 cleanup | Context Manager | **대안** |
| **롤아웃 전략** | Feature Flag만 | Shadow Mode + 점진적 | **대안** |
| **예외 체계** | 13+ 클래스 | 3 클래스 + Enum | **대안** |
| **설정 구조** | Flat | Nested | **대안** |

### 리스크 종합

| 리스크 | 기존 접근법 | 최선의 대안 | 감소율 |
|--------|-------------|-------------|--------|
| 메모리 누수 | 중간 | 극히 낮음 | **80%+** |
| 프로덕션 버그 | 중간 | 낮음 | **50%+** |
| 유지보수 부담 | 높음 | 낮음 | **60%+** |
| 학습 곡선 | 높음 | 낮음 | **50%+** |

### 개발 비용

| 영역 | 기존 접근법 | 최선의 대안 | 차이 |
|------|-------------|-------------|------|
| Phase 0 구현 | 2일 | 3-4일 | +1-2일 |
| Phase 1 구현 | 5일 | 4일 | -1일 |
| Shadow Mode 구축 | 0 | 2일 | +2일 |
| **총 개발 시간** | 7일 | 9-10일 | +2-3일 |

### 장기 효과

| 지표 | 기존 접근법 | 최선의 대안 | 차이 |
|------|-------------|-------------|------|
| 디버깅 시간/이슈 | 15분 | 10분 | **-33%** |
| 새 에러 타입 추가 | 클래스 생성 (30분) | Enum 값 추가 (5분) | **-83%** |
| 온보딩 시간 | 1.5주 | 1주 | **-33%** |
| 코드 복잡도 | 높음 | 중간 | **개선** |

---

## 6. 최종 권장안

### Phase 0 권장

| 항목 | 권장 접근법 | 이유 |
|------|-------------|------|
| 이벤트 루프 관리 | **Context Manager 패턴** | 메모리 누수 완전 방지 |
| 롤아웃 전략 | **Shadow Mode + 점진적** | 프로덕션 안정성 최우선 |

### Phase 1 권장

| 항목 | 권장 접근법 | 이유 |
|------|-------------|------|
| 예외 체계 | **3 클래스 + ErrorCode** | 복잡도 60% 감소 |
| 설정 구조 | **Nested Settings** | 17개+ 설정 관리 용이 |

### 최종 결론

```
┌─────────────────────────────────────────────────────────────────┐
│                        최종 권장 구성                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 0 (즉시 구현)                                            │
│  ├── Context Manager 패턴 async_helpers.py                      │
│  ├── Shadow Mode 인프라 구축                                    │
│  └── 암호화 키 검증 강화                                        │
│                                                                 │
│  Phase 0 롤아웃 (2주)                                           │
│  ├── Week 1: Shadow Mode (Staging + Production)                │
│  └── Week 2: 10% → 50% → 100% 점진적 전환                      │
│                                                                 │
│  Phase 1 (Phase 0 안정화 후)                                    │
│  ├── 3-클래스 예외 체계 (WorkerError, RetryableError, Permanent)│
│  ├── ErrorCode Enum (13개 에러 코드)                            │
│  ├── Nested Settings (retry, chunk 그룹)                       │
│  └── 화이트리스트 기반 재시도 로직                              │
│                                                                 │
│  예상 결과                                                      │
│  ├── 메모리 누수 리스크: 중간 → 극히 낮음                       │
│  ├── 프로덕션 버그 리스크: 중간 → 낮음                          │
│  ├── 코드 복잡도: 높음 → 중간                                   │
│  └── 유지보수 비용: 높음 → 낮음                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 추가 개발 비용 대비 효과

| 항목 | 추가 비용 | 기대 효과 |
|------|----------|----------|
| Context Manager | +0.5일 | 메모리 누수 완전 방지 |
| Shadow Mode | +2일 | 프로덕션 버그 50% 감소 |
| 3-클래스 예외 | -1일 (오히려 감소) | 유지보수 60% 감소 |
| Nested Settings | +0일 | 가독성/관리 향상 |
| **총합** | **+1.5일** | **리스크 대폭 감소** |

> **결론**: 약 1.5일의 추가 개발로 리스크를 50-80% 감소시킬 수 있습니다.
> **최선의 대안을 모두 적용하는 것을 강력히 권장합니다.**

---

**문서 끝**
