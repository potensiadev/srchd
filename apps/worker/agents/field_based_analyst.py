"""
Field-Based Analyst - 필드별 전문 Extractor 오케스트레이션

6개의 전문 Extractor를 병렬로 실행하고 결과를 집계합니다.
- Stage 5.1: Field Extraction (6 Extractors 병렬)
- Stage 5.2: Cross-Validation + Aggregation
"""

import asyncio
import logging
import time
import traceback
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional, Tuple

from services.llm_manager import get_llm_manager, LLMProvider
from agents.extractors import (
    ProfileExtractor,
    CareerExtractor,
    EducationExtractor,
    SkillsExtractor,
    ProjectsExtractor,
    SummaryGenerator,
    ExtractionResult,
)
from agents.aggregator import Aggregator, AggregatedResult, create_aggregator
from context.quality_metrics import QualityMetrics, QualityGateResult
from orchestrator.feature_flags import get_feature_flags

logger = logging.getLogger(__name__)


@dataclass
class FieldBasedAnalystResult:
    """
    FieldBasedAnalyst 실행 결과
    """
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)

    # 신뢰도
    confidence_map: Dict[str, float] = field(default_factory=dict)
    field_confidence: Dict[str, float] = field(default_factory=dict)
    overall_confidence: float = 0.0

    # 품질 지표
    quality_metrics: Optional[QualityMetrics] = None
    quality_gate_passed: bool = False
    quality_warnings: List[str] = field(default_factory=list)

    # 토큰 사용량
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    # 메타데이터
    extractors_used: List[str] = field(default_factory=list)
    providers_used: List[str] = field(default_factory=list)
    cross_validation_performed: bool = False
    processing_time_ms: int = 0
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        if self.quality_metrics:
            result["quality_metrics"] = self.quality_metrics.to_dict()
        return result


class FieldBasedAnalyst:
    """
    필드별 전문 Extractor 기반 분석기

    6개의 Extractor를 병렬로 실행하여 효율적으로 추출합니다:
    1. ProfileExtractor: name, phone, email, birth_year, gender, address
    2. CareerExtractor: careers, exp_years, current_company, current_position
    3. EducationExtractor: educations, education_level, education_school
    4. SkillsExtractor: skills, certifications, languages
    5. ProjectsExtractor: projects, portfolio_url, github_url
    6. SummaryGenerator: summary, strengths, match_reason
    """

    def __init__(self):
        self.llm_manager = get_llm_manager()
        self.feature_flags = get_feature_flags()

        # Extractor 인스턴스
        self.profile_extractor = ProfileExtractor()
        self.career_extractor = CareerExtractor()
        self.education_extractor = EducationExtractor()
        self.skills_extractor = SkillsExtractor()
        self.projects_extractor = ProjectsExtractor()
        self.summary_generator = SummaryGenerator()

    async def analyze(
        self,
        text: str,
        filename: Optional[str] = None,
        enable_cross_validation: bool = True,
        providers: Optional[List[LLMProvider]] = None
    ) -> FieldBasedAnalystResult:
        """
        이력서 분석 실행

        Args:
            text: 이력서 텍스트
            filename: 파일명
            enable_cross_validation: 교차검증 활성화 여부
            providers: 사용할 LLM 제공자 목록

        Returns:
            FieldBasedAnalystResult
        """
        start_time = time.time()
        result = FieldBasedAnalystResult(success=True)

        try:
            # 기본 provider 설정
            providers = providers or [LLMProvider.OPENAI, LLMProvider.GEMINI]
            primary_provider = providers[0]

            logger.info(
                f"[FieldBasedAnalyst] 분석 시작: "
                f"text_len={len(text)}, "
                f"cross_validation={enable_cross_validation}, "
                f"providers={[p.value for p in providers]}"
            )

            # Stage 5.1: 병렬 추출
            logger.info(f"[FieldBasedAnalyst] Stage 5.1: 병렬 추출 시작 (cross_val={enable_cross_validation})")
            if enable_cross_validation and len(providers) > 1:
                # 교차검증 모드: 여러 provider로 병렬 추출
                extractor_results, cross_val_results = await self._extract_with_cross_validation(
                    text, filename, providers
                )
                result.cross_validation_performed = True
            else:
                # 단일 provider 모드
                extractor_results = await self._extract_parallel(
                    text, filename, primary_provider
                )
                cross_val_results = None

            logger.info(f"[FieldBasedAnalyst] Stage 5.1 완료: {len(extractor_results)} extractors")
            for ext_type, ext_result in extractor_results.items():
                logger.info(f"  - {ext_type}: success={ext_result.success}, fields={len(ext_result.data)}")

            # Stage 5.2: 집계 및 합의
            logger.info(f"[FieldBasedAnalyst] Stage 5.2: Aggregation 시작...")
            aggregator = create_aggregator(text)
            aggregated = aggregator.aggregate(extractor_results, cross_val_results)
            logger.info(f"[FieldBasedAnalyst] Stage 5.2 완료: {len(aggregated.data)} 필드, confidence={aggregated.overall_confidence:.2f}")

            # 결과 복사
            result.success = aggregated.success
            result.data = aggregated.data
            result.confidence_map = aggregated.confidence_map
            result.field_confidence = aggregated.confidence_map
            result.overall_confidence = aggregated.overall_confidence
            result.quality_metrics = aggregated.quality_metrics
            result.quality_gate_passed = aggregated.quality_gate_passed
            result.quality_warnings = aggregated.quality_warnings
            result.total_input_tokens = aggregated.total_input_tokens
            result.total_output_tokens = aggregated.total_output_tokens
            result.extractors_used = aggregated.extractors_used
            result.warnings = aggregated.warnings
            result.providers_used = [p.value for p in providers]

        except Exception as e:
            logger.error(f"[FieldBasedAnalyst] 분석 실패: {e}")
            logger.error(traceback.format_exc())
            result.success = False
            result.error = str(e)

        result.processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"[FieldBasedAnalyst] 분석 완료: "
            f"success={result.success}, "
            f"fields={len(result.data)}, "
            f"confidence={result.overall_confidence:.2f}, "
            f"time={result.processing_time_ms}ms"
        )

        return result

    async def _extract_parallel(
        self,
        text: str,
        filename: Optional[str],
        provider: LLMProvider
    ) -> Dict[str, ExtractionResult]:
        """
        6개 Extractor 병렬 실행

        Returns:
            Extractor 타입 → 결과 매핑
        """
        tasks = [
            self.profile_extractor.extract(text, filename, provider),
            self.career_extractor.extract(text, filename, provider),
            self.education_extractor.extract(text, filename, provider),
            self.skills_extractor.extract(text, filename, provider),
            self.projects_extractor.extract(text, filename, provider),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        extractor_types = ["profile", "career", "education", "skills", "projects"]
        extractor_results: Dict[str, ExtractionResult] = {}

        for extractor_type, result in zip(extractor_types, results):
            if isinstance(result, Exception):
                logger.error(f"[FieldBasedAnalyst] {extractor_type} 실패: {result}")
                extractor_results[extractor_type] = ExtractionResult(
                    success=False,
                    extractor_type=extractor_type,
                    error=str(result)
                )
            else:
                extractor_results[extractor_type] = result

        logger.info(f"[FieldBasedAnalyst] 5개 Extractor 완료, Summary 생성 시작...")

        # Summary는 다른 추출 결과를 컨텍스트로 사용
        try:
            extracted_data = self._merge_extracted_data(extractor_results)
            logger.info(f"[FieldBasedAnalyst] 데이터 병합 완료: {len(extracted_data)} 필드")

            summary_result = await self.summary_generator.generate(
                text, extracted_data, filename, provider
            )
            extractor_results["summary"] = summary_result
            logger.info(f"[FieldBasedAnalyst] Summary 생성 완료: success={summary_result.success}")
        except Exception as e:
            logger.error(f"[FieldBasedAnalyst] Summary 생성 실패: {e}", exc_info=True)
            extractor_results["summary"] = ExtractionResult(
                success=False,
                extractor_type="summary",
                error=str(e)
            )

        return extractor_results

    async def _extract_with_cross_validation(
        self,
        text: str,
        filename: Optional[str],
        providers: List[LLMProvider]
    ) -> Tuple[Dict[str, ExtractionResult], Dict[str, Dict[LLMProvider, ExtractionResult]]]:
        """
        교차검증을 위한 다중 provider 추출

        Returns:
            (주 결과, 개별 provider 결과)
        """
        # 각 provider별로 병렬 추출
        all_tasks = []
        for provider in providers:
            task = self._extract_parallel(text, filename, provider)
            all_tasks.append(task)

        provider_results = await asyncio.gather(*all_tasks, return_exceptions=True)

        # 결과 정리
        cross_val_results: Dict[str, Dict[LLMProvider, ExtractionResult]] = {}
        primary_results: Dict[str, ExtractionResult] = {}

        for provider, results in zip(providers, provider_results):
            if isinstance(results, Exception):
                logger.error(f"[FieldBasedAnalyst] Provider {provider.value} 전체 실패: {results}")
                continue

            for extractor_type, result in results.items():
                if extractor_type not in cross_val_results:
                    cross_val_results[extractor_type] = {}
                cross_val_results[extractor_type][provider] = result

                # 첫 번째 성공 결과를 주 결과로
                if extractor_type not in primary_results and result.success:
                    primary_results[extractor_type] = result

        return primary_results, cross_val_results

    def _merge_extracted_data(
        self,
        extractor_results: Dict[str, ExtractionResult]
    ) -> Dict[str, Any]:
        """추출 결과 병합 (Summary 생성 컨텍스트용)"""
        merged = {}
        for result in extractor_results.values():
            if result.success:
                merged.update(result.data)
        return merged

    async def quick_extract(
        self,
        text: str,
        filename: Optional[str] = None,
        fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        특정 필드만 빠르게 추출 (교차검증 없음)

        Args:
            text: 이력서 텍스트
            filename: 파일명
            fields: 추출할 필드 목록

        Returns:
            추출된 데이터
        """
        fields = fields or ["name", "exp_years", "current_company", "skills"]

        # 필요한 Extractor만 실행
        extractors_needed = set()
        field_to_extractor = {
            "name": "profile", "phone": "profile", "email": "profile",
            "birth_year": "profile", "gender": "profile",
            "careers": "career", "exp_years": "career",
            "current_company": "career", "current_position": "career",
            "educations": "education", "education_level": "education",
            "skills": "skills", "certifications": "skills",
            "projects": "projects",
            "summary": "summary", "strengths": "summary",
        }

        for field in fields:
            extractor = field_to_extractor.get(field)
            if extractor:
                extractors_needed.add(extractor)

        # 병렬 추출
        tasks = []
        extractor_map = {
            "profile": self.profile_extractor,
            "career": self.career_extractor,
            "education": self.education_extractor,
            "skills": self.skills_extractor,
            "projects": self.projects_extractor,
        }

        for extractor_name in extractors_needed:
            if extractor_name in extractor_map:
                tasks.append(extractor_map[extractor_name].extract(
                    text, filename, LLMProvider.OPENAI
                ))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 결과 병합
        merged = {}
        for result in results:
            if isinstance(result, ExtractionResult) and result.success:
                for field in fields:
                    if field in result.data:
                        merged[field] = result.data[field]

        return merged


# 싱글톤 인스턴스
_instance: Optional[FieldBasedAnalyst] = None


def get_field_based_analyst() -> FieldBasedAnalyst:
    """FieldBasedAnalyst 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = FieldBasedAnalyst()
    return _instance
