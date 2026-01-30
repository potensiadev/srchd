"""
PipelineContext - Multi-Agent Pipeline의 중앙 컨텍스트 허브

모든 에이전트가 정보를 공유하고, 컨텍스트 손실 없이 협업할 수 있도록 합니다.
"""

from .pipeline_context import PipelineContext
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
from .warnings import Warning, WarningCollector

__all__ = [
    # Main context
    "PipelineContext",
    # Layers
    "RawInput",
    "ParsedData",
    "PIIStore",
    "StageResult",
    "StageResults",
    "CurrentData",
    "PipelineMetadata",
    # Evidence
    "Evidence",
    "EvidenceStore",
    # Decision
    "Proposal",
    "Decision",
    "DecisionManager",
    # Hallucination
    "HallucinationRecord",
    "HallucinationDetector",
    # Message Bus
    "AgentMessage",
    "MessageBus",
    # Guardrails
    "PipelineGuardrails",
    "GuardrailChecker",
    # Audit
    "AuditEntry",
    "AuditLog",
    # Warnings
    "Warning",
    "WarningCollector",
]
