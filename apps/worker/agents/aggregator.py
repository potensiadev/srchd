"""
Aggregator - 다중 Extractor 결과 집계 및 합의 도출

여러 Extractor의 결과를 병합하고 교차검증을 수행합니다.
"""

import asyncio
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple

from context.consensus import ConsensusBuilder, ExtractionResult as ConsensusExtractionResult
from context.rule_validator import RuleValidator
from context.evidence_enforcer import EvidenceEnforcer
from context.quality_metrics import QualityGate, QualityMetrics, QualityGateResult
from agents.extractors.base_extractor import ExtractionResult

logger = logging.getLogger(__name__)


@dataclass
class AggregatedResult:
    """
    집계된 최종 결과
    """
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)

    # 신뢰도
    confidence_map: Dict[str, float] = field(default_factory=dict)
    overall_confidence: float = 0.0

    # 품질 지표
    quality_metrics: Optional[QualityMetrics] = None
    quality_gate_passed: bool = False
    quality_warnings: List[str] = field(default_factory=list)

    # 합의/검증 정보
    consensus_summary: Dict[str, Any] = field(default_factory=dict)
    validation_summary: Dict[str, Any] = field(default_factory=dict)
    evidence_summary: Dict[str, Any] = field(default_factory=dict)

    # 토큰 사용량
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    # 메타데이터
    extractors_used: List[str] = field(default_factory=list)
    processing_time_ms: int = 0
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        if self.quality_metrics:
            result["quality_metrics"] = self.quality_metrics.to_dict()
        return result


class Aggregator:
    """
    다중 Extractor 결과 집계기

    1. 개별 Extractor 결과 수집
    2. 필드별 교차검증 (ConsensusBuilder)
    3. 규칙 기반 검증 (RuleValidator)
    4. Evidence 검증 (EvidenceEnforcer)
    5. 품질 게이트 (QualityGate)
    """

    # 교차검증 대상 필드
    CROSS_VALIDATION_FIELDS = {
        "name",
        "current_company",
        "current_position",
        "exp_years",
        "education_level",
        "education_school",
    }

    # 필드별 Extractor 매핑
    FIELD_TO_EXTRACTOR = {
        "name": "profile",
        "birth_year": "profile",
        "gender": "profile",
        "phone": "profile",
        "email": "profile",
        "address": "profile",
        "location_city": "profile",
        "exp_years": "career",
        "current_company": "career",
        "current_position": "career",
        "careers": "career",
        "education_level": "education",
        "education_school": "education",
        "education_major": "education",
        "educations": "education",
        "skills": "skills",
        "primary_skills": "skills",
        "certifications": "skills",
        "languages": "skills",
        "projects": "projects",
        "portfolio_url": "projects",
        "github_url": "projects",
        "linkedin_url": "projects",
        "summary": "summary",
        "strengths": "summary",
        "match_reason": "summary",
        "key_achievements": "summary",
        "career_trajectory": "summary",
    }

    def __init__(self, source_text: str = ""):
        self.rule_validator = RuleValidator()
        self.evidence_enforcer = EvidenceEnforcer(source_text)
        self.quality_gate = QualityGate()
        self.source_text = source_text

    def set_source_text(self, source_text: str) -> None:
        """원본 텍스트 설정"""
        self.source_text = source_text
        self.evidence_enforcer.set_source_text(source_text)

    def aggregate(
        self,
        extractor_results: Dict[str, ExtractionResult],
        cross_validation_results: Optional[Dict[str, Dict[str, ExtractionResult]]] = None
    ) -> AggregatedResult:
        """
        Extractor 결과 집계

        Args:
            extractor_results: Extractor 타입 → 결과 매핑
            cross_validation_results: 교차검증용 개별 결과 (선택)

        Returns:
            AggregatedResult
        """
        result = AggregatedResult(success=True)

        # 1. 기본 병합
        merged_data = {}
        merged_confidence = {}
        merged_evidence = {}

        for extractor_type, ext_result in extractor_results.items():
            if not ext_result.success:
                result.warnings.append(f"{extractor_type} 추출 실패: {ext_result.error}")
                continue

            result.extractors_used.append(extractor_type)
            result.total_input_tokens += ext_result.input_tokens
            result.total_output_tokens += ext_result.output_tokens

            # 데이터 병합
            for field, value in ext_result.data.items():
                if value is not None:
                    merged_data[field] = value

            # 신뢰도 병합
            merged_confidence.update(ext_result.confidence_map)

            # Evidence 병합
            merged_evidence.update(ext_result.evidence_map)

        # 2. 교차검증 (제공된 경우)
        if cross_validation_results:
            consensus_data, consensus_summary = self._apply_cross_validation(
                merged_data, merged_confidence, cross_validation_results
            )
            merged_data.update(consensus_data)
            result.consensus_summary = consensus_summary

        # 3. 규칙 기반 검증
        validated_data, validation_summary = self._apply_rule_validation(merged_data)
        result.data = validated_data
        result.validation_summary = validation_summary

        # 4. Evidence 검증
        evidence_result = self.evidence_enforcer.enforce(result.data, merged_evidence)
        result.evidence_summary = evidence_result.to_dict()

        # Evidence 페널티 적용
        merged_confidence = self.evidence_enforcer.apply_penalties(
            merged_confidence, evidence_result
        )
        result.confidence_map = merged_confidence

        # 5. 전체 신뢰도 계산
        if merged_confidence:
            result.overall_confidence = sum(merged_confidence.values()) / len(merged_confidence)

        # 6. 품질 게이트
        quality_result = self.quality_gate.evaluate(
            result.data,
            merged_confidence,
            evidence_result.to_dict(),
            result.consensus_summary
        )
        result.quality_metrics = quality_result.metrics
        result.quality_gate_passed = quality_result.passed
        result.quality_warnings = quality_result.warnings + quality_result.failures

        # 성공 여부
        result.success = len(result.extractors_used) > 0

        logger.info(
            f"[Aggregator] 집계 완료: "
            f"extractors={len(result.extractors_used)}, "
            f"fields={len(result.data)}, "
            f"confidence={result.overall_confidence:.2f}, "
            f"quality_gate={result.quality_gate_passed}"
        )

        return result

    def _apply_cross_validation(
        self,
        merged_data: Dict[str, Any],
        merged_confidence: Dict[str, float],
        cross_validation_results: Dict[str, Dict[str, ExtractionResult]]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        교차검증 적용

        Returns:
            (교차검증된 데이터, 합의 요약)
        """
        consensus_builder = ConsensusBuilder()

        # 교차검증 대상 필드에 대해 합의 도출
        for field in self.CROSS_VALIDATION_FIELDS:
            extractor_type = self.FIELD_TO_EXTRACTOR.get(field)
            if not extractor_type or extractor_type not in cross_validation_results:
                continue

            provider_results = cross_validation_results[extractor_type]
            for provider, ext_result in provider_results.items():
                if not ext_result.success:
                    continue

                value = ext_result.data.get(field)
                if value is None:
                    continue

                confidence = ext_result.confidence_map.get(field, 0.7)
                evidence = ext_result.evidence_map.get(field, "")

                consensus_builder.add_result(
                    field,
                    ConsensusExtractionResult(
                        provider=provider.value if hasattr(provider, 'value') else str(provider),
                        value=value,
                        confidence=confidence,
                        evidence_span=evidence
                    )
                )

        # 합의 도출
        consensus_results = consensus_builder.build_all()

        # 합의된 값으로 업데이트
        updated_data = {}
        for field, consensus in consensus_results.items():
            if consensus.final_value is not None:
                updated_data[field] = consensus.final_value
                merged_confidence[field] = consensus.confidence

        return updated_data, consensus_builder.get_summary()

    def _apply_rule_validation(
        self,
        data: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        규칙 기반 검증 적용

        Returns:
            (검증된 데이터, 검증 요약)
        """
        validated_data = data.copy()

        # careers 검증
        if "careers" in validated_data:
            careers, warnings = self.rule_validator.validate_careers(
                validated_data["careers"]
            )
            validated_data["careers"] = careers
            for w in warnings:
                logger.debug(f"[Aggregator] Career validation: {w}")

        # educations 검증
        if "educations" in validated_data:
            educations, warnings = self.rule_validator.validate_educations(
                validated_data["educations"]
            )
            validated_data["educations"] = educations

        # 개별 필드 검증
        for field in ["name", "phone", "email", "exp_years", "birth_year"]:
            if field in validated_data:
                result = self.rule_validator.validate_and_normalize(
                    field, validated_data[field]
                )
                validated_data[field] = result.normalized_value

        return validated_data, self.rule_validator.get_summary()


# 싱글톤 인스턴스
_instance: Optional[Aggregator] = None


def get_aggregator(source_text: str = "") -> Aggregator:
    """Aggregator 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = Aggregator(source_text)
    else:
        _instance.set_source_text(source_text)
    return _instance


def create_aggregator(source_text: str = "") -> Aggregator:
    """새 Aggregator 인스턴스 생성"""
    return Aggregator(source_text)
