"""
Education Parser - 학력 정보 파싱 및 졸업 상태 판별

학력 정보에서:
- 졸업 상태 자동 판별 (종료일 기준)
- 학위 레벨 추출
- 전공 정보 정규화
"""

import re
import logging
from typing import Optional, List
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from utils.date_parser import parse_date, parse_date_range, ParsedDate

logger = logging.getLogger(__name__)


class GraduationStatus(str, Enum):
    """졸업 상태"""
    GRADUATED = "graduated"           # 졸업
    ENROLLED = "enrolled"             # 재학중
    EXPECTED = "expected"             # 졸업예정
    DROPOUT = "dropout"               # 중퇴
    LEAVE = "leave"                   # 휴학
    COMPLETED = "completed"           # 수료
    UNKNOWN = "unknown"               # 알 수 없음


class DegreeLevel(str, Enum):
    """학위 수준"""
    HIGH_SCHOOL = "high_school"       # 고등학교
    ASSOCIATE = "associate"           # 전문학사 (2-3년제)
    BACHELOR = "bachelor"             # 학사
    MASTER = "master"                 # 석사
    DOCTORATE = "doctorate"           # 박사
    OTHER = "other"                   # 기타


# 졸업 상태 키워드 매핑
GRADUATION_KEYWORDS = {
    GraduationStatus.GRADUATED: [
        "졸업", "졸", "卒業", "graduate", "graduated", "degree", "학위취득"
    ],
    GraduationStatus.ENROLLED: [
        "재학", "재학중", "재학 중", "在学", "enrolled", "attending", "student"
    ],
    GraduationStatus.EXPECTED: [
        "졸업예정", "졸업 예정", "예정", "expected", "graduating", "will graduate"
    ],
    GraduationStatus.DROPOUT: [
        "중퇴", "중도퇴학", "자퇴", "dropout", "withdrew", "discontinued"
    ],
    GraduationStatus.LEAVE: [
        "휴학", "휴학중", "leave", "on leave"
    ],
    GraduationStatus.COMPLETED: [
        "수료", "이수", "completed", "finished coursework"
    ],
}

# 학위 수준 키워드 매핑
DEGREE_KEYWORDS = {
    DegreeLevel.DOCTORATE: [
        "박사", "ph.d", "phd", "doctor", "doctorate", "d.phil"
    ],
    DegreeLevel.MASTER: [
        "석사", "master", "m.s.", "m.a.", "mba", "m.sc", "대학원"
    ],
    DegreeLevel.BACHELOR: [
        "학사", "bachelor", "b.s.", "b.a.", "b.sc", "학부", "대학교", "대학"
    ],
    DegreeLevel.ASSOCIATE: [
        "전문학사", "전문대", "associate", "a.a.", "a.s.", "2년제", "3년제"
    ],
    DegreeLevel.HIGH_SCHOOL: [
        "고등학교", "고졸", "high school", "highschool", "고교"
    ],
}


@dataclass
class EducationInfo:
    """학력 정보"""
    school: str
    major: Optional[str]
    degree: DegreeLevel
    status: GraduationStatus
    start_year: Optional[int]
    start_month: Optional[int]
    end_year: Optional[int]
    end_month: Optional[int]
    is_current: bool = False

    @property
    def period_str(self) -> str:
        """기간 문자열"""
        if self.start_year and self.end_year:
            start = f"{self.start_year}.{self.start_month:02d}" if self.start_month else str(self.start_year)
            if self.is_current:
                return f"{start} - 현재"
            end = f"{self.end_year}.{self.end_month:02d}" if self.end_month else str(self.end_year)
            return f"{start} - {end}"
        return ""


class EducationParser:
    """
    학력 정보 파서

    Features:
    - 종료일 기반 졸업 상태 자동 판별
    - 학위 수준 추출
    - 다양한 날짜 형식 지원
    """

    def determine_graduation_status(
        self,
        end_date_text: Optional[str] = None,
        explicit_status: Optional[str] = None,
    ) -> GraduationStatus:
        """
        졸업 상태 판별

        우선순위:
        1. 명시적 상태 키워드
        2. 종료일 기반 추론

        Args:
            end_date_text: 종료일 문자열
            explicit_status: 명시적 상태 문자열

        Returns:
            GraduationStatus
        """
        # 1. 명시적 상태 확인
        if explicit_status:
            status = self._parse_status_keyword(explicit_status)
            if status != GraduationStatus.UNKNOWN:
                return status

        # 2. 종료일 기반 추론
        if end_date_text:
            # 현재/재학중 키워드 확인
            text_lower = end_date_text.lower()
            for keyword in ["현재", "재학", "재직", "present", "current", "enrolled"]:
                if keyword in text_lower:
                    return GraduationStatus.ENROLLED

            # 날짜 파싱
            end_date = parse_date(end_date_text)
            if end_date:
                return self._infer_status_from_date(end_date)

        return GraduationStatus.UNKNOWN

    def _parse_status_keyword(self, text: str) -> GraduationStatus:
        """키워드에서 상태 추출"""
        text_lower = text.lower()

        for status, keywords in GRADUATION_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return status

        return GraduationStatus.UNKNOWN

    def _infer_status_from_date(self, end_date: ParsedDate) -> GraduationStatus:
        """
        종료일 기반 상태 추론

        - 현재 날짜: 재학중
        - 과거 날짜: 졸업
        - 미래 날짜 (3개월 이내): 졸업예정
        - 미래 날짜 (3개월 초과): 재학중
        """
        now = datetime.now()
        current_ym = now.year * 12 + now.month
        end_ym = end_date.year * 12 + end_date.month

        if end_date.is_current:
            return GraduationStatus.ENROLLED

        # 과거
        if end_ym < current_ym:
            return GraduationStatus.GRADUATED

        # 미래 (3개월 이내면 졸업예정)
        if end_ym <= current_ym + 3:
            return GraduationStatus.EXPECTED

        # 미래 (3개월 초과)
        return GraduationStatus.ENROLLED

    def determine_degree_level(self, text: str) -> DegreeLevel:
        """
        학위 수준 판별

        Args:
            text: 학교명, 학위명 등을 포함한 텍스트

        Returns:
            DegreeLevel
        """
        if not text:
            return DegreeLevel.OTHER

        text_lower = text.lower()

        # 높은 학위부터 확인 (박사 > 석사 > 학사 > 전문학사 > 고등학교)
        for level in [DegreeLevel.DOCTORATE, DegreeLevel.MASTER,
                      DegreeLevel.BACHELOR, DegreeLevel.ASSOCIATE,
                      DegreeLevel.HIGH_SCHOOL]:
            keywords = DEGREE_KEYWORDS[level]
            for keyword in keywords:
                if keyword in text_lower:
                    return level

        return DegreeLevel.OTHER

    def parse_education(
        self,
        school: str,
        major: Optional[str] = None,
        degree_text: Optional[str] = None,
        date_range_text: Optional[str] = None,
        start_text: Optional[str] = None,
        end_text: Optional[str] = None,
        status_text: Optional[str] = None,
    ) -> EducationInfo:
        """
        학력 정보 파싱

        Args:
            school: 학교명
            major: 전공
            degree_text: 학위 관련 텍스트
            date_range_text: "2015.03 - 2019.02" 형태 문자열
            start_text: 시작일 문자열
            end_text: 종료일 문자열
            status_text: 상태 문자열 (졸업, 재학중 등)

        Returns:
            EducationInfo
        """
        # 날짜 파싱
        start_date = None
        end_date = None
        is_current = False

        if date_range_text:
            start_date, end_date = parse_date_range(date_range_text)
        else:
            if start_text:
                start_date = parse_date(start_text)
            if end_text:
                end_date = parse_date(end_text)

        if end_date:
            is_current = end_date.is_current

        # 학위 수준 판별
        degree_source = " ".join(filter(None, [school, degree_text, major]))
        degree = self.determine_degree_level(degree_source)

        # 졸업 상태 판별
        status = self.determine_graduation_status(
            end_date_text=end_text or (date_range_text.split("-")[-1].strip() if date_range_text and "-" in date_range_text else None),
            explicit_status=status_text
        )

        return EducationInfo(
            school=school,
            major=major,
            degree=degree,
            status=status,
            start_year=start_date.year if start_date else None,
            start_month=start_date.month if start_date else None,
            end_year=end_date.year if end_date else None,
            end_month=end_date.month if end_date else None,
            is_current=is_current,
        )

    def get_highest_degree(self, educations: List[EducationInfo]) -> Optional[EducationInfo]:
        """최고 학력 반환"""
        if not educations:
            return None

        # 학위 수준 순서
        level_order = {
            DegreeLevel.DOCTORATE: 5,
            DegreeLevel.MASTER: 4,
            DegreeLevel.BACHELOR: 3,
            DegreeLevel.ASSOCIATE: 2,
            DegreeLevel.HIGH_SCHOOL: 1,
            DegreeLevel.OTHER: 0,
        }

        return max(educations, key=lambda e: level_order.get(e.degree, 0))


# 싱글톤 인스턴스
_education_parser: Optional[EducationParser] = None


def get_education_parser() -> EducationParser:
    """Education Parser 싱글톤 인스턴스 반환"""
    global _education_parser
    if _education_parser is None:
        _education_parser = EducationParser()
    return _education_parser


def determine_graduation_status(
    end_date_text: Optional[str] = None,
    explicit_status: Optional[str] = None,
) -> GraduationStatus:
    """편의 함수: 졸업 상태 판별"""
    return get_education_parser().determine_graduation_status(end_date_text, explicit_status)


def determine_degree_level(text: str) -> DegreeLevel:
    """편의 함수: 학위 수준 판별"""
    return get_education_parser().determine_degree_level(text)
