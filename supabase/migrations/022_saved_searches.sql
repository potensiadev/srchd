-- ============================================================
-- Migration 022: Saved Searches
-- 저장된 검색 기능
-- ============================================================

-- 1. saved_searches 테이블 생성
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                    -- 검색 이름 (사용자 지정)
  query TEXT,                            -- 검색 쿼리
  filters JSONB DEFAULT '{}',            -- 필터 조건

  -- 알림 설정 (향후 확장용)
  notify_on_new_match BOOLEAN DEFAULT false,
  last_notified_at TIMESTAMPTZ,

  -- 사용 통계
  use_count INTEGER DEFAULT 0,           -- 사용 횟수
  last_used_at TIMESTAMPTZ,              -- 마지막 사용 시간

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at DESC);

-- 3. RLS 정책
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 저장된 검색만 접근 가능
CREATE POLICY saved_searches_select_policy ON saved_searches
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY saved_searches_insert_policy ON saved_searches
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY saved_searches_update_policy ON saved_searches
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY saved_searches_delete_policy ON saved_searches
  FOR DELETE USING (user_id = auth.uid());

-- 4. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_saved_searches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saved_searches_updated_at_trigger
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_searches_updated_at();

-- 5. 사용 횟수 증가 함수
CREATE OR REPLACE FUNCTION increment_saved_search_usage(p_search_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE saved_searches
  SET
    use_count = use_count + 1,
    last_used_at = NOW()
  WHERE id = p_search_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
