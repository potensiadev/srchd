-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 004: Monthly Credit Reset
-- 월별 크레딧 사용량 리셋 시스템
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 마지막 리셋 날짜 추적 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;

-- 기존 사용자는 현재 월 초로 설정
UPDATE users
SET billing_cycle_start = date_trunc('month', CURRENT_DATE)::date,
    credits_reset_at = date_trunc('month', CURRENT_TIMESTAMP)
WHERE billing_cycle_start IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 월별 크레딧 리셋 함수
-- 매월 1일 자정에 호출되어야 함 (pg_cron 또는 외부 스케줄러)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS JSON AS $$
DECLARE
    v_reset_count INTEGER := 0;
    v_current_month DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
    -- 이번 달에 아직 리셋되지 않은 사용자만 리셋
    UPDATE users
    SET
        credits_used_this_month = 0,
        credits_reset_at = NOW(),
        billing_cycle_start = v_current_month
    WHERE
        billing_cycle_start IS NULL
        OR billing_cycle_start < v_current_month;

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    -- 리셋 로그 기록 (credit_transactions 테이블 활용)
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
    SELECT
        id,
        'adjustment',
        0,
        credits,
        '월별 크레딧 리셋 (' || to_char(v_current_month, 'YYYY-MM') || ')'
    FROM users
    WHERE credits_reset_at >= NOW() - INTERVAL '5 minutes';  -- 방금 리셋된 사용자만

    RETURN json_build_object(
        'success', true,
        'reset_count', v_reset_count,
        'reset_month', to_char(v_current_month, 'YYYY-MM'),
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 개별 사용자 크레딧 리셋 체크 함수
-- API 호출 시 자동으로 월이 바뀌었는지 체크하고 리셋
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION check_and_reset_user_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_billing_cycle DATE;
    v_current_month DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
    -- 현재 billing cycle 조회
    SELECT billing_cycle_start INTO v_billing_cycle
    FROM users
    WHERE id = p_user_id;

    -- 새 달이면 리셋
    IF v_billing_cycle IS NULL OR v_billing_cycle < v_current_month THEN
        UPDATE users
        SET
            credits_used_this_month = 0,
            credits_reset_at = NOW(),
            billing_cycle_start = v_current_month
        WHERE id = p_user_id;

        -- 리셋 로그
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
        SELECT id, 'adjustment', 0, credits, '월별 크레딧 자동 리셋'
        FROM users WHERE id = p_user_id;

        RETURN TRUE;  -- 리셋됨
    END IF;

    RETURN FALSE;  -- 리셋 불필요
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 크레딧 잔여량 조회 함수 (리셋 체크 포함)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
    v_base_credits INTEGER;
    v_remaining INTEGER;
    v_was_reset BOOLEAN;
BEGIN
    -- 월 변경 시 자동 리셋
    SELECT check_and_reset_user_credits(p_user_id) INTO v_was_reset;

    -- 사용자 정보 조회
    SELECT plan, credits, credits_used_this_month, billing_cycle_start
    INTO v_user
    FROM users
    WHERE id = p_user_id;

    -- 플랜별 기본 크레딧
    v_base_credits := CASE v_user.plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50
    END;

    -- 남은 크레딧 계산
    v_remaining := (v_base_credits - v_user.credits_used_this_month) + v_user.credits;

    RETURN json_build_object(
        'plan', v_user.plan,
        'base_credits', v_base_credits,
        'additional_credits', v_user.credits,
        'used_this_month', v_user.credits_used_this_month,
        'remaining', GREATEST(0, v_remaining),
        'billing_cycle_start', v_user.billing_cycle_start,
        'was_reset', v_was_reset
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- deduct_credit 함수 수정 (월 리셋 체크 추가)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION deduct_credit(
    p_user_id UUID,
    p_candidate_id UUID,
    p_description TEXT DEFAULT '이력서 분석'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_credits INTEGER;
    v_credits_used INTEGER;
    v_plan plan_type;
    v_base_credits INTEGER;
BEGIN
    -- 월 변경 시 자동 리셋
    PERFORM check_and_reset_user_credits(p_user_id);

    -- 현재 크레딧 조회
    SELECT credits, credits_used_this_month, plan
    INTO v_credits, v_credits_used, v_plan
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    -- 플랜별 기본 크레딧
    v_base_credits := CASE v_plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50
    END;

    -- 크레딧 부족 체크
    IF (v_base_credits - v_credits_used) <= 0 AND v_credits <= 0 THEN
        RETURN FALSE;
    END IF;

    -- 차감 (기본 크레딧 우선, 그 다음 추가 크레딧)
    IF (v_base_credits - v_credits_used) > 0 THEN
        UPDATE users
        SET credits_used_this_month = credits_used_this_month + 1
        WHERE id = p_user_id;
    ELSE
        UPDATE users
        SET credits = credits - 1
        WHERE id = p_user_id;
    END IF;

    -- 트랜잭션 기록
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, candidate_id)
    SELECT
        p_user_id,
        'usage',
        -1,
        CASE WHEN (v_base_credits - v_credits_used) > 0
            THEN v_credits
            ELSE v_credits - 1
        END,
        p_description,
        p_candidate_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- pg_cron 스케줄링 (Supabase Pro 플랜에서 사용 가능)
-- 무료 플랜은 외부 스케줄러 또는 API 호출 필요
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- pg_cron 확장 활성화 (Supabase Pro에서만)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매월 1일 00:00 (KST = UTC+9) 실행
-- SELECT cron.schedule(
--     'monthly-credit-reset',
--     '0 15 1 * *',  -- UTC 15:00 = KST 00:00
--     $$SELECT reset_monthly_credits()$$
-- );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 코멘트
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON FUNCTION reset_monthly_credits() IS '전체 사용자 월별 크레딧 리셋 (매월 1일 실행)';
COMMENT ON FUNCTION check_and_reset_user_credits(UUID) IS '개별 사용자 크레딧 리셋 체크 (API 호출 시 자동)';
COMMENT ON FUNCTION get_user_credits(UUID) IS '사용자 크레딧 조회 (자동 리셋 포함)';
COMMENT ON COLUMN users.credits_reset_at IS '마지막 크레딧 리셋 시각';
COMMENT ON COLUMN users.billing_cycle_start IS '현재 빌링 사이클 시작일';
