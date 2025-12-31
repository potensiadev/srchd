"""
Analyst Agent - 2-Way/3-Way Cross-Check Resume Analyzer

GPT-4o + Gemini (Phase 1) 또는 + Claude (Phase 2) 교차 검증
신뢰도 점수 및 경고 생성
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

from config import get_settings, AnalysisMode
from services.llm_manager import (
    LLMManager,
    LLMProvider,
    LLMResponse,
    get_llm_manager
)
from schemas.resume_schema import RESUME_JSON_SCHEMA, RESUME_SCHEMA_PROMPT

logger = logging.getLogger(__name__)
settings = get_settings()


class WarningType(str, Enum):
    """경고 유형"""
    MISMATCH = "mismatch"           # LLM 간 불일치
    MISSING_DATA = "missing_data"   # 필수 정보 누락
    SUSPICIOUS = "suspicious"        # 의심스러운 정보
    LOW_CONFIDENCE = "low_confidence"  # 낮은 신뢰도
    CAREER_GAP = "career_gap"       # 경력 공백
    INCONSISTENT = "inconsistent"    # 내부 불일치


@dataclass
class Warning:
    """분석 경고"""
    type: WarningType
    field: str
    message: str
    severity: str = "medium"  # low, medium, high

    def to_dict(self) -> Dict[str, str]:
        return {
            "type": self.type.value,
            "field": self.field,
            "message": self.message,
            "severity": self.severity
        }


@dataclass
class FieldConfidence:
    """필드별 신뢰도"""
    field: str
    confidence: float
    sources: List[str]  # 값을 제공한 LLM 목록
    values: Dict[str, Any]  # LLM별 추출 값
    final_value: Any
    has_mismatch: bool = False


@dataclass
class AnalysisResult:
    """분석 결과"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    confidence_score: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)
    warnings: List[Warning] = field(default_factory=list)
    llm_responses: Dict[str, LLMResponse] = field(default_factory=dict)
    processing_time_ms: int = 0
    mode: AnalysisMode = AnalysisMode.PHASE_1
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "confidence_score": round(self.confidence_score, 2),
            "field_confidence": {k: round(v, 2) for k, v in self.field_confidence.items()},
            "warnings": [w.to_dict() for w in self.warnings],
            "processing_time_ms": self.processing_time_ms,
            "mode": self.mode.value,
            "error": self.error
        }


class AnalystAgent:
    """
    이력서 분석 에이전트

    Features:
    - 2-Way Cross-Check: GPT-4o + Gemini 1.5 Pro
    - 3-Way Cross-Check: + Claude 3.5 Sonnet (Phase 2)
    - 필드별 신뢰도 계산
    - 불일치 감지 및 경고 생성
    - 다수결 기반 최종 값 결정
    """

    # 중요 필드 가중치
    FIELD_WEIGHTS = {
        "name": 1.0,
        "exp_years": 1.0,
        "skills": 0.9,
        "careers": 1.0,
        "last_company": 0.9,
        "last_position": 0.8,
        "education_level": 0.7,
        "education_school": 0.7,
        "phone": 0.6,
        "email": 0.6,
        "summary": 0.5,
        "strengths": 0.5,
    }

    # 비교 시 허용 오차
    NUMERIC_TOLERANCE = 0.5  # exp_years 등 숫자 비교 시

    def __init__(self, llm_manager: Optional[LLMManager] = None):
        self.llm_manager = llm_manager or get_llm_manager()
        self.mode = settings.ANALYSIS_MODE

    async def analyze(
        self,
        resume_text: str,
        mode: Optional[AnalysisMode] = None
    ) -> AnalysisResult:
        """
        이력서 텍스트 분석

        Args:
            resume_text: 파싱된 이력서 텍스트
            mode: 분석 모드 (Phase 1/2)

        Returns:
            AnalysisResult with merged data and confidence scores
        """
        start_time = datetime.now()
        analysis_mode = mode or self.mode

        try:
            # LLM 호출 준비
            providers = self._get_providers_for_mode(analysis_mode)
            messages = self._create_extraction_messages(resume_text)

            # 병렬로 LLM 호출
            responses = await self._call_llms_parallel(providers, messages)

            # 결과 병합 및 신뢰도 계산
            merged_data, field_confidence, warnings = self._merge_responses(
                responses, providers
            )

            # 전체 신뢰도 계산
            overall_confidence = self._calculate_overall_confidence(field_confidence)

            # 추가 검증 경고
            additional_warnings = self._validate_data(merged_data)
            warnings.extend(additional_warnings)

            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

            return AnalysisResult(
                success=True,
                data=merged_data,
                confidence_score=overall_confidence,
                field_confidence={fc.field: fc.confidence for fc in field_confidence},
                warnings=warnings,
                llm_responses={p.value: r for p, r in responses.items()},
                processing_time_ms=processing_time,
                mode=analysis_mode
            )

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            return AnalysisResult(
                success=False,
                processing_time_ms=processing_time,
                mode=analysis_mode,
                error=str(e)
            )

    def _get_providers_for_mode(self, mode: AnalysisMode) -> List[LLMProvider]:
        """분석 모드에 따른 프로바이더 선택"""
        available = self.llm_manager.get_available_providers()

        if mode == AnalysisMode.PHASE_1:
            # 2-Way: GPT-4o + Gemini
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI]
        else:
            # 3-Way: GPT-4o + Gemini + Claude
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI, LLMProvider.CLAUDE]

        # 사용 가능한 프로바이더만 필터링
        providers = [p for p in required if p in available]

        if len(providers) < 2:
            raise ValueError(
                f"At least 2 LLM providers required. Available: {[p.value for p in available]}"
            )

        return providers

    def _create_extraction_messages(self, resume_text: str) -> List[Dict[str, str]]:
        """이력서 추출용 메시지 생성"""
        system_prompt = """당신은 전문 이력서 분석가입니다.
주어진 이력서에서 구조화된 정보를 정확하게 추출해주세요.
모든 정보는 이력서에 명시된 내용만 사용하며, 추측하지 마세요.
정보가 없으면 null을 사용하세요.

""" + RESUME_SCHEMA_PROMPT

        user_prompt = f"""다음 이력서를 분석하고 JSON 형식으로 정보를 추출해주세요:

---
{resume_text}
---

위 이력서에서 정보를 추출하여 JSON으로 반환하세요."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

    async def _call_llms_parallel(
        self,
        providers: List[LLMProvider],
        messages: List[Dict[str, str]]
    ) -> Dict[LLMProvider, LLMResponse]:
        """병렬로 여러 LLM 호출"""
        async def call_provider(provider: LLMProvider) -> Tuple[LLMProvider, LLMResponse]:
            if provider == LLMProvider.OPENAI:
                # OpenAI는 Structured Outputs 사용
                response = await self.llm_manager.call_with_structured_output(
                    provider=provider,
                    messages=messages,
                    json_schema=RESUME_JSON_SCHEMA,
                    temperature=0.1
                )
            else:
                # Gemini, Claude는 JSON 모드 사용
                response = await self.llm_manager.call_json(
                    provider=provider,
                    messages=messages,
                    json_schema=RESUME_JSON_SCHEMA,
                    temperature=0.1
                )
            return provider, response

        tasks = [call_provider(p) for p in providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        responses = {}
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"LLM call failed: {result}")
            else:
                provider, response = result
                responses[provider] = response

        return responses

    def _merge_responses(
        self,
        responses: Dict[LLMProvider, LLMResponse],
        providers: List[LLMProvider]
    ) -> Tuple[Dict[str, Any], List[FieldConfidence], List[Warning]]:
        """
        여러 LLM 응답 병합

        전략:
        1. 모든 LLM이 동의하면 높은 신뢰도
        2. 다수결로 최종 값 결정
        3. 불일치 시 경고 생성
        """
        merged_data = {}
        field_confidence_list = []
        warnings = []

        # 성공한 응답만 필터
        valid_responses = {
            p: r for p, r in responses.items()
            if r.success and r.content is not None
        }

        if not valid_responses:
            raise ValueError("No valid LLM responses")

        # 모든 필드 수집
        all_fields = set()
        for response in valid_responses.values():
            if isinstance(response.content, dict):
                all_fields.update(response.content.keys())

        # 필드별 병합
        for field_name in all_fields:
            values = {}
            for provider, response in valid_responses.items():
                if isinstance(response.content, dict) and field_name in response.content:
                    values[provider.value] = response.content[field_name]

            # 최종 값 결정 및 신뢰도 계산
            final_value, confidence, has_mismatch = self._determine_field_value(
                field_name, values
            )

            merged_data[field_name] = final_value

            fc = FieldConfidence(
                field=field_name,
                confidence=confidence,
                sources=list(values.keys()),
                values=values,
                final_value=final_value,
                has_mismatch=has_mismatch
            )
            field_confidence_list.append(fc)

            # 불일치 경고
            if has_mismatch and field_name in self.FIELD_WEIGHTS:
                warnings.append(Warning(
                    type=WarningType.MISMATCH,
                    field=field_name,
                    message=f"LLM 간 '{field_name}' 필드 불일치: {values}",
                    severity="medium" if self.FIELD_WEIGHTS.get(field_name, 0.5) < 0.8 else "high"
                ))

        return merged_data, field_confidence_list, warnings

    def _determine_field_value(
        self,
        field_name: str,
        values: Dict[str, Any]
    ) -> Tuple[Any, float, bool]:
        """
        필드의 최종 값, 신뢰도, 불일치 여부 결정

        Returns:
            (final_value, confidence, has_mismatch)
        """
        if not values:
            return None, 0.0, False

        value_list = list(values.values())
        unique_values = set(self._normalize_for_comparison(v) for v in value_list)

        # 모두 동일
        if len(unique_values) == 1:
            return value_list[0], 1.0, False

        # 다수결
        if len(values) >= 3:
            # 가장 많이 나온 값 선택
            from collections import Counter
            normalized = [self._normalize_for_comparison(v) for v in value_list]
            counter = Counter(normalized)
            most_common = counter.most_common(1)[0]

            if most_common[1] > len(value_list) / 2:
                # 과반수 동의
                final_value = next(
                    v for v in value_list
                    if self._normalize_for_comparison(v) == most_common[0]
                )
                confidence = most_common[1] / len(value_list)
                return final_value, confidence, True

        # 숫자 필드의 경우 평균 사용
        if field_name in ["exp_years", "birth_year"]:
            numeric_values = [v for v in value_list if isinstance(v, (int, float))]
            if numeric_values:
                avg = sum(numeric_values) / len(numeric_values)
                # 차이가 허용 범위 내인지 확인
                max_diff = max(abs(v - avg) for v in numeric_values)
                if max_diff <= self.NUMERIC_TOLERANCE:
                    return round(avg, 1), 0.8, False
                else:
                    return round(avg, 1), 0.5, True

        # 배열 필드는 합집합 사용
        if field_name in ["skills", "strengths"]:
            all_items = set()
            for v in value_list:
                if isinstance(v, list):
                    all_items.update(v)
            return list(all_items), 0.7, len(unique_values) > 1

        # 기본: 첫 번째 값 사용 (OpenAI 우선)
        priority_order = ["openai", "gemini", "claude"]
        for provider in priority_order:
            if provider in values:
                return values[provider], 0.6, True

        return value_list[0], 0.5, True

    def _normalize_for_comparison(self, value: Any) -> str:
        """비교를 위한 값 정규화"""
        if value is None:
            return "null"
        if isinstance(value, list):
            return str(sorted(str(v).lower().strip() for v in value))
        if isinstance(value, dict):
            return str(sorted(value.items()))
        if isinstance(value, (int, float)):
            return str(round(float(value), 1))
        return str(value).lower().strip()

    def _calculate_overall_confidence(
        self,
        field_confidence: List[FieldConfidence]
    ) -> float:
        """전체 신뢰도 점수 계산 (가중 평균)"""
        if not field_confidence:
            return 0.0

        weighted_sum = 0.0
        weight_total = 0.0

        for fc in field_confidence:
            weight = self.FIELD_WEIGHTS.get(fc.field, 0.3)
            weighted_sum += fc.confidence * weight
            weight_total += weight

        if weight_total == 0:
            return 0.0

        return weighted_sum / weight_total

    def _validate_data(self, data: Dict[str, Any]) -> List[Warning]:
        """데이터 유효성 검증 및 추가 경고 생성"""
        warnings = []

        # 필수 필드 누락 확인
        required_fields = ["name", "exp_years", "skills"]
        for field in required_fields:
            if not data.get(field):
                warnings.append(Warning(
                    type=WarningType.MISSING_DATA,
                    field=field,
                    message=f"필수 정보 '{field}'이(가) 누락되었습니다",
                    severity="high"
                ))

        # 경력 연수와 경력 목록 일관성 확인
        exp_years = data.get("exp_years", 0)
        careers = data.get("careers", [])

        if exp_years > 0 and not careers:
            warnings.append(Warning(
                type=WarningType.INCONSISTENT,
                field="careers",
                message=f"경력 {exp_years}년이지만 경력 목록이 비어있습니다",
                severity="medium"
            ))

        # 경력 공백 확인
        if careers and len(careers) >= 2:
            gaps = self._check_career_gaps(careers)
            for gap in gaps:
                warnings.append(Warning(
                    type=WarningType.CAREER_GAP,
                    field="careers",
                    message=gap,
                    severity="low"
                ))

        # 스킬이 너무 적은 경우
        skills = data.get("skills", [])
        if exp_years > 3 and len(skills) < 3:
            warnings.append(Warning(
                type=WarningType.SUSPICIOUS,
                field="skills",
                message=f"경력 {exp_years}년 대비 스킬 수가 적습니다 ({len(skills)}개)",
                severity="low"
            ))

        return warnings

    def _check_career_gaps(self, careers: List[Dict]) -> List[str]:
        """경력 공백 확인"""
        gaps = []

        # 날짜순 정렬
        sorted_careers = sorted(
            [c for c in careers if c.get("start_date")],
            key=lambda x: x.get("start_date", "0000")
        )

        for i in range(len(sorted_careers) - 1):
            current = sorted_careers[i]
            next_career = sorted_careers[i + 1]

            end_date = current.get("end_date")
            start_date = next_career.get("start_date")

            if end_date and start_date:
                try:
                    # YYYY-MM 형식 파싱
                    end_parts = end_date.split("-")
                    start_parts = start_date.split("-")

                    end_year = int(end_parts[0])
                    end_month = int(end_parts[1]) if len(end_parts) > 1 else 12

                    start_year = int(start_parts[0])
                    start_month = int(start_parts[1]) if len(start_parts) > 1 else 1

                    gap_months = (start_year - end_year) * 12 + (start_month - end_month)

                    if gap_months > 6:
                        gaps.append(
                            f"{current.get('company')} 퇴사 후 {next_career.get('company')} 입사까지 "
                            f"약 {gap_months}개월 공백"
                        )
                except (ValueError, IndexError):
                    pass

        return gaps


# 싱글톤 인스턴스
_analyst_agent: Optional[AnalystAgent] = None


def get_analyst_agent() -> AnalystAgent:
    """Analyst Agent 싱글톤 인스턴스 반환"""
    global _analyst_agent
    if _analyst_agent is None:
        _analyst_agent = AnalystAgent()
    return _analyst_agent
