"""
PipelineContext - Multi-Agent Pipeline의 중앙 컨텍스트 허브

모든 에이전트가 정보를 공유하고, 컨텍스트 손실 없이 협업할 수 있도록 합니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

from .layers import (
    RawInput,
    ParsedData,
    PIIStore,
    StageResult,
    StageResults,
    CurrentData,
    PipelineMetadata,
)
from .evidence import Evidence, EvidenceStore
from .decision import Proposal, Decision, DecisionManager
from .hallucination import HallucinationRecord, HallucinationDetector
from .message_bus import AgentMessage, MessageBus
from .guardrails import PipelineGuardrails, GuardrailChecker
from .audit import AuditEntry, AuditLog
from .warnings import Warning, WarningCollector, WarningCode

logger = logging.getLogger(__name__)


@dataclass
class PipelineContext:
    """
    파이프라인 컨텍스트

    모든 에이전트가 공유하는 중앙 정보 허브입니다.

    Features:
    - 원본 입력 보존 (RawInput)
    - 파싱된 데이터 관리 (ParsedData)
    - PII 안전 저장 및 마스킹 (PIIStore)
    - 스테이지별 결과 추적 (StageResults)
    - LLM 증거 수집 (EvidenceStore)
    - 제안/결정 패턴 (DecisionManager)
    - 환각 탐지 (HallucinationDetector)
    - 에이전트 간 통신 (MessageBus)
    - 가드레일 (GuardrailChecker)
    - 감사 로그 (AuditLog)
    - 경고 수집 (WarningCollector)
    """

    # 레이어들
    raw_input: RawInput = field(default_factory=RawInput)
    parsed_data: ParsedData = field(default_factory=ParsedData)
    pii_store: PIIStore = field(default_factory=PIIStore)
    stage_results: StageResults = field(default_factory=StageResults)
    evidence_store: EvidenceStore = field(default_factory=EvidenceStore)
    decision_manager: DecisionManager = field(default_factory=DecisionManager)
    current_data: CurrentData = field(default_factory=CurrentData)
    message_bus: MessageBus = field(default_factory=MessageBus)
    hallucination_detector: HallucinationDetector = field(default_factory=HallucinationDetector)
    warning_collector: WarningCollector = field(default_factory=WarningCollector)
    metadata: PipelineMetadata = field(default_factory=PipelineMetadata)
    audit_log: AuditLog = field(default_factory=AuditLog)

    # 가드레일
    guardrails: PipelineGuardrails = field(default_factory=PipelineGuardrails)
    guardrail_checker: GuardrailChecker = None

    def __post_init__(self):
        """초기화 후 처리"""
        self.metadata.start()
        self.guardrail_checker = GuardrailChecker(self.guardrails)
        logger.info(f"[PipelineContext] 생성됨: {self.metadata.pipeline_id}")

    # ========================================
    # 원본 입력 관리
    # ========================================

    def set_raw_input(self, file_bytes: bytes, filename: str, **kwargs):
        """
        원본 입력 설정

        Args:
            file_bytes: 파일 바이트
            filename: 파일명
            **kwargs: 추가 메타데이터 (source, s3_bucket, s3_key 등)
        """
        # 파일 크기 체크
        if not self.guardrail_checker.check_file_size(len(file_bytes)):
            raise ValueError(f"파일 크기가 제한을 초과합니다: {len(file_bytes)} bytes")

        self.raw_input.set_file(file_bytes, filename, **kwargs)

        self.audit_log.log_create(
            "system", "raw_input",
            {"filename": filename, "size": len(file_bytes)}
        )

        logger.info(f"[PipelineContext] 원본 입력 설정: {filename} ({len(file_bytes)} bytes)")

    # ========================================
    # 파싱 데이터 관리
    # ========================================

    def set_parsed_text(self, raw_text: str, cleaned_text: str = None, **kwargs):
        """
        파싱된 텍스트 설정

        Args:
            raw_text: 원본 텍스트
            cleaned_text: 정리된 텍스트 (없으면 raw_text 사용)
            **kwargs: 추가 메타데이터
        """
        # 텍스트 길이 체크
        self.guardrail_checker.check_text_length(len(raw_text))

        self.parsed_data.set_text(raw_text, cleaned_text, **kwargs)

        # HallucinationDetector 초기화
        self.hallucination_detector.set_data(self.parsed_data, self.pii_store)

        self.audit_log.log_create(
            "parser", "parsed_data",
            {"text_length": len(raw_text)}
        )

        logger.info(f"[PipelineContext] 파싱 텍스트 설정: {len(raw_text)} chars")

    # ========================================
    # PII 관리
    # ========================================

    def extract_pii(self):
        """
        정규식으로 PII 추출 (LLM 사용 안함)

        이름, 전화번호, 이메일을 정규식으로 추출하고
        LLM에 전송할 마스킹된 텍스트를 생성합니다.
        """
        if not self.parsed_data.raw_text:
            logger.warning("[PipelineContext] 파싱된 텍스트 없음, PII 추출 스킵")
            return

        # 정규식으로 PII 추출
        self.pii_store.extract_from_text(
            self.parsed_data.raw_text,
            self.raw_input.filename
        )

        # 마스킹된 텍스트 생성
        self.pii_store.mask_pii_for_llm(self.parsed_data.raw_text)

        self.audit_log.log_create(
            "pii_extractor", "pii_store",
            {
                "name": bool(self.pii_store.name),
                "phone": bool(self.pii_store.phone),
                "email": bool(self.pii_store.email)
            }
        )

        logger.info(f"[PipelineContext] PII 추출 완료: name={bool(self.pii_store.name)}, phone={bool(self.pii_store.phone)}, email={bool(self.pii_store.email)}")

    def get_text_for_llm(self) -> str:
        """
        LLM에 전송할 마스킹된 텍스트 반환

        PII가 마스킹된 텍스트를 반환합니다.
        마스킹되지 않았으면 cleaned_text를 반환합니다.
        """
        if self.pii_store.masked_text:
            return self.pii_store.masked_text
        return self.parsed_data.cleaned_text or self.parsed_data.raw_text

    # ========================================
    # 스테이지 관리
    # ========================================

    def start_stage(self, stage_name: str, agent_name: str = "") -> StageResult:
        """스테이지 시작"""
        # 타임아웃 체크
        if self.metadata.started_at:
            self.guardrail_checker.check_total_timeout(self.metadata.started_at)

        result = self.stage_results.start_stage(stage_name, agent_name)

        self.audit_log.log(
            "create", agent_name or "system", f"stage:{stage_name}",
            new_value={"status": "running"}
        )

        logger.info(f"[PipelineContext] 스테이지 시작: {stage_name}")
        return result

    def complete_stage(self, stage_name: str, output: Dict[str, Any] = None, **kwargs):
        """스테이지 완료"""
        self.stage_results.complete_stage(stage_name, output, **kwargs)

        self.audit_log.log(
            "update", "system", f"stage:{stage_name}",
            new_value={"status": "completed"}
        )

        logger.info(f"[PipelineContext] 스테이지 완료: {stage_name}")

    def fail_stage(self, stage_name: str, error: str, error_code: str = None):
        """스테이지 실패"""
        self.stage_results.fail_stage(stage_name, error, error_code)

        self.audit_log.log_error(
            "system", f"stage:{stage_name}",
            error
        )

        logger.error(f"[PipelineContext] 스테이지 실패: {stage_name} - {error}")

    # ========================================
    # 증거 관리
    # ========================================

    def add_evidence(
        self,
        field_name: str,
        value: Any,
        llm_provider: str,
        confidence: float = 0.5,
        reasoning: str = "",
        source_text: str = "",
        **kwargs
    ) -> Evidence:
        """
        LLM 결과에 대한 증거 추가

        Args:
            field_name: 필드명
            value: 추출된 값
            llm_provider: LLM 제공자 (openai, gemini, claude)
            confidence: 신뢰도 (0.0 ~ 1.0)
            reasoning: LLM의 추론 근거
            source_text: 원본 텍스트에서 발췌
        """
        evidence = self.evidence_store.add_from_llm(
            field_name=field_name,
            value=value,
            llm_provider=llm_provider,
            confidence=confidence,
            reasoning=reasoning,
            source_text=source_text,
            **kwargs
        )

        self.audit_log.log_create(
            llm_provider, f"evidence:{field_name}",
            {"value": value, "confidence": confidence}
        )

        return evidence

    def cross_validate_field(self, field_name: str) -> Dict[str, Any]:
        """
        필드에 대해 교차 검증 수행

        여러 LLM의 결과를 비교하여 합의를 확인합니다.
        """
        result = self.evidence_store.cross_validate(field_name)

        if result["disagreements"]:
            self.warning_collector.add_llm_disagreement(
                field_name,
                [d["provider"] for d in result["disagreements"]]
            )

        return result

    # ========================================
    # 제안/결정 관리
    # ========================================

    def propose(
        self,
        agent_name: str,
        field_name: str,
        value: Any,
        confidence: float,
        reasoning: str = "",
        evidence_ids: List[str] = None
    ) -> Proposal:
        """
        에이전트가 값을 제안

        Args:
            agent_name: 에이전트 이름
            field_name: 필드명
            value: 제안하는 값
            confidence: 신뢰도 (0.0 ~ 1.0)
            reasoning: 제안 이유
            evidence_ids: 관련 증거 ID 목록
        """
        proposal = self.decision_manager.propose(
            agent_name=agent_name,
            field_name=field_name,
            value=value,
            confidence=confidence,
            reasoning=reasoning,
            evidence_ids=evidence_ids or []
        )

        self.audit_log.log_create(
            agent_name, f"proposal:{field_name}",
            {"value": value, "confidence": confidence}
        )

        return proposal

    def decide(self, field_name: str) -> Decision:
        """
        필드에 대한 최종 결정

        모든 제안을 검토하고 최종 값을 결정합니다.
        """
        decision = self.decision_manager.make_decision(field_name)

        # CurrentData에 반영
        if hasattr(self.current_data, field_name) and decision.final_value is not None:
            setattr(self.current_data, field_name, decision.final_value)
            self.current_data.set_confidence(field_name, decision.final_confidence)

        self.audit_log.log_decision(
            "decision_manager", f"decision:{field_name}",
            decision.final_value,
            decision.decision_method
        )

        # 충돌 경고
        if decision.had_conflict:
            self.warning_collector.add_llm_disagreement(field_name)

        # 낮은 신뢰도 경고
        if decision.final_confidence < 0.6:
            self.warning_collector.add_low_confidence(field_name, decision.final_confidence)

        return decision

    def decide_all(self) -> Dict[str, Decision]:
        """모든 필드에 대해 결정하고 CurrentData에 반영"""
        decisions = self.decision_manager.decide_all()

        # decide()를 통해 CurrentData 반영/감사로그/경고를 일관되게 처리
        for field_name in decisions.keys():
            self.decide(field_name)

        return decisions


    # ========================================
    # 환각 검증
    # ========================================

    def verify_hallucination(
        self,
        field_name: str,
        value: Any,
        llm_provider: str = ""
    ) -> bool:
        """
        환각 검증

        값이 원본 텍스트에 존재하는지 확인합니다.

        Returns:
            True if value is verified, False if hallucination detected
        """
        record = self.hallucination_detector.verify_against_text(
            field_name, value, llm_provider
        )

        if record:
            self.warning_collector.add_hallucination(field_name, value)
            return False

        return True

    def cross_validate_llm_results(
        self,
        field_name: str,
        results: Dict[str, Any]
    ) -> Optional[HallucinationRecord]:
        """
        다중 LLM 결과 교차 검증

        Args:
            field_name: 필드명
            results: LLM별 결과 {"gpt4": value1, "gemini": value2}
        """
        return self.hallucination_detector.cross_validate_llm_results(field_name, results)

    # ========================================
    # 메시지 버스
    # ========================================

    def send_message(
        self,
        from_agent: str,
        to_agent: str,
        subject: str,
        payload: Dict[str, Any] = None,
        message_type: str = "request"
    ) -> bool:
        """
        에이전트 간 메시지 전송

        Args:
            from_agent: 발신 에이전트
            to_agent: 수신 에이전트 ("*"이면 브로드캐스트)
            subject: 메시지 제목
            payload: 메시지 내용
            message_type: 메시지 유형 (request, query, notification)
        """
        message = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=message_type,
            subject=subject,
            payload=payload or {}
        )
        return self.message_bus.send(message)

    def get_messages_for(self, agent_name: str) -> List[AgentMessage]:
        """특정 에이전트의 대기 메시지 조회"""
        return self.message_bus.get_messages_for(agent_name)

    # ========================================
    # LLM 호출 추적
    # ========================================

    def record_llm_call(self, stage_name: str, tokens: int = 0, cost: float = 0.0):
        """LLM 호출 기록"""
        self.guardrail_checker.check_llm_calls(stage_name)
        self.guardrail_checker.record_llm_call(stage_name)
        self.metadata.add_llm_usage(tokens, cost)

    # ========================================
    # 체크포인트
    # ========================================

    def create_checkpoint(self) -> Dict[str, Any]:
        """
        체크포인트 생성 (재시도용)

        현재 상태를 저장하여 실패 시 복원할 수 있습니다.
        """
        checkpoint = {
            "pipeline_id": self.metadata.pipeline_id,
            "current_stage": self.stage_results.current_stage,
            "completed_stages": self.stage_results.get_completed_stages(),
            "pii_store": {
                "name": self.pii_store.name,
                "phone": self.pii_store.phone,
                "email": self.pii_store.email,
            },
            "current_data": asdict(self.current_data),
            "created_at": datetime.now().isoformat()
        }

        self.metadata.checkpoint = checkpoint
        self.metadata.checkpoint_created_at = datetime.now()

        self.audit_log.log_create("system", "checkpoint", checkpoint)

        logger.info(f"[PipelineContext] 체크포인트 생성: {checkpoint['current_stage']}")
        return checkpoint

    def restore_from_checkpoint(self, checkpoint: Dict[str, Any]) -> bool:
        """
        체크포인트에서 복원

        Returns:
            True if restored successfully, False if checkpoint expired
        """
        # TTL 체크
        created_at = datetime.fromisoformat(checkpoint["created_at"])
        elapsed = (datetime.now() - created_at).total_seconds()

        if elapsed > self.metadata.checkpoint_ttl_seconds:
            logger.warning(f"[PipelineContext] 체크포인트 만료: {elapsed}s")
            return False

        # 복원
        self.metadata.pipeline_id = checkpoint["pipeline_id"]
        self.stage_results.current_stage = checkpoint["current_stage"]

        # PII 복원
        pii = checkpoint.get("pii_store", {})
        self.pii_store.name = pii.get("name")
        self.pii_store.phone = pii.get("phone")
        self.pii_store.email = pii.get("email")

        self.audit_log.log("update", "system", "checkpoint", reason="restored")

        logger.info(f"[PipelineContext] 체크포인트 복원: {checkpoint['current_stage']}")
        return True

    # ========================================
    # 완료
    # ========================================

    def finalize(self) -> Dict[str, Any]:
        """
        파이프라인 완료 및 최종 결과 반환

        모든 결정을 수행하고 최종 결과를 반환합니다.
        """
        # PII를 CurrentData에 병합
        self.current_data.name = self.pii_store.name
        self.current_data.phone = self.pii_store.phone
        self.current_data.email = self.pii_store.email

        # 모든 필드 결정
        self.decide_all()

        # 전체 신뢰도 계산
        self.current_data.calculate_overall_confidence()

        # 메타데이터 완료
        self.metadata.complete()

        self.audit_log.log("update", "system", "pipeline", new_value={"status": "completed"})

        # 최종 결과
        result = {
            "candidate": self.current_data.to_candidate_dict(),
            "confidence": self.current_data.overall_confidence,
            "warnings": [w.to_dict() for w in self.warning_collector.get_user_visible()],
            "metadata": {
                "pipeline_id": self.metadata.pipeline_id,
                "duration_ms": self.metadata.get_duration_ms(),
                "llm_calls": self.metadata.total_llm_calls,
                "tokens_used": self.metadata.total_tokens_used,
                "status": self.metadata.status
            }
        }

        logger.info(f"[PipelineContext] 완료: confidence={self.current_data.overall_confidence}, warnings={len(result['warnings'])}")

        return result

    # ========================================
    # 직렬화
    # ========================================

    def to_dict(self) -> Dict[str, Any]:
        """전체 컨텍스트를 딕셔너리로 변환"""
        return {
            "raw_input": {
                "filename": self.raw_input.filename,
                "file_size": self.raw_input.file_size,
                "file_extension": self.raw_input.file_extension,
            },
            "parsed_data": {
                "text_length": self.parsed_data.text_length,
                "parsing_method": self.parsed_data.parsing_method,
            },
            "pii_store": {
                "name": bool(self.pii_store.name),
                "phone": bool(self.pii_store.phone),
                "email": bool(self.pii_store.email),
            },
            "stage_results": {
                name: {"status": r.status, "duration_ms": r.duration_ms}
                for name, r in self.stage_results.results.items()
            },
            "evidence_store": self.evidence_store.get_summary(),
            "decision_manager": self.decision_manager.get_summary(),
            "current_data": self.current_data.to_candidate_dict(),
            "hallucinations": self.hallucination_detector.get_summary(),
            "warnings": self.warning_collector.get_summary(),
            "metadata": {
                "pipeline_id": self.metadata.pipeline_id,
                "status": self.metadata.status,
                "total_llm_calls": self.metadata.total_llm_calls,
            },
            "guardrails": self.guardrail_checker.get_summary(),
        }

    def get_status(self) -> Dict[str, Any]:
        """현재 상태 요약"""
        return {
            "pipeline_id": self.metadata.pipeline_id,
            "status": self.metadata.status,
            "current_stage": self.stage_results.current_stage,
            "completed_stages": self.stage_results.get_completed_stages(),
            "failed_stages": self.stage_results.get_failed_stages(),
            "llm_calls": self.metadata.total_llm_calls,
            "warning_count": len(self.warning_collector.warnings),
            "has_errors": self.warning_collector.has_errors(),
            "guardrail_violations": self.guardrail_checker.has_violations(),
        }
