-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 030: Subscription Refund Infrastructure
-- 구독 환불 시스템 마이그레이션
--
-- PRD: prd_refund_policy_v0.4.md Section 5, 6
-- QA: refund_policy_test_scenarios_v1.0.md (EC-061 ~ EC-070)
--
-- 변경 사항:
-- 1. refund_requests 테이블 생성
-- 2. subscription_refund_type ENUM 생성
-- 3. 구독 환불 처리 RPC 함수 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ENUM 타입 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 환불 유형
DO $$
BEGIN
    CREATE TYPE refund_type AS ENUM (
        'full',           -- 전액 환불 (7일 이내)
        'prorata',        -- Pro-rata 부분 환불
        'quality',        -- 품질 미달 환불
        'service_credit'  -- 서비스 크레딧 보상
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 환불 상태
DO $$
BEGIN
    CREATE TYPE refund_status AS ENUM (
        'pending',    -- 처리 대기
        'processing', -- 처리 중
        'completed',  -- 완료
        'failed',     -- 실패
        'rejected'    -- 거부 (80% 초과 사용 등)
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. refund_requests 테이블 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 환불 유형 및 상태
    refund_type refund_type NOT NULL,
    status refund_status DEFAULT 'pending',

    -- 금액 정보
    original_amount INTEGER NOT NULL,        -- 원결제 금액 (원)
    refund_amount INTEGER NOT NULL,          -- 환불 금액 (원)
    currency VARCHAR(3) DEFAULT 'KRW',

    -- 구독 정보
    subscription_id VARCHAR(255),            -- Paddle subscription ID
    transaction_id VARCHAR(255),             -- Paddle transaction ID
    plan VARCHAR(50),                        -- 환불 대상 플랜

    -- 계산 상세
    calculation_details JSONB DEFAULT '{}',  -- {remaining_days, total_days, usage_rate, adjustment_factor, used_credits, etc.}

    -- Paddle 환불 정보
    paddle_refund_id VARCHAR(255),           -- Paddle refund ID
    paddle_response JSONB,                   -- Paddle API 응답

    -- 처리 정보
    reason TEXT,                             -- 환불 사유
    admin_note TEXT,                         -- 관리자 메모
    processed_at TIMESTAMPTZ,                -- 처리 완료 시각
    processed_by VARCHAR(255),               -- 처리자 (system/admin)

    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,

    -- 메타
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_refund_requests_user_id ON refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_type ON refund_requests(refund_type);
CREATE INDEX IF NOT EXISTS idx_refund_requests_subscription ON refund_requests(subscription_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created ON refund_requests(created_at DESC);

-- 코멘트
COMMENT ON TABLE refund_requests IS '환불 요청 추적 테이블';
COMMENT ON COLUMN refund_requests.calculation_details IS 'Pro-rata 환불 계산 상세 정보';
COMMENT ON COLUMN refund_requests.paddle_refund_id IS 'Paddle Billing API 환불 ID';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. users 테이블에 구독 관련 컬럼 추가 (없으면)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_amount INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_paddle_customer ON users(paddle_customer_id) WHERE paddle_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 구독 환불 요청 생성 함수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION create_subscription_refund_request(
    p_user_id UUID,
    p_refund_type refund_type,
    p_original_amount INTEGER,
    p_refund_amount INTEGER,
    p_subscription_id VARCHAR(255),
    p_plan VARCHAR(50),
    p_calculation_details JSONB,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_request_id UUID;
    v_idempotency_key TEXT;
    v_existing_id UUID;
    v_lock_key BIGINT;
BEGIN
    -- Advisory Lock으로 동시 요청 방지
    v_lock_key := hashtext('subscription_refund_' || p_user_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Idempotency key 생성
    v_idempotency_key := 'subscription_refund_' || p_subscription_id || '_' || date_trunc('day', NOW())::TEXT;

    -- 이미 처리된 환불인지 확인
    SELECT id INTO v_existing_id
    FROM refund_requests
    WHERE idempotency_key = v_idempotency_key
      AND status IN ('pending', 'processing', 'completed');

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'request_id', v_existing_id,
            'message', 'Refund request already exists'
        );
    END IF;

    -- 환불 요청 생성
    INSERT INTO refund_requests (
        user_id,
        refund_type,
        status,
        original_amount,
        refund_amount,
        subscription_id,
        plan,
        calculation_details,
        reason,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_refund_type,
        'pending',
        p_original_amount,
        p_refund_amount,
        p_subscription_id,
        p_plan,
        p_calculation_details,
        p_reason,
        v_idempotency_key
    ) RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'request_id', v_request_id,
        'refund_amount', p_refund_amount
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 환불 요청 상태 업데이트 함수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION update_refund_request_status(
    p_request_id UUID,
    p_status refund_status,
    p_paddle_refund_id VARCHAR(255) DEFAULT NULL,
    p_paddle_response JSONB DEFAULT NULL,
    p_processed_by VARCHAR(255) DEFAULT 'system'
) RETURNS JSONB AS $$
BEGIN
    UPDATE refund_requests
    SET
        status = p_status,
        paddle_refund_id = COALESCE(p_paddle_refund_id, paddle_refund_id),
        paddle_response = COALESCE(p_paddle_response, paddle_response),
        processed_at = CASE WHEN p_status IN ('completed', 'failed', 'rejected') THEN NOW() ELSE processed_at END,
        processed_by = p_processed_by,
        updated_at = NOW()
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund request not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', p_status::TEXT
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. RLS 정책
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 환불 요청만 조회 가능
DROP POLICY IF EXISTS refund_requests_select ON refund_requests;
CREATE POLICY refund_requests_select ON refund_requests
    FOR SELECT USING (user_id = auth.uid());

-- 환불 요청 생성은 RPC를 통해서만 가능 (SECURITY DEFINER)

COMMENT ON FUNCTION create_subscription_refund_request IS '구독 환불 요청 생성 (Idempotent + Advisory Lock)';
COMMENT ON FUNCTION update_refund_request_status IS '환불 요청 상태 업데이트';
