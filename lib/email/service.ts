/**
 * Email Service - Resend API 기반 이메일 발송
 *
 * PRD Section 12: Email Notifications System
 *
 * 환경 변수:
 * - RESEND_API_KEY: Resend API 키
 * - EMAIL_FROM: 발신자 이메일 (기본: noreply@srchd.com)
 */

import { createClient } from "@supabase/supabase-js";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "서치드 <noreply@srchd.com>";

// Service Role 클라이언트
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type EmailType =
  | "E-01" // 환영 이메일
  | "E-02" // 비밀번호 변경
  | "E-03" // 계정 삭제 확인
  | "E-04" // 분석 완료
  | "E-05" // 분석 실패
  | "E-06" // JD 매칭 완료
  | "E-07" // 크레딧 부족 경고
  | "E-08" // 크레딧 소진
  | "E-09" // 크레딧 갱신
  | "E-10" // 결제 실패
  | "E-11" // 구독 시작/갱신
  | "E-12"; // 구독 취소 확인

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface QueueEmailResult {
  success: boolean;
  notificationId?: string;
  skipped?: boolean;
  error?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Resend API를 통해 이메일 발송
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Email] Resend API error:", response.status, errorData);
      return {
        success: false,
        error: `Resend API error: ${response.status} - ${JSON.stringify(errorData)}`,
      };
    }

    const data = await response.json();
    console.log("[Email] Sent successfully:", data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("[Email] Send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * DB 큐에 이메일 추가 (queue_email_notification 함수 호출)
 */
export async function queueEmail(
  userId: string,
  emailType: EmailType,
  subject: string,
  metadata: Record<string, unknown> = {}
): Promise<QueueEmailResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc("queue_email_notification", {
      p_user_id: userId,
      p_email_type: emailType,
      p_subject: subject,
      p_metadata: metadata,
    });

    if (error) {
      console.error("[Email] Queue error:", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "User not found" };
    }

    // 스킵 여부 확인
    const { data: notification } = await supabaseAdmin
      .from("email_notifications")
      .select("status")
      .eq("id", data)
      .single();

    const skipped = notification?.status === "skipped";
    console.log(`[Email] Queued ${emailType} for user ${userId}${skipped ? " (skipped)" : ""}`);

    return { success: true, notificationId: data, skipped };
  } catch (error) {
    console.error("[Email] Queue error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 대기 중인 이메일 발송 처리 (Cron Job에서 호출)
 */
export async function processPendingEmails(limit: number = 50): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0 };

  // pending 상태 이메일 조회
  const { data: pendingEmails, error } = await supabaseAdmin
    .from("email_notifications")
    .select("id, user_id, email_type, recipient_email, subject, metadata")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[Email] Fetch pending error:", error);
    return stats;
  }

  if (!pendingEmails || pendingEmails.length === 0) {
    return stats;
  }

  // 동적으로 템플릿 모듈 import (순환 의존성 방지)
  const { generateEmailHtml } = await import("./templates");

  for (const notification of pendingEmails) {
    stats.processed++;

    try {
      // 이메일 본문 생성
      const html = generateEmailHtml(
        notification.email_type as EmailType,
        notification.metadata || {}
      );

      // 발송
      const result = await sendEmail({
        to: notification.recipient_email,
        subject: notification.subject,
        html,
      });

      // 결과 업데이트
      await supabaseAdmin
        .from("email_notifications")
        .update({
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
        })
        .eq("id", notification.id);

      if (result.success) {
        stats.sent++;
      } else {
        stats.failed++;
      }
    } catch (err) {
      stats.failed++;
      console.error("[Email] Process error:", err);

      await supabaseAdmin
        .from("email_notifications")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("id", notification.id);
    }
  }

  console.log(`[Email] Processed ${stats.processed}, sent ${stats.sent}, failed ${stats.failed}`);
  return stats;
}
