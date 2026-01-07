-- =====================================================
-- Migration 016: Add risk_level Column
-- 후보자 위험도 레벨 컬럼 추가
-- =====================================================

-- risk_level ENUM 타입 생성
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
        CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
    END IF;
END$$;

-- candidates 테이블에 risk_level 컬럼 추가
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS risk_level risk_level DEFAULT 'low';

-- 인덱스 추가 (위험도별 필터링 최적화)
CREATE INDEX IF NOT EXISTS idx_candidates_risk_level ON candidates(risk_level);

-- COMMENT
COMMENT ON COLUMN candidates.risk_level IS '후보자 위험도 레벨 (low, medium, high)';
