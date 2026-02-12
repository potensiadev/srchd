"""
RQ Tasks - Redis Queue 작업 함수

RQ Worker가 실행하는 비동기 작업 정의
- parse_file: 파일 파싱
- process_resume: 이력서 분석 + 저장
- full_pipeline: 전체 파이프라인 (파싱 → 분석 → 저장)
- on_job_failure: 실패 핸들러 (DLQ로 이동)
"""

import logging
import time
import httpx
import traceback
from typing import Optional

from config import get_settings, AnalysisMode
from services.queue_service import get_queue_service, JobType
from agents.router_agent import RouterAgent, FileType, RouterResult
from agents.analyst_agent import get_analyst_agent, AnalysisResult
from agents.privacy_agent import get_privacy_agent, PrivacyResult
from agents.validation_agent import get_validation_agent, ValidationResult
from agents.identity_checker import get_identity_checker, IdentityCheckResult
from agents.visual_agent import get_visual_agent
from utils.hwp_parser import HWPParser, ParseMethod
from utils.pdf_parser import PDFParser
from utils.docx_parser import DOCXParser
from utils.url_extractor import extract_urls_from_text
from utils.career_calculator import calculate_total_experience, format_experience_korean
from utils.education_parser import determine_graduation_status, determine_degree_level
from utils.async_helpers import run_async, run_async_with_shadow
from services.embedding_service import get_embedding_service, EmbeddingResult
from services.database_service import get_database_service, SaveResult
from services.storage_service import get_supabase_client, reset_supabase_client
from exceptions import (
    WorkerError,
    RetryableError,
    PermanentError,
    ErrorCode,
    is_retryable,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ─────────────────────────────────────────────────
# PRD Epic 1: 싱글톤 클라이언트 (연결 재사용)
# ─────────────────────────────────────────────────
_http_client: Optional[httpx.Client] = None


def get_http_client() -> httpx.Client:
    """
    httpx.Client 싱글톤 반환 (커넥션 풀 재사용)

    PRD: Epic 1 (FR-1.1)
    - 매 재시도마다 새 Client 생성 → 싱글톤으로 재사용
    - max_keepalive_connections=5로 커넥션 풀 관리

    Phase 1: timeout을 config에서 가져옴
    """
    global _http_client
    if _http_client is None:
        _http_client = httpx.Client(
            timeout=settings.timeout.webhook,  # Phase 1: config에서 참조
            limits=httpx.Limits(
                max_keepalive_connections=5,
                max_connections=10
            )
        )
        logger.info(f"[Tasks] httpx.Client singleton initialized (timeout={settings.timeout.webhook}s)")
    return _http_client


# 에이전트 및 파서 초기화 (Worker 프로세스 시작 시 1회)
router_agent = RouterAgent()
hwp_parser = HWPParser(hancom_api_key=settings.HANCOM_API_KEY or None)
pdf_parser = PDFParser()
docx_parser = DOCXParser()


def notify_webhook(
    job_id: str,
    status: str,
    result: Optional[dict] = None,
    error: Optional[str] = None,
    max_retries: Optional[int] = None
):
    """
    Webhook으로 작업 완료 알림 전송 (동기, 재시도 포함)

    Next.js API의 /api/webhooks/worker 로 전송

    Args:
        job_id: 작업 ID
        status: 작업 상태
        result: 결과 데이터
        error: 에러 메시지
        max_retries: 최대 재시도 횟수 (None이면 config에서 가져옴)

    Phase 1: 하드코딩된 값을 config.retry에서 참조
    """
    webhook_url = settings.WEBHOOK_URL
    if not webhook_url:
        logger.debug(f"[Webhook] URL not configured, skipping notification for job {job_id}")
        return

    # Phase 1: config에서 재시도 설정 가져오기
    if max_retries is None:
        max_retries = settings.retry.webhook_max
    retry_delay = settings.retry.webhook_delay

    payload = {
        "job_id": job_id,
        "status": status,
        "result": result,
        "error": error,
    }

    # 재시도하면 안 되는 HTTP 상태 코드 (클라이언트 에러)
    NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404, 405, 422}

    for attempt in range(max_retries + 1):
        try:
            # PRD Epic 1: 싱글톤 클라이언트 사용
            client = get_http_client()
            response = client.post(
                webhook_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Secret": settings.WEBHOOK_SECRET,
                },
            )

            if response.status_code == 200:
                logger.info(f"[Webhook] Successfully notified job {job_id} (status: {status})")
                return

            # 4xx 클라이언트 에러는 재시도해도 의미 없음
            if response.status_code in NON_RETRYABLE_STATUS_CODES:
                logger.error(
                    f"[Webhook] Non-retryable error {response.status_code} for job {job_id}. "
                    f"Response: {response.text[:200]}"
                )
                return  # 재시도 없이 종료

            # 5xx 서버 에러는 재시도
            logger.warning(
                f"[Webhook] Server error {response.status_code} "
                f"(attempt {attempt + 1}/{max_retries + 1})"
            )

        except httpx.TimeoutException as e:
            logger.warning(
                f"[Webhook] Timeout for job {job_id} (attempt {attempt + 1}/{max_retries + 1}): {e}"
            )
        except httpx.ConnectError as e:
            logger.warning(
                f"[Webhook] Connection error for job {job_id} (attempt {attempt + 1}/{max_retries + 1}): {e}"
            )
        except Exception as e:
            logger.error(
                f"[Webhook] Unexpected error for job {job_id} (attempt {attempt + 1}/{max_retries + 1}): {e}"
            )

        # Phase 1: 재시도 대기 시간을 config에서 가져옴 (지수 백오프)
        if attempt < max_retries:
            wait_time = retry_delay * (2 ** attempt)
            logger.info(f"[Webhook] Retrying in {wait_time:.1f} seconds...")
            time.sleep(wait_time)

    # 모든 재시도 실패
    logger.error(
        f"[Webhook] All {max_retries + 1} attempts failed for job {job_id}. "
        f"Frontend may not receive status update."
    )


class DownloadError(Exception):
    """파일 다운로드 실패 예외"""
    def __init__(self, message: str, retries_attempted: int = 0):
        super().__init__(message)
        self.retries_attempted = retries_attempted


def download_file_from_storage(
    file_path: str,
    max_retries: Optional[int] = None,
    retry_delay: Optional[float] = None
) -> bytes:
    """
    Supabase Storage에서 파일 다운로드 (재시도 로직 포함)

    Args:
        file_path: Storage 경로 (예: "resumes/{user_id}/{filename}")
        max_retries: 최대 재시도 횟수 (None이면 config에서 가져옴)
        retry_delay: 재시도 간 대기 시간 (None이면 config에서 가져옴, 지수 백오프 적용)

    Returns:
        파일 바이트 데이터

    Raises:
        DownloadError: 모든 재시도 실패 시

    Phase 1: 하드코딩된 값을 config.retry에서 참조
    """
    # Phase 1: config에서 재시도 설정 가져오기
    if max_retries is None:
        max_retries = settings.retry.storage_max
    if retry_delay is None:
        retry_delay = settings.retry.storage_delay

    # PRD Epic 1: Supabase 싱글톤 클라이언트 사용
    supabase = get_supabase_client()
    bucket_name = "resumes"

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            logger.info(f"[Download] Attempting to download: {file_path} (attempt {attempt + 1}/{max_retries + 1})")

            response = supabase.storage.from_(bucket_name).download(file_path)

            if response and len(response) > 0:
                logger.info(f"[Download] Successfully downloaded {len(response)} bytes")
                return response
            else:
                raise ValueError("Empty response from storage")

        except Exception as e:
            last_error = e
            logger.warning(
                f"[Download] Attempt {attempt + 1}/{max_retries + 1} failed: {type(e).__name__}: {e}"
            )

            if attempt < max_retries:
                # 지수 백오프: 1초, 2초, 4초
                wait_time = retry_delay * (2 ** attempt)
                logger.info(f"[Download] Retrying in {wait_time:.1f} seconds...")
                time.sleep(wait_time)

    # 모든 재시도 실패
    error_msg = f"Failed to download {file_path} after {max_retries + 1} attempts: {last_error}"
    logger.error(f"[Download] {error_msg}")
    raise DownloadError(error_msg, retries_attempted=max_retries + 1)


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
    file_name: str = "",
    candidate_id: Optional[str] = None,
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

        # ─────────────────────────────────────────────────
        # Step 0: Multi-Identity 체크 (악용 방지)
        # PRD: "2명 이상의 정보 감지 시 처리 거절, 크레딧 미차감"
        # ─────────────────────────────────────────────────
        identity_checker = get_identity_checker()
        # Phase 0: asyncio.run() → run_async() (Context Manager 패턴)
        identity_result = run_async_with_shadow(
            lambda: identity_checker.check(text),
            shadow_mode=settings.ASYNC_SHADOW_MODE,
            use_new=settings.USE_NEW_ASYNC_HELPER
        )

        if identity_result.should_reject:
            error_msg = f"다중 신원 감지: {identity_result.person_count}명의 정보가 포함되어 있습니다. ({identity_result.reason})"
            logger.warning(f"[Task] Multi-identity detected: {error_msg}")
            db_service.update_job_status(
                job_id,
                status="rejected",
                error_code="MULTI_IDENTITY",
                error_message=error_msg
            )
            notify_webhook(job_id, "rejected", error=error_msg)
            # 크레딧 미차감 (rejected 상태)
            return {
                "success": False,
                "error": error_msg,
                "error_code": "MULTI_IDENTITY",
                "person_count": identity_result.person_count
            }

        # 분석 모드
        analysis_mode = AnalysisMode.PHASE_2 if mode == "phase_2" else AnalysisMode.PHASE_1

        # ─────────────────────────────────────────────────
        # Step 1: 분석 (Analyst Agent)
        # ─────────────────────────────────────────────────
        analyst = get_analyst_agent()

        # Phase 0: asyncio.run() → run_async() (Context Manager 패턴)
        analysis_result: AnalysisResult = run_async_with_shadow(
            lambda: analyst.analyze(resume_text=text, mode=analysis_mode, filename=file_name),
            shadow_mode=settings.ASYNC_SHADOW_MODE,
            use_new=settings.USE_NEW_ASYNC_HELPER
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
        # Step 1.5a: 검증 및 보정 (Validation Agent)
        # ─────────────────────────────────────────────────
        validation_agent = get_validation_agent()
        validation_result: ValidationResult = validation_agent.validate(
            analyzed_data=analyzed_data,
            original_text=text,
            filename=file_name
        )

        if validation_result.success:
            analyzed_data = validation_result.validated_data
            # 신뢰도 점수 보정
            for field_name, boost in validation_result.confidence_adjustments.items():
                if field_name in analysis_result.field_confidence:
                    analysis_result.field_confidence[field_name] = min(
                        1.0, analysis_result.field_confidence[field_name] + boost
                    )
            # 보정 사항 로깅
            if validation_result.corrections:
                logger.info(f"[Task] ValidationAgent 보정: {len(validation_result.corrections)}건")
                for corr in validation_result.corrections:
                    logger.info(f"  - {corr['field']}: {corr['original']} → {corr['corrected']}")

        # ─────────────────────────────────────────────────
        # Step 1.5b: URL 추출 (LLM 대신 정규식 사용)
        # GitHub/LinkedIn URL은 텍스트에서 직접 추출하여 정확도 보장
        # ─────────────────────────────────────────────────
        extracted_urls = extract_urls_from_text(text)

        # GitHub URL: 텍스트 추출 우선 (github.com 포함 URL만)
        if extracted_urls.github_url:
            analyzed_data["github_url"] = extracted_urls.github_url
            original_data["github_url"] = extracted_urls.github_url
            logger.info(f"[Task] GitHub URL extracted: {extracted_urls.github_url}")
        elif analyzed_data.get("github_url") and "github.com" not in analyzed_data["github_url"].lower():
            # LLM이 추출한 URL이 github.com이 아니면 제거
            analyzed_data["github_url"] = None
            original_data["github_url"] = None
            logger.warning("[Task] Invalid github_url from LLM removed (not github.com)")

        # LinkedIn URL: 텍스트 추출 우선 (linkedin.com 포함 URL만)
        if extracted_urls.linkedin_url:
            analyzed_data["linkedin_url"] = extracted_urls.linkedin_url
            original_data["linkedin_url"] = extracted_urls.linkedin_url
            logger.info(f"[Task] LinkedIn URL extracted: {extracted_urls.linkedin_url}")
        elif analyzed_data.get("linkedin_url") and "linkedin.com" not in analyzed_data["linkedin_url"].lower():
            # LLM이 추출한 URL이 linkedin.com이 아니면 제거
            analyzed_data["linkedin_url"] = None
            original_data["linkedin_url"] = None
            logger.warning("[Task] Invalid linkedin_url from LLM removed (not linkedin.com)")

        # Portfolio URL: 텍스트 추출 우선, 없으면 LLM 결과 유지
        if extracted_urls.portfolio_url and not analyzed_data.get("portfolio_url"):
            analyzed_data["portfolio_url"] = extracted_urls.portfolio_url
            original_data["portfolio_url"] = extracted_urls.portfolio_url
            logger.info(f"[Task] Portfolio URL extracted: {extracted_urls.portfolio_url}")

        # ─────────────────────────────────────────────────
        # Step 1.6: 경력 개월수 계산 + 학력 상태 판별
        # 다양한 날짜 형식 지원 (date_parser 사용)
        # ─────────────────────────────────────────────────
        try:
            # 경력 개월수 계산
            careers = analyzed_data.get("careers", [])
            if careers:
                career_summary = calculate_total_experience(careers)
                # 계산된 경력 연수로 GPT 추출값 덮어쓰기
                analyzed_data["exp_years"] = career_summary.years
                analyzed_data["exp_total_months"] = career_summary.total_months
                analyzed_data["exp_display"] = career_summary.format_korean()
                analyzed_data["has_current_job"] = career_summary.has_current_job
                original_data["exp_years"] = career_summary.years
                original_data["exp_total_months"] = career_summary.total_months
                original_data["exp_display"] = career_summary.format_korean()
                logger.info(
                    f"[Task] Career calculated: {career_summary.years} years, "
                    f"{career_summary.total_months} months ({career_summary.format_korean()})"
                )

            # 학력 졸업 상태 판별
            educations = analyzed_data.get("educations", [])
            for edu in educations:
                # 종료일에서 졸업 상태 자동 판별
                end_date = edu.get("end_date") or edu.get("end") or edu.get("graduation_date")
                explicit_status = edu.get("status") or edu.get("graduation_status")

                status = determine_graduation_status(
                    end_date_text=end_date,
                    explicit_status=explicit_status
                )
                edu["graduation_status"] = status.value

                # 학위 수준 판별
                degree_text = " ".join(filter(None, [
                    edu.get("school", ""),
                    edu.get("degree", ""),
                    edu.get("major", "")
                ]))
                degree_level = determine_degree_level(degree_text)
                edu["degree_level"] = degree_level.value

            if educations:
                logger.info(f"[Task] Education parsed: {len(educations)} entries")

        except Exception as parse_error:
            # 파싱 실패해도 전체 처리는 계속
            logger.warning(f"[Task] Career/Education parsing skipped: {parse_error}")

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
        # PRD v0.1: 원본 텍스트도 청킹하여 전체 텍스트 검색 지원
        # ─────────────────────────────────────────────────
        embedding_service = get_embedding_service()
        embeddings_failed = False
        embeddings_error = None

        try:
            # Phase 0: asyncio.run() → run_async() (Context Manager 패턴)
            embedding_result: EmbeddingResult = run_async_with_shadow(
                lambda: embedding_service.process_candidate(
                    data=analyzed_data,
                    generate_embeddings=True,
                    raw_text=text  # PRD v0.1: 원본 텍스트 전달
                ),
                shadow_mode=settings.ASYNC_SHADOW_MODE,
                use_new=settings.USE_NEW_ASYNC_HELPER
            )
        # Phase 1: 구체적 예외 처리
        except TimeoutError as timeout_err:
            # 타임아웃 - 재시도 가능하지만 부분 실패로 처리
            logger.warning(f"[Task] Embedding timeout (retryable): {timeout_err}")
            embeddings_failed = True
            embeddings_error = f"Embedding timeout: {timeout_err}"
            embedding_result = None
        except ConnectionError as conn_err:
            # 연결 오류 - 재시도 가능하지만 부분 실패로 처리
            logger.warning(f"[Task] Embedding connection error: {conn_err}")
            embeddings_failed = True
            embeddings_error = f"Connection error: {conn_err}"
            embedding_result = None
        except ValueError as val_err:
            # 입력 데이터 오류 - 재시도 불가
            logger.error(f"[Task] Embedding validation error: {val_err}")
            embeddings_failed = True
            embeddings_error = f"Invalid input: {val_err}"
            embedding_result = None
        except RetryableError as retry_err:
            # Phase 1: WorkerError 계열 재시도 가능 예외
            logger.warning(f"[Task] Embedding retryable error [{retry_err.code}]: {retry_err.message}")
            embeddings_failed = True
            embeddings_error = f"{retry_err.code}: {retry_err.message}"
            embedding_result = None
        except PermanentError as perm_err:
            # Phase 1: WorkerError 계열 영구 오류
            logger.error(f"[Task] Embedding permanent error [{perm_err.code}]: {perm_err.message}")
            embeddings_failed = True
            embeddings_error = f"{perm_err.code}: {perm_err.message}"
            embedding_result = None
        except Exception as embed_error:
            # 예상치 못한 오류 - 로그 후 부분 실패로 처리
            logger.error(
                f"[Task] Unexpected embedding error: {embed_error}",
                exc_info=True  # Phase 1: 스택 트레이스 포함
            )
            embeddings_failed = True
            embeddings_error = f"Unexpected: {type(embed_error).__name__}: {embed_error}"
            embedding_result = None

        chunk_count = 0
        embedding_chunks = []

        if embedding_result and embedding_result.success:
            chunk_count = len(embedding_result.chunks)
            embedding_chunks = embedding_result.chunks
        else:
            embeddings_failed = True
            if embedding_result:
                embeddings_error = embedding_result.error or "Unknown embedding error"
            logger.warning(
                f"[Task] Embedding generation failed: {embeddings_error}. "
                f"Candidate will be saved but not searchable."
            )

        # ─────────────────────────────────────────────────
        # Progressive Loading Phase 2: analyzed 상태 업데이트
        # AI 분석 완료 후, DB 저장 전에 상태를 업데이트하여 UI에 알림
        # ─────────────────────────────────────────────────
        if candidate_id:
            try:
                db_service.update_candidate_analyzed(candidate_id)

                # Webhook: analyzed 단계 알림 (UI 실시간 업데이트)
                notify_webhook(job_id, "analyzed", result={
                    "candidate_id": candidate_id,
                    "phase": "analyzed",
                    "confidence_score": analysis_result.confidence_score,
                })

                logger.info(
                    f"[Progressive] Phase 2 completed: candidate={candidate_id}, "
                    f"confidence={analysis_result.confidence_score:.2f}"
                )
            except Exception as analyzed_error:
                # analyzed 상태 업데이트 실패해도 전체 파이프라인은 계속 진행
                logger.warning(f"[Progressive] Analyzed status update failed: {analyzed_error}")

        # ─────────────────────────────────────────────────
        # Step 4: DB 저장 (candidates + candidate_chunks)
        # 중복 체크 + 버전 스태킹 포함
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
            candidate_id=candidate_id,
            original_data=original_data,  # 중복 체크용 원본 데이터
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

        # ─────────────────────────────────────────────────
        # Step 5: Visual Agent (포트폴리오 썸네일 캡처)
        # PRD: "Playwright URL 스크린샷 + OpenCV 얼굴 블러"
        # ─────────────────────────────────────────────────
        portfolio_thumbnail_url = None
        try:
            portfolio_url = analyzed_data.get("portfolio_url")
            if portfolio_url and portfolio_url.startswith(("http://", "https://")):
                visual_agent = get_visual_agent()
                # Phase 0: asyncio.run() → run_async() (Context Manager 패턴)
                thumbnail_result = run_async_with_shadow(
                    lambda: visual_agent.capture_portfolio_thumbnail(portfolio_url),
                    shadow_mode=settings.ASYNC_SHADOW_MODE,
                    use_new=settings.USE_NEW_ASYNC_HELPER
                )

                if thumbnail_result.success and thumbnail_result.thumbnail:
                    # Storage에 썸네일 업로드
                    uploaded_url = db_service.upload_image_to_storage(
                        image_bytes=thumbnail_result.thumbnail,
                        user_id=user_id,
                        candidate_id=candidate_id,
                        image_type="portfolio_thumbnail"
                    )
                    if uploaded_url:
                        portfolio_thumbnail_url = uploaded_url
                        db_service.update_candidate_images(
                            candidate_id=candidate_id,
                            portfolio_thumbnail_url=portfolio_thumbnail_url
                        )
                        logger.info(f"[Task] Portfolio thumbnail saved: {portfolio_url}")
                else:
                    logger.warning(
                        f"[Task] Portfolio thumbnail failed: {thumbnail_result.error}"
                    )
        # Phase 1: Visual Agent 구체적 예외 처리
        except TimeoutError as timeout_err:
            # 타임아웃 - 부분 실패 (계속 진행)
            logger.warning(f"[Task] Visual agent timeout: {timeout_err}")
        except ConnectionError as conn_err:
            # 연결 오류 - 부분 실패 (계속 진행)
            logger.warning(f"[Task] Visual agent connection error: {conn_err}")
        except RetryableError as retry_err:
            # 재시도 가능 오류지만 Visual은 부분 실패로 처리
            logger.warning(f"[Task] Visual agent retryable error [{retry_err.code}]: {retry_err.message}")
        except PermanentError as perm_err:
            # 영구 오류 (URL이 잘못되었거나 등)
            logger.warning(f"[Task] Visual agent permanent error [{perm_err.code}]: {perm_err.message}")
        except Exception as visual_error:
            # 예상치 못한 오류 - 부분 실패로 처리 (전체 파이프라인 계속)
            logger.warning(
                f"[Task] Visual processing skipped: {type(visual_error).__name__}: {visual_error}"
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

        # 크레딧 차감 - REMOVED
        # 크레딧은 presign 단계에서 reserve_credit()으로 이미 차감됨
        # db_service.deduct_credit(user_id, candidate_id)

        processing_time = int((time.time() - start_time) * 1000)

        # 버전 업데이트 정보
        is_update = save_result.is_update
        parent_id = save_result.parent_id

        log_msg = (
            f"[Task] process_resume completed: candidate={candidate_id}, "
            f"confidence={analysis_result.confidence_score:.2f}, time={processing_time}ms"
        )
        if is_update:
            log_msg += f" (updated from {parent_id})"
        logger.info(log_msg)

        # Webhook 알림
        notify_webhook(job_id, "completed", result={
            "candidate_id": candidate_id,
            "confidence_score": analysis_result.confidence_score,
            "chunk_count": chunks_saved,
            "pii_count": pii_count,
            "processing_time_ms": processing_time,
            "is_update": is_update,
            "parent_id": parent_id,
            "portfolio_thumbnail_url": portfolio_thumbnail_url,
            "embeddings_failed": embeddings_failed,
            "embeddings_error": embeddings_error,
        })

        return {
            "success": True,
            "candidate_id": candidate_id,
            "confidence_score": analysis_result.confidence_score,
            "chunks_saved": chunks_saved,
            "pii_count": pii_count,
            "processing_time_ms": processing_time,
            "is_update": is_update,
            "parent_id": parent_id,
            "portfolio_thumbnail_url": portfolio_thumbnail_url,
            "embeddings_failed": embeddings_failed,
            "embeddings_error": embeddings_error,
        }

    except PermanentError as perm_err:
        # 재시도 불가 에러 (INVALID_FILE, MULTI_IDENTITY 등)
        logger.error(
            f"[Task] process_resume permanent error [{perm_err.code}]: {perm_err.message}",
            exc_info=True
        )
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=perm_err.code.value,
            error_message=perm_err.message
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=perm_err.message)
        return {
            "success": False,
            "error": perm_err.message,
            "error_code": perm_err.code.value,
            "retryable": False,
        }

    except RetryableError as retry_err:
        # 재시도 가능 에러 (TIMEOUT, RATE_LIMIT, NETWORK 등)
        logger.warning(
            f"[Task] process_resume retryable error [{retry_err.code}]: {retry_err.message}",
            exc_info=True
        )
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=retry_err.code.value,
            error_message=retry_err.message
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=retry_err.message)
        return {
            "success": False,
            "error": retry_err.message,
            "error_code": retry_err.code.value,
            "retryable": True,
        }

    except Exception as e:
        # 미분류 예외 - is_retryable로 재시도 가능 여부 판단
        retryable = is_retryable(e)
        error_code = "INTERNAL_ERROR"

        if retryable:
            logger.warning(f"[Task] process_resume error (retryable): {e}", exc_info=True)
        else:
            logger.error(f"[Task] process_resume error (permanent): {e}", exc_info=True)

        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=error_code,
            error_message=str(e)
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=str(e))
        return {
            "success": False,
            "error": str(e),
            "error_code": error_code,
            "retryable": retryable,
        }


def full_pipeline(
    job_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
    mode: str = "phase_1",
    candidate_id: Optional[str] = None,
    skip_credit_deduction: bool = False,
) -> dict:
    """
    전체 파이프라인 작업 (RQ Task)

    PipelineOrchestrator를 통해 통합된 파이프라인 실행:
    파일 다운로드 → 파싱 → 신원 확인 → 분석 → 검증 → URL 추출 →
    경력 계산 → 학력 판별 → PII 마스킹 → 임베딩 → DB 저장 →
    크레딧 차감 → JD 자동 매칭

    Next.js API에서 호출하는 주요 작업

    Args:
        job_id: processing_jobs ID
        user_id: 사용자 ID
        file_path: Supabase Storage 경로
        file_name: 원본 파일명
        mode: phase_1 또는 phase_2
        candidate_id: 기존 후보자 ID (업데이트/재시도용)
        skip_credit_deduction: 크레딧 차감 스킵 여부 (재시도 시)

    Returns:
        dict: 전체 처리 결과
    """
    from orchestrator.pipeline_orchestrator import get_pipeline_orchestrator

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

        # PipelineOrchestrator를 통해 통합된 파이프라인 실행
        orchestrator = get_pipeline_orchestrator()
        # Phase 0: asyncio.run() → run_async() (Context Manager 패턴)
        result = run_async_with_shadow(
            lambda: orchestrator.run_from_storage(
                storage_path=file_path,
                filename=file_name,
                user_id=user_id,
                job_id=job_id,
                mode=mode,
                candidate_id=candidate_id,
                is_retry=skip_credit_deduction,
                skip_credit_deduction=skip_credit_deduction,
            ),
            shadow_mode=settings.ASYNC_SHADOW_MODE,
            use_new=settings.USE_NEW_ASYNC_HELPER
        )

        if not result.success:
            # 실패 시 상태 업데이트
            db_service.update_job_status(
                job_id,
                status="failed",
                error_code=result.error_code or "PIPELINE_FAILED",
                error_message=result.error or "파이프라인 실패"
            )
            if candidate_id:
                db_service.update_candidate_status(
                    candidate_id=candidate_id,
                    status="failed",
                )
            notify_webhook(job_id, "failed", error=result.error)
            return {
                "success": False,
                "error": result.error,
                "error_code": result.error_code,
            }

        # 성공 시 상태 업데이트
        db_service.update_job_status(
            job_id=job_id,
            status="completed",
            candidate_id=result.candidate_id,
            confidence_score=result.confidence_score,
            chunk_count=result.chunks_saved,
            pii_count=result.pii_count,
        )

        # Webhook 알림
        notify_webhook(job_id, "completed", result={
            "candidate_id": result.candidate_id,
            "confidence_score": result.confidence_score,
            "chunk_count": result.chunks_saved,
            "pii_count": result.pii_count,
            "processing_time_ms": result.processing_time_ms,
            "is_update": result.is_update,
            "parent_id": result.parent_id,
        })

        logger.info(
            f"[Task] full_pipeline completed: candidate={result.candidate_id}, "
            f"confidence={result.confidence_score:.2f}, time={result.processing_time_ms}ms"
        )

        return {
            "success": True,
            "candidate_id": result.candidate_id,
            "confidence_score": result.confidence_score,
            "chunks_saved": result.chunks_saved,
            "pii_count": result.pii_count,
            "processing_time_ms": result.processing_time_ms,
            "is_update": result.is_update,
            "parent_id": result.parent_id,
            "warnings": result.warnings,
        }

    except PermanentError as perm_err:
        # 재시도 불가 에러 (INVALID_FILE, MULTI_IDENTITY 등)
        logger.error(
            f"[Task] full_pipeline permanent error [{perm_err.code}]: {perm_err.message}",
            exc_info=True
        )
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=perm_err.code.value,
            error_message=perm_err.message
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=perm_err.message)
        return {
            "success": False,
            "error": perm_err.message,
            "error_code": perm_err.code.value,
            "retryable": False,
        }

    except RetryableError as retry_err:
        # 재시도 가능 에러 (TIMEOUT, RATE_LIMIT, NETWORK 등)
        logger.warning(
            f"[Task] full_pipeline retryable error [{retry_err.code}]: {retry_err.message}",
            exc_info=True
        )
        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=retry_err.code.value,
            error_message=retry_err.message
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=retry_err.message)
        return {
            "success": False,
            "error": retry_err.message,
            "error_code": retry_err.code.value,
            "retryable": True,
        }

    except Exception as e:
        # 미분류 예외 - is_retryable로 재시도 가능 여부 판단
        retryable = is_retryable(e)
        error_code = "INTERNAL_ERROR"

        if retryable:
            logger.warning(f"[Task] full_pipeline error (retryable): {e}", exc_info=True)
        else:
            logger.error(f"[Task] full_pipeline error (permanent): {e}", exc_info=True)

        db_service.update_job_status(
            job_id,
            status="failed",
            error_code=error_code,
            error_message=str(e)
        )
        if candidate_id:
            db_service.update_candidate_status(
                candidate_id=candidate_id,
                status="failed",
            )
        notify_webhook(job_id, "failed", error=str(e))
        return {
            "success": False,
            "error": str(e),
            "error_code": error_code,
            "retryable": retryable,
        }


def get_file_type_from_name(file_name: str) -> str:
    """
    파일명에서 파일 타입 추출
    
    Args:
        file_name: 파일명 (예: "이력서.hwp", "resume.pdf")
        
    Returns:
        파일 타입 문자열 (hwp, hwpx, pdf, docx, doc)
    """
    if not file_name:
        return "unknown"
    
    extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    
    # 지원하는 확장자 매핑
    type_map = {
        "hwp": "hwp",
        "hwpx": "hwpx",
        "pdf": "pdf",
        "docx": "docx",
        "doc": "doc",
    }
    
    return type_map.get(extension, "unknown")


def enqueue_typed_pipeline(
    job_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
    mode: str = "phase_1",
    candidate_id: Optional[str] = None,
) -> dict:
    """
    파일 타입에 따라 적절한 Queue로 파이프라인 작업을 라우팅
    
    USE_SPLIT_QUEUES 설정에 따라:
    - True: HWP/HWPX → slow_queue, PDF/DOCX → fast_queue
    - False: 기존 process_queue 사용
    
    Args:
        job_id: processing_jobs ID
        user_id: 사용자 ID
        file_path: Supabase Storage 경로
        file_name: 원본 파일명
        mode: phase_1 또는 phase_2
        candidate_id: 후보자 ID (선택)
        
    Returns:
        dict: 큐 등록 결과 {"success": bool, "rq_job_id": str or None}
    """
    queue_service = get_queue_service()
    
    if not queue_service.is_available:
        logger.warning("[Task] Queue not available, running full_pipeline synchronously")
        return full_pipeline(
            job_id=job_id,
            user_id=user_id,
            file_path=file_path,
            file_name=file_name,
            mode=mode,
            candidate_id=candidate_id,
        )
    
    # Feature Flag 체크
    use_split_queues = settings.USE_SPLIT_QUEUES if hasattr(settings, 'USE_SPLIT_QUEUES') else True
    
    if use_split_queues:
        # 파일 타입 기반 라우팅
        file_type = get_file_type_from_name(file_name)
        
        queued_job = queue_service.enqueue_by_file_type(
            job_id=job_id,
            user_id=user_id,
            file_path=file_path,
            file_name=file_name,
            file_type=file_type,
            mode=mode,
            candidate_id=candidate_id,
        )
        
        queue_type = "slow" if file_type in ("hwp", "hwpx") else "fast"
        logger.info(
            f"[Task] Enqueued to {queue_type}_queue: job={job_id}, file_type={file_type}"
        )
    else:
        # 기존 방식 (단일 queue)
        queued_job = queue_service.enqueue_full_pipeline(
            job_id=job_id,
            user_id=user_id,
            file_path=file_path,
            file_name=file_name,
            mode=mode,
            candidate_id=candidate_id,
        )
        logger.info(f"[Task] Enqueued to process_queue (legacy): job={job_id}")
    
    if queued_job:
        return {
            "success": True,
            "rq_job_id": queued_job.rq_job_id,
            "job_type": queued_job.type.value,
        }
    else:
        return {
            "success": False,
            "error": "Failed to enqueue job",
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RQ Failure Handler - Dead Letter Queue Integration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def on_job_failure(job, connection, type, value, tb):
    """
    RQ Job 실패 핸들러 (on_failure callback)

    모든 재시도가 실패한 후 호출되어 Dead Letter Queue에 작업 추가

    Usage (in queue_service.py):
        rq_job = queue.enqueue(
            "tasks.full_pipeline",
            on_failure=on_job_failure,
            ...
        )

    Args:
        job: RQ Job 객체
        connection: Redis 연결
        type: 예외 타입
        value: 예외 값
        tb: 트레이스백
    """
    try:
        queue_service = get_queue_service()

        if not queue_service.is_available:
            logger.error(f"[DLQ] Cannot add to DLQ: Queue service not available (job: {job.id})")
            return

        # Job 메타데이터 추출
        job_kwargs = job.kwargs or {}
        job_id = job_kwargs.get("job_id", "unknown")
        user_id = job_kwargs.get("user_id", "unknown")

        # 작업 타입 추출 (함수명에서)
        func_name = job.func_name if hasattr(job, "func_name") else str(job.func)
        if "full_pipeline" in func_name:
            job_type = JobType.FULL_PIPELINE.value
        elif "process_resume" in func_name:
            job_type = JobType.PROCESS.value
        elif "parse_file" in func_name:
            job_type = JobType.PARSE.value
        else:
            job_type = "unknown"

        # 에러 타입 분류
        error_type = "INTERNAL_ERROR"
        error_message = str(value) if value else "Unknown error"

        if type:
            type_name = type.__name__
            if "Timeout" in type_name:
                error_type = "TIMEOUT"
            elif "Connection" in type_name:
                error_type = "CONNECTION_ERROR"
            elif "Download" in type_name:
                error_type = "DOWNLOAD_ERROR"
            elif "Memory" in type_name:
                error_type = "OUT_OF_MEMORY"
            elif "Permission" in type_name:
                error_type = "PERMISSION_ERROR"
            else:
                error_type = type_name.upper()

        # 트레이스백 문자열 생성
        tb_str = None
        if tb:
            tb_str = "".join(traceback.format_tb(tb))

        # 재시도 횟수 (RQ에서 제공하는 정보 사용)
        retry_count = job.retries_left if hasattr(job, "retries_left") else 0
        max_retries = 2  # 기본 재시도 횟수
        actual_retry_count = max_retries - retry_count

        # DLQ에 추가
        dlq_id = queue_service.add_to_dlq(
            job_id=job_id,
            rq_job_id=job.id,
            job_type=job_type,
            user_id=user_id,
            error_message=error_message,
            error_type=error_type,
            retry_count=actual_retry_count,
            job_kwargs=job_kwargs,
            traceback=tb_str,
        )

        if dlq_id:
            logger.info(
                f"[DLQ] Job moved to Dead Letter Queue: {job_id} -> {dlq_id} "
                f"(type: {job_type}, error: {error_type}, retries: {actual_retry_count})"
            )

            # DB에 DLQ 이동 기록
            try:
                db_service = get_database_service()
                db_service.update_job_status(
                    job_id=job_id,
                    status="dlq",
                    error_code=error_type,
                    error_message=f"Moved to DLQ: {dlq_id}. Original error: {error_message[:200]}",
                )
            except Exception as db_error:
                logger.warning(f"[DLQ] Failed to update job status in DB: {db_error}")
        else:
            logger.error(f"[DLQ] Failed to add job to DLQ: {job_id}")

    except Exception as e:
        logger.error(f"[DLQ] Failure handler error: {e}", exc_info=True)
