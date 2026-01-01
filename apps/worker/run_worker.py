#!/usr/bin/env python
"""
RQ Worker Runner

RQ Worker를 실행하여 Redis Queue의 작업을 처리합니다.

Usage:
    python run_worker.py                    # 모든 Queue 처리
    python run_worker.py parse              # parse Queue만 처리
    python run_worker.py process            # process Queue만 처리
    python run_worker.py --burst            # 남은 작업만 처리 후 종료

환경 변수:
    REDIS_URL: Redis 연결 URL (기본: redis://localhost:6379)
"""

import sys
import logging
from redis import Redis
from rq import Worker, Queue, Connection

from config import get_settings

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


def run_worker(queues: list[str] = None, burst: bool = False):
    """
    RQ Worker 실행

    Args:
        queues: 처리할 Queue 이름 리스트 (기본: ["parse", "process"])
        burst: True면 남은 작업만 처리 후 종료
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

    # Queue 설정
    if queues is None:
        queues = ["parse", "process"]

    with Connection(redis_conn):
        queue_list = [Queue(name) for name in queues]
        worker = Worker(queue_list)

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
        help="Queue names to process (default: parse, process)"
    )
    parser.add_argument(
        "--burst",
        action="store_true",
        help="Run in burst mode (process remaining jobs and exit)"
    )

    args = parser.parse_args()

    # 명령줄에서 queue 이름들을 받음
    queues = args.queues if args.queues else None

    run_worker(queues=queues, burst=args.burst)
