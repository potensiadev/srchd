"""
LLM Manager - Multi-Provider AI Client

GPT-4o, Gemini, Claude 클라이언트 통합 관리
Structured Outputs 및 JSON 응답 지원
"""

import json
import re
import asyncio
import traceback
from typing import Dict, Any, Optional, List, Type
from enum import Enum
from dataclasses import dataclass
import logging
from datetime import datetime

from openai import AsyncOpenAI
from google import genai
from google.genai import types as genai_types
from anthropic import AsyncAnthropic

from config import get_settings

# Phase 1: 로깅 설정을 config.py의 LOG_LEVEL에서 가져옴
settings = get_settings()
logger = logging.getLogger(__name__)

# Phase 1: 하드코딩 제거 - config.py의 timeout 설정 사용
LLM_TIMEOUT_SECONDS = settings.timeout.llm  # 기본 120초
LLM_CONNECT_TIMEOUT = settings.timeout.llm_connect  # 기본 10초

# T3-1: LLM 재시도 설정
LLM_MAX_RETRIES = settings.retry.llm_max  # 기본 3회
LLM_BASE_DELAY = settings.retry.llm_base_delay  # 기본 1초
LLM_MAX_DELAY = settings.retry.llm_max_delay  # 기본 8초

# 재시도 대상 에러 패턴 (대소문자 무시)
RETRYABLE_ERROR_PATTERNS = [
    "timeout",
    "rate limit",
    "rate_limit",
    "429",
    "500",
    "502",
    "503",
    "504",
    "overloaded",
    "capacity",
    "temporarily unavailable",
    "connection",
    "network",
]


class LLMProvider(str, Enum):
    """지원하는 LLM 제공자"""
    OPENAI = "openai"
    GEMINI = "gemini"
    CLAUDE = "claude"


@dataclass
class LLMResponse:
    """LLM 응답 결과"""
    provider: LLMProvider
    content: Any  # str or dict (JSON parsed)
    raw_response: str
    model: str
    usage: Optional[Dict[str, int]] = None
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        return self.error is None


class LLMManager:
    """
    멀티 프로바이더 LLM 클라이언트 매니저

    Features:
    - OpenAI Structured Outputs 지원
    - Gemini JSON 모드
    - Claude JSON 응답
    - 자동 재시도 및 폴백
    """

    def __init__(self):
        logger.info("=" * 60)
        logger.info("[LLMManager] 초기화 시작")
        logger.info("=" * 60)

        # OpenAI 클라이언트 (타임아웃 설정 포함)
        self.openai_client: Optional[AsyncOpenAI] = None
        openai_key = settings.OPENAI_API_KEY
        if openai_key:
            try:
                from httpx import Timeout
                self.openai_client = AsyncOpenAI(
                    api_key=openai_key,
                    timeout=Timeout(LLM_TIMEOUT_SECONDS, connect=LLM_CONNECT_TIMEOUT)
                )
                logger.info(f"[LLMManager] ✅ OpenAI 클라이언트 초기화 성공 (key: {openai_key[:8]}..., timeout: {LLM_TIMEOUT_SECONDS}s)")
            except Exception as e:
                logger.error(f"[LLMManager] ❌ OpenAI 클라이언트 초기화 실패: {e}")
                logger.error(traceback.format_exc())
        else:
            logger.warning("[LLMManager] ⚠️ OPENAI_API_KEY 없음")

        # Gemini 클라이언트 (새 google-genai 패키지)
        self.gemini_client: Optional[genai.Client] = None
        gemini_key = settings.GEMINI_API_KEY
        if gemini_key:
            try:
                self.gemini_client = genai.Client(api_key=gemini_key)
                logger.info(f"[LLMManager] ✅ Gemini 클라이언트 초기화 성공 (key: {gemini_key[:8]}...)")
            except Exception as e:
                logger.error(f"[LLMManager] ❌ Gemini 클라이언트 초기화 실패: {e}")
                logger.error(traceback.format_exc())
        else:
            logger.warning("[LLMManager] ⚠️ GEMINI_API_KEY 없음")

        # Claude 클라이언트 (타임아웃 설정 포함)
        self.anthropic_client: Optional[AsyncAnthropic] = None
        anthropic_key = settings.ANTHROPIC_API_KEY
        if anthropic_key:
            try:
                from httpx import Timeout
                self.anthropic_client = AsyncAnthropic(
                    api_key=anthropic_key,
                    timeout=Timeout(LLM_TIMEOUT_SECONDS, connect=LLM_CONNECT_TIMEOUT)
                )
                logger.info(f"[LLMManager] ✅ Claude 클라이언트 초기화 성공 (key: {anthropic_key[:8]}..., timeout: {LLM_TIMEOUT_SECONDS}s)")
            except Exception as e:
                logger.error(f"[LLMManager] ❌ Claude 클라이언트 초기화 실패: {e}")
                logger.error(traceback.format_exc())
        else:
            logger.warning("[LLMManager] ⚠️ ANTHROPIC_API_KEY 없음")

        # 기본 모델 설정 - config에서 가져옴 (BUG-004 수정)
        self.models = {
            LLMProvider.OPENAI: settings.OPENAI_MODEL,
            LLMProvider.GEMINI: settings.GEMINI_MODEL,
            LLMProvider.CLAUDE: settings.ANTHROPIC_MODEL,
        }

        available = self.get_available_providers()
        logger.info(f"[LLMManager] 사용 가능한 프로바이더: {[p.value for p in available]}")
        logger.info("=" * 60)

    def _is_retryable_error(self, error_message: str) -> bool:
        """
        T3-1: 재시도 가능한 에러인지 판단

        재시도 대상:
        - Timeout 에러
        - Rate limit (429)
        - Server errors (5xx)
        - Connection/Network 에러

        재시도 불가:
        - API key 에러 (401, 403)
        - Validation 에러 (400)
        - JSON 파싱 에러
        """
        if not error_message:
            return False

        error_lower = error_message.lower()
        return any(pattern in error_lower for pattern in RETRYABLE_ERROR_PATTERNS)

    async def _call_with_retry(
        self,
        provider: LLMProvider,
        call_func,
        *args,
        **kwargs
    ) -> LLMResponse:
        """
        T3-1: Exponential backoff 재시도 래퍼

        - 최대 재시도: LLM_MAX_RETRIES (기본 3회)
        - 백오프: 1s, 2s, 4s (base_delay * 2^attempt)
        - 최대 대기: LLM_MAX_DELAY (기본 8초)

        Args:
            provider: LLM 제공자
            call_func: 실제 API 호출 함수
            *args, **kwargs: call_func에 전달할 인자

        Returns:
            LLMResponse (성공 또는 마지막 실패)
        """
        last_response: Optional[LLMResponse] = None

        for attempt in range(LLM_MAX_RETRIES + 1):  # 초기 시도 + 재시도
            response = await call_func(*args, **kwargs)

            # 성공하면 바로 반환
            if response.success:
                if attempt > 0:
                    logger.info(f"[LLMManager] ✅ {provider.value} 재시도 {attempt}회 만에 성공")
                return response

            last_response = response

            # 재시도 가능한 에러가 아니면 바로 반환
            if not self._is_retryable_error(response.error or ""):
                logger.debug(f"[LLMManager] {provider.value} 에러는 재시도 불가: {response.error}")
                return response

            # 마지막 시도였으면 반환
            if attempt >= LLM_MAX_RETRIES:
                logger.warning(
                    f"[LLMManager] ⚠️ {provider.value} 최대 재시도 횟수({LLM_MAX_RETRIES}) 초과, 실패"
                )
                return response

            # Exponential backoff 대기
            delay = min(LLM_BASE_DELAY * (2 ** attempt), LLM_MAX_DELAY)
            logger.warning(
                f"[LLMManager] ⚠️ {provider.value} 재시도 가능한 에러 감지, "
                f"{delay:.1f}초 후 재시도 ({attempt + 1}/{LLM_MAX_RETRIES}): {response.error}"
            )
            await asyncio.sleep(delay)

        # 여기까지 오면 안되지만 안전을 위해
        return last_response or LLMResponse(
            provider=provider,
            content=None,
            raw_response="",
            model="unknown",
            error="Unexpected retry loop exit"
        )

    async def call_with_structured_output(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]],
        json_schema: Dict[str, Any],
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 8192,
    ) -> LLMResponse:
        """
        Structured Output으로 JSON 응답 요청 (OpenAI 전용)

        Args:
            provider: LLM 제공자 (OPENAI만 지원)
            messages: 대화 메시지 리스트
            json_schema: OpenAI Structured Outputs 스키마
            model: 사용할 모델 (기본: gpt-4o)
            temperature: 생성 온도
            max_tokens: 최대 토큰 수

        Returns:
            LLMResponse with parsed JSON content

        T3-1: Exponential backoff 재시도 적용
        """
        logger.info(f"[LLMManager] call_with_structured_output 시작 - provider: {provider.value}")

        if provider != LLMProvider.OPENAI:
            logger.info(f"[LLMManager] {provider.value}은 structured output 미지원, call_json으로 전환")
            return await self.call_json(
                provider=provider,
                messages=messages,
                json_schema=json_schema,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        if not self.openai_client:
            logger.error("[LLMManager] ❌ OpenAI 클라이언트 없음 - API 키 미설정")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model=model or self.models[provider],
                error="OpenAI API key not configured"
            )

        # T3-1: 재시도 래퍼 적용
        return await self._call_with_retry(
            provider,
            self._call_openai_structured_output,
            messages, json_schema, model, temperature, max_tokens
        )

    async def _call_openai_structured_output(
        self,
        messages: List[Dict[str, str]],
        json_schema: Dict[str, Any],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """OpenAI Structured Output 내부 호출 (재시도 래퍼용)"""
        start_time = datetime.now()
        provider = LLMProvider.OPENAI

        try:
            model_name = model or self.models[provider]
            logger.info(f"[LLMManager] OpenAI API 호출 시작 - model: {model_name}")
            logger.debug(f"[LLMManager] 메시지 길이: {sum(len(m.get('content', '')) for m in messages)} chars")

            response = await self.openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={
                    "type": "json_schema",
                    "json_schema": json_schema
                }
            )

            elapsed = (datetime.now() - start_time).total_seconds()
            raw_content = response.choices[0].message.content or ""
            logger.info(f"[LLMManager] ✅ OpenAI API 응답 수신 - {elapsed:.2f}초, {len(raw_content)} chars")
            logger.debug(f"[LLMManager] OpenAI 응답 미리보기: {raw_content[:500]}...")

            parsed_content = json.loads(raw_content)
            logger.info(f"[LLMManager] ✅ OpenAI JSON 파싱 성공 - 필드 수: {len(parsed_content) if isinstance(parsed_content, dict) else 'N/A'}")

            return LLMResponse(
                provider=provider,
                content=parsed_content,
                raw_response=raw_content,
                model=model_name,
                usage={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                }
            )

        except json.JSONDecodeError as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[LLMManager] ❌ OpenAI JSON 파싱 실패 ({elapsed:.2f}초): {e}")
            logger.error(f"[LLMManager] 원본 응답: {raw_content[:1000] if 'raw_content' in locals() else 'N/A'}")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response=raw_content if 'raw_content' in locals() else "",
                model=model or self.models[provider],
                error=f"JSON parse error: {str(e)}"
            )
        except Exception as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[LLMManager] ❌ OpenAI API 오류 ({elapsed:.2f}초): {type(e).__name__}: {e}")
            logger.error(f"[LLMManager] 상세 오류:\n{traceback.format_exc()}")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model=model or self.models[provider],
                error=str(e)
            )

    async def call_json(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 8192,
    ) -> LLMResponse:
        """
        JSON 응답 요청 (모든 프로바이더 지원)

        스키마를 프롬프트에 포함시켜 JSON 응답 유도
        T3-1: Exponential backoff 재시도 적용
        """
        logger.info(f"[LLMManager] call_json 시작 - provider: {provider.value}")

        if provider == LLMProvider.OPENAI:
            return await self._call_with_retry(
                provider,
                self._call_openai_json,
                messages, json_schema, model, temperature, max_tokens
            )
        elif provider == LLMProvider.GEMINI:
            return await self._call_with_retry(
                provider,
                self._call_gemini_json,
                messages, json_schema, model, temperature, max_tokens
            )
        elif provider == LLMProvider.CLAUDE:
            return await self._call_with_retry(
                provider,
                self._call_claude_json,
                messages, json_schema, model, temperature, max_tokens
            )
        else:
            logger.error(f"[LLMManager] ❌ 알 수 없는 프로바이더: {provider}")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model="unknown",
                error=f"Unknown provider: {provider}"
            )

    async def _call_openai_json(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict[str, Any]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """OpenAI JSON 모드 호출"""
        if not self.openai_client:
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.OPENAI],
                error="OpenAI API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.OPENAI]

            response = await self.openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"}
            )

            raw_content = response.choices[0].message.content or ""
            parsed_content = json.loads(raw_content)

            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=parsed_content,
                raw_response=raw_content,
                model=model_name,
                usage={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                }
            )

        except Exception as e:
            logger.error(f"OpenAI JSON error: {e}")
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.OPENAI],
                error=str(e)
            )

    async def _call_gemini_json(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict[str, Any]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Gemini JSON 모드 호출 (새 google-genai 패키지)"""
        start_time = datetime.now()
        logger.info("[LLMManager] Gemini JSON 호출 시작")

        if not self.gemini_client:
            logger.error("[LLMManager] ❌ Gemini 클라이언트 없음 - API 키 미설정")
            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.GEMINI],
                error="Gemini API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.GEMINI]
            logger.info(f"[LLMManager] Gemini API 호출 - model: {model_name}")

            # OpenAI 메시지 형식을 Gemini 형식으로 변환
            prompt = self._convert_messages_to_prompt(messages)
            logger.debug(f"[LLMManager] Gemini 프롬프트 길이: {len(prompt)} chars")

            # 새 google-genai API 사용
            config = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
            )

            logger.info("[LLMManager] Gemini generate_content 호출 중...")

            # google-genai는 동기 API이므로 asyncio.to_thread 사용 (타임아웃 적용)
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.gemini_client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=config
                    ),
                    timeout=LLM_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                elapsed = (datetime.now() - start_time).total_seconds()
                logger.error(
                    f"[LLMManager] ❌ Gemini API 타임아웃 ({LLM_TIMEOUT_SECONDS}초 초과, 실제 {elapsed:.1f}초)\n"
                    f"⚠️ 주의: API 요청이 이미 전송되어 과금될 수 있습니다.\n"
                    f"   모델: {model_name}, 프롬프트 길이: {len(prompt)} chars"
                )
                return LLMResponse(
                    provider=LLMProvider.GEMINI,
                    content=None,
                    raw_response="",
                    model=model_name,
                    error=f"Gemini API timeout after {LLM_TIMEOUT_SECONDS} seconds (request may still be billed)"
                )

            elapsed = (datetime.now() - start_time).total_seconds()
            raw_content = response.text
            logger.info(f"[LLMManager] ✅ Gemini API 응답 수신 - {elapsed:.2f}초, {len(raw_content)} chars")
            logger.debug(f"[LLMManager] Gemini 응답 미리보기: {raw_content[:500]}...")

            parsed_content = json.loads(raw_content)
            logger.info(f"[LLMManager] ✅ Gemini JSON 파싱 성공 - 필드 수: {len(parsed_content) if isinstance(parsed_content, dict) else 'N/A'}")

            # usage_metadata 접근
            usage = {}
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                usage = {
                    "prompt_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                    "completion_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                    "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0),
                }
                logger.debug(f"[LLMManager] Gemini 토큰 사용: {usage}")

            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=parsed_content,
                raw_response=raw_content,
                model=model_name,
                usage=usage if usage else None
            )

        except json.JSONDecodeError as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[LLMManager] ❌ Gemini JSON 파싱 실패 ({elapsed:.2f}초): {e}")
            logger.error(f"[LLMManager] 원본 응답: {raw_content[:1000] if 'raw_content' in locals() else 'N/A'}")
            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=None,
                raw_response=raw_content if 'raw_content' in locals() else "",
                model=model or self.models[LLMProvider.GEMINI],
                error=f"JSON parse error: {str(e)}"
            )
        except Exception as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[LLMManager] ❌ Gemini API 오류 ({elapsed:.2f}초): {type(e).__name__}: {e}")
            logger.error(f"[LLMManager] 상세 오류:\n{traceback.format_exc()}")
            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.GEMINI],
                error=str(e)
            )

    async def _call_claude_json(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict[str, Any]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Claude JSON 응답 호출"""
        if not self.anthropic_client:
            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.CLAUDE],
                error="Anthropic API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.CLAUDE]

            # system 메시지 분리
            system_message = ""
            user_messages = []

            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    user_messages.append(msg)

            response = await self.anthropic_client.messages.create(
                model=model_name,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_message if system_message else None,
                messages=user_messages
            )

            raw_content = response.content[0].text if response.content else ""

            # JSON 추출 (코드 블록 포함 가능)
            parsed_content = self._extract_json(raw_content)

            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=parsed_content,
                raw_response=raw_content,
                model=model_name,
                usage={
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                }
            )

        except Exception as e:
            logger.error(f"Claude JSON error: {e}")
            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.CLAUDE],
                error=str(e)
            )

    async def call_text(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """
        일반 텍스트 응답 요청

        T3-1: Exponential backoff 재시도 적용
        """
        logger.info(f"[LLMManager] call_text 시작 - provider: {provider.value}")

        if provider == LLMProvider.OPENAI:
            return await self._call_with_retry(
                provider,
                self._call_openai_text,
                messages, model, temperature, max_tokens
            )
        elif provider == LLMProvider.GEMINI:
            return await self._call_with_retry(
                provider,
                self._call_gemini_text,
                messages, model, temperature, max_tokens
            )
        elif provider == LLMProvider.CLAUDE:
            return await self._call_with_retry(
                provider,
                self._call_claude_text,
                messages, model, temperature, max_tokens
            )
        else:
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model="unknown",
                error=f"Unknown provider: {provider}"
            )

    async def _call_openai_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """OpenAI 텍스트 응답"""
        if not self.openai_client:
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.OPENAI],
                error="OpenAI API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.OPENAI]

            response = await self.openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            content = response.choices[0].message.content or ""

            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=content,
                raw_response=content,
                model=model_name,
                usage={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                }
            )
        except Exception as e:
            return LLMResponse(
                provider=LLMProvider.OPENAI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.OPENAI],
                error=str(e)
            )

    async def _call_gemini_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Gemini 텍스트 응답 (새 google-genai 패키지)"""
        if not self.gemini_client:
            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.GEMINI],
                error="Gemini API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.GEMINI]

            # 새 google-genai API 사용
            config = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            )

            prompt = self._convert_messages_to_prompt(messages)
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.gemini_client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=config
                    ),
                    timeout=LLM_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                logger.error(
                    f"[LLMManager] ❌ Gemini Text API 타임아웃 ({LLM_TIMEOUT_SECONDS}초)\n"
                    f"⚠️ 주의: API 요청이 이미 전송되어 과금될 수 있습니다."
                )
                return LLMResponse(
                    provider=LLMProvider.GEMINI,
                    content=None,
                    raw_response="",
                    model=model_name,
                    error=f"Gemini API timeout after {LLM_TIMEOUT_SECONDS} seconds (request may still be billed)"
                )

            content = response.text

            # usage_metadata 접근
            usage = {}
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                usage = {
                    "prompt_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                    "completion_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                    "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0),
                }

            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=content,
                raw_response=content,
                model=model_name,
                usage=usage if usage else None
            )
        except Exception as e:
            return LLMResponse(
                provider=LLMProvider.GEMINI,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.GEMINI],
                error=str(e)
            )

    async def _call_claude_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str],
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Claude 텍스트 응답"""
        if not self.anthropic_client:
            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.CLAUDE],
                error="Anthropic API key not configured"
            )

        try:
            model_name = model or self.models[LLMProvider.CLAUDE]

            system_message = ""
            user_messages = []

            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    user_messages.append(msg)

            response = await self.anthropic_client.messages.create(
                model=model_name,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_message if system_message else None,
                messages=user_messages
            )

            content = response.content[0].text if response.content else ""

            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=content,
                raw_response=content,
                model=model_name,
                usage={
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                }
            )
        except Exception as e:
            return LLMResponse(
                provider=LLMProvider.CLAUDE,
                content=None,
                raw_response="",
                model=model or self.models[LLMProvider.CLAUDE],
                error=str(e)
            )

    def _convert_messages_to_prompt(self, messages: List[Dict[str, str]]) -> str:
        """OpenAI 메시지 형식을 단일 프롬프트로 변환 (Gemini용)"""
        parts = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                parts.append(f"System: {content}")
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")
        return "\n\n".join(parts)

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """텍스트에서 JSON 추출 (코드 블록 포함 처리)"""
        # 먼저 순수 JSON 파싱 시도
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 코드 블록에서 JSON 추출
        json_pattern = r'```(?:json)?\s*([\s\S]*?)\s*```'
        matches = re.findall(json_pattern, text)

        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue

        # { } 사이 내용 추출 시도
        brace_pattern = r'\{[\s\S]*\}'
        brace_matches = re.findall(brace_pattern, text)

        for match in brace_matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue

        return None

    def get_available_providers(self) -> List[LLMProvider]:
        """설정된 API 키가 있는 프로바이더 목록"""
        available = []
        if self.openai_client:
            available.append(LLMProvider.OPENAI)
        if self.gemini_client:
            available.append(LLMProvider.GEMINI)
        if self.anthropic_client:
            available.append(LLMProvider.CLAUDE)
        return available


# 싱글톤 인스턴스
_llm_manager: Optional[LLMManager] = None


def get_llm_manager() -> LLMManager:
    """LLM Manager 싱글톤 인스턴스 반환"""
    global _llm_manager
    if _llm_manager is None:
        _llm_manager = LLMManager()
    return _llm_manager
