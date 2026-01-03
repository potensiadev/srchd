"""
Analyst Agent - 2-Way/3-Way Cross-Check Resume Analyzer

GPT-4o + Gemini (Phase 1) 또는 + Claude (Phase 2) 교차 검증
신뢰도 점수 및 경고 생성
"""

import asyncio
import logging
import traceback
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

# 로깅 설정 - 상세 출력
logging.basicConfig(level=logging.DEBUG)
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
        mode: Optional[AnalysisMode] = None,
        filename: Optional[str] = None
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

        logger.info("=" * 70)
        logger.info("[AnalystAgent] 이력서 분석 시작")
        logger.info(f"[AnalystAgent] 분석 모드: {analysis_mode.value}")
        logger.info(f"[AnalystAgent] 입력 텍스트 길이: {len(resume_text)} chars")
        logger.info(f"[AnalystAgent] 입력 텍스트 미리보기: {resume_text[:300]}...")
        logger.info("=" * 70)

        try:
            # Step 1: LLM 호출 준비
            logger.info("[AnalystAgent] Step 1: 사용 가능한 프로바이더 확인")
            try:
                providers = self._get_providers_for_mode(analysis_mode)
                logger.info(f"[AnalystAgent] ✅ 선택된 프로바이더: {[p.value for p in providers]}")
            except ValueError as e:
                logger.error(f"[AnalystAgent] ❌ 프로바이더 선택 실패: {e}")
                # 단일 프로바이더로 폴백 시도
                available = self.llm_manager.get_available_providers()
                if available:
                    providers = available[:1]  # 사용 가능한 첫 번째 프로바이더만 사용
                    logger.warning(f"[AnalystAgent] ⚠️ 폴백: 단일 프로바이더 사용 - {providers[0].value}")
                else:
                    raise ValueError("사용 가능한 LLM 프로바이더가 없습니다. API 키를 확인하세요.")

            # Step 2: 메시지 생성
            logger.info("[AnalystAgent] Step 2: LLM 프롬프트 메시지 생성")
            messages = self._create_extraction_messages(resume_text, filename)
            logger.debug(f"[AnalystAgent] 시스템 프롬프트 길이: {len(messages[0]['content'])} chars")
            logger.debug(f"[AnalystAgent] 유저 프롬프트 길이: {len(messages[1]['content'])} chars")

            # Step 3: 병렬 LLM 호출
            logger.info("[AnalystAgent] Step 3: LLM 병렬 호출 시작")
            responses = await self._call_llms_parallel(providers, messages)
            logger.info(f"[AnalystAgent] LLM 호출 완료 - 응답 수: {len(responses)}")

            # 응답 상세 로깅
            for provider, response in responses.items():
                if response.success:
                    logger.info(f"[AnalystAgent] ✅ {provider.value}: 성공 (필드 수: {len(response.content) if isinstance(response.content, dict) else 'N/A'})")
                else:
                    logger.error(f"[AnalystAgent] ❌ {provider.value}: 실패 - {response.error}")

            # Step 4: 결과 병합
            logger.info("[AnalystAgent] Step 4: 응답 병합 및 신뢰도 계산")
            merged_data, field_confidence, warnings = self._merge_responses(
                responses, providers
            )
            logger.info(f"[AnalystAgent] ✅ 병합된 필드 수: {len(merged_data)}")
            logger.debug(f"[AnalystAgent] 병합된 데이터: {merged_data}")

            # Step 5: 전체 신뢰도 계산
            overall_confidence = self._calculate_overall_confidence(field_confidence)
            logger.info(f"[AnalystAgent] ✅ 전체 신뢰도: {overall_confidence:.2%}")

            # Step 6: 추가 검증
            logger.info("[AnalystAgent] Step 5: 데이터 유효성 검증")
            additional_warnings = self._validate_data(merged_data)
            warnings.extend(additional_warnings)
            logger.info(f"[AnalystAgent] 경고 수: {len(warnings)}")

            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.info(f"[AnalystAgent] ✅ 분석 완료 - {processing_time}ms")
            logger.info("=" * 70)

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
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.error(f"[AnalystAgent] ❌ 분석 실패 ({processing_time}ms): {type(e).__name__}: {e}")
            logger.error(f"[AnalystAgent] 상세 오류:\n{traceback.format_exc()}")
            logger.info("=" * 70)
            return AnalysisResult(
                success=False,
                processing_time_ms=processing_time,
                mode=analysis_mode,
                error=str(e)
            )

    def _get_providers_for_mode(self, mode: AnalysisMode) -> List[LLMProvider]:
        """분석 모드에 따른 프로바이더 선택"""
        available = self.llm_manager.get_available_providers()
        logger.info(f"[AnalystAgent] 사용 가능한 프로바이더: {[p.value for p in available]}")

        if mode == AnalysisMode.PHASE_1:
            # 2-Way: GPT-4o + Gemini
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI]
        else:
            # 3-Way: GPT-4o + Gemini + Claude
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI, LLMProvider.CLAUDE]

        logger.info(f"[AnalystAgent] 모드 {mode.value}에 필요한 프로바이더: {[p.value for p in required]}")

        # 사용 가능한 프로바이더만 필터링
        providers = [p for p in required if p in available]
        logger.info(f"[AnalystAgent] 최종 선택된 프로바이더: {[p.value for p in providers]}")

        # 최소 1개 프로바이더가 있으면 진행 (기존: 2개 필수 → 1개로 완화)
        if len(providers) < 1:
            logger.error(f"[AnalystAgent] ❌ 사용 가능한 프로바이더 없음!")
            raise ValueError(
                f"사용 가능한 LLM 프로바이더가 없습니다. Available: {[p.value for p in available]}"
            )

        if len(providers) < 2:
            logger.warning(f"[AnalystAgent] ⚠️ 단일 프로바이더만 사용 가능 - cross-check 불가")

        return providers

    def _create_extraction_messages(self, resume_text: str, filename: Optional[str] = None) -> List[Dict[str, str]]:
        """이력서 추출용 메시지 생성"""
        # 파일명 힌트 생성
        filename_hint = ""
        if filename:
            # 파일명에서 이름 추출 힌트
            import re
            # 확장자 제거
            name_part = re.sub(r'\.(pdf|hwp|hwpx|doc|docx)$', '', filename, flags=re.IGNORECASE)
            # 이력서, 경력기술서 등 일반 키워드 제거
            name_part = re.sub(r'[_\-\s]*(이력서|경력기술서|resume|cv|자기소개서)[_\-\s]*', '', name_part, flags=re.IGNORECASE)
            name_part = name_part.strip('_- ')
            if name_part:
                filename_hint = f"""
### 파일명 정보
원본 파일명: {filename}
파일명에서 추정되는 이름: {name_part}
(파일명에 이름이 포함되어 있을 수 있으니 참고하세요)
"""
        
        system_prompt = """당신은 전문 이력서 분석가입니다.
주어진 이력서에서 구조화된 정보를 정확하게 추출해주세요.

중요: 한국 이력서는 "이름:" 같은 라벨 없이 이름이 단독으로 표시됩니다.
- 문서 상단에 2~4글자 한글 이름이 있으면 그것이 이름입니다
- 파일명에 이름이 포함된 경우가 많습니다 (예: 김경민_이력서.pdf)
- 라벨이 없어도 문맥에서 정보를 추론하세요

""" + RESUME_SCHEMA_PROMPT

        user_prompt = f"""다음 이력서를 분석하고 JSON 형식으로 정보를 추출해주세요:
{filename_hint}
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
        logger.info(f"[AnalystAgent] {len(providers)}개 LLM 병렬 호출 시작")

        async def call_provider(provider: LLMProvider) -> Tuple[LLMProvider, LLMResponse]:
            start = datetime.now()
            logger.info(f"[AnalystAgent] → {provider.value} 호출 시작")
            try:
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

                elapsed = (datetime.now() - start).total_seconds()
                if response.success:
                    logger.info(f"[AnalystAgent] ← {provider.value} 완료 ({elapsed:.2f}초) ✅")
                else:
                    logger.error(f"[AnalystAgent] ← {provider.value} 실패 ({elapsed:.2f}초): {response.error}")

                return provider, response

            except Exception as e:
                elapsed = (datetime.now() - start).total_seconds()
                logger.error(f"[AnalystAgent] ← {provider.value} 예외 발생 ({elapsed:.2f}초): {type(e).__name__}: {e}")
                logger.error(traceback.format_exc())
                # 예외 발생 시 에러 응답 반환
                return provider, LLMResponse(
                    provider=provider,
                    content=None,
                    raw_response="",
                    model="unknown",
                    error=str(e)
                )

        tasks = [call_provider(p) for p in providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        responses = {}
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                provider = providers[i]
                logger.error(f"[AnalystAgent] ❌ {provider.value} gather 예외: {result}")
                logger.error(traceback.format_exc())
                responses[provider] = LLMResponse(
                    provider=provider,
                    content=None,
                    raw_response="",
                    model="unknown",
                    error=str(result)
                )
            else:
                provider, response = result
                responses[provider] = response

        # 결과 요약 로깅
        success_count = sum(1 for r in responses.values() if r.success)
        logger.info(f"[AnalystAgent] LLM 호출 결과: {success_count}/{len(providers)} 성공")

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
        4. 모든 LLM 실패 시 빈 데이터 반환 (에러 발생 X)
        """
        merged_data = {}
        field_confidence_list = []
        warnings = []

        logger.info("[AnalystAgent] 응답 병합 시작")

        # 성공한 응답만 필터
        valid_responses = {
            p: r for p, r in responses.items()
            if r.success and r.content is not None
        }

        logger.info(f"[AnalystAgent] 유효한 응답: {len(valid_responses)}/{len(responses)}")

        # 모든 LLM 실패 시 - 빈 데이터 반환 (에러 발생 대신)
        if not valid_responses:
            logger.error("[AnalystAgent] ❌ 모든 LLM 응답 실패!")
            for p, r in responses.items():
                logger.error(f"[AnalystAgent]   - {p.value}: {r.error}")

            # 에러 메시지 대신 빈 데이터 + 경고 반환
            warnings.append(Warning(
                type=WarningType.LOW_CONFIDENCE,
                field="*",
                message="모든 LLM 분석 실패 - AI 분석 없이 기본 데이터만 사용",
                severity="high"
            ))

            # 기본 빈 데이터 구조 반환
            default_data = {
                "name": None,
                "birth_year": None,
                "gender": None,
                "phone": None,
                "email": None,
                "address": None,
                "exp_years": 0,
                "last_company": None,
                "last_position": None,
                "careers": [],
                "skills": [],
                "education_level": None,
                "education_school": None,
                "education_major": None,
                "educations": [],
                "projects": [],
                "summary": "AI 분석 실패로 요약을 생성하지 못했습니다.",
                "strengths": [],
                "portfolio_url": None,
                "github_url": None,
                "linkedin_url": None,
            }

            fc = FieldConfidence(
                field="*",
                confidence=0.0,
                sources=[],
                values={},
                final_value=None,
                has_mismatch=False
            )
            field_confidence_list.append(fc)

            logger.warning("[AnalystAgent] ⚠️ 빈 데이터로 폴백 반환")
            return default_data, field_confidence_list, warnings

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
