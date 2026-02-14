"""
Profile Extractor - 기본 프로필 정보 추출

name, phone, email, birth_year, gender, address 추출
"""

import logging
import re
from typing import Dict, Any, Optional

from .base_extractor import BaseExtractor, ExtractionResult
from context.rule_validator import RuleValidator

logger = logging.getLogger(__name__)


class ProfileExtractor(BaseExtractor):
    """
    프로필 정보 추출기

    추출 필드:
    - name: 이름
    - birth_year: 출생 연도
    - gender: 성별
    - phone: 전화번호
    - email: 이메일
    - address: 주소
    - location_city: 거주 도시
    """

    EXTRACTOR_TYPE = "profile"

    def __init__(self):
        super().__init__()
        self.rule_validator = RuleValidator()

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        프로필 데이터 후처리

        - 이름 정규화
        - 전화번호 형식 검증
        - 이메일 형식 검증
        - 출생연도 범위 검증
        """
        processed = self._remove_evidence_fields(data)

        # 이름 검증
        if "name" in processed:
            result = self.rule_validator.validate_and_normalize("name", processed["name"])
            processed["name"] = result.normalized_value
            if not result.is_valid:
                logger.warning(f"[ProfileExtractor] 이름 검증 실패: {result.errors}")

        # 전화번호 검증
        if "phone" in processed:
            result = self.rule_validator.validate_and_normalize("phone", processed["phone"])
            processed["phone"] = result.normalized_value
            if not result.is_valid:
                logger.debug(f"[ProfileExtractor] 전화번호 검증 실패: {result.errors}")
                # 전화번호는 검증 실패해도 유지

        # 이메일 검증
        if "email" in processed:
            result = self.rule_validator.validate_and_normalize("email", processed["email"])
            processed["email"] = result.normalized_value
            if not result.is_valid:
                logger.debug(f"[ProfileExtractor] 이메일 검증 실패: {result.errors}")

        # 출생연도 검증
        if "birth_year" in processed:
            result = self.rule_validator.validate_and_normalize("birth_year", processed["birth_year"])
            processed["birth_year"] = result.normalized_value
            if not result.is_valid:
                del processed["birth_year"]
                logger.warning(f"[ProfileExtractor] 출생연도 검증 실패: {result.errors}")

        # 성별 정규화
        if "gender" in processed:
            gender = str(processed["gender"]).lower().strip()
            if gender in ["male", "m", "남", "남성", "남자"]:
                processed["gender"] = "male"
            elif gender in ["female", "f", "여", "여성", "여자"]:
                processed["gender"] = "female"
            else:
                del processed["gender"]

        return processed

    def extract_name_from_filename(self, filename: str) -> Optional[str]:
        """
        파일명에서 이름 추출

        예:
        - "김철수_이력서.pdf" → "김철수"
        - "이력서_홍길동.docx" → "홍길동"
        - "resume_john_doe.pdf" → "john doe"
        """
        if not filename:
            return None

        # 확장자 제거
        name_part = re.sub(r"\.(pdf|docx?|hwp|hwpx?)$", "", filename, flags=re.IGNORECASE)

        # 일반적인 이력서 관련 단어 제거
        keywords = [
            "이력서", "경력기술서", "자기소개서", "resume", "cv",
            "경력", "이력", "포트폴리오", "portfolio"
        ]
        for keyword in keywords:
            name_part = re.sub(keyword, "", name_part, flags=re.IGNORECASE)

        # 구분자로 분리
        parts = re.split(r"[_\-\s]+", name_part)
        parts = [p.strip() for p in parts if p.strip()]

        if not parts:
            return None

        # 한글 이름 패턴 (2-4자)
        for part in parts:
            if re.match(r"^[가-힣]{2,4}$", part):
                return part

        # 영문 이름 패턴
        english_parts = [p for p in parts if re.match(r"^[a-zA-Z]+$", p)]
        if len(english_parts) >= 2:
            return " ".join(english_parts[:2]).title()

        # 첫 번째 의미있는 부분 반환
        for part in parts:
            if len(part) >= 2 and not re.match(r"^\d+$", part):
                return part

        return None

    async def extract(
        self,
        text: str,
        filename: Optional[str] = None,
        provider=None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        """
        프로필 정보 추출 (파일명 힌트 포함)
        """
        # 파일명에서 이름 힌트 추출
        name_hint = self.extract_name_from_filename(filename) if filename else None

        # 추가 컨텍스트에 힌트 추가
        context = additional_context or {}
        if name_hint:
            context["name_hint_from_filename"] = name_hint

        result = await super().extract(text, filename, provider, context)

        # 결과에 이름이 없으면 파일명에서 추출한 이름 사용
        if result.success and not result.data.get("name") and name_hint:
            result.data["name"] = name_hint
            result.confidence_map["name"] = 0.6  # 파일명 추출은 낮은 신뢰도
            result.warnings.append("이름을 파일명에서 추출함")

        return result


# 싱글톤 인스턴스
_instance: Optional[ProfileExtractor] = None


def get_profile_extractor() -> ProfileExtractor:
    """ProfileExtractor 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = ProfileExtractor()
    return _instance
