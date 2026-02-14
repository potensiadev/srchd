"""
Quality Metrics - 품질 지표 및 품질 게이트

추출 품질을 측정하고 품질 게이트 통과 여부를 판단합니다.
- coverage_score: 필드 완성도
- critical_coverage: 핵심 필드 완성도
- evidence_backed_ratio: Evidence 기반 비율
- cross_validation_ratio: 교차 검증 비율
- consensus_ratio: 합의 비율
"""

import logging
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class QualityMetrics:
    """
    품질 지표
    """
    # 필드 완성도
    coverage_score: float = 0.0  # 전체 필드 완성도 (0.0 ~ 1.0)
    critical_coverage: float = 0.0  # 핵심 필드 완성도
    optional_coverage: float = 0.0  # 선택 필드 완성도

    # Evidence 관련
    evidence_backed_ratio: float = 0.0  # Evidence 있는 필드 비율
    evidence_valid_ratio: float = 0.0  # 유효한 Evidence 비율

    # 교차 검증 관련
    cross_validation_ratio: float = 0.0  # 교차 검증된 필드 비율
    consensus_ratio: float = 0.0  # 합의 달성 비율

    # 신뢰도
    avg_confidence: float = 0.0  # 평균 신뢰도
    min_confidence: float = 0.0  # 최소 신뢰도

    # 상세 정보
    total_fields: int = 0
    filled_fields: int = 0
    critical_fields_total: int = 0
    critical_fields_filled: int = 0

    # 경고/에러
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    # 메타데이터
    calculated_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "coverage_score": round(self.coverage_score, 3),
            "critical_coverage": round(self.critical_coverage, 3),
            "optional_coverage": round(self.optional_coverage, 3),
            "evidence_backed_ratio": round(self.evidence_backed_ratio, 3),
            "evidence_valid_ratio": round(self.evidence_valid_ratio, 3),
            "cross_validation_ratio": round(self.cross_validation_ratio, 3),
            "consensus_ratio": round(self.consensus_ratio, 3),
            "avg_confidence": round(self.avg_confidence, 3),
            "min_confidence": round(self.min_confidence, 3),
            "total_fields": self.total_fields,
            "filled_fields": self.filled_fields,
            "critical_fields_total": self.critical_fields_total,
            "critical_fields_filled": self.critical_fields_filled,
            "warnings": self.warnings,
            "errors": self.errors,
            "calculated_at": self.calculated_at.isoformat()
        }


@dataclass
class QualityGateConfig:
    """
    품질 게이트 설정
    """
    # 최소 임계값
    min_coverage_score: float = 0.6  # 60%
    min_critical_coverage: float = 0.8  # 80%
    min_evidence_backed_ratio: float = 0.5  # 50%
    min_cross_validation_ratio: float = 0.7  # 70%
    min_consensus_ratio: float = 0.6  # 60%

    # 필수 필드 (반드시 있어야 함)
    required_fields: Set[str] = field(default_factory=lambda: {"name"})

    def to_dict(self) -> Dict[str, Any]:
        return {
            "min_coverage_score": self.min_coverage_score,
            "min_critical_coverage": self.min_critical_coverage,
            "min_evidence_backed_ratio": self.min_evidence_backed_ratio,
            "min_cross_validation_ratio": self.min_cross_validation_ratio,
            "min_consensus_ratio": self.min_consensus_ratio,
            "required_fields": list(self.required_fields)
        }


@dataclass
class QualityGateResult:
    """
    품질 게이트 통과 결과
    """
    passed: bool = False
    metrics: Optional[QualityMetrics] = None
    config: Optional[QualityGateConfig] = None
    failures: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "config": self.config.to_dict() if self.config else None,
            "failures": self.failures,
            "warnings": self.warnings
        }


class QualityGate:
    """
    품질 게이트 검증기

    품질 지표가 설정된 임계값을 충족하는지 확인합니다.
    """

    # 핵심 필드 정의
    CRITICAL_FIELDS: Set[str] = {
        "name",
        "careers",
        "exp_years",
        "current_company",
        "current_position",
        "skills",
    }

    # 선택 필드 정의
    OPTIONAL_FIELDS: Set[str] = {
        "birth_year",
        "gender",
        "phone",
        "email",
        "address",
        "educations",
        "education_level",
        "education_school",
        "projects",
        "summary",
        "strengths",
        "match_reason",
        "portfolio_url",
        "github_url",
        "linkedin_url",
    }

    # 필드별 가중치 (coverage 계산용)
    FIELD_WEIGHTS: Dict[str, float] = {
        "name": 1.5,
        "careers": 2.0,
        "exp_years": 1.5,
        "current_company": 1.2,
        "current_position": 1.0,
        "skills": 1.5,
        "educations": 1.0,
        "summary": 0.8,
        "birth_year": 0.5,
        "phone": 0.5,
        "email": 0.5,
    }

    def __init__(self, config: Optional[QualityGateConfig] = None):
        self.config = config or QualityGateConfig()

    def calculate_metrics(
        self,
        extracted_data: Dict[str, Any],
        confidence_map: Optional[Dict[str, float]] = None,
        evidence_result: Optional[Dict[str, Any]] = None,
        consensus_result: Optional[Dict[str, Any]] = None
    ) -> QualityMetrics:
        """
        품질 지표 계산

        Args:
            extracted_data: 추출된 데이터
            confidence_map: 필드 → 신뢰도 매핑
            evidence_result: EvidenceEnforcerResult.to_dict()
            consensus_result: ConsensusBuilder.get_summary()

        Returns:
            QualityMetrics
        """
        confidence_map = confidence_map or {}
        evidence_result = evidence_result or {}
        consensus_result = consensus_result or {}

        metrics = QualityMetrics()

        # 필드 완성도 계산
        self._calculate_coverage(extracted_data, metrics)

        # Evidence 관련 지표
        if evidence_result:
            metrics.evidence_backed_ratio = evidence_result.get("evidence_backed_ratio", 0.0)
            total = evidence_result.get("total_fields", 0)
            valid = evidence_result.get("evidence_valid_count", 0)
            metrics.evidence_valid_ratio = valid / total if total > 0 else 0.0

        # Consensus 관련 지표
        if consensus_result:
            total_fields = consensus_result.get("consensed_fields", 0)
            disagreements = consensus_result.get("disagreement_count", 0)
            if total_fields > 0:
                metrics.consensus_ratio = (total_fields - disagreements) / total_fields
            else:
                metrics.consensus_ratio = 0.0

        # 신뢰도 지표
        if confidence_map:
            confidences = list(confidence_map.values())
            if confidences:
                metrics.avg_confidence = sum(confidences) / len(confidences)
                metrics.min_confidence = min(confidences)

        # 교차 검증 비율 (consensus에서 derivation)
        method_dist = consensus_result.get("method_distribution", {})
        total_consensed = sum(method_dist.values())
        cross_validated = method_dist.get("unanimous", 0) + method_dist.get("majority_vote", 0)
        if total_consensed > 0:
            metrics.cross_validation_ratio = cross_validated / total_consensed
        else:
            metrics.cross_validation_ratio = 0.0

        logger.info(
            f"[QualityGate] 메트릭 계산: coverage={metrics.coverage_score:.2f}, "
            f"critical={metrics.critical_coverage:.2f}, "
            f"evidence={metrics.evidence_backed_ratio:.2f}, "
            f"consensus={metrics.consensus_ratio:.2f}"
        )

        return metrics

    def _calculate_coverage(
        self,
        data: Dict[str, Any],
        metrics: QualityMetrics
    ) -> None:
        """필드 완성도 계산"""
        # 핵심 필드
        critical_filled = 0
        for field in self.CRITICAL_FIELDS:
            if self._is_field_filled(data, field):
                critical_filled += 1

        metrics.critical_fields_total = len(self.CRITICAL_FIELDS)
        metrics.critical_fields_filled = critical_filled
        metrics.critical_coverage = critical_filled / len(self.CRITICAL_FIELDS)

        # 선택 필드
        optional_filled = 0
        for field in self.OPTIONAL_FIELDS:
            if self._is_field_filled(data, field):
                optional_filled += 1

        if len(self.OPTIONAL_FIELDS) > 0:
            metrics.optional_coverage = optional_filled / len(self.OPTIONAL_FIELDS)

        # 전체 완성도 (가중치 적용)
        total_weight = 0.0
        filled_weight = 0.0

        all_fields = self.CRITICAL_FIELDS | self.OPTIONAL_FIELDS
        for field in all_fields:
            weight = self.FIELD_WEIGHTS.get(field, 1.0)
            total_weight += weight
            if self._is_field_filled(data, field):
                filled_weight += weight
                metrics.filled_fields += 1
            metrics.total_fields += 1

        metrics.coverage_score = filled_weight / total_weight if total_weight > 0 else 0.0

    def _is_field_filled(self, data: Dict[str, Any], field: str) -> bool:
        """필드가 채워져 있는지 확인"""
        value = data.get(field)

        if value is None:
            return False

        if isinstance(value, str) and value.strip() == "":
            return False

        if isinstance(value, list) and len(value) == 0:
            return False

        return True

    def check(
        self,
        metrics: QualityMetrics,
        extracted_data: Optional[Dict[str, Any]] = None
    ) -> QualityGateResult:
        """
        품질 게이트 통과 여부 확인

        Args:
            metrics: 계산된 품질 지표
            extracted_data: 필수 필드 확인용 추출 데이터

        Returns:
            QualityGateResult
        """
        result = QualityGateResult(
            passed=True,
            metrics=metrics,
            config=self.config
        )

        # 커버리지 체크
        if metrics.coverage_score < self.config.min_coverage_score:
            result.passed = False
            result.failures.append(
                f"coverage_score {metrics.coverage_score:.2f} < "
                f"{self.config.min_coverage_score:.2f}"
            )

        # 핵심 필드 커버리지 체크
        if metrics.critical_coverage < self.config.min_critical_coverage:
            result.passed = False
            result.failures.append(
                f"critical_coverage {metrics.critical_coverage:.2f} < "
                f"{self.config.min_critical_coverage:.2f}"
            )

        # Evidence 비율 체크
        if metrics.evidence_backed_ratio < self.config.min_evidence_backed_ratio:
            # Warning만 (실패 아님)
            result.warnings.append(
                f"evidence_backed_ratio {metrics.evidence_backed_ratio:.2f} < "
                f"{self.config.min_evidence_backed_ratio:.2f}"
            )

        # Consensus 비율 체크
        if metrics.consensus_ratio < self.config.min_consensus_ratio:
            result.warnings.append(
                f"consensus_ratio {metrics.consensus_ratio:.2f} < "
                f"{self.config.min_consensus_ratio:.2f}"
            )

        # 필수 필드 확인
        if extracted_data:
            for required_field in self.config.required_fields:
                if not self._is_field_filled(extracted_data, required_field):
                    result.passed = False
                    result.failures.append(f"필수 필드 누락: {required_field}")

        # 메트릭 경고 복사
        result.warnings.extend(metrics.warnings)

        logger.info(
            f"[QualityGate] 검증 결과: passed={result.passed}, "
            f"failures={len(result.failures)}, warnings={len(result.warnings)}"
        )

        return result

    def evaluate(
        self,
        extracted_data: Dict[str, Any],
        confidence_map: Optional[Dict[str, float]] = None,
        evidence_result: Optional[Dict[str, Any]] = None,
        consensus_result: Optional[Dict[str, Any]] = None
    ) -> QualityGateResult:
        """
        원스텝 품질 평가 (메트릭 계산 + 게이트 체크)

        Args:
            extracted_data: 추출된 데이터
            confidence_map: 필드 → 신뢰도 매핑
            evidence_result: EvidenceEnforcerResult.to_dict()
            consensus_result: ConsensusBuilder.get_summary()

        Returns:
            QualityGateResult
        """
        metrics = self.calculate_metrics(
            extracted_data,
            confidence_map,
            evidence_result,
            consensus_result
        )
        return self.check(metrics, extracted_data)


def create_quality_gate(config: Optional[QualityGateConfig] = None) -> QualityGate:
    """새 QualityGate 인스턴스 생성"""
    return QualityGate(config)


def create_default_config() -> QualityGateConfig:
    """기본 품질 게이트 설정 생성"""
    return QualityGateConfig()


def create_strict_config() -> QualityGateConfig:
    """엄격한 품질 게이트 설정 생성"""
    return QualityGateConfig(
        min_coverage_score=0.7,
        min_critical_coverage=0.9,
        min_evidence_backed_ratio=0.6,
        min_cross_validation_ratio=0.8,
        min_consensus_ratio=0.7,
    )


def create_relaxed_config() -> QualityGateConfig:
    """완화된 품질 게이트 설정 생성"""
    return QualityGateConfig(
        min_coverage_score=0.5,
        min_critical_coverage=0.7,
        min_evidence_backed_ratio=0.4,
        min_cross_validation_ratio=0.5,
        min_consensus_ratio=0.5,
    )
