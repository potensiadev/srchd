-- =====================================================
-- Migration: 7일 무료 체험 구현
-- 회원가입 시 7일 무료 체험 기간 적용
-- =====================================================

-- 1. users 테이블에 trial_ends_at 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 기존 사용자에게 trial_ends_at 설정 (가입일 + 7일)
UPDATE users
SET trial_ends_at = created_at + INTERVAL '7 days'
WHERE trial_ends_at IS NULL;

-- 2. handle_new_user 트리거 재정의 (trial_ends_at 포함)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_provider TEXT;
    v_trial_ends_at TIMESTAMPTZ;
BEGIN
    -- Provider 결정: Google OAuth vs Email
    v_provider := COALESCE(
        NEW.raw_app_meta_data->>'provider',
        'email'
    );

    -- 7일 무료 체험 종료일 계산
    v_trial_ends_at := NOW() + INTERVAL '7 days';

    -- 새 사용자 생성 (UPSERT)
    INSERT INTO public.users (
        id,
        email,
        name,
        avatar_url,
        signup_provider,
        plan,
        credits,
        credits_used_this_month,
        trial_ends_at,
        consents_completed,
        onboarding_completed,
        onboarding_step
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name'
        ),
        NEW.raw_user_meta_data->>'avatar_url',
        v_provider,
        'starter',          -- 기본 플랜
        0,                  -- 기본 크레딧
        0,                  -- 이번 달 사용량
        v_trial_ends_at,    -- 7일 무료 체험 종료일
        FALSE,              -- 동의 미완료
        FALSE,              -- 온보딩 미완료
        0                   -- 온보딩 미시작
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[handle_new_user] Error: % - %', SQLSTATE, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 재생성
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. 무료 체험 상태 확인 함수
CREATE OR REPLACE FUNCTION is_trial_active(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_trial_ends_at TIMESTAMPTZ;
    v_subscription_status TEXT;
BEGIN
    SELECT trial_ends_at, subscription_status
    INTO v_trial_ends_at, v_subscription_status
    FROM users
    WHERE id = p_user_id;

    -- 유료 구독 중이면 체험 기간 무관
    IF v_subscription_status = 'active' THEN
        RETURN FALSE;
    END IF;

    -- 체험 종료일이 현재보다 미래면 체험 중
    RETURN v_trial_ends_at IS NOT NULL AND v_trial_ends_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 남은 체험 일수 확인 함수
CREATE OR REPLACE FUNCTION get_trial_days_remaining(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_trial_ends_at TIMESTAMPTZ;
    v_subscription_status TEXT;
BEGIN
    SELECT trial_ends_at, subscription_status
    INTO v_trial_ends_at, v_subscription_status
    FROM users
    WHERE id = p_user_id;

    -- 유료 구독 중이면 0 반환
    IF v_subscription_status = 'active' THEN
        RETURN 0;
    END IF;

    -- 체험 종료일이 없으면 0 반환
    IF v_trial_ends_at IS NULL THEN
        RETURN 0;
    END IF;

    -- 이미 종료되었으면 0 반환
    IF v_trial_ends_at <= NOW() THEN
        RETURN 0;
    END IF;

    -- 남은 일수 계산 (소수점 올림)
    RETURN CEIL(EXTRACT(EPOCH FROM (v_trial_ends_at - NOW())) / 86400);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 크레딧 사용 가능 여부 확인 함수 (체험 기간 고려)
CREATE OR REPLACE FUNCTION can_use_credit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user RECORD;
    v_base_credits INTEGER;
    v_remaining_credits INTEGER;
BEGIN
    SELECT
        plan,
        credits,
        credits_used_this_month,
        trial_ends_at,
        subscription_status
    INTO v_user
    FROM users
    WHERE id = p_user_id;

    -- 플랜별 기본 크레딧
    v_base_credits := CASE v_user.plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        ELSE 50
    END;

    -- 남은 크레딧 계산
    v_remaining_credits := GREATEST(0, v_base_credits - v_user.credits_used_this_month) + v_user.credits;

    -- 유료 구독 중이면 크레딧만 체크
    IF v_user.subscription_status = 'active' THEN
        RETURN v_remaining_credits > 0;
    END IF;

    -- 체험 기간 중이면 크레딧 사용 가능
    IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at > NOW() THEN
        RETURN v_remaining_credits > 0;
    END IF;

    -- 체험 기간 종료 후 유료 전환 안 했으면 사용 불가
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DONE
COMMENT ON COLUMN users.trial_ends_at IS '7일 무료 체험 종료일';
