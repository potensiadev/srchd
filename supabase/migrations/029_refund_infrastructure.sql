-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 029: Refund Infrastructure
-- 환불 시스템 인프라 마이그레이션
--
-- PRD: prd_refund_policy_v0.4.md Section 2.3
-- QA: refund_policy_test_scenarios_v1.0.md (EC-031 ~ EC-040, EC-071 ~ EC-080)
--
-- 변경 사항:
-- 1. candidate_status ENUM에 'refunded', 'deleted' 추가
-- 2. candidates 테이블에 Soft Delete 컬럼 추가
-- 3. credit_transactions 테이블 환불 추적 컬럼 추가
-- 4. processing_jobs FK 설정 변경 (ON DELETE SET NULL)
-- 5. processing_status ENUM에 'refunded' 추가
-- 6. 환불 관련 인덱스 추가
-- 7. process_quality_refund RPC 함수 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ENUM 값 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- candidate_status에 'refunded', 'deleted' 추가
DO $$
BEGIN
    -- refunded 추가
    BEGIN
        ALTER TYPE candidate_status ADD VALUE 'refunded';
    EXCEPTION WHEN duplicate_object THEN
        -- 이미 존재하면 무시
        NULL;
    END;

    -- deleted 추가
    BEGIN
        ALTER TYPE candidate_status ADD VALUE 'deleted';
    EXCEPTION WHEN duplicate_object THEN
        -- 이미 존재하면 무시
        NULL;
    END;
END $$;

-- processing_status에 'refunded' 추가
DO $$
BEGIN
    ALTER TYPE processing_status ADD VALUE 'refunded';
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. candidates 테이블 Soft Delete 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(50);

COMMENT ON COLUMN candidates.deleted_at IS '소프트 삭제 시각';
COMMENT ON COLUMN candidates.delete_reason IS '삭제 사유: quality_refund, user_request, admin';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. credit_transactions 테이블 환불 추적 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(50),
ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES credit_transactions(id),
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- idempotency_key UNIQUE 제약조건 (NULL 허용)
-- PostgreSQL에서 UNIQUE는 NULL을 여러 개 허용하므로 괜찮음
DO $$
BEGIN
    ALTER TABLE credit_transactions
    ADD CONSTRAINT credit_transactions_idempotency_key_unique UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON COLUMN credit_transactions.refund_reason IS '환불 사유: quality_fail, upload_fail, user_cancel, cs_request';
COMMENT ON COLUMN credit_transactions.original_transaction_id IS '원거래 ID (환불 시)';
COMMENT ON COLUMN credit_transactions.idempotency_key IS '중복 환불 방지 키';
COMMENT ON COLUMN credit_transactions.metadata IS '환불 관련 메타데이터 (confidence_score, missing_fields 등)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. processing_jobs FK 설정 (ON DELETE SET NULL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 기존 FK 제약조건 삭제 (있으면)
ALTER TABLE processing_jobs
DROP CONSTRAINT IF EXISTS processing_jobs_candidate_id_fkey;

-- 새 FK 제약조건 추가 (ON DELETE SET NULL)
ALTER TABLE processing_jobs
ADD CONSTRAINT processing_jobs_candidate_id_fkey
FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 환불 관련 인덱스
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 환불 트랜잭션 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_credit_transactions_refund
ON credit_transactions(refund_reason)
WHERE refund_reason IS NOT NULL;

-- Idempotency key 조회용 인덱스 (UNIQUE 제약조건이 이미 인덱스 생성)
-- CREATE INDEX IF NOT EXISTS idx_credit_transactions_idempotency
-- ON credit_transactions(idempotency_key)
-- WHERE idempotency_key IS NOT NULL;

-- 삭제된 후보자 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_candidates_deleted
ON candidates(deleted_at)
WHERE deleted_at IS NOT NULL;

-- 환불 상태 후보자 인덱스 (90일 후 정리용)
-- NOTE: enum 값 추가 후 별도 트랜잭션에서 실행 필요
-- 029b 마이그레이션에서 생성
-- CREATE INDEX IF NOT EXISTS idx_candidates_status_deleted
-- ON candidates(status, deleted_at)
-- WHERE status IN ('refunded', 'deleted');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. 품질 환불 처리 RPC 함수 (Atomic + Idempotent + Advisory Lock)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION process_quality_refund(
    p_candidate_id UUID,
    p_user_id UUID,
    p_job_id UUID,
    p_confidence FLOAT,
    p_missing_fields TEXT[]
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_idempotency_key TEXT;
    v_existing_refund UUID;
    v_lock_key BIGINT;
    v_balance_after INTEGER;
BEGIN
    -- ─────────────────────────────────────────────────
    -- Advisory Lock으로 동시 요청 방지
    -- EC-033, EC-034: 동시 환불 요청 처리
    -- ─────────────────────────────────────────────────
    v_lock_key := hashtext('refund_' || p_candidate_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- ─────────────────────────────────────────────────
    -- Idempotency 체크
    -- EC-031, EC-032: 중복 환불 방지
    -- ─────────────────────────────────────────────────
    v_idempotency_key := 'quality_refund_' || p_candidate_id::TEXT;

    SELECT id INTO v_existing_refund
    FROM credit_transactions
    WHERE idempotency_key = v_idempotency_key;

    IF v_existing_refund IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'Already refunded',
            'transaction_id', v_existing_refund
        );
    END IF;

    -- ─────────────────────────────────────────────────
    -- Lazy reset: 월간 크레딧 리셋 체크
    -- ─────────────────────────────────────────────────
    PERFORM check_and_reset_user_credits(p_user_id);

    -- ─────────────────────────────────────────────────
    -- 크레딧 복구 (음수 방지)
    -- EC-035, EC-036: 크레딧 경계값 처리
    -- ─────────────────────────────────────────────────
    UPDATE users
    SET credits_used_this_month = GREATEST(0, credits_used_this_month - 1)
    WHERE id = p_user_id;

    -- 현재 잔액 조회
    SELECT credits INTO v_balance_after
    FROM users
    WHERE id = p_user_id;

    -- ─────────────────────────────────────────────────
    -- 환불 트랜잭션 기록
    -- ─────────────────────────────────────────────────
    INSERT INTO credit_transactions (
        user_id,
        type,
        amount,
        balance_after,
        description,
        candidate_id,
        refund_reason,
        idempotency_key,
        metadata
    ) VALUES (
        p_user_id,
        'refund',
        1,
        COALESCE(v_balance_after, 0),
        '분석 품질 미달 자동 환불',
        p_candidate_id,
        'quality_fail',
        v_idempotency_key,
        jsonb_build_object(
            'confidence_score', p_confidence,
            'missing_fields', p_missing_fields,
            'refund_type', 'auto_quality',
            'processed_at', NOW()
        )
    );

    -- ─────────────────────────────────────────────────
    -- Candidate Soft Delete
    -- EC-037, EC-038: Soft Delete 처리
    -- ─────────────────────────────────────────────────
    UPDATE candidates
    SET
        status = 'refunded',
        deleted_at = NOW(),
        delete_reason = 'quality_refund'
    WHERE id = p_candidate_id;

    -- ─────────────────────────────────────────────────
    -- Processing Job 상태 업데이트
    -- ─────────────────────────────────────────────────
    IF p_job_id IS NOT NULL THEN
        UPDATE processing_jobs
        SET
            status = 'refunded',
            error_code = 'QUALITY_BELOW_THRESHOLD',
            error_message = 'Auto refund: confidence=' || p_confidence::TEXT ||
                           ', missing_fields=' || array_to_string(p_missing_fields, ',')
        WHERE id = p_job_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'candidate_id', p_candidate_id,
        'confidence', p_confidence,
        'missing_fields', p_missing_fields
    );

EXCEPTION WHEN OTHERS THEN
    -- EC-039, EC-040: 예외 처리
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_quality_refund(UUID, UUID, UUID, FLOAT, TEXT[]) IS
    '품질 환불 처리 (Atomic + Idempotent + Advisory Lock)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. 크레딧 예약 해제 함수 수정 (환불 사유 추가)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 기존 release_credit_reservation 함수가 있다면 환불 사유를 지원하도록 확장
-- 새 함수: release_credit_reservation_with_reason
CREATE OR REPLACE FUNCTION release_credit_reservation_with_reason(
    p_user_id UUID,
    p_job_id UUID,
    p_reason VARCHAR(50) DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_reservation_id UUID;
    v_balance_after INTEGER;
BEGIN
    -- 예약 조회
    SELECT id INTO v_reservation_id
    FROM credit_reservations
    WHERE user_id = p_user_id AND job_id = p_job_id AND status = 'reserved'
    FOR UPDATE;

    IF v_reservation_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reservation not found or already released'
        );
    END IF;

    -- Lazy reset 체크
    PERFORM check_and_reset_user_credits(p_user_id);

    -- 크레딧 복구
    UPDATE users
    SET credits_used_this_month = GREATEST(0, credits_used_this_month - 1)
    WHERE id = p_user_id;

    -- 현재 잔액 조회
    SELECT credits INTO v_balance_after FROM users WHERE id = p_user_id;

    -- 예약 상태 업데이트
    UPDATE credit_reservations
    SET status = 'released', released_at = NOW()
    WHERE id = v_reservation_id;

    -- 환불 트랜잭션 기록
    INSERT INTO credit_transactions (
        user_id,
        type,
        amount,
        balance_after,
        description,
        refund_reason
    ) VALUES (
        p_user_id,
        'refund',
        1,
        COALESCE(v_balance_after, 0),
        CASE
            WHEN p_reason = 'upload_fail' THEN '업로드 실패 크레딧 환불'
            WHEN p_reason = 'quality_fail' THEN '품질 미달 크레딧 환불'
            ELSE '크레딧 예약 해제'
        END,
        p_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'reason', p_reason
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION release_credit_reservation_with_reason(UUID, UUID, VARCHAR) IS
    '크레딧 예약 해제 (환불 사유 포함)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. RLS 정책 업데이트 (삭제된 후보자 필터링)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 기존 RLS 정책에 deleted_at 필터 추가
-- (기존 정책을 DROP하고 재생성하면 서비스 영향이 있으므로 별도 처리 필요)
-- 실제 적용 시에는 app 레벨에서 WHERE deleted_at IS NULL 조건 추가 권장
