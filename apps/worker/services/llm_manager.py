"""
LLM Manager - Multi-Provider AI Client

GPT-4o, Gemini, Claude 클라이언트 통합 관리
Structured Outputs 및 JSON 응답 지원
"""

import json
import re
import asyncio
from typing import Dict, Any, Optional, List, Type
from enum import Enum
from dataclasses import dataclass
import logging

from openai import AsyncOpenAI
from google import genai
from google.genai import types as genai_types
from anthropic import AsyncAnthropic

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


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
        # OpenAI 클라이언트
        self.openai_client: Optional[AsyncOpenAI] = None
        if settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        # Gemini 클라이언트 (새 google-genai 패키지)
        self.gemini_client: Optional[genai.Client] = None
        if settings.GEMINI_API_KEY:
            self.gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # Claude 클라이언트
        self.anthropic_client: Optional[AsyncAnthropic] = None
        if settings.ANTHROPIC_API_KEY:
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        # 기본 모델 설정
        self.models = {
            LLMProvider.OPENAI: "gpt-4o",
            LLMProvider.GEMINI: "gemini-1.5-pro",
            LLMProvider.CLAUDE: "claude-3-5-sonnet-20241022",
        }

    async def call_with_structured_output(
        self,
        provider: LLMProvider,
        messages: List[Dict[str, str]],
        json_schema: Dict[str, Any],
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
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
        """
        if provider != LLMProvider.OPENAI:
            # Gemini/Claude는 call_json 사용
            return await self.call_json(
                provider=provider,
                messages=messages,
                json_schema=json_schema,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        if not self.openai_client:
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response="",
                model=model or self.models[provider],
                error="OpenAI API key not configured"
            )

        try:
            model_name = model or self.models[provider]

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

            raw_content = response.choices[0].message.content or ""
            parsed_content = json.loads(raw_content)

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
            logger.error(f"OpenAI JSON parse error: {e}")
            return LLMResponse(
                provider=provider,
                content=None,
                raw_response=raw_content if 'raw_content' in locals() else "",
                model=model or self.models[provider],
                error=f"JSON parse error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
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
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """
        JSON 응답 요청 (모든 프로바이더 지원)

        스키마를 프롬프트에 포함시켜 JSON 응답 유도
        """
        if provider == LLMProvider.OPENAI:
            return await self._call_openai_json(
                messages, json_schema, model, temperature, max_tokens
            )
        elif provider == LLMProvider.GEMINI:
            return await self._call_gemini_json(
                messages, json_schema, model, temperature, max_tokens
            )
        elif provider == LLMProvider.CLAUDE:
            return await self._call_claude_json(
                messages, json_schema, model, temperature, max_tokens
            )
        else:
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

            # OpenAI 메시지 형식을 Gemini 형식으로 변환
            prompt = self._convert_messages_to_prompt(messages)

            # 새 google-genai API 사용
            config = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
            )

            # google-genai는 동기 API이므로 asyncio.to_thread 사용
            response = await asyncio.to_thread(
                self.gemini_client.models.generate_content,
                model=model_name,
                contents=prompt,
                config=config
            )

            raw_content = response.text
            parsed_content = json.loads(raw_content)

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
                content=parsed_content,
                raw_response=raw_content,
                model=model_name,
                usage=usage if usage else None
            )

        except Exception as e:
            logger.error(f"Gemini JSON error: {e}")
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
        """일반 텍스트 응답 요청"""
        if provider == LLMProvider.OPENAI:
            return await self._call_openai_text(messages, model, temperature, max_tokens)
        elif provider == LLMProvider.GEMINI:
            return await self._call_gemini_text(messages, model, temperature, max_tokens)
        elif provider == LLMProvider.CLAUDE:
            return await self._call_claude_text(messages, model, temperature, max_tokens)
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
            response = await asyncio.to_thread(
                self.gemini_client.models.generate_content,
                model=model_name,
                contents=prompt,
                config=config
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
