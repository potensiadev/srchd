-- ============================================================
-- PRD v0.1 Section 10.4, 14.4: Onboarding & Overage Billing
-- Adds user columns for onboarding flow and overage billing
-- ============================================================

-- ----
-- 1. ONBOARDING COLUMNS (PRD Section 14.4)
-- ----

-- onboarding_completed: 온보딩 완료 여부
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- onboarding_step: 온보딩 진행 단계 (0: 미시작, 1~5: 각 단계, 6: 완료)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

COMMENT ON COLUMN users.onboarding_completed IS '온보딩 플로우 완료 여부';
COMMENT ON COLUMN users.onboarding_step IS '온보딩 진행 단계: 0=미시작, 1=환영, 2=업로드가이드, 3=검색체험, 4=검토UI, 5=블라인드가이드, 6=완료';

-- ----
-- 2. OVERAGE BILLING COLUMNS (PRD Section 10.4)
-- ----

-- overage_enabled: 추가 크레딧 자동 사용 허용 여부 (Pro 전용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS overage_enabled BOOLEAN DEFAULT FALSE;

-- overage_limit: 월 최대 추가 크레딧 한도 (기본 100건)
ALTER TABLE users ADD COLUMN IF NOT EXISTS overage_limit INTEGER DEFAULT 100;

-- overage_used_this_month: 이번 달 추가 사용 건수
ALTER TABLE users ADD COLUMN IF NOT EXISTS overage_used_this_month INTEGER DEFAULT 0;

COMMENT ON COLUMN users.overage_enabled IS 'Pro 플랜: 월 크레딧 소진 후 추가 크레딧 자동 사용 허용 (건당 1,500원)';
COMMENT ON COLUMN users.overage_limit IS '월 최대 추가 크레딧 한도 (기본 100건, 안전장치)';
COMMENT ON COLUMN users.overage_used_this_month IS '이번 달 추가 사용 건수 (billing_cycle_start 기준 리셋)';

-- ----
-- 3. INDEX FOR ONBOARDING QUERIES
-- ----

CREATE INDEX IF NOT EXISTS idx_users_onboarding_incomplete
    ON users(onboarding_completed)
    WHERE onboarding_completed = FALSE;

-- ----
-- 4. UPDATE get_user_credits RPC TO RESET OVERAGE
-- ----

-- 기존 get_user_credits RPC에서 billing cycle 리셋 시 overage_used_this_month도 리셋
-- 이 로직은 기존 20240101000005_get_user_credits.sql의 함수를 확장함
-- 별도 마이그레이션에서 함수 업데이트 예정

-- DONE
