"""
Evidence Store - LLM의 추론 근거를 추적하고 저장

각 필드에 대해 LLM이 왜 특정 값을 선택했는지 증거를 수집합니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Evidence:
    """
    단일 증거

    LLM이 특정 값을 추출한 근거를 기록합니다.
    """
    field_name: str  # "exp_years", "skills", "current_company"
    value: Any

    # 증거 출처
    source_text: str = ""  # 원본 텍스트에서 발췌
    source_location: str = ""  # "경력 섹션 3번째 줄"

    # LLM 추론 근거
    llm_reasoning: str = ""  # LLM이 설명한 추론 과정
    llm_provider: str = ""  # "openai", "gemini", "claude"
    llm_model: str = ""

    # 신뢰도
    confidence: float = 0.0  # 0.0 ~ 1.0
    confidence_factors: List[str] = field(default_factory=list)
    # ["파일명과 일치", "다수 LLM 동의", "원본 텍스트에서 확인"]

    # 교차 검증
    cross_validated: bool = False
    validators: List[str] = field(default_factory=list)
    # ["regex", "gemini", "gpt4"]

    # 메타데이터
    evidence_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.evidence_id:
            self.evidence_id = f"ev_{self.field_name}_{datetime.now().timestamp()}"

    def add_validator(self, validator: str, agreed: bool = True):
        """검증자 추가"""
        if agreed and validator not in self.validators:
            self.validators.append(validator)
            self.cross_validated = len(self.validators) >= 2

    def boost_confidence(self, boost: float, reason: str):
        """신뢰도 상승"""
        self.confidence = min(1.0, self.confidence + boost)
        if reason not in self.confidence_factors:
            self.confidence_factors.append(reason)

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return {
            "evidence_id": self.evidence_id,
            "field_name": self.field_name,
            "value": self.value,
            "source_text": self.source_text,
            "source_location": self.source_location,
            "llm_reasoning": self.llm_reasoning,
            "llm_provider": self.llm_provider,
            "confidence": self.confidence,
            "confidence_factors": self.confidence_factors,
            "cross_validated": self.cross_validated,
            "validators": self.validators,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


@dataclass
class EvidenceStore:
    """
    증거 저장소

    필드별로 여러 증거를 수집하고 관리합니다.
    """
    evidences: Dict[str, List[Evidence]] = field(default_factory=dict)
    # {"exp_years": [Evidence1, Evidence2], "skills": [...]}

    MAX_EVIDENCES_PER_FIELD: int = 10

    def add(self, evidence: Evidence) -> bool:
        """
        증거 추가

        같은 필드에 대해 최대 MAX_EVIDENCES_PER_FIELD개까지 저장합니다.
        """
        field_name = evidence.field_name

        if field_name not in self.evidences:
            self.evidences[field_name] = []

        if len(self.evidences[field_name]) >= self.MAX_EVIDENCES_PER_FIELD:
            logger.warning(f"[EvidenceStore] {field_name} 필드의 증거 개수 한도 도달")
            return False

        self.evidences[field_name].append(evidence)
        logger.debug(f"[EvidenceStore] 증거 추가: {field_name} = {evidence.value}")
        return True

    def add_from_llm(
        self,
        field_name: str,
        value: Any,
        llm_provider: str,
        confidence: float = 0.5,
        reasoning: str = "",
        source_text: str = "",
        **kwargs
    ) -> Evidence:
        """LLM 결과로부터 증거 생성 및 추가"""
        evidence = Evidence(
            field_name=field_name,
            value=value,
            llm_provider=llm_provider,
            confidence=confidence,
            llm_reasoning=reasoning,
            source_text=source_text,
            **kwargs
        )
        evidence.validators.append(llm_provider)
        self.add(evidence)
        return evidence

    def get(self, field_name: str) -> List[Evidence]:
        """특정 필드의 모든 증거 조회"""
        return self.evidences.get(field_name, [])

    def get_best(self, field_name: str) -> Optional[Evidence]:
        """가장 신뢰도 높은 증거 반환"""
        evidences = self.get(field_name)
        if not evidences:
            return None

        return max(evidences, key=lambda e: (e.cross_validated, e.confidence))

    def get_by_provider(self, field_name: str, provider: str) -> Optional[Evidence]:
        """특정 LLM 제공자의 증거 조회"""
        for evidence in self.get(field_name):
            if evidence.llm_provider == provider:
                return evidence
        return None

    def get_all_providers(self, field_name: str) -> Dict[str, Any]:
        """특정 필드에 대한 모든 LLM 결과 조회"""
        result = {}
        for evidence in self.get(field_name):
            if evidence.llm_provider:
                result[evidence.llm_provider] = evidence.value
        return result

    def check_consensus(self, field_name: str) -> tuple[bool, Any, float]:
        """
        특정 필드에 대한 합의 확인

        Returns:
            (합의여부, 합의된_값, 합의_신뢰도)
        """
        evidences = self.get(field_name)
        if not evidences:
            return False, None, 0.0

        if len(evidences) == 1:
            return True, evidences[0].value, evidences[0].confidence

        # 값별로 그룹화
        from collections import Counter
        value_counts = Counter(str(e.value) for e in evidences)
        most_common_str, count = value_counts.most_common(1)[0]

        # 다수결 합의
        consensus_ratio = count / len(evidences)

        if consensus_ratio >= 0.5:
            # 합의된 값 찾기
            for e in evidences:
                if str(e.value) == most_common_str:
                    # 합의 신뢰도: 개별 신뢰도 평균 * 합의 비율
                    avg_confidence = sum(
                        ev.confidence for ev in evidences if str(ev.value) == most_common_str
                    ) / count
                    final_confidence = min(1.0, avg_confidence * (1 + consensus_ratio * 0.2))

                    return True, e.value, final_confidence

        return False, None, 0.0

    def cross_validate(self, field_name: str) -> Dict[str, Any]:
        """
        특정 필드에 대해 교차 검증 수행

        Returns:
            {
                "has_consensus": bool,
                "consensus_value": Any,
                "confidence": float,
                "disagreements": List[Dict]
            }
        """
        evidences = self.get(field_name)
        result = {
            "has_consensus": False,
            "consensus_value": None,
            "confidence": 0.0,
            "disagreements": []
        }

        if not evidences:
            return result

        has_consensus, consensus_value, confidence = self.check_consensus(field_name)

        result["has_consensus"] = has_consensus
        result["consensus_value"] = consensus_value
        result["confidence"] = confidence

        # 불일치 기록
        if has_consensus:
            for e in evidences:
                if str(e.value) != str(consensus_value):
                    result["disagreements"].append({
                        "provider": e.llm_provider,
                        "value": e.value,
                        "confidence": e.confidence
                    })

            # 합의된 증거에 교차 검증 표시
            for e in evidences:
                if str(e.value) == str(consensus_value):
                    for other in evidences:
                        if other != e and str(other.value) == str(consensus_value):
                            e.add_validator(other.llm_provider, True)

        logger.info(f"[EvidenceStore] {field_name} 교차검증: consensus={has_consensus}, value={consensus_value}, confidence={confidence:.2f}")

        return result

    def get_fields_with_evidence(self) -> List[str]:
        """증거가 있는 모든 필드 목록"""
        return list(self.evidences.keys())

    def get_summary(self) -> Dict[str, Any]:
        """증거 저장소 요약"""
        summary = {}
        for field_name in self.evidences:
            best = self.get_best(field_name)
            validation = self.cross_validate(field_name)

            summary[field_name] = {
                "evidence_count": len(self.evidences[field_name]),
                "best_value": best.value if best else None,
                "best_confidence": best.confidence if best else 0.0,
                "has_consensus": validation["has_consensus"],
                "disagreement_count": len(validation["disagreements"])
            }
        return summary

    def to_dict(self) -> Dict[str, Any]:
        """전체 저장소를 딕셔너리로 변환"""
        return {
            field_name: [e.to_dict() for e in evidences]
            for field_name, evidences in self.evidences.items()
        }
