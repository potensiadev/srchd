-- =====================================================
-- Migration 009: Fix deduct_credit function and RLS
-- =====================================================

-- 1. deduct_credit 함수 수정 (p_candidate_id를 선택적으로 변경)
CREATE OR REPLACE FUNCTION deduct_credit(
    p_user_id UUID,
    p_candidate_id UUID DEFAULT NULL,
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

    -- 사용자 없음
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 플랜별 기본 크레딧
    v_base_credits := CASE v_plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50
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

-- 2. get_current_user_id 함수 생성 (RLS용)
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- auth.jwt()에서 이메일을 추출하여 public.users에서 ID 조회
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.email = auth.jwt()->>'email'
    LIMIT 1;
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. 기존 candidates RLS 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Users can view own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete own candidates" ON candidates;

-- 새 RLS 정책 (get_current_user_id() 사용)
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

-- 4. 기존 후보자들에게 is_latest = true 설정
UPDATE candidates
SET is_latest = true, version = 1
WHERE is_latest IS NULL OR is_latest = false;

-- 5. RLS 활성화 확인
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
