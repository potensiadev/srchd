-- ============================================================
-- Remove Onboarding Columns & Update Trigger
-- Removes onboarding-related columns and updates trigger
-- ============================================================

-- 1. Drop index first
DROP INDEX IF EXISTS idx_users_onboarding_incomplete;

-- 2. Update handle_new_user trigger to remove onboarding columns
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_provider TEXT;
BEGIN
    -- Provider 결정: Google OAuth vs Email
    v_provider := COALESCE(
        NEW.raw_app_meta_data->>'provider',
        'email'
    );

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
        consents_completed
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
        'starter',  -- 기본 플랜
        0,          -- 기본 크레딧
        0,          -- 이번 달 사용량
        FALSE       -- 동의 미완료
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

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Remove onboarding columns
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_step;

-- DONE
