"""
Tests for Field-Based Analyst and related modules.

Tests:
- ConsensusBuilder
- RuleValidator
- EvidenceEnforcer
- QualityGate
- Extractors (basic functionality)
"""

import pytest
from datetime import datetime

# ConsensusBuilder tests
from context.consensus import (
    ConsensusBuilder,
    ExtractionResult,
    ConsensusResult,
    create_consensus_builder,
)

# Extractor imports (module-level to avoid test order issues)
from agents.extractors.profile_extractor import ProfileExtractor
from agents.extractors.career_extractor import CareerExtractor
from agents.extractors.skills_extractor import SkillsExtractor

# RuleValidator tests
from context.rule_validator import (
    RuleValidator,
    ValidationResult,
    create_rule_validator,
)

# EvidenceEnforcer tests
from context.evidence_enforcer import (
    EvidenceEnforcer,
    EvidenceEnforcerResult,
    create_evidence_enforcer,
)

# QualityMetrics tests
from context.quality_metrics import (
    QualityGate,
    QualityMetrics,
    QualityGateConfig,
    QualityGateResult,
    create_quality_gate,
    create_default_config,
)


class TestConsensusBuilder:
    """ConsensusBuilder 테스트"""

    def test_single_result_consensus(self):
        """단일 결과 합의"""
        builder = create_consensus_builder()
        builder.add_result(
            "name",
            ExtractionResult(provider="openai", value="김철수", confidence=0.9)
        )

        consensus = builder.build_consensus("name")

        assert consensus.final_value == "김철수"
        assert consensus.method == "single"
        assert consensus.agreement_ratio == 1.0
        # 단일 결과는 교차검증 없음으로 신뢰도 감점
        assert consensus.confidence < 0.9

    def test_unanimous_consensus(self):
        """만장일치 합의"""
        builder = create_consensus_builder()
        builder.add_result(
            "name",
            ExtractionResult(provider="openai", value="김철수", confidence=0.9)
        )
        builder.add_result(
            "name",
            ExtractionResult(provider="gemini", value="김철수", confidence=0.85)
        )

        consensus = builder.build_consensus("name")

        assert consensus.final_value == "김철수"
        assert consensus.method == "unanimous"
        assert consensus.agreement_ratio == 1.0
        assert consensus.had_disagreement is False
        # 만장일치 보너스
        assert consensus.confidence > 0.85

    def test_majority_consensus(self):
        """다수결 합의"""
        builder = create_consensus_builder()
        builder.add_result(
            "name",
            ExtractionResult(provider="openai", value="김철수", confidence=0.9)
        )
        builder.add_result(
            "name",
            ExtractionResult(provider="gemini", value="김철수", confidence=0.85)
        )
        builder.add_result(
            "name",
            ExtractionResult(provider="claude", value="김철호", confidence=0.7)
        )

        consensus = builder.build_consensus("name")

        assert consensus.final_value == "김철수"
        assert consensus.method == "majority_vote"
        assert consensus.agreement_ratio == 2 / 3
        assert consensus.had_disagreement is True
        assert len(consensus.disagreements) == 1

    def test_confidence_based_consensus(self):
        """신뢰도 기반 합의 (동률)"""
        builder = create_consensus_builder()
        builder.add_result(
            "name",
            ExtractionResult(provider="openai", value="김철수", confidence=0.9)
        )
        builder.add_result(
            "name",
            ExtractionResult(provider="gemini", value="김철호", confidence=0.5)
        )

        consensus = builder.build_consensus("name")

        # 신뢰도가 높은 openai 결과 선택
        assert consensus.final_value == "김철수"
        assert consensus.method == "highest_confidence"
        assert consensus.had_disagreement is True

    def test_build_all(self):
        """모든 필드 합의"""
        builder = create_consensus_builder()
        builder.add_result("name", ExtractionResult(provider="openai", value="김철수", confidence=0.9))
        builder.add_result("name", ExtractionResult(provider="gemini", value="김철수", confidence=0.85))
        builder.add_result("exp_years", ExtractionResult(provider="openai", value=5, confidence=0.8))

        results = builder.build_all()

        assert "name" in results
        assert "exp_years" in results
        assert results["name"].final_value == "김철수"
        assert results["exp_years"].final_value == 5

    def test_normalize_value(self):
        """값 정규화"""
        builder = create_consensus_builder()

        assert builder._normalize_value("Hello") == builder._normalize_value("hello")
        assert builder._normalize_value("  test  ") == builder._normalize_value("test")
        assert builder._normalize_value(5.0) == builder._normalize_value(5)
        assert builder._normalize_value(None) == "none"


class TestRuleValidator:
    """RuleValidator 테스트"""

    def test_date_normalization(self):
        """날짜 정규화"""
        validator = create_rule_validator()

        # YYYY.MM → YYYY-MM
        result = validator.validate_and_normalize("start_date", "2023.03")
        assert result.normalized_value == "2023-03"
        assert result.is_valid

        # 연도만 → YYYY-01
        result = validator.validate_and_normalize("start_date", "2023")
        assert result.normalized_value == "2023-01"
        assert "월 정보 없음" in str(result.warnings)

    def test_phone_normalization(self):
        """전화번호 정규화"""
        validator = create_rule_validator()

        result = validator.validate_and_normalize("phone", "01012345678")
        assert result.normalized_value == "010-1234-5678"
        assert result.is_valid

        result = validator.validate_and_normalize("phone", "010-1234-5678")
        assert result.normalized_value == "010-1234-5678"
        assert result.is_valid

        result = validator.validate_and_normalize("phone", "1234567")
        assert result.is_valid is False

    def test_email_validation(self):
        """이메일 검증"""
        validator = create_rule_validator()

        result = validator.validate_and_normalize("email", "test@example.com")
        assert result.is_valid
        assert result.normalized_value == "test@example.com"

        result = validator.validate_and_normalize("email", "invalid-email")
        assert result.is_valid is False

    def test_degree_normalization(self):
        """학위 정규화"""
        validator = create_rule_validator()

        result = validator.validate_and_normalize("degree", "Master")
        assert result.normalized_value == "석사"

        result = validator.validate_and_normalize("degree", "PhD")
        assert result.normalized_value == "박사"

        result = validator.validate_and_normalize("degree", "학사")
        assert result.normalized_value == "학사"

    def test_company_normalization(self):
        """회사명 정규화"""
        validator = create_rule_validator()

        result = validator.validate_and_normalize("company", "samsung")
        assert result.normalized_value == "삼성전자"

        result = validator.validate_and_normalize("company", "  네이버  ")
        assert result.normalized_value == "네이버"

    def test_validate_careers(self):
        """경력 목록 검증"""
        validator = create_rule_validator()

        careers = [
            {
                "company": "samsung",
                "position": "Engineer",
                "start_date": "2020.03",
                "end_date": "2023.06"
            }
        ]

        normalized, warnings = validator.validate_careers(careers)

        assert len(normalized) == 1
        assert normalized[0]["company"] == "삼성전자"
        assert normalized[0]["start_date"] == "2020-03"
        assert normalized[0]["end_date"] == "2023-06"

    def test_validate_educations(self):
        """학력 목록 검증"""
        validator = create_rule_validator()

        educations = [
            {
                "school": "서울대학교",
                "degree": "Bachelor",
                "graduation_year": "2015"
            }
        ]

        normalized, warnings = validator.validate_educations(educations)

        assert len(normalized) == 1
        assert normalized[0]["degree"] == "학사"
        assert normalized[0]["graduation_year"] == 2015


class TestEvidenceEnforcer:
    """EvidenceEnforcer 테스트"""

    def test_check_evidence_present(self):
        """Evidence 존재 확인"""
        enforcer = create_evidence_enforcer("홍길동의 이력서입니다.")

        check = enforcer.check_evidence("name", "홍길동", "홍길동")

        assert check.is_present is True
        assert check.is_valid is True
        assert check.similarity_score == 1.0

    def test_check_evidence_missing(self):
        """Evidence 누락 확인"""
        enforcer = create_evidence_enforcer()

        check = enforcer.check_evidence("name", "홍길동", None)

        assert check.is_present is False
        assert check.is_valid is False

    def test_check_evidence_invalid(self):
        """Evidence가 원문에 없는 경우"""
        enforcer = create_evidence_enforcer("김철수의 이력서입니다.")

        check = enforcer.check_evidence("name", "홍길동", "홍길동")

        assert check.is_present is True
        assert check.is_valid is False
        assert check.similarity_score < 0.6

    def test_enforce(self):
        """전체 Evidence 검증"""
        enforcer = create_evidence_enforcer("김철수, 010-1234-5678, test@example.com")

        extracted_data = {
            "name": "김철수",
            "name_evidence": "김철수",
            "phone": "010-1234-5678",
            # phone_evidence 누락
            "email": "test@example.com",
            "email_evidence": "test@example.com"
        }

        result = enforcer.enforce(extracted_data)

        assert result.total_fields > 0
        assert result.evidence_present_count >= 2
        assert result.evidence_backed_ratio > 0

    def test_critical_field_missing_evidence(self):
        """Critical 필드 Evidence 누락 시 재시도 요청"""
        enforcer = create_evidence_enforcer("김철수의 이력서")

        extracted_data = {
            "name": "김철수",
            # name_evidence 누락 (critical)
        }

        result = enforcer.enforce(extracted_data)

        assert "name" in result.critical_missing
        assert result.needs_retry is True


class TestQualityGate:
    """QualityGate 테스트"""

    def test_calculate_metrics(self):
        """품질 지표 계산"""
        gate = create_quality_gate()

        extracted_data = {
            "name": "김철수",
            "careers": [{"company": "삼성전자"}],
            "exp_years": 5,
            "skills": ["Python", "Java"],
            "summary": "개발자입니다."
        }

        metrics = gate.calculate_metrics(extracted_data)

        assert metrics.coverage_score > 0
        assert metrics.critical_coverage > 0
        assert metrics.total_fields > 0
        assert metrics.filled_fields > 0

    def test_quality_gate_pass(self):
        """품질 게이트 통과"""
        config = QualityGateConfig(
            min_coverage_score=0.3,
            min_critical_coverage=0.3
        )
        gate = create_quality_gate(config)

        extracted_data = {
            "name": "김철수",
            "careers": [{"company": "삼성전자"}],
            "exp_years": 5,
            "current_company": "삼성전자",
            "current_position": "Engineer",
            "skills": ["Python", "Java"],
        }

        result = gate.evaluate(extracted_data)

        assert result.passed is True
        assert len(result.failures) == 0

    def test_quality_gate_fail_coverage(self):
        """품질 게이트 실패 - 커버리지 부족"""
        config = QualityGateConfig(
            min_coverage_score=0.9,  # 높은 임계값
            min_critical_coverage=0.9
        )
        gate = create_quality_gate(config)

        extracted_data = {
            "name": "김철수",
        }

        result = gate.evaluate(extracted_data)

        assert result.passed is False
        assert any("coverage_score" in f for f in result.failures)

    def test_quality_gate_required_fields(self):
        """필수 필드 누락 시 실패"""
        config = QualityGateConfig(
            min_coverage_score=0.1,
            min_critical_coverage=0.1,
            required_fields={"name", "exp_years"}
        )
        gate = create_quality_gate(config)

        extracted_data = {
            "name": "김철수",
            # exp_years 누락
        }

        result = gate.evaluate(extracted_data)

        assert result.passed is False
        assert any("exp_years" in f for f in result.failures)


class TestExtractorSchemas:
    """Extractor 스키마 테스트"""

    def test_get_extractor_schema(self):
        """스키마 조회"""
        from schemas.extractor_schemas import get_extractor_schema

        schema = get_extractor_schema("profile")
        assert schema["name"] == "profile_extraction"
        assert "name" in schema["schema"]["properties"]

        schema = get_extractor_schema("career")
        assert schema["name"] == "career_extraction"
        assert "careers" in schema["schema"]["properties"]

    def test_get_extractor_prompt(self):
        """프롬프트 조회"""
        from schemas.extractor_schemas import get_extractor_prompt

        prompt = get_extractor_prompt("profile")
        assert "Profile" in prompt

        prompt = get_extractor_prompt("career")
        assert "Career" in prompt

    def test_get_max_text_length(self):
        """최대 텍스트 길이 조회"""
        from schemas.extractor_schemas import get_max_text_length

        assert get_max_text_length("profile") == 2000
        assert get_max_text_length("career") == 6000
        assert get_max_text_length("unknown") == 4000  # 기본값

    def test_get_preferred_model(self):
        """선호 모델 조회"""
        from schemas.extractor_schemas import get_preferred_model

        assert get_preferred_model("profile") == "gpt-4o-mini"
        assert get_preferred_model("career") == "gpt-4o"
        assert get_preferred_model("summary") == "gpt-4o"


class TestFeatureFlagsFieldBasedAnalyst:
    """Field-Based Analyst Feature Flags 테스트"""

    def test_feature_flags_exist(self):
        """Feature flag 존재 확인"""
        from orchestrator.feature_flags import FeatureFlags

        flags = FeatureFlags()

        assert hasattr(flags, "use_field_based_analyst")
        assert hasattr(flags, "use_conditional_cross_validation")
        assert hasattr(flags, "use_mini_model_for_simple_fields")
        assert hasattr(flags, "evidence_required_for_critical")

    def test_feature_flags_default_values(self):
        """Feature flag 기본값"""
        from orchestrator.feature_flags import FeatureFlags

        flags = FeatureFlags()

        assert flags.use_field_based_analyst is True
        assert flags.use_conditional_cross_validation is True
        assert flags.use_mini_model_for_simple_fields is True
        assert flags.evidence_required_for_critical is True


class TestBaseExtractor:
    """BaseExtractor 테스트"""

    def test_extractor_type(self):
        """Extractor 타입 확인"""
        profile = ProfileExtractor()
        assert profile.EXTRACTOR_TYPE == "profile"

        career = CareerExtractor()
        assert career.EXTRACTOR_TYPE == "career"

    def test_profile_extractor_name_from_filename(self):
        """파일명에서 이름 추출"""
        extractor = ProfileExtractor()

        assert extractor.extract_name_from_filename("김철수_이력서.pdf") == "김철수"
        assert extractor.extract_name_from_filename("이력서_홍길동.docx") == "홍길동"
        assert extractor.extract_name_from_filename("resume_john_doe.pdf") == "John Doe"

    def test_skills_normalization(self):
        """스킬 정규화"""
        extractor = SkillsExtractor()

        skills = ["python", "PYTHON", "js", "react.js", "node"]
        normalized = extractor._normalize_skills(skills)

        assert "Python" in normalized
        assert "JavaScript" in normalized
        assert "React" in normalized
        assert "Node.js" in normalized
        # 중복 제거 확인
        assert len([s for s in normalized if s == "Python"]) == 1
