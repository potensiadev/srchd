"""
Queue Service - Redis RQ 기반 비동기 작업 처리

Job Queue를 통해 파일 처리를 비동기로 수행
- 파싱 작업 Queue
- 분석 작업 Queue
- 재시도 로직
- Dead Letter Queue (DLQ) - 영구 실패 작업 관리
"""

import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
import json
import httpx

from redis import Redis
from rq import Queue, Retry
from rq.job import Job

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Dead Letter Queue 키
DLQ_KEY = "rai:dlq:failed_jobs"
DLQ_METADATA_PREFIX = "rai:dlq:meta:"


class JobType(str, Enum):
    PARSE = "parse"
    PROCESS = "process"
    FULL_PIPELINE = "full_pipeline"
    FAST_PIPELINE = "fast_pipeline"  # PDF/DOCX - fast processing
    SLOW_PIPELINE = "slow_pipeline"  # HWP/HWPX - slow processing (LibreOffice)


@dataclass
class QueuedJob:
    """Queue에 등록된 작업 정보"""
    job_id: str
    rq_job_id: str
    status: str
    type: JobType


@dataclass
class DLQEntry:
    """Dead Letter Queue 항목"""
    dlq_id: str  # DLQ 고유 ID
    job_id: str  # 원래 작업 ID
    rq_job_id: str  # RQ Job ID
    job_type: str  # parse, process, full_pipeline
    user_id: str
    error_message: str
    error_type: str  # 에러 타입 (예: INTERNAL_ERROR, TIMEOUT 등)
    retry_count: int  # 재시도 횟수
    failed_at: str  # ISO 형식 타임스탬프
    job_kwargs: Dict[str, Any]  # 원래 작업 파라미터
    last_traceback: Optional[str] = None  # 마지막 스택트레이스

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DLQEntry":
        """딕셔너리에서 생성"""
        return cls(**data)


class QueueService:
    """
    Redis Queue 서비스

    Upstash Redis REST API 또는 표준 Redis 지원
    """

    def __init__(self):
        self.redis: Optional[Redis] = None
        self.parse_queue: Optional[Queue] = None
        self.process_queue: Optional[Queue] = None
        self.fast_queue: Optional[Queue] = None  # PDF/DOCX - fast processing
        self.slow_queue: Optional[Queue] = None  # HWP/HWPX - slow processing
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
            # Fast/Slow Queue for file-type based routing
            self.fast_queue = Queue("fast", connection=self.redis, default_timeout="5m")
            self.slow_queue = Queue("slow", connection=self.redis, default_timeout="20m")

            logger.info("Redis Queue initialized successfully (with fast/slow queues)")
        except Exception as e:
            logger.error(f"Failed to initialize Redis: {e}")
            self.redis = None

    @property
    def is_available(self) -> bool:
        """Queue 사용 가능 여부"""
        return self.redis is not None

    # ─────────────────────────────────────────────────
    # PRD Epic 4: 백프레셔 모니터링
    # ─────────────────────────────────────────────────
    
    def get_queue_depth(self, queue_name: str = "slow") -> int:
        """
        큐 깊이(대기 중인 작업 수) 조회
        
        Args:
            queue_name: 큐 이름 (fast, slow, parse, process)
            
        Returns:
            대기 중인 작업 수 (Redis 미연결 시 0)
        """
        if not self.is_available:
            return 0
        
        queue_map = {
            "fast": self.fast_queue,
            "slow": self.slow_queue,
            "parse": self.parse_queue,
            "process": self.process_queue,
        }
        
        queue = queue_map.get(queue_name)
        if queue is None:
            return 0
        
        try:
            return len(queue)
        except Exception as e:
            logger.warning(f"[QueueService] Failed to get queue depth: {e}")
            return 0

    def should_throttle(self, threshold: int = 50) -> bool:
        """
        백프레셔 판단 - slow_queue가 임계값 초과 시 True
        
        Args:
            threshold: 임계값 (기본: 50건)
            
        Returns:
            True면 신규 HWP 업로드 제한 권장
        """
        slow_depth = self.get_queue_depth("slow")
        should_throttle = slow_depth > threshold
        
        if should_throttle:
            logger.warning(
                f"[QueueService] BACKPRESSURE: slow_queue depth ({slow_depth}) > {threshold}. "
                f"Consider throttling new HWP uploads."
            )
        
        return should_throttle

    def get_queue_stats(self) -> Dict[str, int]:
        """
        모든 큐의 통계 조회
        
        Returns:
            {"fast": N, "slow": N, "parse": N, "process": N}
        """
        return {
            "fast": self.get_queue_depth("fast"),
            "slow": self.get_queue_depth("slow"),
            "parse": self.get_queue_depth("parse"),
            "process": self.get_queue_depth("process"),
        }

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
            # Import failure handler
            from tasks import on_job_failure

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
                on_failure=on_job_failure,  # DLQ로 이동
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
            # Import failure handler
            from tasks import on_job_failure

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
                on_failure=on_job_failure,  # DLQ로 이동
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
        candidate_id: Optional[str] = None,
    ) -> Optional[QueuedJob]:
        """
        전체 파이프라인(파싱 + 분석)을 Queue에 추가

        Next.js API에서 호출 - 즉시 반환하고 백그라운드 처리
        """
        if not self.is_available:
            return None

        try:
            # Import failure handler
            from tasks import on_job_failure

            rq_job = self.process_queue.enqueue(
                "tasks.full_pipeline",
                kwargs={
                    "job_id": job_id,
                    "user_id": user_id,
                    "file_path": file_path,
                    "file_name": file_name,
                    "mode": mode,
                    "candidate_id": candidate_id,
                },
                job_id=f"pipeline-{job_id}",
                retry=Retry(max=2, interval=[30, 60]),
                job_timeout="15m",
                on_failure=on_job_failure,  # DLQ로 이동
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

    def enqueue_by_file_type(
        self,
        job_id: str,
        user_id: str,
        file_path: str,
        file_name: str,
        file_type: str,
        mode: str = "phase_1",
        candidate_id: Optional[str] = None,
    ) -> Optional[QueuedJob]:
        """
        파일 타입에 따라 적절한 Queue로 라우팅
        
        - HWP/HWPX → slow_queue (LibreOffice 변환 필요, 20분 타임아웃)
        - PDF/DOCX → fast_queue (직접 파싱, 5분 타임아웃)
        
        Args:
            job_id: processing_jobs ID
            user_id: 사용자 ID
            file_path: Supabase Storage 경로
            file_name: 원본 파일명
            file_type: 파일 타입 (hwp, hwpx, pdf, docx)
            mode: phase_1 or phase_2
            candidate_id: 후보자 ID (선택)
            
        Returns:
            QueuedJob or None
        """
        if not self.is_available:
            return None
        
        # 파일 타입에 따른 Queue 선택
        file_type_lower = file_type.lower().strip()
        is_slow = file_type_lower in ("hwp", "hwpx")
        
        target_queue = self.slow_queue if is_slow else self.fast_queue
        job_type = JobType.SLOW_PIPELINE if is_slow else JobType.FAST_PIPELINE
        timeout = "20m" if is_slow else "5m"
        retry_intervals = [60, 120] if is_slow else [30, 60]
        
        try:
            from tasks import on_job_failure
            
            queue_name = "slow" if is_slow else "fast"
            logger.info(
                f"[Queue] Routing {file_name} ({file_type}) to {queue_name}_queue "
                f"(timeout: {timeout})"
            )
            
            rq_job = target_queue.enqueue(
                "tasks.full_pipeline",
                kwargs={
                    "job_id": job_id,
                    "user_id": user_id,
                    "file_path": file_path,
                    "file_name": file_name,
                    "mode": mode,
                    "candidate_id": candidate_id,
                },
                job_id=f"{queue_name}-{job_id}",
                retry=Retry(max=2, interval=retry_intervals),
                job_timeout=timeout,
                on_failure=on_job_failure,
            )
            
            return QueuedJob(
                job_id=job_id,
                rq_job_id=rq_job.id,
                status="queued",
                type=job_type,
            )
        except Exception as e:
            logger.error(f"Failed to enqueue to {queue_name}_queue: {e}")
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

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Dead Letter Queue (DLQ) Methods
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def add_to_dlq(
        self,
        job_id: str,
        rq_job_id: str,
        job_type: str,
        user_id: str,
        error_message: str,
        error_type: str,
        retry_count: int,
        job_kwargs: Dict[str, Any],
        traceback: Optional[str] = None,
    ) -> Optional[str]:
        """
        실패한 작업을 Dead Letter Queue에 추가

        Args:
            job_id: processing_jobs ID
            rq_job_id: RQ Job ID
            job_type: 작업 타입 (parse, process, full_pipeline)
            user_id: 사용자 ID
            error_message: 에러 메시지
            error_type: 에러 타입
            retry_count: 재시도 횟수
            job_kwargs: 원래 작업 파라미터
            traceback: 스택트레이스 (선택)

        Returns:
            DLQ 항목 ID (실패 시 None)
        """
        if not self.is_available:
            logger.warning("Cannot add to DLQ: Redis not available")
            return None

        try:
            import uuid

            dlq_id = f"dlq-{uuid.uuid4().hex[:12]}"
            failed_at = datetime.utcnow().isoformat() + "Z"

            entry = DLQEntry(
                dlq_id=dlq_id,
                job_id=job_id,
                rq_job_id=rq_job_id,
                job_type=job_type,
                user_id=user_id,
                error_message=error_message[:1000],  # 에러 메시지 길이 제한
                error_type=error_type,
                retry_count=retry_count,
                failed_at=failed_at,
                job_kwargs=job_kwargs,
                last_traceback=traceback[:5000] if traceback else None,  # 트레이스백 길이 제한
            )

            # Redis에 저장: 메타데이터는 Hash, ID는 List에 추가
            entry_json = json.dumps(entry.to_dict(), ensure_ascii=False, default=str)
            self.redis.hset(f"{DLQ_METADATA_PREFIX}{dlq_id}", "data", entry_json)
            self.redis.lpush(DLQ_KEY, dlq_id)

            # 30일 후 자동 만료 (TTL 설정)
            self.redis.expire(f"{DLQ_METADATA_PREFIX}{dlq_id}", 30 * 24 * 60 * 60)

            logger.info(
                f"[DLQ] Added job {job_id} to Dead Letter Queue: {dlq_id} "
                f"(type: {job_type}, error: {error_type})"
            )
            return dlq_id

        except Exception as e:
            logger.error(f"[DLQ] Failed to add to DLQ: {e}")
            return None

    def get_dlq_entries(
        self,
        limit: int = 50,
        offset: int = 0,
        job_type: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[DLQEntry]:
        """
        DLQ 항목 목록 조회

        Args:
            limit: 최대 조회 수
            offset: 시작 위치
            job_type: 필터링할 작업 타입 (선택)
            user_id: 필터링할 사용자 ID (선택)

        Returns:
            DLQEntry 목록
        """
        if not self.is_available:
            return []

        try:
            # DLQ에서 ID 목록 조회 (최신순)
            dlq_ids = self.redis.lrange(DLQ_KEY, offset, offset + limit * 2 - 1)

            if not dlq_ids:
                return []

            entries = []
            for dlq_id_bytes in dlq_ids:
                dlq_id = dlq_id_bytes.decode("utf-8") if isinstance(dlq_id_bytes, bytes) else dlq_id_bytes

                # 메타데이터 조회
                entry_json = self.redis.hget(f"{DLQ_METADATA_PREFIX}{dlq_id}", "data")
                if not entry_json:
                    continue

                entry_data = json.loads(entry_json)
                entry = DLQEntry.from_dict(entry_data)

                # 필터링
                if job_type and entry.job_type != job_type:
                    continue
                if user_id and entry.user_id != user_id:
                    continue

                entries.append(entry)

                if len(entries) >= limit:
                    break

            return entries

        except Exception as e:
            logger.error(f"[DLQ] Failed to get DLQ entries: {e}")
            return []

    def get_dlq_entry(self, dlq_id: str) -> Optional[DLQEntry]:
        """
        단일 DLQ 항목 조회

        Args:
            dlq_id: DLQ 항목 ID

        Returns:
            DLQEntry 또는 None
        """
        if not self.is_available:
            return None

        try:
            entry_json = self.redis.hget(f"{DLQ_METADATA_PREFIX}{dlq_id}", "data")
            if not entry_json:
                return None

            entry_data = json.loads(entry_json)
            return DLQEntry.from_dict(entry_data)

        except Exception as e:
            logger.error(f"[DLQ] Failed to get DLQ entry {dlq_id}: {e}")
            return None

    def get_dlq_count(self) -> int:
        """DLQ 항목 수 조회"""
        if not self.is_available:
            return 0

        try:
            return self.redis.llen(DLQ_KEY)
        except Exception as e:
            logger.error(f"[DLQ] Failed to get DLQ count: {e}")
            return 0

    def remove_from_dlq(self, dlq_id: str) -> bool:
        """
        DLQ에서 항목 제거

        Args:
            dlq_id: DLQ 항목 ID

        Returns:
            성공 여부
        """
        if not self.is_available:
            return False

        try:
            # 리스트에서 제거
            self.redis.lrem(DLQ_KEY, 1, dlq_id)
            # 메타데이터 삭제
            self.redis.delete(f"{DLQ_METADATA_PREFIX}{dlq_id}")

            logger.info(f"[DLQ] Removed {dlq_id} from Dead Letter Queue")
            return True

        except Exception as e:
            logger.error(f"[DLQ] Failed to remove from DLQ: {e}")
            return False

    def retry_from_dlq(self, dlq_id: str) -> Optional[QueuedJob]:
        """
        DLQ에서 작업 재시도

        DLQ 항목을 조회하여 원래 파라미터로 새 작업 생성

        Args:
            dlq_id: DLQ 항목 ID

        Returns:
            새로 생성된 QueuedJob 또는 None
        """
        if not self.is_available:
            return None

        try:
            # DLQ 항목 조회
            entry = self.get_dlq_entry(dlq_id)
            if not entry:
                logger.warning(f"[DLQ] Entry not found: {dlq_id}")
                return None

            # 작업 타입에 따라 재시도
            queued_job = None
            kwargs = entry.job_kwargs

            if entry.job_type == JobType.PARSE.value:
                queued_job = self.enqueue_parse(
                    job_id=kwargs.get("job_id", entry.job_id),
                    user_id=kwargs.get("user_id", entry.user_id),
                    file_path=kwargs.get("file_path", ""),
                    file_name=kwargs.get("file_name", ""),
                )
            elif entry.job_type == JobType.PROCESS.value:
                queued_job = self.enqueue_process(
                    job_id=kwargs.get("job_id", entry.job_id),
                    user_id=kwargs.get("user_id", entry.user_id),
                    text=kwargs.get("text", ""),
                    mode=kwargs.get("mode", "phase_1"),
                    source_file=kwargs.get("source_file", ""),
                    file_type=kwargs.get("file_type", ""),
                )
            elif entry.job_type == JobType.FULL_PIPELINE.value:
                queued_job = self.enqueue_full_pipeline(
                    job_id=kwargs.get("job_id", entry.job_id),
                    user_id=kwargs.get("user_id", entry.user_id),
                    file_path=kwargs.get("file_path", ""),
                    file_name=kwargs.get("file_name", ""),
                    mode=kwargs.get("mode", "phase_1"),
                    candidate_id=kwargs.get("candidate_id"),
                )
            elif entry.job_type in (JobType.FAST_PIPELINE.value, JobType.SLOW_PIPELINE.value):
                # Fast/Slow pipeline - route by file type
                file_name = kwargs.get("file_name", "")
                file_type = file_name.rsplit(".", 1)[-1] if "." in file_name else "pdf"
                queued_job = self.enqueue_by_file_type(
                    job_id=kwargs.get("job_id", entry.job_id),
                    user_id=kwargs.get("user_id", entry.user_id),
                    file_path=kwargs.get("file_path", ""),
                    file_name=file_name,
                    file_type=file_type,
                    mode=kwargs.get("mode", "phase_1"),
                    candidate_id=kwargs.get("candidate_id"),
                )

            if queued_job:
                # 재시도 성공 시 DLQ에서 제거
                self.remove_from_dlq(dlq_id)
                logger.info(
                    f"[DLQ] Retried job {entry.job_id} from DLQ: "
                    f"new_rq_job={queued_job.rq_job_id}"
                )

            return queued_job

        except Exception as e:
            logger.error(f"[DLQ] Failed to retry from DLQ: {e}")
            return None

    def clear_dlq(self, older_than_days: Optional[int] = None) -> int:
        """
        DLQ 정리

        Args:
            older_than_days: 지정된 일수보다 오래된 항목만 삭제 (None이면 전체 삭제)

        Returns:
            삭제된 항목 수
        """
        if not self.is_available:
            return 0

        try:
            deleted_count = 0

            if older_than_days is None:
                # 전체 삭제
                dlq_ids = self.redis.lrange(DLQ_KEY, 0, -1)
                for dlq_id_bytes in dlq_ids:
                    dlq_id = dlq_id_bytes.decode("utf-8") if isinstance(dlq_id_bytes, bytes) else dlq_id_bytes
                    self.redis.delete(f"{DLQ_METADATA_PREFIX}{dlq_id}")
                    deleted_count += 1

                self.redis.delete(DLQ_KEY)
                logger.info(f"[DLQ] Cleared all {deleted_count} entries from DLQ")
            else:
                # 오래된 항목만 삭제
                cutoff = datetime.utcnow()
                from datetime import timedelta
                cutoff = cutoff - timedelta(days=older_than_days)

                dlq_ids = self.redis.lrange(DLQ_KEY, 0, -1)
                for dlq_id_bytes in dlq_ids:
                    dlq_id = dlq_id_bytes.decode("utf-8") if isinstance(dlq_id_bytes, bytes) else dlq_id_bytes
                    entry = self.get_dlq_entry(dlq_id)

                    if entry:
                        failed_at = datetime.fromisoformat(entry.failed_at.replace("Z", "+00:00"))
                        if failed_at.replace(tzinfo=None) < cutoff:
                            self.remove_from_dlq(dlq_id)
                            deleted_count += 1

                logger.info(f"[DLQ] Cleared {deleted_count} entries older than {older_than_days} days")

            return deleted_count

        except Exception as e:
            logger.error(f"[DLQ] Failed to clear DLQ: {e}")
            return 0

    def get_dlq_stats(self) -> Dict[str, Any]:
        """
        DLQ 통계 조회

        Returns:
            통계 정보 딕셔너리
        """
        if not self.is_available:
            return {"available": False, "total": 0}

        try:
            total = self.get_dlq_count()
            entries = self.get_dlq_entries(limit=1000)  # 최근 1000개 분석

            # 타입별 집계
            by_type = {}
            by_error_type = {}
            by_user = {}

            for entry in entries:
                # 작업 타입별
                by_type[entry.job_type] = by_type.get(entry.job_type, 0) + 1
                # 에러 타입별
                by_error_type[entry.error_type] = by_error_type.get(entry.error_type, 0) + 1
                # 사용자별
                by_user[entry.user_id] = by_user.get(entry.user_id, 0) + 1

            return {
                "available": True,
                "total": total,
                "by_job_type": by_type,
                "by_error_type": by_error_type,
                "by_user": dict(sorted(by_user.items(), key=lambda x: x[1], reverse=True)[:10]),  # Top 10 사용자
            }

        except Exception as e:
            logger.error(f"[DLQ] Failed to get DLQ stats: {e}")
            return {"available": True, "total": 0, "error": str(e)}


# 싱글톤 인스턴스
_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    """Queue Service 싱글톤 반환"""
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
