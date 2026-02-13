-- ============================================================
-- PRD v0.1 Section 9, 16.2: Candidate Submission Packages
-- Creates table for storing AI-generated candidate packages
-- ============================================================

-- ----
-- 1. CANDIDATE_PACKAGES TABLE
-- ----

CREATE TABLE IF NOT EXISTS candidate_packages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- AI 생성 콘텐츠 (PRD Section 9.2)
    match_reasons TEXT[] DEFAULT '{}',           -- 매칭 이유 3~5개
    risks TEXT[] DEFAULT '{}',                   -- 잠재 리스크 2~3개
    interview_questions TEXT[] DEFAULT '{}',     -- 면접 질문 제안 3~5개
    summary TEXT,                                -- 요약 의견

    -- 메타데이터
    model_used TEXT DEFAULT 'gpt-4o',            -- 사용된 AI 모델
    generation_time_ms INTEGER,                  -- 생성 소요 시간 (밀리초)

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE candidate_packages IS 'PRD Section 9: JD 기반 맞춤 후보자 제출 패키지 (Pro 전용)';
COMMENT ON COLUMN candidate_packages.match_reasons IS '매칭 이유 (3~5개 bullet points)';
COMMENT ON COLUMN candidate_packages.risks IS '잠재 리스크 (2~3개 bullet points)';
COMMENT ON COLUMN candidate_packages.interview_questions IS '면접 질문 제안 (3~5개)';
COMMENT ON COLUMN candidate_packages.summary IS '종합 의견 (1~2문장)';

-- ----
-- 2. INDEXES
-- ----

-- 사용자별 패키지 조회
CREATE INDEX IF NOT EXISTS idx_candidate_packages_user
    ON candidate_packages(user_id, created_at DESC);

-- 후보자별 패키지 조회
CREATE INDEX IF NOT EXISTS idx_candidate_packages_candidate
    ON candidate_packages(candidate_id, created_at DESC);

-- 포지션별 패키지 조회
CREATE INDEX IF NOT EXISTS idx_candidate_packages_position
    ON candidate_packages(position_id, created_at DESC)
    WHERE position_id IS NOT NULL;

-- ----
-- 3. ROW LEVEL SECURITY
-- ----

ALTER TABLE candidate_packages ENABLE ROW LEVEL SECURITY;

-- 사용자는 본인 패키지만 조회 가능
DROP POLICY IF EXISTS "Users can view own candidate packages" ON candidate_packages;
CREATE POLICY "Users can view own candidate packages"
    ON candidate_packages FOR SELECT
    USING (user_id = auth.uid());

-- 사용자는 본인 패키지 생성 가능
DROP POLICY IF EXISTS "Users can insert own candidate packages" ON candidate_packages;
CREATE POLICY "Users can insert own candidate packages"
    ON candidate_packages FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 사용자는 본인 패키지 삭제 가능
DROP POLICY IF EXISTS "Users can delete own candidate packages" ON candidate_packages;
CREATE POLICY "Users can delete own candidate packages"
    ON candidate_packages FOR DELETE
    USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role can manage candidate packages" ON candidate_packages;
CREATE POLICY "Service role can manage candidate packages"
    ON candidate_packages FOR ALL
    USING (auth.role() = 'service_role');

-- ----
-- 4. HELPER FUNCTION: GET LATEST PACKAGE FOR CANDIDATE-POSITION PAIR
-- ----

CREATE OR REPLACE FUNCTION get_latest_candidate_package(
    p_candidate_id UUID,
    p_position_id UUID
)
RETURNS candidate_packages AS $$
DECLARE
    v_package candidate_packages;
BEGIN
    SELECT * INTO v_package
    FROM candidate_packages
    WHERE candidate_id = p_candidate_id
      AND position_id = p_position_id
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN v_package;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_latest_candidate_package IS '특정 후보자-포지션 조합의 최신 제출 패키지 조회';

-- DONE
