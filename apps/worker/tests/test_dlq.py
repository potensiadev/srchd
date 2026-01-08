"""
Dead Letter Queue (DLQ) 테스트

DLQ 기능 테스트:
- DLQ 항목 추가/조회/삭제
- DLQ 재시도
- DLQ 통계
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import json

from services.queue_service import (
    QueueService,
    DLQEntry,
    JobType,
    QueuedJob,
    DLQ_KEY,
    DLQ_METADATA_PREFIX,
)


class TestDLQEntry:
    """DLQEntry 데이터클래스 테스트"""

    def test_create_dlq_entry(self):
        """DLQEntry 생성 테스트"""
        entry = DLQEntry(
            dlq_id="dlq-abc123",
            job_id="job-123",
            rq_job_id="rq-456",
            job_type="full_pipeline",
            user_id="user-789",
            error_message="Test error",
            error_type="INTERNAL_ERROR",
            retry_count=2,
            failed_at="2025-01-01T00:00:00Z",
            job_kwargs={"file_path": "/path/to/file"},
            last_traceback="Traceback...",
        )

        assert entry.dlq_id == "dlq-abc123"
        assert entry.job_id == "job-123"
        assert entry.job_type == "full_pipeline"
        assert entry.retry_count == 2

    def test_to_dict(self):
        """딕셔너리 변환 테스트"""
        entry = DLQEntry(
            dlq_id="dlq-test",
            job_id="job-test",
            rq_job_id="rq-test",
            job_type="parse",
            user_id="user-test",
            error_message="Error",
            error_type="TIMEOUT",
            retry_count=1,
            failed_at="2025-01-01T00:00:00Z",
            job_kwargs={},
        )

        result = entry.to_dict()

        assert isinstance(result, dict)
        assert result["dlq_id"] == "dlq-test"
        assert result["error_type"] == "TIMEOUT"

    def test_from_dict(self):
        """딕셔너리에서 생성 테스트"""
        data = {
            "dlq_id": "dlq-from-dict",
            "job_id": "job-from-dict",
            "rq_job_id": "rq-from-dict",
            "job_type": "process",
            "user_id": "user-from-dict",
            "error_message": "From dict error",
            "error_type": "CONNECTION_ERROR",
            "retry_count": 3,
            "failed_at": "2025-01-01T12:00:00Z",
            "job_kwargs": {"text": "resume text"},
            "last_traceback": None,
        }

        entry = DLQEntry.from_dict(data)

        assert entry.dlq_id == "dlq-from-dict"
        assert entry.error_type == "CONNECTION_ERROR"
        assert entry.retry_count == 3


class TestDLQMethods:
    """QueueService DLQ 메서드 테스트"""

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis 인스턴스"""
        return Mock()

    @pytest.fixture
    def queue_service(self, mock_redis):
        """DLQ 테스트용 QueueService"""
        service = QueueService.__new__(QueueService)
        service.redis = mock_redis
        service.parse_queue = None
        service.process_queue = None
        return service

    def test_add_to_dlq_success(self, queue_service, mock_redis):
        """DLQ 추가 성공 테스트"""
        mock_redis.hset = Mock()
        mock_redis.lpush = Mock()
        mock_redis.expire = Mock()

        dlq_id = queue_service.add_to_dlq(
            job_id="job-123",
            rq_job_id="rq-456",
            job_type="full_pipeline",
            user_id="user-789",
            error_message="Test error message",
            error_type="INTERNAL_ERROR",
            retry_count=2,
            job_kwargs={"file_path": "/path/to/file"},
            traceback="Traceback info",
        )

        assert dlq_id is not None
        assert dlq_id.startswith("dlq-")
        mock_redis.hset.assert_called_once()
        mock_redis.lpush.assert_called_once()
        mock_redis.expire.assert_called_once()

    def test_add_to_dlq_unavailable(self, mock_redis):
        """Redis 미연결 시 DLQ 추가 실패 테스트"""
        service = QueueService.__new__(QueueService)
        service.redis = None  # Redis 연결 없음

        result = service.add_to_dlq(
            job_id="job-123",
            rq_job_id="rq-456",
            job_type="parse",
            user_id="user-789",
            error_message="Error",
            error_type="INTERNAL_ERROR",
            retry_count=1,
            job_kwargs={},
        )

        assert result is None

    def test_get_dlq_entry_success(self, queue_service, mock_redis):
        """DLQ 항목 조회 성공 테스트"""
        entry_data = {
            "dlq_id": "dlq-test123",
            "job_id": "job-test",
            "rq_job_id": "rq-test",
            "job_type": "full_pipeline",
            "user_id": "user-test",
            "error_message": "Test error",
            "error_type": "TIMEOUT",
            "retry_count": 2,
            "failed_at": "2025-01-01T00:00:00Z",
            "job_kwargs": {},
            "last_traceback": None,
        }
        mock_redis.hget = Mock(return_value=json.dumps(entry_data))

        entry = queue_service.get_dlq_entry("dlq-test123")

        assert entry is not None
        assert entry.dlq_id == "dlq-test123"
        assert entry.error_type == "TIMEOUT"

    def test_get_dlq_entry_not_found(self, queue_service, mock_redis):
        """DLQ 항목 없음 테스트"""
        mock_redis.hget = Mock(return_value=None)

        entry = queue_service.get_dlq_entry("dlq-nonexistent")

        assert entry is None

    def test_get_dlq_count(self, queue_service, mock_redis):
        """DLQ 카운트 테스트"""
        mock_redis.llen = Mock(return_value=5)

        count = queue_service.get_dlq_count()

        assert count == 5
        mock_redis.llen.assert_called_once_with(DLQ_KEY)

    def test_remove_from_dlq_success(self, queue_service, mock_redis):
        """DLQ 삭제 성공 테스트"""
        mock_redis.lrem = Mock(return_value=1)
        mock_redis.delete = Mock()

        result = queue_service.remove_from_dlq("dlq-to-remove")

        assert result is True
        mock_redis.lrem.assert_called_once()
        mock_redis.delete.assert_called_once()

    def test_get_dlq_entries_with_filter(self, queue_service, mock_redis):
        """필터링된 DLQ 목록 조회 테스트"""
        # Mock DLQ ID 리스트
        mock_redis.lrange = Mock(return_value=[b"dlq-1", b"dlq-2", b"dlq-3"])

        # Mock 각 항목의 데이터
        entries_data = [
            {
                "dlq_id": "dlq-1",
                "job_id": "job-1",
                "rq_job_id": "rq-1",
                "job_type": "full_pipeline",
                "user_id": "user-A",
                "error_message": "Error 1",
                "error_type": "TIMEOUT",
                "retry_count": 1,
                "failed_at": "2025-01-01T00:00:00Z",
                "job_kwargs": {},
                "last_traceback": None,
            },
            {
                "dlq_id": "dlq-2",
                "job_id": "job-2",
                "rq_job_id": "rq-2",
                "job_type": "parse",
                "user_id": "user-B",
                "error_message": "Error 2",
                "error_type": "INTERNAL_ERROR",
                "retry_count": 2,
                "failed_at": "2025-01-01T01:00:00Z",
                "job_kwargs": {},
                "last_traceback": None,
            },
            {
                "dlq_id": "dlq-3",
                "job_id": "job-3",
                "rq_job_id": "rq-3",
                "job_type": "full_pipeline",
                "user_id": "user-A",
                "error_message": "Error 3",
                "error_type": "CONNECTION_ERROR",
                "retry_count": 3,
                "failed_at": "2025-01-01T02:00:00Z",
                "job_kwargs": {},
                "last_traceback": None,
            },
        ]

        def mock_hget(key, field):
            dlq_id = key.replace(DLQ_METADATA_PREFIX, "")
            for entry in entries_data:
                if entry["dlq_id"] == dlq_id:
                    return json.dumps(entry)
            return None

        mock_redis.hget = Mock(side_effect=mock_hget)

        # job_type 필터 테스트
        entries = queue_service.get_dlq_entries(job_type="full_pipeline")
        assert len(entries) == 2
        assert all(e.job_type == "full_pipeline" for e in entries)

        # user_id 필터 테스트
        entries = queue_service.get_dlq_entries(user_id="user-A")
        assert len(entries) == 2
        assert all(e.user_id == "user-A" for e in entries)


class TestDLQStats:
    """DLQ 통계 테스트"""

    @pytest.fixture
    def queue_service(self):
        """통계 테스트용 QueueService"""
        service = QueueService.__new__(QueueService)
        service.redis = Mock()
        return service

    def test_get_dlq_stats(self, queue_service):
        """DLQ 통계 조회 테스트"""
        # Mock 데이터 설정
        queue_service.get_dlq_count = Mock(return_value=10)

        mock_entries = [
            DLQEntry(
                dlq_id="dlq-1",
                job_id="job-1",
                rq_job_id="rq-1",
                job_type="full_pipeline",
                user_id="user-A",
                error_message="Error 1",
                error_type="TIMEOUT",
                retry_count=1,
                failed_at="2025-01-01T00:00:00Z",
                job_kwargs={},
            ),
            DLQEntry(
                dlq_id="dlq-2",
                job_id="job-2",
                rq_job_id="rq-2",
                job_type="parse",
                user_id="user-A",
                error_message="Error 2",
                error_type="INTERNAL_ERROR",
                retry_count=2,
                failed_at="2025-01-01T01:00:00Z",
                job_kwargs={},
            ),
            DLQEntry(
                dlq_id="dlq-3",
                job_id="job-3",
                rq_job_id="rq-3",
                job_type="full_pipeline",
                user_id="user-B",
                error_message="Error 3",
                error_type="TIMEOUT",
                retry_count=3,
                failed_at="2025-01-01T02:00:00Z",
                job_kwargs={},
            ),
        ]
        queue_service.get_dlq_entries = Mock(return_value=mock_entries)

        stats = queue_service.get_dlq_stats()

        assert stats["available"] is True
        assert stats["total"] == 10
        assert stats["by_job_type"]["full_pipeline"] == 2
        assert stats["by_job_type"]["parse"] == 1
        assert stats["by_error_type"]["TIMEOUT"] == 2
        assert stats["by_error_type"]["INTERNAL_ERROR"] == 1
        assert stats["by_user"]["user-A"] == 2
        assert stats["by_user"]["user-B"] == 1

    def test_get_dlq_stats_unavailable(self):
        """Redis 미연결 시 통계 테스트"""
        service = QueueService.__new__(QueueService)
        service.redis = None

        stats = service.get_dlq_stats()

        assert stats["available"] is False
        assert stats["total"] == 0


class TestOnJobFailure:
    """작업 실패 핸들러 테스트"""

    def test_on_job_failure_adds_to_dlq(self):
        """실패 핸들러가 DLQ에 추가하는지 테스트"""
        from tasks import on_job_failure

        # Mock job
        mock_job = Mock()
        mock_job.id = "rq-job-123"
        mock_job.kwargs = {
            "job_id": "job-123",
            "user_id": "user-456",
            "file_path": "/path/to/file",
            "file_name": "test.pdf",
        }
        mock_job.func_name = "tasks.full_pipeline"
        mock_job.retries_left = 0

        # Mock connection
        mock_connection = Mock()

        # Mock exception
        mock_type = ValueError
        mock_value = ValueError("Test failure")
        mock_tb = None

        # Mock queue service
        with patch("tasks.get_queue_service") as mock_get_queue:
            mock_queue_service = Mock()
            mock_queue_service.is_available = True
            mock_queue_service.add_to_dlq = Mock(return_value="dlq-new-123")
            mock_get_queue.return_value = mock_queue_service

            with patch("tasks.get_database_service") as mock_get_db:
                mock_db_service = Mock()
                mock_get_db.return_value = mock_db_service

                on_job_failure(mock_job, mock_connection, mock_type, mock_value, mock_tb)

                # DLQ에 추가되었는지 확인
                mock_queue_service.add_to_dlq.assert_called_once()
                call_kwargs = mock_queue_service.add_to_dlq.call_args[1]
                assert call_kwargs["job_id"] == "job-123"
                assert call_kwargs["user_id"] == "user-456"
                assert call_kwargs["job_type"] == "full_pipeline"
                assert call_kwargs["error_type"] == "VALUEERROR"

                # DB 상태 업데이트 확인
                mock_db_service.update_job_status.assert_called_once()


class TestDLQRetry:
    """DLQ 재시도 테스트"""

    @pytest.fixture
    def queue_service(self):
        """재시도 테스트용 QueueService"""
        service = QueueService.__new__(QueueService)
        service.redis = Mock()
        service.process_queue = Mock()
        service.parse_queue = Mock()
        return service

    def test_retry_from_dlq_full_pipeline(self, queue_service):
        """full_pipeline 재시도 테스트"""
        # Mock DLQ entry
        entry = DLQEntry(
            dlq_id="dlq-retry-test",
            job_id="job-to-retry",
            rq_job_id="rq-old",
            job_type="full_pipeline",
            user_id="user-retry",
            error_message="Original error",
            error_type="TIMEOUT",
            retry_count=2,
            failed_at="2025-01-01T00:00:00Z",
            job_kwargs={
                "job_id": "job-to-retry",
                "user_id": "user-retry",
                "file_path": "/path/to/file.pdf",
                "file_name": "file.pdf",
                "mode": "phase_1",
            },
        )

        queue_service.get_dlq_entry = Mock(return_value=entry)
        queue_service.remove_from_dlq = Mock(return_value=True)

        # Mock enqueue
        mock_rq_job = Mock()
        mock_rq_job.id = "rq-new-123"
        queue_service.process_queue.enqueue = Mock(return_value=mock_rq_job)

        with patch("services.queue_service.on_job_failure", Mock()):
            # 직접 enqueue_full_pipeline 호출 (retry_from_dlq 내부에서 호출됨)
            queue_service.enqueue_full_pipeline = Mock(
                return_value=QueuedJob(
                    job_id="job-to-retry",
                    rq_job_id="rq-new-123",
                    status="queued",
                    type=JobType.FULL_PIPELINE,
                )
            )

            result = queue_service.retry_from_dlq("dlq-retry-test")

            assert result is not None
            assert result.rq_job_id == "rq-new-123"
            queue_service.remove_from_dlq.assert_called_once_with("dlq-retry-test")

    def test_retry_from_dlq_not_found(self, queue_service):
        """존재하지 않는 DLQ 항목 재시도 테스트"""
        queue_service.get_dlq_entry = Mock(return_value=None)

        result = queue_service.retry_from_dlq("dlq-nonexistent")

        assert result is None
