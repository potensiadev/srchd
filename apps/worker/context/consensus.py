"""
Consensus Builder - 다중 LLM 결과의 합의 도출

필드별로 여러 LLM 응답을 비교하여 최선의 값을 선택합니다.
- 다수결 투표 (Majority Vote)
- 신뢰도 가중 평균
- 불일치 감지 및 기록
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from collections import Counter

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """
    단일 Extractor의 추출 결과
    """
    provider: str  # "openai", "gemini", "claude"
    value: Any
    confidence: float = 0.5
    evidence_span: str = ""  # 원문 발췌
    reasoning: str = ""
    model: str = ""

    def __post_init__(self):
        # 신뢰도 범위 제한
        self.confidence = max(0.0, min(1.0, self.confidence))


@dataclass
class ConsensusResult:
    """
    합의 결과
    """
    field_name: str
    final_value: Any
    confidence: float

    # 합의 정보
    method: str  # "unanimous", "majority_vote", "highest_confidence", "single"
    agreement_ratio: float  # 동의 비율 (0.0 ~ 1.0)
    participating_providers: List[str] = field(default_factory=list)

    # 상세 정보
    had_disagreement: bool = False
    disagreements: List[Dict[str, Any]] = field(default_factory=list)
    evidence_span: str = ""

    # 메타데이터
    consensus_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.consensus_id:
            self.consensus_id = f"cons_{self.field_name}_{datetime.now().timestamp()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "consensus_id": self.consensus_id,
            "field_name": self.field_name,
            "final_value": self.final_value,
            "confidence": self.confidence,
            "method": self.method,
            "agreement_ratio": self.agreement_ratio,
            "participating_providers": self.participating_providers,
            "had_disagreement": self.had_disagreement,
            "disagreements": self.disagreements,
            "evidence_span": self.evidence_span,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class ConsensusBuilder:
    """
    다중 LLM 결과에서 합의를 도출하는 빌더

    사용법:
        builder = ConsensusBuilder()
        builder.add_result("name", ExtractionResult(provider="openai", value="김철수", confidence=0.9))
        builder.add_result("name", ExtractionResult(provider="gemini", value="김철수", confidence=0.85))
        consensus = builder.build_consensus("name")
    """

    # 신뢰도 가중치 (provider별)
    PROVIDER_WEIGHTS = {
        "openai": 1.0,      # GPT-4o - 기준
        "gemini": 0.95,     # Gemini 2.0 Flash
        "claude": 0.98,     # Claude 3.5 Sonnet
    }

    # 합의 임계값
    MAJORITY_THRESHOLD = 0.5  # 과반수
    STRONG_CONSENSUS_THRESHOLD = 0.66  # 2/3 이상

    def __init__(self):
        self.results: Dict[str, List[ExtractionResult]] = {}  # field_name -> results
        self.consensus: Dict[str, ConsensusResult] = {}  # field_name -> consensus

    def add_result(
        self,
        field_name: str,
        result: ExtractionResult
    ) -> None:
        """
        추출 결과 추가
        """
        if field_name not in self.results:
            self.results[field_name] = []

        # 같은 provider의 중복 결과 방지
        existing = [r for r in self.results[field_name] if r.provider == result.provider]
        if existing:
            self.results[field_name].remove(existing[0])

        self.results[field_name].append(result)
        logger.debug(f"[ConsensusBuilder] 결과 추가: {field_name} = {result.value} (by {result.provider})")

    def add_results_from_dict(
        self,
        provider: str,
        data: Dict[str, Any],
        confidence_map: Optional[Dict[str, float]] = None,
        evidence_map: Optional[Dict[str, str]] = None
    ) -> None:
        """
        딕셔너리에서 여러 결과를 한번에 추가

        Args:
            provider: LLM 제공자 이름
            data: 필드 → 값 매핑
            confidence_map: 필드 → 신뢰도 매핑 (선택)
            evidence_map: 필드 → 원문 발췌 매핑 (선택)
        """
        confidence_map = confidence_map or {}
        evidence_map = evidence_map or {}

        for field_name, value in data.items():
            if value is None:
                continue

            result = ExtractionResult(
                provider=provider,
                value=value,
                confidence=confidence_map.get(field_name, 0.7),
                evidence_span=evidence_map.get(field_name, "")
            )
            self.add_result(field_name, result)

    def build_consensus(self, field_name: str) -> ConsensusResult:
        """
        특정 필드에 대한 합의 도출
        """
        results = self.results.get(field_name, [])

        if not results:
            consensus = ConsensusResult(
                field_name=field_name,
                final_value=None,
                confidence=0.0,
                method="no_data",
                agreement_ratio=0.0
            )
            self.consensus[field_name] = consensus
            return consensus

        if len(results) == 1:
            # 단일 결과
            consensus = self._create_single_consensus(field_name, results[0])
            self.consensus[field_name] = consensus
            return consensus

        # 다중 결과 - 합의 시도
        consensus = self._build_multi_consensus(field_name, results)
        self.consensus[field_name] = consensus

        logger.info(
            f"[ConsensusBuilder] {field_name}: value={consensus.final_value}, "
            f"method={consensus.method}, agreement={consensus.agreement_ratio:.2f}, "
            f"confidence={consensus.confidence:.2f}"
        )

        return consensus

    def build_all(self) -> Dict[str, ConsensusResult]:
        """
        모든 필드에 대해 합의 도출
        """
        for field_name in self.results:
            if field_name not in self.consensus:
                self.build_consensus(field_name)
        return self.consensus

    def _create_single_consensus(
        self,
        field_name: str,
        result: ExtractionResult
    ) -> ConsensusResult:
        """단일 결과에서 합의 생성"""
        return ConsensusResult(
            field_name=field_name,
            final_value=result.value,
            confidence=result.confidence * 0.9,  # 교차 검증 없음 감점
            method="single",
            agreement_ratio=1.0,
            participating_providers=[result.provider],
            had_disagreement=False,
            evidence_span=result.evidence_span
        )

    def _build_multi_consensus(
        self,
        field_name: str,
        results: List[ExtractionResult]
    ) -> ConsensusResult:
        """다중 결과에서 합의 도출"""
        providers = [r.provider for r in results]

        # 값 정규화 (비교를 위해)
        normalized_values = [self._normalize_value(r.value) for r in results]
        value_counts = Counter(normalized_values)

        # 가장 많이 나온 값 찾기
        most_common_normalized, count = value_counts.most_common(1)[0]
        agreement_ratio = count / len(results)

        # 원래 값 찾기 (정규화 전)
        winning_results = [
            r for r in results
            if self._normalize_value(r.value) == most_common_normalized
        ]

        # 만장일치 확인
        unique_values = len(value_counts)

        if unique_values == 1:
            # 만장일치
            return self._create_unanimous_consensus(field_name, results, providers)

        # 불일치 기록
        disagreements = [
            {
                "provider": r.provider,
                "value": r.value,
                "confidence": r.confidence
            }
            for r in results
            if self._normalize_value(r.value) != most_common_normalized
        ]

        if agreement_ratio > self.MAJORITY_THRESHOLD:
            # 다수결
            return self._create_majority_consensus(
                field_name, winning_results, providers,
                agreement_ratio, disagreements
            )

        # 동률 또는 불일치 - 신뢰도 기반 선택
        return self._create_confidence_based_consensus(
            field_name, results, providers, disagreements
        )

    def _create_unanimous_consensus(
        self,
        field_name: str,
        results: List[ExtractionResult],
        providers: List[str]
    ) -> ConsensusResult:
        """만장일치 합의"""
        # 가중 평균 신뢰도
        weighted_confidence = sum(
            r.confidence * self.PROVIDER_WEIGHTS.get(r.provider, 0.9)
            for r in results
        ) / sum(
            self.PROVIDER_WEIGHTS.get(r.provider, 0.9) for r in results
        )

        # 만장일치 보너스
        final_confidence = min(1.0, weighted_confidence * 1.1)

        # 최고 신뢰도 결과의 evidence 사용
        best_result = max(results, key=lambda r: r.confidence)

        return ConsensusResult(
            field_name=field_name,
            final_value=results[0].value,
            confidence=final_confidence,
            method="unanimous",
            agreement_ratio=1.0,
            participating_providers=providers,
            had_disagreement=False,
            evidence_span=best_result.evidence_span
        )

    def _create_majority_consensus(
        self,
        field_name: str,
        winning_results: List[ExtractionResult],
        all_providers: List[str],
        agreement_ratio: float,
        disagreements: List[Dict[str, Any]]
    ) -> ConsensusResult:
        """다수결 합의"""
        # 승리 결과들의 평균 신뢰도
        avg_confidence = sum(r.confidence for r in winning_results) / len(winning_results)

        # 다수결 패널티 (만장일치 아님)
        final_confidence = avg_confidence * (0.9 + agreement_ratio * 0.1)

        best_result = max(winning_results, key=lambda r: r.confidence)

        return ConsensusResult(
            field_name=field_name,
            final_value=winning_results[0].value,
            confidence=final_confidence,
            method="majority_vote",
            agreement_ratio=agreement_ratio,
            participating_providers=all_providers,
            had_disagreement=True,
            disagreements=disagreements,
            evidence_span=best_result.evidence_span
        )

    def _create_confidence_based_consensus(
        self,
        field_name: str,
        results: List[ExtractionResult],
        providers: List[str],
        disagreements: List[Dict[str, Any]]
    ) -> ConsensusResult:
        """신뢰도 기반 합의 (불일치 시)"""
        # 가중 신뢰도로 최선 선택
        def weighted_score(r: ExtractionResult) -> float:
            return r.confidence * self.PROVIDER_WEIGHTS.get(r.provider, 0.9)

        best_result = max(results, key=weighted_score)

        # 불일치 패널티
        final_confidence = best_result.confidence * 0.8

        return ConsensusResult(
            field_name=field_name,
            final_value=best_result.value,
            confidence=final_confidence,
            method="highest_confidence",
            agreement_ratio=1 / len(results),
            participating_providers=providers,
            had_disagreement=True,
            disagreements=[d for d in disagreements if d["provider"] != best_result.provider],
            evidence_span=best_result.evidence_span
        )

    def _normalize_value(self, value: Any) -> str:
        """
        비교를 위한 값 정규화

        - 문자열: 소문자, 공백 제거
        - 숫자: 반올림
        - 리스트: 정렬 후 문자열화
        - None: "none"
        """
        if value is None:
            return "none"

        if isinstance(value, str):
            return value.lower().strip().replace(" ", "")

        if isinstance(value, (int, float)):
            if isinstance(value, float):
                # 정수로 변환 가능한 float은 int로 처리 (5.0 == 5)
                if value.is_integer():
                    return str(int(value))
                return str(round(value, 1))
            return str(value)

        if isinstance(value, list):
            # 리스트는 정렬 후 비교
            sorted_list = sorted([self._normalize_value(v) for v in value])
            return str(sorted_list)

        if isinstance(value, dict):
            # 딕셔너리는 키 정렬 후 비교
            sorted_dict = {k: self._normalize_value(v) for k, v in sorted(value.items())}
            return str(sorted_dict)

        return str(value).lower().strip()

    def get_field_results(self, field_name: str) -> List[ExtractionResult]:
        """특정 필드의 모든 추출 결과 조회"""
        return self.results.get(field_name, [])

    def get_disagreements(self) -> Dict[str, List[Dict[str, Any]]]:
        """모든 불일치 조회"""
        return {
            field_name: consensus.disagreements
            for field_name, consensus in self.consensus.items()
            if consensus.had_disagreement
        }

    def get_summary(self) -> Dict[str, Any]:
        """합의 빌더 요약"""
        total_fields = len(self.results)
        consensed_fields = len(self.consensus)
        disagreement_count = sum(
            1 for c in self.consensus.values() if c.had_disagreement
        )

        method_counts = Counter(c.method for c in self.consensus.values())

        avg_confidence = (
            sum(c.confidence for c in self.consensus.values()) / consensed_fields
            if consensed_fields > 0 else 0.0
        )

        return {
            "total_fields": total_fields,
            "consensed_fields": consensed_fields,
            "disagreement_count": disagreement_count,
            "avg_confidence": avg_confidence,
            "method_distribution": dict(method_counts),
            "fields_with_disagreement": [
                field_name for field_name, c in self.consensus.items()
                if c.had_disagreement
            ]
        }

    def to_dict(self) -> Dict[str, Any]:
        """전체 상태를 딕셔너리로 변환"""
        return {
            "results": {
                field_name: [
                    {
                        "provider": r.provider,
                        "value": r.value,
                        "confidence": r.confidence,
                        "evidence_span": r.evidence_span
                    }
                    for r in results
                ]
                for field_name, results in self.results.items()
            },
            "consensus": {
                field_name: c.to_dict()
                for field_name, c in self.consensus.items()
            },
            "summary": self.get_summary()
        }


# 전역 인스턴스 생성 함수
def create_consensus_builder() -> ConsensusBuilder:
    """새 ConsensusBuilder 인스턴스 생성"""
    return ConsensusBuilder()
