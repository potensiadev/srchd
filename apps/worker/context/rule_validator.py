"""
Rule Validator - 날짜/회사명/학위 등 필드값 정규화 및 검증

LLM 추출 결과에 규칙 기반 검증과 정규화를 적용합니다:
- 날짜 형식 통일 (YYYY-MM)
- 회사명 정규화
- 학위 정규화
- 전화번호/이메일 검증
"""

import logging
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """
    검증 결과
    """
    field_name: str
    original_value: Any
    normalized_value: Any
    is_valid: bool
    changes_made: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "original_value": self.original_value,
            "normalized_value": self.normalized_value,
            "is_valid": self.is_valid,
            "changes_made": self.changes_made,
            "warnings": self.warnings,
            "errors": self.errors
        }


class RuleValidator:
    """
    필드별 규칙 기반 검증 및 정규화

    지원 필드:
    - 날짜: start_date, end_date, graduation_year
    - 회사명: company
    - 학위: degree, education_level
    - 연락처: phone, email
    - 경력 연수: exp_years
    """

    # 학위 정규화 매핑
    DEGREE_NORMALIZATION = {
        # 한글
        "박사": "박사",
        "ph.d": "박사",
        "phd": "박사",
        "doctor": "박사",
        "doctorate": "박사",
        "석사": "석사",
        "master": "석사",
        "masters": "석사",
        "m.s": "석사",
        "m.s.": "석사",
        "ms": "석사",
        "m.a": "석사",
        "m.a.": "석사",
        "ma": "석사",
        "mba": "석사",
        "학사": "학사",
        "bachelor": "학사",
        "bachelors": "학사",
        "b.s": "학사",
        "b.s.": "학사",
        "bs": "학사",
        "b.a": "학사",
        "b.a.": "학사",
        "ba": "학사",
        "전문학사": "전문학사",
        "associate": "전문학사",
        "고졸": "고졸",
        "high school": "고졸",
        # 최종 학력 레벨
        "대학원졸": "석사",
        "대졸": "학사",
        "대학교졸업": "학사",
        "전문대졸": "전문학사",
        "전문대학졸업": "전문학사",
    }

    # 학력 레벨 정규화
    EDUCATION_LEVEL_NORMALIZATION = {
        "박사": "박사",
        "석사": "석사",
        "대학원": "석사",
        "대학원졸": "석사",
        "학사": "학사",
        "대졸": "학사",
        "대학교": "학사",
        "4년제": "학사",
        "전문학사": "전문학사",
        "전문대": "전문학사",
        "2년제": "전문학사",
        "고졸": "고졸",
        "고등학교": "고졸",
    }

    # 회사 접미사 정규화
    COMPANY_SUFFIXES = [
        "(주)", "주식회사", "㈜", "(유)", "유한회사",
        "corp", "corp.", "corporation",
        "inc", "inc.", "incorporated",
        "co", "co.", "company",
        "ltd", "ltd.", "limited",
        "llc", "l.l.c."
    ]

    # 대기업 회사명 정규화
    COMPANY_NORMALIZATION = {
        "삼성전자": ["samsung", "삼성 전자", "samsung electronics"],
        "LG전자": ["lg electronics", "lg 전자", "엘지전자", "엘지 전자"],
        "SK하이닉스": ["sk hynix", "에스케이하이닉스", "sk 하이닉스"],
        "현대자동차": ["hyundai", "hyundai motor", "현대 자동차"],
        "네이버": ["naver", "nhn", "네이버㈜"],
        "카카오": ["kakao", "다음카카오", "카카오㈜"],
        "쿠팡": ["coupang", "쿠팡㈜"],
        "배달의민족": ["woowa", "우아한형제들", "배민"],
        "토스": ["toss", "비바리퍼블리카", "viva republica"],
        "당근마켓": ["karrot", "당근", "danggeun"],
    }

    def __init__(self):
        self.validation_results: Dict[str, ValidationResult] = {}

    def validate_and_normalize(
        self,
        field_name: str,
        value: Any,
        context: Optional[Dict[str, Any]] = None
    ) -> ValidationResult:
        """
        필드값 검증 및 정규화

        Args:
            field_name: 필드명
            value: 원본 값
            context: 추가 컨텍스트 (예: 다른 필드 값 참조)

        Returns:
            ValidationResult
        """
        context = context or {}

        # 필드별 검증 함수 매핑
        validators = {
            "start_date": self._validate_date,
            "end_date": self._validate_date,
            "graduation_year": self._validate_graduation_year,
            "company": self._validate_company,
            "degree": self._validate_degree,
            "education_level": self._validate_education_level,
            "phone": self._validate_phone,
            "email": self._validate_email,
            "exp_years": self._validate_exp_years,
            "birth_year": self._validate_birth_year,
            "name": self._validate_name,
            "skills": self._validate_skills,
            "position": self._validate_position,
        }

        # 기본 결과
        result = ValidationResult(
            field_name=field_name,
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if value is None:
            result.is_valid = True  # None은 유효함 (필드 없음)
            self.validation_results[field_name] = result
            return result

        # 특정 필드 검증
        validator = validators.get(field_name)
        if validator:
            result = validator(value, context)
        else:
            # 알 수 없는 필드는 그대로 통과
            result = ValidationResult(
                field_name=field_name,
                original_value=value,
                normalized_value=value,
                is_valid=True
            )

        self.validation_results[field_name] = result
        return result

    def validate_careers(
        self,
        careers: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        경력 목록 전체 검증 및 정규화

        Returns:
            (정규화된 경력 목록, 경고 목록)
        """
        if not careers:
            return [], []

        normalized_careers = []
        all_warnings = []

        for i, career in enumerate(careers):
            normalized_career = {}

            # 회사명
            if "company" in career:
                result = self._validate_company(career["company"], {})
                normalized_career["company"] = result.normalized_value
                all_warnings.extend([f"careers[{i}].company: {w}" for w in result.warnings])

            # 직책
            if "position" in career:
                result = self._validate_position(career["position"], {})
                normalized_career["position"] = result.normalized_value

            # 부서
            if "department" in career:
                normalized_career["department"] = career["department"]

            # 날짜
            if "start_date" in career:
                result = self._validate_date(career["start_date"], {})
                normalized_career["start_date"] = result.normalized_value
                if not result.is_valid:
                    all_warnings.append(f"careers[{i}].start_date: 날짜 형식 오류")

            if "end_date" in career:
                result = self._validate_date(career["end_date"], {})
                normalized_career["end_date"] = result.normalized_value

            # 현재 재직 여부
            if "is_current" in career:
                normalized_career["is_current"] = bool(career["is_current"])

            # is_current와 end_date 논리적 일관성 검증
            # is_current=True이면 end_date는 None이어야 함 (현재 재직 중인데 종료일이 있으면 모순)
            if normalized_career.get("is_current") and normalized_career.get("end_date"):
                all_warnings.append(
                    f"careers[{i}]: is_current=True이지만 end_date가 있음, end_date 제거함"
                )
                normalized_career["end_date"] = None

            # 설명
            if "description" in career:
                normalized_career["description"] = career["description"]

            # Evidence 필드 (있으면 그대로 복사)
            for key in career:
                if key.endswith("_evidence") and key not in normalized_career:
                    normalized_career[key] = career[key]

            normalized_careers.append(normalized_career)

        # 날짜 순서 검증
        date_warnings = self._validate_career_dates(normalized_careers)
        all_warnings.extend(date_warnings)

        return normalized_careers, all_warnings

    def validate_educations(
        self,
        educations: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        학력 목록 전체 검증 및 정규화
        """
        if not educations:
            return [], []

        normalized_educations = []
        all_warnings = []

        for i, edu in enumerate(educations):
            normalized_edu = {}

            # 학교명
            if "school" in edu:
                normalized_edu["school"] = edu["school"]

            # 학위
            if "degree" in edu:
                result = self._validate_degree(edu["degree"], {})
                normalized_edu["degree"] = result.normalized_value
                all_warnings.extend([f"educations[{i}].degree: {w}" for w in result.warnings])

            # 전공
            if "major" in edu:
                normalized_edu["major"] = edu["major"]

            # 졸업 연도
            if "graduation_year" in edu:
                result = self._validate_graduation_year(edu["graduation_year"], {})
                normalized_edu["graduation_year"] = result.normalized_value
                if not result.is_valid:
                    all_warnings.append(f"educations[{i}].graduation_year: {result.errors}")

            # 졸업 여부
            if "is_graduated" in edu:
                normalized_edu["is_graduated"] = bool(edu["is_graduated"])

            # Evidence 필드
            for key in edu:
                if key.endswith("_evidence") and key not in normalized_edu:
                    normalized_edu[key] = edu[key]

            normalized_educations.append(normalized_edu)

        return normalized_educations, all_warnings

    # ─────────────────────────────────────────────────────────────────────────
    # 개별 필드 검증 함수들
    # ─────────────────────────────────────────────────────────────────────────

    def _validate_date(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """날짜 검증 및 YYYY-MM 형식으로 정규화"""
        result = ValidationResult(
            field_name="date",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if value is None:
            return result

        if not isinstance(value, str):
            value = str(value)

        original = value
        value = value.strip()

        # 이미 올바른 형식인지 확인
        if re.match(r"^\d{4}-\d{2}$", value):
            result.normalized_value = value
            return result

        # 다양한 형식 시도
        patterns = [
            (r"^(\d{4})\.(\d{1,2})$", "{}-{:02d}"),  # 2023.1 → 2023-01
            (r"^(\d{4})/(\d{1,2})$", "{}-{:02d}"),   # 2023/1 → 2023-01
            (r"^(\d{4})년\s*(\d{1,2})월$", "{}-{:02d}"),  # 2023년 3월
            (r"^(\d{4})-(\d{1,2})$", "{}-{:02d}"),   # 2023-3 → 2023-03
            (r"^(\d{4})(\d{2})$", "{}-{}"),          # 202303 → 2023-03
        ]

        for pattern, fmt in patterns:
            match = re.match(pattern, value)
            if match:
                year, month = match.groups()
                month = int(month)
                if 1 <= month <= 12:
                    result.normalized_value = fmt.format(year, month)
                    if result.normalized_value != original:
                        result.changes_made.append(f"날짜 형식 정규화: {original} → {result.normalized_value}")
                    return result

        # 연도만 있는 경우
        year_match = re.match(r"^(\d{4})$", value)
        if year_match:
            result.normalized_value = f"{year_match.group(1)}-01"
            result.changes_made.append(f"연도만 있어 월을 01로 설정: {original}")
            result.warnings.append("월 정보 없음, 01월로 가정")
            return result

        # 파싱 실패
        result.is_valid = False
        result.errors.append(f"날짜 형식 인식 불가: {value}")
        return result

    def _validate_graduation_year(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """졸업 연도 검증"""
        result = ValidationResult(
            field_name="graduation_year",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if value is None:
            return result

        # 숫자로 변환
        try:
            year = int(value)
        except (ValueError, TypeError):
            result.is_valid = False
            result.errors.append(f"연도를 숫자로 변환 불가: {value}")
            return result

        current_year = datetime.now().year

        # 범위 검증
        if year < 1950:
            result.is_valid = False
            result.errors.append(f"비정상적으로 이른 연도: {year}")
        elif year > current_year + 5:
            result.is_valid = False
            result.errors.append(f"미래 연도: {year}")
        elif year > current_year:
            result.warnings.append(f"졸업 예정: {year}")

        result.normalized_value = year
        return result

    def _validate_company(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """회사명 검증 및 정규화"""
        result = ValidationResult(
            field_name="company",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        original = value
        normalized = value.strip()

        # 앞뒤 공백 제거
        normalized = " ".join(normalized.split())

        # 대기업 정규화 확인
        lower_normalized = normalized.lower()
        for standard_name, variations in self.COMPANY_NORMALIZATION.items():
            if lower_normalized in [v.lower() for v in variations]:
                normalized = standard_name
                result.changes_made.append(f"회사명 정규화: {original} → {normalized}")
                break

        # 회사 접미사 정규화 (제거하지 않고 일관성 있게)
        # (주), ㈜ 등은 유지

        result.normalized_value = normalized
        return result

    def _validate_degree(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """학위 검증 및 정규화"""
        result = ValidationResult(
            field_name="degree",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        original = value
        lower_value = value.lower().strip()

        # 정규화 시도
        for key, normalized in self.DEGREE_NORMALIZATION.items():
            if key in lower_value:
                result.normalized_value = normalized
                if result.normalized_value != original:
                    result.changes_made.append(f"학위 정규화: {original} → {normalized}")
                return result

        # 정규화 실패 - 원본 유지
        result.warnings.append(f"알 수 없는 학위: {value}")
        return result

    def _validate_education_level(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """학력 레벨 검증 및 정규화"""
        result = ValidationResult(
            field_name="education_level",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        original = value
        lower_value = value.lower().strip()

        # 정규화 시도
        for key, normalized in self.EDUCATION_LEVEL_NORMALIZATION.items():
            if key in lower_value:
                result.normalized_value = normalized
                if result.normalized_value != original:
                    result.changes_made.append(f"학력 정규화: {original} → {normalized}")
                return result

        return result

    def _validate_phone(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """전화번호 검증"""
        result = ValidationResult(
            field_name="phone",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        # 숫자만 추출
        digits = re.sub(r"\D", "", value)

        # 한국 휴대폰 번호 형식 확인
        if re.match(r"^01[016789]\d{7,8}$", digits):
            # 010-0000-0000 형식으로 정규화
            if len(digits) == 11:
                normalized = f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
            else:  # 10자리
                normalized = f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
            result.normalized_value = normalized
            if normalized != value:
                result.changes_made.append(f"전화번호 정규화: {value} → {normalized}")
        else:
            result.is_valid = False
            result.errors.append(f"유효하지 않은 휴대폰 번호: {value}")

        return result

    def _validate_email(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """이메일 검증"""
        result = ValidationResult(
            field_name="email",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        # 기본 이메일 형식 확인
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, value.strip()):
            result.is_valid = False
            result.errors.append(f"유효하지 않은 이메일: {value}")

        result.normalized_value = value.strip().lower()
        return result

    def _validate_exp_years(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """경력 연수 검증"""
        result = ValidationResult(
            field_name="exp_years",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if value is None:
            return result

        # 숫자로 변환
        try:
            years = float(value)
        except (ValueError, TypeError):
            result.is_valid = False
            result.errors.append(f"경력 연수 숫자 변환 불가: {value}")
            return result

        # 범위 검증
        if years < 0:
            result.is_valid = False
            result.errors.append("음수 경력 연수")
        elif years > 50:
            result.warnings.append(f"비정상적으로 긴 경력: {years}년")

        # 소수점 첫째 자리로 반올림
        result.normalized_value = round(years, 1)
        return result

    def _validate_birth_year(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """출생 연도 검증"""
        result = ValidationResult(
            field_name="birth_year",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if value is None:
            return result

        try:
            year = int(value)
        except (ValueError, TypeError):
            result.is_valid = False
            result.errors.append(f"연도 숫자 변환 불가: {value}")
            return result

        current_year = datetime.now().year

        if year < 1940:
            result.is_valid = False
            result.errors.append(f"비정상적으로 이른 출생 연도: {year}")
        elif year > current_year - 15:
            result.is_valid = False
            result.errors.append(f"비정상적으로 최근 출생 연도: {year}")

        result.normalized_value = year
        return result

    def _validate_name(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """이름 검증"""
        result = ValidationResult(
            field_name="name",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            result.is_valid = False
            result.errors.append("이름이 비어있음")
            return result

        name = value.strip()

        # 너무 짧거나 긴 이름
        if len(name) < 2:
            result.warnings.append("이름이 너무 짧음")
        elif len(name) > 20:
            result.warnings.append("이름이 너무 김")

        result.normalized_value = name
        return result

    def _validate_skills(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """스킬 목록 검증"""
        result = ValidationResult(
            field_name="skills",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value:
            return result

        if not isinstance(value, list):
            result.is_valid = False
            result.errors.append("스킬은 리스트여야 함")
            return result

        # 중복 제거 및 정규화
        seen = set()
        normalized_skills = []
        for skill in value:
            if not skill or not isinstance(skill, str):
                continue
            normalized = skill.strip()
            lower_skill = normalized.lower()
            if lower_skill not in seen:
                seen.add(lower_skill)
                normalized_skills.append(normalized)

        if len(normalized_skills) != len(value):
            result.changes_made.append(f"스킬 중복 제거: {len(value)} → {len(normalized_skills)}")

        result.normalized_value = normalized_skills
        return result

    def _validate_position(
        self,
        value: Any,
        context: Dict[str, Any]
    ) -> ValidationResult:
        """직책 검증"""
        result = ValidationResult(
            field_name="position",
            original_value=value,
            normalized_value=value,
            is_valid=True
        )

        if not value or not isinstance(value, str):
            return result

        result.normalized_value = value.strip()
        return result

    def _validate_career_dates(
        self,
        careers: List[Dict[str, Any]]
    ) -> List[str]:
        """경력 날짜 순서 검증"""
        warnings = []

        for i, career in enumerate(careers):
            start = career.get("start_date")
            end = career.get("end_date")

            if start and end:
                # 시작일이 종료일보다 늦으면 경고
                if start > end:
                    warnings.append(
                        f"careers[{i}]: 시작일({start})이 종료일({end})보다 늦음"
                    )

        return warnings

    def get_summary(self) -> Dict[str, Any]:
        """검증 결과 요약"""
        total = len(self.validation_results)
        valid = sum(1 for r in self.validation_results.values() if r.is_valid)
        with_warnings = sum(1 for r in self.validation_results.values() if r.warnings)
        with_changes = sum(1 for r in self.validation_results.values() if r.changes_made)

        return {
            "total_validated": total,
            "valid_count": valid,
            "invalid_count": total - valid,
            "with_warnings": with_warnings,
            "with_changes": with_changes,
            "all_valid": total == valid
        }

    def to_dict(self) -> Dict[str, Any]:
        """전체 결과를 딕셔너리로 변환"""
        return {
            field_name: result.to_dict()
            for field_name, result in self.validation_results.items()
        }


# 전역 인스턴스 생성 함수
def create_rule_validator() -> RuleValidator:
    """새 RuleValidator 인스턴스 생성"""
    return RuleValidator()
