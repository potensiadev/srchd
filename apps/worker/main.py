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
from utils.hwp_parser import HWPParser, ParseMethod
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser
from services.llm_manager import get_llm_manager

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
