/**
 * GET /api/user/credits
 * 현재 사용자의 크레딧 정보 조회
 * - 월 변경 시 자동 리셋 (get_user_credits 함수 사용)
 */

import { createClient } from "@/lib/supabase/server";
import { type PlanType } from "@/types";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
} from "@/lib/api-response";
import { PLAN_CONFIG } from "@/lib/file-validation";

interface OverageInfo {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  unitPrice: number;  // PRD: 건당 ₩1,500
}

interface CreditsResponse {
  email: string;             // 사용자 이메일
  credits: number;           // 추가 구매 크레딧
  creditsUsedThisMonth: number;
  plan: PlanType;
  planBaseCredits: number;   // 플랜 기본 크레딧
  remainingCredits: number;  // 남은 총 크레딧
  billingCycleStart?: string;
  nextResetDate?: string;    // 다음 크레딧 리셋일
  planStartedAt?: string;    // 플랜 최초 시작일
  wasReset?: boolean;        // 이번 요청에서 리셋되었는지
  overage?: OverageInfo;     // PRD Section 10: Overage 정보 (Pro 전용)
}

// 중앙화된 플랜 설정 사용
const PLAN_BASE_CREDITS = PLAN_CONFIG.BASE_CREDITS;

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      // 민감 정보 로깅하지 않음
      console.error("[Credits API] Auth error: code", authError?.status || "UNKNOWN");
      return apiUnauthorized();
    }

    // get_user_credits RPC 호출 (월 변경 시 자동 리셋 포함)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      "get_user_credits",
      { p_user_id: user.id }
    );

    // RPC 성공 시 (JSON 객체 또는 배열로 반환됨)
    if (!rpcError && rpcData) {
      // RPC 결과가 배열이면 첫 번째 요소, 아니면 직접 사용
      const creditInfo = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
        plan: PlanType;
        base_credits: number;
        additional_credits: number;  // additional credits
        used_this_month: number;     // used this month
        remaining: number;           // remaining total
        billing_cycle_start?: string;
        next_reset_date?: string;    // 다음 리셋일
        plan_started_at?: string;    // 플랜 최초 시작일
        was_reset?: boolean;
        overage?: {                  // PRD Section 10: Overage 정보
          enabled: boolean;
          limit: number;
          used: number;
          remaining: number;
          unit_price: number;
        };
      };

      const response: CreditsResponse = {
        email: user.email || "",
        credits: creditInfo.additional_credits,
        creditsUsedThisMonth: creditInfo.used_this_month,
        plan: creditInfo.plan,
        planBaseCredits: creditInfo.base_credits,
        remainingCredits: creditInfo.remaining,
        billingCycleStart: creditInfo.billing_cycle_start,
        nextResetDate: creditInfo.next_reset_date,
        planStartedAt: creditInfo.plan_started_at,
        wasReset: creditInfo.was_reset,
        // PRD Section 10: Overage 정보 (Pro 전용)
        overage: creditInfo.overage ? {
          enabled: creditInfo.overage.enabled,
          limit: creditInfo.overage.limit,
          used: creditInfo.overage.used,
          remaining: creditInfo.overage.remaining,
          unitPrice: creditInfo.overage.unit_price,
        } : undefined,
      };

      return apiSuccess(response);
    }

    // RPC 실패 시 fallback: 직접 조회 (자동 리셋 없음)
    // 민감 정보(이메일) 로깅하지 않음
    console.warn("[Credits API] RPC failed, using fallback");

    if (!user.email) {
      return apiBadRequest("사용자 이메일을 찾을 수 없습니다.");
    }

    // email로 조회 (auth.users.id와 public.users.id가 다를 수 있음)
    const { data, error } = await supabase
      .from("users")
      .select("credits, credits_used_this_month, plan, billing_cycle_start, plan_started_at")
      .eq("email", user.email)
      .single();

    if (error) {
      // 민감 정보(이메일, 데이터) 로깅하지 않음
      console.error("[Credits API] Fallback error: code", error.code || "UNKNOWN");
      return apiInternalError();
    }

    if (!data) {
      // 이메일 로깅하지 않음 (PII 보호)
      console.error("[Credits API] No user data found");
      return apiNotFound("사용자 정보를 찾을 수 없습니다.");
    }

    // Type assertion for Supabase response
    const userData = data as {
      plan: string;
      credits: number;
      credits_used_this_month: number;
      billing_cycle_start?: string;
      plan_started_at?: string;
    };

    const plan = (userData.plan as PlanType) || "starter";
    const planBaseCredits = PLAN_BASE_CREDITS[plan];
    const additionalCredits = userData.credits ?? 0;
    const usedThisMonth = userData.credits_used_this_month ?? 0;

    // 남은 크레딧 계산
    const remainingFromPlan = Math.max(0, planBaseCredits - usedThisMonth);
    const remainingCredits = remainingFromPlan + additionalCredits;

    // 다음 리셋일 계산 (billing_cycle_start + 1 month)
    let nextResetDate: string | undefined;
    if (userData.billing_cycle_start) {
      const billingStart = new Date(userData.billing_cycle_start);
      billingStart.setMonth(billingStart.getMonth() + 1);
      nextResetDate = billingStart.toISOString().split("T")[0];
    }

    const response: CreditsResponse = {
      email: user.email || "",
      credits: additionalCredits,
      creditsUsedThisMonth: usedThisMonth,
      plan,
      planBaseCredits,
      remainingCredits,
      billingCycleStart: userData.billing_cycle_start,
      nextResetDate,
      planStartedAt: userData.plan_started_at,
    };

    return apiSuccess(response);
  } catch (error) {
    console.error("Credits API error:", error);
    return apiInternalError();
  }
}
