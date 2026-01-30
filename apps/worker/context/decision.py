"""
Decision Store - 에이전트 제안 → 최종 결정 패턴 관리

에이전트들이 값을 제안하고, DecisionManager가 최종 결정을 내립니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Proposal:
    """
    에이전트 제안

    에이전트가 특정 필드에 대해 값을 제안합니다.
    """
    agent_name: str
    field_name: str
    proposed_value: Any
    confidence: float  # 0.0 ~ 1.0
    reasoning: str = ""

    # 증거 연결
    evidence_ids: List[str] = field(default_factory=list)

    # 메타데이터
    proposal_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.proposal_id:
            self.proposal_id = f"prop_{self.field_name}_{datetime.now().timestamp()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "proposal_id": self.proposal_id,
            "agent_name": self.agent_name,
            "field_name": self.field_name,
            "proposed_value": self.proposed_value,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "evidence_ids": self.evidence_ids,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


@dataclass
class Decision:
    """
    최종 결정

    필드에 대한 최종 확정 값입니다.
    """
    field_name: str
    final_value: Any
    final_confidence: float  # 0.0 ~ 1.0

    # 결정 근거
    decided_by: str  # "orchestrator", "majority_vote", "highest_confidence"
    decision_method: str = ""

    # 관련 제안들
    proposals: List[Proposal] = field(default_factory=list)

    # 충돌 해결
    had_conflict: bool = False
    conflict_resolution: Optional[str] = None

    # 메타데이터
    decision_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.decision_id:
            self.decision_id = f"dec_{self.field_name}_{datetime.now().timestamp()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "field_name": self.field_name,
            "final_value": self.final_value,
            "final_confidence": self.final_confidence,
            "decided_by": self.decided_by,
            "decision_method": self.decision_method,
            "proposal_count": len(self.proposals),
            "had_conflict": self.had_conflict,
            "conflict_resolution": self.conflict_resolution,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class DecisionManager:
    """
    결정 관리자

    에이전트들의 제안을 받아 최종 결정을 내립니다.
    권한 계층과 신뢰도를 기반으로 충돌을 해결합니다.
    """

    # 권한 계층 (높을수록 우선)
    AUTHORITY_LEVELS = {
        "orchestrator": 100,
        "analyst_agent": 80,
        "analyst_gpt": 80,
        "analyst_gemini": 80,
        "analyst_claude": 80,
        "validation_agent": 70,
        "pii_extractor": 90,  # PII는 정규식이 권한 높음
        "regex_extractor": 85,
        "fallback": 10
    }

    # 결정 방법 우선순위
    DECISION_METHODS = [
        "unanimous",           # 만장일치
        "majority_vote",       # 다수결
        "highest_authority",   # 최고 권한자
        "highest_confidence",  # 최고 신뢰도
    ]

    def __init__(self):
        self.proposals: Dict[str, List[Proposal]] = {}  # field_name -> proposals
        self.decisions: Dict[str, Decision] = {}  # field_name -> decision
        self.conflict_count: int = 0

    def add_proposal(self, proposal: Proposal) -> bool:
        """
        제안 추가

        같은 필드에 대해 여러 에이전트가 제안할 수 있습니다.
        """
        field_name = proposal.field_name

        if field_name not in self.proposals:
            self.proposals[field_name] = []

        # 같은 에이전트의 중복 제안 방지
        existing = [p for p in self.proposals[field_name] if p.agent_name == proposal.agent_name]
        if existing:
            # 기존 제안 업데이트
            self.proposals[field_name].remove(existing[0])

        self.proposals[field_name].append(proposal)
        logger.debug(f"[DecisionManager] 제안 추가: {field_name} = {proposal.proposed_value} by {proposal.agent_name}")
        return True

    def propose(
        self,
        agent_name: str,
        field_name: str,
        value: Any,
        confidence: float,
        reasoning: str = "",
        evidence_ids: List[str] = None
    ) -> Proposal:
        """간편한 제안 생성 및 추가"""
        proposal = Proposal(
            agent_name=agent_name,
            field_name=field_name,
            proposed_value=value,
            confidence=confidence,
            reasoning=reasoning,
            evidence_ids=evidence_ids or []
        )
        self.add_proposal(proposal)
        return proposal

    def get_proposals(self, field_name: str) -> List[Proposal]:
        """특정 필드의 모든 제안 조회"""
        return self.proposals.get(field_name, [])

    def has_conflict(self, field_name: str) -> bool:
        """충돌 여부 확인"""
        proposals = self.get_proposals(field_name)
        if len(proposals) <= 1:
            return False

        unique_values = set(str(p.proposed_value) for p in proposals)
        return len(unique_values) > 1

    def make_decision(self, field_name: str) -> Decision:
        """
        최종 결정 수행

        1. 만장일치 확인
        2. 다수결 시도
        3. 권한 레벨 비교
        4. 신뢰도 비교
        """
        proposals = self.get_proposals(field_name)

        if not proposals:
            return self._create_empty_decision(field_name)

        if len(proposals) == 1:
            return self._create_single_decision(field_name, proposals[0])

        # 충돌 감지
        unique_values = set(str(p.proposed_value) for p in proposals)
        had_conflict = len(unique_values) > 1

        if had_conflict:
            self.conflict_count += 1
            decision = self._resolve_conflict(field_name, proposals)
        else:
            # 만장일치
            decision = self._create_unanimous_decision(field_name, proposals)

        self.decisions[field_name] = decision
        logger.info(f"[DecisionManager] 결정: {field_name} = {decision.final_value} (confidence: {decision.final_confidence:.2f}, conflict: {had_conflict})")

        return decision

    def _create_empty_decision(self, field_name: str) -> Decision:
        """빈 결정 생성"""
        return Decision(
            field_name=field_name,
            final_value=None,
            final_confidence=0.0,
            decided_by="no_proposal",
            decision_method="none"
        )

    def _create_single_decision(self, field_name: str, proposal: Proposal) -> Decision:
        """단일 제안에서 결정"""
        return Decision(
            field_name=field_name,
            final_value=proposal.proposed_value,
            final_confidence=proposal.confidence,
            decided_by=proposal.agent_name,
            decision_method="single_proposal",
            proposals=[proposal],
            had_conflict=False
        )

    def _create_unanimous_decision(self, field_name: str, proposals: List[Proposal]) -> Decision:
        """만장일치 결정"""
        # 평균 신뢰도 계산
        avg_confidence = sum(p.confidence for p in proposals) / len(proposals)
        # 만장일치 보너스
        final_confidence = min(1.0, avg_confidence * 1.1)

        return Decision(
            field_name=field_name,
            final_value=proposals[0].proposed_value,
            final_confidence=final_confidence,
            decided_by="unanimous",
            decision_method="unanimous",
            proposals=proposals,
            had_conflict=False
        )

    def _resolve_conflict(self, field_name: str, proposals: List[Proposal]) -> Decision:
        """
        충돌 해결

        1. 다수결
        2. 권한 레벨
        3. 신뢰도
        """
        from collections import Counter

        # 값별로 그룹화
        value_groups: Dict[str, List[Proposal]] = {}
        for p in proposals:
            key = str(p.proposed_value)
            if key not in value_groups:
                value_groups[key] = []
            value_groups[key].append(p)

        # 다수결 시도
        value_counts = Counter(str(p.proposed_value) for p in proposals)
        most_common_str, count = value_counts.most_common(1)[0]

        if count > len(proposals) / 2:
            # 과반수 있음 - 다수결로 결정
            winner_proposals = value_groups[most_common_str]
            avg_confidence = sum(p.confidence for p in winner_proposals) / len(winner_proposals)

            # 다수결이지만 만장일치 아님 - 약간 감점
            final_confidence = avg_confidence * 0.95

            return Decision(
                field_name=field_name,
                final_value=winner_proposals[0].proposed_value,
                final_confidence=final_confidence,
                decided_by="majority_vote",
                decision_method="majority_vote",
                proposals=proposals,
                had_conflict=True,
                conflict_resolution=f"{count}/{len(proposals)} 다수결"
            )

        # 권한 레벨 + 신뢰도로 결정
        def score_proposal(p: Proposal) -> tuple:
            authority = self.AUTHORITY_LEVELS.get(p.agent_name, 0)
            return (authority, p.confidence)

        best_proposal = max(proposals, key=score_proposal)

        # 충돌로 인한 감점
        final_confidence = best_proposal.confidence * 0.9

        return Decision(
            field_name=field_name,
            final_value=best_proposal.proposed_value,
            final_confidence=final_confidence,
            decided_by=best_proposal.agent_name,
            decision_method="authority_then_confidence",
            proposals=proposals,
            had_conflict=True,
            conflict_resolution=f"권한 레벨 우선 ({best_proposal.agent_name})"
        )

    def decide_all(self) -> Dict[str, Decision]:
        """모든 필드에 대해 결정"""
        for field_name in self.proposals:
            if field_name not in self.decisions:
                self.make_decision(field_name)
        return self.decisions

    def get_decision(self, field_name: str) -> Optional[Decision]:
        """특정 필드의 결정 조회"""
        return self.decisions.get(field_name)

    def get_conflict_count(self) -> int:
        """충돌 횟수"""
        return self.conflict_count

    def get_summary(self) -> Dict[str, Any]:
        """결정 요약"""
        return {
            "total_fields": len(self.proposals),
            "decided_fields": len(self.decisions),
            "conflict_count": self.conflict_count,
            "decisions": {
                name: {
                    "value": d.final_value,
                    "confidence": d.final_confidence,
                    "method": d.decision_method,
                    "had_conflict": d.had_conflict
                }
                for name, d in self.decisions.items()
            }
        }

    def to_dict(self) -> Dict[str, Any]:
        """전체 저장소를 딕셔너리로 변환"""
        return {
            "proposals": {
                field_name: [p.to_dict() for p in proposals]
                for field_name, proposals in self.proposals.items()
            },
            "decisions": {
                field_name: d.to_dict()
                for field_name, d in self.decisions.items()
            },
            "conflict_count": self.conflict_count
        }
