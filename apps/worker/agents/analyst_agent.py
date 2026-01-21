"""
Analyst Agent - Optimized Resume Analysis

Performance Optimized:
- 2 LLM calls only (OpenAI + Gemini) instead of 8
- Single unified schema
- Cross-check for critical fields
"""

import asyncio
import logging
import traceback
from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass, field

from config import get_settings, AnalysisMode
from schemas.resume_schema import RESUME_JSON_SCHEMA, RESUME_SCHEMA_PROMPT
from schemas.canonical_labels import CanonicalLabel
from utils.section_separator import get_section_separator, SemanticIR
from services.llm_manager import get_llm_manager, LLMProvider, LLMResponse

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class Warning:
    type: str
    field: str
    message: str
    severity: str = "medium"

    def to_dict(self) -> Dict[str, str]:
        return {
            "type": self.type,
            "field": self.field,
            "message": self.message,
            "severity": self.severity
        }


@dataclass
class AnalysisResult:
    """Analysis Result"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    confidence_score: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)
    warnings: List[Warning] = field(default_factory=list)
    processing_time_ms: int = 0
    mode: AnalysisMode = AnalysisMode.PHASE_1
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "confidence_score": round(self.confidence_score, 2),
            "field_confidence": self.field_confidence,
            "warnings": [w.to_dict() for w in self.warnings],
            "processing_time_ms": self.processing_time_ms,
            "mode": self.mode.value,
            "error": self.error
        }


class AnalystAgent:
    """
    Optimized Analyst Agent
    
    - Uses unified schema (1 call per provider)
    - Progressive LLM calling based on confidence
    - Cross-check only when needed (cost optimization)
    """

    # Critical fields for cross-check
    CRITICAL_FIELDS = ["name", "phone", "email"]
    
    # Default confidence threshold (can be overridden by settings)
    DEFAULT_CONFIDENCE_THRESHOLD = 0.85

    def __init__(self):
        self.section_separator = get_section_separator()
        self.llm_manager = get_llm_manager()
        self.mode = settings.ANALYSIS_MODE
        # Feature flag for conditional calling
        self.use_conditional_llm = settings.USE_CONDITIONAL_LLM if hasattr(settings, 'USE_CONDITIONAL_LLM') else True
        # Configurable confidence threshold
        self.confidence_threshold = (
            settings.LLM_CONFIDENCE_THRESHOLD 
            if hasattr(settings, 'LLM_CONFIDENCE_THRESHOLD') 
            else self.DEFAULT_CONFIDENCE_THRESHOLD
        )
        # Monitoring counters (for logging)
        self._single_model_count = 0
        self._multi_model_count = 0
    
    @property
    def CONFIDENCE_THRESHOLD(self):
        """Backward compatible property"""
        return self.confidence_threshold

    async def analyze(
        self,
        resume_text: str,
        mode: Optional[AnalysisMode] = None,
        filename: Optional[str] = None
    ) -> AnalysisResult:
        """
        Analyze resume with progressive LLM calling strategy.
        
        Cost Optimization:
        - Step 1: Call primary model (GPT-4o) first
        - Step 2: If confidence < 0.85 or critical fields missing → add Gemini
        - Step 3: Phase 2 + still uncertain → add Claude for deep verification
        """
        start_time = datetime.now()
        analysis_mode = mode or self.mode

        logger.info("=" * 70)
        logger.info(f"[AnalystAgent] Starting Analysis (Mode: {analysis_mode.value})")
        logger.info(f"[AnalystAgent] Text Length: {len(resume_text)} chars")
        logger.info(f"[AnalystAgent] Conditional LLM: {self.use_conditional_llm}")

        try:
            # Step 1: Preprocess with Section Separator (for context)
            ir = self.section_separator.separate(resume_text, filename)
            logger.info(f"[AnalystAgent] IR: {len(ir.blocks)} sections detected")

            # Step 2: Prepare prompt
            messages = self._create_messages(resume_text, filename)

            # ─────────────────────────────────────────────────────────────────
            # Progressive LLM Calling (Cost Optimization)
            # ─────────────────────────────────────────────────────────────────
            if self.use_conditional_llm:
                result = await self._progressive_llm_call(messages, analysis_mode)
            else:
                # Fallback to original parallel calling
                result = await self._parallel_llm_call(messages, analysis_mode)
            
            merged_data, confidence, warnings = result

            if not merged_data:
                raise Exception("All LLM providers failed to extract data")

            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.info(f"[AnalystAgent] Completed in {processing_time}ms. Confidence: {confidence:.2f}")

            return AnalysisResult(
                success=True,
                data=merged_data,
                confidence_score=confidence,
                warnings=warnings,
                processing_time_ms=processing_time,
                mode=analysis_mode
            )

        except Exception as e:
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.error(f"[AnalystAgent] Fatal Error: {e}")
            logger.error(traceback.format_exc())
            return AnalysisResult(
                success=False,
                error=str(e),
                processing_time_ms=processing_time,
                mode=analysis_mode
            )

    async def _progressive_llm_call(
        self,
        messages: List[Dict[str, str]],
        analysis_mode: AnalysisMode
    ) -> tuple[Dict[str, Any], float, List[Warning]]:
        """
        Progressive LLM calling for cost optimization.
        
        Step 1: GPT-4o alone
        Step 2: + Gemini if needed
        Step 3: + Claude for Phase 2 deep verification
        """
        warnings = []
        
        # ─────────────────────────────────────────────────────────────────
        # Step 1: Primary model (GPT-4o)
        # ─────────────────────────────────────────────────────────────────
        logger.info("[AnalystAgent] Step 1: Calling primary model (GPT-4o)")
        primary_response = await self._call_single_llm(LLMProvider.OPENAI, messages)
        
        if not primary_response.success:
            # Fallback: try Gemini as primary
            logger.warning("[AnalystAgent] GPT-4o failed, trying Gemini as fallback")
            primary_response = await self._call_single_llm(LLMProvider.GEMINI, messages)
            
            if not primary_response.success:
                return {}, 0.0, [Warning("critical", "all", "All primary models failed")]
        
        # Evaluate first response
        confidence, missing_fields = self._evaluate_first_response(primary_response)
        logger.info(
            f"[AnalystAgent] Primary result - Confidence: {confidence:.2f}, "
            f"Missing fields: {missing_fields}"
        )
        
        # Check if single model is sufficient
        if confidence >= self.confidence_threshold and not missing_fields:
            logger.info("[AnalystAgent] ✓ Single model sufficient - skipping cross-check")
            self._single_model_count += 1
            self._log_call_ratio()
            warnings.append(Warning(
                "optimization", "llm_calls", 
                "Single model result accepted (high confidence)",
                "info"
            ))
            return primary_response.content, confidence, warnings
        
        # ─────────────────────────────────────────────────────────────────
        # Step 2: Secondary model (Gemini) for cross-check
        # ─────────────────────────────────────────────────────────────────
        logger.info("[AnalystAgent] Step 2: Calling secondary model (Gemini) for cross-check")
        secondary_response = await self._call_single_llm(LLMProvider.GEMINI, messages)
        
        responses = {LLMProvider.OPENAI: primary_response}
        if secondary_response.success:
            responses[LLMProvider.GEMINI] = secondary_response
        
        merged_data, merged_confidence, merge_warnings = self._merge_responses(responses)
        warnings.extend(merge_warnings)
        
        # Check if 2-way is sufficient
        if merged_confidence >= self.confidence_threshold:
            logger.info("[AnalystAgent] ✓ 2-way cross-check sufficient")
            self._multi_model_count += 1
            self._log_call_ratio()
            return merged_data, merged_confidence, warnings
        
        # ─────────────────────────────────────────────────────────────────
        # Step 3: Phase 2 only - Claude deep verification
        # ─────────────────────────────────────────────────────────────────
        if analysis_mode == AnalysisMode.PHASE_2:
            logger.info("[AnalystAgent] Step 3: Calling Claude for deep verification (Phase 2)")
            claude_response = await self._call_single_llm(LLMProvider.CLAUDE, messages)
            
            if claude_response.success:
                responses[LLMProvider.CLAUDE] = claude_response
                merged_data, merged_confidence, merge_warnings = self._merge_responses(responses)
                warnings = [w for w in warnings if w.type != "mismatch"]  # Re-evaluate mismatches
                warnings.extend(merge_warnings)
        
        self._multi_model_count += 1
        self._log_call_ratio()
        return merged_data, merged_confidence, warnings
    
    def _log_call_ratio(self):
        """
        LLM 호출 비율 로깅 (모니터링용)
        """
        total = self._single_model_count + self._multi_model_count
        if total > 0 and total % 10 == 0:  # 10건마다 로깅
            single_pct = (self._single_model_count / total) * 100
            logger.info(
                f"[AnalystAgent] LLM Call Ratio: "
                f"single={self._single_model_count} ({single_pct:.1f}%), "
                f"multi={self._multi_model_count} ({100-single_pct:.1f}%), "
                f"total={total}"
            )

    async def _parallel_llm_call(
        self,
        messages: List[Dict[str, str]],
        analysis_mode: AnalysisMode
    ) -> tuple[Dict[str, Any], float, List[Warning]]:
        """
        Original parallel LLM calling (for fallback/comparison).
        """
        providers = self._get_providers(analysis_mode)
        logger.info(f"[AnalystAgent] Parallel calling {len(providers)} providers")
        
        responses = await self._call_llms_parallel(providers, messages)
        return self._merge_responses(responses)

    async def _call_single_llm(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]]
    ) -> LLMResponse:
        """
        Call a single LLM provider.
        """
        try:
            return await self.llm_manager.call_with_structured_output(
                provider=provider,
                messages=messages,
                json_schema=RESUME_JSON_SCHEMA,
                temperature=0.1
            )
        except Exception as e:
            logger.error(f"[AnalystAgent] {provider.value} failed: {e}")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model="unknown",
                error=str(e)
            )

    def _evaluate_first_response(
        self,
        response: LLMResponse
    ) -> tuple[float, List[str]]:
        """
        Evaluate first LLM response quality.
        
        Enhanced validation:
        - Checks if critical fields exist AND are valid
        - Validates email format
        - Validates phone format
        - Penalizes suspicious values (placeholders, too short)
        
        Returns:
            confidence: 0.0-1.0 confidence score
            missing_fields: List of missing or invalid critical fields
        """
        if not response.success or not response.content:
            return 0.0, self.CRITICAL_FIELDS.copy()
        
        data = response.content
        missing = []
        score = 0.0
        
        # Check and validate critical fields
        for field in self.CRITICAL_FIELDS:
            value = data.get(field)
            if value and str(value).strip():
                # Validate field value
                is_valid, field_score = self._validate_field_value(field, str(value).strip())
                if is_valid:
                    score += field_score
                else:
                    missing.append(field)
                    logger.debug(f"[AnalystAgent] Invalid {field}: {value}")
            else:
                missing.append(field)
        
        # Base confidence from critical fields
        confidence = score / len(self.CRITICAL_FIELDS)
        
        # Bonus for additional quality indicators
        if data.get("careers") and len(data.get("careers", [])) > 0:
            confidence += 0.05
        if data.get("skills") and len(data.get("skills", [])) > 0:
            confidence += 0.05
        if data.get("education") and len(data.get("education", [])) > 0:
            confidence += 0.05
        
        return min(confidence, 1.0), missing

    def _validate_field_value(self, field: str, value: str) -> tuple[bool, float]:
        """
        Validate field value and return (is_valid, score).
        
        Score meanings:
        - 1.0: Valid and high quality
        - 0.7: Valid but uncertain
        - 0.0: Invalid
        """
        import re
        
        if field == "email":
            # Email validation: simple regex
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if re.match(email_pattern, value):
                return True, 1.0
            # Partial email (e.g., missing @)
            if "@" in value:
                return True, 0.7
            return False, 0.0
        
        elif field == "phone":
            # Phone validation: should contain digits
            digits = re.sub(r'\D', '', value)
            if len(digits) >= 9:  # 최소 9자리 (010-xxx-xxxx or 02-xxx-xxxx)
                return True, 1.0
            if len(digits) >= 7:
                return True, 0.7
            return False, 0.0
        
        elif field == "name":
            # Name validation: should be reasonable length
            # 의심스러운 값 패턴
            suspicious_patterns = [
                "unknown", "n/a", "none", "null", "미상", "비공개",
                "수신인", "recipient", "test", "sample"
            ]
            value_lower = value.lower()
            
            # 의심스러운 값 체크
            if any(p in value_lower for p in suspicious_patterns):
                return False, 0.0
            
            # 너무 짧은 이름 (1글자)
            if len(value.strip()) <= 1:
                return False, 0.0
            
            # 너무 긴 이름 (20글자 이상)
            if len(value.strip()) > 20:
                return True, 0.7
            
            return True, 1.0
        
        # Default: if value exists, it's valid
        return True, 1.0

    def _create_messages(self, text: str, filename: Optional[str]) -> List[Dict[str, str]]:
        """Create optimized prompt"""
        system_prompt = f"""You are an expert Resume Parser. Extract ALL information from the resume.

{RESUME_SCHEMA_PROMPT}

Return a single JSON object with all extracted fields. If a field is not found, omit it.
"""
        user_prompt = f"""Extract all information from this resume:

Filename: {filename or 'Unknown'}

---
{text}
---

Return valid JSON only."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

    def _get_providers(self, mode: AnalysisMode) -> List[LLMProvider]:
        """Get providers for analysis based on mode
        
        Phase 1: OpenAI + Gemini (2-Way Cross-Check)
        Phase 2: OpenAI + Gemini + Claude (3-Way Cross-Check) - Pro plan only
        """
        available = self.llm_manager.get_available_providers()
        
        if mode == AnalysisMode.PHASE_1:
            # 2-Way Cross-Check: GPT-4o + Gemini
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI]
        else:
            # 3-Way Cross-Check: GPT-4o + Gemini + Claude (Pro plan)
            required = [LLMProvider.OPENAI, LLMProvider.GEMINI, LLMProvider.CLAUDE]
        
        providers = [p for p in required if p in available]
        
        if not providers:
            # Fallback to any available
            if available:
                return available[:1]
            raise ValueError("No LLM providers available")
        
        return providers


    async def _call_llms_parallel(
        self,
        providers: List[LLMProvider],
        messages: List[Dict[str, str]]
    ) -> Dict[LLMProvider, LLMResponse]:
        """Call LLMs in parallel"""
        
        async def call_single(provider: LLMProvider) -> LLMResponse:
            try:
                # Use unified schema
                return await self.llm_manager.call_with_structured_output(
                    provider=provider,
                    messages=messages,
                    json_schema=RESUME_JSON_SCHEMA,
                    temperature=0.1
                )
            except Exception as e:
                logger.error(f"[AnalystAgent] {provider.value} failed: {e}")
                return LLMResponse(
                    provider=provider,
                    content=None,
                    raw_response="",
                    model="unknown",
                    error=str(e)
                )

        tasks = [call_single(p) for p in providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        responses = {}
        for i, res in enumerate(results):
            if isinstance(res, LLMResponse):
                responses[providers[i]] = res
                if res.success:
                    logger.info(f"[AnalystAgent] {providers[i].value}: Success")
                else:
                    logger.warning(f"[AnalystAgent] {providers[i].value}: Failed - {res.error}")

        return responses

    def _merge_responses(
        self,
        responses: Dict[LLMProvider, LLMResponse]
    ) -> tuple[Dict[str, Any], float, List[Warning]]:
        """
        Merge responses with cross-check on critical fields.

        2-Way (Phase 1): OpenAI + Gemini 교차 검증
        3-Way (Phase 2): OpenAI + Gemini + Claude 다수결 검증 (Pro plan)
        """
        warnings_precheck = []

        # 타임아웃 에러 감지 및 경고 추가
        for provider, response in responses.items():
            if response.error and "timeout" in response.error.lower():
                warnings_precheck.append(Warning(
                    type="timeout",
                    field=provider.value,
                    message=f"{provider.value} API 타임아웃 - 과금이 발생했을 수 있습니다",
                    severity="high"
                ))
                logger.warning(
                    f"[AnalystAgent] {provider.value} 타임아웃 감지 - "
                    f"요청이 전송된 후 타임아웃되어 과금될 수 있음"
                )
            elif response.error:
                warnings_precheck.append(Warning(
                    type="llm_error",
                    field=provider.value,
                    message=f"{provider.value} API 에러: {response.error[:100]}",
                    severity="medium"
                ))

        valid_responses = [r for r in responses.values() if r.success and r.content]

        if not valid_responses:
            return {}, 0.0, warnings_precheck + [Warning("critical", "all", "All LLM providers failed")]

        # If only one response, use it
        if len(valid_responses) == 1:
            return valid_responses[0].content, 0.7, warnings_precheck + [Warning("info", "cross_check", "Only one provider available")]

        # Get all provider responses
        openai_data = responses.get(LLMProvider.OPENAI)
        gemini_data = responses.get(LLMProvider.GEMINI)
        claude_data = responses.get(LLMProvider.CLAUDE)

        # Use OpenAI as base (usually more structured)
        if openai_data and openai_data.success:
            base_data = openai_data.content.copy()
        elif gemini_data and gemini_data.success:
            base_data = gemini_data.content.copy()
        elif claude_data and claude_data.success:
            base_data = claude_data.content.copy()
        else:
            return {}, 0.0, [Warning("critical", "all", "No valid responses")]

        warnings = []
        confidence_sum = 0
        field_count = 0

        # Determine if 3-way mode (Claude available)
        is_3way = claude_data and claude_data.success

        if is_3way:
            logger.info("[AnalystAgent] 3-Way Cross-Check 모드 (GPT + Gemini + Claude)")
        else:
            logger.info("[AnalystAgent] 2-Way Cross-Check 모드 (GPT + Gemini)")

        # Cross-check critical fields
        for field in self.CRITICAL_FIELDS:
            openai_val = openai_data.content.get(field) if openai_data and openai_data.success else None
            gemini_val = gemini_data.content.get(field) if gemini_data and gemini_data.success else None
            claude_val = claude_data.content.get(field) if claude_data and claude_data.success else None

            values = []
            if openai_val:
                values.append(("openai", str(openai_val).lower().strip()))
            if gemini_val:
                values.append(("gemini", str(gemini_val).lower().strip()))
            if claude_val:
                values.append(("claude", str(claude_val).lower().strip()))

            if len(values) >= 2:
                # 3-Way: 다수결 (2/3 이상 일치 시 높은 신뢰도)
                if is_3way and len(values) == 3:
                    unique_vals = set(v[1] for v in values)
                    if len(unique_vals) == 1:
                        # 3개 모두 일치 → 최고 신뢰도
                        confidence_sum += 1.0
                    elif len(unique_vals) == 2:
                        # 2개 일치, 1개 불일치 → 다수결 채택
                        val_counts = {}
                        for provider, val in values:
                            val_counts[val] = val_counts.get(val, []) + [provider]

                        majority_val = max(val_counts.keys(), key=lambda v: len(val_counts[v]))
                        minority_providers = [p for v, providers in val_counts.items() if v != majority_val for p in providers]

                        confidence_sum += 0.85
                        base_data[field] = next(
                            (openai_val if openai_val and str(openai_val).lower().strip() == majority_val
                             else gemini_val if gemini_val and str(gemini_val).lower().strip() == majority_val
                             else claude_val),
                            base_data.get(field)
                        )
                        warnings.append(Warning(
                            "mismatch_resolved", field,
                            f"다수결 적용: {minority_providers} 불일치",
                            "low"
                        ))
                    else:
                        # 3개 모두 다름 → 낮은 신뢰도
                        confidence_sum += 0.4
                        warnings.append(Warning(
                            "mismatch", field,
                            f"3-Way 불일치: openai='{openai_val}', gemini='{gemini_val}', claude='{claude_val}'",
                            "high"
                        ))
                # 2-Way: 기존 로직
                else:
                    val1, val2 = values[0][1], values[1][1]
                    if val1 == val2:
                        confidence_sum += 1.0
                    else:
                        confidence_sum += 0.5
                        warnings.append(Warning(
                            "mismatch", field,
                            f"Values differ: '{values[0][1]}' vs '{values[1][1]}'",
                            "medium"
                        ))
                field_count += 1
            elif len(values) == 1:
                confidence_sum += 0.7
                field_count += 1

        # For non-critical fields, merge from all providers
        for provider_data in [gemini_data, claude_data]:
            if provider_data and provider_data.success:
                for key, value in provider_data.content.items():
                    if key not in base_data or base_data[key] is None:
                        base_data[key] = value

        avg_confidence = confidence_sum / max(1, field_count) if field_count > 0 else 0.8

        return base_data, avg_confidence, warnings_precheck + warnings


# Singleton
_analyst_agent: Optional[AnalystAgent] = None


def get_analyst_agent() -> AnalystAgent:
    """Analyst Agent 싱글톤 인스턴스 반환"""
    global _analyst_agent
    if _analyst_agent is None:
        _analyst_agent = AnalystAgent()
    return _analyst_agent
