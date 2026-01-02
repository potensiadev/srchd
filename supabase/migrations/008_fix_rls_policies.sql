-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS 정책 수정: auth.uid() 대신 email 기반 조회
--
-- 문제: Google 가입 후 이메일 로그인 시 auth.users.id가 달라질 수 있음
-- 해결: public.users.id를 email로 조회하여 비교
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 헬퍼 함수: 현재 로그인한 사용자의 public.users.id 반환
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- auth.users의 email로 public.users.id 조회
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.email = auth.jwt()->>'email'
    LIMIT 1;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Candidates 정책 재생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Users can view own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete own candidates" ON candidates;

CREATE POLICY "Users can view own candidates"
    ON candidates FOR SELECT
    USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert own candidates"
    ON candidates FOR INSERT
    WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update own candidates"
    ON candidates FOR UPDATE
    USING (user_id = get_current_user_id());

CREATE POLICY "Users can delete own candidates"
    ON candidates FOR DELETE
    USING (user_id = get_current_user_id());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Candidate Chunks 정책 재생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Users can view own candidate chunks" ON candidate_chunks;
DROP POLICY IF EXISTS "Users can insert own candidate chunks" ON candidate_chunks;
DROP POLICY IF EXISTS "Users can update own candidate chunks" ON candidate_chunks;
DROP POLICY IF EXISTS "Users can delete own candidate chunks" ON candidate_chunks;

CREATE POLICY "Users can view own candidate chunks"
    ON candidate_chunks FOR SELECT
    USING (
        candidate_id IN (
            SELECT id FROM candidates WHERE user_id = get_current_user_id()
        )
    );

CREATE POLICY "Users can insert own candidate chunks"
    ON candidate_chunks FOR INSERT
    WITH CHECK (
        candidate_id IN (
            SELECT id FROM candidates WHERE user_id = get_current_user_id()
        )
    );

CREATE POLICY "Users can update own candidate chunks"
    ON candidate_chunks FOR UPDATE
    USING (
        candidate_id IN (
            SELECT id FROM candidates WHERE user_id = get_current_user_id()
        )
    );

CREATE POLICY "Users can delete own candidate chunks"
    ON candidate_chunks FOR DELETE
    USING (
        candidate_id IN (
            SELECT id FROM candidates WHERE user_id = get_current_user_id()
        )
    );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Processing Jobs 정책 재생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP POLICY IF EXISTS "Users can view own processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can insert own processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can update own processing jobs" ON processing_jobs;

CREATE POLICY "Users can view own processing jobs"
    ON processing_jobs FOR SELECT
    USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert own processing jobs"
    ON processing_jobs FOR INSERT
    WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update own processing jobs"
    ON processing_jobs FOR UPDATE
    USING (user_id = get_current_user_id());
