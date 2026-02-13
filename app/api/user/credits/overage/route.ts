/**
 * GET/POST /api/user/credits/overage
 *
 * PRD v0.1 Section 10: Overage Billing (추가 크레딧)
 * Pro 플랜 전용 - 월 크레딧 소진 후 건당 ₩1,500으로 추가 분석 가능
 *
 * GET: 현재 overage 설정 및 사용량 조회
 * POST: overage 설정 변경 (활성화/비활성화, 한도 설정)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiForbidden,
  apiInternalError,
} from "@/lib/api-response";

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

interface OverageResponse {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  unitPrice: number;
  estimatedCharge: number;
  plan: string;
}

interface OverageSettingsRequest {
  enable: boolean;
  monthlyLimit?: number;
}

// ─────────────────────────────────────────────────
// GET: Overage 설정 및 사용량 조회
// ─────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[Overage API] Auth error:", authError?.status || "UNKNOWN");
      return apiUnauthorized();
    }

    // 사용자 정보 조회
    const { data: rawUserData, error: userError } = await supabase
      .from("users")
      .select("plan, overage_enabled, overage_limit, overage_used_this_month")
      .eq("id", user.id)
      .single();

    if (userError || !rawUserData) {
      console.error("[Overage API] User fetch error:", userError?.code || "UNKNOWN");
      return apiInternalError("사용자 정보를 조회할 수 없습니다.");
    }

    // Type assertion for new columns not yet in generated types
    const userData = rawUserData as {
      plan: string;
      overage_enabled: boolean | null;
      overage_limit: number | null;
      overage_used_this_month: number | null;
    };

    // Pro 플랜만 overage 사용 가능
    if (userData.plan !== "pro") {
      return apiForbidden("Overage billing은 Pro 플랜에서만 사용 가능합니다.");
    }

    const enabled = userData.overage_enabled ?? false;
    const limit = userData.overage_limit ?? 100;
    const used = userData.overage_used_this_month ?? 0;
    const unitPrice = 1500; // PRD: 건당 ₩1,500

    const response: OverageResponse = {
      enabled,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      unitPrice,
      estimatedCharge: used * unitPrice,
      plan: userData.plan,
    };

    return apiSuccess(response);
  } catch (error) {
    console.error("[Overage API] GET error:", error);
    return apiInternalError();
  }
}

// ─────────────────────────────────────────────────
// POST: Overage 설정 변경
// ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[Overage API] Auth error:", authError?.status || "UNKNOWN");
      return apiUnauthorized();
    }

    // 요청 바디 파싱
    let body: OverageSettingsRequest;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("요청 본문이 올바른 JSON 형식이 아닙니다.");
    }

    // 필수 필드 검증
    if (typeof body.enable !== "boolean") {
      return apiBadRequest("'enable' 필드는 필수이며 boolean 타입이어야 합니다.");
    }

    // 한도 검증 (1~100)
    if (body.monthlyLimit !== undefined) {
      if (typeof body.monthlyLimit !== "number" || body.monthlyLimit < 1 || body.monthlyLimit > 100) {
        return apiBadRequest("'monthlyLimit'은 1~100 사이의 숫자여야 합니다.");
      }
    }

    // RPC 호출로 설정 변경 (플랜 검증 포함)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
      "set_overage_settings",
      {
        p_user_id: user.id,
        p_enabled: body.enable,
        p_limit: body.monthlyLimit ?? null,
      }
    );

    if (rpcError) {
      console.error("[Overage API] RPC error:", rpcError.message);
      return apiInternalError("설정 변경에 실패했습니다.");
    }

    // RPC 결과 파싱
    const result = rpcResult as { success: boolean; error?: string; enabled?: boolean; limit?: number };

    if (!result.success) {
      // Pro 플랜이 아닌 경우
      return apiForbidden(result.error || "Overage billing은 Pro 플랜에서만 사용 가능합니다.");
    }

    // 업데이트된 정보 다시 조회
    const { data: rawUpdatedUser, error: fetchError } = await supabase
      .from("users")
      .select("overage_enabled, overage_limit, overage_used_this_month")
      .eq("id", user.id)
      .single();

    if (fetchError || !rawUpdatedUser) {
      // 업데이트는 성공했지만 조회 실패 - 결과만 반환
      return apiSuccess({
        enabled: result.enabled ?? body.enable,
        limit: result.limit ?? body.monthlyLimit ?? 100,
        message: "설정이 변경되었습니다.",
      });
    }

    // Type assertion for new columns
    const updatedUser = rawUpdatedUser as {
      overage_enabled: boolean | null;
      overage_limit: number | null;
      overage_used_this_month: number | null;
    };

    const unitPrice = 1500;
    const used = updatedUser.overage_used_this_month ?? 0;

    return apiSuccess({
      enabled: updatedUser.overage_enabled ?? false,
      limit: updatedUser.overage_limit ?? 100,
      used,
      remaining: Math.max(0, (updatedUser.overage_limit ?? 100) - used),
      unitPrice,
      estimatedCharge: used * unitPrice,
      message: "설정이 변경되었습니다.",
    });
  } catch (error) {
    console.error("[Overage API] POST error:", error);
    return apiInternalError();
  }
}
