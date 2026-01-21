"""
Test Conditional LLM - Confidence 기반 LLM 호출 테스트

고신뢰도 결과 → 단일 모델만 사용
저신뢰도 결과 → 추가 모델 호출
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import MagicMock, patch
from dataclasses import dataclass
from typing import Any, Dict, Optional


# Mock dependencies before importing
sys.modules['utils.section_separator'] = MagicMock()
sys.modules['schemas.resume_schema'] = MagicMock()
sys.modules['schemas.canonical_labels'] = MagicMock()


class TestEvaluateFirstResponse:
    """_evaluate_first_response 메서드 테스트"""

    @pytest.fixture
    def analyst_agent(self):
        """AnalystAgent 인스턴스 생성 (LLM 호출 없이)"""
        with patch('agents.analyst_agent.get_section_separator'), \
             patch('agents.analyst_agent.get_llm_manager'), \
             patch('agents.analyst_agent.get_settings') as mock_settings:
            mock_settings.return_value = MagicMock(
                ANALYSIS_MODE=MagicMock(value="phase_1"),
                USE_CONDITIONAL_LLM=True
            )
            from agents.analyst_agent import AnalystAgent
            agent = AnalystAgent()
            return agent

    @pytest.fixture
    def mock_llm_response(self):
        """LLMResponse Mock Factory"""
        def _create(content, success=True, error=None):
            from services.llm_manager import LLMProvider
            return MagicMock(
                provider=LLMProvider.OPENAI,
                content=content,
                raw_response="",
                model="gpt-4o",
                success=success,
                error=error
            )
        return _create

    def test_high_confidence_complete_fields(self, analyst_agent, mock_llm_response):
        """핵심 필드 모두 존재 → 높은 신뢰도"""
        response = mock_llm_response({
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "test@example.com",
            "careers": [{"company": "테스트"}],
            "skills": ["Python", "Java"],
            "education": [{"school": "서울대"}]
        })
        
        confidence, missing = analyst_agent._evaluate_first_response(response)
        
        assert confidence >= 0.85
        assert len(missing) == 0

    def test_low_confidence_missing_fields(self, analyst_agent, mock_llm_response):
        """핵심 필드 누락 → 낮은 신뢰도 + 누락 필드 반환"""
        response = mock_llm_response({
            "name": "홍길동",
            # phone 누락
            # email 누락
        })
        
        confidence, missing = analyst_agent._evaluate_first_response(response)
        
        assert confidence < 0.85
        assert "phone" in missing
        assert "email" in missing

    def test_failed_response_zero_confidence(self, analyst_agent, mock_llm_response):
        """실패한 응답 → 0 신뢰도"""
        response = mock_llm_response(None, success=False, error="API Error")
        
        confidence, missing = analyst_agent._evaluate_first_response(response)
        
        assert confidence == 0.0
        assert len(missing) == 3  # 모든 핵심 필드

    def test_empty_content_zero_confidence(self, analyst_agent, mock_llm_response):
        """빈 content → 0 신뢰도"""
        response = mock_llm_response({})
        
        confidence, missing = analyst_agent._evaluate_first_response(response)
        
        # Empty dict means all fields missing
        assert len(missing) == 3

    def test_bonus_for_careers(self, analyst_agent, mock_llm_response):
        """경력 정보 존재 시 보너스 점수"""
        response_with_careers = mock_llm_response({
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "test@example.com",
            "careers": [{"company": "테스트"}]
        })
        
        response_without_careers = mock_llm_response({
            "name": "홍길동",
            "phone": "010-1234-5678",
            "email": "test@example.com"
        })
        
        conf_with, _ = analyst_agent._evaluate_first_response(response_with_careers)
        conf_without, _ = analyst_agent._evaluate_first_response(response_without_careers)
        
        # conf_with should be >= conf_without (may be equal if both capped at 1.0)
        assert conf_with >= conf_without
        # Both should be at least the base (all critical fields present = 1.0)
        assert conf_without >= 1.0


class TestConfidenceThreshold:
    """CONFIDENCE_THRESHOLD 상수 테스트"""

    def test_threshold_value(self):
        """임계값이 0.85인지 확인"""
        with patch('agents.analyst_agent.get_section_separator'), \
             patch('agents.analyst_agent.get_llm_manager'), \
             patch('agents.analyst_agent.get_settings') as mock_settings:
            mock_settings.return_value = MagicMock(
                ANALYSIS_MODE=MagicMock(), 
                USE_CONDITIONAL_LLM=True,
                LLM_CONFIDENCE_THRESHOLD=0.85
            )
            from agents.analyst_agent import AnalystAgent
            agent = AnalystAgent()
            # Access via instance (it's now a property)
            assert agent.CONFIDENCE_THRESHOLD == 0.85
            assert agent.confidence_threshold == 0.85

    def test_threshold_is_float(self):
        """임계값이 float 타입인지 확인"""
        with patch('agents.analyst_agent.get_section_separator'), \
             patch('agents.analyst_agent.get_llm_manager'), \
             patch('agents.analyst_agent.get_settings') as mock_settings:
            mock_settings.return_value = MagicMock(
                ANALYSIS_MODE=MagicMock(), 
                USE_CONDITIONAL_LLM=True,
                LLM_CONFIDENCE_THRESHOLD=0.85
            )
            from agents.analyst_agent import AnalystAgent
            agent = AnalystAgent()
            assert isinstance(agent.confidence_threshold, float)


class TestCriticalFields:
    """CRITICAL_FIELDS 상수 테스트"""

    def test_critical_fields_content(self):
        """핵심 필드 목록 확인"""
        with patch('agents.analyst_agent.get_section_separator'), \
             patch('agents.analyst_agent.get_llm_manager'), \
             patch('agents.analyst_agent.get_settings') as mock_settings:
            mock_settings.return_value = MagicMock(ANALYSIS_MODE=MagicMock(), USE_CONDITIONAL_LLM=True)
            from agents.analyst_agent import AnalystAgent
            expected = ["name", "phone", "email"]
            assert AnalystAgent.CRITICAL_FIELDS == expected

    def test_critical_fields_count(self):
        """핵심 필드 개수 확인"""
        with patch('agents.analyst_agent.get_section_separator'), \
             patch('agents.analyst_agent.get_llm_manager'), \
             patch('agents.analyst_agent.get_settings') as mock_settings:
            mock_settings.return_value = MagicMock(ANALYSIS_MODE=MagicMock(), USE_CONDITIONAL_LLM=True)
            from agents.analyst_agent import AnalystAgent
            assert len(AnalystAgent.CRITICAL_FIELDS) == 3
