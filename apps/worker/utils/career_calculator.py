"""
Career Calculator - 경력 개월수 계산

경력 기간을 개월수로 계산:
- 다양한 날짜 형식 지원 (date_parser 사용)
- 중복 기간 처리
- "X년 X개월" 형식 출력
"""

import logging
from typing import List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from utils.date_parser import parse_date, parse_date_range, ParsedDate

logger = logging.getLogger(__name__)


@dataclass
class CareerPeriod:
    """경력 기간"""
    start_year: int
    start_month: int
    end_year: int
    end_month: int
    is_current: bool = False
    company: str = ""
    position: str = ""

    @property
    def months(self) -> int:
        """경력 개월수 계산"""
        total = (self.end_year - self.start_year) * 12 + (self.end_month - self.start_month)
        # 최소 1개월
        return max(1, total + 1)  # 시작월 포함

    def overlaps_with(self, other: 'CareerPeriod') -> bool:
        """다른 기간과 겹치는지 확인"""
        self_start = self.start_year * 12 + self.start_month
        self_end = self.end_year * 12 + self.end_month
        other_start = other.start_year * 12 + other.start_month
        other_end = other.end_year * 12 + other.end_month

        return not (self_end < other_start or other_end < self_start)


@dataclass
class CareerSummary:
    """경력 요약"""
    total_months: int
    periods: List[CareerPeriod]
    has_current_job: bool

    @property
    def years(self) -> int:
        """총 경력 년수"""
        return self.total_months // 12

    @property
    def remaining_months(self) -> int:
        """년수 제외 남은 개월수"""
        return self.total_months % 12

    def format_korean(self) -> str:
        """한국어 형식: X년 X개월"""
        years = self.years
        months = self.remaining_months

        if years == 0:
            return f"{months}개월"
        elif months == 0:
            return f"{years}년"
        else:
            return f"{years}년 {months}개월"

    def format_short(self) -> str:
        """짧은 형식: Xy Xm"""
        years = self.years
        months = self.remaining_months

        if years == 0:
            return f"{months}m"
        elif months == 0:
            return f"{years}y"
        else:
            return f"{years}y {months}m"


class CareerCalculator:
    """
    경력 개월수 계산기

    Features:
    - 다양한 날짜 형식 지원
    - 중복 기간 자동 제거
    - 현재 재직중 처리
    """

    def calculate_months(
        self,
        start_text: str,
        end_text: str,
    ) -> int:
        """
        단일 경력 기간의 개월수 계산

        Args:
            start_text: 시작일 문자열 ("2020.01", "2020년 1월" 등)
            end_text: 종료일 문자열 ("2022.06", "현재" 등)

        Returns:
            개월수 (최소 1)
        """
        start_date = parse_date(start_text)
        end_date = parse_date(end_text)

        if start_date is None:
            logger.warning(f"Failed to parse start date: {start_text}")
            return 0

        if end_date is None:
            logger.warning(f"Failed to parse end date: {end_text}")
            return 0

        # 개월수 계산
        total = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
        return max(1, total + 1)  # 시작월 포함, 최소 1개월

    def parse_career_period(
        self,
        date_range_text: str,
        company: str = "",
        position: str = "",
    ) -> Optional[CareerPeriod]:
        """
        경력 기간 문자열 파싱

        Args:
            date_range_text: "2020.01 - 2022.06" 형태의 문자열
            company: 회사명
            position: 직급

        Returns:
            CareerPeriod 또는 None
        """
        start_date, end_date = parse_date_range(date_range_text)

        if start_date is None:
            return None

        # 종료일이 없으면 현재로 처리
        if end_date is None:
            now = datetime.now()
            end_year, end_month = now.year, now.month
            is_current = True
        else:
            end_year, end_month = end_date.year, end_date.month
            is_current = end_date.is_current

        return CareerPeriod(
            start_year=start_date.year,
            start_month=start_date.month,
            end_year=end_year,
            end_month=end_month,
            is_current=is_current,
            company=company,
            position=position,
        )

    def calculate_total_experience(
        self,
        periods: List[CareerPeriod],
        remove_overlaps: bool = True,
    ) -> CareerSummary:
        """
        총 경력 개월수 계산

        Args:
            periods: 경력 기간 목록
            remove_overlaps: 중복 기간 제거 여부

        Returns:
            CareerSummary
        """
        if not periods:
            return CareerSummary(total_months=0, periods=[], has_current_job=False)

        has_current = any(p.is_current for p in periods)

        if not remove_overlaps:
            # 단순 합산
            total = sum(p.months for p in periods)
            return CareerSummary(
                total_months=total,
                periods=periods,
                has_current_job=has_current
            )

        # 중복 기간 제거 (월 단위 비트맵 방식)
        worked_months = set()

        for period in periods:
            start = period.start_year * 12 + period.start_month
            end = period.end_year * 12 + period.end_month

            for month in range(start, end + 1):
                worked_months.add(month)

        total_months = len(worked_months)

        return CareerSummary(
            total_months=total_months,
            periods=periods,
            has_current_job=has_current
        )

    def calculate_from_career_list(
        self,
        careers: List[dict],
    ) -> CareerSummary:
        """
        경력 목록에서 총 경력 계산

        Args:
            careers: 경력 정보 딕셔너리 목록
                     [{"start": "2020.01", "end": "2022.06", "company": "ABC"}, ...]
                     또는
                     [{"period": "2020.01 - 2022.06", "company": "ABC"}, ...]

        Returns:
            CareerSummary
        """
        periods = []

        for career in careers:
            period = None

            # 방식 1: start/end 분리
            if "start" in career and "end" in career:
                start_date = parse_date(career["start"])
                end_date = parse_date(career["end"])

                if start_date:
                    if end_date is None:
                        now = datetime.now()
                        end_year, end_month = now.year, now.month
                        is_current = True
                    else:
                        end_year, end_month = end_date.year, end_date.month
                        is_current = end_date.is_current

                    period = CareerPeriod(
                        start_year=start_date.year,
                        start_month=start_date.month,
                        end_year=end_year,
                        end_month=end_month,
                        is_current=is_current,
                        company=career.get("company", ""),
                        position=career.get("position", ""),
                    )

            # 방식 2: period 문자열
            elif "period" in career:
                period = self.parse_career_period(
                    career["period"],
                    company=career.get("company", ""),
                    position=career.get("position", ""),
                )

            # 방식 3: date_range 문자열
            elif "date_range" in career:
                period = self.parse_career_period(
                    career["date_range"],
                    company=career.get("company", ""),
                    position=career.get("position", ""),
                )

            if period:
                periods.append(period)

        return self.calculate_total_experience(periods, remove_overlaps=True)


# 싱글톤 인스턴스
_career_calculator: Optional[CareerCalculator] = None


def get_career_calculator() -> CareerCalculator:
    """Career Calculator 싱글톤 인스턴스 반환"""
    global _career_calculator
    if _career_calculator is None:
        _career_calculator = CareerCalculator()
    return _career_calculator


def calculate_career_months(start_text: str, end_text: str) -> int:
    """편의 함수: 경력 개월수 계산"""
    return get_career_calculator().calculate_months(start_text, end_text)


def calculate_total_experience(careers: List[dict]) -> CareerSummary:
    """편의 함수: 총 경력 계산"""
    return get_career_calculator().calculate_from_career_list(careers)


def format_experience_korean(months: int) -> str:
    """편의 함수: 개월수를 한국어 형식으로 변환"""
    years = months // 12
    remaining = months % 12

    if years == 0:
        return f"{remaining}개월"
    elif remaining == 0:
        return f"{years}년"
    else:
        return f"{years}년 {remaining}개월"
