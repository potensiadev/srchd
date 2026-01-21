#!/usr/bin/env python
"""
RQ Worker Runner

RQ Worker를 실행하여 Redis Queue의 작업을 처리합니다.

Usage:
    python run_worker.py                    # 모든 Queue 처리
    python run_worker.py parse              # parse Queue만 처리
    python run_worker.py process            # process Queue만 처리
    python run_worker.py --mode fast        # fast Queue 전용 (PDF/DOCX)
    python run_worker.py --mode slow        # slow Queue 전용 (HWP/HWPX)
    python run_worker.py --burst            # 남은 작업만 처리 후 종료

환경 변수:
    REDIS_URL: Redis 연결 URL (기본: redis://localhost:6379)
    WORKER_MODE: 워커 모드 (all, fast, slow)
"""

import os
import sys
import platform
import logging
from redis import Redis
from rq import Queue, SimpleWorker, Worker

from config import get_settings

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()

# 워커 모드별 Queue 매핑
WORKER_MODE_QUEUES = {
    "all": ["fast", "slow", "parse", "process"],
    "fast": ["fast", "process"],      # PDF/DOCX 전용
    "slow": ["slow", "process"],      # HWP/HWPX 전용
    "legacy": ["parse", "process"],   # 기존 호환
}


def run_worker(queues: list[str] = None, burst: bool = False, mode: str = None):
    """
    RQ Worker 실행

    Args:
        queues: 처리할 Queue 이름 리스트
        burst: True면 남은 작업만 처리 후 종료
        mode: 워커 모드 (all, fast, slow, legacy)
    """
    redis_url = settings.REDIS_URL

    if not redis_url:
        logger.error("REDIS_URL not configured")
        sys.exit(1)

    try:
        redis_conn = Redis.from_url(redis_url)
        redis_conn.ping()
        logger.info(f"Connected to Redis: {redis_url}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    # Queue 설정 (우선순위: 명시적 queues > mode > 환경변수 > 기본값)
    if queues is None:
        # 환경 변수에서 모드 확인
        env_mode = os.getenv("WORKER_MODE", "all")
        worker_mode = mode or env_mode
        
        if worker_mode in WORKER_MODE_QUEUES:
            queues = WORKER_MODE_QUEUES[worker_mode]
            logger.info(f"Worker mode: {worker_mode}")
        else:
            queues = WORKER_MODE_QUEUES["all"]
            logger.warning(f"Unknown worker mode '{worker_mode}', using 'all'")

    queue_list = [Queue(name, connection=redis_conn) for name in queues]

    # Windows doesn't support os.fork(), use SimpleWorker instead
    if platform.system() == "Windows":
        logger.info("Using SimpleWorker (Windows mode)")
        worker = SimpleWorker(queue_list, connection=redis_conn)
    else:
        worker = Worker(queue_list, connection=redis_conn)

    logger.info(f"Starting worker for queues: {queues}")
    logger.info(f"Burst mode: {burst}")

    worker.work(burst=burst)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run RQ Worker")
    parser.add_argument(
        "queues",
        nargs="*",
        default=None,
        help="Queue names to process (default: depends on mode)"
    )
    parser.add_argument(
        "--burst",
        action="store_true",
        help="Run in burst mode (process remaining jobs and exit)"
    )
    parser.add_argument(
        "--mode",
        choices=["all", "fast", "slow", "legacy"],
        default=None,
        help="Worker mode: all (default), fast (PDF/DOCX), slow (HWP), legacy"
    )

    args = parser.parse_args()

    # 명령줄에서 queue 이름들을 받음
    queues = args.queues if args.queues else None

    run_worker(queues=queues, burst=args.burst, mode=args.mode)

