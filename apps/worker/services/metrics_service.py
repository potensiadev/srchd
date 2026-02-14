"""
Metrics Service - 파이프라인 성능 및 비용 메트릭 수집

파이프라인 실행 성능, LLM 호출 비용, 에러율 등을 수집하고 추적합니다.
"""

import logging
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import threading

logger = logging.getLogger(__name__)


class MetricType(Enum):
    """메트릭 타입"""
    COUNTER = "counter"         # 증가만 가능 (요청 수, 에러 수)
    GAUGE = "gauge"             # 현재 값 (활성 작업 수)
    HISTOGRAM = "histogram"     # 분포 (처리 시간)
    TIMER = "timer"             # 시간 측정


@dataclass
class PipelineMetrics:
    """단일 파이프라인 실행 메트릭"""
    pipeline_id: str
    job_id: str
    user_id: str

    # 타이밍
    start_time: float = 0.0
    end_time: float = 0.0
    total_duration_ms: int = 0

    # 스테이지별 타이밍
    stage_durations: Dict[str, int] = field(default_factory=dict)

    # LLM 호출
    llm_calls: int = 0
    llm_tokens_input: int = 0
    llm_tokens_output: int = 0
    llm_cost_usd: float = 0.0
    llm_providers_used: List[str] = field(default_factory=list)

    # 결과
    success: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    # 처리 통계
    text_length: int = 0
    chunk_count: int = 0
    pii_count: int = 0
    confidence_score: float = 0.0

    # 파이프라인 타입
    pipeline_type: str = "legacy"  # "legacy" or "new"
    is_retry: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pipeline_id": self.pipeline_id,
            "job_id": self.job_id,
            "user_id": self.user_id,
            "total_duration_ms": self.total_duration_ms,
            "stage_durations": self.stage_durations,
            "llm_calls": self.llm_calls,
            "llm_tokens_input": self.llm_tokens_input,
            "llm_tokens_output": self.llm_tokens_output,
            "llm_cost_usd": self.llm_cost_usd,
            "llm_providers_used": self.llm_providers_used,
            "success": self.success,
            "error_code": self.error_code,
            "text_length": self.text_length,
            "chunk_count": self.chunk_count,
            "pii_count": self.pii_count,
            "confidence_score": self.confidence_score,
            "pipeline_type": self.pipeline_type,
            "is_retry": self.is_retry,
        }


@dataclass
class AggregatedMetrics:
    """집계된 메트릭"""
    # 카운터
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0

    # 에러별 카운트
    errors_by_code: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # 처리 시간 통계
    total_duration_sum_ms: int = 0
    total_duration_count: int = 0
    total_duration_min_ms: int = 0
    total_duration_max_ms: int = 0

    # 스테이지별 처리 시간
    stage_duration_sums: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    stage_duration_counts: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # LLM 비용
    llm_total_calls: int = 0
    llm_total_tokens_input: int = 0
    llm_total_tokens_output: int = 0
    llm_total_cost_usd: float = 0.0
    llm_calls_by_provider: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # 파이프라인 타입별
    requests_by_pipeline_type: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # 시간 범위
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None

    def get_avg_duration_ms(self) -> float:
        if self.total_duration_count == 0:
            return 0.0
        return self.total_duration_sum_ms / self.total_duration_count

    def get_success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.successful_requests / self.total_requests

    def get_stage_avg_duration(self, stage: str) -> float:
        count = self.stage_duration_counts.get(stage, 0)
        if count == 0:
            return 0.0
        return self.stage_duration_sums.get(stage, 0) / count

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": round(self.get_success_rate() * 100, 2),
            "avg_duration_ms": round(self.get_avg_duration_ms(), 2),
            "min_duration_ms": self.total_duration_min_ms,
            "max_duration_ms": self.total_duration_max_ms,
            "errors_by_code": dict(self.errors_by_code),
            "stage_avg_durations": {
                stage: round(self.get_stage_avg_duration(stage), 2)
                for stage in self.stage_duration_sums.keys()
            },
            "llm_total_calls": self.llm_total_calls,
            "llm_total_tokens_input": self.llm_total_tokens_input,
            "llm_total_tokens_output": self.llm_total_tokens_output,
            "llm_total_cost_usd": round(self.llm_total_cost_usd, 4),
            "llm_calls_by_provider": dict(self.llm_calls_by_provider),
            "requests_by_pipeline_type": dict(self.requests_by_pipeline_type),
            "period_start": self.period_start.isoformat() if self.period_start else None,
            "period_end": self.period_end.isoformat() if self.period_end else None,
        }


# T3-2: LLM 비용 테이블 (USD per 1M tokens)
# 2026-02 기준 가격. 정기적으로 업데이트 필요.
LLM_PRICING = {
    "openai": {
        # GPT-4o 시리즈
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
        # GPT-4.5 (2026)
        "gpt-4.5": {"input": 75.00, "output": 150.00},
    },
    "gemini": {
        # Gemini 1.5 시리즈
        "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
        # Gemini 2.0 시리즈
        "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
        "gemini-2.0-pro": {"input": 1.25, "output": 5.00},
        # Gemini 3.0 시리즈 (2026)
        "gemini-3-pro": {"input": 1.25, "output": 5.00},
        "gemini-3-pro-preview": {"input": 1.25, "output": 5.00},
    },
    "anthropic": {
        # Claude 3 시리즈
        "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
        "claude-3-opus": {"input": 15.00, "output": 75.00},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        # Claude 4 시리즈 (2026)
        "claude-sonnet-4": {"input": 3.00, "output": 15.00},
        "claude-opus-4": {"input": 15.00, "output": 75.00},
    },
}


class MetricsCollector:
    """
    메트릭 수집기

    파이프라인 실행 메트릭을 수집하고 집계합니다.
    인메모리 저장소를 사용하며, 필요 시 외부 저장소로 확장 가능합니다.
    """

    def __init__(self, max_history: int = 1000):
        """
        Args:
            max_history: 보관할 최대 메트릭 수
        """
        self.max_history = max_history
        self._metrics: List[PipelineMetrics] = []
        self._lock = threading.Lock()

        # 현재 진행 중인 파이프라인
        self._active_pipelines: Dict[str, PipelineMetrics] = {}

        # 집계 캐시 (1분 TTL)
        self._aggregated_cache: Optional[AggregatedMetrics] = None
        self._cache_time: Optional[float] = None
        self._cache_ttl = 60.0  # 1분

    def start_pipeline(
        self,
        pipeline_id: str,
        job_id: str,
        user_id: str,
        pipeline_type: str = "legacy",
        is_retry: bool = False,
    ) -> PipelineMetrics:
        """파이프라인 시작 기록"""
        metrics = PipelineMetrics(
            pipeline_id=pipeline_id,
            job_id=job_id,
            user_id=user_id,
            start_time=time.time(),
            pipeline_type=pipeline_type,
            is_retry=is_retry,
        )

        with self._lock:
            self._active_pipelines[pipeline_id] = metrics

        logger.debug(f"[Metrics] Pipeline started: {pipeline_id}")
        return metrics

    def record_stage(
        self,
        pipeline_id: str,
        stage_name: str,
        duration_ms: int,
    ):
        """스테이지 완료 기록"""
        with self._lock:
            if pipeline_id in self._active_pipelines:
                self._active_pipelines[pipeline_id].stage_durations[stage_name] = duration_ms

    def record_llm_call(
        self,
        pipeline_id: str,
        provider: str,
        model: str,
        tokens_input: int,
        tokens_output: int,
    ):
        """LLM 호출 기록"""
        # 비용 계산
        cost = self._calculate_llm_cost(provider, model, tokens_input, tokens_output)

        with self._lock:
            if pipeline_id in self._active_pipelines:
                metrics = self._active_pipelines[pipeline_id]
                metrics.llm_calls += 1
                metrics.llm_tokens_input += tokens_input
                metrics.llm_tokens_output += tokens_output
                metrics.llm_cost_usd += cost
                if provider not in metrics.llm_providers_used:
                    metrics.llm_providers_used.append(provider)

    def _calculate_llm_cost(
        self,
        provider: str,
        model: str,
        tokens_input: int,
        tokens_output: int,
    ) -> float:
        """LLM 비용 계산"""
        provider_pricing = LLM_PRICING.get(provider.lower(), {})

        # 모델명 매칭 (부분 매칭 지원)
        model_pricing = None
        for model_name, pricing in provider_pricing.items():
            if model_name in model.lower() or model.lower() in model_name:
                model_pricing = pricing
                break

        if not model_pricing:
            # 기본값: OpenAI GPT-4o 기준
            model_pricing = {"input": 2.50, "output": 10.00}

        # 비용 계산 (per 1M tokens)
        input_cost = (tokens_input / 1_000_000) * model_pricing["input"]
        output_cost = (tokens_output / 1_000_000) * model_pricing["output"]

        return input_cost + output_cost

    def complete_pipeline(
        self,
        pipeline_id: str,
        success: bool,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        text_length: int = 0,
        chunk_count: int = 0,
        pii_count: int = 0,
        confidence_score: float = 0.0,
    ):
        """파이프라인 완료 기록"""
        with self._lock:
            if pipeline_id not in self._active_pipelines:
                logger.warning(f"[Metrics] Unknown pipeline: {pipeline_id}")
                return

            metrics = self._active_pipelines.pop(pipeline_id)
            metrics.end_time = time.time()
            metrics.total_duration_ms = int((metrics.end_time - metrics.start_time) * 1000)
            metrics.success = success
            metrics.error_code = error_code
            metrics.error_message = error_message
            metrics.text_length = text_length
            metrics.chunk_count = chunk_count
            metrics.pii_count = pii_count
            metrics.confidence_score = confidence_score

            # 히스토리에 추가
            self._metrics.append(metrics)

            # 최대 수 초과 시 오래된 것 제거
            if len(self._metrics) > self.max_history:
                self._metrics = self._metrics[-self.max_history:]

            # 캐시 무효화
            self._aggregated_cache = None

        logger.debug(
            f"[Metrics] Pipeline completed: {pipeline_id}, "
            f"success={success}, duration={metrics.total_duration_ms}ms"
        )

    def get_aggregated(
        self,
        minutes: int = 60,
        pipeline_type: Optional[str] = None,
    ) -> AggregatedMetrics:
        """집계된 메트릭 조회"""
        # 캐시 확인
        if (
            self._aggregated_cache is not None
            and self._cache_time is not None
            and time.time() - self._cache_time < self._cache_ttl
            and pipeline_type is None  # 필터 없을 때만 캐시 사용
        ):
            return self._aggregated_cache

        cutoff = datetime.now() - timedelta(minutes=minutes)
        cutoff_timestamp = cutoff.timestamp()

        aggregated = AggregatedMetrics(
            period_start=cutoff,
            period_end=datetime.now(),
        )

        with self._lock:
            for metrics in self._metrics:
                # 시간 필터
                if metrics.start_time < cutoff_timestamp:
                    continue

                # 파이프라인 타입 필터
                if pipeline_type and metrics.pipeline_type != pipeline_type:
                    continue

                # 카운터
                aggregated.total_requests += 1
                if metrics.success:
                    aggregated.successful_requests += 1
                else:
                    aggregated.failed_requests += 1
                    if metrics.error_code:
                        aggregated.errors_by_code[metrics.error_code] += 1

                # 처리 시간
                aggregated.total_duration_sum_ms += metrics.total_duration_ms
                aggregated.total_duration_count += 1

                if aggregated.total_duration_min_ms == 0:
                    aggregated.total_duration_min_ms = metrics.total_duration_ms
                else:
                    aggregated.total_duration_min_ms = min(
                        aggregated.total_duration_min_ms,
                        metrics.total_duration_ms
                    )
                aggregated.total_duration_max_ms = max(
                    aggregated.total_duration_max_ms,
                    metrics.total_duration_ms
                )

                # 스테이지별 처리 시간
                for stage, duration in metrics.stage_durations.items():
                    aggregated.stage_duration_sums[stage] += duration
                    aggregated.stage_duration_counts[stage] += 1

                # LLM 비용
                aggregated.llm_total_calls += metrics.llm_calls
                aggregated.llm_total_tokens_input += metrics.llm_tokens_input
                aggregated.llm_total_tokens_output += metrics.llm_tokens_output
                aggregated.llm_total_cost_usd += metrics.llm_cost_usd

                for provider in metrics.llm_providers_used:
                    aggregated.llm_calls_by_provider[provider] += 1

                # 파이프라인 타입별
                aggregated.requests_by_pipeline_type[metrics.pipeline_type] += 1

        # 캐시 저장 (필터 없을 때만)
        if pipeline_type is None:
            self._aggregated_cache = aggregated
            self._cache_time = time.time()

        return aggregated

    def get_recent(self, count: int = 10) -> List[Dict[str, Any]]:
        """최근 메트릭 조회"""
        with self._lock:
            recent = self._metrics[-count:]
            return [m.to_dict() for m in reversed(recent)]

    def get_active_count(self) -> int:
        """현재 진행 중인 파이프라인 수"""
        with self._lock:
            return len(self._active_pipelines)

    def get_health_status(self) -> Dict[str, Any]:
        """헬스 상태 반환"""
        aggregated = self.get_aggregated(minutes=5)  # 최근 5분

        # 에러율 계산
        error_rate = 0.0
        if aggregated.total_requests > 0:
            error_rate = aggregated.failed_requests / aggregated.total_requests

        # 상태 결정
        status = "healthy"
        if error_rate > 0.5:
            status = "unhealthy"
        elif error_rate > 0.1:
            status = "degraded"

        return {
            "status": status,
            "error_rate": round(error_rate * 100, 2),
            "avg_duration_ms": round(aggregated.get_avg_duration_ms(), 2),
            "active_pipelines": self.get_active_count(),
            "total_requests_5min": aggregated.total_requests,
        }


# 싱글톤 인스턴스
_metrics_collector: Optional[MetricsCollector] = None


def get_metrics_collector() -> MetricsCollector:
    """MetricsCollector 싱글톤 인스턴스 반환"""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector


class PipelineTimer:
    """
    파이프라인 타이머 컨텍스트 매니저

    사용 예:
        with PipelineTimer(collector, pipeline_id, job_id, user_id) as timer:
            # 파이프라인 실행
            timer.record_stage("parsing", 150)
            timer.record_llm_call("openai", "gpt-4o", 1000, 500)
            ...
    """

    def __init__(
        self,
        collector: MetricsCollector,
        pipeline_id: str,
        job_id: str,
        user_id: str,
        pipeline_type: str = "legacy",
        is_retry: bool = False,
    ):
        self.collector = collector
        self.pipeline_id = pipeline_id
        self.job_id = job_id
        self.user_id = user_id
        self.pipeline_type = pipeline_type
        self.is_retry = is_retry
        self.metrics: Optional[PipelineMetrics] = None

        # 결과 저장용
        self.success = False
        self.error_code: Optional[str] = None
        self.error_message: Optional[str] = None
        self.text_length = 0
        self.chunk_count = 0
        self.pii_count = 0
        self.confidence_score = 0.0

    def __enter__(self) -> "PipelineTimer":
        self.metrics = self.collector.start_pipeline(
            pipeline_id=self.pipeline_id,
            job_id=self.job_id,
            user_id=self.user_id,
            pipeline_type=self.pipeline_type,
            is_retry=self.is_retry,
        )
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.success = False
            self.error_code = exc_type.__name__
            self.error_message = str(exc_val)

        self.collector.complete_pipeline(
            pipeline_id=self.pipeline_id,
            success=self.success,
            error_code=self.error_code,
            error_message=self.error_message,
            text_length=self.text_length,
            chunk_count=self.chunk_count,
            pii_count=self.pii_count,
            confidence_score=self.confidence_score,
        )
        return False  # 예외 전파

    def record_stage(self, stage_name: str, duration_ms: int):
        """스테이지 완료 기록"""
        self.collector.record_stage(self.pipeline_id, stage_name, duration_ms)

    def record_llm_call(
        self,
        provider: str,
        model: str,
        tokens_input: int,
        tokens_output: int,
    ):
        """LLM 호출 기록"""
        self.collector.record_llm_call(
            self.pipeline_id, provider, model, tokens_input, tokens_output
        )

    def set_result(
        self,
        success: bool,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        text_length: int = 0,
        chunk_count: int = 0,
        pii_count: int = 0,
        confidence_score: float = 0.0,
    ):
        """결과 설정"""
        self.success = success
        self.error_code = error_code
        self.error_message = error_message
        self.text_length = text_length
        self.chunk_count = chunk_count
        self.pii_count = pii_count
        self.confidence_score = confidence_score


class StageTimer:
    """
    스테이지 타이머 컨텍스트 매니저

    사용 예:
        with StageTimer(timer, "parsing") as stage:
            # 파싱 실행
            pass
    """

    def __init__(self, pipeline_timer: PipelineTimer, stage_name: str):
        self.pipeline_timer = pipeline_timer
        self.stage_name = stage_name
        self.start_time: float = 0.0

    def __enter__(self) -> "StageTimer":
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.time() - self.start_time) * 1000)
        self.pipeline_timer.record_stage(self.stage_name, duration_ms)
        return False
