"""
Queue Service - Redis RQ 기반 비동기 작업 처리

Job Queue를 통해 파일 처리를 비동기로 수행
- 파싱 작업 Queue
- 분석 작업 Queue
- 재시도 로직
"""

import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
import json
import httpx

from redis import Redis
from rq import Queue, Retry
from rq.job import Job

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class JobType(str, Enum):
    PARSE = "parse"
    PROCESS = "process"
    FULL_PIPELINE = "full_pipeline"


@dataclass
class QueuedJob:
    """Queue에 등록된 작업 정보"""
    job_id: str
    rq_job_id: str
    status: str
    type: JobType


class QueueService:
    """
    Redis Queue 서비스

    Upstash Redis REST API 또는 표준 Redis 지원
    """

    def __init__(self):
        self.redis: Optional[Redis] = None
        self.parse_queue: Optional[Queue] = None
        self.process_queue: Optional[Queue] = None
        self._init_redis()

    def _init_redis(self):
        """Redis 연결 초기화"""
        redis_url = settings.REDIS_URL

        if not redis_url:
            logger.warning("REDIS_URL not configured - queue disabled")
            return

        try:
            self.redis = Redis.from_url(redis_url)
            self.redis.ping()

            # Queue 생성
            self.parse_queue = Queue("parse", connection=self.redis)
            self.process_queue = Queue("process", connection=self.redis)

            logger.info("Redis Queue initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Redis: {e}")
            self.redis = None

    @property
    def is_available(self) -> bool:
        """Queue 사용 가능 여부"""
        return self.redis is not None

    def enqueue_parse(
        self,
        job_id: str,
        user_id: str,
        file_path: str,
        file_name: str,
    ) -> Optional[QueuedJob]:
        """
        파싱 작업을 Queue에 추가

        Args:
            job_id: processing_jobs ID
            user_id: 사용자 ID
            file_path: Supabase Storage 경로
            file_name: 원본 파일명

        Returns:
            QueuedJob or None if queue unavailable
        """
        if not self.is_available:
            return None

        try:
            rq_job = self.parse_queue.enqueue(
                "tasks.parse_file",
                kwargs={
                    "job_id": job_id,
                    "user_id": user_id,
                    "file_path": file_path,
                    "file_name": file_name,
                },
                job_id=f"parse-{job_id}",
                retry=Retry(max=3, interval=[10, 30, 60]),
                job_timeout="5m",
            )

            return QueuedJob(
                job_id=job_id,
                rq_job_id=rq_job.id,
                status="queued",
                type=JobType.PARSE,
            )
        except Exception as e:
            logger.error(f"Failed to enqueue parse job: {e}")
            return None

    def enqueue_process(
        self,
        job_id: str,
        user_id: str,
        text: str,
        mode: str = "phase_1",
        source_file: str = "",
        file_type: str = "",
    ) -> Optional[QueuedJob]:
        """
        분석 작업을 Queue에 추가

        Args:
            job_id: processing_jobs ID
            user_id: 사용자 ID
            text: 파싱된 텍스트
            mode: phase_1 or phase_2
            source_file: 원본 파일 경로
            file_type: 파일 타입

        Returns:
            QueuedJob or None
        """
        if not self.is_available:
            return None

        try:
            rq_job = self.process_queue.enqueue(
                "tasks.process_resume",
                kwargs={
                    "job_id": job_id,
                    "user_id": user_id,
                    "text": text,
                    "mode": mode,
                    "source_file": source_file,
                    "file_type": file_type,
                },
                job_id=f"process-{job_id}",
                retry=Retry(max=2, interval=[30, 60]),
                job_timeout="10m",
            )

            return QueuedJob(
                job_id=job_id,
                rq_job_id=rq_job.id,
                status="queued",
                type=JobType.PROCESS,
            )
        except Exception as e:
            logger.error(f"Failed to enqueue process job: {e}")
            return None

    def enqueue_full_pipeline(
        self,
        job_id: str,
        user_id: str,
        file_path: str,
        file_name: str,
        mode: str = "phase_1",
    ) -> Optional[QueuedJob]:
        """
        전체 파이프라인(파싱 + 분석)을 Queue에 추가

        Next.js API에서 호출 - 즉시 반환하고 백그라운드 처리
        """
        if not self.is_available:
            return None

        try:
            rq_job = self.process_queue.enqueue(
                "tasks.full_pipeline",
                kwargs={
                    "job_id": job_id,
                    "user_id": user_id,
                    "file_path": file_path,
                    "file_name": file_name,
                    "mode": mode,
                },
                job_id=f"pipeline-{job_id}",
                retry=Retry(max=2, interval=[30, 60]),
                job_timeout="15m",
            )

            return QueuedJob(
                job_id=job_id,
                rq_job_id=rq_job.id,
                status="queued",
                type=JobType.FULL_PIPELINE,
            )
        except Exception as e:
            logger.error(f"Failed to enqueue full pipeline: {e}")
            return None

    def get_job_status(self, rq_job_id: str) -> Optional[Dict[str, Any]]:
        """RQ Job 상태 조회"""
        if not self.is_available:
            return None

        try:
            job = Job.fetch(rq_job_id, connection=self.redis)
            return {
                "id": job.id,
                "status": job.get_status(),
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "ended_at": job.ended_at.isoformat() if job.ended_at else None,
                "result": job.result,
                "exc_info": job.exc_info,
            }
        except Exception as e:
            logger.error(f"Failed to get job status: {e}")
            return None

    async def notify_webhook(
        self,
        webhook_url: str,
        job_id: str,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ):
        """
        Webhook으로 작업 완료 알림 전송

        Next.js API의 /api/webhooks/worker 로 전송
        """
        if not webhook_url:
            return

        payload = {
            "job_id": job_id,
            "status": status,
            "result": result,
            "error": error,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )

                if response.status_code != 200:
                    logger.warning(f"Webhook notification failed: {response.status_code}")
        except Exception as e:
            logger.error(f"Webhook notification error: {e}")


# 싱글톤 인스턴스
_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    """Queue Service 싱글톤 반환"""
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
