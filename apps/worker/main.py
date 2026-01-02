"""
RAI Worker - FastAPI Entry Point
파일 처리 파이프라인 서버
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings, AnalysisMode
from agents.router_agent import RouterAgent, FileType, RouterResult
from agents.analyst_agent import AnalystAgent, get_analyst_agent, AnalysisResult
from agents.privacy_agent import PrivacyAgent, get_privacy_agent, PrivacyResult
from utils.hwp_parser import HWPParser, ParseMethod
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser
from services.llm_manager import get_llm_manager
from services.embedding_service import EmbeddingService, get_embedding_service, EmbeddingResult
from services.database_service import DatabaseService, get_database_service, SaveResult
from services.queue_service import get_queue_service, QueuedJob

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    logger.info(f"RAI Worker starting... (Mode: {settings.ANALYSIS_MODE})")
    yield
    logger.info("RAI Worker shutting down...")


app = FastAPI(
    title="RAI Worker",
    description="Recruitment Asset Intelligence - File Processing Pipeline",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 에이전트 및 파서 초기화
router_agent = RouterAgent()
hwp_parser = HWPParser(hancom_api_key=settings.HANCOM_API_KEY or None)
pdf_parser = PDFParser()
docx_parser = DOCXParser()


class ParseResponse(BaseModel):
    """파싱 응답 모델"""
    success: bool
    text: str
    file_type: str
    parse_method: str
    page_count: int
    is_encrypted: bool = False
    error_message: Optional[str] = None
    warnings: list[str] = []


class HealthResponse(BaseModel):
    """헬스체크 응답"""
    status: str
    mode: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """헬스체크 엔드포인트"""
    return HealthResponse(
        status="healthy",
        mode=settings.ANALYSIS_MODE.value,
        version="1.0.0"
    )


@app.post("/parse", response_model=ParseResponse)
async def parse_file(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    job_id: Optional[str] = Form(None)
):
    """
    파일 파싱 엔드포인트

    1. Router Agent로 파일 타입 감지 및 유효성 검사
    2. 적절한 Parser로 텍스트 추출
    """
    logger.info(f"Parsing file: {file.filename} for user: {user_id}")

    try:
        # 파일 읽기
        file_bytes = await file.read()
        filename = file.filename or "unknown"

        # 1. Router Agent로 파일 분석
        router_result: RouterResult = router_agent.analyze(file_bytes, filename)

        # 거부된 파일 처리
        if router_result.is_rejected:
            logger.warning(f"File rejected: {router_result.reject_reason}")
            return ParseResponse(
                success=False,
                text="",
                file_type=router_result.file_type.value if router_result.file_type else "unknown",
                parse_method="rejected",
                page_count=0,
                is_encrypted=router_result.is_encrypted,
                error_message=router_result.reject_reason,
                warnings=router_result.warnings
            )

        # 2. 파일 타입에 따른 파싱
        text = ""
        parse_method = "unknown"
        page_count = 0
        is_encrypted = False
        error_message = None
        warnings = router_result.warnings.copy()

        if router_result.file_type in [FileType.HWP, FileType.HWPX]:
            # HWP/HWPX 파싱
            result = hwp_parser.parse(file_bytes, filename)
            text = result.text
            parse_method = result.method.value
            page_count = result.page_count
            is_encrypted = result.is_encrypted
            error_message = result.error_message

            if result.method == ParseMethod.FAILED:
                return ParseResponse(
                    success=False,
                    text="",
                    file_type=router_result.file_type.value,
                    parse_method=parse_method,
                    page_count=0,
                    is_encrypted=is_encrypted,
                    error_message=error_message,
                    warnings=warnings
                )

        elif router_result.file_type == FileType.PDF:
            # PDF 파싱
            result = pdf_parser.parse(file_bytes)
            text = result.text
            parse_method = result.method
            page_count = result.page_count
            is_encrypted = result.is_encrypted
            error_message = result.error_message

            if not result.success:
                return ParseResponse(
                    success=False,
                    text="",
                    file_type=router_result.file_type.value,
                    parse_method=parse_method,
                    page_count=0,
                    is_encrypted=is_encrypted,
                    error_message=error_message,
                    warnings=warnings
                )

        elif router_result.file_type in [FileType.DOC, FileType.DOCX]:
            # DOC/DOCX 파싱
            result = docx_parser.parse(file_bytes, filename)
            text = result.text
            parse_method = result.method
            page_count = result.page_count
            error_message = result.error_message

            if not result.success:
                return ParseResponse(
                    success=False,
                    text="",
                    file_type=router_result.file_type.value,
                    parse_method=parse_method,
                    page_count=0,
                    error_message=error_message,
                    warnings=warnings
                )
        else:
            return ParseResponse(
                success=False,
                text="",
                file_type="unknown",
                parse_method="unsupported",
                page_count=0,
                error_message=f"Unsupported file type: {router_result.file_type}",
                warnings=warnings
            )

        # 텍스트 길이 체크
        if len(text.strip()) < settings.MIN_TEXT_LENGTH:
            warnings.append(f"추출된 텍스트가 너무 짧습니다 ({len(text.strip())}자). 스캔 이미지일 수 있습니다.")

        logger.info(f"Successfully parsed {filename}: {len(text)} chars, {page_count} pages")

        return ParseResponse(
            success=True,
            text=text,
            file_type=router_result.file_type.value,
            parse_method=parse_method,
            page_count=page_count,
            is_encrypted=is_encrypted,
            warnings=warnings
        )

    except Exception as e:
        logger.error(f"Error parsing file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class AnalyzeRequest(BaseModel):
    """분석 요청 모델"""
    text: str
    user_id: str
    job_id: Optional[str] = None
    mode: Optional[str] = None  # "phase_1" or "phase_2"


class AnalyzeResponse(BaseModel):
    """분석 응답 모델"""
    success: bool
    data: Optional[dict] = None
    confidence_score: float = 0.0
    field_confidence: dict = {}
    warnings: list = []
    processing_time_ms: int = 0
    mode: str = "phase_1"
    error: Optional[str] = None


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_resume(request: AnalyzeRequest):
    """
    이력서 분석 엔드포인트

    2-Way Cross-Check (Phase 1): GPT-4o + Gemini 1.5 Pro
    3-Way Cross-Check (Phase 2): + Claude 3.5 Sonnet

    Args:
        request: 분석 요청 (text, user_id, job_id, mode)

    Returns:
        AnalyzeResponse with extracted data and confidence scores
    """
    logger.info(f"Analyzing resume for user: {request.user_id}, job: {request.job_id}")

    try:
        # 텍스트 길이 검증
        if len(request.text.strip()) < settings.MIN_TEXT_LENGTH:
            return AnalyzeResponse(
                success=False,
                error=f"텍스트가 너무 짧습니다 ({len(request.text.strip())}자). 최소 {settings.MIN_TEXT_LENGTH}자 필요"
            )

        # 분석 모드 결정
        analysis_mode = AnalysisMode.PHASE_1
        if request.mode == "phase_2":
            analysis_mode = AnalysisMode.PHASE_2

        # Analyst Agent로 분석
        analyst = get_analyst_agent()
        result: AnalysisResult = await analyst.analyze(
            resume_text=request.text,
            mode=analysis_mode
        )

        logger.info(
            f"Analysis complete: confidence={result.confidence_score:.2f}, "
            f"warnings={len(result.warnings)}, time={result.processing_time_ms}ms"
        )

        return AnalyzeResponse(
            success=result.success,
            data=result.data,
            confidence_score=result.confidence_score,
            field_confidence=result.field_confidence,
            warnings=[w.to_dict() for w in result.warnings],
            processing_time_ms=result.processing_time_ms,
            mode=result.mode.value,
            error=result.error
        )

    except ValueError as e:
        logger.warning(f"Analysis validation error: {e}")
        return AnalyzeResponse(
            success=False,
            error=str(e)
        )
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        return AnalyzeResponse(
            success=False,
            error=f"분석 중 오류 발생: {str(e)}"
        )


class ProcessRequest(BaseModel):
    """전체 처리 요청 모델"""
    text: str
    user_id: str
    job_id: Optional[str] = None
    mode: Optional[str] = None
    generate_embeddings: bool = True
    mask_pii: bool = True
    save_to_db: bool = True  # DB 저장 여부
    source_file: Optional[str] = None  # 원본 파일 경로
    file_type: Optional[str] = None  # 파일 타입


class ProcessResponse(BaseModel):
    """전체 처리 응답 모델"""
    success: bool
    # DB 저장 결과
    candidate_id: Optional[str] = None
    # 분석 결과
    data: Optional[dict] = None
    confidence_score: float = 0.0
    field_confidence: dict = {}
    analysis_warnings: list = []
    # PII 처리 결과
    pii_count: int = 0
    pii_types: list = []
    privacy_warnings: list = []
    encrypted_fields: list = []
    # 청킹/임베딩 결과
    chunk_count: int = 0
    chunks_saved: int = 0  # 실제 저장된 청크 수
    embedding_tokens: int = 0
    # 메타
    processing_time_ms: int = 0
    mode: str = "phase_1"
    error: Optional[str] = None


@app.post("/process", response_model=ProcessResponse)
async def process_resume(request: ProcessRequest):
    """
    이력서 전체 처리 파이프라인

    1. 분석 (Analyst Agent) - GPT-4o + Gemini Cross-Check
    2. PII 마스킹 (Privacy Agent)
    3. 청킹 + 임베딩 (Embedding Service)
    4. DB 저장 (candidates + candidate_chunks)
    5. 크레딧 차감

    Args:
        request: 처리 요청

    Returns:
        ProcessResponse with all results
    """
    import time
    start_time = time.time()

    logger.info(f"Processing resume for user: {request.user_id}, job: {request.job_id}")

    try:
        # 텍스트 길이 검증
        if len(request.text.strip()) < settings.MIN_TEXT_LENGTH:
            return ProcessResponse(
                success=False,
                error=f"텍스트가 너무 짧습니다 ({len(request.text.strip())}자)"
            )

        # 분석 모드 결정
        analysis_mode = AnalysisMode.PHASE_1
        if request.mode == "phase_2":
            analysis_mode = AnalysisMode.PHASE_2

        # ─────────────────────────────────────────────────
        # Step 1: 분석 (Analyst Agent)
        # ─────────────────────────────────────────────────
        analyst = get_analyst_agent()
        analysis_result: AnalysisResult = await analyst.analyze(
            resume_text=request.text,
            mode=analysis_mode
        )

        if not analysis_result.success or not analysis_result.data:
            return ProcessResponse(
                success=False,
                processing_time_ms=int((time.time() - start_time) * 1000),
                mode=analysis_mode.value,
                error=analysis_result.error or "분석 실패"
            )

        # 원본 데이터 보관 (암호화 전)
        original_data = analysis_result.data.copy()
        analyzed_data = analysis_result.data

        # ─────────────────────────────────────────────────
        # Step 2: PII 마스킹 + 암호화 (Privacy Agent)
        # ─────────────────────────────────────────────────
        pii_count = 0
        pii_types = []
        privacy_warnings = []
        encrypted_store = {}
        hash_store = {}

        if request.mask_pii:
            privacy_agent = get_privacy_agent()
            privacy_result: PrivacyResult = privacy_agent.process(analyzed_data)

            if privacy_result.success:
                analyzed_data = privacy_result.masked_data
                pii_count = len(privacy_result.pii_found)
                pii_types = list(set(p.pii_type.value for p in privacy_result.pii_found))
                privacy_warnings = privacy_result.warnings
                encrypted_store = privacy_result.encrypted_store

                # 원본 데이터로 해시 생성
                if original_data.get("phone"):
                    hash_store["phone"] = privacy_agent.hash_for_dedup(original_data["phone"])
                if original_data.get("email"):
                    hash_store["email"] = privacy_agent.hash_for_dedup(original_data["email"])

        # ─────────────────────────────────────────────────
        # Step 3: 청킹 + 임베딩 (Embedding Service)
        # ─────────────────────────────────────────────────
        chunk_count = 0
        embedding_tokens = 0
        embedding_chunks = []

        if request.generate_embeddings:
            embedding_service = get_embedding_service()
            embedding_result: EmbeddingResult = await embedding_service.process_candidate(
                data=analyzed_data,
                generate_embeddings=True
            )

            if embedding_result.success:
                chunk_count = len(embedding_result.chunks)
                embedding_tokens = embedding_result.total_tokens
                embedding_chunks = embedding_result.chunks

        # ─────────────────────────────────────────────────
        # Step 4: DB 저장 (candidates + candidate_chunks)
        # ─────────────────────────────────────────────────
        candidate_id = None
        chunks_saved = 0

        if request.save_to_db and request.job_id:
            db_service = get_database_service()

            # candidates 저장
            save_result: SaveResult = db_service.save_candidate(
                user_id=request.user_id,
                job_id=request.job_id,
                analyzed_data=analyzed_data,
                confidence_score=analysis_result.confidence_score,
                field_confidence=analysis_result.field_confidence,
                warnings=[w.to_dict() for w in analysis_result.warnings],
                encrypted_store=encrypted_store,
                hash_store=hash_store,
                source_file=request.source_file or "",
                file_type=request.file_type or "",
                analysis_mode=analysis_mode.value,
            )

            if save_result.success and save_result.candidate_id:
                candidate_id = save_result.candidate_id

                # candidate_chunks + embedding 저장
                if embedding_chunks:
                    chunks_saved = db_service.save_chunks_with_embeddings(
                        candidate_id=candidate_id,
                        chunks=embedding_chunks
                    )

                # processing_jobs 상태 업데이트
                db_service.update_job_status(
                    job_id=request.job_id,
                    status="completed",
                    candidate_id=candidate_id,
                    confidence_score=analysis_result.confidence_score,
                    chunk_count=chunks_saved,
                    pii_count=pii_count,
                )

                # 크레딧 차감 (candidate_id 포함)
                db_service.deduct_credit(request.user_id, candidate_id)

            else:
                logger.error(f"Failed to save candidate: {save_result.error}")

        processing_time = int((time.time() - start_time) * 1000)

        logger.info(
            f"Processing complete: candidate={candidate_id}, confidence={analysis_result.confidence_score:.2f}, "
            f"pii={pii_count}, chunks={chunks_saved}/{chunk_count}, time={processing_time}ms"
        )

        return ProcessResponse(
            success=True,
            candidate_id=candidate_id,
            data=analyzed_data,
            confidence_score=analysis_result.confidence_score,
            field_confidence=analysis_result.field_confidence,
            analysis_warnings=[w.to_dict() for w in analysis_result.warnings],
            pii_count=pii_count,
            pii_types=pii_types,
            privacy_warnings=privacy_warnings,
            encrypted_fields=list(encrypted_store.keys()),
            chunk_count=chunk_count,
            chunks_saved=chunks_saved,
            embedding_tokens=embedding_tokens,
            processing_time_ms=processing_time,
            mode=analysis_mode.value
        )

    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)
        return ProcessResponse(
            success=False,
            processing_time_ms=int((time.time() - start_time) * 1000),
            error=f"처리 중 오류 발생: {str(e)}"
        )


# ─────────────────────────────────────────────────
# Queue Endpoints (Redis RQ)
# ─────────────────────────────────────────────────

class EnqueueRequest(BaseModel):
    """Queue 작업 추가 요청"""
    job_id: str
    user_id: str
    file_path: str
    file_name: str
    mode: Optional[str] = "phase_1"


class EnqueueResponse(BaseModel):
    """Queue 작업 추가 응답"""
    success: bool
    job_id: Optional[str] = None
    rq_job_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None


class QueueStatusResponse(BaseModel):
    """Queue 상태 응답"""
    available: bool
    parse_queue_size: int = 0
    process_queue_size: int = 0


@app.get("/queue/status", response_model=QueueStatusResponse)
async def queue_status():
    """Queue 상태 확인"""
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return QueueStatusResponse(available=False)

    parse_size = len(queue_service.parse_queue) if queue_service.parse_queue else 0
    process_size = len(queue_service.process_queue) if queue_service.process_queue else 0

    return QueueStatusResponse(
        available=True,
        parse_queue_size=parse_size,
        process_queue_size=process_size,
    )


@app.post("/queue/enqueue", response_model=EnqueueResponse)
async def enqueue_job(request: EnqueueRequest):
    """
    Redis Queue에 작업 추가

    full_pipeline 작업을 Queue에 추가하고 즉시 반환
    Worker가 백그라운드에서 처리
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return EnqueueResponse(
            success=False,
            error="Queue service not available"
        )

    try:
        queued_job: QueuedJob = queue_service.enqueue_full_pipeline(
            job_id=request.job_id,
            user_id=request.user_id,
            file_path=request.file_path,
            file_name=request.file_name,
            mode=request.mode or "phase_1",
        )

        if queued_job:
            logger.info(f"Job enqueued: {request.job_id} -> {queued_job.rq_job_id}")
            return EnqueueResponse(
                success=True,
                job_id=queued_job.job_id,
                rq_job_id=queued_job.rq_job_id,
                status=queued_job.status,
            )
        else:
            return EnqueueResponse(
                success=False,
                error="Failed to enqueue job"
            )

    except Exception as e:
        logger.error(f"Enqueue error: {e}")
        return EnqueueResponse(
            success=False,
            error=str(e)
        )


@app.get("/queue/job/{rq_job_id}")
async def get_job_status(rq_job_id: str):
    """RQ Job 상태 조회"""
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return {"error": "Queue service not available"}

    status = queue_service.get_job_status(rq_job_id)
    if status:
        return status
    else:
        return {"error": "Job not found"}


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.DEBUG
    )
