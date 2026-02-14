/**
 * GET /api/cron/send-emails
 * 대기 중인 이메일 발송 (Cron Job)
 *
 * PRD Section 12: Email Notifications System
 *
 * Vercel Cron 또는 외부 스케줄러에서 호출:
 * - 1분마다 실행 권장
 * - CRON_SECRET 헤더로 인증
 */

import { NextRequest, NextResponse } from "next/server";
import { processPendingEmails } from "@/lib/email/service";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 최대 60초

export async function GET(request: NextRequest) {
  // CRON_SECRET 검증
  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    console.error("[Cron:send-emails] Invalid or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron:send-emails] Starting email processing...");

    const stats = await processPendingEmails(50);

    console.log(
      `[Cron:send-emails] Completed: processed=${stats.processed}, sent=${stats.sent}, failed=${stats.failed}`
    );

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron:send-emails] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
