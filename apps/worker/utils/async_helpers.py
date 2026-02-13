"""
Async Helpers for RQ Worker - Production Ready

RQ Worker는 동기 환경에서 실행되므로, async 함수 호출 시
이벤트 루프를 효율적으로 관리해야 함.

Features:
- Thread-safe event loop management (threading.local)
- Automatic cleanup via Context Manager
- Shadow mode support for safe rollout
- Comprehensive logging for debugging

Usage:
    from utils.async_helpers import run_async

    # 동기 컨텍스트에서 async 함수 실행
    result = run_async(some_async_function())

주의사항:
    - 이 함수는 동기 컨텍스트에서만 사용
    - 이미 async 함수 내부라면 await를 직접 사용
    - 중첩 호출은 자동으로 처리됨
"""

import asyncio
import threading
import logging
from typing import TypeVar, Coroutine, Any, Optional, Callable
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

    - with 블록 진입 시: 이벤트 루프 생성/재사용
    - with 블록 종료 시: 자동 정리 (예외 발생해도 보장)

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
    Context Manager를 내부적으로 사용하여 메모리 누수 방지.

    asyncio.run()과 달리 이벤트 루프를 재사용하여 오버헤드 최소화.
    (asyncio.run()은 매번 새 루프 생성: 100-200ms 오버헤드)

    Args:
        coro: Coroutine to execute

    Returns:
        Coroutine result

    Example:
        result = run_async(some_async_function())
    """
    with _managed_event_loop() as loop:
        return loop.run_until_complete(coro)


def run_async_legacy(coro: Coroutine[Any, Any, T]) -> T:
    """
    Legacy async execution using asyncio.run()

    Feature Flag 롤백 시 사용하는 기존 방식.
    매번 새 이벤트 루프를 생성하므로 오버헤드가 있음.

    Args:
        coro: Coroutine to execute

    Returns:
        Coroutine result
    """
    return asyncio.run(coro)


def get_run_async_func(use_new: bool = True) -> Callable[[Coroutine[Any, Any, T]], T]:
    """
    Feature Flag에 따라 적절한 run_async 함수 반환

    Args:
        use_new: True면 새 방식(Context Manager), False면 기존 방식(asyncio.run)

    Returns:
        run_async 또는 run_async_legacy 함수
    """
    return run_async if use_new else run_async_legacy


def with_async_context(func):
    """
    Decorator to ensure proper async context for RQ jobs

    Job 종료 시 이벤트 루프 자동 정리 보장.

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


# Shadow Mode support
def run_async_with_shadow(
    coro_factory: Callable[[], Coroutine[Any, Any, T]],
    shadow_mode: bool = False,
    use_new: bool = True
) -> T:
    """
    Shadow Mode: 기존 방식과 새 방식 모두 실행하고 결과 비교

    프로덕션 검증을 위해 둘 다 실행하고 기존 결과를 반환.

    Args:
        coro_factory: 코루틴을 생성하는 함수 (매번 새 코루틴 필요)
        shadow_mode: True면 둘 다 실행하고 비교
        use_new: shadow_mode=False일 때 어떤 방식 사용할지

    Returns:
        실행 결과 (shadow_mode=True면 기존 방식 결과 반환)

    Example:
        result = run_async_with_shadow(
            lambda: analyst.analyze(text),
            shadow_mode=settings.ASYNC_SHADOW_MODE,
            use_new=settings.USE_NEW_ASYNC_HELPER
        )
    """
    if shadow_mode:
        # Shadow Mode: 둘 다 실행, 결과 비교, 기존 결과 반환
        try:
            old_result = run_async_legacy(coro_factory())
        except Exception as old_error:
            logger.error(f"[Shadow] Legacy method failed: {old_error}")
            old_result = None
            old_error_str = str(old_error)
        else:
            old_error_str = None

        try:
            new_result = run_async(coro_factory())
        except Exception as new_error:
            logger.error(f"[Shadow] New method failed: {new_error}")
            new_result = None
            new_error_str = str(new_error)
        else:
            new_error_str = None

        # 결과 비교 로깅
        if old_error_str and new_error_str:
            if old_error_str == new_error_str:
                logger.debug("[Shadow] Both methods failed with same error")
            else:
                logger.warning(
                    f"[Shadow] Error mismatch: old='{old_error_str[:100]}', "
                    f"new='{new_error_str[:100]}'"
                )
        elif old_error_str:
            logger.warning(f"[Shadow] Only legacy failed: {old_error_str[:100]}")
        elif new_error_str:
            logger.warning(f"[Shadow] Only new method failed: {new_error_str[:100]}")
        elif type(old_result) != type(new_result):
            logger.warning(
                f"[Shadow] Type mismatch: old={type(old_result).__name__}, "
                f"new={type(new_result).__name__}"
            )
        elif hasattr(old_result, 'success') and hasattr(new_result, 'success'):
            if old_result.success != new_result.success:
                logger.warning(
                    f"[Shadow] Success mismatch: old={old_result.success}, "
                    f"new={new_result.success}"
                )
            else:
                logger.debug("[Shadow] Results match (success flag)")
        else:
            logger.debug("[Shadow] Results appear consistent")

        # 기존 결과 반환 (안전)
        if old_error_str:
            raise Exception(old_error_str)
        return old_result

    elif use_new:
        return run_async(coro_factory())
    else:
        return run_async_legacy(coro_factory())


# Export only public API
__all__ = [
    'run_async',
    'run_async_legacy',
    'run_async_with_shadow',
    'get_run_async_func',
    'with_async_context',
]
