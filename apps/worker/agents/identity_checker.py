"""
Identity Checker - Multi-Identity Detection

이력서에 여러 사람의 정보가 포함되어 있는지 확인
GPT-4o-mini로 빠르게 검증 (악용 방지)
"""

import asyncio
import logging
from typing import Optional
from dataclasses import dataclass
from enum import Enum

from services.llm_manager import get_llm_manager, LLMProvider

logger = logging.getLogger(__name__)


class IdentityCheckResult(str, Enum):
    """신원 체크 결과"""
    SINGLE = "single"          # 1명의 정보
    MULTIPLE = "multiple"      # 2명 이상의 정보
    UNCERTAIN = "uncertain"    # 판단 불가
    ERROR = "error"           # 오류 발생


@dataclass
class IdentityCheckResponse:
    """신원 체크 응답"""
    result: IdentityCheckResult
    person_count: int
    reason: str
    should_reject: bool

    @property
    def is_valid(self) -> bool:
        """처리 진행 가능 여부"""
        return self.result == IdentityCheckResult.SINGLE


IDENTITY_CHECK_PROMPT = """당신은 이력서 문서를 분석하는 전문가입니다.
주어진 텍스트가 한 사람의 이력서인지, 여러 사람의 정보가 합쳐진 문서인지 판단해주세요.

판단 기준:
1. 서로 다른 이름이 여러 개 등장하는가?
2. 경력 기간이 물리적으로 불가능하게 겹치는가? (예: 2020년에 2개 회사에서 동시 근무)
3. 학력 정보가 서로 충돌하는가? (예: 같은 시기에 다른 대학 졸업)
4. 연락처가 여러 개이고 서로 다른 사람의 것으로 보이는가?

중요: 단순히 여러 프로젝트나 경력이 있는 것은 정상입니다.
오직 "여러 사람의 이력서가 합쳐진 경우"만 탐지하세요.

응답 형식 (JSON):
{
    "person_count": 1,  // 감지된 사람 수 (1, 2, 3, ...)
    "reason": "판단 근거 설명",
    "is_single_person": true  // true면 1명, false면 여러 명
}
"""


class IdentityChecker:
    """
    Multi-Identity 감지기

    PRD 요구사항:
    - "Multi-Identity (합치기 꼼수): AI가 2명 이상의 정보 감지 시 처리 거절"
    - 크레딧 미차감
    - GPT-4o-mini 사용 (저비용)
    """

    # 사용 모델 (저비용)
    MODEL = "gpt-4o-mini"

    def __init__(self):
        self.llm_manager = get_llm_manager()

    async def check(self, resume_text: str) -> IdentityCheckResponse:
        """
        이력서 텍스트에서 Multi-Identity 감지

        Args:
            resume_text: 파싱된 이력서 텍스트

        Returns:
            IdentityCheckResponse
        """
        # 텍스트가 너무 짧으면 스킵
        if len(resume_text.strip()) < 100:
            return IdentityCheckResponse(
                result=IdentityCheckResult.SINGLE,
                person_count=1,
                reason="텍스트가 너무 짧아 검증 생략",
                should_reject=False
            )

        try:
            messages = [
                {"role": "system", "content": IDENTITY_CHECK_PROMPT},
                {"role": "user", "content": f"다음 이력서 텍스트를 분석해주세요:\n\n{resume_text[:8000]}"}
            ]

            response = await self.llm_manager.call_json(
                provider=LLMProvider.OPENAI,
                messages=messages,
                model=self.MODEL,
                temperature=0.1,
                max_tokens=500,
            )

            if not response.success or response.content is None:
                logger.warning(f"Identity check failed: {response.error}")
                # 오류 시 통과 (false positive 방지)
                return IdentityCheckResponse(
                    result=IdentityCheckResult.UNCERTAIN,
                    person_count=1,
                    reason=f"검증 오류: {response.error}",
                    should_reject=False
                )

            content = response.content
            person_count = content.get("person_count", 1)
            is_single = content.get("is_single_person", True)
            reason = content.get("reason", "")

            if not is_single or person_count > 1:
                logger.warning(f"Multi-identity detected: {person_count} persons - {reason}")
                return IdentityCheckResponse(
                    result=IdentityCheckResult.MULTIPLE,
                    person_count=person_count,
                    reason=reason,
                    should_reject=True
                )

            return IdentityCheckResponse(
                result=IdentityCheckResult.SINGLE,
                person_count=1,
                reason=reason,
                should_reject=False
            )

        except Exception as e:
            logger.error(f"Identity check error: {e}")
            # 오류 시 통과 (false positive 방지)
            return IdentityCheckResponse(
                result=IdentityCheckResult.ERROR,
                person_count=1,
                reason=str(e),
                should_reject=False
            )

    def check_sync(self, resume_text: str) -> IdentityCheckResponse:
        """동기 버전"""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(self.check(resume_text))


# 싱글톤 인스턴스
_identity_checker: Optional[IdentityChecker] = None


def get_identity_checker() -> IdentityChecker:
    """Identity Checker 싱글톤 인스턴스 반환"""
    global _identity_checker
    if _identity_checker is None:
        _identity_checker = IdentityChecker()
    return _identity_checker
