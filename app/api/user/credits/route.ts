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

interface CreditsResponse {
  credits: number;           // 추가 구매 크레딧
  creditsUsedThisMonth: number;
  plan: PlanType;
  planBaseCredits: number;   // 플랜 기본 크레딧
  remainingCredits: number;  // 남은 총 크레딧
  billingCycleStart?: string;
  wasReset?: boolean;        // 이번 요청에서 리셋되었는지
}

// 중앙화된 플랜 설정 사용
const PLAN_BASE_CREDITS = PLAN_CONFIG.BASE_CREDITS;

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[Credits API] User:", user?.id, user?.email);

    if (authError || !user) {
      console.log("[Credits API] Auth error:", authError);
      return apiUnauthorized();
    }

    // get_user_credits RPC 호출 (월 변경 시 자동 리셋 포함)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      "get_user_credits",
      { p_user_id: user.id }
    );
    console.log("[Credits API] RPC result:", rpcData, "error:", rpcError);

    // RPC 성공 시 (배열로 반환됨)
    if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
      const creditInfo = rpcData[0] as {
        plan: PlanType;
        base_credits: number;
        bonus_credits: number;      // additional credits
        credits_used: number;       // used this month
        remaining_credits: number;  // remaining total
        billing_cycle_start?: string;
        was_reset?: boolean;
      };

      const response: CreditsResponse = {
        credits: creditInfo.bonus_credits,
        creditsUsedThisMonth: creditInfo.credits_used,
        plan: creditInfo.plan,
        planBaseCredits: creditInfo.base_credits,
        remainingCredits: creditInfo.remaining_credits,
        billingCycleStart: creditInfo.billing_cycle_start,
        wasReset: creditInfo.was_reset,
      };

      console.log("[Credits API] Response:", response);

      return apiSuccess(response);
    }

    // RPC 실패 시 fallback: 직접 조회 (자동 리셋 없음)
    console.warn("[Credits API] RPC failed, using fallback. Email:", user.email);

    if (!user.email) {
      return apiBadRequest("사용자 이메일을 찾을 수 없습니다.");
    }

    // email로 조회 (auth.users.id와 public.users.id가 다를 수 있음)
    const { data, error } = await supabase
      .from("users")
      .select("credits, credits_used_this_month, plan")
      .eq("email", user.email)
      .single();

    console.log("[Credits API] Fallback query result:", data, "error:", error);

    if (error) {
      console.error("[Credits API] Fallback error:", error);
      return apiInternalError(error.message);
    }

    if (!data) {
      console.error("[Credits API] No user data found for email:", user.email);
      return apiNotFound("사용자 정보를 찾을 수 없습니다.");
    }

    // Type assertion for Supabase response
    const userData = data as {
      plan: string;
      credits: number;
      credits_used_this_month: number;
    };

    const plan = (userData.plan as PlanType) || "starter";
    const planBaseCredits = PLAN_BASE_CREDITS[plan];
    const additionalCredits = userData.credits ?? 0;
    const usedThisMonth = userData.credits_used_this_month ?? 0;

    // 남은 크레딧 계산
    const remainingFromPlan = Math.max(0, planBaseCredits - usedThisMonth);
    const remainingCredits = remainingFromPlan + additionalCredits;

    const response: CreditsResponse = {
      credits: additionalCredits,
      creditsUsedThisMonth: usedThisMonth,
      plan,
      planBaseCredits,
      remainingCredits,
    };

    return apiSuccess(response);
  } catch (error) {
    console.error("Credits API error:", error);
    return apiInternalError();
  }
}
