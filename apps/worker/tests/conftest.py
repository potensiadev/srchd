"""
Worker Test Configuration
"""
import sys
from pathlib import Path

# Add worker directory to path for imports
worker_dir = Path(__file__).parent.parent
sys.path.insert(0, str(worker_dir))

import pytest


@pytest.fixture
def sample_career_data():
    """샘플 경력 데이터"""
    return [
        {"start": "2018.03", "end": "2020.06", "company": "ABC Corp", "position": "Engineer"},
        {"start": "2020.07", "end": "2023.12", "company": "XYZ Inc", "position": "Senior Engineer"},
        {"start": "2024.01", "end": "현재", "company": "Tech Co", "position": "Lead"},
    ]


@pytest.fixture
def sample_date_strings():
    """다양한 날짜 형식 샘플"""
    return {
        "korean": ["2020년 5월", "2020년5월", "2020 년 5 월"],
        "dot": ["2020.05", "2020. 05", "2020.5"],
        "dash": ["2020-05", "2020- 05"],
        "slash": ["2020/05", "2020/ 05"],
        "english": ["May 2020", "may 2020", "MAY 2020"],
        "short": ["'20.05", "'20년 5월"],
        "current": ["현재", "재직중", "present", "Current"],
    }


@pytest.fixture
def sample_resume_text():
    """샘플 이력서 텍스트"""
    return """
    홍길동
    서울시 강남구
    010-1234-5678
    hong@email.com

    경력사항
    - ABC회사 (2018.03 - 2020.06)
      소프트웨어 엔지니어
      Python, JavaScript 개발

    - XYZ회사 (2020.07 - 현재)
      시니어 개발자
      백엔드 시스템 설계

    학력
    - 서울대학교 컴퓨터공학과 (2014 - 2018)

    기술
    Python, JavaScript, TypeScript, React, Node.js
    """
