-- =====================================================
-- Migration: Fix Users Table INSERT Policy
-- 신규 사용자가 자신의 레코드를 생성할 수 있도록 INSERT 정책 추가
-- =====================================================

-- 1. 사용자가 자신의 레코드를 INSERT할 수 있는 정책
-- auth.uid()가 삽입하려는 id와 일치해야 함
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
    ON users FOR INSERT
    WITH CHECK (id = auth.uid());

-- 2. Service Role도 users 테이블에 접근 가능하도록 (백업)
DROP POLICY IF EXISTS "Service role full access on users" ON users;
CREATE POLICY "Service role full access on users"
    ON users
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- DONE
