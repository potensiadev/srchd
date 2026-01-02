-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- get_user_credits 함수 추가
-- 사용자 크레딧 정보 조회
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS TABLE (
    plan plan_type,
    base_credits INTEGER,
    credits_used INTEGER,
    bonus_credits INTEGER,
    remaining_credits INTEGER
) AS $$
DECLARE
    v_plan plan_type;
    v_credits INTEGER;
    v_credits_used INTEGER;
    v_base INTEGER;
BEGIN
    -- 사용자 정보 조회
    SELECT u.plan, u.credits, u.credits_used_this_month
    INTO v_plan, v_credits, v_credits_used
    FROM users u
    WHERE u.id = p_user_id;

    -- 플랜별 기본 크레딧
    v_base := CASE v_plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50
    END;

    RETURN QUERY SELECT
        v_plan AS plan,
        v_base AS base_credits,
        v_credits_used AS credits_used,
        v_credits AS bonus_credits,
        (v_base - v_credits_used + v_credits) AS remaining_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
