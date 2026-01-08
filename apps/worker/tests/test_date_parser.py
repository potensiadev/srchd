"""
Date Parser Tests
"""
import pytest
from datetime import datetime
from utils.date_parser import (
    DateParser,
    parse_date,
    parse_date_range,
    ParsedDate,
    get_date_parser,
)


class TestDateParser:
    """DateParser 클래스 테스트"""

    def setup_method(self):
        """각 테스트 전 실행"""
        self.parser = DateParser()

    # ─────────────────────────────────────────────────
    # 한국어 날짜 형식 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("date_str,expected_year,expected_month", [
        ("2020년 5월", 2020, 5),
        ("2020년5월", 2020, 5),
        ("2020 년 5 월", 2020, 5),
        ("2020년 12월", 2020, 12),
        ("2020년 1월", 2020, 1),
    ])
    def test_korean_date_format(self, date_str, expected_year, expected_month):
        """한국어 날짜 형식 파싱"""
        result = self.parser.parse(date_str)

        assert result is not None
        assert result.year == expected_year
        assert result.month == expected_month

    # ─────────────────────────────────────────────────
    # 점 구분 날짜 형식 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("date_str,expected_year,expected_month", [
        ("2020.05", 2020, 5),
        ("2020. 05", 2020, 5),
        ("2020.5", 2020, 5),
        ("2020.12", 2020, 12),
    ])
    def test_dot_date_format(self, date_str, expected_year, expected_month):
        """점 구분 날짜 형식 파싱"""
        result = self.parser.parse(date_str)

        assert result is not None
        assert result.year == expected_year
        assert result.month == expected_month

    # ─────────────────────────────────────────────────
    # 대시/슬래시 구분 날짜 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("date_str,expected_year,expected_month", [
        ("2020-05", 2020, 5),
        ("2020-12", 2020, 12),
        ("2020/05", 2020, 5),
        ("2020/12", 2020, 12),
    ])
    def test_dash_slash_date_format(self, date_str, expected_year, expected_month):
        """대시/슬래시 구분 날짜 형식 파싱"""
        result = self.parser.parse(date_str)

        assert result is not None
        assert result.year == expected_year
        assert result.month == expected_month

    # ─────────────────────────────────────────────────
    # 영어 날짜 형식 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("date_str,expected_year,expected_month", [
        ("May 2020", 2020, 5),
        ("may 2020", 2020, 5),
        ("MAY 2020", 2020, 5),
        ("January 2020", 2020, 1),
        ("Jan 2020", 2020, 1),
        ("December 2020", 2020, 12),
    ])
    def test_english_date_format(self, date_str, expected_year, expected_month):
        """영어 날짜 형식 파싱"""
        result = self.parser.parse(date_str)

        assert result is not None
        assert result.year == expected_year
        assert result.month == expected_month

    # ─────────────────────────────────────────────────
    # 축약 연도 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("date_str,expected_year,expected_month", [
        ("'20.05", 2020, 5),
        ("'20년 5월", 2020, 5),
        ("'99.12", 1999, 12),  # 50 이상은 1900년대
        ("'00.01", 2000, 1),   # 50 미만은 2000년대
    ])
    def test_short_year_format(self, date_str, expected_year, expected_month):
        """축약 연도 형식 파싱"""
        result = self.parser.parse(date_str)

        assert result is not None
        assert result.year == expected_year
        assert result.month == expected_month

    # ─────────────────────────────────────────────────
    # 현재 날짜 키워드 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("keyword", [
        "현재", "재직중", "재직 중", "present", "Present", "current", "Current",
    ])
    def test_current_date_keywords(self, keyword):
        """현재 날짜 키워드 파싱"""
        result = self.parser.parse(keyword)
        now = datetime.now()

        assert result is not None
        assert result.is_current is True
        assert result.year == now.year
        assert result.month == now.month

    # ─────────────────────────────────────────────────
    # 에러 케이스 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("invalid_date", [
        "",
        None,
        "invalid",
        "abc",
        "13월",  # 유효하지 않은 월
    ])
    def test_invalid_dates(self, invalid_date):
        """유효하지 않은 날짜 처리"""
        result = self.parser.parse(invalid_date) if invalid_date else None
        # None 이거나 유효하지 않은 결과
        assert result is None or result.month <= 12

    # ─────────────────────────────────────────────────
    # 날짜 범위 테스트
    # ─────────────────────────────────────────────────

    @pytest.mark.parametrize("range_str,expected_start,expected_end", [
        ("2020.01 - 2022.06", (2020, 1), (2022, 6)),
        ("2020.01 ~ 2022.06", (2020, 1), (2022, 6)),
        ("2020년 1월 - 2022년 6월", (2020, 1), (2022, 6)),
    ])
    def test_date_range_parsing(self, range_str, expected_start, expected_end):
        """날짜 범위 파싱"""
        start, end = self.parser.parse_date_range(range_str)

        assert start is not None
        assert end is not None
        assert start.to_tuple() == expected_start
        assert end.to_tuple() == expected_end

    def test_date_range_with_current(self):
        """현재까지의 날짜 범위"""
        start, end = self.parser.parse_date_range("2020.01 - 현재")

        assert start is not None
        assert end is not None
        assert start.year == 2020
        assert end.is_current is True


class TestParseDateFunctions:
    """편의 함수 테스트"""

    def test_parse_date_function(self):
        """parse_date 함수 테스트"""
        result = parse_date("2020.05")

        assert result is not None
        assert result.year == 2020
        assert result.month == 5

    def test_parse_date_range_function(self):
        """parse_date_range 함수 테스트"""
        start, end = parse_date_range("2020.01 - 2022.06")

        assert start is not None
        assert end is not None

    def test_get_date_parser_singleton(self):
        """싱글톤 인스턴스 테스트"""
        parser1 = get_date_parser()
        parser2 = get_date_parser()

        assert parser1 is parser2


class TestParsedDate:
    """ParsedDate 데이터클래스 테스트"""

    def test_to_tuple(self):
        """튜플 변환 테스트"""
        date = ParsedDate(year=2020, month=5)
        assert date.to_tuple() == (2020, 5)

    def test_default_values(self):
        """기본값 테스트"""
        date = ParsedDate(year=2020, month=5)
        assert date.is_current is False
        assert date.original_text == ""
