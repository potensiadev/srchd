"""
Database Service - Supabase Direct Storage

Worker에서 직접 Supabase에 데이터 저장
- candidates 테이블 저장
- candidate_chunks 테이블 + embedding 저장
- 암호화 필드 저장
- 중복 체크 + 버전 스태킹
- 트랜잭션 롤백 패턴 (Compensating Transaction)
"""

import hashlib
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from contextlib import contextmanager

from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class DuplicateMatchType(str, Enum):
    """중복 매칭 타입 (Waterfall 순서)"""
    PHONE_HASH = "phone_hash"           # 1순위: 전화번호 해시
    EMAIL_HASH = "email_hash"           # 2순위: 이메일 해시
    NAME_PHONE_PREFIX = "name_phone"    # 3순위: 이름 + 전화번호 앞4자리
    NAME_BIRTH = "name_birth"           # 4순위: 이름 + 생년
    NONE = "none"                       # 매칭 없음


@dataclass
class DuplicateCheckResult:
    """중복 체크 결과"""
    is_duplicate: bool
    match_type: DuplicateMatchType
    existing_candidate_id: Optional[str] = None
    existing_candidate_name: Optional[str] = None
    confidence: float = 0.0  # 매칭 신뢰도


@dataclass
class SaveResult:
    """저장 결과"""
    success: bool
    candidate_id: Optional[str] = None
    chunk_count: int = 0
    error: Optional[str] = None
    is_update: bool = False  # 기존 후보자 업데이트 여부
    parent_id: Optional[str] = None  # 이전 버전 ID


@dataclass
class RollbackAction:
    """롤백 액션 정보"""
    table: str
    action: str  # "delete" | "restore"
    record_id: str
    previous_data: Optional[Dict[str, Any]] = None


class SaveContext:
    """
    트랜잭션 컨텍스트 (Compensating Transaction 패턴)

    Supabase는 네이티브 트랜잭션을 지원하지 않으므로,
    성공한 작업을 추적하고 실패 시 롤백 액션을 실행합니다.

    Usage:
        ctx = SaveContext(client)
        try:
            ctx.track_insert("candidates", candidate_id)
            ctx.track_update("candidates", old_candidate_id, old_data)
            # ... 작업 수행
            ctx.commit()  # 성공 시 롤백 액션 클리어
        except Exception:
            ctx.rollback()  # 실패 시 보상 트랜잭션 실행
    """

    def __init__(self, client: Client):
        self.client = client
        self.actions: List[RollbackAction] = []
        self.committed = False

    def track_insert(self, table: str, record_id: str) -> None:
        """INSERT 작업 추적 (롤백 시 DELETE)"""
        self.actions.append(RollbackAction(
            table=table,
            action="delete",
            record_id=record_id
        ))

    def track_update(self, table: str, record_id: str, previous_data: Dict[str, Any]) -> None:
        """UPDATE 작업 추적 (롤백 시 이전 데이터 복원)"""
        self.actions.append(RollbackAction(
            table=table,
            action="restore",
            record_id=record_id,
            previous_data=previous_data
        ))

    def commit(self) -> None:
        """트랜잭션 성공 - 롤백 액션 클리어"""
        self.actions.clear()
        self.committed = True

    def rollback(self) -> None:
        """실패 시 보상 트랜잭션 실행 (역순으로)"""
        if self.committed:
            return

        for action in reversed(self.actions):
            try:
                if action.action == "delete":
                    self.client.table(action.table).delete().eq("id", action.record_id).execute()
                    logger.info(f"[Rollback] Deleted {action.table}:{action.record_id}")
                elif action.action == "restore" and action.previous_data:
                    self.client.table(action.table).update(action.previous_data).eq("id", action.record_id).execute()
                    logger.info(f"[Rollback] Restored {action.table}:{action.record_id}")
            except Exception as e:
                logger.error(f"[Rollback] Failed to rollback {action.table}:{action.record_id}: {e}")

        self.actions.clear()


class DatabaseService:
    """
    Supabase 직접 저장 서비스

    - candidates 테이블에 분석 결과 저장
    - candidate_chunks 테이블에 청크 + 임베딩 저장
    - 암호화/해시 필드 저장
    - 중복 체크 + 버전 스태킹 (PRD 요구사항)
    """

    def __init__(self):
        self.client: Optional[Client] = None
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
            self.client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY
            )

    def _normalize_phone(self, phone: Optional[str]) -> Optional[str]:
        """전화번호 정규화 (숫자만 추출)"""
        if not phone:
            return None
        import re
        digits = re.sub(r'\D', '', phone)
        # 한국 휴대폰: 010으로 시작하는 11자리
        if len(digits) == 11 and digits.startswith('010'):
            return digits
        # 한국 휴대폰 국가코드 포함: 82-10-xxxx-xxxx
        if len(digits) == 12 and digits.startswith('82'):
            return '0' + digits[2:]
        return digits if len(digits) >= 10 else None

    def _get_phone_prefix(self, phone: Optional[str]) -> Optional[str]:
        """전화번호 앞 4자리 추출 (이름+전화 매칭용)"""
        normalized = self._normalize_phone(phone)
        if normalized and len(normalized) >= 7:
            # 010 제외한 뒷 8자리 중 앞 4자리
            return normalized[3:7]
        return None

    def _create_name_phone_hash(self, name: Optional[str], phone: Optional[str]) -> Optional[str]:
        """이름 + 전화번호 앞4자리 해시 생성"""
        if not name or not phone:
            return None
        phone_prefix = self._get_phone_prefix(phone)
        if not phone_prefix:
            return None
        # 이름 정규화 (공백 제거, 소문자)
        normalized_name = ''.join(name.split()).lower()
        combined = f"{normalized_name}:{phone_prefix}"
        return hashlib.sha256(combined.encode()).hexdigest()

    def _create_name_birth_hash(self, name: Optional[str], birth_year: Optional[int]) -> Optional[str]:
        """이름 + 생년 해시 생성"""
        if not name or not birth_year:
            return None
        normalized_name = ''.join(name.split()).lower()
        combined = f"{normalized_name}:{birth_year}"
        return hashlib.sha256(combined.encode()).hexdigest()

    def check_duplicate(
        self,
        user_id: str,
        phone_hash: Optional[str] = None,
        email_hash: Optional[str] = None,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        birth_year: Optional[int] = None,
    ) -> DuplicateCheckResult:
        """
        Waterfall 방식 중복 체크

        PRD 요구사항:
        1순위: 전화번호 해시 매칭
        2순위: 이메일 해시 매칭
        3순위: 이름 + 전화번호 앞4자리 매칭
        4순위: 이름 + 생년 매칭

        Args:
            user_id: 사용자 ID (같은 사용자 내에서만 중복 체크)
            phone_hash: 전화번호 SHA-256 해시
            email_hash: 이메일 SHA-256 해시
            name: 이름 (마스킹 전 원본)
            phone: 전화번호 (마스킹 전 원본)
            birth_year: 생년

        Returns:
            DuplicateCheckResult
        """
        if not self.client:
            return DuplicateCheckResult(
                is_duplicate=False,
                match_type=DuplicateMatchType.NONE,
                confidence=0.0
            )

        try:
            # 1순위: 전화번호 해시
            if phone_hash:
                result = self.client.table("candidates").select(
                    "id, name, is_latest"
                ).eq("user_id", user_id).eq("phone_hash", phone_hash).eq(
                    "is_latest", True
                ).execute()

                if result.data and len(result.data) > 0:
                    existing = result.data[0]
                    logger.info(f"Duplicate found by phone_hash: {existing['id']}")
                    return DuplicateCheckResult(
                        is_duplicate=True,
                        match_type=DuplicateMatchType.PHONE_HASH,
                        existing_candidate_id=existing['id'],
                        existing_candidate_name=existing.get('name'),
                        confidence=1.0  # 전화번호 해시는 확실
                    )

            # 2순위: 이메일 해시
            if email_hash:
                result = self.client.table("candidates").select(
                    "id, name, is_latest"
                ).eq("user_id", user_id).eq("email_hash", email_hash).eq(
                    "is_latest", True
                ).execute()

                if result.data and len(result.data) > 0:
                    existing = result.data[0]
                    logger.info(f"Duplicate found by email_hash: {existing['id']}")
                    return DuplicateCheckResult(
                        is_duplicate=True,
                        match_type=DuplicateMatchType.EMAIL_HASH,
                        existing_candidate_id=existing['id'],
                        existing_candidate_name=existing.get('name'),
                        confidence=0.95  # 이메일도 거의 확실
                    )

            # 3순위: 이름 + 전화번호 앞4자리
            name_phone_hash = self._create_name_phone_hash(name, phone)
            if name_phone_hash:
                # 같은 조합 검색을 위해 모든 후보자 조회 후 비교
                # (DB에 name_phone_hash 컬럼이 없으므로 런타임 비교)
                result = self.client.table("candidates").select(
                    "id, name, phone_masked, is_latest"
                ).eq("user_id", user_id).eq("is_latest", True).execute()

                if result.data:
                    for candidate in result.data:
                        # 마스킹된 전화번호에서 앞부분 추출 (010-1234-****)
                        masked_phone = candidate.get('phone_masked', '')
                        cand_name = candidate.get('name', '')
                        # 전화번호 앞 4자리 추출 (마스킹 패턴: 010-1234-****)
                        if masked_phone and len(masked_phone) >= 8:
                            # 010-1234 형태에서 1234 추출
                            import re
                            match = re.search(r'010[- ]?(\d{4})', masked_phone)
                            if match:
                                cand_prefix = match.group(1)
                                my_prefix = self._get_phone_prefix(phone)
                                # 이름 비교 (정규화)
                                if (cand_prefix == my_prefix and
                                    cand_name and name and
                                    ''.join(cand_name.split()).lower() == ''.join(name.split()).lower()):
                                    logger.info(f"Duplicate found by name+phone prefix: {candidate['id']}")
                                    return DuplicateCheckResult(
                                        is_duplicate=True,
                                        match_type=DuplicateMatchType.NAME_PHONE_PREFIX,
                                        existing_candidate_id=candidate['id'],
                                        existing_candidate_name=cand_name,
                                        confidence=0.85
                                    )

            # 4순위: 이름 + 생년
            if name and birth_year:
                # 이름과 생년이 같은 후보자 검색
                normalized_name = ''.join(name.split()).lower()
                result = self.client.table("candidates").select(
                    "id, name, birth_year, is_latest"
                ).eq("user_id", user_id).eq("birth_year", birth_year).eq(
                    "is_latest", True
                ).execute()

                if result.data:
                    for candidate in result.data:
                        cand_name = candidate.get('name', '')
                        if cand_name and ''.join(cand_name.split()).lower() == normalized_name:
                            logger.info(f"Duplicate found by name+birth_year: {candidate['id']}")
                            return DuplicateCheckResult(
                                is_duplicate=True,
                                match_type=DuplicateMatchType.NAME_BIRTH,
                                existing_candidate_id=candidate['id'],
                                existing_candidate_name=cand_name,
                                confidence=0.7  # 동명이인 가능성
                            )

            # 중복 없음
            return DuplicateCheckResult(
                is_duplicate=False,
                match_type=DuplicateMatchType.NONE,
                confidence=0.0
            )

        except Exception as e:
            logger.error(f"Duplicate check failed: {e}")
            # 오류 시 중복 없음으로 처리 (false positive 방지)
            return DuplicateCheckResult(
                is_duplicate=False,
                match_type=DuplicateMatchType.NONE,
                confidence=0.0
            )

    def _update_version_stacking(
        self,
        existing_candidate_id: str,
        match_type: DuplicateMatchType,
    ) -> bool:
        """
        버전 스태킹: 기존 후보자를 이전 버전으로 설정

        Args:
            existing_candidate_id: 기존 후보자 ID
            match_type: 매칭 타입 (로그용)

        Returns:
            성공 여부
        """
        if not self.client:
            return False

        try:
            # 기존 후보자의 is_latest를 False로 업데이트
            self.client.table("candidates").update({
                "is_latest": False,
                "updated_at": "now()"
            }).eq("id", existing_candidate_id).execute()

            logger.info(
                f"Version stacking: {existing_candidate_id} marked as old version "
                f"(match_type: {match_type.value})"
            )
            return True

        except Exception as e:
            logger.error(f"Version stacking failed: {e}")
            return False

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
        original_data: Optional[Dict[str, Any]] = None,  # 마스킹 전 원본 데이터 (중복 체크용)
        candidate_id: Optional[str] = None,  # 미리 생성된 candidate ID (업로드 시 생성됨)
    ) -> SaveResult:
        """
        candidates 테이블에 저장 (중복 체크 + 버전 스태킹 포함)

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
            original_data: 마스킹 전 원본 데이터 (중복 체크용)

        Returns:
            SaveResult with candidate_id
        """
        if not self.client:
            return SaveResult(
                success=False,
                error="Supabase client not initialized"
            )

        # 트랜잭션 컨텍스트 생성
        ctx = SaveContext(self.client)

        try:
            # ─────────────────────────────────────────────────
            # Step 0: 중복 체크 (Waterfall)
            # ─────────────────────────────────────────────────
            parent_id: Optional[str] = None
            is_update = False

            # 중복 체크에 필요한 데이터 추출
            orig = original_data or analyzed_data
            dup_result = self.check_duplicate(
                user_id=user_id,
                phone_hash=hash_store.get("phone"),
                email_hash=hash_store.get("email"),
                name=orig.get("name"),
                phone=orig.get("phone"),
                birth_year=orig.get("birth_year"),
            )

            if dup_result.is_duplicate and dup_result.existing_candidate_id:
                # 버전 스태킹 전 기존 데이터 백업 (롤백용)
                existing_data = self.client.table("candidates").select(
                    "is_latest, updated_at"
                ).eq("id", dup_result.existing_candidate_id).single().execute()

                if existing_data.data:
                    ctx.track_update(
                        "candidates",
                        dup_result.existing_candidate_id,
                        existing_data.data
                    )

                # 버전 스태킹: 기존 레코드를 이전 버전으로 설정
                self._update_version_stacking(
                    dup_result.existing_candidate_id,
                    dup_result.match_type
                )
                parent_id = dup_result.existing_candidate_id
                is_update = True
                logger.info(
                    f"Duplicate detected: updating {dup_result.existing_candidate_name} "
                    f"(match: {dup_result.match_type.value}, confidence: {dup_result.confidence})"
                )

            # ─────────────────────────────────────────────────
            # Step 1: candidates 테이블 데이터 구성
            # ─────────────────────────────────────────────────
            candidate_record = {
                "user_id": user_id,
                # 기본 정보 (마스킹된 값)
                # name은 DB에서 NULL 허용하도록 마이그레이션됨
                "name": analyzed_data.get("name") or "이름 미확인",
                "birth_year": analyzed_data.get("birth_year"),
                "gender": analyzed_data.get("gender"),
                "location_city": analyzed_data.get("location_city"),
                # 마스킹된 연락처 (표시용)
                "phone_masked": analyzed_data.get("phone"),
                "email_masked": analyzed_data.get("email"),
                "address_masked": analyzed_data.get("address"),
                # 암호화된 원본 (복호화 가능)
                "phone_encrypted": encrypted_store.get("phone"),
                "email_encrypted": encrypted_store.get("email"),
                "address_encrypted": encrypted_store.get("address"),
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
                "education": analyzed_data.get("education", analyzed_data.get("educations", [])),
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
                # 상태 (candidate_status enum: processing, completed, failed, rejected)
                "status": "completed",
                "analysis_mode": analysis_mode,
                # 버전 스태킹 (중복 체크 결과)
                "is_latest": True,  # 새 레코드는 항상 최신
                "parent_id": parent_id,  # 이전 버전 ID (없으면 None)
            }

            # None 값 제거 (Supabase에서 에러 방지)
            candidate_record = {
                k: v for k, v in candidate_record.items()
                if v is not None
            }

            # candidate_id가 미리 제공된 경우 (업로드 시 생성됨) UPDATE, 아니면 INSERT
            if candidate_id:
                # 기존 레코드 업데이트
                result = self.client.table("candidates").update(
                    candidate_record
                ).eq("id", candidate_id).execute()
                final_candidate_id = candidate_id
            else:
                # 새 레코드 삽입
                result = self.client.table("candidates").insert(candidate_record).execute()
                if result.data and len(result.data) > 0:
                    final_candidate_id = result.data[0].get("id")
                    # 새로 생성된 레코드 추적 (롤백 시 삭제)
                    ctx.track_insert("candidates", final_candidate_id)
                else:
                    ctx.rollback()
                    return SaveResult(
                        success=False,
                        error="No data returned from insert"
                    )

            log_msg = f"Saved candidate: {final_candidate_id}"
            if is_update:
                log_msg += f" (updated from {parent_id})"
            logger.info(log_msg)

            # 트랜잭션 성공
            ctx.commit()

            return SaveResult(
                success=True,
                candidate_id=final_candidate_id,
                is_update=is_update,
                parent_id=parent_id
            )

        except Exception as e:
            logger.error(f"Failed to save candidate: {e}")
            # 실패 시 롤백
            ctx.rollback()
            return SaveResult(
                success=False,
                error=str(e)
            )

    def save_chunks_with_embeddings(
        self,
        candidate_id: str,
        chunks: List[Any],  # List[Chunk] from embedding_service
        batch_size: int = 50,  # 배치 크기
    ) -> int:
        """
        candidate_chunks 테이블에 청크 + 임베딩 저장 (배치 삽입)

        Args:
            candidate_id: 후보자 ID
            chunks: Chunk 객체 리스트 (embedding 포함)
            batch_size: 한 번에 삽입할 청크 수

        Returns:
            저장된 청크 수
        """
        if not self.client:
            logger.error("Supabase client not initialized")
            return 0

        if not chunks:
            return 0

        saved_count = 0
        saved_chunk_ids: List[str] = []

        try:
            # 청크 레코드 리스트 생성
            chunk_records = []
            for chunk in chunks:
                chunk_record = {
                    "candidate_id": candidate_id,
                    "chunk_type": chunk.chunk_type.value if hasattr(chunk.chunk_type, 'value') else chunk.chunk_type,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "metadata": chunk.metadata if hasattr(chunk, 'metadata') else {},
                }

                # 임베딩이 있으면 추가
                if hasattr(chunk, 'embedding') and chunk.embedding is not None:
                    chunk_record["embedding"] = chunk.embedding

                chunk_records.append(chunk_record)

            # 배치 삽입
            for i in range(0, len(chunk_records), batch_size):
                batch = chunk_records[i:i + batch_size]
                result = self.client.table("candidate_chunks").insert(batch).execute()

                if result.data:
                    saved_count += len(result.data)
                    # 저장된 청크 ID 추적 (롤백용)
                    for item in result.data:
                        if item.get("id"):
                            saved_chunk_ids.append(item["id"])

            logger.info(f"Saved {saved_count}/{len(chunks)} chunks for candidate {candidate_id}")
            return saved_count

        except Exception as e:
            logger.error(f"Failed to save chunks: {e}")
            # 실패 시 저장된 청크 롤백
            if saved_chunk_ids:
                try:
                    self.client.table("candidate_chunks").delete().in_("id", saved_chunk_ids).execute()
                    logger.info(f"[Rollback] Deleted {len(saved_chunk_ids)} chunks")
                except Exception as rollback_error:
                    logger.error(f"[Rollback] Failed to delete chunks: {rollback_error}")
            return 0

    def update_job_status(
        self,
        job_id: str,
        status: str,
        candidate_id: Optional[str] = None,
        confidence_score: Optional[float] = None,
        chunk_count: Optional[int] = None,
        pii_count: Optional[int] = None,
        error_code: Optional[str] = None,
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
            if error_code:
                update_data["error_code"] = error_code
            if error_message:
                update_data["error_message"] = error_message

            self.client.table("processing_jobs").update(update_data).eq("id", job_id).execute()
            return True

        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
            return False

    def deduct_credit(self, user_id: str, candidate_id: Optional[str] = None) -> bool:
        """
        크레딧 차감 (SQL 함수 호출 + 트랜잭션 로깅)

        PRD 요구사항:
        - deduct_credit() SQL 함수 호출
        - credit_transactions 테이블에 기록

        Returns:
            성공 여부
        """
        if not self.client:
            return False

        try:
            # SQL 함수 deduct_credit 호출 (001 migration에 정의됨)
            # 이 함수는 credits를 먼저 차감하고, 부족하면 credits_used_this_month 증가
            result = self.client.rpc("deduct_credit", {"p_user_id": user_id}).execute()

            if result.data is not None:
                success = result.data
                if success:
                    # 트랜잭션 로깅
                    self._log_credit_transaction(
                        user_id=user_id,
                        transaction_type="usage",
                        amount=-1,
                        description="이력서 분석",
                        candidate_id=candidate_id
                    )
                    logger.info(f"Credit deducted for user {user_id}")
                    return True
                else:
                    logger.warning(f"Credit deduction failed for user {user_id} - insufficient credits")
                    return False

            return False

        except Exception as e:
            logger.error(f"Failed to deduct credit: {e}")
            # Fallback: 기존 방식으로 시도
            return self._deduct_credit_fallback(user_id, candidate_id)

    def _deduct_credit_fallback(self, user_id: str, candidate_id: Optional[str] = None) -> bool:
        """크레딧 차감 Fallback (RPC 실패 시)"""
        try:
            result = self.client.table("users").select(
                "credits, credits_used_this_month"
            ).eq("id", user_id).single().execute()

            if result.data:
                credits = result.data.get("credits", 0)
                used = result.data.get("credits_used_this_month", 0)

                # 우선 추가 크레딧에서 차감
                if credits > 0:
                    self.client.table("users").update({
                        "credits": credits - 1
                    }).eq("id", user_id).execute()
                else:
                    # 기본 크레딧 사용량 증가
                    self.client.table("users").update({
                        "credits_used_this_month": used + 1
                    }).eq("id", user_id).execute()

                # 트랜잭션 로깅
                self._log_credit_transaction(
                    user_id=user_id,
                    transaction_type="usage",
                    amount=-1,
                    description="이력서 분석 (fallback)",
                    candidate_id=candidate_id
                )
                return True

            return False
        except Exception as e:
            logger.error(f"Fallback credit deduction failed: {e}")
            return False

    def _log_credit_transaction(
        self,
        user_id: str,
        transaction_type: str,
        amount: int,
        description: str,
        candidate_id: Optional[str] = None
    ) -> None:
        """credit_transactions 테이블에 기록"""
        try:
            # 현재 잔액 조회
            result = self.client.table("users").select("credits").eq("id", user_id).single().execute()
            balance_after = result.data.get("credits", 0) if result.data else 0

            self.client.table("credit_transactions").insert({
                "user_id": user_id,
                "type": transaction_type,
                "amount": amount,
                "balance_after": balance_after,
                "description": description,
                "candidate_id": candidate_id
            }).execute()
        except Exception as e:
            logger.error(f"Failed to log credit transaction: {e}")

    def check_credit_available(self, user_id: str) -> bool:
        """
        크레딧 사용 가능 여부 확인

        Returns:
            True if credits available, False otherwise
        """
        if not self.client:
            return False

        try:
            result = self.client.table("users").select(
                "credits, credits_used_this_month, plan"
            ).eq("id", user_id).single().execute()

            if result.data:
                credits = result.data.get("credits", 0)
                used = result.data.get("credits_used_this_month", 0)
                plan = result.data.get("plan", "starter")

                # 플랜별 기본 크레딧
                base_credits = {
                    "starter": 50,
                    "pro": 150,
                    "enterprise": 300
                }

                base = base_credits.get(plan, 50)
                remaining = (base - used) + credits

                return remaining > 0

            return False

        except Exception as e:
            logger.error(f"Failed to check credit: {e}")
            return False

    def upload_image_to_storage(
        self,
        image_bytes: bytes,
        user_id: str,
        candidate_id: str,
        image_type: str,  # "photo" or "portfolio_thumbnail"
    ) -> Optional[str]:
        """
        Supabase Storage에 이미지 업로드

        Args:
            image_bytes: 이미지 바이트
            user_id: 사용자 ID
            candidate_id: 후보자 ID
            image_type: 이미지 타입 ("photo", "portfolio_thumbnail")

        Returns:
            업로드된 이미지의 public URL 또는 None
        """
        if not self.client or not image_bytes:
            return None

        try:
            # 파일 경로 생성
            extension = "jpg" if image_type == "photo" else "png"
            file_path = f"candidates/{user_id}/{candidate_id}/{image_type}.{extension}"

            # Storage 업로드
            content_type = f"image/{extension}"
            result = self.client.storage.from_("resumes").upload(
                file_path,
                image_bytes,
                file_options={"content-type": content_type, "upsert": "true"}
            )

            # Public URL 생성
            public_url = self.client.storage.from_("resumes").get_public_url(file_path)
            logger.info(f"Uploaded {image_type} for candidate {candidate_id}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload image: {e}")
            return None

    def update_candidate_images(
        self,
        candidate_id: str,
        photo_url: Optional[str] = None,
        portfolio_thumbnail_url: Optional[str] = None,
    ) -> bool:
        """
        후보자의 이미지 URL 업데이트

        Args:
            candidate_id: 후보자 ID
            photo_url: 프로필 사진 URL
            portfolio_thumbnail_url: 포트폴리오 썸네일 URL

        Returns:
            성공 여부
        """
        if not self.client:
            return False

        try:
            update_data: Dict[str, Any] = {}

            if photo_url:
                update_data["photo_url"] = photo_url
            if portfolio_thumbnail_url:
                update_data["portfolio_thumbnail_url"] = portfolio_thumbnail_url

            if not update_data:
                return True  # 업데이트할 내용 없음

            self.client.table("candidates").update(update_data).eq(
                "id", candidate_id
            ).execute()

            logger.info(
                f"Updated images for candidate {candidate_id}: "
                f"photo={bool(photo_url)}, thumbnail={bool(portfolio_thumbnail_url)}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to update candidate images: {e}")
            return False


# 싱글톤 인스턴스
_database_service: Optional[DatabaseService] = None


def get_database_service() -> DatabaseService:
    """Database Service 싱글톤 인스턴스 반환"""
    global _database_service
    if _database_service is None:
        _database_service = DatabaseService()
    return _database_service
