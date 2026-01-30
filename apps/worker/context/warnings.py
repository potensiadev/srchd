"""
Warning Collector - 파이프라인 경고 수집

사용자에게 표시할 경고 메시지를 수집합니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class WarningCode(Enum):
    """경고 코드"""
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    PII_DETECTED = "PII_DETECTED"
    PARSING_ISSUE = "PARSING_ISSUE"
    LLM_DISAGREEMENT = "LLM_DISAGREEMENT"
    MISSING_REQUIRED = "MISSING_REQUIRED"
    HALLUCINATION_DETECTED = "HALLUCINATION_DETECTED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    TIMEOUT_WARNING = "TIMEOUT_WARNING"
    RETRY_OCCURRED = "RETRY_OCCURRED"
    DATA_INCOMPLETE = "DATA_INCOMPLETE"


@dataclass
class Warning:
    """
    파이프라인 경고

    사용자에게 표시할 경고 메시지입니다.
    """
    code: str  # WarningCode value
    message: str
    severity: str  # "info", "warning", "error"

    # 관련 정보
    field_name: Optional[str] = None
    stage_name: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)

    # 사용자 표시 여부
    user_visible: bool = True

    # 메타데이터
    warning_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.warning_id:
            self.warning_id = f"warn_{datetime.now().timestamp()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "warning_id": self.warning_id,
            "code": self.code,
            "message": self.message,
            "severity": self.severity,
            "field_name": self.field_name,
            "stage_name": self.stage_name,
            "details": self.details,
            "user_visible": self.user_visible,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

    def to_user_message(self) -> str:
        """사용자용 메시지 반환"""
        if self.field_name:
            return f"{self.message} (필드: {self.field_name})"
        return self.message


class WarningCollector:
    """
    경고 수집기

    파이프라인 실행 중 발생한 경고를 수집합니다.
    """

    # 경고 코드별 기본 메시지
    DEFAULT_MESSAGES = {
        WarningCode.LOW_CONFIDENCE.value: "신뢰도가 낮습니다",
        WarningCode.PII_DETECTED.value: "개인정보가 감지되었습니다",
        WarningCode.PARSING_ISSUE.value: "파싱 중 문제가 발생했습니다",
        WarningCode.LLM_DISAGREEMENT.value: "AI 모델 간 의견 차이가 있습니다",
        WarningCode.MISSING_REQUIRED.value: "필수 정보가 누락되었습니다",
        WarningCode.HALLUCINATION_DETECTED.value: "정보 검증에 실패했습니다",
        WarningCode.VALIDATION_FAILED.value: "데이터 검증에 실패했습니다",
        WarningCode.TIMEOUT_WARNING.value: "처리 시간이 길어지고 있습니다",
        WarningCode.RETRY_OCCURRED.value: "재시도가 발생했습니다",
        WarningCode.DATA_INCOMPLETE.value: "일부 데이터가 불완전합니다"
    }

    def __init__(self):
        self.warnings: List[Warning] = []

    def add(
        self,
        code: str,
        message: str = None,
        severity: str = "warning",
        field_name: str = None,
        stage_name: str = None,
        user_visible: bool = True,
        **details
    ) -> Warning:
        """
        경고 추가

        Args:
            code: 경고 코드 (WarningCode enum 값)
            message: 경고 메시지 (없으면 기본 메시지 사용)
            severity: 심각도 ("info", "warning", "error")
            field_name: 관련 필드명
            stage_name: 관련 스테이지명
            user_visible: 사용자에게 표시 여부
            **details: 추가 세부정보
        """
        warning = Warning(
            code=code,
            message=message or self.DEFAULT_MESSAGES.get(code, code),
            severity=severity,
            field_name=field_name,
            stage_name=stage_name,
            details=details,
            user_visible=user_visible
        )
        self.warnings.append(warning)

        # 로깅
        if severity == "error":
            logger.error(f"[WarningCollector] {code}: {warning.message}")
        elif severity == "warning":
            logger.warning(f"[WarningCollector] {code}: {warning.message}")
        else:
            logger.info(f"[WarningCollector] {code}: {warning.message}")

        return warning

    def add_low_confidence(self, field_name: str, confidence: float, threshold: float = 0.6):
        """낮은 신뢰도 경고 추가"""
        return self.add(
            WarningCode.LOW_CONFIDENCE.value,
            f"'{field_name}' 필드의 신뢰도가 낮습니다 ({int(confidence * 100)}%)",
            severity="warning",
            field_name=field_name,
            confidence=confidence,
            threshold=threshold
        )

    def add_missing_required(self, field_name: str):
        """필수 필드 누락 경고 추가"""
        return self.add(
            WarningCode.MISSING_REQUIRED.value,
            f"필수 정보 '{field_name}'이(가) 누락되었습니다",
            severity="error",
            field_name=field_name
        )

    def add_hallucination(self, field_name: str, value: Any = None):
        """환각 탐지 경고 추가"""
        return self.add(
            WarningCode.HALLUCINATION_DETECTED.value,
            f"'{field_name}' 필드의 값이 원본에서 확인되지 않습니다",
            severity="warning",
            field_name=field_name,
            value=value
        )

    def add_llm_disagreement(self, field_name: str, providers: List[str] = None):
        """LLM 의견 불일치 경고 추가"""
        return self.add(
            WarningCode.LLM_DISAGREEMENT.value,
            f"'{field_name}' 필드에서 AI 모델 간 의견 차이가 발생했습니다",
            severity="info",
            field_name=field_name,
            providers=providers
        )

    def add_parsing_issue(self, issue: str, stage_name: str = "parsing"):
        """파싱 이슈 경고 추가"""
        return self.add(
            WarningCode.PARSING_ISSUE.value,
            f"파싱 중 문제 발생: {issue}",
            severity="warning",
            stage_name=stage_name
        )

    def get_all(self) -> List[Warning]:
        """모든 경고 조회"""
        return self.warnings

    def get_user_visible(self) -> List[Warning]:
        """사용자에게 표시할 경고만 조회"""
        return [w for w in self.warnings if w.user_visible]

    def get_by_severity(self, severity: str) -> List[Warning]:
        """심각도별 경고 조회"""
        return [w for w in self.warnings if w.severity == severity]

    def get_by_field(self, field_name: str) -> List[Warning]:
        """필드별 경고 조회"""
        return [w for w in self.warnings if w.field_name == field_name]

    def get_by_code(self, code: str) -> List[Warning]:
        """코드별 경고 조회"""
        return [w for w in self.warnings if w.code == code]

    def has_errors(self) -> bool:
        """에러 수준 경고 존재 여부"""
        return any(w.severity == "error" for w in self.warnings)

    def get_error_count(self) -> int:
        """에러 수 조회"""
        return len(self.get_by_severity("error"))

    def get_warning_count(self) -> int:
        """경고 수 조회"""
        return len(self.get_by_severity("warning"))

    def get_summary(self) -> Dict[str, Any]:
        """경고 요약"""
        by_severity = {"info": 0, "warning": 0, "error": 0}
        by_code = {}

        for w in self.warnings:
            by_severity[w.severity] = by_severity.get(w.severity, 0) + 1
            by_code[w.code] = by_code.get(w.code, 0) + 1

        return {
            "total": len(self.warnings),
            "user_visible": len(self.get_user_visible()),
            "by_severity": by_severity,
            "by_code": by_code,
            "has_errors": self.has_errors()
        }

    def clear(self):
        """모든 경고 삭제"""
        self.warnings = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "warnings": [w.to_dict() for w in self.warnings],
            "summary": self.get_summary()
        }

    def to_user_messages(self) -> List[str]:
        """사용자용 메시지 목록 반환"""
        return [w.to_user_message() for w in self.get_user_visible()]
