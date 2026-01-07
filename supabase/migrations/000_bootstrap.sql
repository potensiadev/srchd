-- ============================================================
-- RAI Bootstrap Script (Idempotent)
-- Creates all required ENUMs, tables, and Progressive Loading
-- Safe to run multiple times
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ENUMS (Create if not exists)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN CREATE TYPE plan_type AS ENUM ('starter', 'pro', 'enterprise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE analysis_mode AS ENUM ('phase_1', 'phase_2'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE candidate_status AS ENUM ('processing', 'parsed', 'analyzed', 'completed', 'failed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE processing_status AS ENUM ('queued', 'processing', 'parsing', 'analyzing', 'completed', 'failed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE chunk_type AS ENUM ('summary', 'career', 'project', 'skill', 'education'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE feedback_type AS ENUM ('relevant', 'not_relevant', 'clicked', 'contacted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('subscription', 'usage', 'overage', 'refund', 'adjustment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add missing ENUM values for Progressive Loading
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'parsed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'candidate_status')) THEN
        ALTER TYPE candidate_status ADD VALUE 'parsed' AFTER 'processing';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'analyzed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'candidate_status')) THEN
        ALTER TYPE candidate_status ADD VALUE 'analyzed' AFTER 'parsed';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'parsing' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'processing_status')) THEN
        ALTER TYPE processing_status ADD VALUE 'parsing' AFTER 'processing';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'analyzing' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'processing_status')) THEN
        ALTER TYPE processing_status ADD VALUE 'analyzing' AFTER 'parsing';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. USERS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    plan plan_type DEFAULT 'starter',
    credits INTEGER DEFAULT 0,
    credits_used_this_month INTEGER DEFAULT 0,
    consents_completed BOOLEAN DEFAULT false,
    consents_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. USER_CONSENTS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_of_service BOOLEAN DEFAULT false,
    terms_of_service_version TEXT,
    terms_of_service_agreed_at TIMESTAMPTZ,
    privacy_policy BOOLEAN DEFAULT false,
    privacy_policy_version TEXT,
    privacy_policy_agreed_at TIMESTAMPTZ,
    third_party_data_guarantee BOOLEAN DEFAULT false,
    third_party_data_guarantee_version TEXT,
    third_party_data_guarantee_agreed_at TIMESTAMPTZ,
    marketing_consent BOOLEAN DEFAULT false,
    marketing_consent_agreed_at TIMESTAMPTZ,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. CANDIDATES TABLE (with Progressive Loading fields)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Basic info
    name TEXT NOT NULL,
    birth_year INTEGER,
    gender TEXT,

    -- Encrypted fields
    phone_encrypted BYTEA,
    email_encrypted BYTEA,
    address_encrypted BYTEA,

    -- Hash for dedup
    phone_hash TEXT,
    email_hash TEXT,

    -- Filterable fields
    skills TEXT[] DEFAULT '{}',
    exp_years INTEGER DEFAULT 0,
    last_company TEXT,
    last_position TEXT,
    education_level TEXT,
    education_school TEXT,
    education_major TEXT,
    location_city TEXT,

    -- AI generated
    summary TEXT,
    strengths TEXT[] DEFAULT '{}',
    careers JSONB DEFAULT '[]',
    projects JSONB DEFAULT '[]',
    education JSONB DEFAULT '[]',

    -- Visual assets
    photo_url TEXT,
    portfolio_thumbnail_url TEXT,
    portfolio_url TEXT,
    github_url TEXT,
    linkedin_url TEXT,

    -- Version management
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES candidates(id),
    is_latest BOOLEAN DEFAULT true,

    -- AI analysis meta
    confidence_score FLOAT DEFAULT 0,
    field_confidence JSONB,
    analysis_mode analysis_mode DEFAULT 'phase_1',
    requires_review BOOLEAN DEFAULT false,
    warnings TEXT[] DEFAULT '{}',
    risk_level TEXT,

    -- Source file info
    source_file TEXT,
    file_type TEXT,

    -- Status
    status candidate_status DEFAULT 'processing',

    -- Progressive Loading fields
    quick_extracted JSONB DEFAULT NULL,
    parsing_completed_at TIMESTAMPTZ,
    analysis_completed_at TIMESTAMPTZ,

    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. CANDIDATE_CHUNKS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS candidate_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    chunk_type chunk_type NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. PROCESSING_JOBS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id),
    status processing_status DEFAULT 'queued',
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_path TEXT,
    parse_method TEXT,
    page_count INTEGER,
    analysis_mode analysis_mode,
    confidence_score FLOAT,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. SEARCH_FEEDBACK TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS search_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    search_query TEXT NOT NULL,
    feedback_type feedback_type NOT NULL,
    result_position INTEGER,
    relevance_score FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. CREDIT_TRANSACTIONS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    candidate_id UUID REFERENCES candidates(id),
    payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_skills ON candidates USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_candidates_phone_hash ON candidates(phone_hash);
CREATE INDEX IF NOT EXISTS idx_candidates_email_hash ON candidates(email_hash);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_is_latest ON candidates(is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_candidates_user_status_latest ON candidates(user_id, status) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_candidates_status_created ON candidates(status, created_at DESC) WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_candidate_chunks_candidate_id ON candidate_chunks(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_chunks_type ON candidate_chunks(chunk_type);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);

CREATE INDEX IF NOT EXISTS idx_search_feedback_user_id ON search_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_search_feedback_candidate_id ON search_feedback(candidate_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);

-- Vector index (safe to skip if already exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_candidate_chunks_embedding') THEN
        CREATE INDEX idx_candidate_chunks_embedding ON candidate_chunks
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ROW LEVEL SECURITY
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then create
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view own consents" ON user_consents;
DROP POLICY IF EXISTS "Users can insert own consents" ON user_consents;
DROP POLICY IF EXISTS "Users can view own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can view own candidate chunks" ON candidate_chunks;
DROP POLICY IF EXISTS "Users can view own jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can manage own feedback" ON search_feedback;
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;

CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users can view own consents" ON user_consents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own consents" ON user_consents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own candidates" ON candidates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own candidates" ON candidates FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own candidates" ON candidates FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own candidates" ON candidates FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Users can view own candidate chunks" ON candidate_chunks FOR SELECT USING (candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid()));
CREATE POLICY "Users can view own jobs" ON processing_jobs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own jobs" ON processing_jobs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can manage own feedback" ON search_feedback FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (user_id = auth.uid());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP TRIGGER IF EXISTS user_consents_updated_at ON user_consents;
DROP TRIGGER IF EXISTS candidates_updated_at ON candidates;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_consents_updated_at BEFORE UPDATE ON user_consents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Credit deduction function
CREATE OR REPLACE FUNCTION deduct_credit(
    p_user_id UUID,
    p_candidate_id UUID,
    p_description TEXT DEFAULT '파일 처리'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_credits INTEGER;
    v_credits_used INTEGER;
    v_plan plan_type;
    v_base_credits INTEGER;
BEGIN
    SELECT credits, credits_used_this_month, plan
    INTO v_credits, v_credits_used, v_plan
    FROM users WHERE id = p_user_id FOR UPDATE;

    v_base_credits := CASE v_plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
    END;

    IF (v_base_credits - v_credits_used) <= 0 AND v_credits <= 0 THEN
        RETURN FALSE;
    END IF;

    IF (v_base_credits - v_credits_used) > 0 THEN
        UPDATE users SET credits_used_this_month = credits_used_this_month + 1 WHERE id = p_user_id;
    ELSE
        UPDATE users SET credits = credits - 1 WHERE id = p_user_id;
    END IF;

    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description, candidate_id)
    SELECT p_user_id, 'usage', -1,
        CASE WHEN (v_base_credits - v_credits_used) > 0 THEN v_credits ELSE v_credits - 1 END,
        p_description, p_candidate_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hybrid search function
CREATE OR REPLACE FUNCTION search_candidates(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_match_count INTEGER DEFAULT 10,
    p_exp_years_min INTEGER DEFAULT NULL,
    p_exp_years_max INTEGER DEFAULT NULL,
    p_skills TEXT[] DEFAULT NULL,
    p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID, name TEXT, last_position TEXT, last_company TEXT,
    exp_years INTEGER, skills TEXT[], photo_url TEXT, summary TEXT,
    confidence_score FLOAT, requires_review BOOLEAN, match_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_candidates AS (
        SELECT c.* FROM candidates c
        WHERE c.user_id = p_user_id AND c.is_latest = true AND c.status = 'completed'
          AND (p_exp_years_min IS NULL OR c.exp_years >= p_exp_years_min)
          AND (p_exp_years_max IS NULL OR c.exp_years <= p_exp_years_max)
          AND (p_skills IS NULL OR c.skills && p_skills)
          AND (p_location IS NULL OR c.location_city ILIKE '%' || p_location || '%')
    ),
    chunk_scores AS (
        SELECT cc.candidate_id,
            MAX((1 - (cc.embedding <=> p_query_embedding)) *
                CASE cc.chunk_type WHEN 'summary' THEN 1.0 WHEN 'career' THEN 0.9
                    WHEN 'skill' THEN 0.85 WHEN 'project' THEN 0.8 WHEN 'education' THEN 0.5 END
            ) AS weighted_score
        FROM candidate_chunks cc
        WHERE cc.candidate_id IN (SELECT fc.id FROM filtered_candidates fc)
        GROUP BY cc.candidate_id
    )
    SELECT fc.id, fc.name, fc.last_position, fc.last_company, fc.exp_years, fc.skills,
           fc.photo_url, fc.summary, fc.confidence_score, fc.requires_review,
           COALESCE(cs.weighted_score, 0) AS match_score
    FROM filtered_candidates fc
    LEFT JOIN chunk_scores cs ON fc.id = cs.candidate_id
    ORDER BY match_score DESC LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- REALTIME (for Progressive Loading)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'candidates') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
        END IF;
    END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DONE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON TABLE candidates IS 'Candidates with Progressive Loading support';
