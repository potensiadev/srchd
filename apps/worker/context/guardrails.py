"""
Pipeline Guardrails - 파이프라인 안전 장치

무한 루프, 과도한 리소스 사용 등을 방지합니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PipelineGuardrails:
    """
    파이프라인 가드레일 설정

    파이프라인의 안전한 실행을 위한 제한값들입니다.
    """
    # 메시지 제한
    max_messages: int = 100
    max_hops: int = 10

    # 충돌 제한
    max_conflicts: int = 5

    # 시간 제한 (초)
    stage_timeout_seconds: int = 120
    total_timeout_seconds: int = 600

    # LLM 제한
    max_llm_calls_per_stage: int = 5
    max_total_llm_calls: int = 20
    max_tokens_per_call: int = 4000

    # 재시도 제한
    max_retries_per_stage: int = 3

    # 메모리 제한
    max_evidence_per_field: int = 10
    max_audit_entries: int = 500

    # 파일 크기 제한 (bytes)
    max_file_size: int = 50 * 1024 * 1024  # 50MB

    # 텍스트 길이 제한
    max_text_length: int = 500000  # 500K characters


@dataclass
class GuardrailViolation:
    """가드레일 위반 기록"""
    violation_type: str
    message: str
    severity: str  # "warning", "error", "critical"
    value: Optional[Any] = None
    limit: Optional[Any] = None
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "violation_type": self.violation_type,
            "message": self.message,
            "severity": self.severity,
            "value": self.value,
            "limit": self.limit,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class GuardrailChecker:
    """
    가드레일 체크

    파이프라인 실행 중 가드레일 위반을 감지합니다.
    """

    def __init__(self, guardrails: PipelineGuardrails = None):
        self.guardrails = guardrails or PipelineGuardrails()
        self.violations: List[GuardrailViolation] = []

        # 카운터
        self.llm_calls_by_stage: Dict[str, int] = {}
        self.total_llm_calls: int = 0
        self.retries_by_stage: Dict[str, int] = {}

    def check_message_limit(self, current_count: int) -> bool:
        """메시지 수 제한 확인"""
        if current_count >= self.guardrails.max_messages:
            self._add_violation(
                "MESSAGE_LIMIT",
                f"메시지 수 한도 초과: {current_count}/{self.guardrails.max_messages}",
                "error",
                current_count,
                self.guardrails.max_messages
            )
            return False
        return True

    def check_hop_limit(self, hop_count: int) -> bool:
        """메시지 hop 제한 확인"""
        if hop_count >= self.guardrails.max_hops:
            self._add_violation(
                "HOP_LIMIT",
                f"메시지 hop 한도 초과: {hop_count}/{self.guardrails.max_hops}",
                "error",
                hop_count,
                self.guardrails.max_hops
            )
            return False
        return True

    def check_conflict_limit(self, conflict_count: int) -> bool:
        """충돌 횟수 제한 확인"""
        if conflict_count >= self.guardrails.max_conflicts:
            self._add_violation(
                "CONFLICT_LIMIT",
                f"충돌 횟수 한도 초과: {conflict_count}/{self.guardrails.max_conflicts}",
                "warning",
                conflict_count,
                self.guardrails.max_conflicts
            )
            return False
        return True

    def check_stage_timeout(self, started_at: datetime) -> bool:
        """스테이지 타임아웃 확인"""
        elapsed = (datetime.now() - started_at).total_seconds()
        if elapsed >= self.guardrails.stage_timeout_seconds:
            self._add_violation(
                "STAGE_TIMEOUT",
                f"스테이지 타임아웃: {elapsed:.1f}s/{self.guardrails.stage_timeout_seconds}s",
                "error",
                elapsed,
                self.guardrails.stage_timeout_seconds
            )
            return False
        return True

    def check_total_timeout(self, started_at: datetime) -> bool:
        """전체 파이프라인 타임아웃 확인"""
        elapsed = (datetime.now() - started_at).total_seconds()
        if elapsed >= self.guardrails.total_timeout_seconds:
            self._add_violation(
                "TOTAL_TIMEOUT",
                f"전체 타임아웃: {elapsed:.1f}s/{self.guardrails.total_timeout_seconds}s",
                "critical",
                elapsed,
                self.guardrails.total_timeout_seconds
            )
            return False
        return True

    def check_llm_calls(self, stage_name: str) -> bool:
        """LLM 호출 횟수 제한 확인"""
        # 스테이지별 제한
        stage_calls = self.llm_calls_by_stage.get(stage_name, 0)
        if stage_calls >= self.guardrails.max_llm_calls_per_stage:
            self._add_violation(
                "STAGE_LLM_LIMIT",
                f"스테이지 LLM 호출 한도 초과: {stage_name} ({stage_calls}/{self.guardrails.max_llm_calls_per_stage})",
                "error",
                stage_calls,
                self.guardrails.max_llm_calls_per_stage
            )
            return False

        # 전체 제한
        if self.total_llm_calls >= self.guardrails.max_total_llm_calls:
            self._add_violation(
                "TOTAL_LLM_LIMIT",
                f"전체 LLM 호출 한도 초과: {self.total_llm_calls}/{self.guardrails.max_total_llm_calls}",
                "critical",
                self.total_llm_calls,
                self.guardrails.max_total_llm_calls
            )
            return False

        return True

    def record_llm_call(self, stage_name: str):
        """LLM 호출 기록"""
        self.llm_calls_by_stage[stage_name] = self.llm_calls_by_stage.get(stage_name, 0) + 1
        self.total_llm_calls += 1

    def check_retry_limit(self, stage_name: str) -> bool:
        """재시도 횟수 제한 확인"""
        retries = self.retries_by_stage.get(stage_name, 0)
        if retries >= self.guardrails.max_retries_per_stage:
            self._add_violation(
                "RETRY_LIMIT",
                f"재시도 한도 초과: {stage_name} ({retries}/{self.guardrails.max_retries_per_stage})",
                "error",
                retries,
                self.guardrails.max_retries_per_stage
            )
            return False
        return True

    def record_retry(self, stage_name: str):
        """재시도 기록"""
        self.retries_by_stage[stage_name] = self.retries_by_stage.get(stage_name, 0) + 1

    def check_file_size(self, size: int) -> bool:
        """파일 크기 제한 확인"""
        if size > self.guardrails.max_file_size:
            self._add_violation(
                "FILE_SIZE",
                f"파일 크기 초과: {size / 1024 / 1024:.1f}MB/{self.guardrails.max_file_size / 1024 / 1024:.1f}MB",
                "error",
                size,
                self.guardrails.max_file_size
            )
            return False
        return True

    def check_text_length(self, length: int) -> bool:
        """텍스트 길이 제한 확인"""
        if length > self.guardrails.max_text_length:
            self._add_violation(
                "TEXT_LENGTH",
                f"텍스트 길이 초과: {length}/{self.guardrails.max_text_length}",
                "warning",
                length,
                self.guardrails.max_text_length
            )
            return False
        return True

    def _add_violation(
        self,
        violation_type: str,
        message: str,
        severity: str,
        value: Any = None,
        limit: Any = None
    ):
        """위반 기록 추가"""
        violation = GuardrailViolation(
            violation_type=violation_type,
            message=message,
            severity=severity,
            value=value,
            limit=limit
        )
        self.violations.append(violation)
        logger.warning(f"[GuardrailChecker] {severity.upper()}: {message}")

    def has_violations(self, severity: str = None) -> bool:
        """위반 여부 확인"""
        if severity:
            return any(v.severity == severity for v in self.violations)
        return len(self.violations) > 0

    def has_critical_violations(self) -> bool:
        """치명적 위반 여부 확인"""
        return self.has_violations("critical")

    def has_errors(self) -> bool:
        """에러 수준 이상의 위반 여부 확인"""
        return any(v.severity in ["error", "critical"] for v in self.violations)

    def get_violations(self) -> List[GuardrailViolation]:
        """모든 위반 조회"""
        return self.violations

    def get_summary(self) -> Dict[str, Any]:
        """가드레일 상태 요약"""
        by_severity = {"warning": 0, "error": 0, "critical": 0}
        for v in self.violations:
            by_severity[v.severity] = by_severity.get(v.severity, 0) + 1

        return {
            "total_violations": len(self.violations),
            "by_severity": by_severity,
            "total_llm_calls": self.total_llm_calls,
            "llm_calls_by_stage": self.llm_calls_by_stage,
            "retries_by_stage": self.retries_by_stage,
            "has_critical": self.has_critical_violations(),
            "has_errors": self.has_errors()
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "guardrails": {
                "max_messages": self.guardrails.max_messages,
                "max_hops": self.guardrails.max_hops,
                "max_conflicts": self.guardrails.max_conflicts,
                "stage_timeout_seconds": self.guardrails.stage_timeout_seconds,
                "total_timeout_seconds": self.guardrails.total_timeout_seconds,
                "max_llm_calls_per_stage": self.guardrails.max_llm_calls_per_stage,
                "max_total_llm_calls": self.guardrails.max_total_llm_calls,
            },
            "violations": [v.to_dict() for v in self.violations],
            "summary": self.get_summary()
        }
