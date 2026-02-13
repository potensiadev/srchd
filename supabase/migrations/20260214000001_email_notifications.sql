-- ============================================================
-- PRD v0.1 Section 12.4: Email Notifications System
-- Creates tables for email notification queue and user preferences
-- ============================================================

-- ----
-- 1. EMAIL TYPE ENUM
-- ----

DO $$
BEGIN
    CREATE TYPE email_type AS ENUM (
        'E-01',  -- 환영 이메일
        'E-02',  -- 비밀번호 변경
        'E-03',  -- 계정 삭제 확인
        'E-04',  -- 분석 완료
        'E-05',  -- 분석 실패
        'E-06',  -- JD 매칭 완료
        'E-07',  -- 크레딧 부족 경고
        'E-08',  -- 크레딧 소진
        'E-09',  -- 크레딧 갱신
        'E-10',  -- 결제 실패
        'E-11',  -- 구독 시작/갱신
        'E-12'   -- 구독 취소 확인
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----
-- 2. EMAIL STATUS ENUM
-- ----

DO $$
BEGIN
    CREATE TYPE email_status AS ENUM (
        'pending',   -- 발송 대기
        'sent',      -- 발송 완료
        'failed',    -- 발송 실패
        'skipped'    -- 중복 방지로 건너뜀
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----
-- 3. EMAIL_NOTIFICATIONS TABLE
-- ----

CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_type email_type NOT NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    status email_status DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',  -- 이벤트별 추가 데이터 (예: 분석 완료 건수, 크레딧 잔여량)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_notifications IS 'PRD Section 12: 이메일 알림 발송 큐 및 이력';
COMMENT ON COLUMN email_notifications.email_type IS 'E-01~E-12 이메일 유형';
COMMENT ON COLUMN email_notifications.metadata IS '이벤트별 추가 데이터 (JSON)';

-- ----
-- 4. EMAIL_PREFERENCES TABLE
-- ----

CREATE TABLE IF NOT EXISTS email_preferences (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
    analysis_complete BOOLEAN DEFAULT TRUE,   -- E-04: 분석 완료 알림
    match_complete BOOLEAN DEFAULT TRUE,      -- E-06: JD 매칭 완료 알림
    credit_renewal BOOLEAN DEFAULT TRUE,      -- E-09: 크레딧 갱신 알림
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_preferences IS 'PRD Section 12.3: 사용자별 이메일 알림 구독 설정 (필수 알림 제외)';
COMMENT ON COLUMN email_preferences.analysis_complete IS 'E-04 분석 완료 알림 수신 여부';
COMMENT ON COLUMN email_preferences.match_complete IS 'E-06 JD 매칭 완료 알림 수신 여부';
COMMENT ON COLUMN email_preferences.credit_renewal IS 'E-09 크레딧 갱신 알림 수신 여부';

-- ----
-- 5. INDEXES
-- ----

-- 사용자별 최근 이메일 조회
CREATE INDEX IF NOT EXISTS idx_email_notifications_user
    ON email_notifications(user_id, email_type, created_at DESC);

-- 발송 대기 이메일 조회 (Cron Job용)
CREATE INDEX IF NOT EXISTS idx_email_notifications_pending
    ON email_notifications(status, created_at)
    WHERE status = 'pending';

-- 중복 발송 방지 체크용 (동일 타입 1시간 내 미발송)
CREATE INDEX IF NOT EXISTS idx_email_notifications_dedup
    ON email_notifications(user_id, email_type, created_at DESC)
    WHERE status = 'sent';

-- ----
-- 6. ROW LEVEL SECURITY
-- ----

ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- email_notifications: 사용자는 본인 이메일만 조회 가능
DROP POLICY IF EXISTS "Users can view own email notifications" ON email_notifications;
CREATE POLICY "Users can view own email notifications"
    ON email_notifications FOR SELECT
    USING (user_id = auth.uid());

-- email_preferences: 사용자는 본인 설정만 조회/수정 가능
DROP POLICY IF EXISTS "Users can view own email preferences" ON email_preferences;
CREATE POLICY "Users can view own email preferences"
    ON email_preferences FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own email preferences" ON email_preferences;
CREATE POLICY "Users can update own email preferences"
    ON email_preferences FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own email preferences" ON email_preferences;
CREATE POLICY "Users can insert own email preferences"
    ON email_preferences FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Service role policies (Worker에서 이메일 발송 시 필요)
DROP POLICY IF EXISTS "Service role can manage email notifications" ON email_notifications;
CREATE POLICY "Service role can manage email notifications"
    ON email_notifications FOR ALL
    USING (auth.role() = 'service_role');

-- ----
-- 7. TRIGGERS
-- ----

-- email_preferences updated_at 자동 갱신
DROP TRIGGER IF EXISTS email_preferences_updated_at ON email_preferences;
CREATE TRIGGER email_preferences_updated_at
    BEFORE UPDATE ON email_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----
-- 8. AUTO-CREATE EMAIL PREFERENCES ON USER SIGNUP
-- ----

CREATE OR REPLACE FUNCTION create_email_preferences_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_email_preferences ON users;
CREATE TRIGGER on_user_created_email_preferences
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_email_preferences_for_new_user();

-- ----
-- 9. HELPER FUNCTION: CHECK DUPLICATE EMAIL (1시간 내 동일 타입)
-- ----

CREATE OR REPLACE FUNCTION can_send_email(
    p_user_id UUID,
    p_email_type email_type
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_sent TIMESTAMPTZ;
BEGIN
    SELECT MAX(sent_at) INTO v_last_sent
    FROM email_notifications
    WHERE user_id = p_user_id
      AND email_type = p_email_type
      AND status = 'sent'
      AND sent_at > NOW() - INTERVAL '1 hour';

    RETURN v_last_sent IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_send_email IS 'PRD Section 12.3: 동일 이벤트 1시간 내 중복 발송 방지 체크';

-- ----
-- 10. HELPER FUNCTION: QUEUE EMAIL NOTIFICATION
-- ----

CREATE OR REPLACE FUNCTION queue_email_notification(
    p_user_id UUID,
    p_email_type email_type,
    p_subject TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_email TEXT;
    v_notification_id UUID;
    v_can_send BOOLEAN;
    v_pref_enabled BOOLEAN;
BEGIN
    -- 사용자 이메일 조회
    SELECT email INTO v_email FROM users WHERE id = p_user_id;
    IF v_email IS NULL THEN
        RETURN NULL;
    END IF;

    -- 중복 발송 체크
    v_can_send := can_send_email(p_user_id, p_email_type);
    IF NOT v_can_send THEN
        -- 중복으로 건너뜀
        INSERT INTO email_notifications (user_id, email_type, recipient_email, subject, status, metadata)
        VALUES (p_user_id, p_email_type, v_email, p_subject, 'skipped', p_metadata)
        RETURNING id INTO v_notification_id;
        RETURN v_notification_id;
    END IF;

    -- 사용자 선호도 체크 (구독 해제 가능한 이메일만)
    IF p_email_type IN ('E-04', 'E-06', 'E-09') THEN
        SELECT
            CASE p_email_type
                WHEN 'E-04' THEN analysis_complete
                WHEN 'E-06' THEN match_complete
                WHEN 'E-09' THEN credit_renewal
            END INTO v_pref_enabled
        FROM email_preferences
        WHERE user_id = p_user_id;

        IF v_pref_enabled = FALSE THEN
            INSERT INTO email_notifications (user_id, email_type, recipient_email, subject, status, metadata)
            VALUES (p_user_id, p_email_type, v_email, p_subject, 'skipped',
                    p_metadata || '{"skip_reason": "user_unsubscribed"}'::jsonb)
            RETURNING id INTO v_notification_id;
            RETURN v_notification_id;
        END IF;
    END IF;

    -- 발송 큐에 추가
    INSERT INTO email_notifications (user_id, email_type, recipient_email, subject, status, metadata)
    VALUES (p_user_id, p_email_type, v_email, p_subject, 'pending', p_metadata)
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION queue_email_notification IS 'PRD Section 12: 이메일 알림 큐에 추가 (중복/구독해제 자동 체크)';

-- DONE
