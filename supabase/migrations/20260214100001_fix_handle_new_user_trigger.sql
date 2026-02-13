-- =====================================================
-- Migration: Fix handle_new_user Trigger
-- 신규 사용자 생성 트리거를 더 견고하게 수정
-- =====================================================

-- 기존 트리거 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 새 트리거 함수 생성
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
    -- ON CONFLICT로 중복 처리
    INSERT INTO public.users (
        id,
        email,
        name,
        avatar_url,
        signup_provider,
        plan,
        credits,
        credits_used_this_month,
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
        'starter',  -- 기본 플랜
        0,          -- 기본 크레딧
        0,          -- 이번 달 사용량
        FALSE,      -- 동의 미완료
        FALSE,      -- 온보딩 미완료
        0           -- 온보딩 미시작
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- 에러 로깅 (pg_notify 사용 가능하나 여기서는 조용히 실패)
        RAISE WARNING '[handle_new_user] Error: % - %', SQLSTATE, SQLERRM;
        -- 트리거는 반드시 NEW를 반환해야 auth.users INSERT가 성공함
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 재생성
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- DONE
