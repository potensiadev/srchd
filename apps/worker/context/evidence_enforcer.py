"""
Evidence Enforcer - Evidence Span 강제 검증

모든 추출 필드에 원문 근거(evidence)가 포함되어 있는지 검증합니다.
- Evidence 누락 경고
- Evidence가 원문에 없으면 신뢰도 감소
- Critical 필드 전체 누락 시 재시도 요청
"""

import logging
import re
from typing import Dict, Any, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


@dataclass
class EvidenceCheck:
    """
    단일 필드의 evidence 검증 결과
    """
    field_name: str
    value: Any
    evidence_span: str
    is_present: bool  # evidence가 제공되었는지
    is_valid: bool  # evidence가 원문에 실제로 있는지
    similarity_score: float = 0.0  # 원문과의 유사도
    confidence_penalty: float = 0.0  # 신뢰도 페널티

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "value": self.value,
            "evidence_span": self.evidence_span,
            "is_present": self.is_present,
            "is_valid": self.is_valid,
            "similarity_score": self.similarity_score,
            "confidence_penalty": self.confidence_penalty
        }


@dataclass
class EvidenceEnforcerResult:
    """
    Evidence Enforcer 전체 결과
    """
    total_fields: int = 0
    evidence_present_count: int = 0
    evidence_valid_count: int = 0
    evidence_backed_ratio: float = 0.0
    critical_missing: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    needs_retry: bool = False
    checks: Dict[str, EvidenceCheck] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_fields": self.total_fields,
            "evidence_present_count": self.evidence_present_count,
            "evidence_valid_count": self.evidence_valid_count,
            "evidence_backed_ratio": self.evidence_backed_ratio,
            "critical_missing": self.critical_missing,
            "warnings": self.warnings,
            "needs_retry": self.needs_retry,
            "checks": {k: v.to_dict() for k, v in self.checks.items()}
        }


class EvidenceEnforcer:
    """
    Evidence Span 강제 검증기

    모든 추출 필드에 원문 근거가 포함되어 있는지 검증합니다.
    """

    # Critical 필드 (evidence 필수)
    CRITICAL_FIELDS: Set[str] = {
        "name",
        "current_company",
        "current_position",
        "exp_years",
    }

    # Important 필드 (evidence 권장)
    IMPORTANT_FIELDS: Set[str] = {
        "careers[].company",
        "careers[].start_date",
        "careers[].end_date",
        "careers[].position",
        "educations[].school",
        "educations[].degree",
        "skills",  # 상위 5개
    }

    # Evidence 누락 시 신뢰도 페널티
    MISSING_EVIDENCE_PENALTY = 0.2
    INVALID_EVIDENCE_PENALTY = 0.5

    # Evidence 유효성 판단 임계값
    SIMILARITY_THRESHOLD = 0.6

    def __init__(self, source_text: str = ""):
        """
        Args:
            source_text: 원본 이력서 텍스트 (evidence 검증용)
        """
        self.source_text = source_text
        self.normalized_source = self._normalize_text(source_text)

    def set_source_text(self, source_text: str) -> None:
        """원본 텍스트 설정"""
        self.source_text = source_text
        self.normalized_source = self._normalize_text(source_text)

    def check_evidence(
        self,
        field_name: str,
        value: Any,
        evidence_span: Optional[str] = None
    ) -> EvidenceCheck:
        """
        단일 필드의 evidence 검증

        Args:
            field_name: 필드명
            value: 추출된 값
            evidence_span: 원문 발췌

        Returns:
            EvidenceCheck 결과
        """
        check = EvidenceCheck(
            field_name=field_name,
            value=value,
            evidence_span=evidence_span or "",
            is_present=bool(evidence_span),
            is_valid=False,
            similarity_score=0.0,
            confidence_penalty=0.0
        )

        if not evidence_span:
            # Evidence 없음
            if field_name in self.CRITICAL_FIELDS:
                check.confidence_penalty = self.MISSING_EVIDENCE_PENALTY
            return check

        # Evidence 유효성 검증
        if self.source_text:
            similarity = self._check_in_source(evidence_span)
            check.similarity_score = similarity
            check.is_valid = similarity >= self.SIMILARITY_THRESHOLD

            if not check.is_valid:
                # Evidence가 원문에 없음
                check.confidence_penalty = self.INVALID_EVIDENCE_PENALTY
                logger.warning(
                    f"[EvidenceEnforcer] {field_name}: evidence가 원문에서 발견되지 않음 "
                    f"(similarity={similarity:.2f})"
                )
        else:
            # 원문이 없으면 evidence 유효성 검증 불가, 일단 유효하다고 가정
            check.is_valid = True

        return check

    def enforce(
        self,
        extracted_data: Dict[str, Any],
        evidence_map: Optional[Dict[str, str]] = None
    ) -> EvidenceEnforcerResult:
        """
        전체 추출 결과에 대한 evidence 강제 검증

        Args:
            extracted_data: 추출된 데이터 (필드 → 값)
            evidence_map: 필드 → evidence 매핑 (선택)

        Returns:
            EvidenceEnforcerResult
        """
        evidence_map = evidence_map or {}
        result = EvidenceEnforcerResult()

        # 기본 필드 검증
        basic_fields = self._get_basic_fields(extracted_data)
        for field_name, value in basic_fields.items():
            if value is None:
                continue

            evidence = evidence_map.get(field_name) or self._extract_evidence_from_data(
                extracted_data, field_name
            )
            check = self.check_evidence(field_name, value, evidence)
            result.checks[field_name] = check
            result.total_fields += 1

            if check.is_present:
                result.evidence_present_count += 1
                if check.is_valid:
                    result.evidence_valid_count += 1

            if field_name in self.CRITICAL_FIELDS and not check.is_present:
                result.critical_missing.append(field_name)

        # careers 배열 검증
        careers = extracted_data.get("careers", [])
        self._check_careers_evidence(careers, result)

        # educations 배열 검증
        educations = extracted_data.get("educations", [])
        self._check_educations_evidence(educations, result)

        # 결과 집계
        if result.total_fields > 0:
            result.evidence_backed_ratio = result.evidence_valid_count / result.total_fields
        else:
            result.evidence_backed_ratio = 0.0

        # 재시도 필요 여부 판단
        if len(result.critical_missing) > 0:
            result.needs_retry = True
            result.warnings.append(
                f"Critical 필드에 evidence 누락: {result.critical_missing}"
            )

        logger.info(
            f"[EvidenceEnforcer] 검증 완료: "
            f"total={result.total_fields}, "
            f"present={result.evidence_present_count}, "
            f"valid={result.evidence_valid_count}, "
            f"ratio={result.evidence_backed_ratio:.2f}"
        )

        return result

    def _get_basic_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """기본 필드만 추출 (배열 제외)"""
        basic_fields = {}
        for key, value in data.items():
            if key in ["careers", "educations", "projects", "skills"]:
                continue
            if not key.endswith("_evidence"):
                basic_fields[key] = value
        return basic_fields

    def _extract_evidence_from_data(
        self,
        data: Dict[str, Any],
        field_name: str
    ) -> Optional[str]:
        """데이터에서 evidence 필드 추출"""
        evidence_key = f"{field_name}_evidence"
        return data.get(evidence_key)

    def _check_careers_evidence(
        self,
        careers: List[Dict[str, Any]],
        result: EvidenceEnforcerResult
    ) -> None:
        """경력 목록의 evidence 검증"""
        career_fields = ["company", "position", "start_date", "end_date"]

        for i, career in enumerate(careers):
            for field in career_fields:
                if field not in career or career[field] is None:
                    continue

                evidence_key = f"{field}_evidence"
                evidence = career.get(evidence_key)

                field_path = f"careers[{i}].{field}"
                check = self.check_evidence(field_path, career[field], evidence)
                result.checks[field_path] = check
                result.total_fields += 1

                if check.is_present:
                    result.evidence_present_count += 1
                    if check.is_valid:
                        result.evidence_valid_count += 1

    def _check_educations_evidence(
        self,
        educations: List[Dict[str, Any]],
        result: EvidenceEnforcerResult
    ) -> None:
        """학력 목록의 evidence 검증"""
        edu_fields = ["school", "degree", "major", "graduation_year"]

        for i, edu in enumerate(educations):
            for field in edu_fields:
                if field not in edu or edu[field] is None:
                    continue

                evidence_key = f"{field}_evidence"
                evidence = edu.get(evidence_key)

                field_path = f"educations[{i}].{field}"
                check = self.check_evidence(field_path, edu[field], evidence)
                result.checks[field_path] = check
                result.total_fields += 1

                if check.is_present:
                    result.evidence_present_count += 1
                    if check.is_valid:
                        result.evidence_valid_count += 1

    def _check_in_source(self, evidence_span: str) -> float:
        """
        Evidence가 원문에 있는지 확인

        Returns:
            유사도 점수 (0.0 ~ 1.0)
        """
        if not evidence_span or not self.source_text:
            return 0.0

        normalized_evidence = self._normalize_text(evidence_span)

        # 정확히 포함되어 있는지 확인
        if normalized_evidence in self.normalized_source:
            return 1.0

        # 부분 일치 확인 (fuzzy matching)
        best_similarity = 0.0

        # 윈도우 슬라이딩으로 가장 유사한 부분 찾기
        evidence_len = len(normalized_evidence)
        if evidence_len > 0:
            for i in range(len(self.normalized_source) - evidence_len + 1):
                window = self.normalized_source[i:i + evidence_len]
                similarity = SequenceMatcher(None, normalized_evidence, window).ratio()
                best_similarity = max(best_similarity, similarity)

                # 충분히 유사하면 조기 종료
                if best_similarity >= self.SIMILARITY_THRESHOLD:
                    break

        return best_similarity

    def _normalize_text(self, text: str) -> str:
        """텍스트 정규화 (비교용)"""
        if not text:
            return ""

        # 소문자 변환
        text = text.lower()

        # 공백 정규화
        text = re.sub(r"\s+", " ", text).strip()

        # 특수문자 제거 (일부)
        text = re.sub(r"[^\w\s가-힣]", "", text)

        return text

    def apply_penalties(
        self,
        confidence_map: Dict[str, float],
        enforcer_result: EvidenceEnforcerResult
    ) -> Dict[str, float]:
        """
        Evidence 검증 결과에 따라 신뢰도 페널티 적용

        Args:
            confidence_map: 필드 → 신뢰도 매핑
            enforcer_result: enforce() 결과

        Returns:
            페널티 적용된 신뢰도 맵
        """
        adjusted = confidence_map.copy()

        for field_name, check in enforcer_result.checks.items():
            if field_name in adjusted and check.confidence_penalty > 0:
                original = adjusted[field_name]
                adjusted[field_name] = max(0.1, original - check.confidence_penalty)
                logger.debug(
                    f"[EvidenceEnforcer] {field_name} 신뢰도 조정: "
                    f"{original:.2f} → {adjusted[field_name]:.2f}"
                )

        return adjusted

    def get_fields_needing_evidence(
        self,
        extracted_data: Dict[str, Any]
    ) -> List[str]:
        """
        Evidence가 필요한 필드 목록 반환 (재시도용)
        """
        missing = []

        # Critical 필드 확인
        for field in self.CRITICAL_FIELDS:
            if field in extracted_data and extracted_data[field] is not None:
                evidence_key = f"{field}_evidence"
                if evidence_key not in extracted_data:
                    missing.append(field)

        return missing


def create_evidence_enforcer(source_text: str = "") -> EvidenceEnforcer:
    """새 EvidenceEnforcer 인스턴스 생성"""
    return EvidenceEnforcer(source_text)
