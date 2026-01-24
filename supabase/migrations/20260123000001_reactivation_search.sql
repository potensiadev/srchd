-- ============================================================
-- P1-B: Reactivation Search (재활성 검색)
-- 헤드헌터 인터뷰 기반 - 마지막 연락일, 이직 의향 기반 검색
-- ============================================================

-- ----
-- FUNCTION: 재활성 검색 (Vector + RDB 필터 확장)
-- ----

CREATE OR REPLACE FUNCTION search_candidates_v2(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_count INTEGER DEFAULT 20,
  -- 기존 필터
  p_exp_years_min INTEGER DEFAULT NULL,
  p_exp_years_max INTEGER DEFAULT NULL,
  p_skills TEXT[] DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_companies TEXT[] DEFAULT NULL,
  p_exclude_companies TEXT[] DEFAULT NULL,
  p_education_level TEXT DEFAULT NULL,
  -- P1-B: 재활성 필터
  p_last_contact_before DATE DEFAULT NULL,
  p_last_contact_after DATE DEFAULT NULL,
  p_interest_levels TEXT[] DEFAULT NULL,
  p_exclude_rejected BOOLEAN DEFAULT FALSE,
  p_not_in_position UUID DEFAULT NULL,
  p_no_contact_history BOOLEAN DEFAULT FALSE,
  p_salary_expectation_max INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  last_position TEXT,
  last_company TEXT,
  exp_years INTEGER,
  skills TEXT[],
  photo_url TEXT,
  summary TEXT,
  confidence_score FLOAT,
  requires_review BOOLEAN,
  risk_level TEXT,
  match_score FLOAT,
  -- P1-B: 추가 반환 필드
  last_contact_at TIMESTAMPTZ,
  interest_level TEXT,
  contact_count INTEGER,
  salary_expectation_min INTEGER,
  salary_expectation_max INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_candidates AS (
    SELECT c.*
    FROM candidates c
    WHERE c.user_id = p_user_id
      AND c.is_latest = true
      AND c.status = 'completed'
      -- 기존 필터
      AND (p_exp_years_min IS NULL OR c.exp_years >= p_exp_years_min)
      AND (p_exp_years_max IS NULL OR c.exp_years <= p_exp_years_max)
      AND (p_skills IS NULL OR c.skills && p_skills)
      AND (p_location IS NULL OR c.location_city ILIKE '%' || p_location || '%')
      AND (p_companies IS NULL OR c.last_company ILIKE ANY (
        SELECT '%' || unnest || '%' FROM unnest(p_companies)
      ))
      AND (p_exclude_companies IS NULL OR NOT (c.last_company ILIKE ANY (
        SELECT '%' || unnest || '%' FROM unnest(p_exclude_companies)
      )))
      AND (p_education_level IS NULL OR c.education_level = p_education_level)
      -- P1-B: 재활성 필터
      AND (p_last_contact_before IS NULL
           OR c.last_contact_at IS NULL
           OR c.last_contact_at::DATE < p_last_contact_before)
      AND (p_last_contact_after IS NULL
           OR c.last_contact_at IS NOT NULL
           AND c.last_contact_at::DATE >= p_last_contact_after)
      AND (p_interest_levels IS NULL
           OR c.interest_level::TEXT = ANY(p_interest_levels))
      AND (NOT p_exclude_rejected
           OR NOT EXISTS (
             SELECT 1 FROM position_candidates pc
             WHERE pc.candidate_id = c.id
               AND pc.stage = 'rejected'
           ))
      AND (p_not_in_position IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM position_candidates pc
             WHERE pc.candidate_id = c.id
               AND pc.position_id = p_not_in_position
           ))
      AND (NOT p_no_contact_history
           OR c.last_contact_at IS NULL)
      AND (p_salary_expectation_max IS NULL
           OR c.salary_expectation_min IS NULL
           OR c.salary_expectation_min <= p_salary_expectation_max)
  ),
  chunk_scores AS (
    SELECT
      cc.candidate_id,
      MAX(
        (1 - (cc.embedding <=> p_query_embedding)) *
        CASE cc.chunk_type
          WHEN 'summary' THEN 1.0
          WHEN 'career' THEN 0.9
          WHEN 'skill' THEN 0.85
          WHEN 'project' THEN 0.8
          WHEN 'raw_full' THEN 0.7
          WHEN 'raw_section' THEN 0.65
          WHEN 'education' THEN 0.5
        END
      ) AS weighted_score
    FROM candidate_chunks cc
    WHERE cc.candidate_id IN (SELECT fc.id FROM filtered_candidates fc)
    GROUP BY cc.candidate_id
  )
  SELECT
    fc.id,
    fc.name,
    fc.last_position,
    fc.last_company,
    fc.exp_years,
    fc.skills,
    fc.photo_url,
    fc.summary,
    fc.confidence_score,
    fc.requires_review,
    fc.risk_level,
    COALESCE(cs.weighted_score, 0)::FLOAT AS match_score,
    -- P1-B: 추가 반환 필드
    fc.last_contact_at,
    fc.interest_level::TEXT,
    fc.contact_count,
    fc.salary_expectation_min,
    fc.salary_expectation_max
  FROM filtered_candidates fc
  LEFT JOIN chunk_scores cs ON fc.id = cs.candidate_id
  ORDER BY match_score DESC
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----
-- FUNCTION: 재활성 후보자 목록 조회 (Vector 없이, RDB 필터만)
-- 검색어 없이 필터만으로 조회할 때 사용
-- ----

CREATE OR REPLACE FUNCTION get_reactivation_candidates(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  -- 재활성 필터
  p_last_contact_before DATE DEFAULT NULL,
  p_interest_levels TEXT[] DEFAULT NULL,
  p_exclude_rejected BOOLEAN DEFAULT FALSE,
  p_skills TEXT[] DEFAULT NULL,
  p_exp_years_min INTEGER DEFAULT NULL,
  p_exp_years_max INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  last_position TEXT,
  last_company TEXT,
  exp_years INTEGER,
  skills TEXT[],
  photo_url TEXT,
  summary TEXT,
  confidence_score FLOAT,
  requires_review BOOLEAN,
  risk_level TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  interest_level TEXT,
  contact_count INTEGER,
  salary_expectation_min INTEGER,
  salary_expectation_max INTEGER,
  availability_notes TEXT,
  total_count BIGINT
) AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- 전체 카운트 조회
  SELECT COUNT(*) INTO v_total_count
  FROM candidates c
  WHERE c.user_id = p_user_id
    AND c.is_latest = true
    AND c.status = 'completed'
    AND (p_last_contact_before IS NULL
         OR c.last_contact_at IS NULL
         OR c.last_contact_at::DATE < p_last_contact_before)
    AND (p_interest_levels IS NULL
         OR c.interest_level::TEXT = ANY(p_interest_levels))
    AND (NOT p_exclude_rejected
         OR NOT EXISTS (
           SELECT 1 FROM position_candidates pc
           WHERE pc.candidate_id = c.id AND pc.stage = 'rejected'
         ))
    AND (p_skills IS NULL OR c.skills && p_skills)
    AND (p_exp_years_min IS NULL OR c.exp_years >= p_exp_years_min)
    AND (p_exp_years_max IS NULL OR c.exp_years <= p_exp_years_max);

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.last_position,
    c.last_company,
    c.exp_years,
    c.skills,
    c.photo_url,
    c.summary,
    c.confidence_score,
    c.requires_review,
    c.risk_level,
    c.created_at,
    c.updated_at,
    c.last_contact_at,
    c.interest_level::TEXT,
    c.contact_count,
    c.salary_expectation_min,
    c.salary_expectation_max,
    c.availability_notes,
    v_total_count AS total_count
  FROM candidates c
  WHERE c.user_id = p_user_id
    AND c.is_latest = true
    AND c.status = 'completed'
    AND (p_last_contact_before IS NULL
         OR c.last_contact_at IS NULL
         OR c.last_contact_at::DATE < p_last_contact_before)
    AND (p_interest_levels IS NULL
         OR c.interest_level::TEXT = ANY(p_interest_levels))
    AND (NOT p_exclude_rejected
         OR NOT EXISTS (
           SELECT 1 FROM position_candidates pc
           WHERE pc.candidate_id = c.id AND pc.stage = 'rejected'
         ))
    AND (p_skills IS NULL OR c.skills && p_skills)
    AND (p_exp_years_min IS NULL OR c.exp_years >= p_exp_years_min)
    AND (p_exp_years_max IS NULL OR c.exp_years <= p_exp_years_max)
  ORDER BY
    -- 우선순위: Hot > Warm > Cold > Unknown, 그 다음 마지막 연락일 오래된 순
    CASE c.interest_level
      WHEN 'hot' THEN 1
      WHEN 'warm' THEN 2
      WHEN 'cold' THEN 3
      ELSE 4
    END,
    COALESCE(c.last_contact_at, '1970-01-01'::TIMESTAMPTZ) ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE: P1-B Reactivation Search Migration
-- ============================================================
