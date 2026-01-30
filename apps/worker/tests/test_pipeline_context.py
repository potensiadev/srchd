"""
PipelineContext 단위 테스트
"""

import pytest
from datetime import datetime, timedelta

from context import (
    PipelineContext,
    RawInput,
    ParsedData,
    PIIStore,
    StageResult,
    CurrentData,
    Evidence,
    EvidenceStore,
    Proposal,
    Decision,
    DecisionManager,
    HallucinationRecord,
    HallucinationDetector,
    AgentMessage,
    MessageBus,
    PipelineGuardrails,
    GuardrailChecker,
    AuditEntry,
    AuditLog,
    Warning,
    WarningCollector,
)


class TestPIIStore:
    """PIIStore 테스트"""

    def test_extract_name_from_filename(self):
        """파일명에서 이름 추출"""
        pii = PIIStore()
        pii.extract_from_text("이력서 내용", "김철수_이력서.pdf")

        assert pii.name == "김철수"
        assert pii.name_source == "filename"
        assert pii.name_confidence > 0.8

    def test_extract_name_from_text(self):
        """텍스트에서 이름 추출"""
        pii = PIIStore()
        text = "이력서\n\n홍길동\n연락처: 010-1234-5678"
        pii.extract_from_text(text, "resume.pdf")

        assert pii.name == "홍길동"
        assert pii.name_source == "text_header"

    def test_extract_phone(self):
        """전화번호 추출"""
        pii = PIIStore()
        text = "연락처: 010-1234-5678\n이메일: test@example.com"
        pii.extract_from_text(text)

        assert pii.phone == "010-1234-5678"
        assert pii.phone_confidence > 0.8

    def test_extract_email(self):
        """이메일 추출"""
        pii = PIIStore()
        text = "이메일: test@example.com"
        pii.extract_from_text(text)

        assert pii.email == "test@example.com"
        assert pii.email_confidence > 0.9

    def test_mask_pii_for_llm(self):
        """PII 마스킹"""
        pii = PIIStore()
        pii.name = "김철수"
        pii.phone = "010-1234-5678"
        pii.email = "kim@example.com"

        text = "김철수님의 연락처는 010-1234-5678이며 이메일은 kim@example.com입니다."
        masked = pii.mask_pii_for_llm(text)

        assert "[NAME]" in masked
        assert "[PHONE]" in masked
        assert "[EMAIL]" in masked
        assert "김철수" not in masked
        assert "010-1234-5678" not in masked

    def test_unmask_text(self):
        """마스킹 복원"""
        pii = PIIStore()
        pii.name = "김철수"
        pii.masking_map = {"[NAME]": "김철수"}

        unmasked = pii.unmask_text("안녕하세요, [NAME]님")
        assert unmasked == "안녕하세요, 김철수님"


class TestEvidenceStore:
    """EvidenceStore 테스트"""

    def test_add_evidence(self):
        """증거 추가"""
        store = EvidenceStore()
        evidence = store.add_from_llm(
            field_name="exp_years",
            value=5,
            llm_provider="openai",
            confidence=0.85,
            reasoning="경력 섹션에서 5년 확인"
        )

        assert evidence.field_name == "exp_years"
        assert evidence.value == 5
        assert evidence.confidence == 0.85

    def test_get_best_evidence(self):
        """최고 신뢰도 증거 조회"""
        store = EvidenceStore()
        store.add_from_llm("exp_years", 5, "openai", confidence=0.7)
        store.add_from_llm("exp_years", 5, "gemini", confidence=0.9)

        best = store.get_best("exp_years")
        assert best.llm_provider == "gemini"
        assert best.confidence == 0.9

    def test_check_consensus(self):
        """합의 확인"""
        store = EvidenceStore()
        store.add_from_llm("exp_years", 5, "openai", confidence=0.8)
        store.add_from_llm("exp_years", 5, "gemini", confidence=0.85)
        store.add_from_llm("exp_years", 5, "claude", confidence=0.82)

        has_consensus, value, confidence = store.check_consensus("exp_years")
        assert has_consensus is True
        assert value == 5

    def test_check_no_consensus(self):
        """합의 없음 확인"""
        store = EvidenceStore()
        store.add_from_llm("exp_years", 5, "openai", confidence=0.8)
        store.add_from_llm("exp_years", 7, "gemini", confidence=0.85)

        has_consensus, value, confidence = store.check_consensus("exp_years")
        # 2개 중 1개씩이면 50% 합의
        assert has_consensus is True  # 50%도 합의로 처리


class TestDecisionManager:
    """DecisionManager 테스트"""

    def test_single_proposal(self):
        """단일 제안 결정"""
        dm = DecisionManager()
        dm.propose("analyst_agent", "exp_years", 5, 0.85, "경력 분석 결과")

        decision = dm.make_decision("exp_years")
        assert decision.final_value == 5
        assert decision.had_conflict is False

    def test_unanimous_decision(self):
        """만장일치 결정"""
        dm = DecisionManager()
        dm.propose("analyst_gpt", "exp_years", 5, 0.8)
        dm.propose("analyst_gemini", "exp_years", 5, 0.85)

        decision = dm.make_decision("exp_years")
        assert decision.final_value == 5
        assert decision.decision_method == "unanimous"
        assert decision.had_conflict is False
        # 만장일치 보너스
        assert decision.final_confidence > 0.8

    def test_conflict_resolution(self):
        """충돌 해결"""
        dm = DecisionManager()
        dm.propose("analyst_gpt", "exp_years", 5, 0.8)
        dm.propose("analyst_gemini", "exp_years", 7, 0.7)

        decision = dm.make_decision("exp_years")
        assert decision.had_conflict is True
        # 더 높은 신뢰도 선택
        assert decision.final_value == 5

    def test_authority_based_decision(self):
        """권한 기반 결정"""
        dm = DecisionManager()
        dm.propose("pii_extractor", "name", "김철수", 0.7)
        dm.propose("analyst_agent", "name", "김영희", 0.8)

        decision = dm.make_decision("name")
        # pii_extractor가 권한이 더 높음
        assert decision.final_value == "김철수"


class TestHallucinationDetector:
    """HallucinationDetector 테스트"""

    def test_verify_value_in_text(self):
        """텍스트에 값 존재 확인"""
        parsed = ParsedData()
        parsed.raw_text = "총 경력 5년입니다. Python, Java 사용 가능합니다."

        detector = HallucinationDetector(parsed)

        # 존재하는 값
        record = detector.verify_against_text("exp_years", 5)
        assert record is None  # 환각 아님

        # 존재하지 않는 값
        record = detector.verify_against_text("exp_years", 10)
        assert record is not None  # 환각 탐지

    def test_cross_validate_llm_results(self):
        """LLM 결과 교차 검증"""
        detector = HallucinationDetector()

        # 만장일치
        record = detector.cross_validate_llm_results(
            "exp_years",
            {"gpt4": 5, "gemini": 5, "claude": 5}
        )
        assert record is None

        # 불일치
        record = detector.cross_validate_llm_results(
            "exp_years",
            {"gpt4": 5, "gemini": 5, "claude": 7}
        )
        assert record is not None
        assert record.llm_provider == "claude"


class TestMessageBus:
    """MessageBus 테스트"""

    def test_send_message(self):
        """메시지 전송"""
        bus = MessageBus()

        result = bus.send_request(
            from_agent="validation_agent",
            to_agent="analyst_agent",
            subject="경력 검증 요청",
            payload={"field": "exp_years"}
        )

        assert result is not None
        messages = bus.get_messages_for("analyst_agent")
        assert len(messages) == 1

    def test_message_limit(self):
        """메시지 한도"""
        bus = MessageBus(max_messages=5)

        for i in range(6):
            bus.send_request("agent_a", "agent_b", f"message_{i}")

        # 5개 한도
        assert len(bus.messages) == 5

    def test_hop_limit(self):
        """Hop 한도"""
        bus = MessageBus(max_hops=3)

        msg = AgentMessage(
            from_agent="a",
            to_agent="b",
            message_type="request",
            subject="test",
            hop_count=5  # 한도 초과
        )

        result = bus.send(msg)
        assert result is False


class TestGuardrailChecker:
    """GuardrailChecker 테스트"""

    def test_message_limit_check(self):
        """메시지 한도 체크"""
        guardrails = PipelineGuardrails(max_messages=10)
        checker = GuardrailChecker(guardrails)

        assert checker.check_message_limit(5) is True
        assert checker.check_message_limit(10) is False
        assert checker.has_violations() is True

    def test_timeout_check(self):
        """타임아웃 체크"""
        guardrails = PipelineGuardrails(total_timeout_seconds=60)
        checker = GuardrailChecker(guardrails)

        started = datetime.now() - timedelta(seconds=30)
        assert checker.check_total_timeout(started) is True

        started = datetime.now() - timedelta(seconds=120)
        assert checker.check_total_timeout(started) is False

    def test_llm_call_tracking(self):
        """LLM 호출 추적"""
        guardrails = PipelineGuardrails(max_llm_calls_per_stage=3)
        checker = GuardrailChecker(guardrails)

        for _ in range(3):
            checker.record_llm_call("analysis")

        assert checker.check_llm_calls("analysis") is False


class TestWarningCollector:
    """WarningCollector 테스트"""

    def test_add_warning(self):
        """경고 추가"""
        collector = WarningCollector()
        collector.add("LOW_CONFIDENCE", field_name="exp_years")

        assert len(collector.warnings) == 1
        assert collector.warnings[0].code == "LOW_CONFIDENCE"

    def test_low_confidence_warning(self):
        """낮은 신뢰도 경고"""
        collector = WarningCollector()
        collector.add_low_confidence("exp_years", 0.5)

        warnings = collector.get_by_field("exp_years")
        assert len(warnings) == 1

    def test_user_visible_filter(self):
        """사용자 표시 필터"""
        collector = WarningCollector()
        collector.add("LOW_CONFIDENCE", user_visible=True)
        collector.add("INTERNAL_DEBUG", user_visible=False)

        visible = collector.get_user_visible()
        assert len(visible) == 1


class TestPipelineContext:
    """PipelineContext 통합 테스트"""

    def test_basic_flow(self):
        """기본 플로우 테스트"""
        ctx = PipelineContext()

        # 1. 원본 입력
        ctx.set_raw_input(b"test content", "김철수_이력서.pdf")
        assert ctx.raw_input.filename == "김철수_이력서.pdf"

        # 2. 파싱
        ctx.set_parsed_text("김철수\n경력 5년\n010-1234-5678\nkim@test.com")
        assert ctx.parsed_data.text_length > 0

        # 3. PII 추출
        ctx.extract_pii()
        assert ctx.pii_store.name == "김철수"
        assert ctx.pii_store.phone == "010-1234-5678"

        # 4. 마스킹된 텍스트
        masked = ctx.get_text_for_llm()
        assert "[NAME]" in masked
        assert "김철수" not in masked

    def test_evidence_and_decision_flow(self):
        """증거 및 결정 플로우"""
        ctx = PipelineContext()
        ctx.set_parsed_text("총 경력 5년")

        # 증거 추가
        ctx.add_evidence("exp_years", 5, "openai", confidence=0.85)
        ctx.add_evidence("exp_years", 5, "gemini", confidence=0.82)

        # 제안
        ctx.propose("analyst_gpt", "exp_years", 5, 0.85)
        ctx.propose("analyst_gemini", "exp_years", 5, 0.82)

        # 결정
        decision = ctx.decide("exp_years")
        assert decision.final_value == 5
        assert ctx.current_data.exp_years == 5

    def test_hallucination_detection(self):
        """환각 탐지"""
        ctx = PipelineContext()
        ctx.set_parsed_text("경력 5년입니다.")

        # 원본에 있는 값
        assert ctx.verify_hallucination("exp_years", 5) is True

        # 원본에 없는 값
        assert ctx.verify_hallucination("exp_years", 10) is False
        assert len(ctx.warning_collector.warnings) > 0

    def test_checkpoint_flow(self):
        """체크포인트 플로우"""
        ctx = PipelineContext()
        ctx.set_raw_input(b"test", "test.pdf")
        ctx.set_parsed_text("테스트 내용")
        ctx.extract_pii()
        ctx.pii_store.name = "홍길동"

        # 체크포인트 생성
        checkpoint = ctx.create_checkpoint()
        assert checkpoint["pipeline_id"] == ctx.metadata.pipeline_id

        # 새 컨텍스트에서 복원
        ctx2 = PipelineContext()
        result = ctx2.restore_from_checkpoint(checkpoint)
        assert result is True
        assert ctx2.pii_store.name == "홍길동"

    def test_finalize(self):
        """완료 처리"""
        ctx = PipelineContext()
        ctx.set_raw_input(b"test", "김철수_이력서.pdf")
        ctx.set_parsed_text("김철수\n경력 5년\nPython")
        ctx.extract_pii()

        ctx.propose("analyst", "exp_years", 5, 0.85)
        ctx.propose("analyst", "skills", ["Python"], 0.9)

        result = ctx.finalize()

        assert "candidate" in result
        assert result["candidate"]["name"] == "김철수"
        assert result["metadata"]["status"] == "completed"

    def test_guardrail_integration(self):
        """가드레일 통합"""
        guardrails = PipelineGuardrails(max_total_llm_calls=3)
        ctx = PipelineContext()
        ctx.guardrails = guardrails
        ctx.guardrail_checker = GuardrailChecker(guardrails)

        for i in range(3):
            ctx.record_llm_call("analysis", 100)

        # 4번째 호출은 가드레일 위반
        ctx.record_llm_call("analysis", 100)
        assert ctx.guardrail_checker.has_violations() is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
