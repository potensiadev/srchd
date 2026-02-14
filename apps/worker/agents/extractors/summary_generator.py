"""
Summary Generator - 후보자 요약 및 분석 생성

summary, strengths, match_reason 생성
"""

import logging
from typing import Dict, Any, List, Optional

from .base_extractor import BaseExtractor, ExtractionResult

logger = logging.getLogger(__name__)


class SummaryGenerator(BaseExtractor):
    """
    요약 생성기

    생성 필드:
    - summary: 후보자 요약 (300자 이내)
    - strengths: 주요 강점 (3~5개)
    - match_reason: 핵심 소구점
    - key_achievements: 핵심 성과
    - career_trajectory: 커리어 방향성
    """

    EXTRACTOR_TYPE = "summary"

    # 강점 최소/최대 개수
    MIN_STRENGTHS = 3
    MAX_STRENGTHS = 5

    # 요약 최대 길이
    MAX_SUMMARY_LENGTH = 400

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        요약 데이터 후처리

        - 요약 길이 제한
        - 강점 개수 조정
        - 빈 값 정리
        """
        processed = self._remove_evidence_fields(data)

        # summary 길이 제한
        if "summary" in processed and processed["summary"]:
            summary = processed["summary"].strip()
            if len(summary) > self.MAX_SUMMARY_LENGTH:
                # 마지막 문장 끝에서 자르기
                summary = summary[:self.MAX_SUMMARY_LENGTH]
                last_period = max(
                    summary.rfind("."),
                    summary.rfind("다."),
                    summary.rfind("요.")
                )
                if last_period > self.MAX_SUMMARY_LENGTH // 2:
                    summary = summary[:last_period + 1]
            processed["summary"] = summary

        # strengths 개수 조정
        if "strengths" in processed and isinstance(processed["strengths"], list):
            strengths = [s.strip() for s in processed["strengths"] if s and isinstance(s, str)]
            # 최소 3개, 최대 5개
            if len(strengths) > self.MAX_STRENGTHS:
                strengths = strengths[:self.MAX_STRENGTHS]
            processed["strengths"] = strengths

        # match_reason 정리
        if "match_reason" in processed and processed["match_reason"]:
            processed["match_reason"] = processed["match_reason"].strip()

        # key_achievements 정리
        if "key_achievements" in processed and isinstance(processed["key_achievements"], list):
            achievements = [
                a.strip() for a in processed["key_achievements"]
                if a and isinstance(a, str)
            ][:3]  # 최대 3개
            processed["key_achievements"] = achievements

        return processed

    async def generate(
        self,
        text: str,
        extracted_data: Optional[Dict[str, Any]] = None,
        filename: Optional[str] = None,
        provider=None
    ) -> ExtractionResult:
        """
        요약 생성 (추출된 데이터 컨텍스트 포함)

        Args:
            text: 이력서 텍스트
            extracted_data: 다른 Extractor에서 추출한 데이터
            filename: 파일명
            provider: LLM 제공자

        Returns:
            ExtractionResult
        """
        # 추출된 데이터를 컨텍스트로 전달
        additional_context = {}
        if extracted_data:
            # 핵심 정보만 컨텍스트로 전달
            if "name" in extracted_data:
                additional_context["candidate_name"] = extracted_data["name"]
            if "exp_years" in extracted_data:
                additional_context["experience_years"] = extracted_data["exp_years"]
            if "current_company" in extracted_data:
                additional_context["current_company"] = extracted_data["current_company"]
            if "current_position" in extracted_data:
                additional_context["current_position"] = extracted_data["current_position"]
            if "skills" in extracted_data:
                additional_context["key_skills"] = ", ".join(extracted_data["skills"][:10])
            if "education_level" in extracted_data:
                additional_context["education"] = extracted_data["education_level"]

        return await self.extract(text, filename, provider, additional_context)

    def _build_system_prompt(self) -> str:
        """요약 생성용 시스템 프롬프트"""
        return f"""You are an expert recruiter and resume analyst.
Your task is to generate compelling candidate summaries for headhunters.

{self.prompt}

Writing Guidelines:

1. SUMMARY (300자 이내)
   - 핵심 경력, 전문 분야, 강점을 한 문단으로
   - 구체적인 수치나 성과 포함
   - 채용 담당자 관점에서 매력적으로

2. STRENGTHS (3~5개)
   - 구체적이고 차별화된 강점
   - Good: "10년 이상의 B2B SaaS PM 경력"
   - Good: "대규모 트래픽 처리 경험 (MAU 100만+)"
   - Bad: "성실함", "커뮤니케이션 능력"

3. MATCH_REASON (1문장)
   - Aha Moment를 줄 수 있는 핵심 소구점
   - 왜 이 후보자가 채용 시장에서 매력적인지

IMPORTANT:
- Write in Korean
- Be specific with numbers and achievements
- Focus on measurable impact
- Respond in JSON format only
"""

    def _build_user_prompt(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """요약 생성용 사용자 프롬프트"""
        prompt_parts = []

        # 추출된 정보 컨텍스트
        if additional_context:
            context_lines = ["Extracted Information:"]
            for key, value in additional_context.items():
                context_lines.append(f"- {key}: {value}")
            prompt_parts.append("\n".join(context_lines))

        prompt_parts.append(f"""Resume Text:
{text}

GENERATE:
1. summary: 후보자 요약 (300자 이내, 한국어)
   - 핵심 경력과 전문성 요약
   - 구체적인 성과 언급

2. strengths: 주요 강점 3~5개 (한국어)
   - 구체적이고 차별화된 강점
   - 수치/경험 기반

3. match_reason: 핵심 소구점 1문장 (한국어)
   - 이 후보자가 왜 매력적인지

4. key_achievements: 핵심 성과 최대 3개 (선택)

5. career_trajectory: 커리어 방향성 (선택)""")

        return "\n\n".join(prompt_parts)


# 싱글톤 인스턴스
_instance: Optional[SummaryGenerator] = None


def get_summary_generator() -> SummaryGenerator:
    """SummaryGenerator 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = SummaryGenerator()
    return _instance
