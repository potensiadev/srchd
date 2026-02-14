"""
GapFillerAgent

빈 필드를 타겟으로 재추출합니다.

전략:
1. CoverageCalculator에서 받은 gap_fill_candidates만 처리
2. 필드별 targeted prompt 사용
3. 최대 2회 재시도, 5초 타임아웃
4. coverage >= 85% 이면 스킵

LLM 호출: 0-2 (필드당)

파이프라인 위치:
... → CoverageCalculator → [GapFillerAgent] → PrivacyAgent → ...
"""

import asyncio
import logging
import time
import json
from typing import Dict, List, Any, Optional

from schemas.phase1_types import (
    GapFillAttempt,
    GapFillResult,
    COVERAGE_THRESHOLD,
)
from services.llm_manager import LLMProvider
from config import get_settings

logger = logging.getLogger(__name__)


class GapFillerAgent:
    """
    빈 필드 타겟 재추출 에이전트

    역할:
    - 빈 필드에 대해 focused prompt로 재추출 시도
    - 최대 재시도 횟수 및 타임아웃 적용
    - 높은 coverage면 스킵하여 비용 절감
    """

    # 필드별 targeted prompt 템플릿
    FIELD_PROMPTS = {
        "phone": {
            "instruction": """Extract ONLY the phone number from this resume text.
Korean phone numbers typically start with 010, 011, 016, 017, 018, 019.
Return in format: 010-XXXX-XXXX or 010XXXXXXXX
If not found, return null.""",
            "schema": {"phone": "string or null"},
        },
        "email": {
            "instruction": """Extract ONLY the email address from this resume text.
Look for patterns like xxx@xxx.xxx
If not found, return null.""",
            "schema": {"email": "string or null"},
        },
        "skills": {
            "instruction": """Extract ONLY the technical skills and tools mentioned in this resume.
Include: programming languages, frameworks, databases, tools, methodologies.
Return as a JSON array of strings.
If none found, return empty array [].""",
            "schema": {"skills": "array of strings"},
        },
        "careers": {
            "instruction": """Extract ONLY the work experience/career history from this resume.
For each position, extract:
- company: company name
- position: job title
- start_date: start date (YYYY-MM format if possible)
- end_date: end date or "present" (YYYY-MM format if possible)
Return as a JSON array. If none found, return empty array [].""",
            "schema": {
                "careers": [
                    {
                        "company": "string",
                        "position": "string",
                        "start_date": "string",
                        "end_date": "string"
                    }
                ]
            },
        },
        "name": {
            "instruction": """Extract ONLY the person's name from this resume.
Look for Korean names (2-4 characters) or English names.
The name is usually at the top of the resume.
If not found, return null.""",
            "schema": {"name": "string or null"},
        },
        "educations": {
            "instruction": """Extract ONLY the education history from this resume.
For each education entry, extract:
- school: school/university name
- degree: degree type (학사, 석사, 박사, Bachelor, Master, PhD)
- major: field of study
- graduation_year: graduation year
Return as a JSON array. If none found, return empty array [].""",
            "schema": {
                "educations": [
                    {
                        "school": "string",
                        "degree": "string",
                        "major": "string",
                        "graduation_year": "string"
                    }
                ]
            },
        },
        "exp_years": {
            "instruction": """Calculate the total years of work experience from this resume.
Count the total duration of all work experiences.
Return as an integer (round down). If cannot determine, return null.""",
            "schema": {"exp_years": "integer or null"},
        },
        "current_company": {
            "instruction": """Extract the current or most recent company name from this resume.
Look for keywords like "현재", "재직중", "present", "current".
If not determinable, use the first/top company listed.
If not found, return null.""",
            "schema": {"current_company": "string or null"},
        },
        "current_position": {
            "instruction": """Extract the current or most recent job title/position from this resume.
Look for keywords like "현재", "재직중", "present", "current".
If not determinable, use the first/top position listed.
If not found, return null.""",
            "schema": {"current_position": "string or null"},
        },
    }

    def __init__(
        self,
        llm_manager=None,
        max_retries: int = 2,
        timeout_seconds: int = 5,
        coverage_threshold: float = COVERAGE_THRESHOLD,
    ):
        """
        Args:
            llm_manager: LLM 호출용
            max_retries: 필드당 최대 재시도 횟수
            timeout_seconds: 필드당 타임아웃 (초)
            coverage_threshold: 이상이면 스킵 (0.0-1.0)
        """
        self.llm_manager = llm_manager
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self.coverage_threshold = coverage_threshold

    async def fill_gaps(
        self,
        gap_candidates: List[str],
        current_data: Dict[str, Any],
        original_text: str,
        coverage_score: float,
    ) -> GapFillResult:
        """
        빈 필드 채우기

        Args:
            gap_candidates: CoverageCalculator에서 받은 대상 필드
            current_data: 현재까지 분석된 데이터
            original_text: 원문 텍스트
            coverage_score: 현재 coverage 점수 (0-100)

        Returns:
            GapFillResult
        """
        start_time = time.time()

        # Coverage가 충분히 높으면 스킵
        if coverage_score >= self.coverage_threshold * 100:
            logger.info(
                f"[GapFillerAgent] Skipping: coverage {coverage_score:.1f}% >= "
                f"threshold {self.coverage_threshold * 100:.1f}%"
            )
            return GapFillResult(
                success=True,
                skipped=True,
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

        if not self.llm_manager:
            logger.warning("[GapFillerAgent] LLM manager not available")
            return GapFillResult(
                success=False,
                still_missing=gap_candidates,
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

        if not gap_candidates:
            logger.info("[GapFillerAgent] No gap candidates to fill")
            return GapFillResult(
                success=True,
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

        logger.info(
            f"[GapFillerAgent] Attempting to fill {len(gap_candidates)} fields: "
            f"{gap_candidates}"
        )

        filled: Dict[str, Any] = {}
        still_missing: List[str] = []
        attempts: List[GapFillAttempt] = []
        total_retries = 0
        total_llm_calls = 0

        # 각 필드에 대해 재추출 시도
        for field_name in gap_candidates:
            if field_name not in self.FIELD_PROMPTS:
                logger.debug(f"[GapFillerAgent] No prompt template for: {field_name}")
                still_missing.append(field_name)
                continue

            attempt = await self._extract_field_with_retry(
                field_name=field_name,
                original_text=original_text,
            )

            attempts.append(attempt)
            total_retries += attempt.retries_used
            total_llm_calls += attempt.retries_used + 1  # 첫 시도 + 재시도

            if attempt.success and attempt.value is not None:
                filled[field_name] = attempt.value
                logger.info(
                    f"[GapFillerAgent] Filled '{field_name}' with confidence "
                    f"{attempt.confidence:.2f}"
                )
            else:
                still_missing.append(field_name)
                logger.info(
                    f"[GapFillerAgent] Failed to fill '{field_name}': "
                    f"{attempt.error or 'no value extracted'}"
                )

        processing_time_ms = int((time.time() - start_time) * 1000)

        result = GapFillResult(
            success=len(filled) > 0,
            filled_fields=filled,
            still_missing=still_missing,
            attempts=attempts,
            total_retries=total_retries,
            total_llm_calls=total_llm_calls,
            skipped=False,
            processing_time_ms=processing_time_ms,
        )

        logger.info(
            f"[GapFillerAgent] Complete: filled {len(filled)}/{len(gap_candidates)} "
            f"fields, {total_llm_calls} LLM calls, {processing_time_ms}ms"
        )

        return result

    async def _extract_field_with_retry(
        self,
        field_name: str,
        original_text: str,
    ) -> GapFillAttempt:
        """
        단일 필드 재추출 (with retry)

        Args:
            field_name: 추출할 필드
            original_text: 원문 텍스트

        Returns:
            GapFillAttempt
        """
        start_time = time.time()
        prompt_config = self.FIELD_PROMPTS[field_name]
        retries_used = 0

        # 텍스트 길이 제한 (비용 절감)
        max_chars = 4000
        truncated_text = original_text[:max_chars] if len(original_text) > max_chars else original_text

        prompt = f"""{prompt_config["instruction"]}

Resume text:
---
{truncated_text}
---

Respond with ONLY valid JSON in this format:
{json.dumps(prompt_config["schema"], ensure_ascii=False)}"""

        system_prompt = """You are a targeted resume field extractor.
Extract ONLY the requested field from the provided resume text.
Rules:
- Use explicit evidence in text; if missing, return null or [].
- Never infer beyond reasonable textual evidence.
- Keep values normalized when format is requested (e.g., YYYY-MM, phone).
- Respond with ONLY one valid JSON object (no extra text)."""

        # OpenAI 메시지 형식으로 변환
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        # 모델명은 config에서 가져옴 (BUG-004 수정)
        settings = get_settings()

        for attempt in range(self.max_retries + 1):  # 첫 시도 + 재시도
            try:
                # 타임아웃 적용
                response = await asyncio.wait_for(
                    self.llm_manager.call_json(
                        provider=LLMProvider.OPENAI,
                        messages=messages,
                        model=settings.OPENAI_MINI_MODEL,
                        temperature=0.1,
                        max_tokens=500,
                    ),
                    timeout=self.timeout_seconds,
                )

                if response.error:
                    retries_used = attempt
                    if attempt < self.max_retries:
                        logger.debug(
                            f"[GapFillerAgent] Retry {attempt + 1} for '{field_name}': "
                            f"{response.error}"
                        )
                        continue
                    else:
                        return GapFillAttempt(
                            field_name=field_name,
                            success=False,
                            retries_used=retries_used,
                            error=response.error,
                            processing_time_ms=int((time.time() - start_time) * 1000),
                        )

                # call_json은 이미 파싱된 dict를 반환
                result_data = response.content if isinstance(response.content, dict) else json.loads(response.content)
                value = result_data.get(field_name)

                # 값 검증
                if self._is_valid_value(value):
                    return GapFillAttempt(
                        field_name=field_name,
                        success=True,
                        value=value,
                        confidence=0.85,  # LLM 재추출은 기본 0.85
                        retries_used=attempt,
                        processing_time_ms=int((time.time() - start_time) * 1000),
                    )
                else:
                    retries_used = attempt
                    if attempt < self.max_retries:
                        continue
                    else:
                        return GapFillAttempt(
                            field_name=field_name,
                            success=False,
                            retries_used=retries_used,
                            error="no_valid_value_extracted",
                            processing_time_ms=int((time.time() - start_time) * 1000),
                        )

            except asyncio.TimeoutError:
                retries_used = attempt
                logger.debug(
                    f"[GapFillerAgent] Timeout for '{field_name}' (attempt {attempt + 1})"
                )
                if attempt >= self.max_retries:
                    return GapFillAttempt(
                        field_name=field_name,
                        success=False,
                        retries_used=retries_used,
                        error="timeout",
                        processing_time_ms=int((time.time() - start_time) * 1000),
                    )

            except json.JSONDecodeError as e:
                retries_used = attempt
                logger.debug(
                    f"[GapFillerAgent] JSON error for '{field_name}': {e}"
                )
                if attempt >= self.max_retries:
                    return GapFillAttempt(
                        field_name=field_name,
                        success=False,
                        retries_used=retries_used,
                        error=f"json_error: {str(e)[:50]}",
                        processing_time_ms=int((time.time() - start_time) * 1000),
                    )

            except Exception as e:
                retries_used = attempt
                logger.error(
                    f"[GapFillerAgent] Unexpected error for '{field_name}': {e}"
                )
                return GapFillAttempt(
                    field_name=field_name,
                    success=False,
                    retries_used=retries_used,
                    error=f"exception: {str(e)[:50]}",
                    processing_time_ms=int((time.time() - start_time) * 1000),
                )

        # Should not reach here
        return GapFillAttempt(
            field_name=field_name,
            success=False,
            retries_used=retries_used,
            error="max_retries_exceeded",
            processing_time_ms=int((time.time() - start_time) * 1000),
        )

    def _is_valid_value(self, value: Any) -> bool:
        """추출된 값이 유효한지 확인"""
        if value is None:
            return False
        if isinstance(value, str) and len(value.strip()) == 0:
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        return True
