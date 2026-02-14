"""
Base Extractor - 필드 Extractor의 기본 클래스

모든 Extractor가 상속받는 기본 클래스입니다.
"""

import asyncio
import logging
import time
import traceback
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple

from services.llm_manager import get_llm_manager, LLMProvider, LLMResponse
from schemas.extractor_schemas import (
    get_extractor_schema,
    get_extractor_prompt,
    get_max_text_length,
    get_preferred_model,
)

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """
    Extractor 추출 결과
    """
    success: bool
    extractor_type: str
    data: Dict[str, Any] = field(default_factory=dict)
    confidence_map: Dict[str, float] = field(default_factory=dict)
    evidence_map: Dict[str, str] = field(default_factory=dict)

    # 토큰 사용량
    input_tokens: int = 0
    output_tokens: int = 0

    # 메타데이터
    provider: str = ""
    model: str = ""
    processing_time_ms: int = 0
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def merge_with(self, other: "ExtractionResult") -> "ExtractionResult":
        """다른 결과와 병합 (교차검증용)"""
        merged_data = {**self.data, **other.data}
        merged_confidence = {**self.confidence_map, **other.confidence_map}
        merged_evidence = {**self.evidence_map, **other.evidence_map}

        return ExtractionResult(
            success=self.success and other.success,
            extractor_type=self.extractor_type,
            data=merged_data,
            confidence_map=merged_confidence,
            evidence_map=merged_evidence,
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            provider=f"{self.provider}+{other.provider}",
            processing_time_ms=self.processing_time_ms + other.processing_time_ms,
            warnings=self.warnings + other.warnings,
        )


class BaseExtractor(ABC):
    """
    기본 Extractor 클래스

    모든 필드 Extractor가 상속받습니다.
    """

    # Extractor 타입 (서브클래스에서 오버라이드)
    EXTRACTOR_TYPE: str = "base"

    # 기본 신뢰도
    DEFAULT_CONFIDENCE: float = 0.7

    def __init__(self):
        self.llm_manager = get_llm_manager()
        self.schema = get_extractor_schema(self.EXTRACTOR_TYPE)
        self.prompt = get_extractor_prompt(self.EXTRACTOR_TYPE)
        self.max_text_length = get_max_text_length(self.EXTRACTOR_TYPE)
        self.preferred_model = get_preferred_model(self.EXTRACTOR_TYPE)

    async def extract(
        self,
        text: str,
        filename: Optional[str] = None,
        provider: Optional[LLMProvider] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        """
        텍스트에서 필드 추출

        Args:
            text: 이력서 텍스트
            filename: 파일명 (이름 추출 힌트용)
            provider: LLM 제공자 (기본: OpenAI)
            additional_context: 추가 컨텍스트

        Returns:
            ExtractionResult
        """
        start_time = time.time()

        try:
            # 텍스트 전처리
            processed_text = self._preprocess_text(text)

            # 프롬프트 구성
            messages = self._build_messages(processed_text, filename, additional_context)

            # LLM 호출
            provider = provider or LLMProvider.OPENAI
            response = await self._call_llm(provider, messages)

            if not response.success:
                return ExtractionResult(
                    success=False,
                    extractor_type=self.EXTRACTOR_TYPE,
                    error=response.error,
                    provider=provider.value,
                    processing_time_ms=int((time.time() - start_time) * 1000)
                )

            # 응답 처리
            data = response.content
            confidence_map, evidence_map = self._extract_evidence_and_confidence(data)

            # 후처리
            processed_data = self._postprocess(data, confidence_map)

            return ExtractionResult(
                success=True,
                extractor_type=self.EXTRACTOR_TYPE,
                data=processed_data,
                confidence_map=confidence_map,
                evidence_map=evidence_map,
                input_tokens=response.usage.get("prompt_tokens", 0),
                output_tokens=response.usage.get("completion_tokens", 0),
                provider=provider.value,
                model=response.model or "",
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

        except Exception as e:
            logger.error(f"[{self.EXTRACTOR_TYPE}] 추출 실패: {e}")
            logger.error(traceback.format_exc())
            return ExtractionResult(
                success=False,
                extractor_type=self.EXTRACTOR_TYPE,
                error=str(e),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

    async def extract_with_cross_validation(
        self,
        text: str,
        filename: Optional[str] = None,
        providers: Optional[List[LLMProvider]] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> Tuple[ExtractionResult, Dict[LLMProvider, ExtractionResult]]:
        """
        여러 LLM으로 교차검증 추출

        Args:
            text: 이력서 텍스트
            filename: 파일명
            providers: LLM 제공자 목록 (기본: OpenAI, Gemini)
            additional_context: 추가 컨텍스트

        Returns:
            (합의된 결과, 개별 결과 딕셔너리)
        """
        providers = providers or [LLMProvider.OPENAI, LLMProvider.GEMINI]

        # 병렬 추출
        tasks = [
            self.extract(text, filename, provider, additional_context)
            for provider in providers
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 결과 정리
        individual_results: Dict[LLMProvider, ExtractionResult] = {}
        successful_results: List[ExtractionResult] = []

        for provider, result in zip(providers, results):
            if isinstance(result, Exception):
                individual_results[provider] = ExtractionResult(
                    success=False,
                    extractor_type=self.EXTRACTOR_TYPE,
                    error=str(result),
                    provider=provider.value
                )
            else:
                individual_results[provider] = result
                if result.success:
                    successful_results.append(result)

        # 합의 도출
        if not successful_results:
            return ExtractionResult(
                success=False,
                extractor_type=self.EXTRACTOR_TYPE,
                error="All providers failed"
            ), individual_results

        if len(successful_results) == 1:
            return successful_results[0], individual_results

        # 여러 결과 병합 (ConsensusBuilder 사용)
        merged = self._merge_results(successful_results)
        return merged, individual_results

    def _preprocess_text(self, text: str) -> str:
        """텍스트 전처리"""
        if not text:
            return ""

        # 길이 제한
        if len(text) > self.max_text_length:
            text = text[:self.max_text_length]
            logger.debug(f"[{self.EXTRACTOR_TYPE}] 텍스트 길이 제한: {self.max_text_length}자")

        return text.strip()

    def _build_messages(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, str]]:
        """LLM 메시지 구성"""
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(text, filename, additional_context)

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

    def _build_system_prompt(self) -> str:
        """시스템 프롬프트 구성"""
        return f"""You are an expert resume analyst specializing in Korean resumes.
Your task is to extract specific information with high accuracy.

{self.prompt}

IMPORTANT:
- Always extract information that is explicitly stated or can be reasonably inferred.
- For each extracted field, provide evidence (원문 발췌) when available.
- If information is not available, omit the field rather than guessing.
- Follow the JSON schema exactly.
- Respond in JSON format only.
"""

    def _build_user_prompt(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """사용자 프롬프트 구성"""
        prompt_parts = []

        if filename:
            prompt_parts.append(f"Filename: {filename}")

        if additional_context:
            context_str = "\n".join(
                f"- {k}: {v}" for k, v in additional_context.items()
            )
            prompt_parts.append(f"Additional Context:\n{context_str}")

        prompt_parts.append(f"Resume Text:\n{text}")

        return "\n\n".join(prompt_parts)

    async def _call_llm(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]]
    ) -> LLMResponse:
        """LLM 호출"""
        return await self.llm_manager.call_with_structured_output(
            provider=provider,
            messages=messages,
            json_schema=self.schema,
            temperature=0.1
        )

    def _extract_evidence_and_confidence(
        self,
        data: Dict[str, Any]
    ) -> Tuple[Dict[str, float], Dict[str, str]]:
        """
        응답에서 evidence와 confidence 추출

        Returns:
            (confidence_map, evidence_map)
        """
        confidence_map: Dict[str, float] = {}
        evidence_map: Dict[str, str] = {}

        for key, value in data.items():
            if key.endswith("_evidence"):
                base_field = key[:-9]  # Remove "_evidence"
                evidence_map[base_field] = value
            elif key.endswith("_confidence"):
                base_field = key[:-11]  # Remove "_confidence"
                try:
                    confidence_map[base_field] = float(value)
                except (ValueError, TypeError):
                    pass

        # Evidence가 있는 필드는 신뢰도 부스트
        for field in evidence_map:
            if field not in confidence_map:
                confidence_map[field] = self.DEFAULT_CONFIDENCE + 0.1
            else:
                confidence_map[field] = min(1.0, confidence_map[field] + 0.1)

        # 나머지 필드는 기본 신뢰도
        for key, value in data.items():
            if not key.endswith("_evidence") and not key.endswith("_confidence"):
                if key not in confidence_map and value is not None:
                    confidence_map[key] = self.DEFAULT_CONFIDENCE

        return confidence_map, evidence_map

    @abstractmethod
    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        추출 결과 후처리 (서브클래스에서 구현)

        - 데이터 정규화
        - 유효성 검증
        - Evidence 필드 제거 (별도 반환)
        """
        pass

    def _merge_results(
        self,
        results: List[ExtractionResult]
    ) -> ExtractionResult:
        """여러 결과 병합 (기본 구현)"""
        if len(results) == 1:
            return results[0]

        # 첫 번째 결과를 기반으로 병합
        merged = results[0]
        for other in results[1:]:
            merged = merged.merge_with(other)

        return merged

    def _remove_evidence_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Evidence 필드 제거 (데이터 정리용)"""
        return {
            k: v for k, v in data.items()
            if not k.endswith("_evidence") and not k.endswith("_confidence")
        }
