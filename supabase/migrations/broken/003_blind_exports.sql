-- 
-- Migration 003: Blind Exports Table
-- 블라인드 이력서 내보내기 기록
-- 

-- 내보내기 형식
CREATE TYPE export_format AS ENUM ('pdf', 'docx');

-- 
-- BLIND_EXPORTS 테이블
-- PRD: 직거래 방지를 위한 블라인드 내보내기 기록
-- 

CREATE TABLE blind_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    -- 내보내기 정보
    format export_format NOT NULL DEFAULT 'pdf',
    file_name TEXT NOT NULL,
    file_url TEXT,  -- Storage URL (임시)

    -- 마스킹 정보
    masked_fields TEXT[] DEFAULT '{}',  -- 마스킹된 필드 목록

    -- 메타
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ  -- 파일 만료 시간 (다운로드 링크 유효기간)
);

-- 인덱스
CREATE INDEX idx_blind_exports_user_id ON blind_exports(user_id);
CREATE INDEX idx_blind_exports_candidate_id ON blind_exports(candidate_id);
CREATE INDEX idx_blind_exports_created_at ON blind_exports(created_at DESC);

-- 
-- RLS 정책
-- 

ALTER TABLE blind_exports ENABLE ROW LEVEL SECURITY;

-- 본인 내보내기 기록만 조회 가능
CREATE POLICY "Users can view own blind exports"
    ON blind_exports FOR SELECT
    USING (auth.uid() = user_id);

-- 본인만 내보내기 생성 가능
CREATE POLICY "Users can create own blind exports"
    ON blind_exports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 
-- 월별 블라인드 내보내기 횟수 체크 함수
-- PRD: Starter 플랜 월 30회 제한
-- 

CREATE OR REPLACE FUNCTION get_monthly_blind_export_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM blind_exports
        WHERE user_id = p_user_id
          AND created_at >= date_trunc('month', CURRENT_DATE)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 
-- 코멘트
-- 

COMMENT ON TABLE blind_exports IS '블라인드 이력서 내보내기 기록';
COMMENT ON COLUMN blind_exports.masked_fields IS '마스킹된 필드 목록 (phone, email, address 등)';
COMMENT ON COLUMN blind_exports.expires_at IS '다운로드 링크 만료 시간';
