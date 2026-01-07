import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";

// NextResponse는 Health check GET에서 사용

/**
 * Worker Webhook Endpoint
 *
 * Python Worker가 비동기 작업 완료 시 호출하는 웹훅
 * - 작업 상태 업데이트 알림 수신
 * - 실시간 클라이언트 알림 (향후 WebSocket/SSE 연동)
 */

// Webhook Secret 필수 검증
// 환경변수가 설정되지 않으면 모든 요청 거부
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Progressive Loading: parsed, analyzed 상태 추가
type WebhookStatus = "parsed" | "analyzed" | "completed" | "failed";
type WebhookPhase = "parsed" | "analyzed" | "completed";

interface QuickData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

interface WebhookPayload {
  job_id: string;
  status: WebhookStatus;
  phase?: WebhookPhase;  // Progressive Loading phase
  result?: {
    candidate_id?: string;
    phase?: WebhookPhase;
    quick_data?: QuickData;  // Phase 1: parsed 단계에서 전달
    confidence_score?: number;
    chunk_count?: number;
    pii_count?: number;
    processing_time_ms?: number;
    is_update?: boolean;
    parent_id?: string;
    portfolio_thumbnail_url?: string;
    embeddings_failed?: boolean;
    embeddings_error?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Webhook Secret 필수 검증
    if (!WEBHOOK_SECRET) {
      console.error("[Webhook] WEBHOOK_SECRET environment variable is not configured");
      return apiInternalError("서버 설정 오류입니다.");
    }

    const authHeader = request.headers.get("X-Webhook-Secret");
    if (!authHeader || authHeader !== WEBHOOK_SECRET) {
      console.warn("[Webhook] Invalid or missing webhook secret");
      return apiUnauthorized("유효하지 않은 인증 정보입니다.");
    }

    const payload: WebhookPayload = await request.json();

    if (!payload.job_id || !payload.status) {
      return apiBadRequest("job_id와 status가 필요합니다.");
    }

    console.log(`[Webhook] Received: job=${payload.job_id}, status=${payload.status}`);

    // Supabase Admin 클라이언트 (Service Role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase credentials not configured");
      return apiInternalError("서버 설정 오류입니다.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // processing_jobs 상태 업데이트
    // Worker가 이미 업데이트했을 수 있으므로 중복 호출에도 안전
    const updateData: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.status === "completed" && payload.result) {
      updateData.candidate_id = payload.result.candidate_id;
      updateData.confidence_score = payload.result.confidence_score;
      updateData.chunk_count = payload.result.chunk_count;
      updateData.pii_count = payload.result.pii_count;
    }

    if (payload.status === "failed" && payload.error) {
      updateData.error_message = payload.error;
    }

    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update(updateData)
      .eq("id", payload.job_id);

    if (updateError) {
      console.error(`[Webhook] Failed to update job: ${updateError.message}`);
      return apiInternalError("작업 상태 업데이트에 실패했습니다.");
    }

    // ─────────────────────────────────────────────────
    // Progressive Loading: phase별 처리
    // Supabase Realtime이 자동으로 클라이언트에 전파
    // ─────────────────────────────────────────────────
    const phase = payload.result?.phase || payload.phase || payload.status;

    if (phase === "parsed" && payload.result?.candidate_id) {
      // Phase 1: 파싱 완료 - 빠른 기본 정보 추출됨
      console.log(
        `[Webhook] Progressive Phase 1 (parsed): candidate=${payload.result.candidate_id}, ` +
        `name=${payload.result.quick_data?.name}, company=${payload.result.quick_data?.last_company}`
      );
    }

    if (phase === "analyzed" && payload.result?.candidate_id) {
      // Phase 2: AI 분석 완료
      console.log(
        `[Webhook] Progressive Phase 2 (analyzed): candidate=${payload.result.candidate_id}, ` +
        `confidence=${payload.result.confidence_score}`
      );
    }

    if (payload.status === "completed" && payload.result?.candidate_id) {
      // Phase 3: 전체 처리 완료
      console.log(
        `[Webhook] Job completed: candidate=${payload.result.candidate_id}, ` +
        `is_update=${payload.result.is_update}, parent_id=${payload.result.parent_id}`
      );
    }

    if (payload.status === "failed") {
      console.warn(`[Webhook] Job failed: ${payload.error}`);
    }

    return apiSuccess({
      message: `Job ${payload.job_id} status updated to ${payload.status}`,
    });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    return apiInternalError();
  }
}

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    data: {
      status: "ok",
      endpoint: "worker-webhook",
    },
  });
}
