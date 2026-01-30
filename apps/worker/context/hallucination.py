"""
Hallucination Detector - LLM 환각 탐지 및 기록

원본 텍스트와 대조하여 LLM의 환각을 탐지합니다.
"""

import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, TYPE_CHECKING
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from .layers import ParsedData, PIIStore

logger = logging.getLogger(__name__)


@dataclass
class HallucinationRecord:
    """
    환각 탐지 기록

    LLM이 생성한 환각(원본에 없는 정보)을 기록합니다.
    """
    field_name: str

    # 환각 내용
    hallucinated_value: Any
    correct_value: Optional[Any] = None

    # 탐지 정보
    detection_method: str = ""  # "regex_mismatch", "cross_llm", "text_verification"
    detector_agent: str = ""

    # 원본 대조
    original_text_snippet: str = ""
    text_contains_value: bool = False

    # LLM 정보
    llm_provider: str = ""
    llm_model: str = ""

    # 심각도
    severity: str = "medium"  # "low", "medium", "high", "critical"

    # 해결
    resolved: bool = False
    resolution: Optional[str] = None

    # 메타데이터
    record_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.record_id:
            self.record_id = f"halluc_{self.field_name}_{datetime.now().timestamp()}"

    def resolve(self, correct_value: Any, resolution: str = ""):
        """환각 해결"""
        self.correct_value = correct_value
        self.resolved = True
        self.resolution = resolution

    def to_dict(self) -> Dict[str, Any]:
        return {
            "record_id": self.record_id,
            "field_name": self.field_name,
            "hallucinated_value": self.hallucinated_value,
            "correct_value": self.correct_value,
            "detection_method": self.detection_method,
            "detector_agent": self.detector_agent,
            "text_contains_value": self.text_contains_value,
            "llm_provider": self.llm_provider,
            "severity": self.severity,
            "resolved": self.resolved,
            "resolution": self.resolution,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class HallucinationDetector:
    """
    환각 탐지기

    LLM 결과를 원본 텍스트와 대조하여 환각을 탐지합니다.
    """

    # 검증이 필요한 필드
    VERIFIABLE_FIELDS = [
        "exp_years",
        "current_company",
        "current_position",
        "skills",
        "name",
        "phone",
        "email"
    ]

    # 숫자 관련 필드
    NUMERIC_FIELDS = ["exp_years"]

    def __init__(self, parsed_data: "ParsedData" = None, pii_store: "PIIStore" = None):
        self.parsed_data = parsed_data
        self.pii_store = pii_store
        self.records: List[HallucinationRecord] = []

    def set_data(self, parsed_data: "ParsedData", pii_store: "PIIStore" = None):
        """데이터 설정"""
        self.parsed_data = parsed_data
        self.pii_store = pii_store

    def verify_against_text(
        self,
        field_name: str,
        value: Any,
        llm_provider: str = ""
    ) -> Optional[HallucinationRecord]:
        """
        원본 텍스트와 대조 검증

        값이 원본 텍스트에 존재하는지 확인합니다.
        """
        if not self.parsed_data or not self.parsed_data.raw_text:
            return None

        text = self.parsed_data.raw_text.lower()
        value_str = str(value).lower() if value else ""

        if not value_str:
            return None

        # 값이 원본에 존재하는지 확인
        text_contains = self._check_value_in_text(field_name, value, text)

        if not text_contains:
            record = HallucinationRecord(
                field_name=field_name,
                hallucinated_value=value,
                detection_method="text_verification",
                detector_agent="hallucination_detector",
                original_text_snippet=self.parsed_data.raw_text[:500],
                text_contains_value=False,
                llm_provider=llm_provider,
                severity=self._determine_severity(field_name)
            )
            self.records.append(record)
            logger.warning(f"[HallucinationDetector] 환각 탐지: {field_name} = {value} (원본에 없음)")
            return record

        return None

    def _check_value_in_text(self, field_name: str, value: Any, text: str) -> bool:
        """값이 텍스트에 존재하는지 확인"""
        value_str = str(value).lower()

        # 직접 포함 확인
        if value_str in text:
            return True

        # 숫자 필드의 경우 다양한 형식 체크
        if field_name in self.NUMERIC_FIELDS:
            try:
                num_value = float(value)
                patterns = [
                    str(int(num_value)),
                    f"{int(num_value)}년",
                    f"{int(num_value)}years",
                    f"{int(num_value)}년차",
                    f"{int(num_value)} 년",
                    f"{num_value}년",
                ]
                return any(p in text for p in patterns)
            except (ValueError, TypeError):
                pass

        # 스킬의 경우 대소문자 무관 확인
        if field_name == "skills" and isinstance(value, str):
            # 기술 스택은 대소문자 무관하게 확인
            return value_str in text or value.lower() in text

        # 회사명의 경우 부분 일치도 허용
        if field_name == "current_company" and isinstance(value, str):
            # 괄호, 주식회사 등 제거 후 확인
            clean_value = re.sub(r'[()주식회사(주)]', '', value_str).strip()
            return clean_value in text if clean_value else False

        return False

    def _determine_severity(self, field_name: str) -> str:
        """필드에 따른 심각도 결정"""
        if field_name in ["name", "phone", "email"]:
            return "critical"  # PII는 정확해야 함
        elif field_name in ["exp_years", "current_company"]:
            return "high"
        elif field_name in ["skills"]:
            return "medium"
        return "low"

    def cross_validate_llm_results(
        self,
        field_name: str,
        results: Dict[str, Any]  # {"gpt4": value1, "gemini": value2, "claude": value3}
    ) -> Optional[HallucinationRecord]:
        """
        다중 LLM 결과 교차 검증

        과반수와 다른 결과를 환각으로 표시합니다.
        """
        if len(results) < 2:
            return None

        # 값별 카운트
        from collections import Counter
        value_counts = Counter(str(v) for v in results.values() if v is not None)

        if not value_counts:
            return None

        most_common_str, count = value_counts.most_common(1)[0]

        # 만장일치면 OK
        if count == len(results):
            return None

        # 소수 의견을 환각으로 기록
        for provider, value in results.items():
            if str(value) != most_common_str:
                record = HallucinationRecord(
                    field_name=field_name,
                    hallucinated_value=value,
                    correct_value=most_common_str,
                    detection_method="cross_llm",
                    detector_agent="hallucination_detector",
                    llm_provider=provider,
                    severity="low" if count >= 2 else "medium",
                    resolved=True,
                    resolution=f"다수결({count}/{len(results)})로 {most_common_str} 선택"
                )
                self.records.append(record)
                logger.info(f"[HallucinationDetector] LLM 불일치: {field_name}, {provider}={value} vs majority={most_common_str}")
                return record

        return None

    def verify_pii_consistency(self) -> List[HallucinationRecord]:
        """
        PII 일관성 검증

        정규식으로 추출한 PII와 LLM 결과가 일치하는지 확인합니다.
        """
        records = []

        if not self.pii_store:
            return records

        # 이름 검증
        if self.pii_store.name:
            if not self._check_value_in_text("name", self.pii_store.name, self.parsed_data.raw_text.lower()):
                record = HallucinationRecord(
                    field_name="name",
                    hallucinated_value=self.pii_store.name,
                    detection_method="pii_verification",
                    detector_agent="hallucination_detector",
                    severity="critical"
                )
                self.records.append(record)
                records.append(record)

        return records

    def get_records(self, field_name: str = None) -> List[HallucinationRecord]:
        """환각 기록 조회"""
        if field_name:
            return [r for r in self.records if r.field_name == field_name]
        return self.records

    def get_unresolved_records(self) -> List[HallucinationRecord]:
        """해결되지 않은 환각 기록"""
        return [r for r in self.records if not r.resolved]

    def has_critical_hallucinations(self) -> bool:
        """심각한 환각이 있는지 확인"""
        return any(
            r.severity in ["critical", "high"] and not r.resolved
            for r in self.records
        )

    def get_summary(self) -> Dict[str, Any]:
        """환각 탐지 요약"""
        by_severity = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        by_field = {}

        for r in self.records:
            by_severity[r.severity] = by_severity.get(r.severity, 0) + 1
            by_field[r.field_name] = by_field.get(r.field_name, 0) + 1

        return {
            "total_records": len(self.records),
            "unresolved": len(self.get_unresolved_records()),
            "by_severity": by_severity,
            "by_field": by_field,
            "has_critical": self.has_critical_hallucinations()
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "records": [r.to_dict() for r in self.records],
            "summary": self.get_summary()
        }
