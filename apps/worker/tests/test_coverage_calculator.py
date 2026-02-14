"""
CoverageCalculator 단위 테스트
"""

import pytest
from agents.coverage_calculator import CoverageCalculator
from schemas.phase1_types import (
    MissingReason,
    FieldPriority,
    FIELD_WEIGHTS,
)


class TestCoverageCalculator:
    """CoverageCalculator 테스트"""

    @pytest.fixture
    def calculator(self):
        return CoverageCalculator()

    def test_complete_resume(self, calculator):
        """완전한 이력서 (모든 필드 있음)"""
        analyzed_data = {
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "hong@example.com",
            "careers": [{"company": "테스트회사", "position": "개발자"}],
            "skills": ["Python", "JavaScript"],
            "educations": [{"school": "서울대학교", "degree": "학사"}],
            "exp_years": 5,
            "current_company": "테스트회사",
            "current_position": "시니어 개발자",
            "summary": "경력 5년의 풀스택 개발자입니다.",
            "strengths": ["문제 해결", "협업"],
            "birth_year": 1990,
            "gender": "male",
            "address": "서울시 강남구",
            "projects": [{"name": "프로젝트A"}],
            "certifications": ["정보처리기사"],
            "links": ["https://github.com/hong"],
        }

        field_confidence = {k: 0.9 for k in analyzed_data.keys()}

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        assert result.coverage_score >= 90
        assert len(result.missing_fields) == 0
        assert len(result.gap_fill_candidates) == 0

    def test_minimal_resume(self, calculator):
        """최소 정보만 있는 이력서"""
        analyzed_data = {
            "name": "홍길동",
        }

        field_confidence = {"name": 0.9}

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        assert result.coverage_score < 30
        assert len(result.missing_fields) > 10
        assert "phone" in result.gap_fill_candidates
        assert "email" in result.gap_fill_candidates

    def test_missing_contact_info(self, calculator):
        """연락처 누락"""
        analyzed_data = {
            "name": "홍길동",
            "careers": [{"company": "테스트회사"}],
            "skills": ["Python"],
            "educations": [{"school": "서울대학교"}],
        }

        field_confidence = {k: 0.8 for k in analyzed_data.keys()}

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        # phone, email이 missing_fields에 있어야 함
        assert "phone" in result.missing_fields
        assert "email" in result.missing_fields

        # gap_fill_candidates의 상위에 있어야 함
        assert result.gap_fill_candidates[0] in ["phone", "email"]

    def test_low_confidence_fields(self, calculator):
        """낮은 신뢰도 필드"""
        analyzed_data = {
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "hong@example.com",
            "careers": [{"company": "테스트회사"}],
            "skills": ["Python"],
        }

        field_confidence = {
            "name": 0.9,
            "phone": 0.5,  # 낮은 신뢰도
            "email": 0.4,  # 낮은 신뢰도
            "careers": 0.8,
            "skills": 0.3,  # 낮은 신뢰도
        }

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        # 낮은 신뢰도 필드가 식별되어야 함
        assert "phone" in result.low_confidence_fields
        assert "email" in result.low_confidence_fields
        assert "skills" in result.low_confidence_fields

        # gap_fill_candidates에 포함
        for field in ["phone", "email", "skills"]:
            assert field in result.gap_fill_candidates or field in result.missing_fields

    def test_missing_reason_not_found(self, calculator):
        """원문에 정보가 없는 경우"""
        analyzed_data = {
            "name": "홍길동",
        }

        # 원문에 전화번호 관련 키워드 없음
        original_text = "홍길동입니다. 개발자입니다."

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            original_text=original_text,
        )

        phone_coverage = result.field_coverages.get("phone")
        assert phone_coverage is not None
        assert phone_coverage.missing_reason == MissingReason.NOT_FOUND_IN_SOURCE

    def test_missing_reason_extraction_failed(self, calculator):
        """원문에 정보는 있지만 추출 실패"""
        analyzed_data = {
            "name": "홍길동",
        }

        # 원문에 전화번호 있음
        original_text = """
        홍길동
        연락처: 010-1234-5678
        이메일: hong@example.com
        """

        # 증거도 있음 (실제로는 EvidenceStore에서 제공)
        evidence_map = {
            "phone": "연락처: 010-1234-5678",
        }

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            evidence_map=evidence_map,
            original_text=original_text,
        )

        phone_coverage = result.field_coverages.get("phone")
        assert phone_coverage is not None
        assert phone_coverage.missing_reason == MissingReason.LLM_EXTRACTION_FAILED

    def test_priority_coverage_breakdown(self, calculator):
        """우선순위별 커버리지 분류"""
        # Critical 필드만 있는 경우
        analyzed_data = {
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "hong@example.com",
            "careers": [{"company": "테스트회사"}],
        }

        field_confidence = {k: 0.9 for k in analyzed_data.keys()}

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        # Critical 커버리지가 높아야 함
        assert result.critical_coverage >= 80

        # Important, Optional은 낮음
        assert result.important_coverage < result.critical_coverage
        assert result.optional_coverage < result.critical_coverage

    def test_gap_fill_priority_order(self, calculator):
        """GapFiller 우선순위 순서"""
        analyzed_data = {
            "name": "홍길동",
        }

        result = calculator.calculate(
            analyzed_data=analyzed_data,
        )

        # 우선순위: phone, email, skills, careers, ...
        # 상위 후보가 이 순서대로 있어야 함
        candidates = result.gap_fill_candidates[:3]
        expected_priority = ["phone", "email", "skills"]

        for expected in expected_priority:
            if expected in result.missing_fields:
                assert expected in candidates, f"{expected} should be in top candidates"

    def test_gap_fill_max_fields(self, calculator):
        """GapFiller 최대 필드 수 제한"""
        analyzed_data = {}  # 모든 필드 누락

        result = calculator.calculate(
            analyzed_data=analyzed_data,
        )

        # 최대 5개까지만
        assert len(result.gap_fill_candidates) <= 5

    def test_field_report_generation(self, calculator):
        """필드 리포트 생성"""
        analyzed_data = {
            "name": "홍길동",
            "phone": "010-1234-5678",
        }

        field_confidence = {"name": 0.9, "phone": 0.8}

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            field_confidence=field_confidence,
        )

        report = calculator.get_field_report(result)

        assert "Coverage Report" in report
        assert "Critical:" in report
        assert "name" in report
        assert "phone" in report

    def test_empty_list_not_meaningful(self, calculator):
        """빈 리스트는 의미 있는 값이 아님"""
        analyzed_data = {
            "name": "홍길동",
            "skills": [],  # 빈 리스트
            "careers": [],  # 빈 리스트
        }

        result = calculator.calculate(
            analyzed_data=analyzed_data,
        )

        # skills와 careers는 missing으로 처리
        assert "skills" in result.missing_fields
        assert "careers" in result.missing_fields

    def test_evidence_backed_ratio(self, calculator):
        """증거 기반 비율 계산"""
        analyzed_data = {
            "name": "홍길동",
            "phone": "010-1234-5678",
        }

        evidence_map = {
            "name": "이름: 홍길동",
            # phone은 증거 없음
        }

        result = calculator.calculate(
            analyzed_data=analyzed_data,
            evidence_map=evidence_map,
        )

        # 전체 필드 중 증거가 있는 비율
        assert result.evidence_backed_ratio > 0
        assert result.evidence_backed_ratio <= 1.0
