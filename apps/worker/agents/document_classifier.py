"""
DocumentClassifier (ResumeIntentGuard)

이력서 vs 비이력서를 분류하여 크레딧 낭비를 방지합니다.

분류 전략:
1. Rule-based (빠름, 무료): 키워드 기반 신호 탐지
2. LLM Fallback (정확함, 비용): confidence < threshold 시 GPT-4o-mini 호출

파이프라인 위치:
RouterAgent → Parser → [DocumentClassifier] → IdentityChecker → ...
"""

import logging
import time
import re
from typing import Optional

from schemas.phase1_types import (
    DocumentKind,
    NonResumeType,
    ClassificationResult,
    RESUME_SIGNALS_KO,
    RESUME_SIGNALS_EN,
    NON_RESUME_SIGNALS,
)

logger = logging.getLogger(__name__)


class DocumentClassifier:
    """
    이력서 vs 비이력서 분류기

    LLM 호출: 0-1 (Rule-based로 충분하면 0, 불확실하면 1)
    """

    # 최소 이력서 신호 수 (이상이면 이력서로 판단)
    MIN_RESUME_SIGNALS = 3

    # 비이력서 강력 신호 (하나라도 있으면 비이력서 가능성 높음)
    STRONG_NON_RESUME_WEIGHT = 2

    def __init__(self, llm_manager=None):
        """
        Args:
            llm_manager: LLM 호출용 (optional, LLM fallback 시 필요)
        """
        self.llm_manager = llm_manager

    async def classify(
        self,
        text: str,
        filename: str,
        confidence_threshold: float = 0.7
    ) -> ClassificationResult:
        """
        문서 분류 수행

        Args:
            text: 파싱된 텍스트
            filename: 파일명 (힌트로 활용)
            confidence_threshold: LLM fallback 임계값

        Returns:
            ClassificationResult
        """
        start_time = time.time()

        # Step 1: Rule-based 분류
        rule_result = self._classify_by_rules(text, filename)

        logger.info(
            f"[DocumentClassifier] Rule-based result: "
            f"kind={rule_result.document_kind.value}, "
            f"confidence={rule_result.confidence:.2f}, "
            f"signals={len(rule_result.signals)}"
        )

        # 충분한 신뢰도면 바로 반환
        if rule_result.confidence >= confidence_threshold:
            rule_result.processing_time_ms = int((time.time() - start_time) * 1000)
            return rule_result

        # Step 2: LLM Fallback (confidence < threshold)
        if self.llm_manager:
            logger.info(
                f"[DocumentClassifier] Confidence {rule_result.confidence:.2f} < "
                f"threshold {confidence_threshold}, using LLM fallback"
            )
            llm_result = await self._classify_by_llm(text, filename)
            llm_result.processing_time_ms = int((time.time() - start_time) * 1000)
            return llm_result

        # LLM 없으면 uncertain으로 처리
        if rule_result.confidence < 0.5:
            rule_result.document_kind = DocumentKind.UNCERTAIN

        rule_result.processing_time_ms = int((time.time() - start_time) * 1000)
        return rule_result

    def _classify_by_rules(self, text: str, filename: str) -> ClassificationResult:
        """
        규칙 기반 분류

        Args:
            text: 문서 텍스트
            filename: 파일명

        Returns:
            ClassificationResult
        """
        text_lower = text.lower()
        filename_lower = filename.lower()
        signals = []

        # 이력서 신호 점수
        resume_score = 0

        # 1. 파일명에서 힌트 추출
        resume_filename_hints = ["이력서", "resume", "cv", "경력", "지원서"]
        non_resume_filename_hints = ["채용", "공고", "jd", "job", "모집"]

        for hint in resume_filename_hints:
            if hint in filename_lower:
                signals.append(f"filename:{hint}")
                resume_score += 2

        for hint in non_resume_filename_hints:
            if hint in filename_lower:
                signals.append(f"filename_non_resume:{hint}")
                resume_score -= 3

        # 2. 이력서 신호 탐지 (한글)
        for signal in RESUME_SIGNALS_KO:
            if signal in text:
                signals.append(f"resume_ko:{signal}")
                resume_score += 1

        # 3. 이력서 신호 탐지 (영문)
        for signal in RESUME_SIGNALS_EN:
            if signal in text_lower:
                signals.append(f"resume_en:{signal}")
                resume_score += 1

        # 4. 비이력서 신호 탐지
        detected_non_resume_type = None
        non_resume_score = 0

        for nr_type, keywords in NON_RESUME_SIGNALS.items():
            for keyword in keywords:
                if keyword in text_lower or keyword in text:
                    signals.append(f"non_resume:{nr_type.value}:{keyword}")
                    non_resume_score += self.STRONG_NON_RESUME_WEIGHT
                    if detected_non_resume_type is None:
                        detected_non_resume_type = nr_type

        # 5. 추가 휴리스틱: 연락처 패턴
        phone_pattern = r'01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}'
        email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'

        if re.search(phone_pattern, text):
            signals.append("pattern:phone")
            resume_score += 2

        if re.search(email_pattern, text):
            signals.append("pattern:email")
            resume_score += 1

        # 6. 점수 계산 및 분류 결정
        net_score = resume_score - non_resume_score

        if net_score >= self.MIN_RESUME_SIGNALS:
            # 이력서
            confidence = min(0.95, 0.5 + (net_score * 0.08))
            return ClassificationResult(
                document_kind=DocumentKind.RESUME,
                confidence=confidence,
                non_resume_type=None,
                signals=signals,
                llm_used=False,
            )

        elif net_score <= -2 and detected_non_resume_type:
            # 비이력서 (강한 신호)
            confidence = min(0.95, 0.6 + (abs(net_score) * 0.08))
            return ClassificationResult(
                document_kind=DocumentKind.NON_RESUME,
                confidence=confidence,
                non_resume_type=detected_non_resume_type,
                signals=signals,
                llm_used=False,
            )

        else:
            # 불확실
            confidence = max(0.3, 0.5 - (abs(net_score) * 0.05))
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                confidence=confidence,
                non_resume_type=detected_non_resume_type,
                signals=signals,
                llm_used=False,
            )

    async def _classify_by_llm(self, text: str, filename: str) -> ClassificationResult:
        """
        LLM 기반 분류 (GPT-4o-mini)

        Args:
            text: 문서 텍스트
            filename: 파일명

        Returns:
            ClassificationResult
        """
        if not self.llm_manager:
            logger.warning("[DocumentClassifier] LLM manager not available")
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                confidence=0.5,
                signals=["llm_unavailable"],
                llm_used=False,
            )

        # 텍스트 길이 제한 (비용 절감)
        max_chars = 3000
        truncated_text = text[:max_chars] if len(text) > max_chars else text

        prompt = f"""Analyze this document and determine if it is a RESUME/CV or NOT.

Document filename: {filename}
Document content (first {max_chars} chars):
---
{truncated_text}
---

Instructions:
1. A RESUME/CV contains personal information about ONE person seeking employment
2. It typically includes: name, contact info, work experience, education, skills
3. NON-RESUME documents include: job descriptions, certificates, company profiles, contracts

Respond in JSON format:
{{
    "document_type": "resume" | "non_resume" | "uncertain",
    "confidence": 0.0-1.0,
    "non_resume_type": "job_description" | "certificate" | "company_profile" | "contract" | "other" | null,
    "reasoning": "brief explanation"
}}"""

        system_prompt = """You are a document classifier specialized in identifying resumes/CVs.
Respond ONLY with valid JSON. Do not include any other text."""

        try:
            response = await self.llm_manager.call_openai(
                prompt=prompt,
                system_prompt=system_prompt,
                model="gpt-4o-mini",
            )

            if response.error:
                logger.error(f"[DocumentClassifier] LLM error: {response.error}")
                return ClassificationResult(
                    document_kind=DocumentKind.UNCERTAIN,
                    confidence=0.5,
                    signals=["llm_error"],
                    llm_used=True,
                )

            # JSON 파싱
            import json
            result_data = json.loads(response.content)

            # document_type 매핑
            doc_type_map = {
                "resume": DocumentKind.RESUME,
                "non_resume": DocumentKind.NON_RESUME,
                "uncertain": DocumentKind.UNCERTAIN,
            }

            # non_resume_type 매핑
            nr_type_map = {
                "job_description": NonResumeType.JOB_DESCRIPTION,
                "certificate": NonResumeType.CERTIFICATE,
                "company_profile": NonResumeType.COMPANY_PROFILE,
                "contract": NonResumeType.CONTRACT,
                "other": NonResumeType.OTHER,
            }

            document_kind = doc_type_map.get(
                result_data.get("document_type", "uncertain"),
                DocumentKind.UNCERTAIN
            )

            non_resume_type = None
            if result_data.get("non_resume_type"):
                non_resume_type = nr_type_map.get(
                    result_data["non_resume_type"],
                    NonResumeType.OTHER
                )

            return ClassificationResult(
                document_kind=document_kind,
                confidence=float(result_data.get("confidence", 0.7)),
                non_resume_type=non_resume_type,
                signals=[f"llm:{result_data.get('reasoning', 'no_reason')}"],
                llm_used=True,
            )

        except json.JSONDecodeError as e:
            logger.error(f"[DocumentClassifier] JSON parse error: {e}")
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                confidence=0.5,
                signals=["llm_json_error"],
                llm_used=True,
            )

        except Exception as e:
            logger.error(f"[DocumentClassifier] Unexpected error: {e}")
            return ClassificationResult(
                document_kind=DocumentKind.UNCERTAIN,
                confidence=0.5,
                signals=[f"llm_exception:{str(e)[:50]}"],
                llm_used=True,
            )
