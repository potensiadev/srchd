"""
Feature Flags - 새 파이프라인 활성화/비활성화

환경 변수 또는 설정을 통해 새 파이프라인을 점진적으로 롤아웃할 수 있습니다.
"""

import os
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FeatureFlags:
    """
    Feature Flags 설정

    환경 변수로 제어:
    - USE_NEW_PIPELINE: 새 PipelineContext 기반 파이프라인 사용
    - USE_LLM_VALIDATION: ValidationAgent에 LLM 기반 검증 사용
    - USE_AGENT_MESSAGING: 에이전트 간 메시지 버스 사용
    - USE_HALLUCINATION_DETECTION: 환각 탐지 기능 사용
    - USE_EVIDENCE_TRACKING: 증거 추적 기능 사용
    """

    # 메인 플래그: 새 파이프라인 사용 여부
    use_new_pipeline: bool = False

    # 세부 기능 플래그
    use_llm_validation: bool = False
    use_agent_messaging: bool = False
    use_hallucination_detection: bool = True
    use_evidence_tracking: bool = True

    # 롤아웃 비율 (0.0 ~ 1.0)
    # 특정 비율의 요청만 새 파이프라인으로 처리
    new_pipeline_rollout_percentage: float = 0.0

    # 특정 사용자만 새 파이프라인 사용
    new_pipeline_user_ids: list = None

    # 디버그 모드 (상세 로깅)
    debug_pipeline: bool = False

    def __post_init__(self):
        if self.new_pipeline_user_ids is None:
            self.new_pipeline_user_ids = []

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        """환경 변수에서 Feature Flags 로드"""
        def parse_bool(key: str, default: bool = False) -> bool:
            value = os.environ.get(key, "").lower()
            if value in ("true", "1", "yes", "on"):
                return True
            elif value in ("false", "0", "no", "off"):
                return False
            return default

        def parse_float(key: str, default: float = 0.0) -> float:
            try:
                return float(os.environ.get(key, default))
            except ValueError:
                return default

        def parse_list(key: str) -> list:
            value = os.environ.get(key, "")
            if not value:
                return []
            return [item.strip() for item in value.split(",") if item.strip()]

        return cls(
            use_new_pipeline=parse_bool("USE_NEW_PIPELINE", False),
            use_llm_validation=parse_bool("USE_LLM_VALIDATION", False),
            use_agent_messaging=parse_bool("USE_AGENT_MESSAGING", False),
            use_hallucination_detection=parse_bool("USE_HALLUCINATION_DETECTION", True),
            use_evidence_tracking=parse_bool("USE_EVIDENCE_TRACKING", True),
            new_pipeline_rollout_percentage=parse_float("NEW_PIPELINE_ROLLOUT_PERCENTAGE", 0.0),
            new_pipeline_user_ids=parse_list("NEW_PIPELINE_USER_IDS"),
            debug_pipeline=parse_bool("DEBUG_PIPELINE", False),
        )

    def should_use_new_pipeline(self, user_id: str = None, job_id: str = None) -> bool:
        """
        새 파이프라인 사용 여부 결정

        Args:
            user_id: 사용자 ID (특정 사용자 대상 롤아웃용)
            job_id: 작업 ID (롤아웃 비율 계산용)

        Returns:
            True if new pipeline should be used
        """
        # 메인 플래그가 꺼져있으면 항상 구 파이프라인
        if not self.use_new_pipeline:
            return False

        # 특정 사용자 대상 롤아웃
        if user_id and self.new_pipeline_user_ids:
            if user_id in self.new_pipeline_user_ids:
                logger.info(f"[FeatureFlags] User {user_id} is in new pipeline whitelist")
                return True

        # 롤아웃 비율 기반 결정
        if self.new_pipeline_rollout_percentage > 0 and job_id:
            # job_id 해시를 사용하여 일관된 결정
            import hashlib
            hash_value = int(hashlib.md5(job_id.encode()).hexdigest(), 16)
            threshold = int(self.new_pipeline_rollout_percentage * 100)

            if (hash_value % 100) < threshold:
                logger.info(f"[FeatureFlags] Job {job_id} selected for new pipeline (rollout {threshold}%)")
                return True

            return False

        # 100% 롤아웃
        if self.new_pipeline_rollout_percentage >= 1.0:
            return True

        # 기본값: 메인 플래그 따름
        return self.use_new_pipeline

    def log_status(self):
        """현재 Feature Flags 상태 로깅"""
        logger.info(f"[FeatureFlags] Status:")
        logger.info(f"  - use_new_pipeline: {self.use_new_pipeline}")
        logger.info(f"  - use_llm_validation: {self.use_llm_validation}")
        logger.info(f"  - use_agent_messaging: {self.use_agent_messaging}")
        logger.info(f"  - use_hallucination_detection: {self.use_hallucination_detection}")
        logger.info(f"  - use_evidence_tracking: {self.use_evidence_tracking}")
        logger.info(f"  - new_pipeline_rollout_percentage: {self.new_pipeline_rollout_percentage}")
        logger.info(f"  - new_pipeline_user_ids: {len(self.new_pipeline_user_ids)} users")
        logger.info(f"  - debug_pipeline: {self.debug_pipeline}")


# 싱글톤 인스턴스
_feature_flags: Optional[FeatureFlags] = None


def get_feature_flags() -> FeatureFlags:
    """Feature Flags 싱글톤 인스턴스 반환"""
    global _feature_flags
    if _feature_flags is None:
        _feature_flags = FeatureFlags.from_env()
        _feature_flags.log_status()
    return _feature_flags


def reload_feature_flags():
    """Feature Flags 강제 재로드"""
    global _feature_flags
    _feature_flags = FeatureFlags.from_env()
    _feature_flags.log_status()
    return _feature_flags
