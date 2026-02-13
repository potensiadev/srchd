"""
MetricsService 단위 테스트

Note: This test directly imports metrics_service module
to avoid importing heavy dependencies from services package.
"""

import pytest
import sys
import time
import importlib.util
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

# Load metrics_service directly without going through services package
spec = importlib.util.spec_from_file_location(
    "metrics_service",
    "D:\\srchd\\apps\\worker\\services\\metrics_service.py"
)
metrics_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics_module)

# Extract classes and functions
MetricsCollector = metrics_module.MetricsCollector
PipelineMetrics = metrics_module.PipelineMetrics
AggregatedMetrics = metrics_module.AggregatedMetrics
PipelineTimer = metrics_module.PipelineTimer
StageTimer = metrics_module.StageTimer
LLM_PRICING = metrics_module.LLM_PRICING

# For singleton test, we need access to the module
_metrics_module = metrics_module


class TestPipelineMetrics:
    """PipelineMetrics 테스트"""

    def test_basic_metrics(self):
        """기본 메트릭 생성"""
        metrics = PipelineMetrics(
            pipeline_id="test-123",
            job_id="job-456",
            user_id="user-789",
        )

        assert metrics.pipeline_id == "test-123"
        assert metrics.job_id == "job-456"
        assert metrics.success is False
        assert metrics.llm_calls == 0

    def test_metrics_to_dict(self):
        """메트릭 딕셔너리 변환"""
        metrics = PipelineMetrics(
            pipeline_id="test-123",
            job_id="job-456",
            user_id="user-789",
            success=True,
            total_duration_ms=1500,
            llm_calls=2,
            llm_cost_usd=0.05,
        )

        d = metrics.to_dict()
        assert d["pipeline_id"] == "test-123"
        assert d["success"] is True
        assert d["total_duration_ms"] == 1500
        assert d["llm_cost_usd"] == 0.05


class TestAggregatedMetrics:
    """AggregatedMetrics 테스트"""

    def test_empty_metrics(self):
        """빈 메트릭"""
        agg = AggregatedMetrics()

        assert agg.total_requests == 0
        assert agg.get_avg_duration_ms() == 0.0
        assert agg.get_success_rate() == 0.0

    def test_success_rate_calculation(self):
        """성공률 계산"""
        agg = AggregatedMetrics(
            total_requests=100,
            successful_requests=85,
            failed_requests=15,
        )

        assert agg.get_success_rate() == 0.85

    def test_avg_duration_calculation(self):
        """평균 처리 시간 계산"""
        agg = AggregatedMetrics(
            total_duration_sum_ms=5000,
            total_duration_count=10,
        )

        assert agg.get_avg_duration_ms() == 500.0

    def test_to_dict(self):
        """딕셔너리 변환"""
        agg = AggregatedMetrics(
            total_requests=50,
            successful_requests=45,
            failed_requests=5,
            llm_total_cost_usd=1.234567,
        )

        d = agg.to_dict()
        assert d["total_requests"] == 50
        assert d["success_rate"] == 90.0
        assert d["llm_total_cost_usd"] == 1.2346  # 반올림


class TestMetricsCollector:
    """MetricsCollector 테스트"""

    @pytest.fixture
    def collector(self):
        """테스트용 수집기"""
        return MetricsCollector(max_history=100)

    def test_start_and_complete_pipeline(self, collector):
        """파이프라인 시작 및 완료"""
        metrics = collector.start_pipeline(
            pipeline_id="pipe-1",
            job_id="job-1",
            user_id="user-1",
        )

        assert metrics.pipeline_id == "pipe-1"
        assert collector.get_active_count() == 1

        collector.complete_pipeline(
            pipeline_id="pipe-1",
            success=True,
            text_length=1000,
            chunk_count=5,
        )

        assert collector.get_active_count() == 0
        assert len(collector._metrics) == 1

    def test_record_stage(self, collector):
        """스테이지 기록"""
        collector.start_pipeline("pipe-1", "job-1", "user-1")
        collector.record_stage("pipe-1", "parsing", 150)
        collector.record_stage("pipe-1", "analysis", 500)

        # 완료 후 확인
        collector.complete_pipeline("pipe-1", success=True)

        recent = collector.get_recent(1)
        assert recent[0]["stage_durations"]["parsing"] == 150
        assert recent[0]["stage_durations"]["analysis"] == 500

    def test_record_llm_call(self, collector):
        """LLM 호출 기록"""
        collector.start_pipeline("pipe-1", "job-1", "user-1")

        collector.record_llm_call(
            pipeline_id="pipe-1",
            provider="openai",
            model="gpt-4o",
            tokens_input=1000,
            tokens_output=500,
        )

        collector.complete_pipeline("pipe-1", success=True)

        recent = collector.get_recent(1)
        assert recent[0]["llm_calls"] == 1
        assert recent[0]["llm_tokens_input"] == 1000
        assert recent[0]["llm_tokens_output"] == 500
        assert recent[0]["llm_cost_usd"] > 0

    def test_llm_cost_calculation(self, collector):
        """LLM 비용 계산"""
        # OpenAI GPT-4o: $2.50/1M input, $10.00/1M output
        cost = collector._calculate_llm_cost(
            provider="openai",
            model="gpt-4o",
            tokens_input=1_000_000,
            tokens_output=1_000_000,
        )

        # $2.50 + $10.00 = $12.50
        assert cost == 12.50

    def test_aggregated_metrics(self, collector):
        """집계 메트릭"""
        # 여러 파이프라인 실행
        for i in range(5):
            collector.start_pipeline(f"pipe-{i}", f"job-{i}", "user-1")
            collector.record_stage(f"pipe-{i}", "parsing", 100 + i * 10)
            collector.complete_pipeline(
                f"pipe-{i}",
                success=i < 4,  # 1개 실패
                text_length=1000,
            )

        agg = collector.get_aggregated(minutes=60)

        assert agg.total_requests == 5
        assert agg.successful_requests == 4
        assert agg.failed_requests == 1
        assert agg.get_success_rate() == 0.8

    def test_aggregated_by_pipeline_type(self, collector):
        """파이프라인 타입별 집계"""
        # legacy 파이프라인
        collector.start_pipeline("pipe-1", "job-1", "user-1", pipeline_type="legacy")
        collector.complete_pipeline("pipe-1", success=True)

        # new 파이프라인
        collector.start_pipeline("pipe-2", "job-2", "user-1", pipeline_type="new")
        collector.complete_pipeline("pipe-2", success=True)

        agg_all = collector.get_aggregated(minutes=60)
        assert agg_all.total_requests == 2
        assert agg_all.requests_by_pipeline_type["legacy"] == 1
        assert agg_all.requests_by_pipeline_type["new"] == 1

        # 필터링
        agg_new = collector.get_aggregated(minutes=60, pipeline_type="new")
        assert agg_new.total_requests == 1

    def test_max_history_limit(self, collector):
        """최대 히스토리 제한"""
        collector.max_history = 10

        # 15개 파이프라인 실행
        for i in range(15):
            collector.start_pipeline(f"pipe-{i}", f"job-{i}", "user-1")
            collector.complete_pipeline(f"pipe-{i}", success=True)

        # 최대 10개만 유지
        assert len(collector._metrics) == 10

    def test_health_status_healthy(self, collector):
        """헬스 상태 - 정상"""
        for i in range(10):
            collector.start_pipeline(f"pipe-{i}", f"job-{i}", "user-1")
            collector.complete_pipeline(f"pipe-{i}", success=True)

        health = collector.get_health_status()
        assert health["status"] == "healthy"
        assert health["error_rate"] == 0.0

    def test_health_status_degraded(self, collector):
        """헬스 상태 - 저하"""
        for i in range(10):
            collector.start_pipeline(f"pipe-{i}", f"job-{i}", "user-1")
            collector.complete_pipeline(f"pipe-{i}", success=i < 7)  # 30% 실패

        health = collector.get_health_status()
        assert health["status"] == "degraded"

    def test_health_status_unhealthy(self, collector):
        """헬스 상태 - 비정상"""
        for i in range(10):
            collector.start_pipeline(f"pipe-{i}", f"job-{i}", "user-1")
            collector.complete_pipeline(f"pipe-{i}", success=i < 3)  # 70% 실패

        health = collector.get_health_status()
        assert health["status"] == "unhealthy"


class TestPipelineTimer:
    """PipelineTimer 컨텍스트 매니저 테스트"""

    def test_timer_context_manager(self):
        """타이머 컨텍스트 매니저"""
        collector = MetricsCollector()

        with PipelineTimer(collector, "pipe-1", "job-1", "user-1") as timer:
            timer.record_stage("parsing", 100)
            timer.set_result(success=True, text_length=500)

        assert collector.get_active_count() == 0
        recent = collector.get_recent(1)
        assert recent[0]["success"] is True
        assert recent[0]["stage_durations"]["parsing"] == 100

    def test_timer_exception_handling(self):
        """타이머 예외 처리"""
        collector = MetricsCollector()

        try:
            with PipelineTimer(collector, "pipe-1", "job-1", "user-1") as timer:
                raise ValueError("Test error")
        except ValueError:
            pass

        recent = collector.get_recent(1)
        assert recent[0]["success"] is False
        assert recent[0]["error_code"] == "ValueError"


class TestStageTimer:
    """StageTimer 컨텍스트 매니저 테스트"""

    def test_stage_timer(self):
        """스테이지 타이머"""
        collector = MetricsCollector()

        with PipelineTimer(collector, "pipe-1", "job-1", "user-1") as timer:
            with StageTimer(timer, "parsing"):
                time.sleep(0.01)  # 10ms 대기

            timer.set_result(success=True)

        recent = collector.get_recent(1)
        # 최소 10ms 이상이어야 함
        assert recent[0]["stage_durations"]["parsing"] >= 10


class TestSingleton:
    """싱글톤 테스트"""

    def test_get_metrics_collector_singleton(self):
        """싱글톤 인스턴스"""
        _metrics_module._metrics_collector = None

        c1 = _metrics_module.get_metrics_collector()
        c2 = _metrics_module.get_metrics_collector()

        assert c1 is c2


class TestLLMPricing:
    """LLM 가격 테이블 테스트"""

    def test_openai_pricing(self):
        """OpenAI 가격"""
        assert "openai" in LLM_PRICING
        assert "gpt-4o" in LLM_PRICING["openai"]
        assert LLM_PRICING["openai"]["gpt-4o"]["input"] > 0

    def test_gemini_pricing(self):
        """Gemini 가격"""
        assert "gemini" in LLM_PRICING
        assert "gemini-1.5-pro" in LLM_PRICING["gemini"]

    def test_anthropic_pricing(self):
        """Anthropic 가격"""
        assert "anthropic" in LLM_PRICING
        assert "claude-3-5-sonnet" in LLM_PRICING["anthropic"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
