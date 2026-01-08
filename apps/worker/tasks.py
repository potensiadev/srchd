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
from services.embedding_service import get_embedding_service, EmbeddingResult
from services.database_service import get_database_service, SaveResult

logger = logging.getLogger(__name__)
settings = get_settings()

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
    max_retries: int = 2
):
    """
    Webhook으로 작업 완료 알림 전송 (동기, 재시도 포함)

    Next.js API의 /api/webhooks/worker 로 전송

    Args:
        job_id: 작업 ID
        status: 작업 상태
        result: 결과 데이터
        error: 에러 메시지
        max_retries: 최대 재시도 횟수 (기본: 2, 총 3번 시도)
    """
    webhook_url = settings.WEBHOOK_URL
    if not webhook_url:
        logger.debug(f"[Webhook] URL not configured, skipping notification for job {job_id}")
        return

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

        # 재시도 전 대기 (지수 백오프: 1초, 2초)
        if attempt < max_retries:
            wait_time = 2 ** attempt
            logger.info(f"[Webhook] Retrying in {wait_time} seconds...")
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
    max_retries: int = 3,
    retry_delay: float = 1.0
) -> bytes:
    """
    Supabase Storage에서 파일 다운로드 (재시도 로직 포함)

    Args:
        file_path: Storage 경로 (예: "resumes/{user_id}/{filename}")
        max_retries: 최대 재시도 횟수 (기본: 3)
        retry_delay: 재시도 간 대기 시간 (기본: 1초, 지수 백오프 적용)

    Returns:
        파일 바이트 데이터

    Raises:
        DownloadError: 모든 재시도 실패 시
    """
    from supabase import create_client

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
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

        # ─────────────────────────────────────────────────
        # Step 0: Multi-Identity 체크 (악용 방지)
        # PRD: "2명 이상의 정보 감지 시 처리 거절, 크레딧 미차감"
        # ─────────────────────────────────────────────────
        identity_checker = get_identity_checker()
        identity_result = asyncio.run(identity_checker.check(text))

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

        # RQ는 동기 환경이므로 asyncio.run 사용
        analysis_result: AnalysisResult = asyncio.run(
            analyst.analyze(resume_text=text, mode=analysis_mode, filename=file_name)
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
                analyzed_data["exp_total_months"] = career_summary.total_months
                analyzed_data["exp_display"] = career_summary.format_korean()
                analyzed_data["has_current_job"] = career_summary.has_current_job
                original_data["exp_total_months"] = career_summary.total_months
                original_data["exp_display"] = career_summary.format_korean()
                logger.info(
                    f"[Task] Career calculated: {career_summary.total_months} months "
                    f"({career_summary.format_korean()})"
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
        # ─────────────────────────────────────────────────
        embedding_service = get_embedding_service()
        embeddings_failed = False
        embeddings_error = None

        try:
            embedding_result: EmbeddingResult = asyncio.run(
                embedding_service.process_candidate(data=analyzed_data, generate_embeddings=True)
            )
        except Exception as embed_error:
            logger.error(f"[Task] Embedding generation exception: {embed_error}")
            embeddings_failed = True
            embeddings_error = str(embed_error)
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
                thumbnail_result = asyncio.run(
                    visual_agent.capture_portfolio_thumbnail(portfolio_url)
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
        except Exception as visual_error:
            # Visual Agent 실패해도 전체 처리는 계속
            logger.warning(f"[Task] Visual processing skipped: {visual_error}")

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
    candidate_id: Optional[str] = None,
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

        # ─────────────────────────────────────────────────
        # Progressive Loading Phase 1: 빠른 기본 정보 추출
        # 파싱 완료 직후, AI 분석 전에 기본 정보를 먼저 저장
        # ─────────────────────────────────────────────────
        if candidate_id:
            try:
                from utils.quick_extractor import extract_quick_info

                parsed_text = parse_result.get("text", "")
                quick_data = extract_quick_info(parsed_text)

                # DB에 parsed 상태로 저장 + quick_extracted 데이터
                db_service.update_candidate_quick_extracted(candidate_id, quick_data)

                # Job 상태를 'analyzing'으로 업데이트
                db_service.update_job_status(job_id, status="analyzing")

                # Webhook: parsed 단계 알림 (UI 실시간 업데이트)
                notify_webhook(job_id, "parsed", result={
                    "candidate_id": candidate_id,
                    "phase": "parsed",
                    "quick_data": quick_data,
                })

                logger.info(
                    f"[Progressive] Phase 1 completed: candidate={candidate_id}, "
                    f"name={quick_data.get('name')}, company={quick_data.get('last_company')}"
                )
            except Exception as quick_error:
                # 빠른 추출 실패해도 전체 파이프라인은 계속 진행
                logger.warning(f"[Progressive] Quick extraction failed: {quick_error}")

        # Step 2: 이력서 처리
        process_result = process_resume(
            job_id=job_id,
            user_id=user_id,
            text=parse_result["text"],
            mode=mode,
            source_file=file_path,
            file_type=parse_result.get("file_type", ""),
            file_name=file_name,
            candidate_id=candidate_id,
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
