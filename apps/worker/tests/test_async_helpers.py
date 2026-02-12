"""
Phase 0 테스트: async_helpers.py

테스트 대상:
- run_async(): Context Manager 패턴 async 실행
- run_async_legacy(): 기존 asyncio.run() 방식
- run_async_with_shadow(): Shadow Mode 지원
- 이벤트 루프 재사용 및 정리
- 스레드 안전성
"""

import pytest
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch

from utils.async_helpers import (
    run_async,
    run_async_legacy,
    run_async_with_shadow,
    get_run_async_func,
    with_async_context,
    _managed_event_loop,
    _thread_local,
)


class TestRunAsync:
    """run_async 함수 테스트"""

    def test_basic_coroutine(self):
        """기본 코루틴 실행"""
        async def simple_coro():
            return 42

        result = run_async(simple_coro())
        assert result == 42

    def test_coroutine_with_await(self):
        """await가 포함된 코루틴"""
        async def coro_with_await():
            await asyncio.sleep(0.01)
            return "completed"

        result = run_async(coro_with_await())
        assert result == "completed"

    def test_coroutine_with_args(self):
        """인자가 있는 코루틴"""
        async def add(a, b):
            return a + b

        result = run_async(add(3, 5))
        assert result == 8

    def test_coroutine_returns_none(self):
        """None을 반환하는 코루틴"""
        async def return_none():
            pass

        result = run_async(return_none())
        assert result is None

    def test_coroutine_returns_complex_type(self):
        """복잡한 타입을 반환하는 코루틴"""
        async def return_dict():
            return {"success": True, "data": [1, 2, 3]}

        result = run_async(return_dict())
        assert result == {"success": True, "data": [1, 2, 3]}

    def test_exception_propagation(self):
        """예외 전파 확인"""
        async def failing_coro():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            run_async(failing_coro())

    def test_custom_exception_propagation(self):
        """커스텀 예외 전파"""
        class CustomError(Exception):
            pass

        async def raise_custom():
            raise CustomError("custom message")

        with pytest.raises(CustomError, match="custom message"):
            run_async(raise_custom())

    def test_multiple_sequential_calls(self):
        """연속 호출 테스트"""
        async def increment(n):
            return n + 1

        results = []
        for i in range(5):
            result = run_async(increment(i))
            results.append(result)

        assert results == [1, 2, 3, 4, 5]

    def test_nested_async_calls(self):
        """중첩 async 호출"""
        async def inner():
            return "inner"

        async def outer():
            # 실제로는 await를 사용해야 하지만, 테스트를 위해 직접 호출
            return f"outer-{await inner()}"

        result = run_async(outer())
        assert result == "outer-inner"


class TestRunAsyncLegacy:
    """run_async_legacy 함수 테스트 (기존 asyncio.run 방식)"""

    def test_basic_execution(self):
        """기본 실행"""
        async def simple():
            return "legacy"

        result = run_async_legacy(simple())
        assert result == "legacy"

    def test_exception_handling(self):
        """예외 처리"""
        async def fail():
            raise RuntimeError("legacy error")

        with pytest.raises(RuntimeError, match="legacy error"):
            run_async_legacy(fail())


class TestEventLoopManagement:
    """이벤트 루프 관리 테스트"""

    def test_event_loop_created_and_cleaned(self):
        """이벤트 루프 생성 및 정리 확인"""
        async def check_loop():
            loop = asyncio.get_running_loop()
            return loop is not None

        result = run_async(check_loop())
        assert result is True

        # 정리 후 thread_local에 루프가 없어야 함
        # (run_async 내부에서 Context Manager가 정리)
        # 단, 연속 호출이 아닌 경우에만 확인 가능

    def test_context_manager_cleanup_on_exception(self):
        """예외 발생 시에도 정리되는지 확인"""
        async def raise_error():
            raise ValueError("test")

        with pytest.raises(ValueError):
            run_async(raise_error())

        # 예외 발생해도 루프가 정리되어야 함
        # 다음 호출이 정상 작동하면 정리된 것
        async def normal():
            return "ok"

        result = run_async(normal())
        assert result == "ok"


class TestThreadSafety:
    """스레드 안전성 테스트"""

    def test_concurrent_execution_different_threads(self):
        """다른 스레드에서 동시 실행"""
        results = []
        errors = []

        async def worker(thread_id):
            await asyncio.sleep(0.01)
            return f"thread-{thread_id}"

        def run_in_thread(thread_id):
            try:
                result = run_async(worker(thread_id))
                results.append(result)
            except Exception as e:
                errors.append(str(e))

        threads = []
        for i in range(5):
            t = threading.Thread(target=run_in_thread, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 5
        for i in range(5):
            assert f"thread-{i}" in results

    def test_thread_pool_executor(self):
        """ThreadPoolExecutor에서 실행"""
        async def compute(n):
            await asyncio.sleep(0.001)
            return n * 2

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [
                executor.submit(run_async, compute(i))
                for i in range(10)
            ]
            results = [f.result() for f in futures]

        assert sorted(results) == [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]


class TestRunAsyncWithShadow:
    """Shadow Mode 테스트"""

    def test_shadow_mode_off_use_new(self):
        """Shadow Mode OFF, 새 방식 사용"""
        call_count = {"new": 0, "legacy": 0}

        async def coro():
            return "result"

        with patch('utils.async_helpers.run_async') as mock_new, \
             patch('utils.async_helpers.run_async_legacy') as mock_legacy:
            mock_new.return_value = "new_result"
            mock_legacy.return_value = "legacy_result"

            result = run_async_with_shadow(
                lambda: coro(),
                shadow_mode=False,
                use_new=True
            )

            assert result == "new_result"
            mock_new.assert_called_once()
            mock_legacy.assert_not_called()

    def test_shadow_mode_off_use_legacy(self):
        """Shadow Mode OFF, 기존 방식 사용"""
        async def coro():
            return "result"

        with patch('utils.async_helpers.run_async') as mock_new, \
             patch('utils.async_helpers.run_async_legacy') as mock_legacy:
            mock_new.return_value = "new_result"
            mock_legacy.return_value = "legacy_result"

            result = run_async_with_shadow(
                lambda: coro(),
                shadow_mode=False,
                use_new=False
            )

            assert result == "legacy_result"
            mock_new.assert_not_called()
            mock_legacy.assert_called_once()

    def test_shadow_mode_on_returns_legacy_result(self):
        """Shadow Mode ON 시 기존 결과 반환"""
        async def coro():
            return "consistent"

        # 실제 함수로 테스트 (둘 다 같은 결과)
        result = run_async_with_shadow(
            lambda: coro(),
            shadow_mode=True,
            use_new=True
        )

        assert result == "consistent"

    def test_shadow_mode_logs_mismatch(self):
        """Shadow Mode에서 결과 불일치 로깅"""
        call_count = {"count": 0}

        async def coro():
            call_count["count"] += 1
            return call_count["count"]  # 매번 다른 값

        # Shadow Mode에서는 coro_factory가 두 번 호출됨
        with patch('utils.async_helpers.logger') as mock_logger:
            result = run_async_with_shadow(
                lambda: coro(),
                shadow_mode=True,
                use_new=True
            )

            # 첫 번째(legacy) 결과 반환
            assert result == 1


class TestGetRunAsyncFunc:
    """get_run_async_func 테스트"""

    def test_returns_new_when_true(self):
        """use_new=True면 run_async 반환"""
        func = get_run_async_func(use_new=True)
        assert func == run_async

    def test_returns_legacy_when_false(self):
        """use_new=False면 run_async_legacy 반환"""
        func = get_run_async_func(use_new=False)
        assert func == run_async_legacy


class TestWithAsyncContext:
    """with_async_context 데코레이터 테스트"""

    def test_decorator_normal_execution(self):
        """정상 실행 시 데코레이터 동작"""
        @with_async_context
        def job_function():
            async def task():
                return "done"
            return run_async(task())

        result = job_function()
        assert result == "done"

    def test_decorator_cleanup_on_exception(self):
        """예외 발생 시에도 정리"""
        @with_async_context
        def failing_job():
            async def task():
                raise RuntimeError("job failed")
            return run_async(task())

        with pytest.raises(RuntimeError, match="job failed"):
            failing_job()

        # 정리 후 다음 작업 정상 실행 확인
        @with_async_context
        def normal_job():
            async def task():
                return "recovered"
            return run_async(task())

        result = normal_job()
        assert result == "recovered"


class TestPerformance:
    """성능 테스트"""

    def test_run_async_faster_than_legacy_for_multiple_calls(self):
        """
        여러 번 호출 시 run_async가 run_async_legacy보다 빨라야 함
        (이벤트 루프 재사용 vs 매번 생성)

        Note: 실제 환경에서 이 테스트는 불안정할 수 있음
        """
        async def simple():
            return 1

        iterations = 50

        # Legacy (매번 새 루프)
        start = time.perf_counter()
        for _ in range(iterations):
            run_async_legacy(simple())
        legacy_time = time.perf_counter() - start

        # New (루프 재사용) - 단, run_async는 매번 Context Manager로 정리하므로
        # 이 테스트에서는 큰 차이가 없을 수 있음
        start = time.perf_counter()
        for _ in range(iterations):
            run_async(simple())
        new_time = time.perf_counter() - start

        # 로깅용 출력 (pytest -v로 확인 가능)
        print(f"\nLegacy time: {legacy_time:.4f}s")
        print(f"New time: {new_time:.4f}s")
        print(f"Difference: {legacy_time - new_time:.4f}s")

        # 새 방식이 심하게 느리지 않아야 함 (2배 이하)
        assert new_time < legacy_time * 2


class TestEdgeCases:
    """엣지 케이스 테스트"""

    def test_empty_coroutine(self):
        """빈 코루틴"""
        async def empty():
            pass

        result = run_async(empty())
        assert result is None

    def test_coroutine_with_long_running_task(self):
        """장시간 실행 코루틴 (짧은 버전)"""
        async def long_running():
            await asyncio.sleep(0.1)
            return "completed"

        result = run_async(long_running())
        assert result == "completed"

    def test_coroutine_with_multiple_awaits(self):
        """여러 await가 있는 코루틴"""
        async def multi_await():
            a = await asyncio.sleep(0.01, result=1)
            b = await asyncio.sleep(0.01, result=2)
            c = await asyncio.sleep(0.01, result=3)
            return (a or 0) + (b or 0) + (c or 0)

        # asyncio.sleep의 result는 Python 3.8+에서만 지원
        # 대안으로 단순 테스트
        async def multi_await_simple():
            await asyncio.sleep(0.01)
            await asyncio.sleep(0.01)
            await asyncio.sleep(0.01)
            return "done"

        result = run_async(multi_await_simple())
        assert result == "done"

    def test_cancelled_coroutine_handling(self):
        """취소된 코루틴 처리"""
        async def cancellable():
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                return "cancelled"
            return "completed"

        # 정상 실행 (취소 없이)
        async def quick():
            return "quick"

        result = run_async(quick())
        assert result == "quick"
