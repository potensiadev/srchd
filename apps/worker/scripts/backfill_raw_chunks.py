"""
Backfill Script: 기존 후보자에 대한 Raw 청크 생성

PRD v0.1: prd_aisemantic_search_v0.1.md
- 기존 후보자 데이터에 raw_full, raw_section 청크 추가
- Storage에서 파일 다운로드 → 파싱 → 청킹 → 임베딩 → 저장

사용법:
    python scripts/backfill_raw_chunks.py [--dry-run] [--limit 100] [--user-id UUID]

Options:
    --dry-run: 실제 저장 없이 시뮬레이션
    --limit N: 처리할 최대 후보자 수
    --user-id: 특정 사용자의 후보자만 처리
    --batch-size: 배치 크기 (기본: 10)
"""

import asyncio
import argparse
import logging
import sys
import os
from typing import Optional, List
from datetime import datetime
from pathlib import Path

# 상위 디렉토리를 path에 추가
worker_dir = str(__file__).replace('\\', '/').rsplit('/scripts/', 1)[0]
sys.path.insert(0, worker_dir)

# .env 파일 로드 (config import 전에 반드시 실행)
from dotenv import load_dotenv
env_path = Path(worker_dir) / '.env'
root_env = Path(worker_dir).parent.parent / '.env.local'

if env_path.exists():
    load_dotenv(env_path, override=True)
    print(f"Loaded env from: {env_path}")
elif root_env.exists():
    load_dotenv(root_env, override=True)
    print(f"Loaded env from: {root_env}")
else:
    print(f"Warning: No .env file found at {env_path} or {root_env}")

# 환경변수 매핑 (NEXT_PUBLIC_* → worker용 변수)
if not os.getenv('SUPABASE_URL') and os.getenv('NEXT_PUBLIC_SUPABASE_URL'):
    os.environ['SUPABASE_URL'] = os.getenv('NEXT_PUBLIC_SUPABASE_URL')

# 환경변수 확인
if not os.getenv('SUPABASE_URL'):
    print("Error: SUPABASE_URL not set. Please check .env file.")
    sys.exit(1)

from supabase import create_client
from config import Settings
from services.embedding_service import get_embedding_service, ChunkType
from utils.hwp_parser import HWPParser
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# dotenv 로드 후 새로운 Settings 인스턴스 생성
settings = Settings()


class BackfillProcessor:
    """기존 후보자에 대한 Raw 청크 백필 처리"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        self.embedding_service = get_embedding_service()
        self.hwp_parser = HWPParser(hancom_api_key=settings.HANCOM_API_KEY or None)
        self.pdf_parser = PDFParser()
        self.docx_parser = DOCXParser()

        # 통계
        self.stats = {
            "total": 0,
            "processed": 0,
            "skipped": 0,
            "failed": 0,
            "chunks_created": 0,
        }

    async def get_candidates_without_raw_chunks(
        self,
        limit: int = 100,
        user_id: Optional[str] = None
    ) -> List[dict]:
        """
        raw 청크가 없는 후보자 목록 조회

        Args:
            limit: 최대 조회 개수
            user_id: 특정 사용자 필터

        Returns:
            후보자 목록
        """
        # raw 청크가 있는 후보자 ID 조회
        raw_chunk_query = self.supabase.table("candidate_chunks") \
            .select("candidate_id") \
            .in_("chunk_type", ["raw_full", "raw_section"])

        raw_chunk_result = raw_chunk_query.execute()
        candidates_with_raw = set(row["candidate_id"] for row in raw_chunk_result.data)

        # 완료된 후보자 중 raw 청크가 없는 후보자 조회
        query = self.supabase.table("candidates") \
            .select("id, user_id, name, created_at") \
            .eq("status", "completed") \
            .eq("is_latest", True)

        if user_id:
            query = query.eq("user_id", user_id)

        query = query.order("created_at", desc=False).limit(limit * 2)  # 여유있게 조회

        result = query.execute()

        # raw 청크가 없는 후보자만 필터링
        candidates = [
            row for row in result.data
            if row["id"] not in candidates_with_raw
        ][:limit]

        return candidates

    async def get_file_path_for_candidate(self, candidate_id: str) -> Optional[str]:
        """
        후보자의 원본 파일 경로 조회 (processing_jobs에서)

        Args:
            candidate_id: 후보자 ID

        Returns:
            Storage 파일 경로 또는 None
        """
        result = self.supabase.table("processing_jobs") \
            .select("file_path, file_name") \
            .eq("candidate_id", candidate_id) \
            .eq("status", "completed") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if result.data and result.data[0].get("file_path"):
            return result.data[0]["file_path"]

        return None

    def download_file(self, file_path: str) -> Optional[bytes]:
        """
        Storage에서 파일 다운로드

        Args:
            file_path: Storage 경로

        Returns:
            파일 바이트 또는 None
        """
        try:
            response = self.supabase.storage.from_("resumes").download(file_path)
            if response and len(response) > 0:
                return response
        except Exception as e:
            logger.warning(f"파일 다운로드 실패: {file_path} - {e}")

        return None

    def parse_file(self, file_bytes: bytes, file_name: str) -> Optional[str]:
        """
        파일 파싱하여 텍스트 추출

        Args:
            file_bytes: 파일 바이트
            file_name: 파일명

        Returns:
            추출된 텍스트 또는 None
        """
        try:
            file_lower = file_name.lower()

            if file_lower.endswith(('.hwp', '.hwpx')):
                result = self.hwp_parser.parse(file_bytes, file_name)
                return result.text if result.text else None

            elif file_lower.endswith('.pdf'):
                result = self.pdf_parser.parse(file_bytes)
                return result.text if result.success else None

            elif file_lower.endswith(('.doc', '.docx')):
                result = self.docx_parser.parse(file_bytes, file_name)
                return result.text if result.success else None

        except Exception as e:
            logger.warning(f"파일 파싱 실패: {file_name} - {e}")

        return None

    async def process_candidate(self, candidate: dict) -> bool:
        """
        단일 후보자에 대한 raw 청크 생성

        Args:
            candidate: 후보자 정보

        Returns:
            성공 여부
        """
        candidate_id = candidate["id"]
        candidate_name = candidate.get("name", "Unknown")

        logger.info(f"처리 중: {candidate_name} ({candidate_id})")

        # 1. 파일 경로 조회
        file_path = await self.get_file_path_for_candidate(candidate_id)
        if not file_path:
            logger.warning(f"  파일 경로 없음, 스킵")
            self.stats["skipped"] += 1
            return False

        # 파일명 추출
        file_name = file_path.split("/")[-1]

        # 2. 파일 다운로드
        file_bytes = self.download_file(file_path)
        if not file_bytes:
            logger.warning(f"  파일 다운로드 실패, 스킵")
            self.stats["skipped"] += 1
            return False

        # 3. 파일 파싱
        raw_text = self.parse_file(file_bytes, file_name)
        if not raw_text or len(raw_text.strip()) < 100:
            logger.warning(f"  텍스트 추출 실패 또는 너무 짧음, 스킵")
            self.stats["skipped"] += 1
            return False

        logger.info(f"  텍스트 추출: {len(raw_text)}자")

        # 4. Raw 청크 생성
        raw_chunks = self.embedding_service._build_raw_text_chunks(raw_text)
        logger.info(f"  청크 생성: {len(raw_chunks)}개")

        if not raw_chunks:
            logger.warning(f"  청크 없음, 스킵")
            self.stats["skipped"] += 1
            return False

        # 5. 임베딩 생성
        texts = [c.content for c in raw_chunks]
        embeddings = await self.embedding_service.create_embeddings_batch(texts)

        for i, embedding in enumerate(embeddings):
            raw_chunks[i].embedding = embedding

        successful_embeddings = sum(1 for e in embeddings if e is not None)
        logger.info(f"  임베딩 생성: {successful_embeddings}/{len(raw_chunks)}")

        if self.dry_run:
            logger.info(f"  [DRY-RUN] 저장 스킵")
            self.stats["processed"] += 1
            self.stats["chunks_created"] += len(raw_chunks)
            return True

        # 6. DB 저장
        try:
            for chunk in raw_chunks:
                if chunk.embedding is None:
                    continue

                insert_data = {
                    "candidate_id": candidate_id,
                    "chunk_type": chunk.chunk_type.value,
                    "content": chunk.content,
                    "embedding": chunk.embedding,
                    "metadata": chunk.metadata,
                }

                self.supabase.table("candidate_chunks").insert(insert_data).execute()

            self.stats["processed"] += 1
            self.stats["chunks_created"] += successful_embeddings
            logger.info(f"  저장 완료")
            return True

        except Exception as e:
            logger.error(f"  저장 실패: {e}")
            self.stats["failed"] += 1
            return False

    async def run(
        self,
        limit: int = 100,
        user_id: Optional[str] = None,
        batch_size: int = 10
    ):
        """
        백필 실행

        Args:
            limit: 최대 처리 개수
            user_id: 특정 사용자 필터
            batch_size: 배치 크기
        """
        logger.info("=" * 60)
        logger.info("RAW 청크 백필 시작")
        logger.info(f"  Dry Run: {self.dry_run}")
        logger.info(f"  Limit: {limit}")
        logger.info(f"  User ID: {user_id or 'All'}")
        logger.info(f"  Batch Size: {batch_size}")
        logger.info("=" * 60)

        # 대상 후보자 조회
        candidates = await self.get_candidates_without_raw_chunks(limit, user_id)
        self.stats["total"] = len(candidates)

        logger.info(f"대상 후보자: {len(candidates)}명")

        if not candidates:
            logger.info("처리할 후보자가 없습니다.")
            return

        # 배치 처리
        for i in range(0, len(candidates), batch_size):
            batch = candidates[i:i + batch_size]
            logger.info(f"\n배치 {i // batch_size + 1}: {len(batch)}명 처리")

            for candidate in batch:
                try:
                    await self.process_candidate(candidate)
                except Exception as e:
                    logger.error(f"처리 중 오류: {candidate['id']} - {e}")
                    self.stats["failed"] += 1

            # 배치 간 쿨다운 (API 레이트 리밋 방지)
            if i + batch_size < len(candidates):
                logger.info("배치 간 대기 (2초)...")
                await asyncio.sleep(2)

        # 결과 출력
        logger.info("\n" + "=" * 60)
        logger.info("백필 완료")
        logger.info(f"  전체: {self.stats['total']}")
        logger.info(f"  처리됨: {self.stats['processed']}")
        logger.info(f"  스킵됨: {self.stats['skipped']}")
        logger.info(f"  실패: {self.stats['failed']}")
        logger.info(f"  생성된 청크: {self.stats['chunks_created']}")
        logger.info("=" * 60)


async def main():
    parser = argparse.ArgumentParser(description="기존 후보자에 대한 Raw 청크 백필")
    parser.add_argument("--dry-run", action="store_true", help="실제 저장 없이 시뮬레이션")
    parser.add_argument("--limit", type=int, default=100, help="처리할 최대 후보자 수")
    parser.add_argument("--user-id", type=str, help="특정 사용자의 후보자만 처리")
    parser.add_argument("--batch-size", type=int, default=10, help="배치 크기")

    args = parser.parse_args()

    processor = BackfillProcessor(dry_run=args.dry_run)
    await processor.run(
        limit=args.limit,
        user_id=args.user_id,
        batch_size=args.batch_size
    )


if __name__ == "__main__":
    asyncio.run(main())
