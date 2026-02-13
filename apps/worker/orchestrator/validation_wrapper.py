"""
Validation Agent Wrapper - PipelineContext 연동 및 LLM 기반 검증

기존 ValidationAgent를 래핑하여:
- PII 필드는 regex 기반 검증 유지
- 복잡한 필드는 LLM 기반 검증 추가
- PipelineContext와 연동하여 증거 추적 및 환각 탐지 지원
"""

import json
import logging
import asyncio
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from context import PipelineContext, Evidence
from agents.validation_agent import (
    ValidationAgent,
    get_validation_agent,
    ValidationResult
)
from services.llm_manager import LLMManager, get_llm_manager, LLMProvider, LLMResponse
from .feature_flags import get_feature_flags

logger = logging.getLogger(__name__)


# LLM 검증용 프롬프트 템플릿
VALIDATION_SYSTEM_PROMPT = """당신은 이력서 데이터 검증 전문가입니다.
주어진 이력서 텍스트와 추출된 데이터를 비교하여 정확성을 검증합니다.

검증 시 다음 사항을 확인하세요:
1. 추출된 데이터가 원본 텍스트에 존재하는지 확인
2. 데이터 간 일관성 확인 (예: 경력 연수와 경력 목록)
3. 형식 및 범위 유효성 확인

응답은 반드시 JSON 형식으로 해주세요."""

VALIDATION_USER_PROMPT_TEMPLATE = """다음 이력서 텍스트와 추출된 데이터를 검증해주세요.

## 원본 텍스트 (일부):
{text_excerpt}

## 검증할 데이터:
{field_name}: {field_value}

## 검증 요청:
1. 이 데이터가 원본 텍스트에서 추론 가능한지 확인
2. 데이터의 정확성 평가 (0.0 ~ 1.0)
3. 문제가 있다면 수정 제안

JSON 응답 형식:
{{
    "is_valid": true/false,
    "confidence": 0.0~1.0,
    "found_in_text": true/false,
    "reasoning": "검증 이유",
    "suggested_correction": null 또는 "수정값",
    "issues": ["문제1", "문제2"]
}}"""


@dataclass
class LLMValidationResult:
    """LLM 검증 결과"""
    field_name: str
    is_valid: bool
    confidence: float
    found_in_text: bool
    reasoning: str
    suggested_correction: Optional[Any] = None
    issues: List[str] = field(default_factory=list)
    llm_provider: str = ""
    processing_time_ms: int = 0


@dataclass
class ValidationWrapperResult:
    """래퍼 검증 결과"""
    success: bool
    validated_data: Dict[str, Any]
    confidence_adjustments: Dict[str, float] = field(default_factory=dict)

    # 기존 ValidationAgent 결과
    regex_validations: List[Dict[str, Any]] = field(default_factory=list)
    regex_corrections: List[Dict[str, Any]] = field(default_factory=list)

    # LLM 검증 결과
    llm_validations: List[LLMValidationResult] = field(default_factory=list)
    llm_corrections: List[Dict[str, Any]] = field(default_factory=list)

    # 메타데이터
    processing_time_ms: int = 0
    error: Optional[str] = None
    providers_used: List[str] = field(default_factory=list)


class ValidationAgentWrapper:
    """
    ValidationAgent 래퍼

    기존 regex 기반 ValidationAgent를 래핑하고
    LLM 기반 검증을 추가합니다.

    Features:
    - PII 필드(name, phone, email)는 regex 검증 유지
    - 복잡한 필드는 LLM 기반 검증 추가
    - PipelineContext 연동으로 증거 추적
    - 환각 탐지 지원
    """

    # LLM 검증 대상 필드
    LLM_VALIDATION_FIELDS = [
        "exp_years",
        "current_company",
        "current_position",
        "careers",
        "skills",
        "summary",
        "match_reason",
    ]

    # PII 필드 (regex만 사용)
    PII_FIELDS = ["name", "phone", "email"]

    def __init__(self):
        self.validator = get_validation_agent()
        self.llm_manager = get_llm_manager()
        self.feature_flags = get_feature_flags()

    async def validate(
        self,
        ctx: PipelineContext,
        analyzed_data: Dict[str, Any],
    ) -> ValidationWrapperResult:
        """
        PipelineContext를 사용하여 데이터 검증

        Args:
            ctx: PipelineContext 인스턴스
            analyzed_data: AnalystAgent에서 추출한 데이터

        Returns:
            ValidationWrapperResult with validation results
        """
        start_time = datetime.now()

        # 원본 텍스트 (마스킹되지 않은 것 사용 - 검증 목적)
        original_text = ctx.parsed_data.raw_text or ""
        filename = ctx.raw_input.filename

        logger.info(f"[ValidationWrapper] Starting validation: fields={len(analyzed_data)}")

        # 1. 기존 regex 기반 검증 (PII 포함)
        regex_result = self.validator.validate(
            analyzed_data=analyzed_data,
            original_text=original_text,
            filename=filename
        )

        validated_data = regex_result.validated_data.copy()
        confidence_adjustments = regex_result.confidence_adjustments.copy()

        # regex 검증 결과를 PipelineContext에 반영
        self._apply_regex_validations(ctx, regex_result)

        # 2. LLM 기반 검증 (feature flag로 제어)
        llm_validations = []
        llm_corrections = []
        providers_used = []

        if self.feature_flags.use_llm_validation:
            llm_validations, llm_corrections, providers_used = await self._run_llm_validations(
                ctx=ctx,
                analyzed_data=analyzed_data,
                original_text=original_text
            )

            # LLM 검증 결과 적용
            for validation in llm_validations:
                if not validation.is_valid and validation.suggested_correction is not None:
                    validated_data[validation.field_name] = validation.suggested_correction

                # 신뢰도 조정
                if validation.is_valid:
                    confidence_adjustments[validation.field_name] = (
                        confidence_adjustments.get(validation.field_name, 0) +
                        validation.confidence * 0.1
                    )
                else:
                    confidence_adjustments[validation.field_name] = (
                        confidence_adjustments.get(validation.field_name, 0) - 0.1
                    )

        # 3. 환각 탐지 (feature flag로 제어)
        if self.feature_flags.use_hallucination_detection:
            self._detect_hallucinations(ctx, validated_data)

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        logger.info(
            f"[ValidationWrapper] Validation complete: "
            f"regex_corrections={len(regex_result.corrections)}, "
            f"llm_validations={len(llm_validations)}, "
            f"time={processing_time}ms"
        )

        return ValidationWrapperResult(
            success=True,
            validated_data=validated_data,
            confidence_adjustments=confidence_adjustments,
            regex_validations=regex_result.validations,
            regex_corrections=regex_result.corrections,
            llm_validations=llm_validations,
            llm_corrections=llm_corrections,
            processing_time_ms=processing_time,
            providers_used=providers_used
        )

    def _apply_regex_validations(
        self,
        ctx: PipelineContext,
        result: ValidationResult
    ):
        """regex 검증 결과를 PipelineContext에 반영"""
        for validation in result.validations:
            field_name = validation.get("field")
            field_result = validation.get("result", {})

            if field_result.get("valid"):
                # 유효한 필드에 대해 제안 추가
                value = field_result.get("value")
                confidence_boost = field_result.get("confidence_boost", 0)

                if value is not None:
                    ctx.propose(
                        agent_name="validation_regex",
                        field_name=field_name,
                        value=value,
                        confidence=0.7 + confidence_boost,
                        reasoning=f"Regex 검증 통과: {field_result.get('reason', '')}"
                    )

        # 보정된 필드에 대한 경고
        for correction in result.corrections:
            ctx.warning_collector.add(
                code="VALIDATION_CORRECTION",
                message=f"{correction['field']} 보정: {correction['reason']}",
                severity="info",
                field_name=correction["field"],
                stage_name="validation"
            )

    async def _run_llm_validations(
        self,
        ctx: PipelineContext,
        analyzed_data: Dict[str, Any],
        original_text: str
    ) -> Tuple[List[LLMValidationResult], List[Dict[str, Any]], List[str]]:
        """LLM 기반 검증 실행"""
        validations = []
        corrections = []
        providers_used = set()

        # 검증할 필드 필터링
        fields_to_validate = [
            (field, analyzed_data.get(field))
            for field in self.LLM_VALIDATION_FIELDS
            if field in analyzed_data and analyzed_data.get(field) is not None
        ]

        if not fields_to_validate:
            logger.info("[ValidationWrapper] No fields to validate with LLM")
            return validations, corrections, []

        # 사용 가능한 프로바이더 확인
        available_providers = self.llm_manager.get_available_providers()
        if not available_providers:
            logger.warning("[ValidationWrapper] No LLM providers available")
            return validations, corrections, []

        # 검증 작업 병렬 실행
        tasks = []
        for field_name, field_value in fields_to_validate:
            tasks.append(
                self._validate_field_with_llm(
                    ctx=ctx,
                    field_name=field_name,
                    field_value=field_value,
                    original_text=original_text,
                    provider=available_providers[0]  # 첫 번째 사용 가능한 프로바이더
                )
            )

        # 병렬 실행
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.error(f"[ValidationWrapper] LLM validation error: {result}")
                continue

            if result:
                validations.append(result)
                providers_used.add(result.llm_provider)

                # 수정 필요한 경우
                if not result.is_valid and result.suggested_correction is not None:
                    corrections.append({
                        "field": result.field_name,
                        "original": analyzed_data.get(result.field_name),
                        "corrected": result.suggested_correction,
                        "reason": result.reasoning,
                        "llm_provider": result.llm_provider
                    })

                # PipelineContext에 증거 추가
                if self.feature_flags.use_evidence_tracking:
                    ctx.add_evidence(
                        field_name=result.field_name,
                        value=result.suggested_correction or analyzed_data.get(result.field_name),
                        llm_provider=result.llm_provider,
                        confidence=result.confidence,
                        reasoning=result.reasoning
                    )

        return validations, corrections, list(providers_used)

    async def _validate_field_with_llm(
        self,
        ctx: PipelineContext,
        field_name: str,
        field_value: Any,
        original_text: str,
        provider: LLMProvider
    ) -> Optional[LLMValidationResult]:
        """개별 필드 LLM 검증"""
        start_time = datetime.now()

        # 텍스트 발췌 (너무 긴 경우 제한)
        text_excerpt = original_text[:2000] if len(original_text) > 2000 else original_text

        # 필드 값 직렬화
        if isinstance(field_value, (list, dict)):
            field_value_str = json.dumps(field_value, ensure_ascii=False, indent=2)
        else:
            field_value_str = str(field_value)

        # 프롬프트 생성
        user_prompt = VALIDATION_USER_PROMPT_TEMPLATE.format(
            text_excerpt=text_excerpt,
            field_name=field_name,
            field_value=field_value_str
        )

        messages = [
            {"role": "system", "content": VALIDATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        try:
            # LLM 호출
            response = await self.llm_manager.call_json(
                provider=provider,
                messages=messages,
                temperature=0.1,
                max_tokens=1024
            )

            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            ctx.record_llm_call("validation", processing_time // 100)

            if not response.success or not response.content:
                logger.warning(
                    f"[ValidationWrapper] LLM validation failed for {field_name}: {response.error}"
                )
                return None

            content = response.content

            return LLMValidationResult(
                field_name=field_name,
                is_valid=content.get("is_valid", True),
                confidence=content.get("confidence", 0.5),
                found_in_text=content.get("found_in_text", False),
                reasoning=content.get("reasoning", ""),
                suggested_correction=content.get("suggested_correction"),
                issues=content.get("issues", []),
                llm_provider=provider.value,
                processing_time_ms=processing_time
            )

        except Exception as e:
            logger.error(f"[ValidationWrapper] LLM validation error for {field_name}: {e}")
            return None

    def _detect_hallucinations(
        self,
        ctx: PipelineContext,
        validated_data: Dict[str, Any]
    ):
        """환각 탐지 수행"""
        # 검증할 필드
        fields_to_verify = ["exp_years", "current_company", "current_position"]

        for field_name in fields_to_verify:
            value = validated_data.get(field_name)
            if value is not None:
                is_valid = ctx.verify_hallucination(field_name, value, "validation_agent")

                if not is_valid:
                    logger.warning(
                        f"[ValidationWrapper] Potential hallucination: {field_name}={value}"
                    )
                    ctx.warning_collector.add(
                        code="HALLUCINATION_DETECTED",
                        message=f"'{field_name}' 값이 원본 텍스트에서 확인되지 않음",
                        severity="warning",
                        field_name=field_name,
                        stage_name="validation"
                    )


@dataclass
class ProviderValidationResult:
    """개별 프로바이더의 검증 결과"""
    provider: str
    success: bool
    is_valid: bool = False
    confidence: float = 0.0
    reasoning: str = ""
    suggested_value: Optional[Any] = None
    found_in_text: bool = False
    error: Optional[str] = None
    processing_time_ms: int = 0


@dataclass
class CrossValidationResult:
    """교차 검증 최종 결과"""
    success: bool
    field_name: str
    final_value: Any
    is_valid: bool
    consensus_reached: bool
    consensus_type: str  # "unanimous", "majority", "weighted", "fallback"
    agreement_rate: float
    weighted_confidence: float
    providers_used: List[str] = field(default_factory=list)
    providers_agreed: List[str] = field(default_factory=list)
    providers_disagreed: List[str] = field(default_factory=list)
    individual_results: List[ProviderValidationResult] = field(default_factory=list)
    hallucination_detected: bool = False
    hallucination_details: Optional[str] = None
    error: Optional[str] = None
    processing_time_ms: int = 0


class CrossValidationEngine:
    """
    교차 검증 엔진

    여러 LLM의 결과를 비교하여 일관성을 확인합니다.

    Features:
    - 여러 LLM 프로바이더에 동시에 검증 요청 (asyncio.gather)
    - 응답 비교 및 합의(consensus) 로직 - confidence 기반 가중 투표
    - 불일치 시 처리 로직
    - 환각 탐지 통합
    """

    # 프로바이더별 기본 가중치 (신뢰도 점수)
    PROVIDER_WEIGHTS = {
        "openai": 1.0,
        "claude": 1.0,
        "gemini": 0.9,
    }

    # 합의 임계값
    CONSENSUS_THRESHOLD = 0.6  # 60% 이상 동의 시 합의
    HIGH_CONFIDENCE_THRESHOLD = 0.8  # 높은 신뢰도 기준
    MIN_WEIGHTED_CONFIDENCE = 0.5  # 최소 가중 신뢰도

    def __init__(self):
        self.llm_manager = get_llm_manager()
        self.feature_flags = get_feature_flags()

    async def cross_validate(
        self,
        ctx: PipelineContext,
        field_name: str,
        field_value: Any,
        original_text: str,
        min_providers: int = 2
    ) -> CrossValidationResult:
        """
        여러 LLM으로 교차 검증

        Args:
            ctx: PipelineContext
            field_name: 검증할 필드명
            field_value: 검증할 값
            original_text: 원본 텍스트
            min_providers: 최소 사용할 프로바이더 수

        Returns:
            CrossValidationResult with detailed validation results
        """
        start_time = datetime.now()
        available_providers = self.llm_manager.get_available_providers()

        logger.info(
            f"[CrossValidation] Starting cross-validation for {field_name}, "
            f"available providers: {[p.value for p in available_providers]}"
        )

        # 프로바이더 부족 시 처리
        if len(available_providers) < min_providers:
            logger.warning(
                f"[CrossValidation] Not enough providers: {len(available_providers)} < {min_providers}"
            )

            # 단일 프로바이더라도 사용 가능하면 진행
            if len(available_providers) == 1:
                return await self._single_provider_validation(
                    ctx, field_name, field_value, original_text, available_providers[0]
                )

            return CrossValidationResult(
                success=False,
                field_name=field_name,
                final_value=field_value,
                is_valid=False,
                consensus_reached=False,
                consensus_type="none",
                agreement_rate=0.0,
                weighted_confidence=0.0,
                error="Not enough LLM providers available"
            )

        # 모든 프로바이더에 동시에 검증 요청
        provider_results = await self._parallel_validate(
            providers=available_providers,
            field_name=field_name,
            field_value=field_value,
            original_text=original_text
        )

        # 성공한 결과만 필터링
        valid_results = [r for r in provider_results if r.success]

        if not valid_results:
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            return CrossValidationResult(
                success=False,
                field_name=field_name,
                final_value=field_value,
                is_valid=False,
                consensus_reached=False,
                consensus_type="none",
                agreement_rate=0.0,
                weighted_confidence=0.0,
                individual_results=provider_results,
                error="All providers failed",
                processing_time_ms=processing_time
            )

        # 최소 프로바이더 수 체크
        if len(valid_results) < min_providers:
            logger.warning(
                f"[CrossValidation] Only {len(valid_results)} providers succeeded, "
                f"needed {min_providers}"
            )

        # 합의(consensus) 분석
        consensus_result = self._analyze_consensus(valid_results, field_value)

        # 환각 탐지 통합
        hallucination_result = await self._check_hallucination(
            ctx, field_name, field_value, valid_results, original_text
        )

        # PipelineContext에 교차 검증 결과 기록
        self._record_to_context(ctx, field_name, valid_results, consensus_result)

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        # 최종 결과 결정
        final_value = consensus_result.get("final_value", field_value)
        is_valid = consensus_result.get("is_valid", False) and not hallucination_result.get("detected", False)

        result = CrossValidationResult(
            success=True,
            field_name=field_name,
            final_value=final_value,
            is_valid=is_valid,
            consensus_reached=consensus_result.get("consensus_reached", False),
            consensus_type=consensus_result.get("consensus_type", "none"),
            agreement_rate=consensus_result.get("agreement_rate", 0.0),
            weighted_confidence=consensus_result.get("weighted_confidence", 0.0),
            providers_used=[r.provider for r in valid_results],
            providers_agreed=consensus_result.get("providers_agreed", []),
            providers_disagreed=consensus_result.get("providers_disagreed", []),
            individual_results=provider_results,
            hallucination_detected=hallucination_result.get("detected", False),
            hallucination_details=hallucination_result.get("details"),
            processing_time_ms=processing_time
        )

        logger.info(
            f"[CrossValidation] Completed: {field_name}, "
            f"valid={is_valid}, consensus={result.consensus_type}, "
            f"confidence={result.weighted_confidence:.2f}, "
            f"time={processing_time}ms"
        )

        return result

    async def cross_validate_multiple_fields(
        self,
        ctx: PipelineContext,
        fields: Dict[str, Any],
        original_text: str,
        min_providers: int = 2
    ) -> Dict[str, CrossValidationResult]:
        """
        여러 필드를 동시에 교차 검증

        Args:
            ctx: PipelineContext
            fields: 검증할 필드 딕셔너리 {field_name: field_value}
            original_text: 원본 텍스트
            min_providers: 최소 사용할 프로바이더 수

        Returns:
            필드별 CrossValidationResult 딕셔너리
        """
        tasks = []
        field_names = []

        for field_name, field_value in fields.items():
            if field_value is not None:
                tasks.append(
                    self.cross_validate(
                        ctx=ctx,
                        field_name=field_name,
                        field_value=field_value,
                        original_text=original_text,
                        min_providers=min_providers
                    )
                )
                field_names.append(field_name)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        return_dict = {}
        for i, result in enumerate(results):
            field_name = field_names[i]
            if isinstance(result, Exception):
                logger.error(f"[CrossValidation] Error validating {field_name}: {result}")
                return_dict[field_name] = CrossValidationResult(
                    success=False,
                    field_name=field_name,
                    final_value=fields[field_name],
                    is_valid=False,
                    consensus_reached=False,
                    consensus_type="error",
                    agreement_rate=0.0,
                    weighted_confidence=0.0,
                    error=str(result)
                )
            else:
                return_dict[field_name] = result

        return return_dict

    async def _parallel_validate(
        self,
        providers: List[LLMProvider],
        field_name: str,
        field_value: Any,
        original_text: str
    ) -> List[ProviderValidationResult]:
        """모든 프로바이더에 동시에 검증 요청"""
        tasks = []
        for provider in providers:
            tasks.append(
                self._validate_with_provider(
                    provider=provider,
                    field_name=field_name,
                    field_value=field_value,
                    original_text=original_text
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        provider_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                provider_results.append(ProviderValidationResult(
                    provider=providers[i].value,
                    success=False,
                    error=str(result)
                ))
            else:
                provider_results.append(result)

        return provider_results

    async def _validate_with_provider(
        self,
        provider: LLMProvider,
        field_name: str,
        field_value: Any,
        original_text: str
    ) -> ProviderValidationResult:
        """개별 프로바이더로 검증"""
        start_time = datetime.now()
        text_excerpt = original_text[:2000] if len(original_text) > 2000 else original_text

        if isinstance(field_value, (list, dict)):
            field_value_str = json.dumps(field_value, ensure_ascii=False, indent=2)
        else:
            field_value_str = str(field_value)

        system_prompt = """당신은 이력서 데이터 검증 전문가입니다.
주어진 원본 텍스트와 추출된 데이터를 비교하여 정확성을 검증합니다.

반드시 JSON 형식으로만 응답하세요."""

        user_prompt = f"""다음 이력서 원본 텍스트에서 추출된 정보가 정확한지 검증해주세요.

## 원본 텍스트:
{text_excerpt}

## 검증할 데이터:
필드명: {field_name}
추출된 값: {field_value_str}

## 검증 기준:
1. 추출된 값이 원본 텍스트에 존재하거나 합리적으로 추론 가능한가?
2. 값의 형식과 내용이 올바른가?
3. 다른 정보와 일관성이 있는가?

## JSON 응답 형식:
{{
    "is_valid": true/false,
    "confidence": 0.0~1.0,
    "found_in_text": true/false,
    "reasoning": "검증 이유 설명",
    "suggested_value": null 또는 "수정 제안값 (잘못된 경우에만)"
}}"""

        try:
            response = await self.llm_manager.call_json(
                provider=provider,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=512
            )

            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            if response.success and response.content:
                content = response.content
                return ProviderValidationResult(
                    provider=provider.value,
                    success=True,
                    is_valid=content.get("is_valid", False),
                    confidence=content.get("confidence", 0.5),
                    reasoning=content.get("reasoning", ""),
                    suggested_value=content.get("suggested_value"),
                    found_in_text=content.get("found_in_text", False),
                    processing_time_ms=processing_time
                )
            else:
                return ProviderValidationResult(
                    provider=provider.value,
                    success=False,
                    error=response.error,
                    processing_time_ms=processing_time
                )

        except Exception as e:
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.error(f"[CrossValidation] Provider {provider.value} error: {e}")
            return ProviderValidationResult(
                provider=provider.value,
                success=False,
                error=str(e),
                processing_time_ms=processing_time
            )

    def _analyze_consensus(
        self,
        results: List[ProviderValidationResult],
        original_value: Any
    ) -> Dict[str, Any]:
        """
        합의(consensus) 분석

        가중 투표 방식으로 합의를 분석합니다.
        """
        if not results:
            return {
                "consensus_reached": False,
                "consensus_type": "none",
                "agreement_rate": 0.0,
                "weighted_confidence": 0.0,
                "is_valid": False,
                "final_value": original_value,
                "providers_agreed": [],
                "providers_disagreed": []
            }

        # 유효/무효 투표 수집
        valid_votes = []
        invalid_votes = []

        for result in results:
            weight = self.PROVIDER_WEIGHTS.get(result.provider, 0.8)
            weighted_confidence = result.confidence * weight

            vote = {
                "provider": result.provider,
                "confidence": result.confidence,
                "weight": weight,
                "weighted_confidence": weighted_confidence,
                "suggested_value": result.suggested_value
            }

            if result.is_valid:
                valid_votes.append(vote)
            else:
                invalid_votes.append(vote)

        total_providers = len(results)

        # 만장일치 확인
        if len(valid_votes) == total_providers:
            avg_confidence = sum(v["weighted_confidence"] for v in valid_votes) / len(valid_votes)
            return {
                "consensus_reached": True,
                "consensus_type": "unanimous",
                "agreement_rate": 1.0,
                "weighted_confidence": avg_confidence,
                "is_valid": True,
                "final_value": original_value,
                "providers_agreed": [v["provider"] for v in valid_votes],
                "providers_disagreed": []
            }

        if len(invalid_votes) == total_providers:
            avg_confidence = sum(v["weighted_confidence"] for v in invalid_votes) / len(invalid_votes)
            # 수정 제안이 있는지 확인
            suggested_values = [v["suggested_value"] for v in invalid_votes if v["suggested_value"]]
            final_value = suggested_values[0] if suggested_values else original_value

            return {
                "consensus_reached": True,
                "consensus_type": "unanimous_invalid",
                "agreement_rate": 1.0,
                "weighted_confidence": avg_confidence,
                "is_valid": False,
                "final_value": final_value,
                "providers_agreed": [],
                "providers_disagreed": [v["provider"] for v in invalid_votes]
            }

        # 가중 투표 분석
        valid_weight_sum = sum(v["weighted_confidence"] for v in valid_votes)
        invalid_weight_sum = sum(v["weighted_confidence"] for v in invalid_votes)
        total_weight = valid_weight_sum + invalid_weight_sum

        valid_ratio = valid_weight_sum / total_weight if total_weight > 0 else 0
        agreement_rate = len(valid_votes) / total_providers

        # 과반수 또는 가중 투표 결정
        if valid_ratio >= self.CONSENSUS_THRESHOLD:
            weighted_confidence = valid_weight_sum / len(valid_votes) if valid_votes else 0
            return {
                "consensus_reached": True,
                "consensus_type": "weighted_majority",
                "agreement_rate": agreement_rate,
                "weighted_confidence": weighted_confidence,
                "is_valid": True,
                "final_value": original_value,
                "providers_agreed": [v["provider"] for v in valid_votes],
                "providers_disagreed": [v["provider"] for v in invalid_votes]
            }
        elif (1 - valid_ratio) >= self.CONSENSUS_THRESHOLD:
            weighted_confidence = invalid_weight_sum / len(invalid_votes) if invalid_votes else 0
            # 수정 제안 수집
            suggested_values = [v["suggested_value"] for v in invalid_votes if v["suggested_value"]]
            final_value = suggested_values[0] if suggested_values else original_value

            return {
                "consensus_reached": True,
                "consensus_type": "weighted_majority_invalid",
                "agreement_rate": 1 - agreement_rate,
                "weighted_confidence": weighted_confidence,
                "is_valid": False,
                "final_value": final_value,
                "providers_agreed": [],
                "providers_disagreed": [v["provider"] for v in invalid_votes]
            }

        # 합의 실패 - 높은 신뢰도 기준으로 fallback
        high_confidence_valid = [v for v in valid_votes if v["confidence"] >= self.HIGH_CONFIDENCE_THRESHOLD]
        high_confidence_invalid = [v for v in invalid_votes if v["confidence"] >= self.HIGH_CONFIDENCE_THRESHOLD]

        if len(high_confidence_valid) > len(high_confidence_invalid):
            weighted_confidence = sum(v["weighted_confidence"] for v in high_confidence_valid) / len(high_confidence_valid)
            return {
                "consensus_reached": False,
                "consensus_type": "fallback_high_confidence",
                "agreement_rate": agreement_rate,
                "weighted_confidence": weighted_confidence,
                "is_valid": True,
                "final_value": original_value,
                "providers_agreed": [v["provider"] for v in valid_votes],
                "providers_disagreed": [v["provider"] for v in invalid_votes]
            }
        elif len(high_confidence_invalid) > len(high_confidence_valid):
            weighted_confidence = sum(v["weighted_confidence"] for v in high_confidence_invalid) / len(high_confidence_invalid)
            suggested_values = [v["suggested_value"] for v in invalid_votes if v["suggested_value"]]
            final_value = suggested_values[0] if suggested_values else original_value

            return {
                "consensus_reached": False,
                "consensus_type": "fallback_high_confidence",
                "agreement_rate": 1 - agreement_rate,
                "weighted_confidence": weighted_confidence,
                "is_valid": False,
                "final_value": final_value,
                "providers_agreed": [],
                "providers_disagreed": [v["provider"] for v in invalid_votes]
            }

        # 최종 fallback - 원본 유지, 낮은 신뢰도
        return {
            "consensus_reached": False,
            "consensus_type": "no_consensus",
            "agreement_rate": agreement_rate,
            "weighted_confidence": 0.3,  # 낮은 신뢰도
            "is_valid": True,  # 불확실할 때는 원본 유지
            "final_value": original_value,
            "providers_agreed": [v["provider"] for v in valid_votes],
            "providers_disagreed": [v["provider"] for v in invalid_votes]
        }

    async def _check_hallucination(
        self,
        ctx: PipelineContext,
        field_name: str,
        field_value: Any,
        results: List[ProviderValidationResult],
        original_text: str
    ) -> Dict[str, Any]:
        """
        환각 탐지 통합

        여러 LLM 결과를 기반으로 환각 여부를 판단합니다.
        """
        if not self.feature_flags.use_hallucination_detection:
            return {"detected": False}

        # found_in_text가 모두 False인 경우 환각 가능성
        found_in_text_count = sum(1 for r in results if r.found_in_text)
        not_found_count = len(results) - found_in_text_count

        # 과반수가 원본에서 발견하지 못함
        if not_found_count > found_in_text_count:
            # PipelineContext의 환각 검증 사용
            is_hallucination = not ctx.verify_hallucination(field_name, field_value, "cross_validation")

            if is_hallucination:
                # 각 프로바이더의 reasoning 수집
                reasonings = [r.reasoning for r in results if r.reasoning]
                details = f"다수의 LLM({not_found_count}/{len(results)})이 원본 텍스트에서 값을 찾지 못함. "
                if reasonings:
                    details += f"이유: {reasonings[0]}"

                logger.warning(
                    f"[CrossValidation] Hallucination detected for {field_name}={field_value}: {details}"
                )

                return {
                    "detected": True,
                    "details": details,
                    "not_found_ratio": not_found_count / len(results)
                }

        # LLM 결과 교차 검증
        llm_results = {r.provider: field_value if r.is_valid else None for r in results}
        hallucination_record = ctx.cross_validate_llm_results(field_name, llm_results)

        if hallucination_record:
            return {
                "detected": True,
                "details": hallucination_record.resolution or "LLM 간 결과 불일치",
                "record_id": hallucination_record.record_id
            }

        return {"detected": False}

    def _record_to_context(
        self,
        ctx: PipelineContext,
        field_name: str,
        results: List[ProviderValidationResult],
        consensus_result: Dict[str, Any]
    ):
        """PipelineContext에 교차 검증 결과 기록"""
        # 각 프로바이더 결과를 증거로 기록
        if self.feature_flags.use_evidence_tracking:
            for result in results:
                if result.success:
                    ctx.add_evidence(
                        field_name=field_name,
                        value=result.suggested_value or consensus_result.get("final_value"),
                        llm_provider=result.provider,
                        confidence=result.confidence,
                        reasoning=result.reasoning
                    )

        # 불일치 경고 기록
        if not consensus_result.get("consensus_reached", False):
            ctx.warning_collector.add(
                code="CROSS_VALIDATION_NO_CONSENSUS",
                message=f"{field_name} 필드에 대해 LLM 간 합의가 이루어지지 않음",
                severity="warning",
                field_name=field_name,
                stage_name="cross_validation"
            )

        # 제안 추가
        if consensus_result.get("is_valid", False):
            ctx.propose(
                agent_name="cross_validation",
                field_name=field_name,
                value=consensus_result.get("final_value"),
                confidence=consensus_result.get("weighted_confidence", 0.5),
                reasoning=f"교차 검증 합의({consensus_result.get('consensus_type')}): "
                          f"{len(consensus_result.get('providers_agreed', []))}개 프로바이더 동의"
            )

    async def _single_provider_validation(
        self,
        ctx: PipelineContext,
        field_name: str,
        field_value: Any,
        original_text: str,
        provider: LLMProvider
    ) -> CrossValidationResult:
        """단일 프로바이더로만 검증 (fallback)"""
        start_time = datetime.now()

        logger.warning(
            f"[CrossValidation] Only one provider available ({provider.value}), "
            f"falling back to single provider validation"
        )

        result = await self._validate_with_provider(
            provider=provider,
            field_name=field_name,
            field_value=field_value,
            original_text=original_text
        )

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        if not result.success:
            return CrossValidationResult(
                success=False,
                field_name=field_name,
                final_value=field_value,
                is_valid=False,
                consensus_reached=False,
                consensus_type="single_provider_failed",
                agreement_rate=0.0,
                weighted_confidence=0.0,
                individual_results=[result],
                error=result.error,
                processing_time_ms=processing_time
            )

        # 단일 프로바이더 결과를 컨텍스트에 기록
        if self.feature_flags.use_evidence_tracking:
            ctx.add_evidence(
                field_name=field_name,
                value=result.suggested_value or field_value,
                llm_provider=result.provider,
                confidence=result.confidence * 0.7,  # 단일 프로바이더이므로 신뢰도 감소
                reasoning=f"단일 프로바이더 검증: {result.reasoning}"
            )

        return CrossValidationResult(
            success=True,
            field_name=field_name,
            final_value=result.suggested_value if not result.is_valid and result.suggested_value else field_value,
            is_valid=result.is_valid,
            consensus_reached=False,  # 단일 프로바이더는 합의가 아님
            consensus_type="single_provider",
            agreement_rate=1.0 if result.is_valid else 0.0,
            weighted_confidence=result.confidence * 0.7,  # 단일 프로바이더이므로 신뢰도 감소
            providers_used=[result.provider],
            providers_agreed=[result.provider] if result.is_valid else [],
            providers_disagreed=[] if result.is_valid else [result.provider],
            individual_results=[result],
            processing_time_ms=processing_time
        )


# 싱글톤 인스턴스
_wrapper: Optional[ValidationAgentWrapper] = None
_cross_validator: Optional[CrossValidationEngine] = None


def get_validation_wrapper() -> ValidationAgentWrapper:
    """ValidationAgentWrapper 싱글톤 인스턴스 반환"""
    global _wrapper
    if _wrapper is None:
        _wrapper = ValidationAgentWrapper()
    return _wrapper


def get_cross_validator() -> CrossValidationEngine:
    """CrossValidationEngine 싱글톤 인스턴스 반환"""
    global _cross_validator
    if _cross_validator is None:
        _cross_validator = CrossValidationEngine()
    return _cross_validator
