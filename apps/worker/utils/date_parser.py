"""
Date Parser - 다양한 날짜 형식 파싱

이력서에서 사용되는 다양한 날짜 형식을 파싱:
- "2020.01", "2020.1", "2020. 01"
- "2020년 1월", "2020년1월"
- "Jan 2020", "January 2020"
- "'20.01", "'20년 1월"
- "2020-01", "2020/01"
- "현재", "재직중", "Present", "Current"
"""

import re
import logging
from typing import Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# 현재 날짜를 나타내는 키워드
CURRENT_DATE_KEYWORDS = [
    "현재", "재직중", "재직 중", "재학중", "재학 중",
    "present", "current", "now", "ongoing", "today",
    "至今", "在职", "在学",  # 중국어
]

# 영문 월 매핑
ENGLISH_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


@dataclass
class ParsedDate:
    """파싱된 날짜 결과"""
    year: int
    month: int
    is_current: bool = False
    original_text: str = ""

    def to_tuple(self) -> Tuple[int, int]:
        """(year, month) 튜플 반환"""
        return (self.year, self.month)


class DateParser:
    """
    다양한 날짜 형식 파서

    지원 형식:
    - 한국어: "2020년 5월", "2020년5월", "2020. 05", "2020.5"
    - 영어: "Jan 2020", "January 2020", "2020 Jan"
    - 숫자: "2020-01", "2020/01", "2020.01"
    - 축약: "'20.01", "'20년 1월"
    - 현재: "현재", "재직중", "Present", "Current"
    """

    # 날짜 패턴 (우선순위 순)
    DATE_PATTERNS = [
        # 한국어: 2020년 5월, 2020년5월
        (r"(\d{4})\s*년\s*(\d{1,2})\s*월?", "korean_ym"),

        # 축약 한국어: '20년 5월
        (r"['\u2019](\d{2})\s*년\s*(\d{1,2})\s*월?", "korean_short_ym"),

        # 영어 월 + 년: Jan 2020, January 2020
        (r"([A-Za-z]+)\s*[,.]?\s*(\d{4})", "english_my"),

        # 년 + 영어 월: 2020 Jan
        (r"(\d{4})\s*[,.]?\s*([A-Za-z]+)", "english_ym"),

        # 점 구분: 2020.01, 2020. 01, 2020.1
        (r"(\d{4})\s*\.\s*(\d{1,2})", "dot_ym"),

        # 대시 구분: 2020-01
        (r"(\d{4})\s*-\s*(\d{1,2})", "dash_ym"),

        # 슬래시 구분: 2020/01
        (r"(\d{4})\s*/\s*(\d{1,2})", "slash_ym"),

        # 축약 점: '20.01
        (r"['\u2019](\d{2})\s*\.\s*(\d{1,2})", "short_dot_ym"),

        # 년도만: 2020년, 2020
        (r"(\d{4})\s*년?(?!\d)", "year_only"),

        # 축약 년도: '20년, '20
        (r"['\u2019](\d{2})(?:\s*년)?(?!\d)", "short_year_only"),
    ]

    def __init__(self):
        """컴파일된 패턴 초기화"""
        self._compiled_patterns = [
            (re.compile(pattern, re.IGNORECASE), name)
            for pattern, name in self.DATE_PATTERNS
        ]

    def parse(self, text: str) -> Optional[ParsedDate]:
        """
        날짜 문자열 파싱

        Args:
            text: 날짜 문자열

        Returns:
            ParsedDate 또는 None
        """
        if not text:
            return None

        text = text.strip()
        original_text = text

        # 현재 날짜 키워드 체크
        text_lower = text.lower()
        for keyword in CURRENT_DATE_KEYWORDS:
            if keyword in text_lower:
                now = datetime.now()
                return ParsedDate(
                    year=now.year,
                    month=now.month,
                    is_current=True,
                    original_text=original_text
                )

        # 패턴 매칭 시도
        for pattern, pattern_type in self._compiled_patterns:
            match = pattern.search(text)
            if match:
                result = self._extract_date(match, pattern_type)
                if result:
                    result.original_text = original_text
                    return result

        logger.debug(f"Failed to parse date: {text}")
        return None

    def _extract_date(self, match: re.Match, pattern_type: str) -> Optional[ParsedDate]:
        """매칭 결과에서 날짜 추출"""
        try:
            groups = match.groups()

            if pattern_type in ("korean_ym", "dot_ym", "dash_ym", "slash_ym"):
                year = int(groups[0])
                month = int(groups[1])

            elif pattern_type in ("korean_short_ym", "short_dot_ym"):
                year = self._expand_short_year(int(groups[0]))
                month = int(groups[1])

            elif pattern_type == "english_my":
                month = ENGLISH_MONTHS.get(groups[0].lower()[:3])
                if month is None:
                    return None
                year = int(groups[1])

            elif pattern_type == "english_ym":
                year = int(groups[0])
                month = ENGLISH_MONTHS.get(groups[1].lower()[:3])
                if month is None:
                    return None

            elif pattern_type == "year_only":
                year = int(groups[0])
                month = 1  # 월 정보 없으면 1월로 기본값

            elif pattern_type == "short_year_only":
                year = self._expand_short_year(int(groups[0]))
                month = 1

            else:
                return None

            # 유효성 검사
            if not self._is_valid_date(year, month):
                return None

            return ParsedDate(year=year, month=month)

        except (ValueError, IndexError) as e:
            logger.debug(f"Date extraction failed: {e}")
            return None

    def _expand_short_year(self, short_year: int) -> int:
        """2자리 연도를 4자리로 확장"""
        # 50 이상이면 1900년대, 미만이면 2000년대
        if short_year >= 50:
            return 1900 + short_year
        else:
            return 2000 + short_year

    def _is_valid_date(self, year: int, month: int) -> bool:
        """날짜 유효성 검사"""
        current_year = datetime.now().year

        # 연도 범위 (1950 ~ 현재+1)
        if not (1950 <= year <= current_year + 1):
            return False

        # 월 범위 (1-12)
        if not (1 <= month <= 12):
            return False

        return True

    def parse_date_range(self, text: str) -> Tuple[Optional[ParsedDate], Optional[ParsedDate]]:
        """
        날짜 범위 파싱 (시작일 - 종료일)

        Args:
            text: "2020.01 - 2022.06" 형태의 문자열

        Returns:
            (시작일, 종료일) 튜플
        """
        if not text:
            return (None, None)

        # 구분자로 분리 (-, ~, –, —, to, 부터, 까지)
        separators = [
            r'\s*[-–—~]\s*',  # 하이픈, 물결표
            r'\s+to\s+',      # 영어 "to"
            r'\s*~\s*',       # 물결
        ]

        for sep in separators:
            parts = re.split(sep, text, maxsplit=1)
            if len(parts) == 2:
                start_date = self.parse(parts[0])
                end_date = self.parse(parts[1])
                return (start_date, end_date)

        # 구분자 없으면 단일 날짜
        single_date = self.parse(text)
        return (single_date, None)


# 싱글톤 인스턴스
_date_parser: Optional[DateParser] = None


def get_date_parser() -> DateParser:
    """Date Parser 싱글톤 인스턴스 반환"""
    global _date_parser
    if _date_parser is None:
        _date_parser = DateParser()
    return _date_parser


def parse_date(text: str) -> Optional[ParsedDate]:
    """편의 함수: 날짜 문자열 파싱"""
    return get_date_parser().parse(text)


def parse_date_range(text: str) -> Tuple[Optional[ParsedDate], Optional[ParsedDate]]:
    """편의 함수: 날짜 범위 파싱"""
    return get_date_parser().parse_date_range(text)
