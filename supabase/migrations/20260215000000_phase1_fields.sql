-- Phase 1: 필드 완성도 및 문서 분류 기능 지원
--
-- 이 마이그레이션은 Phase 1 에이전트들이 필요로 하는 스키마를 추가합니다:
-- - DocumentClassifier: document_kind, doc_confidence
-- - CoverageCalculator: coverage_score, field_metadata
-- - GapFillerAgent: field_metadata 내 gap_fill 기록

-- ============================================================================
-- 1. ENUM 타입 생성
-- ============================================================================

-- 문서 분류 결과
DO $$ BEGIN
    CREATE TYPE document_kind_enum AS ENUM ('resume', 'non_resume', 'uncertain');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 필드 누락 사유
DO $$ BEGIN
    CREATE TYPE missing_reason_enum AS ENUM (
        'not_found_in_source',     -- 원문에 정보 없음
        'parser_error',            -- 파서 오류
        'llm_extraction_failed',   -- LLM 추출 실패
        'low_confidence',          -- 신뢰도 낮음
        'schema_mismatch',         -- 스키마 불일치
        'timeout'                  -- 타임아웃
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. candidates 테이블 확장
-- ============================================================================

-- 문서 분류 결과
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS document_kind document_kind_enum DEFAULT 'resume';

-- 문서 분류 신뢰도 (0.00-1.00)
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS doc_confidence DECIMAL(3,2);

-- 필드 완성도 점수 (0.00-100.00)
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS coverage_score DECIMAL(5,2);

-- 필드별 메타데이터 (source, confidence, missing_reason 등)
-- 구조 예시:
-- {
--   "name": {"source": "analyst", "confidence": 0.95, "evidence_span": [0, 15]},
--   "phone": {"source": "gap_filler", "confidence": 0.88, "retries": 1},
--   "address": {"missing_reason": "not_found_in_source"}
-- }
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS field_metadata JSONB DEFAULT '{}';

-- ============================================================================
-- 3. processing_jobs 테이블 확장
-- ============================================================================

-- 문서 분류 결과 저장
-- 구조 예시:
-- {
--   "document_kind": "resume",
--   "confidence": 0.92,
--   "non_resume_type": null,
--   "signals": ["이름", "경력", "학력"],
--   "llm_used": false
-- }
ALTER TABLE processing_jobs
    ADD COLUMN IF NOT EXISTS document_classification JSONB DEFAULT '{}';

-- 커버리지 메트릭 저장
-- 구조 예시:
-- {
--   "coverage_score": 85.5,
--   "evidence_backed_ratio": 0.78,
--   "missing_fields": ["address", "birth_year"],
--   "gap_fill_candidates": ["phone", "email"]
-- }
ALTER TABLE processing_jobs
    ADD COLUMN IF NOT EXISTS coverage_metrics JSONB DEFAULT '{}';

-- GapFiller 시도 횟수
ALTER TABLE processing_jobs
    ADD COLUMN IF NOT EXISTS gap_fill_attempts INT DEFAULT 0;

-- ============================================================================
-- 4. 인덱스 추가
-- ============================================================================

-- document_kind 인덱스 (비이력서 필터링용)
CREATE INDEX IF NOT EXISTS idx_candidates_document_kind
    ON candidates(document_kind);

-- coverage_score 인덱스 (낮은 완성도 후보자 조회용)
CREATE INDEX IF NOT EXISTS idx_candidates_coverage_score
    ON candidates(coverage_score);

-- field_metadata GIN 인덱스 (JSONB 검색용)
CREATE INDEX IF NOT EXISTS idx_candidates_field_metadata
    ON candidates USING GIN (field_metadata);

-- ============================================================================
-- 5. 코멘트 추가
-- ============================================================================

COMMENT ON COLUMN candidates.document_kind IS
    'DocumentClassifier 결과: resume, non_resume, uncertain';

COMMENT ON COLUMN candidates.doc_confidence IS
    '문서 분류 신뢰도 (0.00-1.00)';

COMMENT ON COLUMN candidates.coverage_score IS
    '필드 완성도 점수 (0.00-100.00), CoverageCalculator 산출';

COMMENT ON COLUMN candidates.field_metadata IS
    '필드별 메타데이터 JSONB: source, confidence, evidence_span, missing_reason 등';

COMMENT ON COLUMN processing_jobs.document_classification IS
    'DocumentClassifier 결과 상세 (document_kind, confidence, signals, llm_used)';

COMMENT ON COLUMN processing_jobs.coverage_metrics IS
    'CoverageCalculator 결과 (coverage_score, missing_fields, gap_fill_candidates)';

COMMENT ON COLUMN processing_jobs.gap_fill_attempts IS
    'GapFillerAgent 재시도 횟수';
