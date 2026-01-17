-- 0. Ensure users table exists (Safety check)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS just in case
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 0.1 Ensure required columns exist
DO $$
BEGIN
    -- signup_provider
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'signup_provider') THEN
        ALTER TABLE public.users ADD COLUMN signup_provider TEXT DEFAULT 'email';
    END IF;

    -- consents_completed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'consents_completed') THEN
        ALTER TABLE public.users ADD COLUMN consents_completed BOOLEAN DEFAULT false;
    END IF;
END $$;


-- 1. Create handle_new_user function and trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_provider TEXT;
    v_existing_user_id UUID;
BEGIN
    -- Provider determination
    v_provider := COALESCE(
        NEW.raw_app_meta_data->>'provider',
        'email'
    );

    -- Check for existing email collision
    SELECT id INTO v_existing_user_id
    FROM public.users
    WHERE email = NEW.email
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Insert new user
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

-- 2. Create Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Add INSERT policy for users table (Safety net for client-side creation)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
ON public.users
FOR INSERT
WITH CHECK (id = auth.uid());
