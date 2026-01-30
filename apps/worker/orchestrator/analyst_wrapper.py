"""
Analyst Agent Wrapper - PipelineContext 연동

기존 AnalystAgent를 PipelineContext와 연동하여
증거 추적, 제안/결정 패턴, 환각 탐지를 지원합니다.
"""

import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

from context import PipelineContext, Evidence
from agents.analyst_agent import (
    AnalystAgent,
    get_analyst_agent,
    AnalysisResult,
    Warning as AnalystWarning
)
from config import AnalysisMode
from services.llm_manager import LLMProvider
from .feature_flags import get_feature_flags

logger = logging.getLogger(__name__)


@dataclass
class AnalystWrapperResult:
    """래퍼 실행 결과"""
    success: bool
    confidence_score: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    processing_time_ms: int = 0
    error: Optional[str] = None

    # 추가 정보
    providers_used: List[str] = field(default_factory=list)
    evidence_count: int = 0
    proposal_count: int = 0


class AnalystAgentWrapper:
    """
    AnalystAgent 래퍼

    기존 AnalystAgent를 래핑하여 PipelineContext와 연동합니다.

    Features:
    - LLM 결과를 증거(Evidence)로 저장
    - 각 필드에 대해 제안(Proposal) 생성
    - 환각 탐지 지원
    - 에이전트 간 메시징 지원
    """

    def __init__(self):
        self.analyst = get_analyst_agent()
        self.feature_flags = get_feature_flags()

    async def analyze(
        self,
        ctx: PipelineContext,
        mode: str = "phase_1"
    ) -> AnalystWrapperResult:
        """
        PipelineContext를 사용하여 이력서 분석

        Args:
            ctx: PipelineContext 인스턴스
            mode: 분석 모드 ("phase_1" or "phase_2")

        Returns:
            AnalystWrapperResult with analysis results
        """
        # 마스킹된 텍스트 사용 (PII 보호)
        text = ctx.get_text_for_llm()
        filename = ctx.raw_input.filename

        analysis_mode = AnalysisMode.PHASE_2 if mode == "phase_2" else AnalysisMode.PHASE_1

        logger.info(f"[AnalystWrapper] Starting analysis: mode={mode}, text_length={len(text)}")

        # 기존 AnalystAgent 호출
        result = await self.analyst.analyze(
            resume_text=text,
            mode=analysis_mode,
            filename=filename
        )

        if not result.success or not result.data:
            return AnalystWrapperResult(
                success=False,
                error=result.error or "분석 실패",
                processing_time_ms=result.processing_time_ms
            )

        # LLM 사용량 기록
        ctx.record_llm_call("analysis", result.processing_time_ms // 100)

        # 결과를 PipelineContext에 반영
        evidence_count = 0
        proposal_count = 0

        # 증거 및 제안 추가
        if self.feature_flags.use_evidence_tracking:
            evidence_count = self._add_evidences(ctx, result)

        proposal_count = self._add_proposals(ctx, result)

        # 경고 변환
        self._process_warnings(ctx, result.warnings)

        # 환각 탐지 (선택적)
        if self.feature_flags.use_hallucination_detection:
            self._detect_hallucinations(ctx, result.data)

        logger.info(
            f"[AnalystWrapper] Analysis complete: confidence={result.confidence_score:.2f}, "
            f"evidences={evidence_count}, proposals={proposal_count}"
        )

        return AnalystWrapperResult(
            success=True,
            confidence_score=result.confidence_score,
            field_confidence=result.field_confidence,
            warnings=[w.message for w in result.warnings],
            processing_time_ms=result.processing_time_ms,
            providers_used=self._get_providers_used(analysis_mode),
            evidence_count=evidence_count,
            proposal_count=proposal_count
        )

    def _add_evidences(self, ctx: PipelineContext, result: AnalysisResult) -> int:
        """분석 결과를 증거로 저장"""
        count = 0
        data = result.data
        field_confidence = result.field_confidence

        # 단순 필드
        simple_fields = [
            "exp_years", "current_company", "current_position",
            "last_company", "last_position", "summary",
            "match_reason", "github_url", "linkedin_url", "portfolio_url"
        ]

        for field_name in simple_fields:
            value = data.get(field_name)
            if value is not None:
                confidence = field_confidence.get(field_name, 0.7)

                ctx.add_evidence(
                    field_name=field_name,
                    value=value,
                    llm_provider="analyst_agent",
                    confidence=confidence,
                    reasoning=f"LLM 분석 결과 (confidence: {confidence:.2f})",
                    source_text=""  # 원본 텍스트 위치는 나중에 추가
                )
                count += 1

        # 배열 필드
        array_fields = ["skills", "strengths"]
        for field_name in array_fields:
            values = data.get(field_name, [])
            if values:
                confidence = field_confidence.get(field_name, 0.7)
                ctx.add_evidence(
                    field_name=field_name,
                    value=values,
                    llm_provider="analyst_agent",
                    confidence=confidence,
                    reasoning=f"LLM 분석 결과 ({len(values)}개 항목)"
                )
                count += 1

        return count

    def _add_proposals(self, ctx: PipelineContext, result: AnalysisResult) -> int:
        """분석 결과를 제안으로 변환"""
        count = 0
        data = result.data
        field_confidence = result.field_confidence

        # 모든 필드에 대해 제안 생성
        fields_to_propose = [
            # 단순 필드
            "exp_years", "current_company", "current_position",
            "last_company", "last_position", "summary", "match_reason",
            "github_url", "linkedin_url", "portfolio_url",
            # 배열 필드
            "careers", "educations", "skills", "certifications", "projects",
            "strengths"
        ]

        for field_name in fields_to_propose:
            value = data.get(field_name)
            if value is not None and value != "" and value != []:
                confidence = field_confidence.get(field_name, 0.7)

                # 배열 필드는 길이 정보 포함
                if isinstance(value, list):
                    reasoning = f"LLM 분석 결과 ({len(value)}개 항목)"
                else:
                    reasoning = "LLM 분석 결과"

                ctx.propose(
                    agent_name="analyst_agent",
                    field_name=field_name,
                    value=value,
                    confidence=confidence,
                    reasoning=reasoning
                )
                count += 1

        return count

    def _process_warnings(self, ctx: PipelineContext, warnings: List[AnalystWarning]):
        """경고를 PipelineContext 형식으로 변환"""
        for warning in warnings:
            severity_map = {
                "high": "error",
                "medium": "warning",
                "low": "info",
                "info": "info"
            }

            ctx.warning_collector.add(
                code=warning.type.upper(),
                message=warning.message,
                severity=severity_map.get(warning.severity, "warning"),
                field_name=warning.field if warning.field != "all" else None,
                stage_name="analysis"
            )

    def _detect_hallucinations(self, ctx: PipelineContext, data: Dict[str, Any]):
        """환각 탐지 수행"""
        # 검증할 필드
        fields_to_verify = ["exp_years", "current_company", "current_position"]

        for field_name in fields_to_verify:
            value = data.get(field_name)
            if value:
                is_valid = ctx.verify_hallucination(field_name, value, "analyst_agent")
                if not is_valid:
                    logger.warning(
                        f"[AnalystWrapper] Hallucination detected: {field_name}={value}"
                    )

    def _get_providers_used(self, mode: AnalysisMode) -> List[str]:
        """사용된 LLM 제공자 목록"""
        available = self.analyst.llm_manager.get_available_providers()

        if mode == AnalysisMode.PHASE_1:
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI]
        else:
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI, LLMProvider.CLAUDE]

        return [p.value for p in required if p in available]


class AnalystAgentContextAdapter:
    """
    AnalystAgent를 위한 컨텍스트 어댑터

    기존 AnalystAgent 코드를 수정하지 않고
    PipelineContext와 연동하는 어댑터입니다.
    """

    def __init__(self, ctx: PipelineContext):
        self.ctx = ctx
        self.analyst = get_analyst_agent()
        self.feature_flags = get_feature_flags()

    def on_llm_response(
        self,
        provider: str,
        field_name: str,
        value: Any,
        confidence: float,
        reasoning: str = ""
    ):
        """
        LLM 응답 콜백

        AnalystAgent가 LLM 응답을 받을 때 호출되어
        증거와 제안을 자동으로 추가합니다.
        """
        # 증거 추가
        if self.feature_flags.use_evidence_tracking:
            self.ctx.add_evidence(
                field_name=field_name,
                value=value,
                llm_provider=provider,
                confidence=confidence,
                reasoning=reasoning
            )

        # 제안 추가
        self.ctx.propose(
            agent_name=f"analyst_{provider}",
            field_name=field_name,
            value=value,
            confidence=confidence,
            reasoning=reasoning
        )

    def on_cross_check_complete(
        self,
        field_name: str,
        final_value: Any,
        providers_agreed: List[str],
        providers_disagreed: List[str]
    ):
        """
        교차 검증 완료 콜백

        여러 LLM의 결과가 비교된 후 호출됩니다.
        """
        if providers_disagreed:
            # 불일치 발생 - 경고 추가
            self.ctx.warning_collector.add_llm_disagreement(
                field_name,
                providers_disagreed
            )

            # 환각 탐지
            if self.feature_flags.use_hallucination_detection:
                # 소수 의견을 환각으로 기록
                all_results = {}
                for provider in providers_agreed:
                    all_results[provider] = final_value
                # 불일치 제공자의 값은 알 수 없으므로 스킵

                self.ctx.cross_validate_llm_results(field_name, all_results)

    def on_analysis_complete(self, result: AnalysisResult):
        """
        분석 완료 콜백

        전체 분석이 완료된 후 호출됩니다.
        """
        if not result.success:
            return

        # 모든 결정 수행
        self.ctx.decide_all()

        # 메시지 버스로 다른 에이전트에 알림 (선택적)
        if self.feature_flags.use_agent_messaging:
            self.ctx.send_message(
                from_agent="analyst_agent",
                to_agent="validation_agent",
                subject="분석 완료",
                payload={
                    "confidence_score": result.confidence_score,
                    "field_count": len(result.data) if result.data else 0,
                    "warning_count": len(result.warnings)
                },
                message_type="notification"
            )


# 싱글톤 인스턴스
_wrapper: Optional[AnalystAgentWrapper] = None


def get_analyst_wrapper() -> AnalystAgentWrapper:
    """AnalystAgentWrapper 싱글톤 인스턴스 반환"""
    global _wrapper
    if _wrapper is None:
        _wrapper = AnalystAgentWrapper()
    return _wrapper
