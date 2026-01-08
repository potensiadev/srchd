"""
Career Calculator Tests
"""
import pytest
from datetime import datetime
from utils.career_calculator import (
    CareerCalculator,
    CareerPeriod,
    CareerSummary,
    calculate_career_months,
    calculate_total_experience,
    format_experience_korean,
    get_career_calculator,
)


class TestCareerPeriod:
    """CareerPeriod 데이터클래스 테스트"""

    def test_months_calculation(self):
        """개월수 계산 테스트"""
        period = CareerPeriod(
            start_year=2020,
            start_month=1,
            end_year=2020,
            end_month=12
        )
        # 1월부터 12월까지 = 12개월
        assert period.months == 12

    def test_months_across_years(self):
        """연도 경계 개월수 계산"""
        period = CareerPeriod(
            start_year=2020,
            start_month=6,
            end_year=2022,
            end_month=5
        )
        # 2020.06 ~ 2022.05 = 24개월
        assert period.months == 24

    def test_minimum_one_month(self):
        """최소 1개월 보장"""
        period = CareerPeriod(
            start_year=2020,
            start_month=5,
            end_year=2020,
            end_month=5
        )
        assert period.months >= 1

    def test_overlaps_with_true(self):
        """겹치는 기간 감지"""
        period1 = CareerPeriod(2020, 1, 2020, 12)
        period2 = CareerPeriod(2020, 6, 2021, 6)

        assert period1.overlaps_with(period2) is True
        assert period2.overlaps_with(period1) is True

    def test_overlaps_with_false(self):
        """겹치지 않는 기간"""
        period1 = CareerPeriod(2018, 1, 2019, 12)
        period2 = CareerPeriod(2020, 1, 2021, 12)

        assert period1.overlaps_with(period2) is False


class TestCareerSummary:
    """CareerSummary 데이터클래스 테스트"""

    def test_years_property(self):
        """년수 계산 테스트"""
        summary = CareerSummary(total_months=36, periods=[], has_current_job=False)
        assert summary.years == 3

    def test_remaining_months_property(self):
        """남은 개월수 계산"""
        summary = CareerSummary(total_months=38, periods=[], has_current_job=False)
        assert summary.years == 3
        assert summary.remaining_months == 2

    @pytest.mark.parametrize("months,expected", [
        (6, "6개월"),
        (12, "1년"),
        (24, "2년"),
        (26, "2년 2개월"),
        (38, "3년 2개월"),
    ])
    def test_format_korean(self, months, expected):
        """한국어 형식 출력 테스트"""
        summary = CareerSummary(total_months=months, periods=[], has_current_job=False)
        assert summary.format_korean() == expected

    @pytest.mark.parametrize("months,expected", [
        (6, "6m"),
        (12, "1y"),
        (26, "2y 2m"),
    ])
    def test_format_short(self, months, expected):
        """짧은 형식 출력 테스트"""
        summary = CareerSummary(total_months=months, periods=[], has_current_job=False)
        assert summary.format_short() == expected


class TestCareerCalculator:
    """CareerCalculator 클래스 테스트"""

    def setup_method(self):
        """각 테스트 전 실행"""
        self.calculator = CareerCalculator()

    # ─────────────────────────────────────────────────
    # calculate_months 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("start,end,expected_min", [
        ("2020.01", "2020.12", 12),
        ("2020.06", "2022.05", 24),
        ("2020년 1월", "2020년 12월", 12),
    ])
    def test_calculate_months(self, start, end, expected_min):
        """개월수 계산 테스트"""
        months = self.calculator.calculate_months(start, end)
        assert months >= expected_min

    def test_calculate_months_with_current(self):
        """현재까지 개월수 계산"""
        months = self.calculator.calculate_months("2020.01", "현재")
        assert months > 0

    def test_calculate_months_invalid_start(self):
        """유효하지 않은 시작일"""
        months = self.calculator.calculate_months("invalid", "2022.06")
        assert months == 0

    def test_calculate_months_invalid_end(self):
        """유효하지 않은 종료일"""
        months = self.calculator.calculate_months("2020.01", "invalid")
        assert months == 0

    # ─────────────────────────────────────────────────
    # parse_career_period 테스트
    # ─────────────────────────────────────────────────

    def test_parse_career_period(self):
        """경력 기간 파싱 테스트"""
        period = self.calculator.parse_career_period(
            "2020.01 - 2022.06",
            company="ABC Corp",
            position="Engineer"
        )

        assert period is not None
        assert period.start_year == 2020
        assert period.start_month == 1
        assert period.end_year == 2022
        assert period.end_month == 6
        assert period.company == "ABC Corp"
        assert period.position == "Engineer"

    def test_parse_career_period_current(self):
        """현재 재직중 파싱"""
        period = self.calculator.parse_career_period("2020.01 - 현재")

        assert period is not None
        assert period.is_current is True
        assert period.end_year == datetime.now().year

    def test_parse_career_period_invalid(self):
        """유효하지 않은 기간"""
        period = self.calculator.parse_career_period("invalid period")
        assert period is None

    # ─────────────────────────────────────────────────
    # calculate_total_experience 테스트
    # ─────────────────────────────────────────────────

    def test_calculate_total_experience_simple(self):
        """단순 경력 합산"""
        periods = [
            CareerPeriod(2018, 1, 2019, 12),  # 24개월
            CareerPeriod(2020, 1, 2021, 12),  # 24개월
        ]

        summary = self.calculator.calculate_total_experience(periods)

        assert summary.total_months == 48
        assert summary.years == 4

    def test_calculate_total_experience_with_overlaps(self):
        """중복 기간 제거 테스트"""
        periods = [
            CareerPeriod(2020, 1, 2020, 12),  # 12개월
            CareerPeriod(2020, 6, 2021, 6),   # 13개월 (6개월 중복)
        ]

        summary = self.calculator.calculate_total_experience(periods, remove_overlaps=True)

        # 2020.01 ~ 2021.06 = 18개월 (중복 제거)
        assert summary.total_months == 18

    def test_calculate_total_experience_no_overlap_removal(self):
        """중복 제거 없이 합산"""
        periods = [
            CareerPeriod(2020, 1, 2020, 12),  # 12개월
            CareerPeriod(2020, 6, 2021, 6),   # 13개월
        ]

        summary = self.calculator.calculate_total_experience(periods, remove_overlaps=False)

        # 12 + 13 = 25개월 (중복 포함)
        assert summary.total_months == 25

    def test_calculate_total_experience_empty(self):
        """빈 경력 목록"""
        summary = self.calculator.calculate_total_experience([])

        assert summary.total_months == 0
        assert summary.has_current_job is False

    def test_calculate_total_experience_with_current_job(self):
        """현재 재직중 포함"""
        periods = [
            CareerPeriod(2018, 1, 2019, 12),
            CareerPeriod(2020, 1, 2024, 6, is_current=True),
        ]

        summary = self.calculator.calculate_total_experience(periods)

        assert summary.has_current_job is True

    # ─────────────────────────────────────────────────
    # calculate_from_career_list 테스트
    # ─────────────────────────────────────────────────

    def test_calculate_from_career_list_start_end(self):
        """start/end 형식 경력 목록"""
        careers = [
            {"start": "2018.03", "end": "2020.06", "company": "ABC Corp"},
            {"start": "2020.07", "end": "2022.12", "company": "XYZ Inc"},
        ]

        summary = self.calculator.calculate_from_career_list(careers)

        assert summary.total_months > 0
        assert len(summary.periods) == 2

    def test_calculate_from_career_list_period_format(self):
        """period 형식 경력 목록"""
        careers = [
            {"period": "2018.03 - 2020.06", "company": "ABC Corp"},
            {"period": "2020.07 - 현재", "company": "XYZ Inc"},
        ]

        summary = self.calculator.calculate_from_career_list(careers)

        assert summary.total_months > 0
        assert summary.has_current_job is True


class TestConvenienceFunctions:
    """편의 함수 테스트"""

    def test_calculate_career_months(self):
        """calculate_career_months 함수"""
        months = calculate_career_months("2020.01", "2020.12")
        assert months >= 12

    def test_calculate_total_experience(self):
        """calculate_total_experience 함수"""
        careers = [
            {"start": "2020.01", "end": "2020.12"},
        ]
        summary = calculate_total_experience(careers)
        assert summary.total_months > 0

    @pytest.mark.parametrize("months,expected", [
        (6, "6개월"),
        (12, "1년"),
        (26, "2년 2개월"),
    ])
    def test_format_experience_korean(self, months, expected):
        """format_experience_korean 함수"""
        assert format_experience_korean(months) == expected

    def test_get_career_calculator_singleton(self):
        """싱글톤 인스턴스"""
        calc1 = get_career_calculator()
        calc2 = get_career_calculator()
        assert calc1 is calc2
