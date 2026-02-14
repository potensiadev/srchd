"""
PipelineOrchestrator Phase 1 통합 테스트
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestPipelineOrchestratorPhase1Integration:
    """Phase 1 에이전트 오케스트레이터 통합 테스트"""

    @pytest.fixture
    def mock_feature_flags(self):
        """모든 Phase 1 기능 활성화된 Feature Flags"""
        flags = MagicMock()
        flags.use_document_classifier = True
        flags.use_coverage_calculator = True
        flags.use_gap_filler = True
        flags.use_llm_validation = False
        flags.use_hallucination_detection = True
        flags.use_evidence_tracking = True
        flags.debug_pipeline = False
        flags.gap_filler_max_retries = 2
        flags.gap_filler_timeout = 5
        flags.coverage_threshold = 0.85
        return flags

    @pytest.fixture
    def mock_feature_flags_disabled(self):
        """Phase 1 기능 비활성화된 Feature Flags"""
        flags = MagicMock()
        flags.use_document_classifier = False
        flags.use_coverage_calculator = False
        flags.use_gap_filler = False
        flags.use_llm_validation = False
        flags.use_hallucination_detection = False
        flags.use_evidence_tracking = False
        flags.debug_pipeline = False
        return flags

    @pytest.mark.asyncio
    async def test_document_classification_reject_non_resume(self, mock_feature_flags):
        """비이력서 문서 거부 테스트"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags):
            orchestrator = PipelineOrchestrator()

            # DocumentClassifier 모킹
            mock_classifier = MagicMock()
            mock_result = MagicMock()
            mock_result.document_kind.value = "non_resume"
            mock_result.confidence = 0.95
            mock_result.should_reject = True
            mock_result.rejection_reason = "Job posting detected"
            mock_result.non_resume_type.value = "job_posting"
            mock_result.signals_found = []
            mock_result.used_llm = False
            mock_classifier.classify = AsyncMock(return_value=mock_result)

            orchestrator._document_classifier = mock_classifier

            # 파싱된 컨텍스트 모킹
            mock_ctx = MagicMock()
            mock_ctx.parsed_data.raw_text = "채용공고입니다. 모집합니다."
            mock_ctx.raw_input.filename = "job_posting.pdf"
            mock_ctx.start_stage = MagicMock()
            mock_ctx.complete_stage = MagicMock()
            mock_ctx.warning_collector.add = MagicMock()

            result = await orchestrator._stage_document_classification(mock_ctx)

            assert result["should_reject"] is True
            assert result["document_kind"] == "non_resume"
            assert "이력서가 아닙니다" in result["error"]

    @pytest.mark.asyncio
    async def test_document_classification_accept_resume(self, mock_feature_flags):
        """이력서 문서 수락 테스트"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags):
            orchestrator = PipelineOrchestrator()

            # DocumentClassifier 모킹
            mock_classifier = MagicMock()
            mock_result = MagicMock()
            mock_result.document_kind.value = "resume"
            mock_result.confidence = 0.92
            mock_result.should_reject = False
            mock_result.rejection_reason = None
            mock_result.non_resume_type = None
            mock_result.signals_found = ["이력서", "경력사항"]
            mock_result.used_llm = False
            mock_classifier.classify = AsyncMock(return_value=mock_result)

            orchestrator._document_classifier = mock_classifier

            # 파싱된 컨텍스트 모킹
            mock_ctx = MagicMock()
            mock_ctx.parsed_data.raw_text = "이력서\n홍길동\n경력사항: ..."
            mock_ctx.raw_input.filename = "resume.pdf"
            mock_ctx.start_stage = MagicMock()
            mock_ctx.complete_stage = MagicMock()

            result = await orchestrator._stage_document_classification(mock_ctx)

            assert result["success"] is True
            assert result.get("should_reject") is not True
            assert result["document_kind"] == "resume"
            assert result["confidence"] == 0.92

    @pytest.mark.asyncio
    async def test_document_classification_disabled(self, mock_feature_flags_disabled):
        """DocumentClassifier 비활성화 시 스킵"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags_disabled):
            orchestrator = PipelineOrchestrator()

            mock_ctx = MagicMock()

            result = await orchestrator._stage_document_classification(mock_ctx)

            assert result["success"] is True
            assert result["document_kind"] == "resume"  # 기본값
            assert result["confidence"] == 1.0  # 완전 신뢰

    @pytest.mark.asyncio
    async def test_coverage_calculation_identifies_missing_fields(self, mock_feature_flags):
        """커버리지 계산 - 누락 필드 식별"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags):
            orchestrator = PipelineOrchestrator()

            # CoverageCalculator 모킹
            mock_calculator = MagicMock()
            mock_result = MagicMock()
            mock_result.coverage_score = 65.0
            mock_result.evidence_backed_ratio = 0.5
            mock_result.missing_fields = ["phone", "email", "skills"]
            mock_result.low_confidence_fields = []
            mock_result.gap_fill_candidates = ["phone", "email", "skills"]
            mock_result.critical_coverage = 70.0
            mock_result.important_coverage = 60.0
            mock_result.optional_coverage = 50.0
            mock_result.field_coverages = {}
            mock_calculator.calculate = MagicMock(return_value=mock_result)

            orchestrator._coverage_calculator = mock_calculator

            # 컨텍스트 모킹
            mock_ctx = MagicMock()
            mock_decision = MagicMock()
            mock_decision.final_value = "홍길동"
            mock_decision.confidence = 0.9
            mock_ctx.decision_manager.decide_all.return_value = {"name": mock_decision}
            mock_ctx.parsed_data.raw_text = "홍길동 이력서..."
            mock_ctx.start_stage = MagicMock()
            mock_ctx.complete_stage = MagicMock()

            result = await orchestrator._stage_coverage_calculation(mock_ctx)

            assert result["success"] is True
            assert result["coverage_score"] == 65.0
            assert len(result["gap_fill_candidates"]) == 3
            assert "phone" in result["gap_fill_candidates"]

    @pytest.mark.asyncio
    async def test_coverage_calculation_disabled(self, mock_feature_flags_disabled):
        """CoverageCalculator 비활성화 시 스킵"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags_disabled):
            orchestrator = PipelineOrchestrator()

            mock_ctx = MagicMock()

            result = await orchestrator._stage_coverage_calculation(mock_ctx)

            assert result["success"] is True
            assert result["coverage_score"] == 0.0
            assert result["gap_fill_candidates"] == []

    @pytest.mark.asyncio
    async def test_gap_filling_fills_missing_fields(self, mock_feature_flags):
        """갭 필링 - 누락 필드 채우기"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags):
            orchestrator = PipelineOrchestrator()

            # GapFillerAgent 모킹
            mock_gap_filler = MagicMock()
            mock_result = MagicMock()
            mock_result.success = True
            mock_result.skipped = False
            mock_result.filled_fields = {
                "phone": "010-1234-5678",
                "email": "test@example.com"
            }
            mock_result.still_missing = ["skills"]
            mock_result.total_llm_calls = 2
            mock_result.total_retries = 0
            mock_result.processing_time_ms = 150
            mock_gap_filler.fill_gaps = AsyncMock(return_value=mock_result)

            orchestrator._gap_filler_agent = mock_gap_filler

            # 컨텍스트 모킹
            mock_ctx = MagicMock()
            mock_decision = MagicMock()
            mock_decision.final_value = "홍길동"
            mock_ctx.decision_manager.decide_all.return_value = {"name": mock_decision}
            mock_ctx.parsed_data.raw_text = "홍길동... 연락처: 010-1234-5678"
            mock_ctx.start_stage = MagicMock()
            mock_ctx.complete_stage = MagicMock()
            mock_ctx.propose = MagicMock()

            coverage_result = {
                "coverage_score": 60.0,
                "gap_fill_candidates": ["phone", "email", "skills"]
            }

            result = await orchestrator._stage_gap_filling(mock_ctx, coverage_result)

            assert result["success"] is True
            assert result["filled_count"] == 2
            assert "skills" in result["still_missing"]

            # 제안이 추가되었는지 확인
            assert mock_ctx.propose.call_count == 2

    @pytest.mark.asyncio
    async def test_gap_filling_skipped_when_no_candidates(self, mock_feature_flags):
        """갭 필링 - 대상 없을 때 스킵"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags):
            orchestrator = PipelineOrchestrator()

            mock_ctx = MagicMock()

            coverage_result = {
                "coverage_score": 90.0,
                "gap_fill_candidates": []  # 대상 없음
            }

            result = await orchestrator._stage_gap_filling(mock_ctx, coverage_result)

            assert result["success"] is True
            assert result["filled_count"] == 0

    @pytest.mark.asyncio
    async def test_gap_filling_disabled(self, mock_feature_flags_disabled):
        """GapFillerAgent 비활성화 시 스킵"""
        from orchestrator.pipeline_orchestrator import PipelineOrchestrator

        with patch('orchestrator.pipeline_orchestrator.get_feature_flags', return_value=mock_feature_flags_disabled):
            orchestrator = PipelineOrchestrator()

            mock_ctx = MagicMock()

            coverage_result = {
                "coverage_score": 60.0,
                "gap_fill_candidates": ["phone", "email"]
            }

            result = await orchestrator._stage_gap_filling(mock_ctx, coverage_result)

            assert result["success"] is True
            assert result["filled_count"] == 0


class TestOrchestratorResultPhase1Fields:
    """OrchestratorResult Phase 1 필드 테스트"""

    def test_result_includes_phase1_fields(self):
        """OrchestratorResult에 Phase 1 필드가 포함됨"""
        from orchestrator.pipeline_orchestrator import OrchestratorResult

        result = OrchestratorResult(
            success=True,
            candidate_id="test-123",
            document_kind="resume",
            doc_classification_confidence=0.95,
            coverage_score=85.5,
            gap_fill_count=2,
        )

        assert result.document_kind == "resume"
        assert result.doc_classification_confidence == 0.95
        assert result.coverage_score == 85.5
        assert result.gap_fill_count == 2

    def test_result_to_dict_includes_phase1_fields(self):
        """to_dict()에 Phase 1 필드가 포함됨"""
        from orchestrator.pipeline_orchestrator import OrchestratorResult

        result = OrchestratorResult(
            success=True,
            candidate_id="test-123",
            document_kind="resume",
            doc_classification_confidence=0.92,
            coverage_score=78.0,
            gap_fill_count=3,
        )

        result_dict = result.to_dict()

        assert result_dict["document_kind"] == "resume"
        assert result_dict["doc_classification_confidence"] == 0.92
        assert result_dict["coverage_score"] == 78.0
        assert result_dict["gap_fill_count"] == 3

    def test_result_defaults_for_phase1_fields(self):
        """Phase 1 필드 기본값 테스트"""
        from orchestrator.pipeline_orchestrator import OrchestratorResult

        result = OrchestratorResult(success=False)

        assert result.document_kind is None
        assert result.doc_classification_confidence == 0.0
        assert result.coverage_score == 0.0
        assert result.gap_fill_count == 0
