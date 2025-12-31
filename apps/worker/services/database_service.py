"""
Database Service - Supabase Direct Storage

Worker에서 직접 Supabase에 데이터 저장
- candidates 테이블 저장
- candidate_chunks 테이블 + embedding 저장
- 암호화 필드 저장
"""

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class SaveResult:
    """저장 결과"""
    success: bool
    candidate_id: Optional[str] = None
    chunk_count: int = 0
    error: Optional[str] = None


class DatabaseService:
    """
    Supabase 직접 저장 서비스

    - candidates 테이블에 분석 결과 저장
    - candidate_chunks 테이블에 청크 + 임베딩 저장
    - 암호화/해시 필드 저장
    """

    def __init__(self):
        self.client: Optional[Client] = None
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
            self.client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY
            )

    def save_candidate(
        self,
        user_id: str,
        job_id: str,
        analyzed_data: Dict[str, Any],
        confidence_score: float,
        field_confidence: Dict[str, float],
        warnings: List[Dict[str, Any]],
        encrypted_store: Dict[str, str],
        hash_store: Dict[str, str],
        source_file: str,
        file_type: str,
        analysis_mode: str,
    ) -> SaveResult:
        """
        candidates 테이블에 저장

        Args:
            user_id: 사용자 ID
            job_id: 처리 작업 ID
            analyzed_data: 분석된 이력서 데이터 (마스킹됨)
            confidence_score: 전체 신뢰도 점수
            field_confidence: 필드별 신뢰도
            warnings: 경고 목록
            encrypted_store: 암호화된 원본 값 {field: encrypted_value}
            hash_store: 해시값 {field: hash_value}
            source_file: 원본 파일 경로
            file_type: 파일 타입
            analysis_mode: 분석 모드 (phase_1/phase_2)

        Returns:
            SaveResult with candidate_id
        """
        if not self.client:
            return SaveResult(
                success=False,
                error="Supabase client not initialized"
            )

        try:
            # candidates 테이블 데이터 구성
            candidate_record = {
                "user_id": user_id,
                # 기본 정보 (마스킹된 값)
                "name": analyzed_data.get("name"),
                "birth_year": analyzed_data.get("birth_year"),
                "gender": analyzed_data.get("gender"),
                "location_city": analyzed_data.get("location_city"),
                # 마스킹된 연락처 (표시용)
                "phone_masked": analyzed_data.get("phone"),
                "email_masked": analyzed_data.get("email"),
                # 암호화된 원본 (복호화 가능)
                "phone_encrypted": encrypted_store.get("phone"),
                "email_encrypted": encrypted_store.get("email"),
                # 해시 (중복 체크용)
                "phone_hash": hash_store.get("phone"),
                "email_hash": hash_store.get("email"),
                # 경력 정보
                "exp_years": analyzed_data.get("exp_years", 0),
                "last_company": analyzed_data.get("last_company"),
                "last_position": analyzed_data.get("last_position"),
                "careers": analyzed_data.get("careers", []),
                # 스킬
                "skills": analyzed_data.get("skills", []),
                # 학력
                "education_level": analyzed_data.get("education_level"),
                "education_school": analyzed_data.get("education_school"),
                "education_major": analyzed_data.get("education_major"),
                "education": analyzed_data.get("educations", []),
                # 프로젝트
                "projects": analyzed_data.get("projects", []),
                # AI 생성
                "summary": analyzed_data.get("summary"),
                "strengths": analyzed_data.get("strengths", []),
                # 신뢰도
                "confidence_score": confidence_score,
                "field_confidence": field_confidence,
                "warnings": warnings,
                # 링크
                "portfolio_url": analyzed_data.get("portfolio_url"),
                "github_url": analyzed_data.get("github_url"),
                "linkedin_url": analyzed_data.get("linkedin_url"),
                # 파일 정보
                "source_file": source_file,
                "file_type": file_type,
                # 상태
                "status": "analyzed",
                "analysis_mode": analysis_mode,
            }

            # None 값 제거 (Supabase에서 에러 방지)
            candidate_record = {
                k: v for k, v in candidate_record.items()
                if v is not None
            }

            result = self.client.table("candidates").insert(candidate_record).execute()

            if result.data and len(result.data) > 0:
                candidate_id = result.data[0].get("id")
                logger.info(f"Saved candidate: {candidate_id}")
                return SaveResult(
                    success=True,
                    candidate_id=candidate_id
                )
            else:
                return SaveResult(
                    success=False,
                    error="No data returned from insert"
                )

        except Exception as e:
            logger.error(f"Failed to save candidate: {e}")
            return SaveResult(
                success=False,
                error=str(e)
            )

    def save_chunks_with_embeddings(
        self,
        candidate_id: str,
        chunks: List[Any],  # List[Chunk] from embedding_service
    ) -> int:
        """
        candidate_chunks 테이블에 청크 + 임베딩 저장

        Args:
            candidate_id: 후보자 ID
            chunks: Chunk 객체 리스트 (embedding 포함)

        Returns:
            저장된 청크 수
        """
        if not self.client:
            logger.error("Supabase client not initialized")
            return 0

        saved_count = 0

        try:
            for chunk in chunks:
                chunk_record = {
                    "candidate_id": candidate_id,
                    "chunk_type": chunk.chunk_type.value if hasattr(chunk.chunk_type, 'value') else chunk.chunk_type,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,  # 전체 내용
                    "metadata": chunk.metadata if hasattr(chunk, 'metadata') else {},
                }

                # 임베딩이 있으면 추가
                if hasattr(chunk, 'embedding') and chunk.embedding is not None:
                    chunk_record["embedding"] = chunk.embedding

                result = self.client.table("candidate_chunks").insert(chunk_record).execute()

                if result.data:
                    saved_count += 1

            logger.info(f"Saved {saved_count}/{len(chunks)} chunks for candidate {candidate_id}")
            return saved_count

        except Exception as e:
            logger.error(f"Failed to save chunks: {e}")
            return saved_count

    def update_job_status(
        self,
        job_id: str,
        status: str,
        candidate_id: Optional[str] = None,
        confidence_score: Optional[float] = None,
        chunk_count: Optional[int] = None,
        pii_count: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> bool:
        """
        processing_jobs 상태 업데이트

        Returns:
            성공 여부
        """
        if not self.client:
            return False

        try:
            update_data: Dict[str, Any] = {"status": status}

            if candidate_id:
                update_data["candidate_id"] = candidate_id
            if confidence_score is not None:
                update_data["confidence_score"] = confidence_score
            if chunk_count is not None:
                update_data["chunk_count"] = chunk_count
            if pii_count is not None:
                update_data["pii_count"] = pii_count
            if error_message:
                update_data["error_message"] = error_message

            self.client.table("processing_jobs").update(update_data).eq("id", job_id).execute()
            return True

        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
            return False

    def deduct_credit(self, user_id: str) -> bool:
        """
        크레딧 차감

        Returns:
            성공 여부
        """
        if not self.client:
            return False

        try:
            # 현재 사용량 조회
            result = self.client.table("users").select("credits_used_this_month").eq("id", user_id).single().execute()

            if result.data:
                current_used = result.data.get("credits_used_this_month", 0)
                self.client.table("users").update({
                    "credits_used_this_month": current_used + 1
                }).eq("id", user_id).execute()
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to deduct credit: {e}")
            return False


# 싱글톤 인스턴스
_database_service: Optional[DatabaseService] = None


def get_database_service() -> DatabaseService:
    """Database Service 싱글톤 인스턴스 반환"""
    global _database_service
    if _database_service is None:
        _database_service = DatabaseService()
    return _database_service
