-- Migration: 013_credit_reservation.sql
-- 크레딧 예약 패턴 지원

-- 1. users 테이블에 credits_reserved 컬럼 추가
ALTER TABLE users
ADD COLUMN IF NOT EXISTS credits_reserved INTEGER DEFAULT 0;

COMMENT ON COLUMN users.credits_reserved IS '현재 예약된 크레딧 수 (처리 중인 작업)';

-- 2. credit_reservations 테이블 생성
CREATE TABLE IF NOT EXISTS credit_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved',  -- reserved, confirmed, released
    release_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('reserved', 'confirmed', 'released'))
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_id ON credit_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_job_id ON credit_reservations(job_id);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(status);

COMMENT ON TABLE credit_reservations IS '크레딧 예약 기록 (처리 시작 시 예약, 완료/실패 시 확정/해제)';

-- 3. credit_transactions 테이블에 metadata 컬럼 추가 (없는 경우)
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 4. 예약된 크레딧 포함 잔액 계산 함수
CREATE OR REPLACE FUNCTION get_available_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_credits INTEGER;
    v_used INTEGER;
    v_reserved INTEGER;
    v_plan VARCHAR;
    v_base INTEGER;
    v_remaining INTEGER;
BEGIN
    SELECT credits, credits_used_this_month, credits_reserved, plan
    INTO v_credits, v_used, v_reserved, v_plan
    FROM users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- 플랜별 기본 크레딧
    v_base := CASE v_plan
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50  -- starter
    END;

    -- 가용 크레딧 = (기본 - 사용량 - 예약량) + 추가 크레딧
    v_remaining := GREATEST(0, v_base - v_used - COALESCE(v_reserved, 0)) + COALESCE(v_credits, 0);

    RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 만료된 예약 자동 해제 함수 (30분 이상 된 예약)
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_reservation RECORD;
BEGIN
    FOR v_reservation IN
        SELECT id, user_id, amount
        FROM credit_reservations
        WHERE status = 'reserved'
        AND created_at < NOW() - INTERVAL '30 minutes'
    LOOP
        -- 예약 상태 업데이트
        UPDATE credit_reservations
        SET status = 'released',
            released_at = NOW(),
            release_reason = '시간 초과로 자동 해제'
        WHERE id = v_reservation.id;

        -- 사용자의 reserved 크레딧 감소
        UPDATE users
        SET credits_reserved = GREATEST(0, credits_reserved - v_reservation.amount)
        WHERE id = v_reservation.user_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS 정책
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 예약만 조회 가능
CREATE POLICY "Users can view own reservations"
    ON credit_reservations FOR SELECT
    USING (user_id = auth.uid());

-- Service Role만 삽입/수정 가능
CREATE POLICY "Service role can manage reservations"
    ON credit_reservations FOR ALL
    USING (auth.role() = 'service_role');
