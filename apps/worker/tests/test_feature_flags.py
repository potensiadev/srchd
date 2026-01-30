"""
Feature Flags 단위 테스트
"""

import os
import pytest
from unittest.mock import patch, MagicMock

# Import directly from the feature_flags module to avoid dependency chain
from orchestrator.feature_flags import (
    FeatureFlags,
    get_feature_flags,
    reload_feature_flags,
)


class TestFeatureFlags:
    """FeatureFlags 테스트"""

    def test_default_values(self):
        """기본값 테스트"""
        flags = FeatureFlags()

        assert flags.use_new_pipeline is False
        assert flags.use_llm_validation is False
        assert flags.use_agent_messaging is False
        assert flags.use_hallucination_detection is True
        assert flags.use_evidence_tracking is True
        assert flags.new_pipeline_rollout_percentage == 0.0
        assert flags.new_pipeline_user_ids == []
        assert flags.debug_pipeline is False

    def test_from_env_all_enabled(self):
        """환경 변수에서 모든 플래그 활성화"""
        with patch.dict(os.environ, {
            "USE_NEW_PIPELINE": "true",
            "USE_LLM_VALIDATION": "1",
            "USE_AGENT_MESSAGING": "yes",
            "USE_HALLUCINATION_DETECTION": "on",
            "USE_EVIDENCE_TRACKING": "TRUE",
            "NEW_PIPELINE_ROLLOUT_PERCENTAGE": "0.5",
            "NEW_PIPELINE_USER_IDS": "user1,user2,user3",
            "DEBUG_PIPELINE": "true",
        }):
            flags = FeatureFlags.from_env()

            assert flags.use_new_pipeline is True
            assert flags.use_llm_validation is True
            assert flags.use_agent_messaging is True
            assert flags.use_hallucination_detection is True
            assert flags.use_evidence_tracking is True
            assert flags.new_pipeline_rollout_percentage == 0.5
            assert flags.new_pipeline_user_ids == ["user1", "user2", "user3"]
            assert flags.debug_pipeline is True

    def test_from_env_all_disabled(self):
        """환경 변수에서 모든 플래그 비활성화"""
        with patch.dict(os.environ, {
            "USE_NEW_PIPELINE": "false",
            "USE_LLM_VALIDATION": "0",
            "USE_AGENT_MESSAGING": "no",
            "USE_HALLUCINATION_DETECTION": "off",
            "USE_EVIDENCE_TRACKING": "FALSE",
            "NEW_PIPELINE_ROLLOUT_PERCENTAGE": "0",
            "DEBUG_PIPELINE": "false",
        }, clear=True):
            flags = FeatureFlags.from_env()

            assert flags.use_new_pipeline is False
            assert flags.use_llm_validation is False
            assert flags.use_agent_messaging is False
            assert flags.use_hallucination_detection is False
            assert flags.use_evidence_tracking is False

    def test_should_use_new_pipeline_disabled(self):
        """메인 플래그 비활성화 시"""
        flags = FeatureFlags(use_new_pipeline=False)

        # 항상 False
        assert flags.should_use_new_pipeline() is False
        assert flags.should_use_new_pipeline(user_id="user1") is False
        assert flags.should_use_new_pipeline(job_id="job1") is False

    def test_should_use_new_pipeline_user_whitelist(self):
        """사용자 화이트리스트 테스트"""
        flags = FeatureFlags(
            use_new_pipeline=True,
            new_pipeline_user_ids=["user1", "user2"],
            new_pipeline_rollout_percentage=0.0
        )

        # 화이트리스트에 있는 사용자
        assert flags.should_use_new_pipeline(user_id="user1") is True
        assert flags.should_use_new_pipeline(user_id="user2") is True

        # 화이트리스트에 없는 사용자
        assert flags.should_use_new_pipeline(user_id="user3") is True  # 메인 플래그 따름

    def test_should_use_new_pipeline_rollout_percentage(self):
        """롤아웃 비율 테스트"""
        flags = FeatureFlags(
            use_new_pipeline=True,
            new_pipeline_rollout_percentage=0.5  # 50%
        )

        # 같은 job_id는 항상 같은 결과 (해시 기반)
        result1 = flags.should_use_new_pipeline(job_id="test-job-123")
        result2 = flags.should_use_new_pipeline(job_id="test-job-123")
        assert result1 == result2

        # 충분히 많은 job_id로 테스트하면 약 50%가 True
        true_count = 0
        total = 1000
        for i in range(total):
            if flags.should_use_new_pipeline(job_id=f"job-{i}"):
                true_count += 1

        # 50% ± 10% 허용
        ratio = true_count / total
        assert 0.4 <= ratio <= 0.6, f"Expected ~50% but got {ratio*100:.1f}%"

    def test_should_use_new_pipeline_100_percent(self):
        """100% 롤아웃 테스트"""
        flags = FeatureFlags(
            use_new_pipeline=True,
            new_pipeline_rollout_percentage=1.0
        )

        # 항상 True
        for i in range(100):
            assert flags.should_use_new_pipeline(job_id=f"job-{i}") is True

    def test_log_status(self, caplog):
        """로그 출력 테스트"""
        import logging

        flags = FeatureFlags(
            use_new_pipeline=True,
            use_llm_validation=True
        )

        with caplog.at_level(logging.INFO):
            flags.log_status()

        assert "use_new_pipeline: True" in caplog.text
        assert "use_llm_validation: True" in caplog.text


class TestSingleton:
    """싱글톤 테스트"""

    def test_get_feature_flags_singleton(self):
        """싱글톤 인스턴스 반환"""
        # 싱글톤 초기화
        import orchestrator.feature_flags as ff
        ff._feature_flags = None

        with patch.dict(os.environ, {"USE_NEW_PIPELINE": "true"}):
            flags1 = get_feature_flags()
            flags2 = get_feature_flags()

            assert flags1 is flags2
            assert flags1.use_new_pipeline is True

    def test_reload_feature_flags(self):
        """강제 재로드 테스트"""
        import orchestrator.feature_flags as ff
        ff._feature_flags = None

        with patch.dict(os.environ, {"USE_NEW_PIPELINE": "false"}):
            flags1 = get_feature_flags()
            assert flags1.use_new_pipeline is False

        with patch.dict(os.environ, {"USE_NEW_PIPELINE": "true"}):
            flags2 = reload_feature_flags()
            assert flags2.use_new_pipeline is True

            # 싱글톤도 업데이트됨
            flags3 = get_feature_flags()
            assert flags3.use_new_pipeline is True


class TestEdgeCases:
    """엣지 케이스 테스트"""

    def test_invalid_percentage(self):
        """잘못된 비율 값"""
        with patch.dict(os.environ, {
            "NEW_PIPELINE_ROLLOUT_PERCENTAGE": "invalid"
        }):
            flags = FeatureFlags.from_env()
            assert flags.new_pipeline_rollout_percentage == 0.0

    def test_empty_user_list(self):
        """빈 사용자 목록"""
        with patch.dict(os.environ, {
            "NEW_PIPELINE_USER_IDS": ""
        }):
            flags = FeatureFlags.from_env()
            assert flags.new_pipeline_user_ids == []

    def test_whitespace_in_user_list(self):
        """사용자 목록에 공백"""
        with patch.dict(os.environ, {
            "NEW_PIPELINE_USER_IDS": " user1 , user2 , user3 "
        }):
            flags = FeatureFlags.from_env()
            assert flags.new_pipeline_user_ids == ["user1", "user2", "user3"]

    def test_negative_percentage(self):
        """음수 비율"""
        flags = FeatureFlags(
            use_new_pipeline=True,
            new_pipeline_rollout_percentage=-0.5
        )

        # 음수면 threshold가 음수가 되어 조건 불만족
        # 하지만 use_new_pipeline=True이므로 기본값으로 True 반환
        # (롤아웃 비율 조건은 0보다 클 때만 적용됨)
        assert flags.should_use_new_pipeline(job_id="test") is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
