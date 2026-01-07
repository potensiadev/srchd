-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 018: User-specific Billing Cycle Reset
-- 사용자별 플랜 시작일 기준 1개월 주기 크레딧 리셋
--
-- 변경 사항:
-- - 모든 사용자가 매월 1일에 리셋 → 각 사용자의 가입일 기준 1개월 후 리셋
-- - 예: 1월 15일 가입 → 2월 15일 리셋 → 3월 15일 리셋
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 필요한 컬럼 추가 (없으면 생성)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- billing_cycle_start 컬럼 추가 (004 마이그레이션에서 생성되었을 수 있음)
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at DATE;

-- 기존 사용자: plan_started_at이 없으면 created_at 날짜로 설정
UPDATE users
SET plan_started_at = created_at::date
WHERE plan_started_at IS NULL;

-- 기존 사용자: billing_cycle_start 설정
-- created_at 기준으로 현재 빌링 사이클 시작일 계산
UPDATE users
SET billing_cycle_start = (
    -- created_at의 일(day)을 기준으로 현재 또는 이전 빌링 사이클 시작일 계산
    CASE
        -- 현재 월의 해당 일이 이미 지났으면 현재 월의 해당 일
        WHEN EXTRACT(DAY FROM CURRENT_DATE) >= EXTRACT(DAY FROM created_at)
        THEN DATE_TRUNC('month', CURRENT_DATE) + (EXTRACT(DAY FROM created_at) - 1 || ' days')::INTERVAL
        -- 아직 안 지났으면 이전 월의 해당 일
        ELSE DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' + (EXTRACT(DAY FROM created_at) - 1 || ' days')::INTERVAL
    END
)::DATE
WHERE billing_cycle_start IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 개별 사용자 크레딧 리셋 체크 함수 (1 month 주기)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION check_and_reset_user_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_billing_cycle DATE;
    v_plan_started_at DATE;
    v_next_reset_date DATE;
BEGIN
    -- 현재 billing cycle과 plan 시작일 조회
    SELECT billing_cycle_start, plan_started_at
    INTO v_billing_cycle, v_plan_started_at
    FROM users
    WHERE id = p_user_id;

    -- billing_cycle_start가 NULL이면 plan_started_at 또는 오늘로 설정
    IF v_billing_cycle IS NULL THEN
        v_billing_cycle := COALESCE(v_plan_started_at, CURRENT_DATE);

        UPDATE users
        SET billing_cycle_start = v_billing_cycle,
            plan_started_at = COALESCE(plan_started_at, CURRENT_DATE)
        WHERE id = p_user_id;
    END IF;

    -- 다음 리셋 날짜 계산 (billing_cycle_start + 1 month)
    v_next_reset_date := v_billing_cycle + INTERVAL '1 month';

    -- 현재 날짜가 다음 리셋 날짜 이상이면 리셋
    IF CURRENT_DATE >= v_next_reset_date THEN
        UPDATE users
        SET
            credits_used_this_month = 0,
            credits_reset_at = NOW(),
            -- 새 빌링 사이클: 이전 + 1 month (날짜 유지)
            billing_cycle_start = v_billing_cycle + INTERVAL '1 month'
        WHERE id = p_user_id;

        -- 리셋 로그
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
        SELECT id, 'adjustment', 0, credits,
               '월별 크레딧 자동 리셋 (빌링 사이클: ' || to_char(v_billing_cycle + INTERVAL '1 month', 'YYYY-MM-DD') || ')'
        FROM users WHERE id = p_user_id;

        RETURN TRUE;  -- 리셋됨
    END IF;

    RETURN FALSE;  -- 리셋 불필요
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 크레딧 잔여량 조회 함수 (다음 리셋일 정보 추가)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
    v_base_credits INTEGER;
    v_remaining INTEGER;
    v_was_reset BOOLEAN;
    v_next_reset_date DATE;
BEGIN
    -- 월 변경 시 자동 리셋
    SELECT check_and_reset_user_credits(p_user_id) INTO v_was_reset;

    -- 사용자 정보 조회
    SELECT plan, credits, credits_used_this_month, billing_cycle_start, plan_started_at
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

    -- 다음 리셋일 계산
    v_next_reset_date := v_user.billing_cycle_start + INTERVAL '1 month';

    RETURN json_build_object(
        'plan', v_user.plan,
        'base_credits', v_base_credits,
        'additional_credits', v_user.credits,
        'used_this_month', v_user.credits_used_this_month,
        'remaining', GREATEST(0, v_remaining),
        'billing_cycle_start', v_user.billing_cycle_start,
        'next_reset_date', v_next_reset_date,
        'plan_started_at', v_user.plan_started_at,
        'was_reset', v_was_reset
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- deduct_credit 함수 수정 (빌링 사이클 기반 리셋 체크)
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
    -- 빌링 사이클 기반 자동 리셋
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
-- 전체 사용자 리셋 함수 (스케줄러용) - 각 사용자 빌링 사이클 기준
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS JSON AS $$
DECLARE
    v_reset_count INTEGER := 0;
    v_user RECORD;
BEGIN
    -- 빌링 사이클이 지난 모든 사용자 리셋
    FOR v_user IN
        SELECT id
        FROM users
        WHERE billing_cycle_start + INTERVAL '1 month' <= CURRENT_DATE
    LOOP
        PERFORM check_and_reset_user_credits(v_user.id);
        v_reset_count := v_reset_count + 1;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'reset_count', v_reset_count,
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 코멘트
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON COLUMN users.plan_started_at IS '플랜 최초 시작일 (빌링 사이클 기준일)';
COMMENT ON COLUMN users.billing_cycle_start IS '현재 빌링 사이클 시작일 (매 사이클마다 +1 month)';
COMMENT ON FUNCTION check_and_reset_user_credits(UUID) IS '개별 사용자 빌링 사이클 기반 크레딧 리셋 (1 month 주기)';
COMMENT ON FUNCTION get_user_credits(UUID) IS '사용자 크레딧 조회 (다음 리셋일 포함)';
