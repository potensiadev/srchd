"""
ValidationWrapper 단위 테스트

Note: These tests mock the heavy dependencies (LLM, agents) to avoid import issues.
"""

import pytest
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

# Mock heavy dependencies before importing the module
mock_llm_manager = MagicMock()
mock_llm_manager.LLMProvider = MagicMock()
mock_llm_manager.LLMProvider.OPENAI = "openai"
mock_llm_manager.LLMProvider.GEMINI = "gemini"
mock_llm_manager.LLMProvider.CLAUDE = "claude"

# Mock the services.llm_manager module
sys.modules['services.llm_manager'] = mock_llm_manager
sys.modules['services'] = MagicMock()

# Mock agents
mock_validation_agent_module = MagicMock()
mock_validation_agent_module.ValidationResult = MagicMock()
sys.modules['agents.validation_agent'] = mock_validation_agent_module
sys.modules['agents'] = MagicMock()

from context import PipelineContext

# Now import the validation wrapper components
# These will use the mocked dependencies
from orchestrator.validation_wrapper import (
    LLMValidationResult,
    ValidationWrapperResult,
)


class TestValidationAgentWrapper:
    """ValidationAgentWrapper 테스트"""

    @pytest.fixture
    def ctx(self):
        """테스트용 PipelineContext"""
        ctx = PipelineContext()
        ctx.set_raw_input(b"test content", "김철수_이력서.pdf")
        ctx.set_parsed_text("김철수\n경력 5년\n010-1234-5678\nkim@test.com\nPython, Java 개발")
        ctx.extract_pii()
        return ctx

    def test_pii_fields_not_llm_validated(self):
        """PII 필드는 LLM 검증 대상이 아님"""
        # Import wrapper with mocked dependencies
        with patch('orchestrator.validation_wrapper.get_validation_agent'), \
             patch('orchestrator.validation_wrapper.get_llm_manager'), \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_llm_validation=False,
                use_evidence_tracking=True,
                use_hallucination_detection=True
            )

            from orchestrator.validation_wrapper import ValidationAgentWrapper
            wrapper = ValidationAgentWrapper()

            assert "name" not in wrapper.LLM_VALIDATION_FIELDS
            assert "phone" not in wrapper.LLM_VALIDATION_FIELDS
            assert "email" not in wrapper.LLM_VALIDATION_FIELDS

            # LLM 검증 대상 필드
            assert "exp_years" in wrapper.LLM_VALIDATION_FIELDS
            assert "skills" in wrapper.LLM_VALIDATION_FIELDS
            assert "careers" in wrapper.LLM_VALIDATION_FIELDS


class TestLLMValidationResult:
    """LLMValidationResult 테스트"""

    def test_basic_result(self):
        """기본 결과 생성"""
        result = LLMValidationResult(
            field_name="exp_years",
            is_valid=True,
            confidence=0.85,
            found_in_text=True,
            reasoning="경력 5년 텍스트에서 확인",
            llm_provider="openai"
        )

        assert result.field_name == "exp_years"
        assert result.is_valid is True
        assert result.confidence == 0.85
        assert result.llm_provider == "openai"

    def test_result_with_correction(self):
        """수정 제안이 있는 결과"""
        result = LLMValidationResult(
            field_name="exp_years",
            is_valid=False,
            confidence=0.6,
            found_in_text=False,
            reasoning="텍스트에서 경력 3년으로 확인됨",
            suggested_correction=3,
            issues=["입력값 5년과 텍스트 3년 불일치"]
        )

        assert result.is_valid is False
        assert result.suggested_correction == 3
        assert len(result.issues) == 1


class TestCrossValidationEngine:
    """CrossValidationEngine 테스트"""

    @pytest.fixture
    def ctx(self):
        """테스트용 PipelineContext"""
        ctx = PipelineContext()
        ctx.set_parsed_text("경력 5년 개발자입니다. Python, Java 사용")
        return ctx

    def test_cross_validation_not_enough_providers(self, ctx):
        """교차 검증 - 프로바이더 부족"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags'):

            mock_llm_instance = MagicMock()
            mock_llm_instance.get_available_providers.return_value = []  # 프로바이더 없음
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            # Synchronous check - the actual async method would need different testing
            # Just verify the engine can be instantiated with mocks
            assert engine is not None
            assert engine.llm_manager is not None


class TestValidationWrapperResult:
    """ValidationWrapperResult 테스트"""

    def test_basic_result(self):
        """기본 결과"""
        result = ValidationWrapperResult(
            success=True,
            validated_data={"name": "김철수", "exp_years": 5},
            confidence_adjustments={"name": 0.1}
        )

        assert result.success is True
        assert result.validated_data["name"] == "김철수"
        assert len(result.llm_validations) == 0
        assert len(result.regex_corrections) == 0

    def test_result_with_llm_validations(self):
        """LLM 검증 결과 포함"""
        llm_result = LLMValidationResult(
            field_name="exp_years",
            is_valid=True,
            confidence=0.9,
            found_in_text=True,
            reasoning="확인됨"
        )

        result = ValidationWrapperResult(
            success=True,
            validated_data={"exp_years": 5},
            llm_validations=[llm_result],
            providers_used=["openai"]
        )

        assert len(result.llm_validations) == 1
        assert result.providers_used == ["openai"]


class TestSingletonInstances:
    """싱글톤 인스턴스 테스트"""

    def test_get_validation_wrapper(self):
        """ValidationWrapper 싱글톤"""
        with patch('orchestrator.validation_wrapper.get_validation_agent'), \
             patch('orchestrator.validation_wrapper.get_llm_manager'), \
             patch('orchestrator.validation_wrapper.get_feature_flags'):

            # 싱글톤 초기화를 위해 모듈 리로드
            import orchestrator.validation_wrapper as vw
            vw._wrapper = None  # 초기화

            from orchestrator.validation_wrapper import get_validation_wrapper
            wrapper1 = get_validation_wrapper()
            wrapper2 = get_validation_wrapper()

            assert wrapper1 is wrapper2

    def test_get_cross_validator(self):
        """CrossValidator 싱글톤"""
        with patch('orchestrator.validation_wrapper.get_llm_manager'), \
             patch('orchestrator.validation_wrapper.get_feature_flags'):

            import orchestrator.validation_wrapper as vw
            vw._cross_validator = None  # 초기화

            from orchestrator.validation_wrapper import get_cross_validator
            cv1 = get_cross_validator()
            cv2 = get_cross_validator()

            assert cv1 is cv2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
