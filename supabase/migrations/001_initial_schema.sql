-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RAI v6.0 Initial Schema
-- HR Screener: Recruitment Asset Intelligence
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for embeddings

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ENUMS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TYPE plan_type AS ENUM ('starter', 'pro', 'enterprise');
CREATE TYPE analysis_mode AS ENUM ('phase_1', 'phase_2');
CREATE TYPE candidate_status AS ENUM ('processing', 'completed', 'failed', 'rejected');
CREATE TYPE processing_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'rejected');
CREATE TYPE chunk_type AS ENUM ('summary', 'career', 'project', 'skill', 'education');
CREATE TYPE feedback_type AS ENUM ('relevant', 'not_relevant', 'clicked', 'contacted');
CREATE TYPE transaction_type AS ENUM ('subscription', 'usage', 'overage', 'refund', 'adjustment');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. USERS (Supabase Auth 확장)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,

    -- 플랜 & 크레딧
    plan plan_type DEFAULT 'starter',
    credits INTEGER DEFAULT 0,
    credits_used_this_month INTEGER DEFAULT 0,

    -- 동의 상태
    consents_completed BOOLEAN DEFAULT false,
    consents_completed_at TIMESTAMPTZ,

    -- 메타
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. USER_CONSENTS (동의 기록)
-- PRD: 제3자 개인정보 처리 보증 필수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 이용약관
    terms_of_service BOOLEAN DEFAULT false,
    terms_of_service_version TEXT,
    terms_of_service_agreed_at TIMESTAMPTZ,

    -- 개인정보처리방침
    privacy_policy BOOLEAN DEFAULT false,
    privacy_policy_version TEXT,
    privacy_policy_agreed_at TIMESTAMPTZ,

    -- ⭐ 제3자 정보 보증 (핵심)
    third_party_data_guarantee BOOLEAN DEFAULT false,
    third_party_data_guarantee_version TEXT,
    third_party_data_guarantee_agreed_at TIMESTAMPTZ,

    -- 마케팅 (선택)
    marketing_consent BOOLEAN DEFAULT false,
    marketing_consent_agreed_at TIMESTAMPTZ,

    -- 메타
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. CANDIDATES (후보자 정형 데이터)
-- PRD: 암호화 필드, AI 분석 결과, 버전 관리
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 기본 정보
    name TEXT NOT NULL,
    birth_year INTEGER,
    gender TEXT,

    -- ⭐ 암호화 필드 (AES-256-GCM via pgcrypto)
    phone_encrypted BYTEA,
    email_encrypted BYTEA,
    address_encrypted BYTEA,

    -- ⭐ 검색용 해시 (SHA-256, 중복체크용)
    phone_hash TEXT,
    email_hash TEXT,

    -- 필터링용 정형 필드 (RDB 검색)
    skills TEXT[] DEFAULT '{}',
    exp_years INTEGER DEFAULT 0,
    last_company TEXT,
    last_position TEXT,
    education_level TEXT,
    location_city TEXT,

    -- AI 생성 콘텐츠
    summary TEXT,
    strengths TEXT[] DEFAULT '{}',
    careers JSONB DEFAULT '[]',
    projects JSONB DEFAULT '[]',
    education JSONB DEFAULT '[]',

    -- 시각 자산
    photo_url TEXT,
    portfolio_thumbnail_url TEXT,

    -- ⭐ 버전 관리 (중복 시 버전 스태킹)
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES candidates(id),
    is_latest BOOLEAN DEFAULT true,

    -- ⭐ AI 분석 메타 (Zero Tolerance for Error)
    confidence_score FLOAT DEFAULT 0,  -- 0-1
    analysis_mode analysis_mode DEFAULT 'phase_1',
    requires_review BOOLEAN DEFAULT false,
    warnings TEXT[] DEFAULT '{}',

    -- 상태
    status candidate_status DEFAULT 'processing',

    -- 메타
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_candidates_user_id ON candidates(user_id);
CREATE INDEX idx_candidates_skills ON candidates USING GIN(skills);
CREATE INDEX idx_candidates_phone_hash ON candidates(phone_hash);
CREATE INDEX idx_candidates_email_hash ON candidates(email_hash);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_is_latest ON candidates(is_latest) WHERE is_latest = true;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. CANDIDATE_CHUNKS (Vector 검색용 청크)
-- PRD: 청크 타입별 가중치 적용
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE candidate_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    chunk_type chunk_type NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),  -- text-embedding-3-small dimension

    -- 메타
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector 인덱스 (IVFFlat)
CREATE INDEX idx_candidate_chunks_embedding ON candidate_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_candidate_chunks_candidate_id ON candidate_chunks(candidate_id);
CREATE INDEX idx_candidate_chunks_type ON candidate_chunks(chunk_type);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. PROCESSING_JOBS (처리 작업 추적)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id),

    status processing_status DEFAULT 'queued',

    -- 파일 정보
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_path TEXT,

    -- 파싱 결과
    parse_method TEXT,
    page_count INTEGER,

    -- AI 분석 결과
    analysis_mode analysis_mode,
    confidence_score FLOAT,

    -- 에러 정보
    error_code TEXT,
    error_message TEXT,

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. SEARCH_FEEDBACK (검색 피드백 루프)
-- PRD: 검색 품질 개선용 피드백 수집
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE search_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    search_query TEXT NOT NULL,
    feedback_type feedback_type NOT NULL,
    result_position INTEGER,
    relevance_score FLOAT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_feedback_user_id ON search_feedback(user_id);
CREATE INDEX idx_search_feedback_candidate_id ON search_feedback(candidate_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. CREDIT_TRANSACTIONS (크레딧 내역)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    type transaction_type NOT NULL,
    amount INTEGER NOT NULL,  -- 양수: 충전, 음수: 사용
    balance_after INTEGER NOT NULL,
    description TEXT,

    -- 참조
    candidate_id UUID REFERENCES candidates(id),
    payment_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ROW LEVEL SECURITY (RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users Policies
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

-- User Consents Policies
CREATE POLICY "Users can view own consents"
    ON user_consents FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consents"
    ON user_consents FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Candidates Policies
CREATE POLICY "Users can view own candidates"
    ON candidates FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own candidates"
    ON candidates FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own candidates"
    ON candidates FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own candidates"
    ON candidates FOR DELETE
    USING (user_id = auth.uid());

-- Candidate Chunks Policies
CREATE POLICY "Users can view own candidate chunks"
    ON candidate_chunks FOR SELECT
    USING (
        candidate_id IN (
            SELECT id FROM candidates WHERE user_id = auth.uid()
        )
    );

-- Processing Jobs Policies
CREATE POLICY "Users can view own jobs"
    ON processing_jobs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own jobs"
    ON processing_jobs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Search Feedback Policies
CREATE POLICY "Users can manage own feedback"
    ON search_feedback FOR ALL
    USING (user_id = auth.uid());

-- Credit Transactions Policies
CREATE POLICY "Users can view own transactions"
    ON credit_transactions FOR SELECT
    USING (user_id = auth.uid());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Updated At 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 트리거 적용
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_consents_updated_at
    BEFORE UPDATE ON user_consents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 새 사용자 생성 시 users 테이블에 자동 추가
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auth 트리거
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 크레딧 차감 함수
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

-- 하이브리드 검색 함수 (RDB 필터 + Vector 검색)
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
    id UUID,
    name TEXT,
    last_position TEXT,
    last_company TEXT,
    exp_years INTEGER,
    skills TEXT[],
    photo_url TEXT,
    summary TEXT,
    confidence_score FLOAT,
    requires_review BOOLEAN,
    match_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_candidates AS (
        SELECT c.*
        FROM candidates c
        WHERE c.user_id = p_user_id
          AND c.is_latest = true
          AND c.status = 'completed'
          AND (p_exp_years_min IS NULL OR c.exp_years >= p_exp_years_min)
          AND (p_exp_years_max IS NULL OR c.exp_years <= p_exp_years_max)
          AND (p_skills IS NULL OR c.skills && p_skills)
          AND (p_location IS NULL OR c.location_city ILIKE '%' || p_location || '%')
    ),
    chunk_scores AS (
        SELECT
            cc.candidate_id,
            -- 청크 타입별 가중치 적용
            MAX(
                (1 - (cc.embedding <=> p_query_embedding)) *
                CASE cc.chunk_type
                    WHEN 'summary' THEN 1.0
                    WHEN 'career' THEN 0.9
                    WHEN 'skill' THEN 0.85
                    WHEN 'project' THEN 0.8
                    WHEN 'education' THEN 0.5
                END
            ) AS weighted_score
        FROM candidate_chunks cc
        WHERE cc.candidate_id IN (SELECT fc.id FROM filtered_candidates fc)
        GROUP BY cc.candidate_id
    )
    SELECT
        fc.id,
        fc.name,
        fc.last_position,
        fc.last_company,
        fc.exp_years,
        fc.skills,
        fc.photo_url,
        fc.summary,
        fc.confidence_score,
        fc.requires_review,
        COALESCE(cs.weighted_score, 0) AS match_score
    FROM filtered_candidates fc
    LEFT JOIN chunk_scores cs ON fc.id = cs.candidate_id
    ORDER BY match_score DESC
    LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INITIAL DATA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- (선택) 테스트 데이터는 별도 시드 스크립트로 관리

COMMENT ON TABLE users IS 'RAI 사용자 프로필 (Supabase Auth 확장)';
COMMENT ON TABLE user_consents IS '사용자 동의 기록 (제3자 정보 보증 포함)';
COMMENT ON TABLE candidates IS '후보자 정형 데이터 (암호화 필드 포함)';
COMMENT ON TABLE candidate_chunks IS 'Vector 검색용 청크 (pgvector)';
COMMENT ON TABLE processing_jobs IS '파일 처리 작업 추적';
COMMENT ON TABLE search_feedback IS '검색 피드백 (품질 개선용)';
COMMENT ON TABLE credit_transactions IS '크레딧 거래 내역';
