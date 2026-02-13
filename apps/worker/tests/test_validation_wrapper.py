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
        ctx.set_raw_input(b"test content", "test_resume.pdf")
        ctx.set_parsed_text("경력 5년 개발자입니다. Python, Java 사용. 현재 ABC 회사 선임개발자로 재직 중.")
        ctx.extract_pii()
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


class TestProviderValidationResult:
    """ProviderValidationResult 테스트"""

    def test_basic_result(self):
        """기본 프로바이더 검증 결과 생성"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        result = ProviderValidationResult(
            provider="openai",
            success=True,
            is_valid=True,
            confidence=0.9,
            reasoning="원본 텍스트에서 확인됨",
            found_in_text=True,
            processing_time_ms=150
        )

        assert result.provider == "openai"
        assert result.success is True
        assert result.is_valid is True
        assert result.confidence == 0.9
        assert result.found_in_text is True

    def test_failed_result(self):
        """실패한 프로바이더 검증 결과"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        result = ProviderValidationResult(
            provider="gemini",
            success=False,
            error="API timeout"
        )

        assert result.success is False
        assert result.error == "API timeout"
        assert result.is_valid is False

    def test_result_with_suggestion(self):
        """수정 제안이 있는 프로바이더 검증 결과"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        result = ProviderValidationResult(
            provider="claude",
            success=True,
            is_valid=False,
            confidence=0.8,
            reasoning="경력 연수가 텍스트와 불일치",
            suggested_value=3,
            found_in_text=False
        )

        assert result.is_valid is False
        assert result.suggested_value == 3


class TestCrossValidationResult:
    """CrossValidationResult 테스트"""

    def test_unanimous_consensus(self):
        """만장일치 합의 결과"""
        from orchestrator.validation_wrapper import CrossValidationResult, ProviderValidationResult

        individual_results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.9),
            ProviderValidationResult(provider="claude", success=True, is_valid=True, confidence=0.85),
            ProviderValidationResult(provider="gemini", success=True, is_valid=True, confidence=0.88),
        ]

        result = CrossValidationResult(
            success=True,
            field_name="exp_years",
            final_value=5,
            is_valid=True,
            consensus_reached=True,
            consensus_type="unanimous",
            agreement_rate=1.0,
            weighted_confidence=0.88,
            providers_used=["openai", "claude", "gemini"],
            providers_agreed=["openai", "claude", "gemini"],
            providers_disagreed=[],
            individual_results=individual_results,
            processing_time_ms=500
        )

        assert result.success is True
        assert result.consensus_reached is True
        assert result.consensus_type == "unanimous"
        assert result.agreement_rate == 1.0
        assert len(result.providers_agreed) == 3
        assert len(result.providers_disagreed) == 0

    def test_majority_consensus(self):
        """다수결 합의 결과"""
        from orchestrator.validation_wrapper import CrossValidationResult, ProviderValidationResult

        individual_results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.9),
            ProviderValidationResult(provider="claude", success=True, is_valid=True, confidence=0.85),
            ProviderValidationResult(provider="gemini", success=True, is_valid=False, confidence=0.6),
        ]

        result = CrossValidationResult(
            success=True,
            field_name="current_company",
            final_value="ABC회사",
            is_valid=True,
            consensus_reached=True,
            consensus_type="weighted_majority",
            agreement_rate=0.67,
            weighted_confidence=0.85,
            providers_used=["openai", "claude", "gemini"],
            providers_agreed=["openai", "claude"],
            providers_disagreed=["gemini"],
            individual_results=individual_results
        )

        assert result.consensus_reached is True
        assert result.consensus_type == "weighted_majority"
        assert len(result.providers_agreed) == 2
        assert len(result.providers_disagreed) == 1

    def test_no_consensus(self):
        """합의 실패 결과"""
        from orchestrator.validation_wrapper import CrossValidationResult

        result = CrossValidationResult(
            success=True,
            field_name="skills",
            final_value=["Python", "Java"],
            is_valid=True,
            consensus_reached=False,
            consensus_type="no_consensus",
            agreement_rate=0.5,
            weighted_confidence=0.3,
            providers_agreed=["openai"],
            providers_disagreed=["claude"]
        )

        assert result.consensus_reached is False
        assert result.consensus_type == "no_consensus"
        assert result.weighted_confidence == 0.3

    def test_hallucination_detected(self):
        """환각 탐지 결과"""
        from orchestrator.validation_wrapper import CrossValidationResult

        result = CrossValidationResult(
            success=True,
            field_name="exp_years",
            final_value=10,
            is_valid=False,
            consensus_reached=True,
            consensus_type="unanimous_invalid",
            agreement_rate=1.0,
            weighted_confidence=0.9,
            hallucination_detected=True,
            hallucination_details="다수의 LLM(3/3)이 원본 텍스트에서 값을 찾지 못함"
        )

        assert result.hallucination_detected is True
        assert result.is_valid is False
        assert "원본 텍스트에서 값을 찾지 못함" in result.hallucination_details


class TestCrossValidationEngineConsensusLogic:
    """CrossValidationEngine의 합의 로직 테스트"""

    @pytest.fixture
    def engine(self):
        """테스트용 CrossValidationEngine"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_hallucination_detection=True,
                use_evidence_tracking=True
            )
            mock_llm.return_value = MagicMock()

            from orchestrator.validation_wrapper import CrossValidationEngine
            return CrossValidationEngine()

    def test_analyze_consensus_unanimous_valid(self, engine):
        """만장일치 유효 합의 분석"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.9),
            ProviderValidationResult(provider="claude", success=True, is_valid=True, confidence=0.85),
            ProviderValidationResult(provider="gemini", success=True, is_valid=True, confidence=0.88),
        ]

        consensus = engine._analyze_consensus(results, "test_value")

        assert consensus["consensus_reached"] is True
        assert consensus["consensus_type"] == "unanimous"
        assert consensus["agreement_rate"] == 1.0
        assert consensus["is_valid"] is True
        assert len(consensus["providers_agreed"]) == 3

    def test_analyze_consensus_unanimous_invalid(self, engine):
        """만장일치 무효 합의 분석"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=False, confidence=0.9, suggested_value="corrected"),
            ProviderValidationResult(provider="claude", success=True, is_valid=False, confidence=0.85),
            ProviderValidationResult(provider="gemini", success=True, is_valid=False, confidence=0.88),
        ]

        consensus = engine._analyze_consensus(results, "original_value")

        assert consensus["consensus_reached"] is True
        assert consensus["consensus_type"] == "unanimous_invalid"
        assert consensus["is_valid"] is False
        assert consensus["final_value"] == "corrected"  # 수정 제안 사용

    def test_analyze_consensus_weighted_majority(self, engine):
        """가중 다수결 합의 분석"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.95),  # 높은 신뢰도
            ProviderValidationResult(provider="claude", success=True, is_valid=True, confidence=0.9),   # 높은 신뢰도
            ProviderValidationResult(provider="gemini", success=True, is_valid=False, confidence=0.5),  # 낮은 신뢰도
        ]

        consensus = engine._analyze_consensus(results, "test_value")

        assert consensus["consensus_reached"] is True
        assert consensus["consensus_type"] == "weighted_majority"
        assert consensus["is_valid"] is True
        assert "openai" in consensus["providers_agreed"]
        assert "claude" in consensus["providers_agreed"]
        assert "gemini" in consensus["providers_disagreed"]

    def test_analyze_consensus_no_consensus(self, engine):
        """합의 실패 분석"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        # 비슷한 신뢰도로 50:50 분할
        results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.7),
            ProviderValidationResult(provider="claude", success=True, is_valid=False, confidence=0.7),
        ]

        consensus = engine._analyze_consensus(results, "test_value")

        # 50:50이면 합의 임계값(60%)을 충족하지 못함
        assert consensus["consensus_type"] in ["no_consensus", "fallback_high_confidence"]

    def test_analyze_consensus_empty_results(self, engine):
        """빈 결과 분석"""
        consensus = engine._analyze_consensus([], "test_value")

        assert consensus["consensus_reached"] is False
        assert consensus["consensus_type"] == "none"
        assert consensus["weighted_confidence"] == 0.0

    def test_analyze_consensus_high_confidence_fallback(self, engine):
        """높은 신뢰도 기반 fallback 분석"""
        from orchestrator.validation_wrapper import ProviderValidationResult

        # 하나만 높은 신뢰도
        results = [
            ProviderValidationResult(provider="openai", success=True, is_valid=True, confidence=0.95),
            ProviderValidationResult(provider="claude", success=True, is_valid=False, confidence=0.55),
        ]

        consensus = engine._analyze_consensus(results, "test_value")

        # openai가 높은 신뢰도로 유효 판정
        assert consensus["is_valid"] is True or consensus["consensus_type"] == "fallback_high_confidence"


@pytest.mark.asyncio
class TestCrossValidationEngineAsync:
    """CrossValidationEngine 비동기 테스트"""

    @pytest.fixture
    def ctx(self):
        """테스트용 PipelineContext"""
        ctx = PipelineContext()
        ctx.set_raw_input(b"test content", "test_resume.pdf")
        ctx.set_parsed_text("경력 5년 개발자입니다. Python, Java 사용. 현재 ABC 회사 선임개발자로 재직 중.")
        ctx.extract_pii()
        return ctx

    async def test_cross_validate_success(self, ctx):
        """성공적인 교차 검증"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            # Feature flags 설정
            mock_flags.return_value = MagicMock(
                use_hallucination_detection=False,
                use_evidence_tracking=True
            )

            # LLM Manager 설정
            mock_llm_instance = MagicMock()

            # 프로바이더 Enum 모킹
            class MockProvider:
                value = ""
                def __init__(self, name):
                    self.value = name

            openai = MockProvider("openai")
            claude = MockProvider("claude")

            mock_llm_instance.get_available_providers.return_value = [openai, claude]

            # call_json 응답 모킹
            async def mock_call_json(**kwargs):
                response = MagicMock()
                response.success = True
                response.content = {
                    "is_valid": True,
                    "confidence": 0.9,
                    "found_in_text": True,
                    "reasoning": "텍스트에서 확인됨"
                }
                return response

            mock_llm_instance.call_json = AsyncMock(side_effect=mock_call_json)
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            result = await engine.cross_validate(
                ctx=ctx,
                field_name="exp_years",
                field_value=5,
                original_text="경력 5년 개발자입니다."
            )

            assert result.success is True
            assert result.is_valid is True
            assert len(result.providers_used) == 2

    async def test_cross_validate_no_providers(self, ctx):
        """프로바이더 없음 테스트"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_hallucination_detection=False,
                use_evidence_tracking=False
            )

            mock_llm_instance = MagicMock()
            mock_llm_instance.get_available_providers.return_value = []
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            result = await engine.cross_validate(
                ctx=ctx,
                field_name="exp_years",
                field_value=5,
                original_text="경력 5년"
            )

            assert result.success is False
            assert "Not enough LLM providers" in result.error

    async def test_cross_validate_single_provider_fallback(self, ctx):
        """단일 프로바이더 fallback 테스트"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_hallucination_detection=False,
                use_evidence_tracking=True
            )

            mock_llm_instance = MagicMock()

            class MockProvider:
                value = "openai"

            mock_llm_instance.get_available_providers.return_value = [MockProvider()]

            async def mock_call_json(**kwargs):
                response = MagicMock()
                response.success = True
                response.content = {
                    "is_valid": True,
                    "confidence": 0.85,
                    "found_in_text": True,
                    "reasoning": "확인됨"
                }
                return response

            mock_llm_instance.call_json = AsyncMock(side_effect=mock_call_json)
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            result = await engine.cross_validate(
                ctx=ctx,
                field_name="exp_years",
                field_value=5,
                original_text="경력 5년",
                min_providers=2  # 2개 요청했지만 1개만 사용 가능
            )

            # 단일 프로바이더 fallback
            assert result.success is True
            assert result.consensus_type == "single_provider"
            assert result.weighted_confidence < 0.85  # 단일 프로바이더이므로 신뢰도 감소

    async def test_cross_validate_multiple_fields(self, ctx):
        """여러 필드 동시 교차 검증"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_hallucination_detection=False,
                use_evidence_tracking=False
            )

            mock_llm_instance = MagicMock()

            class MockProvider:
                def __init__(self, name):
                    self.value = name

            mock_llm_instance.get_available_providers.return_value = [
                MockProvider("openai"),
                MockProvider("claude")
            ]

            call_count = 0
            async def mock_call_json(**kwargs):
                nonlocal call_count
                call_count += 1
                response = MagicMock()
                response.success = True
                response.content = {
                    "is_valid": True,
                    "confidence": 0.9,
                    "found_in_text": True,
                    "reasoning": "확인됨"
                }
                return response

            mock_llm_instance.call_json = AsyncMock(side_effect=mock_call_json)
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            fields = {
                "exp_years": 5,
                "current_company": "ABC회사",
                "skills": ["Python", "Java"]
            }

            results = await engine.cross_validate_multiple_fields(
                ctx=ctx,
                fields=fields,
                original_text="경력 5년 ABC회사 Python Java"
            )

            assert len(results) == 3
            assert "exp_years" in results
            assert "current_company" in results
            assert "skills" in results

            # 각 필드가 2개 프로바이더로 검증되었으므로 최소 6번 호출
            assert call_count >= 6

    async def test_cross_validate_provider_failure(self, ctx):
        """프로바이더 실패 처리 테스트"""
        with patch('orchestrator.validation_wrapper.get_llm_manager') as mock_llm, \
             patch('orchestrator.validation_wrapper.get_feature_flags') as mock_flags:

            mock_flags.return_value = MagicMock(
                use_hallucination_detection=False,
                use_evidence_tracking=False
            )

            mock_llm_instance = MagicMock()

            class MockProvider:
                def __init__(self, name):
                    self.value = name

            mock_llm_instance.get_available_providers.return_value = [
                MockProvider("openai"),
                MockProvider("claude")
            ]

            call_count = 0
            async def mock_call_json(**kwargs):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    # 첫 번째 호출 성공
                    response = MagicMock()
                    response.success = True
                    response.content = {
                        "is_valid": True,
                        "confidence": 0.9,
                        "found_in_text": True,
                        "reasoning": "확인됨"
                    }
                    return response
                else:
                    # 두 번째 호출 실패
                    response = MagicMock()
                    response.success = False
                    response.error = "API Error"
                    return response

            mock_llm_instance.call_json = AsyncMock(side_effect=mock_call_json)
            mock_llm.return_value = mock_llm_instance

            from orchestrator.validation_wrapper import CrossValidationEngine
            engine = CrossValidationEngine()

            result = await engine.cross_validate(
                ctx=ctx,
                field_name="exp_years",
                field_value=5,
                original_text="경력 5년"
            )

            # 하나가 실패해도 나머지로 결과 반환
            assert result.success is True
            # 성공한 프로바이더만 사용됨
            assert len(result.providers_used) == 1


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
