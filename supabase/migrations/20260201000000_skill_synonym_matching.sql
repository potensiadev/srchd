-- 2026-02-01
-- Phase 0: 동의어 매칭을 match_candidates_to_position RPC에 적용
-- PRD v3.0: 48시간 MVP - 동의어 테이블 JOIN으로 85% 정확도 달성
--
-- 변경 사항:
-- - 기존 exact match (s = ANY(c.skills)) 를 canonical skill 비교로 변경
-- - get_canonical_skill() 함수 활용 (20240101000026에서 생성됨)
-- - "React" 검색 시 "리액트", "ReactJS" 등 동의어 후보자 포함

CREATE OR REPLACE FUNCTION match_candidates_to_position(
    p_position_id UUID,
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_min_score FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    candidate_id UUID,
    candidate_name TEXT,
    last_position TEXT,
    last_company TEXT,
    exp_years INTEGER,
    skills TEXT[],
    photo_url TEXT,
    overall_score FLOAT,
    skill_score FLOAT,
    experience_score FLOAT,
    education_score FLOAT,
    semantic_score FLOAT,
    matched_skills TEXT[],
    missing_skills TEXT[]
) AS $$
DECLARE
    v_position RECORD;
    v_required_skills_count INTEGER;
BEGIN
    -- 포지션 정보 조회
    SELECT p.* INTO v_position
    FROM positions p
    WHERE p.id = p_position_id AND p.user_id = p_user_id;

    IF v_position IS NULL THEN
        RAISE EXCEPTION 'Position not found or access denied';
    END IF;

    v_required_skills_count := COALESCE(array_length(v_position.required_skills, 1), 0);

    RETURN QUERY
    WITH
    -- Step 1: 요구 스킬의 canonical 형태와 모든 동의어 variants 조회
    required_skill_variants AS (
        SELECT
            rs.skill AS original_skill,
            get_canonical_skill(rs.skill) AS canonical,
            ss.variant
        FROM unnest(v_position.required_skills) AS rs(skill)
        LEFT JOIN skill_synonyms ss ON ss.canonical_skill = get_canonical_skill(rs.skill)
    ),
    -- Step 2: 후보자 스킬의 canonical 형태 조회
    candidate_skill_match AS (
        SELECT
            c.id AS cid,
            c.name,
            c.last_position,
            c.last_company,
            c.exp_years,
            c.skills,
            c.photo_url,
            c.education_level,
            -- 매칭된 스킬 (동의어 포함)
            -- 요구 스킬 중 후보자가 가진 스킬 (canonical 비교)
            ARRAY(
                SELECT DISTINCT rsv.original_skill
                FROM required_skill_variants rsv
                WHERE EXISTS (
                    SELECT 1 FROM unnest(c.skills) AS cs(skill)
                    WHERE get_canonical_skill(cs.skill) = rsv.canonical
                )
            ) AS matched,
            -- 부족한 스킬
            ARRAY(
                SELECT DISTINCT rsv.original_skill
                FROM required_skill_variants rsv
                WHERE NOT EXISTS (
                    SELECT 1 FROM unnest(c.skills) AS cs(skill)
                    WHERE get_canonical_skill(cs.skill) = rsv.canonical
                )
            ) AS missing
        FROM candidates c
        WHERE c.user_id = p_user_id
          AND c.status = 'completed'
          AND c.is_latest = true
    ),
    scores AS (
        SELECT
            csm.cid,
            csm.name,
            csm.last_position,
            csm.last_company,
            csm.exp_years,
            csm.skills,
            csm.photo_url,
            csm.matched,
            csm.missing,
            -- Skill Score (0-1)
            CASE
                WHEN v_required_skills_count = 0 THEN 1.0
                ELSE COALESCE(array_length(csm.matched, 1), 0)::FLOAT / v_required_skills_count
            END AS s_score,
            -- Experience Score (0-1)
            CASE
                WHEN csm.exp_years < v_position.min_exp_years THEN
                    GREATEST(0.3, 1.0 - (v_position.min_exp_years - csm.exp_years) * 0.15)
                WHEN v_position.max_exp_years IS NOT NULL AND csm.exp_years > v_position.max_exp_years THEN
                    GREATEST(0.7, 1.0 - (csm.exp_years - v_position.max_exp_years) * 0.05)
                ELSE 1.0
            END AS e_score,
            -- Education Score (0-1)
            CASE
                WHEN v_position.required_education_level IS NULL THEN 1.0
                WHEN csm.education_level = v_position.required_education_level THEN 1.0
                WHEN csm.education_level IN ('master', 'doctorate') AND v_position.required_education_level = 'bachelor' THEN 1.0
                WHEN csm.education_level = 'doctorate' AND v_position.required_education_level = 'master' THEN 1.0
                WHEN csm.education_level = 'bachelor' AND v_position.required_education_level IN ('master', 'doctorate') THEN 0.7
                ELSE 0.5
            END AS edu_score
        FROM candidate_skill_match csm
    ),
    semantic_scores AS (
        SELECT
            cc.candidate_id,
            MAX(1 - (cc.embedding <=> v_position.embedding)) AS sem_score
        FROM candidate_chunks cc
        WHERE cc.candidate_id IN (SELECT cid FROM scores)
          AND cc.chunk_type = 'summary'
          AND v_position.embedding IS NOT NULL
        GROUP BY cc.candidate_id
    ),
    final_scores AS (
        SELECT
            s.cid,
            s.name,
            s.last_position,
            s.last_company,
            s.exp_years,
            s.skills,
            s.photo_url,
            s.matched,
            s.missing,
            s.s_score,
            s.e_score,
            s.edu_score,
            COALESCE(ss.sem_score, 0.5) AS sem_score,
            -- Overall Score = Skill(40%) + Experience(25%) + Education(15%) + Semantic(20%)
            (s.s_score * 0.40 + s.e_score * 0.25 + s.edu_score * 0.15 + COALESCE(ss.sem_score, 0.5) * 0.20) AS overall
        FROM scores s
        LEFT JOIN semantic_scores ss ON s.cid = ss.candidate_id
    )
    SELECT
        fs.cid,
        fs.name,
        fs.last_position,
        fs.last_company,
        fs.exp_years,
        fs.skills,
        fs.photo_url,
        fs.overall,
        fs.s_score,
        fs.e_score,
        fs.edu_score,
        fs.sem_score,
        fs.matched,
        fs.missing
    FROM final_scores fs
    WHERE fs.overall >= p_min_score
    ORDER BY fs.overall DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 부여
GRANT EXECUTE ON FUNCTION match_candidates_to_position TO authenticated;

-- 인덱스 최적화: 스킬 매칭 성능 향상
-- skill_synonyms 테이블의 canonical_skill 조회 최적화
CREATE INDEX IF NOT EXISTS idx_skill_synonyms_canonical_lower_btree
    ON skill_synonyms USING btree (LOWER(canonical_skill));

COMMENT ON FUNCTION match_candidates_to_position IS
'Position과 Candidates를 매칭합니다.
Phase 0 (2026-02-01): 동의어 매칭 적용
- React 검색 시 리액트, ReactJS 등 동의어 후보자 포함
- get_canonical_skill() 함수로 정규화된 스킬 비교
- 예상 정확도: 60% → 85%';
