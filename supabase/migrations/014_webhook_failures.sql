-- Migration: 014_webhook_failures.sql
-- Webhook Dead Letter Queue (실패한 Webhook 재처리용)

-- webhook_failures 테이블 생성
CREATE TABLE IF NOT EXISTS webhook_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 10)
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_job_id ON webhook_failures(job_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created_at ON webhook_failures(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_unresolved ON webhook_failures(created_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE webhook_failures IS 'Webhook 실패 기록 (Dead Letter Queue)';
COMMENT ON COLUMN webhook_failures.retry_count IS '재시도 횟수';
COMMENT ON COLUMN webhook_failures.resolved_at IS '해결된 시각 (NULL이면 미해결)';

-- RLS 정책
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

-- Service Role만 접근 가능
CREATE POLICY "Service role can manage webhook_failures"
    ON webhook_failures FOR ALL
    USING (auth.role() = 'service_role');

-- 미해결 Webhook 재처리 함수
CREATE OR REPLACE FUNCTION retry_failed_webhooks()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- 이 함수는 배치 작업에서 호출될 수 있음
    -- 실제 재시도 로직은 Worker에서 처리
    SELECT COUNT(*) INTO v_count
    FROM webhook_failures
    WHERE resolved_at IS NULL
    AND retry_count < 10
    AND (last_retry_at IS NULL OR last_retry_at < NOW() - INTERVAL '5 minutes');

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
