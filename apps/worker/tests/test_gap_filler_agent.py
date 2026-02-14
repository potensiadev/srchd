"""
GapFillerAgent 단위 테스트
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from agents.gap_filler_agent import GapFillerAgent
from schemas.phase1_types import COVERAGE_THRESHOLD


class TestGapFillerAgent:
    """GapFillerAgent 테스트"""

    @pytest.fixture
    def mock_llm_manager(self):
        """Mock LLM Manager - call_json 메서드 mock"""
        manager = MagicMock()
        # GapFillerAgent는 call_json을 사용함
        manager.call_json = AsyncMock()
        return manager

    @pytest.fixture
    def agent(self, mock_llm_manager):
        return GapFillerAgent(
            llm_manager=mock_llm_manager,
            max_retries=2,
            timeout_seconds=5,
            coverage_threshold=COVERAGE_THRESHOLD,
        )

    @pytest.fixture
    def agent_without_llm(self):
        return GapFillerAgent(llm_manager=None)

    @pytest.mark.asyncio
    async def test_skip_high_coverage(self, agent):
        """높은 coverage일 때 스킵"""
        result = await agent.fill_gaps(
            gap_candidates=["phone", "email"],
            current_data={},
            original_text="...",
            coverage_score=90.0,  # > 85%
        )

        assert result.success is True
        assert result.skipped is True
        assert result.total_llm_calls == 0
        assert len(result.filled_fields) == 0

    @pytest.mark.asyncio
    async def test_no_candidates(self, agent):
        """후보가 없을 때"""
        result = await agent.fill_gaps(
            gap_candidates=[],
            current_data={},
            original_text="...",
            coverage_score=50.0,
        )

        assert result.success is True
        assert result.skipped is False
        assert result.total_llm_calls == 0

    @pytest.mark.asyncio
    async def test_no_llm_manager(self, agent_without_llm):
        """LLM manager가 없을 때"""
        result = await agent_without_llm.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="...",
            coverage_score=50.0,
        )

        assert result.success is False
        assert "phone" in result.still_missing

    @pytest.mark.asyncio
    async def test_successful_phone_extraction(self, agent, mock_llm_manager):
        """전화번호 성공적 추출"""
        # call_json은 파싱된 dict를 content로 반환
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"phone": "010-1234-5678"}
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="연락처: 010-1234-5678",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "phone" in result.filled_fields
        assert result.filled_fields["phone"] == "010-1234-5678"
        assert result.total_llm_calls >= 1

    @pytest.mark.asyncio
    async def test_successful_email_extraction(self, agent, mock_llm_manager):
        """이메일 성공적 추출"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"email": "test@example.com"}
        )

        result = await agent.fill_gaps(
            gap_candidates=["email"],
            current_data={},
            original_text="이메일: test@example.com",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "email" in result.filled_fields
        assert result.filled_fields["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_successful_skills_extraction(self, agent, mock_llm_manager):
        """스킬 목록 추출"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"skills": ["Python", "JavaScript", "PostgreSQL"]}
        )

        result = await agent.fill_gaps(
            gap_candidates=["skills"],
            current_data={},
            original_text="기술스택: Python, JavaScript, PostgreSQL",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "skills" in result.filled_fields
        assert len(result.filled_fields["skills"]) == 3

    @pytest.mark.asyncio
    async def test_null_value_not_filled(self, agent, mock_llm_manager):
        """null 값은 채우지 않음"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"phone": None}
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="연락처 없음",
            coverage_score=50.0,
        )

        assert "phone" not in result.filled_fields
        assert "phone" in result.still_missing

    @pytest.mark.asyncio
    async def test_empty_array_not_filled(self, agent, mock_llm_manager):
        """빈 배열은 채우지 않음"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"skills": []}
        )

        result = await agent.fill_gaps(
            gap_candidates=["skills"],
            current_data={},
            original_text="기술 없음",
            coverage_score=50.0,
        )

        assert "skills" not in result.filled_fields
        assert "skills" in result.still_missing

    @pytest.mark.asyncio
    async def test_llm_error_retry(self, agent, mock_llm_manager):
        """LLM 오류 시 재시도"""
        # 첫 번째 호출: 오류, 두 번째 호출: 성공
        mock_llm_manager.call_json.side_effect = [
            MagicMock(error="API error", content=None),
            MagicMock(error=None, content={"phone": "010-1234-5678"}),
        ]

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="연락처: 010-1234-5678",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "phone" in result.filled_fields
        # 재시도 기록 확인
        assert result.total_retries >= 1

    @pytest.mark.asyncio
    async def test_multiple_fields(self, agent, mock_llm_manager):
        """여러 필드 동시 추출"""
        mock_llm_manager.call_json.side_effect = [
            MagicMock(error=None, content={"phone": "010-1234-5678"}),
            MagicMock(error=None, content={"email": "test@example.com"}),
        ]

        result = await agent.fill_gaps(
            gap_candidates=["phone", "email"],
            current_data={},
            original_text="연락처: 010-1234-5678, 이메일: test@example.com",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "phone" in result.filled_fields
        assert "email" in result.filled_fields
        assert len(result.attempts) == 2

    @pytest.mark.asyncio
    async def test_unknown_field_skipped(self, agent, mock_llm_manager):
        """알 수 없는 필드는 스킵"""
        result = await agent.fill_gaps(
            gap_candidates=["unknown_field"],
            current_data={},
            original_text="...",
            coverage_score=50.0,
        )

        assert "unknown_field" in result.still_missing
        assert mock_llm_manager.call_json.call_count == 0

    @pytest.mark.asyncio
    async def test_json_parse_error_retry(self, agent, mock_llm_manager):
        """JSON 파싱 오류 시 재시도 (call_json이 실패 후 성공)"""
        # call_json이 처음엔 에러를 반환하고 두 번째엔 성공
        mock_llm_manager.call_json.side_effect = [
            MagicMock(error="JSON parse error", content=None),
            MagicMock(error=None, content={"phone": "010-1234-5678"}),
        ]

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="연락처: 010-1234-5678",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "phone" in result.filled_fields

    @pytest.mark.asyncio
    async def test_processing_time_tracked(self, agent, mock_llm_manager):
        """처리 시간 추적"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"phone": "010-1234-5678"}
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="...",
            coverage_score=50.0,
        )

        assert result.processing_time_ms >= 0
        assert len(result.attempts) > 0
        assert result.attempts[0].processing_time_ms >= 0

    @pytest.mark.asyncio
    async def test_careers_extraction(self, agent, mock_llm_manager):
        """경력 정보 추출"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={
                "careers": [
                    {
                        "company": "테스트회사",
                        "position": "개발자",
                        "start_date": "2020-01",
                        "end_date": "present"
                    }
                ]
            }
        )

        result = await agent.fill_gaps(
            gap_candidates=["careers"],
            current_data={},
            original_text="테스트회사 개발자 2020.01 ~ 현재",
            coverage_score=50.0,
        )

        assert result.success is True
        assert "careers" in result.filled_fields
        assert len(result.filled_fields["careers"]) == 1
        assert result.filled_fields["careers"][0]["company"] == "테스트회사"


class TestGapFillerAgentEdgeCases:
    """Edge case 테스트"""

    @pytest.fixture
    def mock_llm_manager(self):
        """Mock LLM Manager - call_json 메서드 mock"""
        manager = MagicMock()
        manager.call_json = AsyncMock()
        return manager

    @pytest.mark.asyncio
    async def test_coverage_exactly_threshold(self, mock_llm_manager):
        """coverage가 정확히 threshold일 때"""
        agent = GapFillerAgent(
            llm_manager=mock_llm_manager,
            coverage_threshold=0.85,
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="...",
            coverage_score=85.0,  # 정확히 85%
        )

        # 85% >= 85% 이므로 스킵
        assert result.skipped is True

    @pytest.mark.asyncio
    async def test_coverage_just_below_threshold(self, mock_llm_manager):
        """coverage가 threshold 바로 아래일 때"""
        mock_llm_manager.call_json.return_value = MagicMock(
            error=None,
            content={"phone": "010-1234-5678"}
        )

        agent = GapFillerAgent(
            llm_manager=mock_llm_manager,
            coverage_threshold=0.85,
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="연락처: 010-1234-5678",
            coverage_score=84.9,  # 84.9% < 85%
        )

        # 스킵하지 않음
        assert result.skipped is False
        assert mock_llm_manager.call_json.called

    @pytest.mark.asyncio
    async def test_max_retries_exceeded(self, mock_llm_manager):
        """최대 재시도 초과"""
        # 모든 시도 실패
        mock_llm_manager.call_json.return_value = MagicMock(
            error="API error",
            content=None
        )

        agent = GapFillerAgent(
            llm_manager=mock_llm_manager,
            max_retries=2,
        )

        result = await agent.fill_gaps(
            gap_candidates=["phone"],
            current_data={},
            original_text="...",
            coverage_score=50.0,
        )

        assert result.success is False
        assert "phone" in result.still_missing
        # 첫 시도 + 2번 재시도 = 3번 호출
        assert mock_llm_manager.call_json.call_count == 3
