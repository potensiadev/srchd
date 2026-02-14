"""
CoverageCalculator

필드 완성도 점수를 산출하고, 빈 필드에 대한 missing_reason을 추적합니다.

LLM 호출: 0 (순수 계산 로직)

파이프라인 위치:
... → ValidationAgent → [CoverageCalculator] → GapFillerAgent → ...
"""

import logging
import re
from typing import Dict, List, Any, Optional

from ..schemas.phase1_types import (
    MissingReason,
    FieldPriority,
    FieldCoverage,
    CoverageResult,
    FIELD_WEIGHTS,
    GAP_FILL_PRIORITY_ORDER,
    GAP_FILL_MAX_FIELDS,
    get_field_priority,
    get_field_weight,
)

logger = logging.getLogger(__name__)


class CoverageCalculator:
    """
    필드 완성도 계산기

    역할:
    - 필드별 가중치 적용하여 0-100 점수 산출
    - 빈 필드마다 missing_reason 할당
    - GapFiller 대상 필드 우선순위 결정
    """

    # 낮은 신뢰도 임계값
    LOW_CONFIDENCE_THRESHOLD = 0.6

    # 필드 존재 확인용 키워드 (원문 검색)
    FIELD_KEYWORDS = {
        "phone": ["전화", "연락처", "핸드폰", "휴대폰", "010", "phone", "mobile", "tel"],
        "email": ["이메일", "email", "e-mail", "@"],
        "skills": ["기술", "스킬", "역량", "skill", "tech", "기술스택", "보유기술"],
        "educations": ["학력", "학교", "대학", "education", "university", "졸업"],
        "careers": ["경력", "경험", "회사", "근무", "experience", "work", "employment"],
        "name": ["이름", "성명", "name"],
        "address": ["주소", "거주지", "address", "location"],
        "birth_year": ["생년", "나이", "출생", "birth", "age"],
        "projects": ["프로젝트", "project", "포트폴리오"],
        "certifications": ["자격증", "자격", "certification", "license"],
    }

    def calculate(
        self,
        analyzed_data: Dict[str, Any],
        evidence_map: Optional[Dict[str, Any]] = None,
        original_text: str = "",
        field_confidence: Optional[Dict[str, float]] = None,
    ) -> CoverageResult:
        """
        필드 완성도 계산

        Args:
            analyzed_data: AnalystAgent 출력 데이터
            evidence_map: 필드별 원문 근거 (EvidenceStore에서)
            original_text: 파싱된 원문 텍스트
            field_confidence: 필드별 신뢰도 점수

        Returns:
            CoverageResult
        """
        if evidence_map is None:
            evidence_map = {}
        if field_confidence is None:
            field_confidence = {}

        field_coverages: Dict[str, FieldCoverage] = {}
        total_weight = 0.0
        achieved_weight = 0.0
        evidence_count = 0

        # 우선순위별 가중치 추적
        priority_totals = {
            FieldPriority.CRITICAL: 0.0,
            FieldPriority.IMPORTANT: 0.0,
            FieldPriority.OPTIONAL: 0.0,
        }
        priority_achieved = {
            FieldPriority.CRITICAL: 0.0,
            FieldPriority.IMPORTANT: 0.0,
            FieldPriority.OPTIONAL: 0.0,
        }

        # 각 필드 평가
        for field_name, (priority, weight) in FIELD_WEIGHTS.items():
            value = analyzed_data.get(field_name)
            evidence = evidence_map.get(field_name)
            confidence = field_confidence.get(field_name, 0.5)

            has_value = self._has_meaningful_value(value)
            has_evidence = evidence is not None and len(str(evidence)) > 0

            # Missing reason 결정
            missing_reason = None
            if not has_value:
                missing_reason = self._determine_missing_reason(
                    field_name=field_name,
                    value=value,
                    evidence=evidence,
                    original_text=original_text,
                )

            # FieldCoverage 생성
            field_coverages[field_name] = FieldCoverage(
                field_name=field_name,
                has_value=has_value,
                has_evidence=has_evidence,
                confidence=confidence,
                priority=priority,
                weight=weight,
                missing_reason=missing_reason,
                evidence_span=str(evidence)[:100] if evidence else None,
                source_agent="analyst" if has_value else None,
            )

            # 가중치 계산
            total_weight += weight
            priority_totals[priority] += weight

            if has_value and confidence >= self.LOW_CONFIDENCE_THRESHOLD:
                achieved_weight += weight
                priority_achieved[priority] += weight

            if has_evidence:
                evidence_count += 1

        # 전체 점수 계산 (0-100)
        coverage_score = (achieved_weight / total_weight) * 100 if total_weight > 0 else 0

        # 증거 기반 비율
        evidence_backed_ratio = evidence_count / len(FIELD_WEIGHTS)

        # 우선순위별 커버리지 계산
        critical_coverage = (
            (priority_achieved[FieldPriority.CRITICAL] / priority_totals[FieldPriority.CRITICAL]) * 100
            if priority_totals[FieldPriority.CRITICAL] > 0 else 0
        )
        important_coverage = (
            (priority_achieved[FieldPriority.IMPORTANT] / priority_totals[FieldPriority.IMPORTANT]) * 100
            if priority_totals[FieldPriority.IMPORTANT] > 0 else 0
        )
        optional_coverage = (
            (priority_achieved[FieldPriority.OPTIONAL] / priority_totals[FieldPriority.OPTIONAL]) * 100
            if priority_totals[FieldPriority.OPTIONAL] > 0 else 0
        )

        # 빈 필드 및 낮은 신뢰도 필드 식별
        missing_fields = [
            f for f, c in field_coverages.items()
            if not c.has_value
        ]
        low_confidence_fields = [
            f for f, c in field_coverages.items()
            if c.has_value and c.confidence < self.LOW_CONFIDENCE_THRESHOLD
        ]

        # GapFiller 대상 필드 결정
        gap_fill_candidates = self._prioritize_gap_fill(
            missing_fields=missing_fields,
            low_confidence_fields=low_confidence_fields,
            field_coverages=field_coverages,
        )

        result = CoverageResult(
            coverage_score=round(coverage_score, 2),
            evidence_backed_ratio=round(evidence_backed_ratio, 3),
            field_coverages=field_coverages,
            missing_fields=missing_fields,
            low_confidence_fields=low_confidence_fields,
            gap_fill_candidates=gap_fill_candidates,
            critical_coverage=round(critical_coverage, 2),
            important_coverage=round(important_coverage, 2),
            optional_coverage=round(optional_coverage, 2),
        )

        logger.info(
            f"[CoverageCalculator] Score: {result.coverage_score:.1f}%, "
            f"Missing: {len(missing_fields)}, "
            f"LowConf: {len(low_confidence_fields)}, "
            f"GapFill candidates: {len(gap_fill_candidates)}"
        )

        return result

    def _has_meaningful_value(self, value: Any) -> bool:
        """의미 있는 값인지 확인"""
        if value is None:
            return False
        if isinstance(value, str) and len(value.strip()) == 0:
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        if isinstance(value, dict) and len(value) == 0:
            return False
        return True

    def _determine_missing_reason(
        self,
        field_name: str,
        value: Any,
        evidence: Any,
        original_text: str,
    ) -> MissingReason:
        """
        필드 누락 사유 결정

        Args:
            field_name: 필드명
            value: 필드 값 (None 또는 빈 값)
            evidence: 증거 정보
            original_text: 원문 텍스트

        Returns:
            MissingReason
        """
        # 원문에서 관련 키워드 검색
        keywords = self.FIELD_KEYWORDS.get(field_name, [])
        text_lower = original_text.lower()

        found_in_source = any(
            kw.lower() in text_lower or kw in original_text
            for kw in keywords
        )

        # 전화번호 패턴 검색 (특수 케이스)
        if field_name == "phone":
            phone_pattern = r'01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}'
            if re.search(phone_pattern, original_text):
                found_in_source = True

        # 이메일 패턴 검색 (특수 케이스)
        if field_name == "email":
            email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
            if re.search(email_pattern, original_text):
                found_in_source = True

        # 사유 결정
        if not found_in_source:
            return MissingReason.NOT_FOUND_IN_SOURCE

        if evidence is not None:
            # 증거는 있지만 값이 없음 → LLM 추출 실패
            return MissingReason.LLM_EXTRACTION_FAILED

        # 키워드는 있지만 증거도 없음 → 파서 오류
        return MissingReason.PARSER_ERROR

    def _prioritize_gap_fill(
        self,
        missing_fields: List[str],
        low_confidence_fields: List[str],
        field_coverages: Dict[str, FieldCoverage],
    ) -> List[str]:
        """
        GapFiller 대상 필드 우선순위 결정

        Args:
            missing_fields: 빈 필드 목록
            low_confidence_fields: 낮은 신뢰도 필드 목록
            field_coverages: 필드별 커버리지 정보

        Returns:
            우선순위 정렬된 GapFiller 대상 필드 목록
        """
        candidates = set(missing_fields) | set(low_confidence_fields)

        # 우선순위 순서대로 필터링
        prioritized = []
        for field in GAP_FILL_PRIORITY_ORDER:
            if field in candidates:
                prioritized.append(field)
                if len(prioritized) >= GAP_FILL_MAX_FIELDS:
                    break

        # 나머지 CRITICAL 필드 추가
        for field in candidates - set(prioritized):
            coverage = field_coverages.get(field)
            if coverage and coverage.priority == FieldPriority.CRITICAL:
                prioritized.append(field)
                if len(prioritized) >= GAP_FILL_MAX_FIELDS:
                    break

        return prioritized[:GAP_FILL_MAX_FIELDS]

    def get_field_report(self, result: CoverageResult) -> str:
        """필드별 상세 리포트 생성 (디버깅용)"""
        lines = [
            f"Coverage Report: {result.coverage_score:.1f}%",
            f"Evidence-backed ratio: {result.evidence_backed_ratio:.1%}",
            "",
            "Priority breakdown:",
            f"  Critical: {result.critical_coverage:.1f}%",
            f"  Important: {result.important_coverage:.1f}%",
            f"  Optional: {result.optional_coverage:.1f}%",
            "",
            "Field details:",
        ]

        for field_name, coverage in result.field_coverages.items():
            status = "✓" if coverage.has_value else "✗"
            conf = f"[{coverage.confidence:.2f}]" if coverage.has_value else ""
            reason = f"({coverage.missing_reason.value})" if coverage.missing_reason else ""
            lines.append(
                f"  {status} {field_name}: {coverage.priority.value} "
                f"({coverage.weight:.0%}) {conf} {reason}"
            )

        if result.gap_fill_candidates:
            lines.append("")
            lines.append(f"GapFill candidates: {', '.join(result.gap_fill_candidates)}")

        return "\n".join(lines)
