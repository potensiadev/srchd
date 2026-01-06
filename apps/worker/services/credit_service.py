"""
Credit Service - 크레딧 예약/확정/해제 패턴

Worker에서 사용하는 크레딧 관리 서비스
- 처리 시작 전 크레딧 예약 (reserve)
- 성공 시 크레딧 확정 (confirm)
- 실패 시 크레딧 해제 (release)
- 관리자용 환불 (refund)
"""

import logging
from typing import Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

from supabase import create_client, Client
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CreditTransactionType(str, Enum):
    """크레딧 트랜잭션 타입"""
    RESERVE = "reserve"       # 예약 (처리 시작)
    CONFIRM = "confirm"       # 확정 (처리 완료)
    RELEASE = "release"       # 해제 (처리 실패/취소)
    USAGE = "usage"           # 직접 사용 (기존 방식)
    REFUND = "refund"         # 환불 (관리자)
    PURCHASE = "purchase"     # 구매


@dataclass
class CreditReservation:
    """크레딧 예약 정보"""
    reservation_id: str
    user_id: str
    job_id: str
    amount: int = 1
    status: str = "reserved"  # reserved, confirmed, released
    created_at: Optional[str] = None


@dataclass
class CreditResult:
    """크레딧 작업 결과"""
    success: bool
    reservation_id: Optional[str] = None
    remaining_credits: int = 0
    error: Optional[str] = None


class CreditService:
    """
    크레딧 예약 패턴 서비스

    Flow:
    1. reserve() - 처리 시작 전 크레딧 예약
    2. confirm() - 처리 성공 시 크레딧 확정 차감
    3. release() - 처리 실패 시 크레딧 예약 해제
    """

    def __init__(self):
        self.client: Optional[Client] = None
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
            self.client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY
            )

    def _get_plan_base_credits(self, plan: str) -> int:
        """플랜별 기본 크레딧"""
        base_credits = {
            "starter": 50,
            "pro": 150,
            "enterprise": 300
        }
        return base_credits.get(plan, 50)

    def _calculate_remaining(self, user_data: dict) -> int:
        """남은 크레딧 계산"""
        credits = user_data.get("credits", 0)
        used = user_data.get("credits_used_this_month", 0)
        reserved = user_data.get("credits_reserved", 0)
        plan = user_data.get("plan", "starter")

        base = self._get_plan_base_credits(plan)
        # 남은 크레딧 = (기본 - 사용량 - 예약량) + 추가 크레딧
        return max(0, (base - used - reserved)) + credits

    def check_available(self, user_id: str, amount: int = 1) -> bool:
        """
        크레딧 사용 가능 여부 확인 (예약된 크레딧 고려)
        """
        if not self.client:
            return False

        try:
            result = self.client.table("users").select(
                "credits, credits_used_this_month, credits_reserved, plan"
            ).eq("id", user_id).single().execute()

            if result.data:
                remaining = self._calculate_remaining(result.data)
                return remaining >= amount

            return False
        except Exception as e:
            logger.error(f"Failed to check credit: {e}")
            return False

    def reserve(
        self,
        user_id: str,
        job_id: str,
        amount: int = 1
    ) -> CreditResult:
        """
        크레딧 예약 (처리 시작 전 호출)

        - credits_reserved 필드 증가
        - credit_reservations 테이블에 기록
        """
        if not self.client:
            return CreditResult(success=False, error="Client not initialized")

        try:
            # 1. 현재 크레딧 확인
            user_result = self.client.table("users").select(
                "credits, credits_used_this_month, credits_reserved, plan"
            ).eq("id", user_id).single().execute()

            if not user_result.data:
                return CreditResult(success=False, error="User not found")

            user_data = user_result.data
            remaining = self._calculate_remaining(user_data)

            if remaining < amount:
                return CreditResult(
                    success=False,
                    remaining_credits=remaining,
                    error="Insufficient credits"
                )

            # 2. credits_reserved 증가
            current_reserved = user_data.get("credits_reserved", 0)
            self.client.table("users").update({
                "credits_reserved": current_reserved + amount
            }).eq("id", user_id).execute()

            # 3. 예약 기록 생성
            reservation_result = self.client.table("credit_reservations").insert({
                "user_id": user_id,
                "job_id": job_id,
                "amount": amount,
                "status": "reserved"
            }).execute()

            reservation_id = reservation_result.data[0]["id"] if reservation_result.data else None

            # 4. 트랜잭션 로그
            self._log_transaction(
                user_id=user_id,
                transaction_type=CreditTransactionType.RESERVE,
                amount=-amount,
                description=f"크레딧 예약 (job: {job_id})",
                job_id=job_id,
                reservation_id=reservation_id
            )

            logger.info(f"Credit reserved: user={user_id}, job={job_id}, amount={amount}")

            return CreditResult(
                success=True,
                reservation_id=reservation_id,
                remaining_credits=remaining - amount
            )

        except Exception as e:
            logger.error(f"Failed to reserve credit: {e}")
            return CreditResult(success=False, error=str(e))

    def confirm(
        self,
        user_id: str,
        job_id: str,
        reservation_id: Optional[str] = None,
        candidate_id: Optional[str] = None
    ) -> CreditResult:
        """
        크레딧 확정 (처리 성공 시 호출)

        - credits_reserved 감소
        - credits_used_this_month 증가 (또는 credits 감소)
        """
        if not self.client:
            return CreditResult(success=False, error="Client not initialized")

        try:
            # 1. 예약 정보 확인
            if reservation_id:
                res_result = self.client.table("credit_reservations").select(
                    "*"
                ).eq("id", reservation_id).single().execute()

                if not res_result.data or res_result.data.get("status") != "reserved":
                    logger.warning(f"Reservation not found or already processed: {reservation_id}")

            # 2. 사용자 정보 조회
            user_result = self.client.table("users").select(
                "credits, credits_used_this_month, credits_reserved, plan"
            ).eq("id", user_id).single().execute()

            if not user_result.data:
                return CreditResult(success=False, error="User not found")

            user_data = user_result.data
            current_reserved = user_data.get("credits_reserved", 0)
            current_credits = user_data.get("credits", 0)
            current_used = user_data.get("credits_used_this_month", 0)

            # 3. 크레딧 차감 (추가 크레딧 우선 사용)
            update_data = {
                "credits_reserved": max(0, current_reserved - 1)
            }

            if current_credits > 0:
                # 추가 구매 크레딧에서 차감
                update_data["credits"] = current_credits - 1
            else:
                # 기본 크레딧 사용량 증가
                update_data["credits_used_this_month"] = current_used + 1

            self.client.table("users").update(update_data).eq("id", user_id).execute()

            # 4. 예약 상태 업데이트
            if reservation_id:
                self.client.table("credit_reservations").update({
                    "status": "confirmed",
                    "confirmed_at": datetime.utcnow().isoformat()
                }).eq("id", reservation_id).execute()

            # 5. 트랜잭션 로그
            self._log_transaction(
                user_id=user_id,
                transaction_type=CreditTransactionType.CONFIRM,
                amount=-1,
                description=f"크레딧 확정 (job: {job_id})",
                job_id=job_id,
                candidate_id=candidate_id,
                reservation_id=reservation_id
            )

            remaining = self._calculate_remaining({
                **user_data,
                "credits_reserved": max(0, current_reserved - 1),
                "credits": update_data.get("credits", current_credits),
                "credits_used_this_month": update_data.get("credits_used_this_month", current_used)
            })

            logger.info(f"Credit confirmed: user={user_id}, job={job_id}")

            return CreditResult(
                success=True,
                reservation_id=reservation_id,
                remaining_credits=remaining
            )

        except Exception as e:
            logger.error(f"Failed to confirm credit: {e}")
            return CreditResult(success=False, error=str(e))

    def release(
        self,
        user_id: str,
        job_id: str,
        reservation_id: Optional[str] = None,
        reason: str = "처리 실패"
    ) -> CreditResult:
        """
        크레딧 해제 (처리 실패 시 호출)

        - credits_reserved 감소 (예약만 해제, 실제 차감 없음)
        """
        if not self.client:
            return CreditResult(success=False, error="Client not initialized")

        try:
            # 1. 사용자 정보 조회
            user_result = self.client.table("users").select(
                "credits, credits_used_this_month, credits_reserved, plan"
            ).eq("id", user_id).single().execute()

            if not user_result.data:
                return CreditResult(success=False, error="User not found")

            user_data = user_result.data
            current_reserved = user_data.get("credits_reserved", 0)

            # 2. 예약 해제 (credits_reserved 감소만)
            if current_reserved > 0:
                self.client.table("users").update({
                    "credits_reserved": current_reserved - 1
                }).eq("id", user_id).execute()

            # 3. 예약 상태 업데이트
            if reservation_id:
                self.client.table("credit_reservations").update({
                    "status": "released",
                    "released_at": datetime.utcnow().isoformat(),
                    "release_reason": reason
                }).eq("id", reservation_id).execute()

            # 4. 트랜잭션 로그
            self._log_transaction(
                user_id=user_id,
                transaction_type=CreditTransactionType.RELEASE,
                amount=0,  # 실제 차감 없음
                description=f"크레딧 해제: {reason} (job: {job_id})",
                job_id=job_id,
                reservation_id=reservation_id
            )

            remaining = self._calculate_remaining({
                **user_data,
                "credits_reserved": max(0, current_reserved - 1)
            })

            logger.info(f"Credit released: user={user_id}, job={job_id}, reason={reason}")

            return CreditResult(
                success=True,
                reservation_id=reservation_id,
                remaining_credits=remaining
            )

        except Exception as e:
            logger.error(f"Failed to release credit: {e}")
            return CreditResult(success=False, error=str(e))

    def refund(
        self,
        user_id: str,
        candidate_id: str,
        amount: int = 1,
        reason: str = "관리자 환불"
    ) -> CreditResult:
        """
        크레딧 환불 (관리자용)

        - credits_used_this_month 감소
        """
        if not self.client:
            return CreditResult(success=False, error="Client not initialized")

        try:
            # 1. 사용자 정보 조회
            user_result = self.client.table("users").select(
                "credits, credits_used_this_month, credits_reserved, plan"
            ).eq("id", user_id).single().execute()

            if not user_result.data:
                return CreditResult(success=False, error="User not found")

            user_data = user_result.data
            current_used = user_data.get("credits_used_this_month", 0)

            # 2. 사용량 감소
            new_used = max(0, current_used - amount)
            self.client.table("users").update({
                "credits_used_this_month": new_used
            }).eq("id", user_id).execute()

            # 3. 트랜잭션 로그
            self._log_transaction(
                user_id=user_id,
                transaction_type=CreditTransactionType.REFUND,
                amount=amount,
                description=f"크레딧 환불: {reason}",
                candidate_id=candidate_id
            )

            remaining = self._calculate_remaining({
                **user_data,
                "credits_used_this_month": new_used
            })

            logger.info(f"Credit refunded: user={user_id}, candidate={candidate_id}, amount={amount}")

            return CreditResult(
                success=True,
                remaining_credits=remaining
            )

        except Exception as e:
            logger.error(f"Failed to refund credit: {e}")
            return CreditResult(success=False, error=str(e))

    def _log_transaction(
        self,
        user_id: str,
        transaction_type: CreditTransactionType,
        amount: int,
        description: str,
        job_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
        reservation_id: Optional[str] = None
    ) -> None:
        """크레딧 트랜잭션 로그 기록"""
        try:
            # 현재 잔액 조회
            result = self.client.table("users").select(
                "credits, credits_used_this_month, plan"
            ).eq("id", user_id).single().execute()

            if result.data:
                balance_after = self._calculate_remaining(result.data)
            else:
                balance_after = 0

            self.client.table("credit_transactions").insert({
                "user_id": user_id,
                "type": transaction_type.value,
                "amount": amount,
                "balance_after": balance_after,
                "description": description,
                "candidate_id": candidate_id,
                "metadata": {
                    "job_id": job_id,
                    "reservation_id": reservation_id
                } if job_id or reservation_id else None
            }).execute()

        except Exception as e:
            logger.error(f"Failed to log credit transaction: {e}")


# 싱글톤 인스턴스
_credit_service: Optional[CreditService] = None


def get_credit_service() -> CreditService:
    """Credit Service 싱글톤 인스턴스 반환"""
    global _credit_service
    if _credit_service is None:
        _credit_service = CreditService()
    return _credit_service
