"""
Pipeline Orchestrator - 파이프라인 통합 관리

main.py와 tasks.py의 파이프라인 로직을 통합하고
PipelineContext를 사용하여 전체 파이프라인을 관리합니다.
"""

# Feature flags는 의존성이 없으므로 직접 import
from .feature_flags import FeatureFlags, get_feature_flags, reload_feature_flags

# 다른 모듈들은 lazy import로 순환 의존성 및 import 에러 방지
def get_pipeline_orchestrator():
    """PipelineOrchestrator 싱글톤 인스턴스 반환 (lazy import)"""
    from .pipeline_orchestrator import get_pipeline_orchestrator as _get
    return _get()

def get_analyst_wrapper():
    """AnalystAgentWrapper 싱글톤 인스턴스 반환 (lazy import)"""
    from .analyst_wrapper import get_analyst_wrapper as _get
    return _get()

def get_validation_wrapper():
    """ValidationAgentWrapper 싱글톤 인스턴스 반환 (lazy import)"""
    from .validation_wrapper import get_validation_wrapper as _get
    return _get()

def get_cross_validator():
    """CrossValidationEngine 싱글톤 인스턴스 반환 (lazy import)"""
    from .validation_wrapper import get_cross_validator as _get
    return _get()

__all__ = [
    # Feature Flags (직접 import)
    "FeatureFlags",
    "get_feature_flags",
    "reload_feature_flags",
    # Lazy imports
    "get_pipeline_orchestrator",
    "get_analyst_wrapper",
    "get_validation_wrapper",
    "get_cross_validator",
]
