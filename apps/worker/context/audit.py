"""
Audit Log - 모든 변경 사항 추적

파이프라인의 모든 변경 사항을 기록합니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class AuditEntry:
    """
    감사 로그 항목

    파이프라인에서 발생한 단일 이벤트를 기록합니다.
    """
    action: str  # "create", "update", "delete", "decision", "error"
    actor: str   # 에이전트 또는 시스템
    target: str  # 변경된 필드/객체

    # 변경 내용
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None

    # 추가 정보
    reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    # 메타데이터
    entry_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.entry_id:
            self.entry_id = f"audit_{datetime.now().timestamp()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "action": self.action,
            "actor": self.actor,
            "target": self.target,
            "old_value": self._serialize_value(self.old_value),
            "new_value": self._serialize_value(self.new_value),
            "reason": self.reason,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

    def _serialize_value(self, value: Any) -> Any:
        """값 직렬화 (큰 값은 요약)"""
        if value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            if isinstance(value, str) and len(value) > 200:
                return value[:200] + "..."
            return value
        if isinstance(value, (list, tuple)):
            if len(value) > 10:
                return f"[{len(value)} items]"
            return value
        if isinstance(value, dict):
            if len(str(value)) > 500:
                return f"{{dict with {len(value)} keys}}"
            return value
        if isinstance(value, bytes):
            return f"<bytes: {len(value)} bytes>"
        return str(value)[:200]


class AuditLog:
    """
    감사 로그

    파이프라인의 모든 이벤트를 기록합니다.
    """

    MAX_ENTRIES = 500

    def __init__(self, max_entries: int = None):
        self.max_entries = max_entries or self.MAX_ENTRIES
        self.entries: List[AuditEntry] = []

    def log(
        self,
        action: str,
        actor: str,
        target: str,
        old_value: Any = None,
        new_value: Any = None,
        reason: str = None,
        **metadata
    ) -> AuditEntry:
        """
        감사 로그 추가

        Args:
            action: 수행된 작업 (create, update, delete, decision, error)
            actor: 작업을 수행한 주체 (에이전트 이름 또는 "system")
            target: 변경된 대상 (필드명 또는 객체 식별자)
            old_value: 이전 값
            new_value: 새 값
            reason: 변경 이유
            **metadata: 추가 메타데이터
        """
        # 용량 관리
        if len(self.entries) >= self.max_entries:
            # 오래된 항목 제거 (20% 정리)
            remove_count = int(self.max_entries * 0.2)
            self.entries = self.entries[remove_count:]
            logger.debug(f"[AuditLog] {remove_count}개 오래된 항목 정리")

        entry = AuditEntry(
            action=action,
            actor=actor,
            target=target,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            metadata=metadata
        )
        self.entries.append(entry)

        # 중요 이벤트 로깅
        if action in ["error", "decision"]:
            logger.info(f"[AuditLog] {action}: {actor} -> {target}")

        return entry

    def log_create(self, actor: str, target: str, value: Any = None, **metadata) -> AuditEntry:
        """생성 이벤트 로깅"""
        return self.log("create", actor, target, new_value=value, **metadata)

    def log_update(
        self,
        actor: str,
        target: str,
        old_value: Any,
        new_value: Any,
        reason: str = None,
        **metadata
    ) -> AuditEntry:
        """업데이트 이벤트 로깅"""
        return self.log("update", actor, target, old_value=old_value, new_value=new_value, reason=reason, **metadata)

    def log_decision(
        self,
        actor: str,
        target: str,
        value: Any,
        method: str = "",
        **metadata
    ) -> AuditEntry:
        """결정 이벤트 로깅"""
        return self.log("decision", actor, target, new_value=value, reason=method, **metadata)

    def log_error(
        self,
        actor: str,
        target: str,
        error: str,
        **metadata
    ) -> AuditEntry:
        """에러 이벤트 로깅"""
        return self.log("error", actor, target, new_value=error, **metadata)

    def get_entries(
        self,
        action: str = None,
        actor: str = None,
        target: str = None,
        since: datetime = None
    ) -> List[AuditEntry]:
        """조건에 맞는 항목 조회"""
        result = self.entries

        if action:
            result = [e for e in result if e.action == action]
        if actor:
            result = [e for e in result if e.actor == actor]
        if target:
            result = [e for e in result if target in e.target]
        if since:
            result = [e for e in result if e.timestamp >= since]

        return result

    def get_recent(self, count: int = 10) -> List[AuditEntry]:
        """최근 항목 조회"""
        return self.entries[-count:] if len(self.entries) > count else self.entries

    def get_by_target(self, target: str) -> List[AuditEntry]:
        """특정 대상의 모든 이력 조회"""
        return [e for e in self.entries if target in e.target]

    def get_decisions(self) -> List[AuditEntry]:
        """모든 결정 이벤트 조회"""
        return self.get_entries(action="decision")

    def get_errors(self) -> List[AuditEntry]:
        """모든 에러 이벤트 조회"""
        return self.get_entries(action="error")

    def get_summary(self) -> Dict[str, Any]:
        """감사 로그 요약"""
        by_action = {}
        by_actor = {}

        for entry in self.entries:
            by_action[entry.action] = by_action.get(entry.action, 0) + 1
            by_actor[entry.actor] = by_actor.get(entry.actor, 0) + 1

        return {
            "total_entries": len(self.entries),
            "max_entries": self.max_entries,
            "by_action": by_action,
            "by_actor": by_actor,
            "error_count": by_action.get("error", 0),
            "decision_count": by_action.get("decision", 0)
        }

    def clear(self):
        """모든 로그 삭제"""
        self.entries = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entries": [e.to_dict() for e in self.entries],
            "summary": self.get_summary()
        }

    def to_list(self) -> List[Dict[str, Any]]:
        """항목 리스트 반환"""
        return [e.to_dict() for e in self.entries]
