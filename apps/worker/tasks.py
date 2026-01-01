"""
RQ Tasks - Redis Queue 작업 함수

RQ Worker가 실행하는 비동기 작업 정의
- parse_file: 파일 파싱
- process_resume: 이력서 분석 + 저장
- full_pipeline: 전체 파이프라인 (파싱 → 분석 → 저장)
"""

import logging
import time
import httpx
from typing import Optional

from config import get_settings, AnalysisMode
from agents.router_agent import RouterAgent, FileType, RouterResult
from agents.analyst_agent import get_analyst_agent, AnalysisResult
from agents.privacy_agent import get_privacy_agent, PrivacyResult
from utils.hwp_parser import HWPParser, ParseMethod
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser
from services.embedding_service import get_embedding_service, EmbeddingResult
from services.database_service import get_database_service, SaveResult

logger = logging.getLogger(__name__)
settings = get_settings()

# 에이전트 및 파서 초기화 (Worker 프로세스 시작 시 1회)
router_agent = RouterAgent()
hwp_parser = HWPParser(hancom_api_key=settings.HANCOM_API_KEY or None)
pdf_parser = PDFParser()
docx_parser = DOCXParser()


def notify_webhook(job_id: str, status: str, result: Optional[dict] = None, error: Optional[str] = None):
    """
    Webhook으로 작업 완료 알림 전송 (동기)

    Next.js API의 /api/webhooks/worker 로 전송
    """
    webhook_url = settings.WEBHOOK_URL
    if not webhook_url:
        return

    payload = {
        "job_id": job_id,
        "status": status,
        "result": result,
        "error": error,
    }

    try:
        with httpx.Client() as client:
            response = client.post(
                webhook_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Secret": settings.WEBHOOK_SECRET,
                },
                timeout=10,
            )

            if response.status_code != 200:
                logger.warning(f"Webhook notification failed: {response.status_code}")
    except Exception as e:
        logger.error(f"Webhook notification error: {e}")


def download_file_from_storage(file_path: str) -> bytes:
    """
    Supabase Storage에서 파일 다운로드

    Args:
        file_path: Storage 경로 (예: "resumes/{user_id}/{filename}")

    Returns:
        파일 바이트 데이터
    """
    from supabase import create_client

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    # Storage 버킷에서 파일 다운로드
    bucket_name = "resumes"
    response = supabase.storage.from_(bucket_name).download(file_path)

    return response


def parse_file(
    job_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
) -> dict:
    """
    파일 파싱 작업 (RQ Task)

    Storage에서 파일 다운로드 → 파싱 → 결과 반환

    Args:
        job_id: processing_jobs ID
        user_id: 사용자 ID
        file_path: Supabase Storage 경로
        file_name: 원본 파일명

    Returns:
        dict: 파싱 결과
    """
    logger.info(f"[Task] parse_file started: job={job_id}, file={file_name}")

    db_service = get_database_service()

    try:
        # 작업 상태 업데이트
        db_service.update_job_status(job_id, status="processing")

        # 1. Storage에서 파일 다운로드
        file_bytes = download_file_from_storage(file_path)

        # 2. Router Agent로 파일 분석
        router_result: RouterResult = router_agent.analyze(file_bytes, file_name)

        # 거부된 파일
        if router_result.is_rejected:
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="FILE_REJECTED",
                error_message=router_result.reject_reason
            )
            notify_webhook(job_id, "failed", error=router_result.reject_reason)
            return {"success": False, "error": router_result.reject_reason}

        # 3. 파일 타입별 파싱
        text = ""
        parse_method = "unknown"
        page_count = 0
        is_encrypted = False

        if router_result.file_type in [FileType.HWP, FileType.HWPX]:
            result = hwp_parser.parse(file_bytes, file_name)
            text = result.text
            parse_method = result.method.value
            page_count = result.page_count
            is_encrypted = result.is_encrypted

            if result.method == ParseMethod.FAILED:
                db_service.update_job_status(
                    job_id,
                    status="failed",
                    error_code="PARSE_FAILED",
                    error_message=result.error_message
                )
                notify_webhook(job_id, "failed", error=result.error_message)
                return {"success": False, "error": result.error_message}

        elif router_result.file_type == FileType.PDF:
            result = pdf_parser.parse(file_bytes)
            text = result.text
            parse_method = result.method
            page_count = result.page_count
            is_encrypted = result.is_encrypted

            if not result.success:
                db_service.update_job_status(
                    job_id,
                    status="failed",
                    error_code="PARSE_FAILED",
                    error_message=result.error_message
                )
                notify_webhook(job_id, "failed", error=result.error_message)
                return {"success": False, "error": result.error_message}

        elif router_result.file_type in [FileType.DOC, FileType.DOCX]:
            result = docx_parser.parse(file_bytes, file_name)
            text = result.text
            parse_method = result.method
            page_count = result.page_count

            if not result.success:
                db_service.update_job_status(
                    job_id,
                    status="failed",
                    error_code="PARSE_FAILED",
                    error_message=result.error_message
                )
                notify_webhook(job_id, "failed", error=result.error_message)
                return {"success": False, "error": result.error_message}

        else:
            error_msg = f"Unsupported file type: {router_result.file_type}"
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="UNSUPPORTED_TYPE",
                error_message=error_msg
            )
            notify_webhook(job_id, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        # 텍스트 길이 체크
        if len(text.strip()) < settings.MIN_TEXT_LENGTH:
            logger.warning(f"Text too short: {len(text.strip())} chars")

        logger.info(f"[Task] parse_file completed: {len(text)} chars, {page_count} pages")

        return {
            "success": True,
            "text": text,
            "file_type": router_result.file_type.value,
            "parse_method": parse_method,
            "page_count": page_count,
            "is_encrypted": is_encrypted,
        }

    except Exception as e:
        logger.error(f"[Task] parse_file error: {e}", exc_info=True)
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code="INTERNAL_ERROR",
            error_message=str(e)
        )
        notify_webhook(job_id, "failed", error=str(e))
        return {"success": False, "error": str(e)}


def process_resume(
    job_id: str,
    user_id: str,
    text: str,
    mode: str = "phase_1",
    source_file: str = "",
    file_type: str = "",
) -> dict:
    """
    이력서 분석 작업 (RQ Task)

    분석 → PII 마스킹 → 임베딩 → DB 저장 → 크레딧 차감

    Args:
        job_id: processing_jobs ID
        user_id: 사용자 ID
        text: 파싱된 텍스트
        mode: phase_1 또는 phase_2
        source_file: 원본 파일 경로
        file_type: 파일 타입

    Returns:
        dict: 처리 결과
    """
    import asyncio

    logger.info(f"[Task] process_resume started: job={job_id}, mode={mode}")
    start_time = time.time()

    db_service = get_database_service()

    try:
        # 작업 상태 업데이트
        db_service.update_job_status(job_id, status="processing")

        # 텍스트 길이 검증
        if len(text.strip()) < settings.MIN_TEXT_LENGTH:
            error_msg = f"텍스트가 너무 짧습니다 ({len(text.strip())}자)"
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="TEXT_TOO_SHORT",
                error_message=error_msg
            )
            notify_webhook(job_id, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        # 분석 모드
        analysis_mode = AnalysisMode.PHASE_2 if mode == "phase_2" else AnalysisMode.PHASE_1

        # ─────────────────────────────────────────────────
        # Step 1: 분석 (Analyst Agent)
        # ─────────────────────────────────────────────────
        analyst = get_analyst_agent()

        # RQ는 동기 환경이므로 asyncio.run 사용
        analysis_result: AnalysisResult = asyncio.run(
            analyst.analyze(resume_text=text, mode=analysis_mode)
        )

        if not analysis_result.success or not analysis_result.data:
            error_msg = analysis_result.error or "분석 실패"
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="ANALYSIS_FAILED",
                error_message=error_msg
            )
            notify_webhook(job_id, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        original_data = analysis_result.data.copy()
        analyzed_data = analysis_result.data

        # ─────────────────────────────────────────────────
        # Step 2: PII 마스킹 + 암호화 (Privacy Agent)
        # ─────────────────────────────────────────────────
        privacy_agent = get_privacy_agent()
        privacy_result: PrivacyResult = privacy_agent.process(analyzed_data)

        pii_count = 0
        encrypted_store = {}
        hash_store = {}

        if privacy_result.success:
            analyzed_data = privacy_result.masked_data
            pii_count = len(privacy_result.pii_found)
            encrypted_store = privacy_result.encrypted_store

            # 중복 체크용 해시
            if original_data.get("phone"):
                hash_store["phone"] = privacy_agent.hash_for_dedup(original_data["phone"])
            if original_data.get("email"):
                hash_store["email"] = privacy_agent.hash_for_dedup(original_data["email"])

        # ─────────────────────────────────────────────────
        # Step 3: 청킹 + 임베딩 (Embedding Service)
        # ─────────────────────────────────────────────────
        embedding_service = get_embedding_service()
        embedding_result: EmbeddingResult = asyncio.run(
            embedding_service.process_candidate(data=analyzed_data, generate_embeddings=True)
        )

        chunk_count = 0
        embedding_chunks = []

        if embedding_result.success:
            chunk_count = len(embedding_result.chunks)
            embedding_chunks = embedding_result.chunks

        # ─────────────────────────────────────────────────
        # Step 4: DB 저장 (candidates + candidate_chunks)
        # ─────────────────────────────────────────────────
        save_result: SaveResult = db_service.save_candidate(
            user_id=user_id,
            job_id=job_id,
            analyzed_data=analyzed_data,
            confidence_score=analysis_result.confidence_score,
            field_confidence=analysis_result.field_confidence,
            warnings=[w.to_dict() for w in analysis_result.warnings],
            encrypted_store=encrypted_store,
            hash_store=hash_store,
            source_file=source_file,
            file_type=file_type,
            analysis_mode=analysis_mode.value,
        )

        if not save_result.success or not save_result.candidate_id:
            error_msg = save_result.error or "DB 저장 실패"
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="DB_SAVE_FAILED",
                error_message=error_msg
            )
            notify_webhook(job_id, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        candidate_id = save_result.candidate_id

        # candidate_chunks + embedding 저장
        chunks_saved = 0
        if embedding_chunks:
            chunks_saved = db_service.save_chunks_with_embeddings(
                candidate_id=candidate_id,
                chunks=embedding_chunks
            )

        # processing_jobs 상태 업데이트
        db_service.update_job_status(
            job_id=job_id,
            status="completed",
            candidate_id=candidate_id,
            confidence_score=analysis_result.confidence_score,
            chunk_count=chunks_saved,
            pii_count=pii_count,
        )

        # 크레딧 차감
        db_service.deduct_credit(user_id, candidate_id)

        processing_time = int((time.time() - start_time) * 1000)

        logger.info(
            f"[Task] process_resume completed: candidate={candidate_id}, "
            f"confidence={analysis_result.confidence_score:.2f}, time={processing_time}ms"
        )

        # Webhook 알림
        notify_webhook(job_id, "completed", result={
            "candidate_id": candidate_id,
            "confidence_score": analysis_result.confidence_score,
            "chunk_count": chunks_saved,
            "pii_count": pii_count,
            "processing_time_ms": processing_time,
        })

        return {
            "success": True,
            "candidate_id": candidate_id,
            "confidence_score": analysis_result.confidence_score,
            "chunks_saved": chunks_saved,
            "pii_count": pii_count,
            "processing_time_ms": processing_time,
        }

    except Exception as e:
        logger.error(f"[Task] process_resume error: {e}", exc_info=True)
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code="INTERNAL_ERROR",
            error_message=str(e)
        )
        notify_webhook(job_id, "failed", error=str(e))
        return {"success": False, "error": str(e)}


def full_pipeline(
    job_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
    mode: str = "phase_1",
) -> dict:
    """
    전체 파이프라인 작업 (RQ Task)

    파일 다운로드 → 파싱 → 분석 → PII 마스킹 → 임베딩 → DB 저장 → 크레딧 차감

    Next.js API에서 호출하는 주요 작업

    Args:
        job_id: processing_jobs ID
        user_id: 사용자 ID
        file_path: Supabase Storage 경로
        file_name: 원본 파일명
        mode: phase_1 또는 phase_2

    Returns:
        dict: 전체 처리 결과
    """
    logger.info(f"[Task] full_pipeline started: job={job_id}, file={file_name}")

    db_service = get_database_service()

    try:
        # 크레딧 확인
        if not db_service.check_credit_available(user_id):
            error_msg = "크레딧이 부족합니다"
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code="INSUFFICIENT_CREDITS",
                error_message=error_msg
            )
            notify_webhook(job_id, "failed", error=error_msg)
            return {"success": False, "error": error_msg}

        # Step 1: 파일 파싱
        parse_result = parse_file(
            job_id=job_id,
            user_id=user_id,
            file_path=file_path,
            file_name=file_name,
        )

        if not parse_result.get("success"):
            return parse_result

        # Step 2: 이력서 처리
        process_result = process_resume(
            job_id=job_id,
            user_id=user_id,
            text=parse_result["text"],
            mode=mode,
            source_file=file_path,
            file_type=parse_result.get("file_type", ""),
        )

        return process_result

    except Exception as e:
        logger.error(f"[Task] full_pipeline error: {e}", exc_info=True)
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code="INTERNAL_ERROR",
            error_message=str(e)
        )
        notify_webhook(job_id, "failed", error=str(e))
        return {"success": False, "error": str(e)}
