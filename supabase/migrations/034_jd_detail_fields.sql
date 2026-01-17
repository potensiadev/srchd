-- Migration: Add JD detail fields to positions table
-- 주요업무, 자격요건, 우대사항, 복리후생 원문 저장을 위한 컬럼 추가

-- Add new TEXT columns for detailed JD sections
ALTER TABLE positions ADD COLUMN IF NOT EXISTS responsibilities TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS qualifications TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS preferred_qualifications TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS benefits TEXT;

-- Add comments for documentation
COMMENT ON COLUMN positions.responsibilities IS '주요업무/담당업무 원문';
COMMENT ON COLUMN positions.qualifications IS '자격요건/필수요건 원문';
COMMENT ON COLUMN positions.preferred_qualifications IS '우대사항/우대요건 원문';
COMMENT ON COLUMN positions.benefits IS '복리후생/혜택';
