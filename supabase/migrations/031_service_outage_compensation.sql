-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 031: Service Outage Compensation
-- 서비스 장애 보상 시스템
--
-- PRD: prd_refund_policy_v0.4.md Section 7
-- QA: refund_policy_test_scenarios_v1.0.md (Phase 3)
--
-- 변경 사항:
-- 1. incident_reports 테이블 생성
-- 2. incident_compensations 테이블 생성
-- 3. 보상 처리 RPC 함수 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ENUM 타입 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 장애 등급
DO $$
BEGIN
    CREATE TYPE incident_level AS ENUM ('P1', 'P2', 'P3');
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 장애 상태
DO $$
BEGIN
    CREATE TYPE incident_status AS ENUM ('ongoing', 'resolved', 'compensation_pending', 'compensation_completed');
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. incident_reports 테이블 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 장애 정보
    level incident_level NOT NULL,
    status incident_status DEFAULT 'ongoing',
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- 장애 기간
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_hours FLOAT GENERATED ALWAYS AS (
        CASE
            WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600
            ELSE NULL
        END
    ) STORED,

    -- 영향 범위
    affected_services TEXT[] DEFAULT '{}',
    affected_user_count INTEGER,

    -- 보상 처리
    compensation_rate FLOAT,  -- 자동 계산 또는 수동 설정
    compensation_processed_at TIMESTAMPTZ,

    -- 관리자 정보
    created_by VARCHAR(255),  -- admin email
    resolved_by VARCHAR(255),

    -- 메타
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_level ON incident_reports(level);
CREATE INDEX IF NOT EXISTS idx_incident_reports_started ON incident_reports(started_at DESC);

-- 코멘트
COMMENT ON TABLE incident_reports IS '서비스 장애 보고서';
COMMENT ON COLUMN incident_reports.level IS 'P1: 전체 불가 4h+, P2: 핵심기능 불가 8h+, P3: 일부 저하 24h+';
COMMENT ON COLUMN incident_reports.compensation_rate IS 'P1: 0.15, P2: 0.10, P3: 0.05 (또는 관리자 수동 설정)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. incident_compensations 테이블 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS incident_compensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 보상 정보
    credits_granted INTEGER NOT NULL,
    plan_at_incident VARCHAR(50),  -- 장애 시점의 사용자 플랜

    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,

    -- 알림 상태
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMPTZ,

    -- 메타
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_incident_compensations_incident ON incident_compensations(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_compensations_user ON incident_compensations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_compensations_unique ON incident_compensations(incident_id, user_id);

-- 코멘트
COMMENT ON TABLE incident_compensations IS '장애 보상 지급 내역';
COMMENT ON COLUMN incident_compensations.idempotency_key IS '중복 보상 방지: incident_{incident_id}_user_{user_id}';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 보상 크레딧 계산 함수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION calculate_compensation_credits(
    p_plan VARCHAR(50),
    p_incident_level incident_level
) RETURNS INTEGER AS $$
DECLARE
    v_base_credits INTEGER;
    v_rate FLOAT;
BEGIN
    -- 플랜별 기본 크레딧
    v_base_credits := CASE p_plan
        WHEN 'starter' THEN 50
        WHEN 'pro' THEN 150
        WHEN 'enterprise' THEN 300
        ELSE 50
    END;

    -- 장애 등급별 보상률
    v_rate := CASE p_incident_level
        WHEN 'P1' THEN 0.15
        WHEN 'P2' THEN 0.10
        WHEN 'P3' THEN 0.05
        ELSE 0.05
    END;

    RETURN CEIL(v_base_credits * v_rate);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 장애 보상 처리 RPC 함수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION process_incident_compensation(
    p_incident_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_incident RECORD;
    v_user RECORD;
    v_credits INTEGER;
    v_idempotency_key TEXT;
    v_processed_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    -- 장애 정보 조회
    SELECT * INTO v_incident
    FROM incident_reports
    WHERE id = p_incident_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Incident not found'
        );
    END IF;

    -- 이미 처리된 경우
    IF v_incident.status = 'compensation_completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'Already processed'
        );
    END IF;

    -- 활성 구독자 대상 보상 처리
    FOR v_user IN
        SELECT id, plan
        FROM users
        WHERE subscription_status = 'active'
          AND plan != 'starter'  -- 무료 플랜 제외
    LOOP
        v_idempotency_key := 'incident_' || p_incident_id || '_user_' || v_user.id;

        -- 이미 보상 받은 경우 스킵
        IF EXISTS (SELECT 1 FROM incident_compensations WHERE idempotency_key = v_idempotency_key) THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- 보상 크레딧 계산
        v_credits := calculate_compensation_credits(v_user.plan, v_incident.level);

        -- 보상 기록 생성
        INSERT INTO incident_compensations (
            incident_id,
            user_id,
            credits_granted,
            plan_at_incident,
            idempotency_key
        ) VALUES (
            p_incident_id,
            v_user.id,
            v_credits,
            v_user.plan,
            v_idempotency_key
        );

        -- 크레딧 지급 (추가 크레딧으로)
        UPDATE users
        SET credits = credits + v_credits
        WHERE id = v_user.id;

        -- 크레딧 트랜잭션 기록
        INSERT INTO credit_transactions (
            user_id,
            type,
            amount,
            balance_after,
            description,
            metadata
        )
        SELECT
            v_user.id,
            'compensation',
            v_credits,
            credits,
            '서비스 장애 보상 (' || v_incident.level || ')',
            jsonb_build_object(
                'incident_id', p_incident_id,
                'incident_title', v_incident.title,
                'incident_level', v_incident.level::TEXT
            )
        FROM users
        WHERE id = v_user.id;

        v_processed_count := v_processed_count + 1;
    END LOOP;

    -- 장애 상태 업데이트
    UPDATE incident_reports
    SET
        status = 'compensation_completed',
        compensation_processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_incident_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'processed_count', v_processed_count,
        'skipped_count', v_skipped_count,
        'incident_id', p_incident_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. 장애 종료 및 보상 대기 설정 함수
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION resolve_incident(
    p_incident_id UUID,
    p_resolved_by VARCHAR(255) DEFAULT 'system'
) RETURNS JSONB AS $$
DECLARE
    v_incident RECORD;
    v_duration FLOAT;
    v_auto_rate FLOAT;
BEGIN
    -- 장애 정보 조회
    SELECT * INTO v_incident
    FROM incident_reports
    WHERE id = p_incident_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Incident not found');
    END IF;

    -- 종료 시간 설정
    UPDATE incident_reports
    SET
        ended_at = NOW(),
        status = 'compensation_pending',
        resolved_by = p_resolved_by,
        updated_at = NOW()
    WHERE id = p_incident_id
    RETURNING EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600 INTO v_duration;

    -- 자동 보상률 설정 (등급 기준)
    v_auto_rate := CASE v_incident.level
        WHEN 'P1' THEN 0.15
        WHEN 'P2' THEN 0.10
        WHEN 'P3' THEN 0.05
    END;

    UPDATE incident_reports
    SET compensation_rate = v_auto_rate
    WHERE id = p_incident_id AND compensation_rate IS NULL;

    RETURN jsonb_build_object(
        'success', true,
        'incident_id', p_incident_id,
        'duration_hours', ROUND(v_duration::NUMERIC, 2),
        'compensation_rate', v_auto_rate
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. RLS 정책
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_compensations ENABLE ROW LEVEL SECURITY;

-- 장애 보고서: 모든 사용자 조회 가능 (공개 정보)
DROP POLICY IF EXISTS incident_reports_select ON incident_reports;
CREATE POLICY incident_reports_select ON incident_reports
    FOR SELECT USING (true);

-- 보상 내역: 본인 것만 조회 가능
DROP POLICY IF EXISTS incident_compensations_select ON incident_compensations;
CREATE POLICY incident_compensations_select ON incident_compensations
    FOR SELECT USING (user_id = auth.uid());

-- 코멘트
COMMENT ON FUNCTION calculate_compensation_credits(VARCHAR, incident_level) IS '장애 등급별 보상 크레딧 계산';
COMMENT ON FUNCTION process_incident_compensation(UUID) IS '장애 보상 일괄 처리 (관리자용)';
COMMENT ON FUNCTION resolve_incident(UUID, VARCHAR) IS '장애 종료 및 보상 대기 설정';
