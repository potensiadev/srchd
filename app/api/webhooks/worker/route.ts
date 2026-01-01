import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Worker Webhook Endpoint
 *
 * Python Worker가 비동기 작업 완료 시 호출하는 웹훅
 * - 작업 상태 업데이트 알림 수신
 * - 실시간 클라이언트 알림 (향후 WebSocket/SSE 연동)
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

interface WebhookPayload {
  job_id: string;
  status: "completed" | "failed";
  result?: {
    candidate_id?: string;
    confidence_score?: number;
    chunk_count?: number;
    pii_count?: number;
    processing_time_ms?: number;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Webhook Secret 검증
    const authHeader = request.headers.get("X-Webhook-Secret");
    if (WEBHOOK_SECRET && authHeader !== WEBHOOK_SECRET) {
      console.warn("Invalid webhook secret");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload: WebhookPayload = await request.json();

    if (!payload.job_id || !payload.status) {
      return NextResponse.json(
        { error: "Invalid payload: job_id and status required" },
        { status: 400 }
      );
    }

    console.log(`[Webhook] Received: job=${payload.job_id}, status=${payload.status}`);

    // Supabase Admin 클라이언트 (Service Role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase credentials not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: "Failed to update job status" },
        { status: 500 }
      );
    }

    // 작업 완료 시 추가 처리
    if (payload.status === "completed" && payload.result?.candidate_id) {
      // 향후: 실시간 알림 (Supabase Realtime, WebSocket 등)
      console.log(`[Webhook] Job completed: candidate=${payload.result.candidate_id}`);
    }

    if (payload.status === "failed") {
      console.warn(`[Webhook] Job failed: ${payload.error}`);
    }

    return NextResponse.json({
      success: true,
      message: `Job ${payload.job_id} status updated to ${payload.status}`,
    });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    endpoint: "worker-webhook",
  });
}
