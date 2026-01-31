"""
Pipeline Orchestrator - 파이프라인 통합 관리

main.py와 tasks.py의 파이프라인 로직을 통합하고
PipelineContext를 사용하여 전체 파이프라인을 관리합니다.
"""

import logging
import time
import asyncio
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

from context import PipelineContext
from context.layers import PIIStore
from .feature_flags import get_feature_flags

logger = logging.getLogger(__name__)


def _get_metrics_collector():
    """Lazy import to avoid circular dependencies"""
    try:
        from services.metrics_service import get_metrics_collector
        return get_metrics_collector()
    except ImportError:
        logger.warning("MetricsCollector not available")
        return None


@dataclass
class OrchestratorResult:
    """오케스트레이터 실행 결과"""
    success: bool
    candidate_id: Optional[str] = None
    confidence_score: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)

    # 처리 결과
    chunk_count: int = 0
    chunks_saved: int = 0
    pii_count: int = 0

    # 경고 및 에러
    warnings: list = field(default_factory=list)
    error: Optional[str] = None
    error_code: Optional[str] = None

    # 메타데이터
    processing_time_ms: int = 0
    pipeline_id: Optional[str] = None
    is_update: bool = False
    parent_id: Optional[str] = None

    # 디버그 정보
    context_summary: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "candidate_id": self.candidate_id,
            "confidence_score": self.confidence_score,
            "field_confidence": self.field_confidence,
            "chunk_count": self.chunk_count,
            "chunks_saved": self.chunks_saved,
            "pii_count": self.pii_count,
            "warnings": self.warnings,
            "error": self.error,
            "error_code": self.error_code,
            "processing_time_ms": self.processing_time_ms,
            "pipeline_id": self.pipeline_id,
            "is_update": self.is_update,
            "parent_id": self.parent_id,
        }


class PipelineOrchestrator:
    """
    파이프라인 오케스트레이터

    전체 이력서 처리 파이프라인을 관리합니다.

    Stages:
    1. 파일 다운로드 (Storage에서)
    2. 파일 파싱 (PDF/HWP/DOCX)
    3. PII 추출 (정규식 전용)
    4. 신원 확인 (Multi-Identity 체크)
    5. AI 분석 (GPT + Gemini)
    6. 검증 및 환각 탐지
    7. PII 마스킹 + 암호화
    8. 임베딩 생성
    9. DB 저장
    """

    def __init__(self):
        self.feature_flags = get_feature_flags()
        self._init_agents()

    def _init_agents(self):
        """에이전트 및 서비스 초기화"""
        # Lazy import to avoid circular dependencies
        from agents.router_agent import RouterAgent
        from utils.hwp_parser import HWPParser
        from utils.pdf_parser import PDFParser
        from utils.docx_parser import DOCXParser
        from config import get_settings

        settings = get_settings()

        self.router_agent = RouterAgent()
        self.hwp_parser = HWPParser(hancom_api_key=settings.HANCOM_API_KEY or None)
        self.pdf_parser = PDFParser()
        self.docx_parser = DOCXParser()

    async def run(
        self,
        file_bytes: bytes,
        filename: str,
        user_id: str,
        job_id: str,
        mode: str = "phase_1",
        candidate_id: Optional[str] = None,
        is_retry: bool = False,
    ) -> OrchestratorResult:
        """
        전체 파이프라인 실행

        Args:
            file_bytes: 파일 바이트
            filename: 파일명
            user_id: 사용자 ID
            job_id: 작업 ID
            mode: 분석 모드 (phase_1 or phase_2)
            candidate_id: 기존 후보자 ID (업데이트용)
            is_retry: 재시도 여부

        Returns:
            OrchestratorResult with processing results
        """
        start_time = time.time()

        # PipelineContext 생성
        ctx = PipelineContext()
        ctx.metadata.candidate_id = candidate_id
        ctx.metadata.job_id = job_id
        ctx.metadata.user_id = user_id
        ctx.metadata.config["mode"] = mode

        logger.info(f"[Orchestrator] Starting pipeline: {ctx.metadata.pipeline_id}")

        # 메트릭 수집 시작
        metrics_collector = _get_metrics_collector()
        if metrics_collector:
            metrics_collector.start_pipeline(
                pipeline_id=ctx.metadata.pipeline_id,
                job_id=job_id,
                user_id=user_id,
                pipeline_type="new",
                is_retry=is_retry,
            )

        try:
            # Stage 1: 원본 입력 설정
            ctx.set_raw_input(file_bytes, filename, source="upload")

            # Stage 2: 파싱
            parse_result = await self._stage_parsing(ctx)
            if not parse_result["success"]:
                return self._create_error_result(
                    ctx, parse_result["error"], "PARSE_FAILED", start_time
                )

            # Stage 3: PII 추출 (정규식 전용)
            await self._stage_pii_extraction(ctx)

            # Stage 4: 신원 확인
            identity_result = await self._stage_identity_check(ctx)
            if identity_result.get("should_reject"):
                return self._create_error_result(
                    ctx, identity_result["error"], "MULTI_IDENTITY", start_time
                )

            # Stage 5: AI 분석
            analysis_result = await self._stage_analysis(ctx, mode)
            if not analysis_result["success"]:
                return self._create_error_result(
                    ctx, analysis_result["error"], "ANALYSIS_FAILED", start_time
                )

            # Stage 6: 검증 및 환각 탐지
            await self._stage_validation(ctx)

            # Stage 7: PII 마스킹 + 암호화
            privacy_result = await self._stage_privacy(ctx)

            # Stage 8: 임베딩 생성
            embedding_result = await self._stage_embedding(ctx)

            # Stage 9: DB 저장
            save_result = await self._stage_save(ctx, user_id, job_id, mode, candidate_id)
            if not save_result["success"]:
                return self._create_error_result(
                    ctx, save_result["error"], "DB_SAVE_FAILED", start_time
                )

            # 완료
            final_result = ctx.finalize()
            processing_time = int((time.time() - start_time) * 1000)

            # 메트릭 완료 기록
            if metrics_collector:
                metrics_collector.complete_pipeline(
                    pipeline_id=ctx.metadata.pipeline_id,
                    success=True,
                    text_length=len(ctx.parsed_data.raw_text) if ctx.parsed_data.raw_text else 0,
                    chunk_count=embedding_result.get("chunk_count", 0),
                    pii_count=privacy_result.get("pii_count", 0),
                    confidence_score=final_result["confidence"],
                )

            logger.info(
                f"[Orchestrator] Pipeline completed: {ctx.metadata.pipeline_id}, "
                f"candidate={save_result['candidate_id']}, time={processing_time}ms"
            )

            return OrchestratorResult(
                success=True,
                candidate_id=save_result["candidate_id"],
                confidence_score=final_result["confidence"],
                field_confidence=dict(ctx.current_data.confidence_scores),
                chunk_count=embedding_result.get("chunk_count", 0),
                chunks_saved=save_result.get("chunks_saved", 0),
                pii_count=privacy_result.get("pii_count", 0),
                warnings=[w["message"] for w in final_result.get("warnings", [])],
                processing_time_ms=processing_time,
                pipeline_id=ctx.metadata.pipeline_id,
                is_update=save_result.get("is_update", False),
                parent_id=save_result.get("parent_id"),
                context_summary=ctx.to_dict() if self.feature_flags.debug_pipeline else None,
            )

        except Exception as e:
            logger.error(f"[Orchestrator] Pipeline error: {e}", exc_info=True)
            # 메트릭 에러 기록
            if metrics_collector:
                metrics_collector.complete_pipeline(
                    pipeline_id=ctx.metadata.pipeline_id,
                    success=False,
                    error_code="INTERNAL_ERROR",
                    error_message=str(e)[:200],
                )
            return self._create_error_result(ctx, str(e), "INTERNAL_ERROR", start_time)

    async def _stage_parsing(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 2: 파일 파싱"""
        from agents.router_agent import FileType
        from utils.hwp_parser import ParseMethod

        stage_start = time.time()
        ctx.start_stage("parsing", "router_agent")

        try:
            file_bytes = ctx.raw_input.file_bytes
            filename = ctx.raw_input.filename

            # Router Agent로 파일 분석
            router_result = self.router_agent.analyze(file_bytes, filename)

            if router_result.is_rejected:
                ctx.fail_stage("parsing", router_result.reject_reason, "FILE_REJECTED")
                return {"success": False, "error": router_result.reject_reason}

            # 파서 선택 및 파싱
            text = ""
            parse_method = "unknown"
            page_count = 0

            if router_result.file_type in [FileType.HWP, FileType.HWPX]:
                result = self.hwp_parser.parse(file_bytes, filename)
                text = result.text
                parse_method = result.method.value
                page_count = result.page_count

                if result.method == ParseMethod.FAILED:
                    ctx.fail_stage("parsing", result.error_message, "HWP_PARSE_FAILED")
                    return {"success": False, "error": result.error_message}

            elif router_result.file_type == FileType.PDF:
                result = self.pdf_parser.parse(file_bytes)
                text = result.text
                parse_method = result.method
                page_count = result.page_count

                if not result.success:
                    ctx.fail_stage("parsing", result.error_message, "PDF_PARSE_FAILED")
                    return {"success": False, "error": result.error_message}

            elif router_result.file_type in [FileType.DOC, FileType.DOCX]:
                result = self.docx_parser.parse(file_bytes, filename)
                text = result.text
                parse_method = result.method
                page_count = result.page_count

                if not result.success:
                    ctx.fail_stage("parsing", result.error_message, "DOCX_PARSE_FAILED")
                    return {"success": False, "error": result.error_message}
            else:
                error = f"Unsupported file type: {router_result.file_type}"
                ctx.fail_stage("parsing", error, "UNSUPPORTED_TYPE")
                return {"success": False, "error": error}

            # 텍스트 설정
            ctx.set_parsed_text(
                text,
                parsing_method=parse_method,
                parsing_confidence=0.9 if page_count > 0 else 0.7
            )

            # 텍스트 길이 체크
            from config import get_settings
            settings = get_settings()

            if len(text.strip()) < settings.MIN_TEXT_LENGTH:
                ctx.warning_collector.add_parsing_issue(
                    f"텍스트가 너무 짧습니다 ({len(text.strip())}자)"
                )

            ctx.complete_stage("parsing", {
                "text_length": len(text),
                "page_count": page_count,
                "parse_method": parse_method,
                "file_type": router_result.file_type.value,
            })

            # 스테이지 메트릭 기록
            stage_duration = int((time.time() - stage_start) * 1000)
            metrics_collector = _get_metrics_collector()
            if metrics_collector:
                metrics_collector.record_stage(ctx.metadata.pipeline_id, "parsing", stage_duration)

            logger.info(f"[Orchestrator] Parsing complete: {len(text)} chars, {page_count} pages")
            return {"success": True, "text": text}

        except Exception as e:
            ctx.fail_stage("parsing", str(e))
            return {"success": False, "error": str(e)}

    async def _stage_pii_extraction(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 3: PII 추출 (정규식 전용)"""
        ctx.start_stage("pii_extraction", "pii_extractor")

        try:
            # PipelineContext의 PII 추출 메서드 사용
            ctx.extract_pii()

            # PII 기반 제안 추가
            if ctx.pii_store.name:
                ctx.propose(
                    "pii_extractor", "name",
                    ctx.pii_store.name,
                    ctx.pii_store.name_confidence,
                    f"정규식 추출 ({ctx.pii_store.name_source})"
                )

            if ctx.pii_store.phone:
                ctx.propose(
                    "pii_extractor", "phone",
                    ctx.pii_store.phone,
                    ctx.pii_store.phone_confidence,
                    "정규식 추출"
                )

            if ctx.pii_store.email:
                ctx.propose(
                    "pii_extractor", "email",
                    ctx.pii_store.email,
                    ctx.pii_store.email_confidence,
                    "정규식 추출"
                )

            ctx.complete_stage("pii_extraction", {
                "name": bool(ctx.pii_store.name),
                "phone": bool(ctx.pii_store.phone),
                "email": bool(ctx.pii_store.email),
            })

            return {"success": True}

        except Exception as e:
            ctx.fail_stage("pii_extraction", str(e))
            return {"success": False, "error": str(e)}

    async def _stage_identity_check(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 4: 신원 확인 (Multi-Identity 체크)"""
        ctx.start_stage("identity_check", "identity_checker")

        try:
            from agents.identity_checker import get_identity_checker

            identity_checker = get_identity_checker()
            text = ctx.parsed_data.raw_text

            result = await identity_checker.check(text)

            if result.should_reject:
                error = f"다중 신원 감지: {result.person_count}명의 정보 ({result.reason})"
                ctx.fail_stage("identity_check", error, "MULTI_IDENTITY")
                ctx.warning_collector.add(
                    "MULTI_IDENTITY",
                    error,
                    severity="error"
                )
                return {"success": False, "should_reject": True, "error": error}

            ctx.complete_stage("identity_check", {
                "person_count": result.person_count,
                "confidence": result.confidence,
            })

            return {"success": True, "should_reject": False}

        except Exception as e:
            # Identity check 실패는 경고만 하고 계속 진행
            ctx.warning_collector.add(
                "IDENTITY_CHECK_FAILED",
                f"신원 확인 실패: {e}",
                severity="warning",
                user_visible=False
            )
            ctx.complete_stage("identity_check", {"skipped": True, "error": str(e)})
            return {"success": True, "should_reject": False}

    async def _stage_analysis(self, ctx: PipelineContext, mode: str) -> Dict[str, Any]:
        """Stage 5: AI 분석"""
        stage_start = time.time()
        ctx.start_stage("analysis", "analyst_agent")

        try:
            from agents.analyst_agent import get_analyst_agent
            from config import AnalysisMode

            # 마스킹된 텍스트 사용 (PII 보호)
            text = ctx.get_text_for_llm()
            filename = ctx.raw_input.filename

            analysis_mode = AnalysisMode.PHASE_2 if mode == "phase_2" else AnalysisMode.PHASE_1

            analyst = get_analyst_agent()
            result = await analyst.analyze(
                resume_text=text,
                mode=analysis_mode,
                filename=filename
            )

            if not result.success or not result.data:
                error = result.error or "분석 실패"
                ctx.fail_stage("analysis", error, "ANALYSIS_FAILED")
                return {"success": False, "error": error}

            # LLM 사용량 기록
            ctx.record_llm_call("analysis", result.processing_time_ms // 100)

            # 분석 결과를 제안으로 변환
            self._process_analysis_result(ctx, result)

            ctx.complete_stage("analysis", {
                "confidence_score": result.confidence_score,
                "warning_count": len(result.warnings),
                "mode": analysis_mode.value,
            })

            # 스테이지 메트릭 기록
            stage_duration = int((time.time() - stage_start) * 1000)
            metrics_collector = _get_metrics_collector()
            if metrics_collector:
                metrics_collector.record_stage(ctx.metadata.pipeline_id, "analysis", stage_duration)

                # LLM 호출 메트릭 (추정치 - 실제 토큰 수는 AnalystAgent에서 가져와야 함)
                # TODO: AnalystAgent에서 실제 토큰 수 반환하도록 수정
                estimated_tokens = len(text) // 4  # 대략적인 추정
                metrics_collector.record_llm_call(
                    ctx.metadata.pipeline_id,
                    "openai",  # 기본 프로바이더
                    "gpt-4o",
                    tokens_input=estimated_tokens,
                    tokens_output=500,  # 추정치
                )

            logger.info(f"[Orchestrator] Analysis complete: confidence={result.confidence_score:.2f}")
            return {"success": True, "result": result}

        except Exception as e:
            ctx.fail_stage("analysis", str(e))
            return {"success": False, "error": str(e)}

    def _process_analysis_result(self, ctx: PipelineContext, result):
        """분석 결과를 PipelineContext 제안으로 변환"""
        data = result.data
        field_confidence = result.field_confidence

        # 주요 필드 제안
        fields_to_propose = [
            "exp_years", "current_company", "current_position",
            "summary", "last_company", "last_position"
        ]

        for field_name in fields_to_propose:
            if data.get(field_name) is not None:
                confidence = field_confidence.get(field_name, 0.7)

                # 증거 추가
                if self.feature_flags.use_evidence_tracking:
                    ctx.add_evidence(
                        field_name=field_name,
                        value=data[field_name],
                        llm_provider="analyst_agent",
                        confidence=confidence,
                        reasoning=f"LLM 분석 결과"
                    )

                # 제안 추가
                ctx.propose(
                    "analyst_agent", field_name,
                    data[field_name],
                    confidence,
                    "LLM 분석 결과"
                )

        # 배열 필드
        array_fields = ["careers", "educations", "skills", "certifications", "projects"]
        for field_name in array_fields:
            if data.get(field_name):
                confidence = field_confidence.get(field_name, 0.7)
                ctx.propose(
                    "analyst_agent", field_name,
                    data[field_name],
                    confidence,
                    f"LLM 분석 결과 ({len(data[field_name])}개)"
                )

        # 경고 변환
        for warning in result.warnings:
            ctx.warning_collector.add(
                warning.code if hasattr(warning, 'code') else "LLM_WARNING",
                warning.message if hasattr(warning, 'message') else str(warning),
                severity="info"
            )

    async def _stage_validation(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 6: 검증 및 환각 탐지"""
        ctx.start_stage("validation", "validation_agent")

        try:
            # 현재 결정된 데이터 수집
            decisions = ctx.decision_manager.decide_all()
            analyzed_data = {
                name: d.final_value for name, d in decisions.items()
                if d.final_value is not None
            }

            # LLM 검증 사용 여부에 따라 분기
            if self.feature_flags.use_llm_validation:
                # 새로운 ValidationWrapper 사용 (LLM 검증 포함)
                from .validation_wrapper import get_validation_wrapper

                validation_wrapper = get_validation_wrapper()
                result = await validation_wrapper.validate(ctx, analyzed_data)

                if result.success:
                    # 검증된 데이터로 추가 제안
                    for field_name, value in result.validated_data.items():
                        if value != analyzed_data.get(field_name):
                            boost = result.confidence_adjustments.get(field_name, 0)
                            ctx.propose(
                                "validation_wrapper", field_name,
                                value,
                                0.8 + boost,
                                "LLM+Regex 검증 결과"
                            )

                    # 보정 사항 로깅
                    for correction in result.regex_corrections:
                        logger.info(
                            f"[Orchestrator] Regex correction: {correction['field']}: "
                            f"{correction['original']} → {correction['corrected']}"
                        )
                    for correction in result.llm_corrections:
                        logger.info(
                            f"[Orchestrator] LLM correction: {correction['field']}: "
                            f"{correction['original']} → {correction['corrected']} "
                            f"(by {correction.get('llm_provider', 'unknown')})"
                        )

                ctx.complete_stage("validation", {
                    "regex_corrections": len(result.regex_corrections),
                    "llm_validations": len(result.llm_validations),
                    "llm_corrections": len(result.llm_corrections),
                    "hallucinations_detected": len(ctx.hallucination_detector.records),
                    "providers_used": result.providers_used,
                })
            else:
                # 기존 regex 전용 ValidationAgent 사용
                from agents.validation_agent import get_validation_agent

                validation_agent = get_validation_agent()
                result = validation_agent.validate(
                    analyzed_data=analyzed_data,
                    original_text=ctx.parsed_data.raw_text,
                    filename=ctx.raw_input.filename
                )

                if result.success:
                    # 검증된 데이터로 추가 제안
                    for field_name, value in result.validated_data.items():
                        if value != analyzed_data.get(field_name):
                            boost = result.confidence_adjustments.get(field_name, 0)
                            ctx.propose(
                                "validation_agent", field_name,
                                value,
                                0.8 + boost,
                                "ValidationAgent 검증 결과"
                            )

                    # 보정 사항 로깅
                    for correction in result.corrections:
                        logger.info(
                            f"[Orchestrator] Validation correction: {correction['field']}: "
                            f"{correction['original']} → {correction['corrected']}"
                        )

                # 환각 탐지 (기존 방식)
                if self.feature_flags.use_hallucination_detection:
                    self._detect_hallucinations(ctx, analyzed_data)

                ctx.complete_stage("validation", {
                    "corrections": len(result.corrections) if result else 0,
                    "hallucinations_detected": len(ctx.hallucination_detector.records),
                })

            return {"success": True}

        except Exception as e:
            ctx.warning_collector.add(
                "VALIDATION_ERROR",
                f"검증 중 오류: {e}",
                severity="warning",
                user_visible=False
            )
            ctx.complete_stage("validation", {"error": str(e)})
            return {"success": True}  # 검증 실패해도 계속 진행

    def _detect_hallucinations(self, ctx: PipelineContext, analyzed_data: Dict[str, Any]):
        """환각 탐지 수행"""
        fields_to_check = ["exp_years", "current_company", "current_position"]

        for field_name in fields_to_check:
            value = analyzed_data.get(field_name)
            if value:
                is_valid = ctx.verify_hallucination(field_name, value, "analyst_agent")
                if not is_valid:
                    logger.warning(f"[Orchestrator] Hallucination detected: {field_name}={value}")

    async def _stage_privacy(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 7: PII 마스킹 + 암호화"""
        ctx.start_stage("privacy", "privacy_agent")

        try:
            from agents.privacy_agent import get_privacy_agent

            # 현재 결정된 데이터
            decisions = ctx.decision_manager.decide_all()
            analyzed_data = {
                name: d.final_value for name, d in decisions.items()
                if d.final_value is not None
            }

            privacy_agent = get_privacy_agent()
            result = privacy_agent.process(analyzed_data)

            pii_count = 0
            if result.success:
                pii_count = len(result.pii_found)

                # 마스킹된 데이터로 CurrentData 업데이트
                for field_name, value in result.masked_data.items():
                    if hasattr(ctx.current_data, field_name):
                        setattr(ctx.current_data, field_name, value)

            ctx.complete_stage("privacy", {
                "pii_count": pii_count,
                "encrypted_fields": list(result.encrypted_store.keys()) if result.success else [],
            })

            return {
                "success": True,
                "pii_count": pii_count,
                "encrypted_store": result.encrypted_store if result.success else {},
                "hash_store": {},  # hash_store는 save 단계에서 생성
            }

        except Exception as e:
            ctx.warning_collector.add(
                "PRIVACY_ERROR",
                f"PII 처리 중 오류: {e}",
                severity="warning",
                user_visible=False
            )
            ctx.complete_stage("privacy", {"error": str(e)})
            return {"success": True, "pii_count": 0}

    async def _stage_embedding(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Stage 8: 임베딩 생성"""
        ctx.start_stage("embedding", "embedding_service")

        try:
            from services.embedding_service import get_embedding_service

            # 현재 결정된 데이터
            decisions = ctx.decision_manager.decide_all()
            analyzed_data = {
                name: d.final_value for name, d in decisions.items()
                if d.final_value is not None
            }

            embedding_service = get_embedding_service()
            result = await embedding_service.process_candidate(
                data=analyzed_data,
                generate_embeddings=True,
                raw_text=ctx.parsed_data.raw_text
            )

            if result and result.success:
                ctx.complete_stage("embedding", {
                    "chunk_count": len(result.chunks),
                    "total_tokens": result.total_tokens,
                })
                return {
                    "success": True,
                    "chunk_count": len(result.chunks),
                    "chunks": result.chunks,
                }
            else:
                ctx.warning_collector.add(
                    "EMBEDDING_FAILED",
                    "임베딩 생성 실패",
                    severity="warning"
                )
                ctx.complete_stage("embedding", {"error": result.error if result else "Unknown"})
                return {"success": False, "chunk_count": 0, "chunks": []}

        except Exception as e:
            ctx.warning_collector.add(
                "EMBEDDING_ERROR",
                f"임베딩 생성 중 오류: {e}",
                severity="warning",
                user_visible=False
            )
            ctx.complete_stage("embedding", {"error": str(e)})
            return {"success": False, "chunk_count": 0, "chunks": []}

    async def _stage_save(
        self,
        ctx: PipelineContext,
        user_id: str,
        job_id: str,
        mode: str,
        candidate_id: Optional[str]
    ) -> Dict[str, Any]:
        """Stage 9: DB 저장"""
        ctx.start_stage("save", "database_service")

        try:
            from services.database_service import get_database_service
            from agents.privacy_agent import get_privacy_agent

            db_service = get_database_service()

            # 모든 결정 확정
            ctx.decide_all()

            # 최종 데이터 준비
            analyzed_data = ctx.current_data.to_candidate_dict()

            # 해시 생성 (중복 체크용)
            privacy_agent = get_privacy_agent()
            hash_store = {}
            if ctx.pii_store.phone:
                hash_store["phone"] = privacy_agent.hash_for_dedup(ctx.pii_store.phone)
            if ctx.pii_store.email:
                hash_store["email"] = privacy_agent.hash_for_dedup(ctx.pii_store.email)

            # DB 저장
            save_result = db_service.save_candidate(
                user_id=user_id,
                job_id=job_id,
                analyzed_data=analyzed_data,
                confidence_score=ctx.current_data.overall_confidence / 100,
                field_confidence={
                    k: v / 100 for k, v in ctx.current_data.confidence_scores.items()
                },
                warnings=[w.to_dict() for w in ctx.warning_collector.get_user_visible()],
                encrypted_store={},  # Privacy Agent에서 처리됨
                hash_store=hash_store,
                source_file=ctx.raw_input.file_path or "",
                file_type=ctx.raw_input.file_extension,
                analysis_mode=mode,
                candidate_id=candidate_id,
            )

            if not save_result.success:
                ctx.fail_stage("save", save_result.error or "DB 저장 실패")
                return {"success": False, "error": save_result.error}

            # 청크 저장
            chunks_saved = 0
            embedding_result = ctx.stage_results.results.get("embedding")
            if embedding_result and embedding_result.output.get("chunks"):
                chunks = embedding_result.output["chunks"]
                chunks_saved = db_service.save_chunks_with_embeddings(
                    candidate_id=save_result.candidate_id,
                    chunks=chunks
                )

            ctx.complete_stage("save", {
                "candidate_id": save_result.candidate_id,
                "chunks_saved": chunks_saved,
                "is_update": save_result.is_update,
            })

            return {
                "success": True,
                "candidate_id": save_result.candidate_id,
                "chunks_saved": chunks_saved,
                "is_update": save_result.is_update,
                "parent_id": save_result.parent_id,
            }

        except Exception as e:
            ctx.fail_stage("save", str(e))
            return {"success": False, "error": str(e)}

    def _create_error_result(
        self,
        ctx: PipelineContext,
        error: str,
        error_code: str,
        start_time: float
    ) -> OrchestratorResult:
        """에러 결과 생성"""
        processing_time = int((time.time() - start_time) * 1000)

        return OrchestratorResult(
            success=False,
            error=error,
            error_code=error_code,
            processing_time_ms=processing_time,
            pipeline_id=ctx.metadata.pipeline_id,
            warnings=[w.message for w in ctx.warning_collector.warnings],
            context_summary=ctx.to_dict() if self.feature_flags.debug_pipeline else None,
        )


# 싱글톤 인스턴스
_orchestrator: Optional[PipelineOrchestrator] = None


def get_pipeline_orchestrator() -> PipelineOrchestrator:
    """PipelineOrchestrator 싱글톤 인스턴스 반환"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = PipelineOrchestrator()
    return _orchestrator
