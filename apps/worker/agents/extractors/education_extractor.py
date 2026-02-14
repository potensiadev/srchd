"""
Education Extractor - 학력 정보 추출

educations, education_level, education_school 추출
"""

import logging
from typing import Dict, Any, List, Optional

from .base_extractor import BaseExtractor, ExtractionResult
from context.rule_validator import RuleValidator

logger = logging.getLogger(__name__)


class EducationExtractor(BaseExtractor):
    """
    학력 정보 추출기

    추출 필드:
    - education_level: 최종 학력
    - education_school: 최종 학교명
    - education_major: 최종 전공
    - educations[]: 학력 목록
    """

    EXTRACTOR_TYPE = "education"

    # 학력 레벨 순위 (높을수록 고학력)
    EDUCATION_LEVEL_RANKS = {
        "박사": 5,
        "석사": 4,
        "학사": 3,
        "전문학사": 2,
        "고졸": 1,
    }

    def __init__(self):
        super().__init__()
        self.rule_validator = RuleValidator()

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        학력 데이터 후처리

        - 학위 정규화
        - 졸업연도 검증
        - 최종 학력 추출
        """
        processed = self._remove_evidence_fields(data)

        # educations 정규화
        if "educations" in processed and isinstance(processed["educations"], list):
            normalized_educations, warnings = self.rule_validator.validate_educations(
                processed["educations"]
            )
            processed["educations"] = normalized_educations
            for warning in warnings:
                logger.debug(f"[EducationExtractor] {warning}")

            # 최종 학력 추출
            highest = self._extract_highest_education(processed["educations"])
            if highest:
                if "education_level" not in processed:
                    processed["education_level"] = highest.get("degree")
                if "education_school" not in processed:
                    processed["education_school"] = highest.get("school")
                if "education_major" not in processed:
                    processed["education_major"] = highest.get("major")

        # education_level 정규화
        if "education_level" in processed:
            result = self.rule_validator.validate_and_normalize(
                "education_level", processed["education_level"]
            )
            processed["education_level"] = result.normalized_value

        return processed

    def _extract_highest_education(
        self,
        educations: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        최고 학력 추출

        학력 레벨 > 졸업연도 순으로 우선순위
        """
        if not educations:
            return None

        def get_education_rank(edu: Dict[str, Any]) -> tuple:
            degree = edu.get("degree", "")
            level_rank = self.EDUCATION_LEVEL_RANKS.get(degree, 0)

            # 학력 레벨로 정규화 시도
            if level_rank == 0:
                result = self.rule_validator.validate_and_normalize("degree", degree)
                normalized = result.normalized_value
                level_rank = self.EDUCATION_LEVEL_RANKS.get(normalized, 0)

            grad_year = edu.get("graduation_year", 0) or 0

            return (level_rank, grad_year)

        # 가장 높은 학력 반환
        return max(educations, key=get_education_rank)

    def _build_user_prompt(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """학력 추출용 사용자 프롬프트"""
        prompt_parts = []

        if filename:
            prompt_parts.append(f"Filename: {filename}")

        if additional_context:
            context_str = "\n".join(
                f"- {k}: {v}" for k, v in additional_context.items()
            )
            prompt_parts.append(f"Additional Context:\n{context_str}")

        prompt_parts.append(f"""Resume Text:
{text}

IMPORTANT INSTRUCTIONS:
1. Extract ALL education entries (high school, college, graduate school)
2. For each education entry, include:
   - school: School/university name
   - degree: Degree level (박사/석사/학사/전문학사/고졸)
   - major: Field of study/major
   - graduation_year: Year of graduation (4-digit year)
   - is_graduated: Whether graduated (true/false)
3. Include evidence fields (*_evidence) with original text excerpts
4. Identify the highest education level as education_level""")

        return "\n\n".join(prompt_parts)


# 싱글톤 인스턴스
_instance: Optional[EducationExtractor] = None


def get_education_extractor() -> EducationExtractor:
    """EducationExtractor 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = EducationExtractor()
    return _instance
