-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 가입 방법 추적을 위한 signup_provider 컬럼 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. signup_provider 컬럼 추가
ALTER TABLE users
ADD COLUMN IF NOT EXISTS signup_provider TEXT DEFAULT 'email';

-- 2. 컬럼 설명 추가
COMMENT ON COLUMN users.signup_provider IS '최초 가입 방법 (email, google, etc.)';

-- 3. 기존 트리거 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 4. 새로운 트리거 함수 (signup_provider 저장)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_provider TEXT;
    v_existing_user_id UUID;
BEGIN
    -- Provider 결정: Google OAuth vs Email
    -- auth.users의 raw_app_meta_data에서 provider 확인
    v_provider := COALESCE(
        NEW.raw_app_meta_data->>'provider',
        'email'
    );

    -- 동일 이메일의 기존 사용자가 있는지 확인
    SELECT id INTO v_existing_user_id
    FROM public.users
    WHERE email = NEW.email
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
        -- 기존 사용자가 있으면 새 레코드 생성하지 않음
        -- (Supabase가 auth.identities로 연결 처리)
        RETURN NEW;
    END IF;

    -- 새 사용자 생성
    INSERT INTO public.users (
        id,
        email,
        name,
        avatar_url,
        signup_provider
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name'
        ),
        NEW.raw_user_meta_data->>'avatar_url',
        v_provider
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 트리거 재생성
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 6. 기존 사용자의 signup_provider 업데이트 (추정)
-- Google 사용자: avatar_url이 googleusercontent.com 포함
UPDATE users
SET signup_provider = 'google'
WHERE avatar_url LIKE '%googleusercontent.com%'
  AND signup_provider = 'email';
