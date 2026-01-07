-- ============================================================
-- Migration: 017_progressive_loading.sql
-- Description: Progressive Data Loading - 단계별 저장 및 실시간 업데이트
-- ============================================================

-- 1. candidate_status ENUM 생성 또는 확장
-- 먼저 ENUM이 존재하는지 확인하고, 없으면 생성
DO $$
BEGIN
    -- ENUM이 존재하지 않으면 생성
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_status') THEN
        CREATE TYPE candidate_status AS ENUM ('processing', 'parsed', 'analyzed', 'completed', 'failed', 'rejected');
    ELSE
        -- ENUM이 존재하면 새 값 추가
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'parsed'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'candidate_status')
        ) THEN
            ALTER TYPE candidate_status ADD VALUE 'parsed' AFTER 'processing';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_status') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'analyzed'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'candidate_status')
        ) THEN
            ALTER TYPE candidate_status ADD VALUE 'analyzed' AFTER 'parsed';
        END IF;
    END IF;
END $$;

-- 2. processing_status ENUM 생성 또는 확장
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_status') THEN
        CREATE TYPE processing_status AS ENUM ('queued', 'processing', 'parsing', 'analyzing', 'completed', 'failed', 'rejected');
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'parsing'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'processing_status')
        ) THEN
            ALTER TYPE processing_status ADD VALUE 'parsing' AFTER 'processing';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_status') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'analyzing'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'processing_status')
        ) THEN
            ALTER TYPE processing_status ADD VALUE 'analyzing' AFTER 'parsing';
        END IF;
    END IF;
END $$;

-- 3. candidates 테이블에 Progressive Loading 필드 추가
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS quick_extracted JSONB DEFAULT NULL;

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS parsing_completed_at TIMESTAMPTZ;

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ;

-- 4. 인덱스 추가 (중간 상태 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_candidates_user_status_latest
ON candidates(user_id, status)
WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_candidates_status_created
ON candidates(status, created_at DESC)
WHERE is_latest = true;

-- 5. Supabase Realtime 활성화 (candidates 테이블)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'candidates'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
        END IF;
    END IF;
END $$;

-- 6. 컬럼 코멘트
COMMENT ON COLUMN candidates.quick_extracted IS '파싱 완료 후 빠른 추출 데이터 (이름, 연락처, 최근 경력)';
COMMENT ON COLUMN candidates.parsing_completed_at IS '파싱 완료 시점';
COMMENT ON COLUMN candidates.analysis_completed_at IS 'AI 분석 완료 시점';
