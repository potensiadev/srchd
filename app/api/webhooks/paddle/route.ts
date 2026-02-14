/**
 * POST /api/webhooks/paddle
 * Paddle Webhook 처리
 *
 * PRD: prd_refund_policy_v0.4.md Section 5, 6
 * QA: refund_policy_test_scenarios_v1.0.md (EC-061 ~ EC-070)
 *
 * 지원 이벤트:
 * - subscription.created: 새 구독 생성
 * - subscription.updated: 구독 업데이트 (업그레이드/다운그레이드)
 * - subscription.canceled: 구독 취소
 * - subscription.past_due: 결제 실패
 * - subscription.activated: 구독 활성화
 * - adjustment.created: 환불 생성 (Phase 2)
 * - adjustment.updated: 환불 상태 변경
 * - transaction.completed: 결제 완료 (결제 금액 기록용)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PADDLE_CONFIG, getPlanByPriceId } from "@/lib/paddle/config";
import { queueEmail } from "@/lib/email/service";
import { generateEmailSubject } from "@/lib/email/templates";
import crypto from "crypto";

// Service Role 클라이언트 (webhook은 인증 없이 호출됨)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PaddleWebhookEvent {
  event_type: string;
  event_id: string;
  occurred_at: string;
  data: {
    id: string; // subscription_id / adjustment_id / transaction_id
    status: string;
    customer_id: string;
    items: Array<{
      price: {
        id: string;
        product_id: string;
      };
    }>;
    current_billing_period?: {
      ends_at: string;
    };
    scheduled_change?: {
      action: string;
      effective_at: string;
    } | null;
    custom_data?: {
      email?: string;
    };
    // Adjustment (refund) specific fields
    action?: "refund" | "credit" | "chargeback";
    subscription_id?: string;
    transaction_id?: string;
    totals?: {
      total: string;
      subtotal: string;
      tax: string;
    };
    // Transaction specific fields
    details?: {
      totals: {
        total: string;
        grand_total: string;
      };
    };
    billed_at?: string;
  };
}

/**
 * Paddle 서명 검증
 */
function verifyPaddleSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature || !PADDLE_CONFIG.webhookSecret) {
    console.error("[Paddle Webhook] Missing signature or secret");
    return false;
  }

  try {
    // Paddle signature format: ts=timestamp;h1=hash
    const parts = signature.split(";");
    const tsMatch = parts.find(p => p.startsWith("ts="));
    const h1Match = parts.find(p => p.startsWith("h1="));

    if (!tsMatch || !h1Match) {
      console.error("[Paddle Webhook] Invalid signature format");
      return false;
    }

    const timestamp = tsMatch.replace("ts=", "");
    const providedHash = h1Match.replace("h1=", "");

    // 5분 이상 된 요청 거부
    const eventTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - eventTime > 300) {
      console.error("[Paddle Webhook] Request too old");
      return false;
    }

    // HMAC 계산
    const signedPayload = `${timestamp}:${rawBody}`;
    const expectedHash = crypto
      .createHmac("sha256", PADDLE_CONFIG.webhookSecret)
      .update(signedPayload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(providedHash),
      Buffer.from(expectedHash)
    );
  } catch (error) {
    console.error("[Paddle Webhook] Signature verification error:", error);
    return false;
  }
}

/**
 * 이메일로 사용자 찾기
 */
async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, plan")
    .eq("email", email)
    .single();

  if (error) {
    console.error("[Paddle Webhook] User lookup error:", error);
    return null;
  }

  return data as { id: string; email: string; plan: string } | null;
}

/**
 * Paddle Customer ID로 사용자 찾기
 */
async function findUserByCustomerId(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, plan")
    .eq("paddle_customer_id", customerId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[Paddle Webhook] User lookup by customer ID error:", error);
  }

  return data as { id: string; email: string; plan: string } | null;
}

/**
 * 구독 상태 업데이트
 */
async function updateSubscription(
  userId: string,
  updates: {
    plan?: string;
    paddle_customer_id?: string;
    paddle_subscription_id?: string;
    subscription_status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  }
) {
  const { error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[Paddle Webhook] Subscription update error:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("paddle-signature");

    // 서명 검증 (프로덕션에서만)
    if (PADDLE_CONFIG.environment === "production") {
      if (!verifyPaddleSignature(rawBody, signature)) {
        console.error("[Paddle Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as PaddleWebhookEvent;
    const { event_type, event_id, data } = event;

    console.log(`[Paddle Webhook] Received: ${event_type} (${event_id})`);

    // 사용자 찾기
    let user = await findUserByCustomerId(data.customer_id);

    // Customer ID로 찾지 못하면 이메일로 시도
    if (!user && data.custom_data?.email) {
      user = await findUserByEmail(data.custom_data.email);
    }

    if (!user) {
      console.error("[Paddle Webhook] User not found for customer:", data.customer_id);
      // 사용자를 찾지 못해도 200 반환 (재시도 방지)
      return NextResponse.json({ received: true, warning: "User not found" });
    }

    // Price ID로 플랜 결정
    const priceId = data.items?.[0]?.price?.id;
    const plan = priceId ? getPlanByPriceId(priceId) : null;

    switch (event_type) {
      case "subscription.created":
      case "subscription.activated": {
        const activatedPlan = plan?.id || "pro";
        await updateSubscription(user.id, {
          plan: activatedPlan,
          paddle_customer_id: data.customer_id,
          paddle_subscription_id: data.id,
          subscription_status: "active",
          current_period_end: data.current_billing_period?.ends_at ?? undefined,
          cancel_at_period_end: false,
        });
        console.log(`[Paddle Webhook] Subscription activated for ${user.email}: ${activatedPlan}`);

        // E-11: 구독 시작 이메일
        const e11Metadata = {
          plan_name: activatedPlan === "pro" ? "Pro" : "Starter",
          credits: activatedPlan === "pro" ? 200 : 10,
          next_billing_date: data.current_billing_period?.ends_at
            ? new Date(data.current_billing_period.ends_at).toLocaleDateString("ko-KR")
            : undefined,
          is_renewal: false,
        };
        await queueEmail(
          user.id,
          "E-11",
          generateEmailSubject("E-11", e11Metadata),
          e11Metadata
        );
        break;
      }

      case "subscription.updated": {
        const updatedPlan = plan?.id || user.plan;
        await updateSubscription(user.id, {
          plan: updatedPlan,
          subscription_status: data.status === "active" ? "active" : data.status,
          current_period_end: data.current_billing_period?.ends_at ?? undefined,
          cancel_at_period_end: data.scheduled_change?.action === "cancel",
        });
        console.log(`[Paddle Webhook] Subscription updated for ${user.email}: ${data.status}`);
        break;
      }

      case "subscription.canceled": {
        await updateSubscription(user.id, {
          subscription_status: "canceled",
          cancel_at_period_end: true,
        });
        console.log(`[Paddle Webhook] Subscription canceled for ${user.email}`);

        // E-12: 구독 취소 확인 이메일
        // 현재 크레딧 조회
        const { data: userData } = await supabaseAdmin
          .from("users")
          .select("credits_remaining, current_period_end")
          .eq("id", user.id)
          .single();

        const e12Metadata = {
          plan_name: user.plan === "pro" ? "Pro" : "Starter",
          end_date: userData?.current_period_end
            ? new Date(userData.current_period_end).toLocaleDateString("ko-KR")
            : "구독 기간 종료일",
          remaining_credits: userData?.credits_remaining ?? 0,
        };
        await queueEmail(
          user.id,
          "E-12",
          generateEmailSubject("E-12", e12Metadata),
          e12Metadata
        );
        break;
      }

      case "subscription.past_due": {
        await updateSubscription(user.id, {
          subscription_status: "past_due",
        });
        console.log(`[Paddle Webhook] Subscription past due for ${user.email}`);

        // E-10: 결제 실패 이메일
        const e10Metadata = {
          plan_name: user.plan === "pro" ? "Pro" : "Starter",
        };
        await queueEmail(
          user.id,
          "E-10",
          generateEmailSubject("E-10", e10Metadata),
          e10Metadata
        );
        break;
      }

      // ─────────────────────────────────────────────────
      // Phase 2: Transaction 이벤트 (결제 금액 기록)
      // ─────────────────────────────────────────────────
      case "transaction.completed": {
        if (data.details?.totals) {
          const paymentAmount = parseInt(data.details.totals.grand_total || data.details.totals.total, 10);
          await supabaseAdmin
            .from("users")
            .update({
              last_payment_amount: paymentAmount,
              last_payment_date: data.billed_at || new Date().toISOString(),
            })
            .eq("id", user.id);
          console.log(`[Paddle Webhook] Transaction completed for ${user.email}: ${paymentAmount}`);

          // E-11: 구독 갱신 이메일 (구독이 이미 활성화된 경우에만)
          // subscription.created/activated와 중복 방지를 위해 갱신만 처리
          const { data: currentUser } = await supabaseAdmin
            .from("users")
            .select("plan, subscription_status, current_period_end")
            .eq("id", user.id)
            .single();

          if (currentUser?.subscription_status === "active" && currentUser?.plan === "pro") {
            const renewalMetadata = {
              plan_name: "Pro",
              credits: 200,
              amount: `${(paymentAmount / 100).toLocaleString("ko-KR")}원`,
              next_billing_date: currentUser.current_period_end
                ? new Date(currentUser.current_period_end).toLocaleDateString("ko-KR")
                : undefined,
              is_renewal: true,
            };
            await queueEmail(
              user.id,
              "E-11",
              generateEmailSubject("E-11", renewalMetadata),
              renewalMetadata
            );
          }
        }
        break;
      }

      // ─────────────────────────────────────────────────
      // Phase 2: Adjustment 이벤트 (환불 처리)
      // ─────────────────────────────────────────────────
      case "adjustment.created":
        if (data.action === "refund") {
          console.log(`[Paddle Webhook] Refund created: ${data.id}, status: ${data.status}`);

          // 환불 요청 상태 업데이트 (transaction_id로 찾기)
          if (data.transaction_id) {
            await supabaseAdmin
              .from("refund_requests")
              .update({
                paddle_refund_id: data.id,
                status: data.status === "approved" ? "completed" : "processing",
                paddle_response: data,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", user.id)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1);
          }
        }
        break;

      case "adjustment.updated":
        if (data.action === "refund") {
          console.log(`[Paddle Webhook] Refund updated: ${data.id}, status: ${data.status}`);

          // paddle_refund_id로 환불 요청 찾아서 상태 업데이트
          const newStatus = data.status === "approved" ? "completed" : data.status === "rejected" ? "failed" : "processing";
          await supabaseAdmin
            .from("refund_requests")
            .update({
              status: newStatus,
              paddle_response: data,
              processed_at: ["approved", "rejected", "reversed"].includes(data.status)
                ? new Date().toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq("paddle_refund_id", data.id);
        }
        break;

      default:
        console.log(`[Paddle Webhook] Unhandled event type: ${event_type}`);
    }

    return NextResponse.json({ received: true, event_type });
  } catch (error) {
    console.error("[Paddle Webhook] Processing error:", error);
    // 500 반환 시 Paddle이 재시도함
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
