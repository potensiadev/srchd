-- 2026-02-01
-- FR-002: 매칭 이유 표시 - 동의어 매칭 정보 반환
-- "리액트 → React (동의어 매칭)" 형태의 배지 표시를 위한 데이터 제공
--
-- 변경 사항:
-- - synonym_matches JSONB 컬럼 추가 (후보자 스킬 → 요구 스킬 매핑)
-- - position_candidates 테이블에 synonym_matches 컬럼 추가

-- 1. position_candidates 테이블에 synonym_matches 컬럼 추가
ALTER TABLE position_candidates
ADD COLUMN IF NOT EXISTS synonym_matches JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN position_candidates.synonym_matches IS
'동의어 매칭 정보. 예: [{"candidate_skill": "리액트", "matched_to": "React", "is_synonym": true}]';


-- 2. 기존 함수 DROP (반환 타입 변경을 위해 필요)
DROP FUNCTION IF EXISTS match_candidates_to_position(UUID, UUID, INTEGER, FLOAT);

-- 3. match_candidates_to_position RPC 수정 - synonym_matches 반환 추가
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
    missing_skills TEXT[],
    synonym_matches JSONB
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
    -- Step 2: 후보자별 스킬 매칭 상세 정보
    candidate_skill_details AS (
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
            ) AS missing,
            -- 동의어 매칭 상세 정보 (JSON 배열)
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'candidate_skill', cs.skill,
                            'matched_to', rsv.original_skill,
                            'is_synonym', cs.skill <> rsv.original_skill
                        )
                    )
                    FROM unnest(c.skills) AS cs(skill)
                    INNER JOIN required_skill_variants rsv
                        ON get_canonical_skill(cs.skill) = rsv.canonical
                ),
                '[]'::JSONB
            ) AS syn_matches
        FROM candidates c
        WHERE c.user_id = p_user_id
          AND c.status = 'completed'
          AND c.is_latest = true
    ),
    scores AS (
        SELECT
            csd.cid,
            csd.name,
            csd.last_position,
            csd.last_company,
            csd.exp_years,
            csd.skills,
            csd.photo_url,
            csd.matched,
            csd.missing,
            csd.syn_matches,
            -- Skill Score (0-1)
            CASE
                WHEN v_required_skills_count = 0 THEN 1.0
                ELSE COALESCE(array_length(csd.matched, 1), 0)::FLOAT / v_required_skills_count
            END AS s_score,
            -- Experience Score (0-1)
            CASE
                WHEN csd.exp_years < v_position.min_exp_years THEN
                    GREATEST(0.3, 1.0 - (v_position.min_exp_years - csd.exp_years) * 0.15)
                WHEN v_position.max_exp_years IS NOT NULL AND csd.exp_years > v_position.max_exp_years THEN
                    GREATEST(0.7, 1.0 - (csd.exp_years - v_position.max_exp_years) * 0.05)
                ELSE 1.0
            END AS e_score,
            -- Education Score (0-1)
            CASE
                WHEN v_position.required_education_level IS NULL THEN 1.0
                WHEN csd.education_level = v_position.required_education_level THEN 1.0
                WHEN csd.education_level IN ('master', 'doctorate') AND v_position.required_education_level = 'bachelor' THEN 1.0
                WHEN csd.education_level = 'doctorate' AND v_position.required_education_level = 'master' THEN 1.0
                WHEN csd.education_level = 'bachelor' AND v_position.required_education_level IN ('master', 'doctorate') THEN 0.7
                ELSE 0.5
            END AS edu_score
        FROM candidate_skill_details csd
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
            s.syn_matches,
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
        fs.missing,
        fs.syn_matches
    FROM final_scores fs
    WHERE fs.overall >= p_min_score
    ORDER BY fs.overall DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. save_position_matches RPC 수정 - synonym_matches 저장
CREATE OR REPLACE FUNCTION save_position_matches(
    p_position_id UUID,
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_min_score FLOAT DEFAULT 0.3
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_match RECORD;
BEGIN
    -- 기존 'matched' 상태의 매칭만 삭제 (진행중인 것은 유지)
    DELETE FROM position_candidates
    WHERE position_id = p_position_id
      AND stage = 'matched';

    -- 새 매칭 삽입
    FOR v_match IN
        SELECT * FROM match_candidates_to_position(p_position_id, p_user_id, p_limit, p_min_score)
    LOOP
        INSERT INTO position_candidates (
            position_id,
            candidate_id,
            overall_score,
            skill_score,
            experience_score,
            education_score,
            semantic_score,
            matched_skills,
            missing_skills,
            synonym_matches,
            stage
        ) VALUES (
            p_position_id,
            v_match.candidate_id,
            v_match.overall_score,
            v_match.skill_score,
            v_match.experience_score,
            v_match.education_score,
            v_match.semantic_score,
            v_match.matched_skills,
            v_match.missing_skills,
            v_match.synonym_matches,
            'matched'
        )
        ON CONFLICT (position_id, candidate_id)
        DO UPDATE SET
            overall_score = EXCLUDED.overall_score,
            skill_score = EXCLUDED.skill_score,
            experience_score = EXCLUDED.experience_score,
            education_score = EXCLUDED.education_score,
            semantic_score = EXCLUDED.semantic_score,
            matched_skills = EXCLUDED.matched_skills,
            missing_skills = EXCLUDED.missing_skills,
            synonym_matches = EXCLUDED.synonym_matches,
            matched_at = NOW();

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 부여
GRANT EXECUTE ON FUNCTION match_candidates_to_position TO authenticated;
GRANT EXECUTE ON FUNCTION save_position_matches TO authenticated;

COMMENT ON FUNCTION match_candidates_to_position IS
'Position과 Candidates를 매칭합니다.
Phase 0 (2026-02-01): 동의어 매칭 적용 + 매칭 상세 정보 반환
- React 검색 시 리액트, ReactJS 등 동의어 후보자 포함
- synonym_matches: 동의어 매칭 상세 정보 (후보자 스킬 → 요구 스킬)';
