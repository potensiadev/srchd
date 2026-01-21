"""
Test Queue Routing - Fast/Slow Queue 라우팅 테스트

HWP/HWPX → slow_queue
PDF/DOCX → fast_queue
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import MagicMock, patch

# Patch tasks module before importing queue_service
sys.modules['tasks'] = MagicMock()

from services.queue_service import QueueService, JobType


class TestQueueRouting:
    """Queue 라우팅 테스트"""

    @pytest.fixture
    def mock_queue_service(self):
        """Mock QueueService 생성"""
        with patch.object(QueueService, '_init_redis'):
            service = QueueService()
            service.redis = MagicMock()
            service.redis.ping.return_value = True
            service.fast_queue = MagicMock()
            service.slow_queue = MagicMock()
            service.process_queue = MagicMock()
            
            # Mock enqueue 반환값 설정
            mock_job = MagicMock()
            mock_job.id = "test-job-id"
            service.fast_queue.enqueue.return_value = mock_job
            service.slow_queue.enqueue.return_value = mock_job
            
            yield service

    def test_hwp_routes_to_slow_queue(self, mock_queue_service):
        """HWP 파일이 slow_queue로 라우팅되는지 검증"""
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.hwp",
            file_name="이력서.hwp",
            file_type="hwp",
            mode="phase_1"
        )
        
        assert result is not None
        assert result.type == JobType.SLOW_PIPELINE
        mock_queue_service.slow_queue.enqueue.assert_called_once()
        mock_queue_service.fast_queue.enqueue.assert_not_called()

    def test_hwpx_routes_to_slow_queue(self, mock_queue_service):
        """HWPX 파일이 slow_queue로 라우팅되는지 검증"""
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.hwpx",
            file_name="이력서.hwpx",
            file_type="hwpx",
            mode="phase_1"
        )
        
        assert result is not None
        assert result.type == JobType.SLOW_PIPELINE

    def test_pdf_routes_to_fast_queue(self, mock_queue_service):
        """PDF 파일이 fast_queue로 라우팅되는지 검증"""
        # Reset mock call counts
        mock_queue_service.fast_queue.enqueue.reset_mock()
        mock_queue_service.slow_queue.enqueue.reset_mock()
        
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.pdf",
            file_name="resume.pdf",
            file_type="pdf",
            mode="phase_1"
        )
        
        assert result is not None
        assert result.type == JobType.FAST_PIPELINE
        mock_queue_service.fast_queue.enqueue.assert_called_once()
        mock_queue_service.slow_queue.enqueue.assert_not_called()

    def test_docx_routes_to_fast_queue(self, mock_queue_service):
        """DOCX 파일이 fast_queue로 라우팅되는지 검증"""
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.docx",
            file_name="resume.docx",
            file_type="docx",
            mode="phase_1"
        )
        
        assert result is not None
        assert result.type == JobType.FAST_PIPELINE

    def test_file_type_case_insensitive(self, mock_queue_service):
        """파일 타입 대소문자 무시 테스트"""
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.HWP",
            file_name="이력서.HWP",
            file_type="HWP",  # 대문자
            mode="phase_1"
        )
        
        assert result is not None
        assert result.type == JobType.SLOW_PIPELINE

    def test_queue_unavailable_returns_none(self, mock_queue_service):
        """Redis 연결 없을 때 None 반환"""
        mock_queue_service.redis = None
        
        result = mock_queue_service.enqueue_by_file_type(
            job_id="job-123",
            user_id="user-456",
            file_path="resumes/user-456/test.pdf",
            file_name="resume.pdf",
            file_type="pdf"
        )
        
        assert result is None


class TestJobTypeEnum:
    """JobType Enum 테스트"""

    def test_fast_pipeline_exists(self):
        """FAST_PIPELINE JobType 존재 확인"""
        assert hasattr(JobType, 'FAST_PIPELINE')
        assert JobType.FAST_PIPELINE.value == "fast_pipeline"

    def test_slow_pipeline_exists(self):
        """SLOW_PIPELINE JobType 존재 확인"""
        assert hasattr(JobType, 'SLOW_PIPELINE')
        assert JobType.SLOW_PIPELINE.value == "slow_pipeline"
