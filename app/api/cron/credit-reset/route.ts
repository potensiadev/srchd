/**
 * GET/POST /api/cron/credit-reset
 *
 * PRD v0.1 Section 6.2: 크레딧 리셋 Cron (Daily Backup)
 *
 * Primary: get_user_credits RPC 호출 시 자동 체크/리셋
 * Backup: 이 Cron 엔드포인트 (매일 03:00 KST 실행)
 *
 * Vercel Cron Schedule: "0 18 * * *" (UTC 18:00 = KST 03:00)
 *
 * T2-4 개선:
 * - 재시도 로직 (최대 3회)
 * - 상태 추적 테이블 기록
 * - 실패 시 알림
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ─────────────────────────────────────────────────
// Cron 인증 검증
// ─────────────────────────────────────────────────

function validateCronRequest(request: NextRequest): boolean {
  // Vercel Cron 인증
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET이 설정되어 있으면 검증
  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
  }

  // 개발 환경에서는 localhost 허용
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  // Vercel Cron 기본 헤더 확인
  return request.headers.has("x-vercel-cron");
}

// ─────────────────────────────────────────────────
// GET: 크레딧 리셋 실행
// ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 인증 확인
  if (!validateCronRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = getAdminClient();
  const jobId = `credit-reset-${Date.now()}`;
  let lastError: Error | null = null;
  let attempt = 0;

  console.log(`[Credit Reset Cron] Starting job ${jobId}...`);

  // 재시도 로직
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      console.log(`[Credit Reset Cron] Attempt ${attempt}/${MAX_RETRIES}`);

      // reset_monthly_credits RPC 호출 (billing_cycle 지난 사용자들 일괄 리셋)
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "reset_monthly_credits"
      );

      if (rpcError) {
        throw new Error(`RPC error: ${rpcError.message}`);
      }

      // RPC 결과 파싱
      const result = rpcResult as {
        success: boolean;
        reset_count: number;
        timestamp: string;
      };

      console.log(`[Credit Reset Cron] Job ${jobId} completed:`, result);

      // 실행 기록 저장
      await recordCronExecution(supabase, jobId, "success", result.reset_count);

      // 이메일 알림 큐잉 (E-09: 크레딧 갱신 알림)
      if (result.reset_count > 0) {
        await queueCreditResetEmails(supabase, result.reset_count);
      }

      return NextResponse.json({
        success: true,
        jobId,
        resetCount: result.reset_count,
        attempts: attempt,
        timestamp: new Date().toISOString(),
        message: `${result.reset_count}명의 사용자 크레딧이 리셋되었습니다.`,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Credit Reset Cron] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }

  // 모든 재시도 실패
  console.error(`[Credit Reset Cron] Job ${jobId} failed after ${MAX_RETRIES} attempts`);
  await recordCronExecution(supabase, jobId, "failed", 0, lastError?.message);

  return NextResponse.json(
    {
      success: false,
      jobId,
      attempts: attempt,
      error: lastError?.message || "Unknown error",
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

// POST도 지원 (수동 실행용)
export async function POST(request: NextRequest) {
  return GET(request);
}

// ─────────────────────────────────────────────────
// Cron 실행 기록 (모니터링용)
// ─────────────────────────────────────────────────

async function recordCronExecution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  status: "success" | "failed",
  resetCount: number,
  errorMessage?: string
): Promise<void> {
  try {
    // cron_executions 테이블이 있으면 기록 (없으면 무시)
    await supabase.from("cron_executions").insert({
      job_id: jobId,
      job_type: "credit_reset",
      status,
      result: { reset_count: resetCount },
      error_message: errorMessage,
      executed_at: new Date().toISOString(),
    });
  } catch {
    // 테이블이 없어도 에러 무시 (선택적 기능)
    console.log("[Credit Reset Cron] Execution record skipped (table may not exist)");
  }
}

// ─────────────────────────────────────────────────
// 크레딧 리셋 이메일 큐잉 (E-09)
// ─────────────────────────────────────────────────

async function queueCreditResetEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  resetCount: number
): Promise<void> {
  try {
    // 오늘 리셋된 사용자들 조회 (credits_reset_at이 오늘인 사용자)
    const today = new Date().toISOString().split("T")[0];

    const { data: resetUsers, error: fetchError } = await supabase
      .from("users")
      .select("id, email, plan")
      .gte("credits_reset_at", `${today}T00:00:00Z`)
      .lt("credits_reset_at", `${today}T23:59:59Z`);

    if (fetchError) {
      console.error("[Credit Reset Cron] Failed to fetch reset users:", fetchError.message);
      return;
    }

    if (!resetUsers || resetUsers.length === 0) {
      console.log("[Credit Reset Cron] No users to notify");
      return;
    }

    // 각 사용자에게 E-09 이메일 큐잉
    for (const user of resetUsers) {
      const { error: queueError } = await supabase.rpc("queue_email_notification", {
        p_user_id: user.id,
        p_email_type: "E-09",
        p_subject: "[서치드] 크레딧이 갱신되었습니다",
        p_metadata: JSON.stringify({
          plan: user.plan,
          reset_date: today,
        }),
      });

      if (queueError) {
        console.error(`[Credit Reset Cron] Failed to queue email for user ${user.id}:`, queueError.message);
      }
    }

    console.log(`[Credit Reset Cron] Queued ${resetUsers.length} email notifications`);
  } catch (error) {
    console.error("[Credit Reset Cron] Email queue error:", error);
  }
}
