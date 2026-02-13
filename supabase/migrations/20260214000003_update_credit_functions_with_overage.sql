-- ============================================================
-- PRD v0.1 Section 6.2, 10: Credit Functions Update for Overage
-- Updates credit functions to handle overage billing reset
-- ============================================================

-- ----
-- 1. UPDATE check_and_reset_user_credits TO RESET OVERAGE
-- ----

CREATE OR REPLACE FUNCTION check_and_reset_user_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_billing_cycle DATE;
    v_plan_started_at DATE;
    v_next_reset_date DATE;
    v_overage_used INTEGER;
BEGIN
    -- 현재 billing cycle과 plan 시작일 조회
    SELECT billing_cycle_start, plan_started_at, overage_used_this_month
    INTO v_billing_cycle, v_plan_started_at, v_overage_used
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

    -- 다음 리셋 일자 계산 (billing_cycle_start + 1 month)
    v_next_reset_date := v_billing_cycle + INTERVAL '1 month';

    -- 현재 일자가 다음 리셋 일자 이상이면 리셋
    IF CURRENT_DATE >= v_next_reset_date THEN
        UPDATE users
        SET
            credits_used_this_month = 0,
            overage_used_this_month = 0,  -- PRD Section 10: Overage도 함께 리셋
            credits_reset_at = NOW(),
            -- 새 빌링 사이클: 이전 + 1 month (일자 유지)
            billing_cycle_start = v_billing_cycle + INTERVAL '1 month'
        WHERE id = p_user_id;

        -- 리셋 로그 (overage 포함)
        INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
        SELECT id, 'adjustment', 0, credits,
               'Monthly credit reset (cycle: ' || to_char(v_billing_cycle + INTERVAL '1 month', 'YYYY-MM-DD') || ')' ||
               CASE WHEN v_overage_used > 0
                    THEN ' - Overage used: ' || v_overage_used || ' credits'
                    ELSE ''
               END
        FROM users WHERE id = p_user_id;

        RETURN TRUE;  -- 리셋됨
    END IF;

    RETURN FALSE;  -- 리셋 불필요
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----
-- 2. UPDATE get_user_credits TO INCLUDE OVERAGE INFO
-- ----

DROP FUNCTION IF EXISTS get_user_credits(UUID);
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
    v_base_credits INTEGER;
    v_remaining INTEGER;
    v_was_reset BOOLEAN;
    v_next_reset_date DATE;
BEGIN
    -- 먼저 자동 리셋 체크
    SELECT check_and_reset_user_credits(p_user_id) INTO v_was_reset;

    -- 사용자 정보 조회 (overage 필드 포함)
    SELECT
        plan, credits, credits_used_this_month, billing_cycle_start, plan_started_at,
        COALESCE(overage_enabled, FALSE) AS overage_enabled,
        COALESCE(overage_limit, 100) AS overage_limit,
        COALESCE(overage_used_this_month, 0) AS overage_used_this_month
    INTO v_user
    FROM users
    WHERE id = p_user_id;

    -- 플랜별 기본 크레딧
    v_base_credits := CASE v_user.plan
        WHEN 'starter' THEN 30   -- PRD v0.1: Starter 30 크레딧
        WHEN 'pro' THEN 200      -- PRD v0.1: Pro 200 크레딧
        WHEN 'enterprise' THEN 300
        ELSE 30
    END;

    -- 잔여 크레딧 계산
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
        'was_reset', v_was_reset,
        -- Overage 정보 추가 (PRD Section 10)
        'overage', json_build_object(
            'enabled', v_user.overage_enabled,
            'limit', v_user.overage_limit,
            'used', v_user.overage_used_this_month,
            'remaining', GREATEST(0, v_user.overage_limit - v_user.overage_used_this_month),
            'unit_price', 1500  -- PRD: 건당 1,500원
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----
-- 3. CREATE use_overage_credit FUNCTION
-- ----

CREATE OR REPLACE FUNCTION use_overage_credit(
    p_user_id UUID,
    p_candidate_id UUID,
    p_description TEXT DEFAULT 'Overage credit usage'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_plan plan_type;
    v_overage_enabled BOOLEAN;
    v_overage_limit INTEGER;
    v_overage_used INTEGER;
BEGIN
    -- Pro 플랜 + overage 활성화 여부 체크
    SELECT plan, overage_enabled, overage_limit, overage_used_this_month
    INTO v_plan, v_overage_enabled, v_overage_limit, v_overage_used
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    -- Pro 플랜만 overage 사용 가능
    IF v_plan != 'pro' THEN
        RETURN FALSE;
    END IF;

    -- Overage 활성화 여부 체크
    IF NOT COALESCE(v_overage_enabled, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- 한도 체크
    IF COALESCE(v_overage_used, 0) >= COALESCE(v_overage_limit, 100) THEN
        RETURN FALSE;
    END IF;

    -- Overage 사용량 증가
    UPDATE users
    SET overage_used_this_month = COALESCE(overage_used_this_month, 0) + 1
    WHERE id = p_user_id;

    -- 트랜잭션 기록
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, candidate_id)
    VALUES (
        p_user_id,
        'overage',
        -1,
        0,  -- overage는 별도 balance
        p_description,
        p_candidate_id
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION use_overage_credit IS 'PRD Section 10: Pro 플랜 추가 크레딧 사용 (건당 1,500원, 월말 일괄 청구)';

-- ----
-- 4. UPDATE reset_monthly_credits TO INCLUDE OVERAGE RESET
-- ----

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

-- ----
-- 5. CREATE set_overage_settings FUNCTION (API용)
-- ----

CREATE OR REPLACE FUNCTION set_overage_settings(
    p_user_id UUID,
    p_enabled BOOLEAN,
    p_limit INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_plan plan_type;
BEGIN
    -- Pro 플랜 체크
    SELECT plan INTO v_plan FROM users WHERE id = p_user_id;

    IF v_plan != 'pro' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Overage billing is only available for Pro plan'
        );
    END IF;

    -- 설정 업데이트
    UPDATE users
    SET
        overage_enabled = p_enabled,
        overage_limit = COALESCE(p_limit, overage_limit, 100)
    WHERE id = p_user_id;

    RETURN json_build_object(
        'success', true,
        'enabled', p_enabled,
        'limit', COALESCE(p_limit, 100)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_overage_settings IS 'PRD Section 10.2: Overage 설정 변경 (Pro 전용)';

-- ----
-- 6. UPDATE deduct_credit TO CHECK OVERAGE FALLBACK
-- ----

CREATE OR REPLACE FUNCTION deduct_credit(
    p_user_id UUID,
    p_candidate_id UUID,
    p_description TEXT DEFAULT 'Resume analysis'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_credits INTEGER;
    v_credits_used INTEGER;
    v_plan plan_type;
    v_base_credits INTEGER;
    v_overage_enabled BOOLEAN;
BEGIN
    -- 빌링 사이클 기준 자동 리셋
    PERFORM check_and_reset_user_credits(p_user_id);

    -- 현재 크레딧 조회
    SELECT credits, credits_used_this_month, plan, COALESCE(overage_enabled, FALSE)
    INTO v_credits, v_credits_used, v_plan, v_overage_enabled
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    -- 플랜별 기본 크레딧 (PRD v0.1 업데이트)
    v_base_credits := CASE v_plan
        WHEN 'starter' THEN 30   -- PRD v0.1: Starter 30
        WHEN 'pro' THEN 200      -- PRD v0.1: Pro 200
        WHEN 'enterprise' THEN 300
        ELSE 30
    END;

    -- 크레딧 부족 체크
    IF (v_base_credits - v_credits_used) <= 0 AND v_credits <= 0 THEN
        -- Pro 플랜이고 overage 활성화되어 있으면 overage 사용 시도
        IF v_plan = 'pro' AND v_overage_enabled THEN
            RETURN use_overage_credit(p_user_id, p_candidate_id, p_description || ' (overage)');
        END IF;
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

-- DONE
