"""
Embedding Service - 청킹 + Vector Embedding

이력서 데이터를 의미 단위로 청킹하고 임베딩 생성
OpenAI text-embedding-3-small 사용

PRD v0.1 이슈 해결:
- P0: tiktoken 도입하여 토큰 추정 정확화
- P0: truncation 발생 시 로그 경고
- P1: 지수 백오프 재시도 로직
- P1: 한글 텍스트 최적화 (50% 감지, CHUNK_SIZE=2000, OVERLAP=500)
- P1: 청킹 파라미터 config.py에서 관리
"""

import asyncio
import logging
import traceback
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import random

from openai import AsyncOpenAI

from config import get_settings, chunking_config

# tiktoken import (토큰 수 정확한 계산)
try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False

# 로깅 설정 - 환경변수 기반 (PRD: Epic 2)
settings = get_settings()
_log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(level=_log_level)
logger = logging.getLogger(__name__)


class ChunkType(str, Enum):
    """청크 유형"""
    SUMMARY = "summary"       # 전체 요약
    CAREER = "career"         # 개별 경력
    PROJECT = "project"       # 개별 프로젝트
    SKILL = "skill"           # 기술 스택
    EDUCATION = "education"   # 학력
    RAW_FULL = "raw_full"     # 원본 텍스트 전체 (PRD v0.1)
    RAW_SECTION = "raw_section"  # 원본 텍스트 섹션 (PRD v0.1)


@dataclass
class Chunk:
    """청크 데이터"""
    chunk_type: ChunkType
    chunk_index: int          # 같은 타입 내 순서
    content: str              # 청크 내용
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_type": self.chunk_type.value,
            "chunk_index": self.chunk_index,
            "content": self.content,
            "metadata": self.metadata,
            "has_embedding": self.embedding is not None
        }


@dataclass
class EmbeddingResult:
    """임베딩 결과"""
    success: bool
    chunks: List[Chunk] = field(default_factory=list)
    total_tokens: int = 0
    error: Optional[str] = None
    # 부분 성공 정보
    total_chunks: int = 0
    embedded_chunks: int = 0
    failed_chunks: int = 0
    warnings: List[str] = field(default_factory=list)

    @property
    def is_partial_success(self) -> bool:
        """부분 성공 여부 (일부 청크만 임베딩 성공)"""
        return self.success and self.failed_chunks > 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "chunk_count": len(self.chunks),
            "chunks": [c.to_dict() for c in self.chunks],
            "total_tokens": self.total_tokens,
            "error": self.error,
            "total_chunks": self.total_chunks,
            "embedded_chunks": self.embedded_chunks,
            "failed_chunks": self.failed_chunks,
            "is_partial_success": self.is_partial_success,
            "warnings": self.warnings,
        }


class EmbeddingService:
    """
    임베딩 서비스

    청킹 전략:
    1. Summary: 전체 요약 + 핵심 정보 (1개)
    2. Career: 각 경력별 개별 청크 (N개)
    3. Project: 각 프로젝트별 개별 청크 (N개)
    4. Skill: 기술 스택 그룹핑 (1개)
    5. Education: 학력 정보 (1개)

    → 검색 시 청크 타입별 가중치 적용 가능
    """

    # 임베딩 모델
    EMBEDDING_MODEL = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS = 1536

    # 청크 최대 길이 (config에서 가져옴)
    MAX_CHUNK_CHARS = chunking_config.MAX_STRUCTURED_CHUNK_CHARS

    def __init__(self):
        logger.info("=" * 60)
        logger.info("[EmbeddingService] 초기화 시작")
        self.client = None
        self._encoding = None  # tiktoken 인코더 (lazy init)
        openai_key = settings.OPENAI_API_KEY
        if openai_key:
            try:
                self.client = AsyncOpenAI(api_key=openai_key)
                logger.info(f"[EmbeddingService] ✅ OpenAI 클라이언트 초기화 성공 (key: {openai_key[:8]}...)")
            except Exception as e:
                logger.error(f"[EmbeddingService] ❌ OpenAI 클라이언트 초기화 실패: {e}")
                logger.error(traceback.format_exc())
        else:
            logger.warning("[EmbeddingService] ⚠️ OPENAI_API_KEY 없음 - 임베딩 비활성화")

        # tiktoken 인코더 초기화
        if TIKTOKEN_AVAILABLE:
            try:
                self._encoding = tiktoken.encoding_for_model(self.EMBEDDING_MODEL)
                logger.info("[EmbeddingService] ✅ tiktoken 인코더 초기화 성공")
            except Exception as e:
                logger.warning(f"[EmbeddingService] ⚠️ tiktoken 인코더 초기화 실패: {e}")
                self._encoding = None
        else:
            logger.warning("[EmbeddingService] ⚠️ tiktoken 미설치 - 토큰 수 추정 모드 사용")

        logger.info("=" * 60)

    def _count_tokens(self, text: str) -> int:
        """
        텍스트의 토큰 수 계산 (P0 이슈 해결)

        tiktoken 사용 시 정확한 토큰 수 계산,
        없으면 한글/영문 혼합 추정 사용
        """
        if self._encoding:
            return len(self._encoding.encode(text))

        # tiktoken 없을 때: 한글/영문 혼합 추정
        korean_chars = sum(1 for c in text if '\uac00' <= c <= '\ud7a3')
        other_chars = len(text) - korean_chars

        # 한글: 1자 ≈ 2-3토큰, 영문/기타: 4자 ≈ 1토큰
        korean_tokens = korean_chars * 2.5
        other_tokens = other_chars / 4

        return int(korean_tokens + other_tokens)

    def _count_tokens_batch(self, texts: List[str]) -> int:
        """배치 텍스트의 총 토큰 수 계산"""
        return sum(self._count_tokens(t) for t in texts)

    def _is_korean_dominant(self, text: str) -> bool:
        """
        텍스트가 한글 우세인지 확인 (P1 이슈: 한글 최적화)

        Args:
            text: 검사할 텍스트

        Returns:
            한글 비율이 KOREAN_THRESHOLD (50%) 이상이면 True
        """
        if not text:
            return False

        korean_chars = sum(1 for c in text if '\uac00' <= c <= '\ud7a3')
        total_chars = len(text.replace(' ', '').replace('\n', ''))

        if total_chars == 0:
            return False

        korean_ratio = korean_chars / total_chars
        return korean_ratio >= chunking_config.KOREAN_THRESHOLD

    async def _retry_with_exponential_backoff(
        self,
        func,
        *args,
        max_retries: int = None,
        **kwargs
    ):
        """
        지수 백오프를 적용한 재시도 (P1 이슈 해결)

        Args:
            func: 실행할 비동기 함수
            max_retries: 최대 재시도 횟수 (기본: config에서)

        Returns:
            함수 실행 결과 또는 None
        """
        if max_retries is None:
            max_retries = chunking_config.MAX_EMBEDDING_RETRIES

        last_error = None

        for attempt in range(max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e

                if attempt < max_retries:
                    # 지수 백오프 + 지터
                    wait_time = min(
                        chunking_config.RETRY_BASE_WAIT_SECONDS * (2 ** attempt) + random.uniform(0, 1),
                        chunking_config.RETRY_MAX_WAIT_SECONDS
                    )
                    logger.warning(
                        f"[EmbeddingService] 재시도 {attempt + 1}/{max_retries} "
                        f"({wait_time:.2f}초 대기): {type(e).__name__}: {e}"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"[EmbeddingService] 최대 재시도 횟수 초과: {type(e).__name__}: {e}")

        return None

    async def create_embedding(self, text: str) -> Optional[List[float]]:
        """단일 텍스트 임베딩 생성"""
        if not self.client:
            logger.error("[EmbeddingService] ❌ OpenAI 클라이언트 미초기화 - 임베딩 불가")
            return None

        start_time = datetime.now()
        logger.info(f"[EmbeddingService] 단일 임베딩 생성 시작 - 텍스트 길이: {len(text)} chars")

        async def _create():
            response = await self.client.embeddings.create(
                model=self.EMBEDDING_MODEL,
                input=text[:8000]  # 토큰 제한
            )
            return response.data[0].embedding

        result = await self._retry_with_exponential_backoff(_create)

        elapsed = (datetime.now() - start_time).total_seconds()
        if result:
            logger.info(f"[EmbeddingService] ✅ 임베딩 생성 완료 ({elapsed:.2f}초) - 차원: {len(result)}")
        else:
            logger.error(f"[EmbeddingService] ❌ 임베딩 생성 실패 ({elapsed:.2f}초)")

        return result

    async def create_embeddings_batch(
        self,
        texts: List[str]
    ) -> List[Optional[List[float]]]:
        """배치 임베딩 생성"""
        if not self.client:
            logger.error("[EmbeddingService] ❌ OpenAI 클라이언트 미초기화 - 배치 임베딩 불가")
            return [None] * len(texts)

        start_time = datetime.now()
        logger.info(f"[EmbeddingService] 배치 임베딩 생성 시작 - {len(texts)}개 텍스트")
        for i, t in enumerate(texts):
            logger.debug(f"[EmbeddingService]   텍스트 {i+1}: {len(t)} chars - {t[:100]}...")

        try:
            # 텍스트 길이 제한
            truncated = [t[:8000] for t in texts]

            logger.info(f"[EmbeddingService] OpenAI embeddings.create 호출 중...")

            async def _create_batch():
                return await self.client.embeddings.create(
                    model=self.EMBEDDING_MODEL,
                    input=truncated
                )

            response = await self._retry_with_exponential_backoff(_create_batch)

            if not response:
                logger.error("[EmbeddingService] ❌ 배치 임베딩 생성 실패 (모든 재시도 실패)")
                return [None] * len(texts)

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"[EmbeddingService] ✅ 배치 임베딩 생성 완료 ({elapsed:.2f}초)")

            # 인덱스 순서대로 정렬
            embeddings = [None] * len(texts)
            for item in response.data:
                embeddings[item.index] = item.embedding
                logger.debug(f"[EmbeddingService]   임베딩 {item.index+1}: 차원 {len(item.embedding)}")

            success_count = sum(1 for e in embeddings if e is not None)
            logger.info(f"[EmbeddingService] ✅ 배치 결과: {success_count}/{len(texts)} 성공")

            return embeddings

        except Exception as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[EmbeddingService] ❌ 배치 임베딩 실패 ({elapsed:.2f}초): {type(e).__name__}: {e}")
            logger.error(f"[EmbeddingService] 상세 오류:\n{traceback.format_exc()}")
            return [None] * len(texts)

    async def process_candidate(
        self,
        data: Dict[str, Any],
        generate_embeddings: bool = True,
        raw_text: str = None
    ) -> EmbeddingResult:
        """
        후보자 데이터를 청킹하고 임베딩 생성

        Args:
            data: 분석된 이력서 데이터 (구조화)
            generate_embeddings: 임베딩 생성 여부
            raw_text: 원본 이력서 텍스트 (PRD v0.1: 전체 텍스트 검색용)

        Returns:
            EmbeddingResult with chunks and embeddings
        """
        start_time = datetime.now()
        logger.info("=" * 60)
        logger.info("[EmbeddingService] 후보자 데이터 처리 시작")
        logger.info(f"[EmbeddingService] 임베딩 생성: {'예' if generate_embeddings else '아니오'}")
        logger.info(f"[EmbeddingService] 입력 데이터 필드: {list(data.keys()) if data else 'None'}")
        logger.info("=" * 60)

        try:
            # 1. 청크 생성 (구조화 데이터 + 원본 텍스트)
            logger.info("[EmbeddingService] Step 1: 청크 생성")
            chunks = self._create_chunks(data, raw_text)

            if not chunks:
                logger.warning("[EmbeddingService] ⚠️ 청크가 생성되지 않음 - 데이터가 비어있을 수 있음")
                # 빈 데이터에서도 최소 청크 생성 시도
                fallback_content = f"이력서 데이터 (원본 필드: {list(data.keys()) if data else 'None'})"
                chunks = [Chunk(
                    chunk_type=ChunkType.SUMMARY,
                    chunk_index=0,
                    content=fallback_content,
                    metadata={"fallback": True}
                )]
                logger.info("[EmbeddingService] 폴백 청크 생성됨")

            logger.info(f"[EmbeddingService] ✅ 청크 생성 완료: {len(chunks)}개")
            for i, chunk in enumerate(chunks):
                logger.debug(f"[EmbeddingService]   청크 {i+1}: {chunk.chunk_type.value} - {len(chunk.content)} chars")

            # 2. 임베딩 생성 (옵션)
            total_tokens = 0
            embedded_count = 0
            failed_count = 0
            warnings = []

            if generate_embeddings:
                if not self.client:
                    logger.warning("[EmbeddingService] ⚠️ OpenAI 클라이언트 없음 - 임베딩 스킵")
                    warnings.append("OpenAI 클라이언트 미초기화 - 임베딩 생성 불가")
                else:
                    logger.info("[EmbeddingService] Step 2: 배치 임베딩 생성")
                    texts = [c.content for c in chunks]
                    embeddings = await self.create_embeddings_batch(texts)

                    # 배치 결과 확인
                    failed_indices = []
                    for i, embedding in enumerate(embeddings):
                        chunks[i].embedding = embedding
                        if embedding is not None:
                            embedded_count += 1
                        else:
                            failed_indices.append(i)

                    # 실패한 청크에 대해 개별 재시도 (지수 백오프 적용)
                    if failed_indices:
                        logger.info(f"[EmbeddingService] Step 2-1: 실패한 {len(failed_indices)}개 청크 개별 재시도")
                        for idx in failed_indices:
                            retry_embedding = await self.create_embedding(chunks[idx].content)
                            if retry_embedding:
                                chunks[idx].embedding = retry_embedding
                                embedded_count += 1
                                logger.info(f"[EmbeddingService] ✅ 청크 {idx} 재시도 성공")
                            else:
                                failed_count += 1
                                logger.warning(f"[EmbeddingService] ❌ 청크 {idx} 재시도 실패")

                    logger.info(f"[EmbeddingService] ✅ 임베딩 생성 완료: {embedded_count}/{len(chunks)} 성공")

                    # 부분 실패 경고 추가
                    if failed_count > 0:
                        warning_msg = f"{failed_count}개 청크 임베딩 실패 - 해당 청크는 검색에서 제외됩니다"
                        warnings.append(warning_msg)
                        logger.warning(f"[EmbeddingService] ⚠️ {warning_msg}")

                    # 토큰 수 계산 (P0 이슈 해결: tiktoken 사용)
                    total_tokens = self._count_tokens_batch(texts)
                    logger.info(f"[EmbeddingService] 토큰 사용량: {total_tokens} (tiktoken: {TIKTOKEN_AVAILABLE})")

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"[EmbeddingService] ✅ 처리 완료 ({elapsed:.2f}초)")
            logger.info("=" * 60)

            # P2 이슈: 부분 성공 시에도 success=True이지만 명확한 상태 제공
            return EmbeddingResult(
                success=True,
                chunks=chunks,
                total_tokens=total_tokens,
                total_chunks=len(chunks),
                embedded_chunks=embedded_count,
                failed_chunks=failed_count,
                warnings=warnings,
            )

        except Exception as e:
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.error(f"[EmbeddingService] ❌ 처리 실패 ({elapsed:.2f}초): {type(e).__name__}: {e}")
            logger.error(f"[EmbeddingService] 상세 오류:\n{traceback.format_exc()}")
            logger.info("=" * 60)
            return EmbeddingResult(
                success=False,
                error=str(e)
            )

    def _create_chunks(self, data: Dict[str, Any], raw_text: str = None) -> List[Chunk]:
        """후보자 데이터에서 청크 생성 (구조화 + 원본 텍스트)"""
        chunks = []

        # 1. Summary 청크 (전체 요약)
        summary_chunk = self._build_summary_chunk(data)
        if summary_chunk:
            chunks.append(summary_chunk)

        # 2. Career 청크 (각 경력별)
        career_chunks = self._build_career_chunks(data)
        chunks.extend(career_chunks)

        # 3. Project 청크 (각 프로젝트별)
        project_chunks = self._build_project_chunks(data)
        chunks.extend(project_chunks)

        # 4. Skill 청크 (기술 스택)
        skill_chunk = self._build_skill_chunk(data)
        if skill_chunk:
            chunks.append(skill_chunk)

        # 5. Education 청크 (학력)
        education_chunk = self._build_education_chunk(data)
        if education_chunk:
            chunks.append(education_chunk)

        # 6. Raw Text 청크 (원본 텍스트) - PRD v0.1
        if raw_text:
            raw_chunks = self._build_raw_text_chunks(raw_text)
            chunks.extend(raw_chunks)
            logger.info(f"[EmbeddingService] Raw 청크 {len(raw_chunks)}개 추가 (원본 텍스트 {len(raw_text)}자)")

        return chunks

    def _build_summary_chunk(self, data: Dict[str, Any]) -> Optional[Chunk]:
        """Summary 청크 생성"""
        parts = []

        # 이름과 경력
        if data.get("name"):
            parts.append(f"이름: {data['name']}")

        if data.get("exp_years"):
            parts.append(f"총 경력: {data['exp_years']}년")

        if data.get("last_company"):
            parts.append(f"최근 직장: {data['last_company']}")

        if data.get("last_position"):
            parts.append(f"최근 직책: {data['last_position']}")

        # 요약
        if data.get("summary"):
            parts.append(f"\n요약: {data['summary']}")

        # 강점
        if data.get("strengths"):
            strengths = data["strengths"]
            if isinstance(strengths, list):
                parts.append(f"\n강점: {', '.join(strengths)}")

        # 핵심 스킬 (상위 5개)
        if data.get("skills"):
            skills = data["skills"][:5] if isinstance(data["skills"], list) else []
            if skills:
                parts.append(f"\n핵심 기술: {', '.join(skills)}")

        content = "\n".join(parts)

        if not content.strip():
            return None

        return Chunk(
            chunk_type=ChunkType.SUMMARY,
            chunk_index=0,
            content=content[:self.MAX_CHUNK_CHARS],
            metadata={
                "name": data.get("name"),
                "exp_years": data.get("exp_years"),
                "last_company": data.get("last_company"),
            }
        )

    def _build_career_chunks(self, data: Dict[str, Any]) -> List[Chunk]:
        """Career 청크들 생성 (각 경력별)"""
        chunks = []
        careers = data.get("careers", [])

        if not isinstance(careers, list):
            return chunks

        for i, career in enumerate(careers):
            if not isinstance(career, dict):
                continue

            parts = []

            company = career.get("company", "")
            if company:
                parts.append(f"회사: {company}")

            position = career.get("position")
            if position:
                parts.append(f"직책: {position}")

            department = career.get("department")
            if department:
                parts.append(f"부서: {department}")

            # 기간
            start = career.get("start_date", "")
            end = career.get("end_date", "현재" if career.get("is_current") else "")
            if start or end:
                parts.append(f"기간: {start} ~ {end}")

            # 업무 내용
            description = career.get("description")
            if description:
                parts.append(f"\n업무 내용:\n{description}")

            content = "\n".join(parts)

            if content.strip():
                chunks.append(Chunk(
                    chunk_type=ChunkType.CAREER,
                    chunk_index=i,
                    content=content[:self.MAX_CHUNK_CHARS],
                    metadata={
                        "company": company,
                        "position": position,
                        "is_current": career.get("is_current", False),
                        "start_date": start,
                        "end_date": end if end != "현재" else None,
                    }
                ))

        return chunks

    def _build_project_chunks(self, data: Dict[str, Any]) -> List[Chunk]:
        """Project 청크들 생성 (각 프로젝트별)"""
        chunks = []
        projects = data.get("projects", [])

        if not isinstance(projects, list):
            return chunks

        for i, project in enumerate(projects):
            if not isinstance(project, dict):
                continue

            parts = []

            name = project.get("name", "")
            if name:
                parts.append(f"프로젝트: {name}")

            role = project.get("role")
            if role:
                parts.append(f"역할: {role}")

            period = project.get("period")
            if period:
                parts.append(f"기간: {period}")

            # 사용 기술
            technologies = project.get("technologies", [])
            if technologies and isinstance(technologies, list):
                parts.append(f"기술: {', '.join(technologies)}")

            # 설명
            description = project.get("description")
            if description:
                parts.append(f"\n설명:\n{description}")

            content = "\n".join(parts)

            if content.strip():
                chunks.append(Chunk(
                    chunk_type=ChunkType.PROJECT,
                    chunk_index=i,
                    content=content[:self.MAX_CHUNK_CHARS],
                    metadata={
                        "project_name": name,
                        "role": role,
                        "technologies": technologies,
                    }
                ))

        return chunks

    def _build_skill_chunk(self, data: Dict[str, Any]) -> Optional[Chunk]:
        """Skill 청크 생성"""
        skills = data.get("skills", [])

        if not skills or not isinstance(skills, list):
            return None

        # 스킬 카테고리화 (간단한 분류)
        categorized = self._categorize_skills(skills)

        parts = ["기술 스택"]

        for category, category_skills in categorized.items():
            if category_skills:
                parts.append(f"\n{category}: {', '.join(category_skills)}")

        content = "\n".join(parts)

        return Chunk(
            chunk_type=ChunkType.SKILL,
            chunk_index=0,
            content=content[:self.MAX_CHUNK_CHARS],
            metadata={
                "skill_count": len(skills),
                "skills": skills[:20],  # 상위 20개만 메타데이터에
            }
        )

    def _categorize_skills(self, skills: List[str]) -> Dict[str, List[str]]:
        """스킬 카테고리화"""
        categories = {
            "프로그래밍": [],
            "프레임워크": [],
            "데이터베이스": [],
            "클라우드/인프라": [],
            "기타": [],
        }

        programming = {"python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "kotlin", "swift", "php", "ruby"}
        frameworks = {"react", "vue", "angular", "next.js", "spring", "django", "flask", "fastapi", "express", "node.js"}
        databases = {"mysql", "postgresql", "mongodb", "redis", "oracle", "sqlite", "elasticsearch"}
        cloud = {"aws", "gcp", "azure", "docker", "kubernetes", "terraform", "jenkins", "ci/cd"}

        for skill in skills:
            skill_lower = skill.lower()

            if any(p in skill_lower for p in programming):
                categories["프로그래밍"].append(skill)
            elif any(f in skill_lower for f in frameworks):
                categories["프레임워크"].append(skill)
            elif any(d in skill_lower for d in databases):
                categories["데이터베이스"].append(skill)
            elif any(c in skill_lower for c in cloud):
                categories["클라우드/인프라"].append(skill)
            else:
                categories["기타"].append(skill)

        # 빈 카테고리 제거
        return {k: v for k, v in categories.items() if v}

    def _build_education_chunk(self, data: Dict[str, Any]) -> Optional[Chunk]:
        """Education 청크 생성"""
        parts = []

        # 최종 학력
        if data.get("education_level"):
            level_map = {
                "high_school": "고졸",
                "associate": "전문학사",
                "bachelor": "학사",
                "master": "석사",
                "doctor": "박사"
            }
            level = level_map.get(data["education_level"], data["education_level"])
            parts.append(f"최종 학력: {level}")

        if data.get("education_school"):
            parts.append(f"학교: {data['education_school']}")

        if data.get("education_major"):
            parts.append(f"전공: {data['education_major']}")

        # 상세 학력
        educations = data.get("educations", [])
        if educations and isinstance(educations, list):
            parts.append("\n학력 상세:")
            for edu in educations:
                if isinstance(edu, dict):
                    edu_line = []
                    if edu.get("school"):
                        edu_line.append(edu["school"])
                    if edu.get("major"):
                        edu_line.append(edu["major"])
                    if edu.get("degree"):
                        edu_line.append(edu["degree"])
                    if edu.get("graduation_year"):
                        edu_line.append(f"({edu['graduation_year']})")

                    if edu_line:
                        parts.append(f"- {' / '.join(edu_line)}")

        content = "\n".join(parts)

        if not content.strip():
            return None

        return Chunk(
            chunk_type=ChunkType.EDUCATION,
            chunk_index=0,
            content=content[:self.MAX_CHUNK_CHARS],
            metadata={
                "education_level": data.get("education_level"),
                "school": data.get("education_school"),
                "major": data.get("education_major"),
            }
        )

    def _build_raw_text_chunks(self, raw_text: str) -> List[Chunk]:
        """
        원본 텍스트 청크 생성 (PRD v0.1: prd_aisemantic_search_v0.1.md)

        청킹 전략:
        1. raw_full: 전체 텍스트 (1개, 최대 8000자)
        2. raw_section: 슬라이딩 윈도우 (N개, 한글 최적화 적용)

        P1 이슈 해결:
        - 한글 텍스트 최적화: 한글 50% 이상 → CHUNK_SIZE=2000, OVERLAP=500
        - P0 이슈: truncation 발생 시 로그 경고

        Args:
            raw_text: 파싱된 원본 이력서 텍스트

        Returns:
            List[Chunk]: raw_full + raw_section 청크들
        """
        chunks = []
        cfg = chunking_config

        if not raw_text or len(raw_text.strip()) < cfg.RAW_TEXT_MIN_LENGTH:
            logger.debug(f"[EmbeddingService] Raw 텍스트가 너무 짧음 (< {cfg.RAW_TEXT_MIN_LENGTH}자), 스킵")
            return chunks

        # ─────────────────────────────────────────────────
        # 1. raw_full: 전체 텍스트 (최대 8000자)
        # ─────────────────────────────────────────────────
        is_truncated = len(raw_text) > cfg.MAX_RAW_FULL_CHARS

        # P0 이슈 해결: truncation 발생 시 로그 경고
        if is_truncated:
            logger.warning(
                f"[EmbeddingService] ⚠️ TRUNCATION: 원본 텍스트가 {len(raw_text)}자로 "
                f"MAX_RAW_FULL_CHARS({cfg.MAX_RAW_FULL_CHARS})를 초과합니다. "
                f"마지막 {len(raw_text) - cfg.MAX_RAW_FULL_CHARS}자가 raw_full에서 제외됩니다. "
                f"검색 커버리지 100% 목표에 영향을 줄 수 있습니다."
            )

        chunks.append(Chunk(
            chunk_type=ChunkType.RAW_FULL,
            chunk_index=0,
            content=raw_text[:cfg.MAX_RAW_FULL_CHARS],
            metadata={
                "original_length": len(raw_text),
                "truncated": is_truncated,
                "truncated_chars": len(raw_text) - cfg.MAX_RAW_FULL_CHARS if is_truncated else 0
            }
        ))

        # ─────────────────────────────────────────────────
        # 2. raw_section: 슬라이딩 윈도우 청킹
        #    - P1 이슈 해결: 한글 최적화
        # ─────────────────────────────────────────────────

        # 한글 우세 여부 확인
        is_korean = self._is_korean_dominant(raw_text)

        if is_korean:
            chunk_size = cfg.KOREAN_CHUNK_SIZE
            overlap = cfg.KOREAN_OVERLAP
            logger.debug(f"[EmbeddingService] 한글 최적화 적용: CHUNK_SIZE={chunk_size}, OVERLAP={overlap}")
        else:
            chunk_size = cfg.RAW_SECTION_CHUNK_SIZE
            overlap = cfg.RAW_SECTION_OVERLAP

        min_chunk_length = cfg.RAW_SECTION_MIN_LENGTH

        # chunk_size 이상일 때만 섹션 분할
        if len(raw_text) > chunk_size:
            section_index = 0
            stride = chunk_size - overlap

            for start in range(0, len(raw_text), stride):
                section = raw_text[start:start + chunk_size]

                # 최소 길이 체크
                if len(section.strip()) < min_chunk_length:
                    continue

                chunks.append(Chunk(
                    chunk_type=ChunkType.RAW_SECTION,
                    chunk_index=section_index,
                    content=section,
                    metadata={
                        "start_pos": start,
                        "end_pos": min(start + chunk_size, len(raw_text)),
                        "section_length": len(section),
                        "is_korean_optimized": is_korean
                    }
                ))
                section_index += 1

        logger.debug(
            f"[EmbeddingService] Raw 청킹 완료: "
            f"raw_full=1, raw_section={len(chunks) - 1}, "
            f"korean_optimized={is_korean}"
        )

        return chunks


# 싱글톤 인스턴스
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Embedding Service 싱글톤 인스턴스 반환"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
