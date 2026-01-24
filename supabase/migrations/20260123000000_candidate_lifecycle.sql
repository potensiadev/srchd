-- ============================================================
-- P0: Candidate Lifecycle Management
-- 헤드헌터 인터뷰 기반 - 후보자 이직 의향/상태 관리
-- ============================================================

-- ----
-- ENUM: 이직 의향 레벨
-- ----
DO $$ BEGIN
  CREATE TYPE interest_level AS ENUM ('hot', 'warm', 'cold', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----
-- ENUM: 연락 타입
-- ----
DO $$ BEGIN
  CREATE TYPE contact_type AS ENUM ('email', 'phone', 'linkedin', 'meeting', 'note');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----
-- ENUM: 연락 결과
-- ----
DO $$ BEGIN
  CREATE TYPE contact_outcome AS ENUM ('interested', 'not_interested', 'no_response', 'callback', 'rejected', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----
-- ALTER candidates TABLE: 라이프사이클 필드 추가
-- ----

-- 마지막 연락 일시
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- 이직 의향 (Hot/Warm/Cold/Unknown)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interest_level interest_level DEFAULT 'unknown';

-- 희망 연봉 범위 (만원 단위)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_expectation_min INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_expectation_max INTEGER;

-- 희망 근무 지역
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location_preferences TEXT[] DEFAULT '{}';

-- 최소 입사 가능일
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS earliest_start_date DATE;

-- 제약조건/메모 (이직 동기, 제약사항 등)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS availability_notes TEXT;

-- 연락 횟수 (캐시용 - 재계산 가능)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0;

-- ----
-- 새 테이블: contact_history (연락 이력)
-- ----

CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- 연락 정보
  contact_type contact_type NOT NULL,
  subject TEXT,
  content TEXT,
  outcome contact_outcome DEFAULT 'pending',

  -- 다음 연락 예정
  next_contact_date DATE,
  next_contact_note TEXT,

  -- 포지션 컨텍스트 (어떤 포지션 관련 연락인지)
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,

  -- 타임스탬프
  contacted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----
-- INDEXES: 재활성 검색 최적화
-- ----

-- 마지막 연락일 기준 필터
CREATE INDEX IF NOT EXISTS idx_candidates_last_contact
  ON candidates(last_contact_at DESC NULLS LAST)
  WHERE is_latest = true;

-- 이직 의향 레벨 기준 필터
CREATE INDEX IF NOT EXISTS idx_candidates_interest_level
  ON candidates(interest_level)
  WHERE is_latest = true;

-- 복합 인덱스: 재활성 검색 (user_id + interest_level + last_contact)
CREATE INDEX IF NOT EXISTS idx_candidates_reactivation
  ON candidates(user_id, interest_level, last_contact_at DESC NULLS LAST)
  WHERE is_latest = true AND status = 'completed';

-- contact_history 인덱스
CREATE INDEX IF NOT EXISTS idx_contact_history_candidate
  ON contact_history(candidate_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_history_user
  ON contact_history(user_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_history_next_contact
  ON contact_history(user_id, next_contact_date)
  WHERE next_contact_date IS NOT NULL;

-- ----
-- RLS: contact_history
-- ----

ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can insert own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can update own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can delete own contact history" ON contact_history;

CREATE POLICY "Users can view own contact history"
  ON contact_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own contact history"
  ON contact_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own contact history"
  ON contact_history FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own contact history"
  ON contact_history FOR DELETE
  USING (user_id = auth.uid());

-- ----
-- FUNCTION: 연락 기록 시 자동 업데이트
-- ----

CREATE OR REPLACE FUNCTION update_candidate_on_contact()
RETURNS TRIGGER AS $$
BEGIN
  -- 후보자의 last_contact_at, contact_count 업데이트
  UPDATE candidates
  SET
    last_contact_at = NEW.contacted_at,
    contact_count = contact_count + 1,
    updated_at = NOW()
  WHERE id = NEW.candidate_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_contact_history_insert ON contact_history;
CREATE TRIGGER trigger_contact_history_insert
  AFTER INSERT ON contact_history
  FOR EACH ROW
  EXECUTE FUNCTION update_candidate_on_contact();

-- ----
-- FUNCTION: 이직 의향 자동 감쇠 (90일 미접촉 시 warm→cold)
-- 참고: 이 함수는 Cron Job으로 주기적 호출 필요
-- ----

CREATE OR REPLACE FUNCTION decay_candidate_interest()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- 90일 이상 미접촉 + warm → cold로 변경
  UPDATE candidates
  SET
    interest_level = 'cold',
    updated_at = NOW()
  WHERE
    is_latest = true
    AND interest_level = 'warm'
    AND (
      last_contact_at IS NULL
      OR last_contact_at < NOW() - INTERVAL '90 days'
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----
-- FUNCTION: 후보자 라이프사이클 통계 조회
-- ----

CREATE OR REPLACE FUNCTION get_candidate_lifecycle_stats(p_user_id UUID)
RETURNS TABLE (
  total_candidates INTEGER,
  hot_count INTEGER,
  warm_count INTEGER,
  cold_count INTEGER,
  unknown_count INTEGER,
  no_contact_30_days INTEGER,
  no_contact_90_days INTEGER,
  upcoming_followups INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_candidates,
    COUNT(*) FILTER (WHERE c.interest_level = 'hot')::INTEGER AS hot_count,
    COUNT(*) FILTER (WHERE c.interest_level = 'warm')::INTEGER AS warm_count,
    COUNT(*) FILTER (WHERE c.interest_level = 'cold')::INTEGER AS cold_count,
    COUNT(*) FILTER (WHERE c.interest_level = 'unknown')::INTEGER AS unknown_count,
    COUNT(*) FILTER (WHERE c.last_contact_at IS NULL OR c.last_contact_at < NOW() - INTERVAL '30 days')::INTEGER AS no_contact_30_days,
    COUNT(*) FILTER (WHERE c.last_contact_at IS NULL OR c.last_contact_at < NOW() - INTERVAL '90 days')::INTEGER AS no_contact_90_days,
    (
      SELECT COUNT(*)::INTEGER
      FROM contact_history ch
      WHERE ch.user_id = p_user_id
        AND ch.next_contact_date IS NOT NULL
        AND ch.next_contact_date <= CURRENT_DATE + INTERVAL '7 days'
    ) AS upcoming_followups
  FROM candidates c
  WHERE c.user_id = p_user_id
    AND c.is_latest = true
    AND c.status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE: P0 Candidate Lifecycle Migration
-- ============================================================
