"""
RAI Worker - FastAPI Entry Point
파일 처리 파이프라인 서버
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
import hashlib
import hmac
import secrets

from config import settings, AnalysisMode

# ─────────────────────────────────────────────────
# Sentry 초기화
# ─────────────────────────────────────────────────
SENTRY_DSN = os.getenv("SENTRY_DSN")

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=settings.ENV,

        # 트레이스 샘플링 비율
        traces_sample_rate=0.1 if settings.ENV == "production" else 1.0,

        # 프로파일링 (성능 모니터링)
        profiles_sample_rate=0.1 if settings.ENV == "production" else 0.5,

        # 인테그레이션
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR,
            ),
        ],

        # 민감한 데이터 필터링
        send_default_pii=False,

        # 무시할 에러
        ignore_errors=[
            KeyboardInterrupt,
            SystemExit,
        ],

        # 개발 환경에서만 디버그
        debug=settings.DEBUG,

        # 이벤트 전송 전 필터링
        before_send=lambda event, hint: (
            None if settings.ENV == "development" else event
        ),
    )
from agents.router_agent import RouterAgent, FileType, RouterResult
from agents.analyst_agent import AnalystAgent, get_analyst_agent, AnalysisResult
from agents.privacy_agent import PrivacyAgent, get_privacy_agent, PrivacyResult
from utils.hwp_parser import HWPParser, ParseMethod
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser
from services.llm_manager import get_llm_manager
from services.embedding_service import EmbeddingService, get_embedding_service, EmbeddingResult
from services.database_service import DatabaseService, get_database_service, SaveResult
from services.queue_service import get_queue_service, QueuedJob, DLQEntry
from services.pdf_converter import get_pdf_converter, PDFConversionResult
from orchestrator.feature_flags import get_feature_flags
from orchestrator.pipeline_orchestrator import get_pipeline_orchestrator

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

# ─────────────────────────────────────────────────
# CORS 설정
# ─────────────────────────────────────────────────
def get_allowed_origins() -> list[str]:
    """
    허용된 CORS origins 반환

    프로덕션: ALLOWED_ORIGINS 환경 변수에서 읽음
    개발: localhost 허용
    """
    if settings.ALLOWED_ORIGINS:
        # 쉼표로 구분된 도메인 목록
        origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
        if origins:
            return origins

    # 기본값 (개발 환경)
    if settings.ENV == "development" or settings.DEBUG:
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
        ]

    # 프로덕션에서 ALLOWED_ORIGINS가 설정되지 않은 경우
    # 보안을 위해 빈 목록 반환 (모든 요청 차단)
    logger.warning("ALLOWED_ORIGINS not configured in production!")
    return []


allowed_origins = get_allowed_origins()
logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────
# API 인증 미들웨어
# ─────────────────────────────────────────────────
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: str = Depends(api_key_header),
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature"),
    request: Request = None,
) -> bool:
    """
    API 키 또는 Webhook Signature 검증

    프로덕션 환경에서는 다음 중 하나로 인증 필요:
    1. X-API-Key 헤더 (WEBHOOK_SECRET과 일치)
    2. X-Webhook-Signature 헤더 (HMAC-SHA256)

    개발 환경에서는 인증 없이 허용
    """
    # 개발 환경에서는 인증 스킵
    if settings.ENV == "development" or settings.DEBUG:
        return True

    # Webhook Secret이 설정되지 않은 경우
    if not settings.WEBHOOK_SECRET:
        logger.warning("WEBHOOK_SECRET not configured - rejecting request")
        raise HTTPException(
            status_code=500,
            detail="Server misconfigured: WEBHOOK_SECRET required"
        )

    # 1. API Key 검증 (단순 비교)
    if api_key:
        if secrets.compare_digest(api_key, settings.WEBHOOK_SECRET):
            return True

    # 2. Webhook Signature 검증 (HMAC-SHA256)
    if x_webhook_signature and request:
        try:
            body = await request.body()
            expected_sig = hmac.new(
                settings.WEBHOOK_SECRET.encode(),
                body,
                hashlib.sha256
            ).hexdigest()

            if secrets.compare_digest(x_webhook_signature, f"sha256={expected_sig}"):
                return True
        except Exception as e:
            logger.warning(f"Webhook signature verification failed: {e}")

    # 인증 실패
    raise HTTPException(
        status_code=401,
        detail="Invalid or missing API key"
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


class DependencyStatus(BaseModel):
    """의존성 상태"""
    name: str
    status: str  # "healthy", "unhealthy", "unconfigured"
    latency_ms: Optional[float] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """헬스체크 응답"""
    status: str  # "healthy", "degraded", "unhealthy"
    mode: str
    version: str
    dependencies: Optional[list[DependencyStatus]] = None


@app.get("/health", response_model=HealthResponse)
async def health_check(detailed: bool = False):
    """
    헬스체크 엔드포인트

    Args:
        detailed: True면 의존성 상태 포함

    Returns:
        HealthResponse with overall status and optional dependency details
    """
    import time

    dependencies = []
    all_healthy = True
    any_unhealthy = False

    # 기본 헬스체크: 필수 의존성(Supabase, LLM) 상태만 빠르게 확인
    # Supabase 설정 확인
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        all_healthy = False

    # LLM 설정 확인 (최소 1개 이상 필요)
    llm_manager = get_llm_manager()
    if not llm_manager.openai_client and not llm_manager.gemini_client:
        any_unhealthy = True

    # DB 클라이언트 초기화 확인
    db_service = get_database_service()
    if not db_service.client:
        any_unhealthy = True

    if detailed:
        # 1. Supabase 연결 확인
        supabase_status = DependencyStatus(name="supabase", status="unconfigured")
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            try:
                start = time.time()
                db_service = get_database_service()
                if db_service.client:
                    # 간단한 쿼리로 연결 확인
                    result = db_service.client.table("users").select("id").limit(1).execute()
                    latency = (time.time() - start) * 1000
                    supabase_status = DependencyStatus(
                        name="supabase",
                        status="healthy",
                        latency_ms=round(latency, 2)
                    )
                else:
                    supabase_status = DependencyStatus(
                        name="supabase",
                        status="unhealthy",
                        error="Client not initialized"
                    )
                    any_unhealthy = True
            except Exception as e:
                supabase_status = DependencyStatus(
                    name="supabase",
                    status="unhealthy",
                    error=str(e)[:100]
                )
                any_unhealthy = True
        else:
            all_healthy = False
        dependencies.append(supabase_status)

        # 2. LLM Providers 확인
        llm_manager = get_llm_manager()

        # OpenAI
        openai_status = DependencyStatus(name="openai", status="unconfigured")
        if settings.OPENAI_API_KEY:
            if llm_manager.openai_client:
                openai_status = DependencyStatus(name="openai", status="healthy")
            else:
                openai_status = DependencyStatus(
                    name="openai",
                    status="unhealthy",
                    error="Client initialization failed"
                )
                any_unhealthy = True
        dependencies.append(openai_status)

        # Gemini
        gemini_status = DependencyStatus(name="gemini", status="unconfigured")
        if settings.GOOGLE_AI_API_KEY:
            if llm_manager.gemini_client:
                gemini_status = DependencyStatus(name="gemini", status="healthy")
            else:
                gemini_status = DependencyStatus(
                    name="gemini",
                    status="unhealthy",
                    error="Client initialization failed"
                )
        dependencies.append(gemini_status)

        # Anthropic
        anthropic_status = DependencyStatus(name="anthropic", status="unconfigured")
        if settings.ANTHROPIC_API_KEY:
            if llm_manager.anthropic_client:
                anthropic_status = DependencyStatus(name="anthropic", status="healthy")
            else:
                anthropic_status = DependencyStatus(
                    name="anthropic",
                    status="unhealthy",
                    error="Client initialization failed"
                )
        dependencies.append(anthropic_status)

        # 3. Queue Service (Redis) 확인
        queue_status = DependencyStatus(name="redis", status="unconfigured")
        if settings.REDIS_URL:
            try:
                queue_service = get_queue_service()
                if queue_service.is_available:
                    queue_status = DependencyStatus(name="redis", status="healthy")
                else:
                    queue_status = DependencyStatus(
                        name="redis",
                        status="unhealthy",
                        error="Queue not available"
                    )
            except Exception as e:
                queue_status = DependencyStatus(
                    name="redis",
                    status="unhealthy",
                    error=str(e)[:100]
                )
        dependencies.append(queue_status)

    # 전체 상태 결정
    # - healthy: 모든 필수 의존성 정상
    # - degraded: 일부 의존성 문제 있지만 동작 가능
    # - unhealthy: 핵심 의존성(Supabase, LLM) 실패
    if any_unhealthy:
        overall_status = "degraded"
    elif not all_healthy:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return HealthResponse(
        status=overall_status,
        mode=settings.ANALYSIS_MODE.value,
        version="1.0.0",
        dependencies=dependencies if detailed else None
    )


@app.get("/debug")
async def debug_status():
    """
    디버그 엔드포인트 - LLM 및 서비스 설정 상태 확인

    프로덕션 환경에서는 비활성화됩니다.
    민감한 정보(API 키 prefix 등)는 노출하지 않습니다.
    """
    # 프로덕션 환경에서는 비활성화
    if settings.ENV == "production" and not settings.DEBUG:
        raise HTTPException(
            status_code=404,
            detail="Not found"
        )

    llm_manager = get_llm_manager()
    available_providers = llm_manager.get_available_providers()

    # Feature Flags 정보
    feature_flags = get_feature_flags()

    # 민감한 정보 제거 - API 키 prefix 노출하지 않음
    return {
        "status": "healthy",
        "mode": settings.ANALYSIS_MODE.value,
        "version": "1.0.0",
        "llm_providers": [p.value for p in available_providers],
        "llm_status": {
            "openai": {
                "configured": bool(settings.OPENAI_API_KEY),
                "client_ready": llm_manager.openai_client is not None,
                "model": settings.OPENAI_MODEL,
            },
            "gemini": {
                "configured": bool(settings.GOOGLE_AI_API_KEY),
                "client_ready": llm_manager.gemini_client is not None,
                "model": settings.GEMINI_MODEL,
            },
            "anthropic": {
                "configured": bool(settings.ANTHROPIC_API_KEY),
                "client_ready": llm_manager.anthropic_client is not None,
                "model": settings.ANTHROPIC_MODEL,
            },
        },
        "feature_flags": {
            "use_new_pipeline": feature_flags.use_new_pipeline,
            "use_llm_validation": feature_flags.use_llm_validation,
            "use_agent_messaging": feature_flags.use_agent_messaging,
            "use_hallucination_detection": feature_flags.use_hallucination_detection,
            "use_evidence_tracking": feature_flags.use_evidence_tracking,
            "new_pipeline_rollout_percentage": feature_flags.new_pipeline_rollout_percentage,
            "new_pipeline_user_count": len(feature_flags.new_pipeline_user_ids),
            "debug_pipeline": feature_flags.debug_pipeline,
        },
        "supabase_configured": bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY),
        "redis_configured": bool(settings.REDIS_URL),
        "env": settings.ENV,
    }


@app.post("/parse", response_model=ParseResponse)
async def parse_file(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    job_id: Optional[str] = Form(None),
    _: bool = Depends(verify_api_key),  # API 인증 필수
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
async def analyze_resume(request: AnalyzeRequest, _: bool = Depends(verify_api_key)):
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
async def process_resume(request: ProcessRequest, _: bool = Depends(verify_api_key)):
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
                generate_embeddings=True,
                raw_text=request.text  # PRD v0.1: 원본 텍스트 전달
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

                # 크레딧 차감 - REMOVED
                # 크레딧은 presign 단계에서 reserve_credit()으로 이미 차감됨
                # db_service.deduct_credit(request.user_id, candidate_id)

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
async def queue_status(_: bool = Depends(verify_api_key)):
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
async def enqueue_job(request: EnqueueRequest, _: bool = Depends(verify_api_key)):
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
async def get_job_status(rq_job_id: str, _: bool = Depends(verify_api_key)):
    """RQ Job 상태 조회"""
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return {"error": "Queue service not available"}

    status = queue_service.get_job_status(rq_job_id)
    if status:
        return status
    else:
        return {"error": "Job not found"}


# ─────────────────────────────────────────────────
# Pipeline Endpoint (전체 처리 - 비동기 백그라운드)
# ─────────────────────────────────────────────────

class PipelineRequest(BaseModel):
    """파이프라인 요청 모델"""
    file_url: str  # Supabase Storage 경로
    file_name: str
    user_id: str
    job_id: str
    candidate_id: Optional[str] = None
    mode: Optional[str] = "phase_1"
    is_retry: bool = False  # 재시도 여부
    skip_credit_deduction: bool = False  # 크레딧 차감 스킵 (이미 차감된 경우)


class PipelineResponse(BaseModel):
    """파이프라인 응답 모델"""
    success: bool
    message: str
    job_id: str


async def run_pipeline(
    file_url: str,
    file_name: str,
    user_id: str,
    job_id: str,
    mode: str,
    candidate_id: Optional[str] = None,
    skip_credit_deduction: bool = False,
):
    """
    전체 처리 파이프라인 (백그라운드 실행)

    1. Supabase Storage에서 파일 다운로드
    2. 파일 파싱 (PDF/HWP/DOCX)
    3. AI 분석 (GPT-4o + Gemini)
    4. PII 마스킹 + 암호화
    5. 임베딩 생성
    6. DB 저장
    7. 크레딧 차감
    """
    import time
    start_time = time.time()

    db_service = get_database_service()

    logger.info(f"[Pipeline] Starting for job {job_id}, file: {file_name}")

    try:
        # Step 0: Job 상태 업데이트 (processing)
        db_service.update_job_status(job_id, "processing")

        # Step 1: Supabase Storage에서 파일 다운로드
        logger.info(f"[Pipeline] Downloading file from storage: {file_url}")

        if not db_service.client:
            raise Exception("Supabase client not initialized")

        file_response = db_service.client.storage.from_("resumes").download(file_url)

        if not file_response:
            raise Exception(f"Failed to download file: {file_url}")

        file_bytes = file_response
        logger.info(f"[Pipeline] Downloaded {len(file_bytes)} bytes")

        # Step 2: 파일 파싱
        logger.info(f"[Pipeline] Parsing file: {file_name}")

        # 파일 타입 감지
        router_result = router_agent.analyze(file_bytes, file_name)

        if router_result.is_rejected:
            raise Exception(f"File rejected: {router_result.reject_reason}")

        # 파서 선택 및 파싱
        text = ""
        parse_method = "unknown"
        page_count = 0

        if router_result.file_type in [FileType.HWP, FileType.HWPX]:
            result = hwp_parser.parse(file_bytes, file_name)
            text = result.text
            parse_method = result.method.value
            page_count = result.page_count
            if result.method == ParseMethod.FAILED:
                raise Exception(f"HWP parsing failed: {result.error_message}")

        elif router_result.file_type == FileType.PDF:
            result = pdf_parser.parse(file_bytes)
            text = result.text
            parse_method = result.method
            page_count = result.page_count
            if not result.success:
                raise Exception(f"PDF parsing failed: {result.error_message}")

        elif router_result.file_type in [FileType.DOC, FileType.DOCX]:
            result = docx_parser.parse(file_bytes, file_name)
            text = result.text
            parse_method = result.method
            page_count = result.page_count
            if not result.success:
                raise Exception(f"DOCX parsing failed: {result.error_message}")
        else:
            raise Exception(f"Unsupported file type: {router_result.file_type}")

        logger.info(f"[Pipeline] Parsed successfully: {len(text)} chars, {page_count} pages")

        # Step 2.5: PDF 변환 (원본이 PDF가 아닌 경우)
        # PDF Viewer에서 볼 수 있도록 DOC/DOCX/HWP → PDF 변환
        pdf_storage_path: Optional[str] = None
        if router_result.file_type != FileType.PDF:
            logger.info(f"[Pipeline] Converting {router_result.file_type.value} to PDF...")
            pdf_converter = get_pdf_converter()
            conversion_result = pdf_converter.convert_to_pdf(file_bytes, file_name)

            if conversion_result.success and conversion_result.pdf_bytes:
                # Storage에 변환된 PDF 업로드
                pdf_storage_path = db_service.upload_converted_pdf(
                    pdf_bytes=conversion_result.pdf_bytes,
                    user_id=user_id,
                    job_id=job_id,
                )
                if pdf_storage_path:
                    logger.info(f"[Pipeline] PDF converted and uploaded: {pdf_storage_path}")
                else:
                    logger.warning(f"[Pipeline] Failed to upload converted PDF")
            else:
                # 변환 실패해도 파이프라인은 계속 진행 (텍스트 추출은 성공했으므로)
                logger.warning(f"[Pipeline] PDF conversion failed: {conversion_result.error_message}")

        # 텍스트 길이 체크
        if len(text.strip()) < settings.MIN_TEXT_LENGTH:
            raise Exception(f"Extracted text too short ({len(text.strip())} chars)")

        # Progressive Loading: 파싱 완료 상태 업데이트 (40%)
        if candidate_id:
            # 간단한 정보 추출 (이름, 연락처 등)
            quick_data = {
                "name": None,
                "phone": None,
                "email": None,
            }
            # 텍스트에서 기본 정보 추출 시도 (간단한 정규식)
            import re
            # 이메일 추출
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
            if email_match:
                quick_data["email"] = email_match.group()
            # 전화번호 추출
            phone_match = re.search(r'01[016789][-\s]?\d{3,4}[-\s]?\d{4}', text)
            if phone_match:
                quick_data["phone"] = phone_match.group()

            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="parsed",
                quick_extracted=quick_data if any(quick_data.values()) else None
            )
            logger.info(f"[Pipeline] Candidate status updated to 'parsed'")

        # Step 3: AI 분석
        logger.info(f"[Pipeline] Analyzing resume...")

        analysis_mode = AnalysisMode.PHASE_2 if mode == "phase_2" else AnalysisMode.PHASE_1
        analyst = get_analyst_agent()
        analysis_result = await analyst.analyze(
            resume_text=text,
            mode=analysis_mode,
            filename=file_name
        )

        if not analysis_result.success or not analysis_result.data:
            raise Exception(f"Analysis failed: {analysis_result.error}")

        logger.info(f"[Pipeline] Analysis complete: confidence={analysis_result.confidence_score:.2f}")

        # Progressive Loading: AI 분석 완료 상태 업데이트 (80%)
        if candidate_id:
            # 분석 결과에서 빠른 정보 추출
            quick_data = {
                "name": analysis_result.data.get("name"),
                "phone": analysis_result.data.get("phone"),
                "email": analysis_result.data.get("email"),
                "last_company": analysis_result.data.get("last_company"),
                "last_position": analysis_result.data.get("last_position"),
            }
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="analyzed",
                quick_extracted={k: v for k, v in quick_data.items() if v}
            )
            logger.info(f"[Pipeline] Candidate status updated to 'analyzed'")

        # 원본 데이터 보관
        original_data = analysis_result.data.copy()
        analyzed_data = analysis_result.data

        # Step 4: PII 마스킹 + 암호화
        logger.info(f"[Pipeline] Processing PII...")

        privacy_agent = get_privacy_agent()
        privacy_result = privacy_agent.process(analyzed_data)

        encrypted_store = {}
        hash_store = {}
        pii_count = 0

        if privacy_result.success:
            analyzed_data = privacy_result.masked_data
            pii_count = len(privacy_result.pii_found)
            encrypted_store = privacy_result.encrypted_store

            if original_data.get("phone"):
                hash_store["phone"] = privacy_agent.hash_for_dedup(original_data["phone"])
            if original_data.get("email"):
                hash_store["email"] = privacy_agent.hash_for_dedup(original_data["email"])

        logger.info(f"[Pipeline] PII processed: {pii_count} items found")

        # Step 5: 임베딩 생성 (실패해도 DB 저장은 진행)
        logger.info(f"[Pipeline] Generating embeddings...")

        embedding_result = None
        chunk_count = 0
        try:
            embedding_service = get_embedding_service()
            embedding_result = await embedding_service.process_candidate(
                data=analyzed_data,
                generate_embeddings=True,
                raw_text=text  # PRD v0.1: 원본 텍스트 전달하여 raw 청크 생성
            )
            chunk_count = len(embedding_result.chunks) if embedding_result and embedding_result.success else 0
            logger.info(f"[Pipeline] Embeddings generated: {chunk_count} chunks")
        except Exception as embed_error:
            logger.warning(f"[Pipeline] Embedding generation failed (continuing to DB save): {embed_error}")
            embedding_result = None
            chunk_count = 0

        # Step 6: DB 저장
        logger.info(f"[Pipeline] Saving to database...")

        save_result = db_service.save_candidate(
            user_id=user_id,
            job_id=job_id,
            analyzed_data=analyzed_data,
            confidence_score=analysis_result.confidence_score,
            field_confidence=analysis_result.field_confidence,
            warnings=[w.to_dict() for w in analysis_result.warnings],
            encrypted_store=encrypted_store,
            hash_store=hash_store,
            source_file=file_url,
            file_type=router_result.file_type.value if router_result.file_type else "unknown",
            analysis_mode=analysis_mode.value,
            candidate_id=candidate_id,  # Pass existing candidate_id for update
        )

        if not save_result.success:
            raise Exception(f"Failed to save candidate: {save_result.error}")

        candidate_id = save_result.candidate_id
        logger.info(f"[Pipeline] Saved candidate: {candidate_id}")

        # Step 6.5: PDF URL 업데이트 (변환된 PDF가 있는 경우)
        if pdf_storage_path and candidate_id:
            db_service.update_candidate_pdf_url(
                candidate_id=candidate_id,
                pdf_url=pdf_storage_path
            )
            logger.info(f"[Pipeline] Updated pdf_url for candidate: {pdf_storage_path}")

        # 청크 저장 (임베딩 성공 시에만)
        chunks_saved = 0
        if embedding_result and embedding_result.success and embedding_result.chunks:
            try:
                # 중복 업데이트의 경우 기존 청크 삭제 후 새로 저장
                if save_result.is_update:
                    db_service.delete_candidate_chunks(candidate_id)
                    logger.info(f"[Pipeline] Deleted existing chunks for duplicate update")

                chunks_saved = db_service.save_chunks_with_embeddings(
                    candidate_id=candidate_id,
                    chunks=embedding_result.chunks
                )
                logger.info(f"[Pipeline] Saved {chunks_saved} chunks")
            except Exception as chunk_error:
                logger.warning(f"[Pipeline] Chunk saving failed: {chunk_error}")
        else:
            logger.info(f"[Pipeline] Skipping chunk save (no embeddings)")

        # Step 7: Job 상태 업데이트
        db_service.update_job_status(
            job_id=job_id,
            status="completed",
            candidate_id=candidate_id,
            confidence_score=analysis_result.confidence_score,
            chunk_count=chunks_saved,
            pii_count=pii_count,
        )

        # Step 7.5: 크레딧 차감 (분석 성공 시에만)
        # - 중복 업데이트의 경우 크레딧 차감하지 않음
        # - skip_credit_deduction=True인 경우 (재시도 + 이미 차감됨) 차감하지 않음
        if skip_credit_deduction:
            logger.info(f"[Pipeline] Skipping credit deduction (already charged or retry)")
        elif save_result.is_update:
            logger.info(f"[Pipeline] Duplicate update detected, skipping credit deduction")
        else:
            logger.info(f"[Pipeline] Deducting credit for user {user_id}...")
            credit_deducted = db_service.deduct_credit(
                user_id=user_id,
                candidate_id=candidate_id,
            )
            if credit_deducted:
                logger.info(f"[Pipeline] Credit deducted successfully")
            else:
                logger.warning(f"[Pipeline] Failed to deduct credit (may already be insufficient)")

        # Step 8: 기존 JD와 자동 매칭 (임베딩이 생성된 경우에만)
        if chunks_saved > 0:
            logger.info(f"[Pipeline] Running auto-match with existing positions...")
            match_result = db_service.match_candidate_to_existing_positions(
                candidate_id=candidate_id,
                user_id=user_id,
                min_score=0.3
            )
            if match_result["success"]:
                logger.info(
                    f"[Pipeline] Auto-match complete: "
                    f"{match_result['matched_positions']}/{match_result['total_positions']} positions"
                )
            else:
                logger.warning(f"[Pipeline] Auto-match failed: {match_result.get('error')}")

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(
            f"[Pipeline] Complete! candidate={candidate_id}, "
            f"confidence={analysis_result.confidence_score:.2f}, "
            f"chunks={chunks_saved}, time={processing_time}ms"
        )

    except Exception as e:
        logger.error(f"[Pipeline] Failed: {e}", exc_info=True)

        # 실패 시 job 상태 업데이트
        db_service.update_job_status(
            job_id=job_id,
            status="failed",
            error_message=str(e)[:500],
        )

        # 실패 시 candidate 상태도 업데이트
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )

        # 크레딧은 presign에서 차감하지 않으므로 복구 불필요
        # 분석 성공 시에만 차감하는 구조로 변경됨
        logger.info(f"[Pipeline] Failed - no credit deducted (deduct on success only)")


@app.post("/pipeline", response_model=PipelineResponse)
async def pipeline_endpoint(
    request: PipelineRequest,
    _: bool = Depends(verify_api_key),  # API 인증 필수
):
    """
    전체 파이프라인 엔드포인트 (동기 처리)

    파이프라인 완료 후 응답 반환:
    파일 다운로드 → 파싱 → 분석 → PII → 임베딩 → DB 저장 → 크레딧 차감

    Feature Flag에 따라 새 파이프라인 또는 기존 파이프라인 사용
    """
    logger.info(f"[Pipeline] Received request for job {request.job_id}")

    # Feature Flag 확인
    feature_flags = get_feature_flags()
    use_new_pipeline = feature_flags.should_use_new_pipeline(
        user_id=request.user_id,
        job_id=request.job_id
    )

    if use_new_pipeline:
        # 새로운 PipelineOrchestrator 사용
        logger.info(f"[Pipeline] Using NEW pipeline (PipelineOrchestrator) for job {request.job_id}")
        await run_new_pipeline(
            file_url=request.file_url,
            file_name=request.file_name,
            user_id=request.user_id,
            job_id=request.job_id,
            candidate_id=request.candidate_id,
            mode=request.mode or "phase_1",
        )
    else:
        # 기존 파이프라인 사용
        logger.info(f"[Pipeline] Using LEGACY pipeline for job {request.job_id}")
        await run_pipeline(
            file_url=request.file_url,
            file_name=request.file_name,
            user_id=request.user_id,
            job_id=request.job_id,
            candidate_id=request.candidate_id,
            mode=request.mode or "phase_1",
            skip_credit_deduction=request.skip_credit_deduction,
        )

    return PipelineResponse(
        success=True,
        message="Pipeline completed",
        job_id=request.job_id,
    )


async def run_new_pipeline(
    file_url: str,
    file_name: str,
    user_id: str,
    job_id: str,
    mode: str,
    candidate_id: Optional[str] = None,
):
    """
    새로운 PipelineOrchestrator 기반 파이프라인

    PipelineContext를 사용하여 전체 파이프라인을 관리합니다.
    """
    import time
    start_time = time.time()

    db_service = get_database_service()

    logger.info(f"[NewPipeline] Starting for job {job_id}, file: {file_name}")

    try:
        # Job 상태 업데이트
        db_service.update_job_status(job_id, "processing")

        # Supabase Storage에서 파일 다운로드
        logger.info(f"[NewPipeline] Downloading file from storage: {file_url}")

        if not db_service.client:
            raise Exception("Supabase client not initialized")

        file_response = db_service.client.storage.from_("resumes").download(file_url)

        if not file_response:
            raise Exception(f"Failed to download file: {file_url}")

        file_bytes = file_response
        logger.info(f"[NewPipeline] Downloaded {len(file_bytes)} bytes")

        # PipelineOrchestrator 실행
        orchestrator = get_pipeline_orchestrator()
        result = await orchestrator.run(
            file_bytes=file_bytes,
            filename=file_name,
            user_id=user_id,
            job_id=job_id,
            mode=mode,
            candidate_id=candidate_id,
        )

        if result.success:
            logger.info(
                f"[NewPipeline] Complete! candidate={result.candidate_id}, "
                f"confidence={result.confidence_score:.2f}, "
                f"chunks={result.chunks_saved}, time={result.processing_time_ms}ms"
            )

            # PDF 변환 (원본이 PDF가 아닌 경우) - 기존 파이프라인과 동일
            # 이 부분은 PipelineOrchestrator 내부에서 처리하거나 여기서 별도로 처리
            # 현재는 기존 방식 유지

            # 크레딧 차감 (중복이 아닌 경우에만)
            if not result.is_update:
                logger.info(f"[NewPipeline] Deducting credit for user {user_id}...")
                credit_deducted = db_service.deduct_credit(
                    user_id=user_id,
                    candidate_id=result.candidate_id,
                )
                if credit_deducted:
                    logger.info(f"[NewPipeline] Credit deducted successfully")
                else:
                    logger.warning(f"[NewPipeline] Failed to deduct credit")

            # 기존 JD와 자동 매칭
            if result.chunks_saved > 0:
                logger.info(f"[NewPipeline] Running auto-match with existing positions...")
                match_result = db_service.match_candidate_to_existing_positions(
                    candidate_id=result.candidate_id,
                    user_id=user_id,
                    min_score=0.3
                )
                if match_result["success"]:
                    logger.info(
                        f"[NewPipeline] Auto-match complete: "
                        f"{match_result['matched_positions']}/{match_result['total_positions']} positions"
                    )
        else:
            raise Exception(result.error or "Pipeline failed")

    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[NewPipeline] Failed after {processing_time}ms: {e}", exc_info=True)

        # 실패 시 job 상태 업데이트
        db_service.update_job_status(
            job_id=job_id,
            status="failed",
            error_message=str(e)[:500],
        )

        # 실패 시 candidate 상태도 업데이트
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )


# ─────────────────────────────────────────────────
# Feature Flags Endpoints
# ─────────────────────────────────────────────────

class FeatureFlagsResponse(BaseModel):
    """Feature Flags 응답 모델"""
    use_new_pipeline: bool
    use_llm_validation: bool
    use_agent_messaging: bool
    use_hallucination_detection: bool
    use_evidence_tracking: bool
    new_pipeline_rollout_percentage: float
    new_pipeline_user_count: int
    debug_pipeline: bool


@app.get("/feature-flags", response_model=FeatureFlagsResponse)
async def get_feature_flags_endpoint(_: bool = Depends(verify_api_key)):
    """
    현재 Feature Flags 상태 조회

    새 파이프라인 활성화 상태 및 세부 기능 플래그를 반환합니다.
    """
    flags = get_feature_flags()

    return FeatureFlagsResponse(
        use_new_pipeline=flags.use_new_pipeline,
        use_llm_validation=flags.use_llm_validation,
        use_agent_messaging=flags.use_agent_messaging,
        use_hallucination_detection=flags.use_hallucination_detection,
        use_evidence_tracking=flags.use_evidence_tracking,
        new_pipeline_rollout_percentage=flags.new_pipeline_rollout_percentage,
        new_pipeline_user_count=len(flags.new_pipeline_user_ids),
        debug_pipeline=flags.debug_pipeline,
    )


@app.post("/feature-flags/reload")
async def reload_feature_flags_endpoint(_: bool = Depends(verify_api_key)):
    """
    Feature Flags 재로드

    환경 변수에서 Feature Flags를 다시 로드합니다.
    런타임에서 플래그를 변경한 후 적용할 때 사용합니다.
    """
    from orchestrator.feature_flags import reload_feature_flags

    flags = reload_feature_flags()

    return {
        "success": True,
        "message": "Feature flags reloaded",
        "flags": {
            "use_new_pipeline": flags.use_new_pipeline,
            "use_llm_validation": flags.use_llm_validation,
            "new_pipeline_rollout_percentage": flags.new_pipeline_rollout_percentage,
        }
    }


@app.get("/feature-flags/check")
async def check_pipeline_routing(
    user_id: Optional[str] = None,
    job_id: Optional[str] = None,
    _: bool = Depends(verify_api_key),
):
    """
    파이프라인 라우팅 확인

    특정 user_id/job_id에 대해 어떤 파이프라인이 사용될지 확인합니다.
    테스트 및 디버깅 용도입니다.
    """
    flags = get_feature_flags()

    will_use_new = flags.should_use_new_pipeline(
        user_id=user_id,
        job_id=job_id
    )

    return {
        "user_id": user_id,
        "job_id": job_id,
        "will_use_new_pipeline": will_use_new,
        "reason": _get_routing_reason(flags, user_id, job_id, will_use_new),
    }


def _get_routing_reason(flags, user_id, job_id, will_use_new) -> str:
    """라우팅 이유 설명"""
    if not flags.use_new_pipeline:
        return "Main flag (USE_NEW_PIPELINE) is disabled"

    if user_id and user_id in flags.new_pipeline_user_ids:
        return f"User {user_id} is in whitelist"

    if flags.new_pipeline_rollout_percentage >= 1.0:
        return "100% rollout enabled"

    if flags.new_pipeline_rollout_percentage > 0 and job_id:
        if will_use_new:
            return f"Job selected by {flags.new_pipeline_rollout_percentage*100:.0f}% rollout"
        else:
            return f"Job not selected by {flags.new_pipeline_rollout_percentage*100:.0f}% rollout"

    return "Following main flag setting"


# ─────────────────────────────────────────────────
# New Pipeline Endpoint (Direct access for testing)
# ─────────────────────────────────────────────────

class NewPipelineResponse(BaseModel):
    """새 파이프라인 응답 모델"""
    success: bool
    candidate_id: Optional[str] = None
    confidence_score: float = 0.0
    field_confidence: dict = {}
    chunk_count: int = 0
    chunks_saved: int = 0
    pii_count: int = 0
    warnings: list = []
    processing_time_ms: int = 0
    pipeline_id: Optional[str] = None
    is_update: bool = False
    error: Optional[str] = None


@app.post("/pipeline/new", response_model=NewPipelineResponse)
async def new_pipeline_endpoint(
    request: PipelineRequest,
    _: bool = Depends(verify_api_key),
):
    """
    새 PipelineOrchestrator 직접 호출 (테스트용)

    Feature Flag와 상관없이 새 파이프라인을 직접 사용합니다.
    테스트 및 디버깅 목적으로 사용하세요.
    """
    import time
    start_time = time.time()

    logger.info(f"[NewPipeline] Direct call for job {request.job_id}")

    db_service = get_database_service()

    try:
        # Job 상태 업데이트
        db_service.update_job_status(request.job_id, "processing")

        # 파일 다운로드
        if not db_service.client:
            raise Exception("Supabase client not initialized")

        file_response = db_service.client.storage.from_("resumes").download(request.file_url)
        if not file_response:
            raise Exception(f"Failed to download file: {request.file_url}")

        file_bytes = file_response

        # PipelineOrchestrator 실행
        orchestrator = get_pipeline_orchestrator()
        result = await orchestrator.run(
            file_bytes=file_bytes,
            filename=request.file_name,
            user_id=request.user_id,
            job_id=request.job_id,
            mode=request.mode or "phase_1",
            candidate_id=request.candidate_id,
        )

        return NewPipelineResponse(
            success=result.success,
            candidate_id=result.candidate_id,
            confidence_score=result.confidence_score,
            field_confidence=result.field_confidence,
            chunk_count=result.chunk_count,
            chunks_saved=result.chunks_saved,
            pii_count=result.pii_count,
            warnings=result.warnings,
            processing_time_ms=result.processing_time_ms,
            pipeline_id=result.pipeline_id,
            is_update=result.is_update,
            error=result.error,
        )

    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[NewPipeline] Direct call failed: {e}", exc_info=True)

        db_service.update_job_status(
            job_id=request.job_id,
            status="failed",
            error_message=str(e)[:500],
        )

        return NewPipelineResponse(
            success=False,
            processing_time_ms=processing_time,
            error=str(e),
        )


# ─────────────────────────────────────────────────
# Metrics Endpoints
# ─────────────────────────────────────────────────

class MetricsResponse(BaseModel):
    """메트릭 응답 모델"""
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    avg_duration_ms: float
    min_duration_ms: int
    max_duration_ms: int
    errors_by_code: dict
    stage_avg_durations: dict
    llm_total_calls: int
    llm_total_tokens_input: int
    llm_total_tokens_output: int
    llm_total_cost_usd: float
    llm_calls_by_provider: dict
    requests_by_pipeline_type: dict
    period_start: Optional[str] = None
    period_end: Optional[str] = None


class MetricsHealthResponse(BaseModel):
    """메트릭 헬스 응답 모델"""
    status: str
    error_rate: float
    avg_duration_ms: float
    active_pipelines: int
    total_requests_5min: int


@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics(
    minutes: int = 60,
    pipeline_type: Optional[str] = None,
    _: bool = Depends(verify_api_key),
):
    """
    파이프라인 메트릭 조회

    집계된 파이프라인 성능 및 비용 메트릭을 반환합니다.

    Args:
        minutes: 조회 기간 (분, 기본: 60분)
        pipeline_type: 파이프라인 타입 필터 ("legacy" or "new")

    Returns:
        MetricsResponse with aggregated metrics
    """
    from services.metrics_service import get_metrics_collector

    collector = get_metrics_collector()
    aggregated = collector.get_aggregated(minutes=minutes, pipeline_type=pipeline_type)

    return MetricsResponse(**aggregated.to_dict())


@app.get("/metrics/health", response_model=MetricsHealthResponse)
async def get_metrics_health(_: bool = Depends(verify_api_key)):
    """
    메트릭 기반 헬스 상태

    최근 5분간 메트릭을 기반으로 시스템 상태를 반환합니다.
    - healthy: 에러율 10% 미만
    - degraded: 에러율 10-50%
    - unhealthy: 에러율 50% 이상
    """
    from services.metrics_service import get_metrics_collector

    collector = get_metrics_collector()
    health = collector.get_health_status()

    return MetricsHealthResponse(**health)


@app.get("/metrics/recent")
async def get_recent_metrics(count: int = 10, _: bool = Depends(verify_api_key)):
    """
    최근 파이프라인 실행 메트릭

    Args:
        count: 조회할 최근 실행 수 (기본: 10)

    Returns:
        List of recent pipeline execution metrics
    """
    from services.metrics_service import get_metrics_collector

    collector = get_metrics_collector()
    recent = collector.get_recent(count=count)

    return {
        "success": True,
        "count": len(recent),
        "metrics": recent,
    }


@app.get("/metrics/llm-cost")
async def get_llm_cost_metrics(
    minutes: int = 1440,  # 기본 24시간
    _: bool = Depends(verify_api_key),
):
    """
    LLM 비용 메트릭

    LLM 호출 비용 관련 상세 메트릭을 반환합니다.

    Args:
        minutes: 조회 기간 (분, 기본: 1440분 = 24시간)

    Returns:
        LLM cost breakdown by provider and model
    """
    from services.metrics_service import get_metrics_collector

    collector = get_metrics_collector()
    aggregated = collector.get_aggregated(minutes=minutes)

    # 시간당 비용 추정
    hours = minutes / 60
    hourly_cost = aggregated.llm_total_cost_usd / hours if hours > 0 else 0
    daily_cost_estimate = hourly_cost * 24
    monthly_cost_estimate = daily_cost_estimate * 30

    return {
        "success": True,
        "period_minutes": minutes,
        "total_cost_usd": round(aggregated.llm_total_cost_usd, 4),
        "total_calls": aggregated.llm_total_calls,
        "total_tokens_input": aggregated.llm_total_tokens_input,
        "total_tokens_output": aggregated.llm_total_tokens_output,
        "calls_by_provider": dict(aggregated.llm_calls_by_provider),
        "estimates": {
            "hourly_cost_usd": round(hourly_cost, 4),
            "daily_cost_usd": round(daily_cost_estimate, 2),
            "monthly_cost_usd": round(monthly_cost_estimate, 2),
        },
    }


# ─────────────────────────────────────────────────
# Dead Letter Queue (DLQ) Endpoints
# ─────────────────────────────────────────────────

class DLQEntryResponse(BaseModel):
    """DLQ 항목 응답 모델"""
    dlq_id: str
    job_id: str
    rq_job_id: str
    job_type: str
    user_id: str
    error_message: str
    error_type: str
    retry_count: int
    failed_at: str
    job_kwargs: dict


class DLQListResponse(BaseModel):
    """DLQ 목록 응답 모델"""
    success: bool
    total: int
    entries: list[DLQEntryResponse]


class DLQStatsResponse(BaseModel):
    """DLQ 통계 응답 모델"""
    available: bool
    total: int
    by_job_type: dict = {}
    by_error_type: dict = {}
    by_user: dict = {}
    error: Optional[str] = None


class DLQActionResponse(BaseModel):
    """DLQ 액션 응답 모델"""
    success: bool
    message: str
    dlq_id: Optional[str] = None
    new_rq_job_id: Optional[str] = None


@app.get("/dlq/stats", response_model=DLQStatsResponse)
async def dlq_stats(_: bool = Depends(verify_api_key)):
    """
    DLQ 통계 조회

    실패한 작업의 통계 정보를 반환합니다:
    - 전체 DLQ 항목 수
    - 작업 타입별 분포
    - 에러 타입별 분포
    - 사용자별 분포 (Top 10)
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return DLQStatsResponse(available=False, total=0)

    stats = queue_service.get_dlq_stats()
    return DLQStatsResponse(**stats)


@app.get("/dlq/entries", response_model=DLQListResponse)
async def dlq_list(
    limit: int = 50,
    offset: int = 0,
    job_type: Optional[str] = None,
    user_id: Optional[str] = None,
    _: bool = Depends(verify_api_key),
):
    """
    DLQ 항목 목록 조회

    Args:
        limit: 최대 조회 수 (기본: 50)
        offset: 시작 위치 (기본: 0)
        job_type: 필터링할 작업 타입 (parse, process, full_pipeline)
        user_id: 필터링할 사용자 ID
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return DLQListResponse(success=False, total=0, entries=[])

    entries = queue_service.get_dlq_entries(
        limit=limit,
        offset=offset,
        job_type=job_type,
        user_id=user_id,
    )

    total = queue_service.get_dlq_count()

    return DLQListResponse(
        success=True,
        total=total,
        entries=[
            DLQEntryResponse(
                dlq_id=e.dlq_id,
                job_id=e.job_id,
                rq_job_id=e.rq_job_id,
                job_type=e.job_type,
                user_id=e.user_id,
                error_message=e.error_message,
                error_type=e.error_type,
                retry_count=e.retry_count,
                failed_at=e.failed_at,
                job_kwargs=e.job_kwargs,
            )
            for e in entries
        ],
    )


@app.get("/dlq/entry/{dlq_id}")
async def dlq_get_entry(dlq_id: str, _: bool = Depends(verify_api_key)):
    """
    단일 DLQ 항목 조회 (스택트레이스 포함)

    Args:
        dlq_id: DLQ 항목 ID
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return {"success": False, "error": "Queue service not available"}

    entry = queue_service.get_dlq_entry(dlq_id)

    if not entry:
        raise HTTPException(status_code=404, detail="DLQ entry not found")

    return {
        "success": True,
        "entry": {
            "dlq_id": entry.dlq_id,
            "job_id": entry.job_id,
            "rq_job_id": entry.rq_job_id,
            "job_type": entry.job_type,
            "user_id": entry.user_id,
            "error_message": entry.error_message,
            "error_type": entry.error_type,
            "retry_count": entry.retry_count,
            "failed_at": entry.failed_at,
            "job_kwargs": entry.job_kwargs,
            "last_traceback": entry.last_traceback,
        }
    }


@app.post("/dlq/retry/{dlq_id}", response_model=DLQActionResponse)
async def dlq_retry(dlq_id: str, _: bool = Depends(verify_api_key)):
    """
    DLQ에서 작업 재시도

    DLQ 항목을 조회하여 원래 파라미터로 새 작업을 생성합니다.
    성공 시 DLQ에서 해당 항목이 제거됩니다.

    Args:
        dlq_id: DLQ 항목 ID
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return DLQActionResponse(
            success=False,
            message="Queue service not available"
        )

    queued_job = queue_service.retry_from_dlq(dlq_id)

    if queued_job:
        logger.info(f"[DLQ] Job retried from DLQ: {dlq_id} -> {queued_job.rq_job_id}")
        return DLQActionResponse(
            success=True,
            message="Job retried successfully",
            dlq_id=dlq_id,
            new_rq_job_id=queued_job.rq_job_id,
        )
    else:
        return DLQActionResponse(
            success=False,
            message="Failed to retry job from DLQ",
            dlq_id=dlq_id,
        )


@app.delete("/dlq/entry/{dlq_id}", response_model=DLQActionResponse)
async def dlq_delete(dlq_id: str, _: bool = Depends(verify_api_key)):
    """
    DLQ에서 항목 삭제

    재시도 없이 DLQ에서 항목을 영구 삭제합니다.

    Args:
        dlq_id: DLQ 항목 ID
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return DLQActionResponse(
            success=False,
            message="Queue service not available"
        )

    success = queue_service.remove_from_dlq(dlq_id)

    if success:
        logger.info(f"[DLQ] Entry deleted: {dlq_id}")
        return DLQActionResponse(
            success=True,
            message="DLQ entry deleted successfully",
            dlq_id=dlq_id,
        )
    else:
        return DLQActionResponse(
            success=False,
            message="Failed to delete DLQ entry",
            dlq_id=dlq_id,
        )


@app.delete("/dlq/clear")
async def dlq_clear(older_than_days: Optional[int] = None, _: bool = Depends(verify_api_key)):
    """
    DLQ 정리

    Args:
        older_than_days: 지정된 일수보다 오래된 항목만 삭제 (미지정 시 전체 삭제)
    """
    queue_service = get_queue_service()

    if not queue_service.is_available:
        return {"success": False, "error": "Queue service not available"}

    deleted_count = queue_service.clear_dlq(older_than_days)

    message = (
        f"Cleared {deleted_count} entries"
        if older_than_days is None
        else f"Cleared {deleted_count} entries older than {older_than_days} days"
    )

    logger.info(f"[DLQ] {message}")

    return {
        "success": True,
        "message": message,
        "deleted_count": deleted_count,
    }


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
