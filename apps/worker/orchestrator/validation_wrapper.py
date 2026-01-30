"""
Validation Agent Wrapper - PipelineContext 연동 및 LLM 기반 검증

기존 ValidationAgent를 래핑하여:
- PII 필드는 regex 기반 검증 유지
- 복잡한 필드는 LLM 기반 검증 추가
- PipelineContext와 연동하여 증거 추적 및 환각 탐지 지원
"""

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
            import json
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


class CrossValidationEngine:
    """
    교차 검증 엔진

    여러 LLM의 결과를 비교하여 일관성을 확인합니다.
    """

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
    ) -> Dict[str, Any]:
        """
        여러 LLM으로 교차 검증

        Args:
            ctx: PipelineContext
            field_name: 검증할 필드명
            field_value: 검증할 값
            original_text: 원본 텍스트
            min_providers: 최소 사용할 프로바이더 수

        Returns:
            검증 결과 딕셔너리
        """
        available_providers = self.llm_manager.get_available_providers()

        if len(available_providers) < min_providers:
            logger.warning(
                f"[CrossValidation] Not enough providers: {len(available_providers)} < {min_providers}"
            )
            return {
                "success": False,
                "error": "Not enough LLM providers available"
            }

        # 각 프로바이더로 검증
        tasks = []
        for provider in available_providers[:min_providers]:
            tasks.append(
                self._validate_with_provider(
                    provider=provider,
                    field_name=field_name,
                    field_value=field_value,
                    original_text=original_text
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 결과 분석
        valid_results = [r for r in results if isinstance(r, dict) and r.get("success")]

        if not valid_results:
            return {
                "success": False,
                "error": "All providers failed"
            }

        # 합의 확인
        validities = [r.get("is_valid") for r in valid_results]
        agreement_rate = sum(validities) / len(validities) if validities else 0

        # 신뢰도 평균
        avg_confidence = sum(r.get("confidence", 0) for r in valid_results) / len(valid_results)

        # PipelineContext에 교차 검증 결과 기록
        all_results = {
            r.get("provider", "unknown"): field_value if r.get("is_valid") else None
            for r in valid_results
        }
        ctx.cross_validate_llm_results(field_name, all_results)

        return {
            "success": True,
            "field_name": field_name,
            "is_valid": agreement_rate >= 0.5,
            "agreement_rate": agreement_rate,
            "avg_confidence": avg_confidence,
            "providers_agreed": [r.get("provider") for r in valid_results if r.get("is_valid")],
            "providers_disagreed": [r.get("provider") for r in valid_results if not r.get("is_valid")],
        }

    async def _validate_with_provider(
        self,
        provider: LLMProvider,
        field_name: str,
        field_value: Any,
        original_text: str
    ) -> Dict[str, Any]:
        """개별 프로바이더로 검증"""
        text_excerpt = original_text[:1500]

        if isinstance(field_value, (list, dict)):
            import json
            field_value_str = json.dumps(field_value, ensure_ascii=False)
        else:
            field_value_str = str(field_value)

        prompt = f"""다음 이력서에서 추출된 정보가 정확한지 확인해주세요.

원본 텍스트:
{text_excerpt}

검증할 데이터:
{field_name}: {field_value_str}

JSON으로 응답:
{{"is_valid": true/false, "confidence": 0.0~1.0, "reasoning": "이유"}}"""

        try:
            response = await self.llm_manager.call_json(
                provider=provider,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=512
            )

            if response.success and response.content:
                return {
                    "success": True,
                    "provider": provider.value,
                    "is_valid": response.content.get("is_valid", False),
                    "confidence": response.content.get("confidence", 0.5),
                    "reasoning": response.content.get("reasoning", "")
                }
            else:
                return {"success": False, "provider": provider.value, "error": response.error}

        except Exception as e:
            return {"success": False, "provider": provider.value, "error": str(e)}


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
