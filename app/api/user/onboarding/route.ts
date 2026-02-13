/**
 * GET/POST/PUT /api/user/onboarding
 *
 * PRD v0.1 Section 14: 온보딩 플로우
 *
 * GET: 온보딩 상태 조회
 * POST: 온보딩 시작 (step = 1로 설정)
 * PUT: 온보딩 상태 업데이트 (step 변경, 완료 처리)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { OnboardingStep, ONBOARDING_STEPS } from "@/types/onboarding";

// ─────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────

interface OnboardingResponse {
  completed: boolean;
  currentStep: OnboardingStep;
}

interface OnboardingUpdateRequest {
  step?: OnboardingStep;
  completed?: boolean;
}

// ─────────────────────────────────────────────────
// GET: 온보딩 상태 조회
// ─────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiUnauthorized();
    }

    const { data: rawUserData, error: userError } = await supabase
      .from("users")
      .select("onboarding_completed, onboarding_step")
      .eq("id", user.id)
      .single();

    if (userError || !rawUserData) {
      console.error("[Onboarding API] Fetch error:", userError?.code);
      return apiInternalError("온보딩 상태를 조회할 수 없습니다.");
    }

    // Type assertion for new columns
    const userData = rawUserData as {
      onboarding_completed: boolean | null;
      onboarding_step: number | null;
    };

    const response: OnboardingResponse = {
      completed: userData.onboarding_completed ?? false,
      currentStep: (userData.onboarding_step ?? 0) as OnboardingStep,
    };

    return apiSuccess(response);
  } catch (error) {
    console.error("[Onboarding API] GET error:", error);
    return apiInternalError();
  }
}

// ─────────────────────────────────────────────────
// POST: 온보딩 시작
// ─────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiUnauthorized();
    }

    // 온보딩 시작 (step = 1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("users")
      .update({
        onboarding_step: ONBOARDING_STEPS.WELCOME,
        onboarding_completed: false,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[Onboarding API] Start error:", updateError.message);
      return apiInternalError("온보딩 시작에 실패했습니다.");
    }

    return apiSuccess({
      completed: false,
      currentStep: ONBOARDING_STEPS.WELCOME,
      message: "온보딩이 시작되었습니다.",
    });
  } catch (error) {
    console.error("[Onboarding API] POST error:", error);
    return apiInternalError();
  }
}

// ─────────────────────────────────────────────────
// PUT: 온보딩 상태 업데이트
// ─────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiUnauthorized();
    }

    // 요청 바디 파싱
    let body: OnboardingUpdateRequest;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("요청 본문이 올바른 JSON 형식이 아닙니다.");
    }

    // 검증
    if (body.step !== undefined) {
      if (
        typeof body.step !== "number" ||
        body.step < 0 ||
        body.step > ONBOARDING_STEPS.COMPLETED
      ) {
        return apiBadRequest("'step'은 0~6 사이의 숫자여야 합니다.");
      }
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, unknown> = {};

    if (body.step !== undefined) {
      updateData.onboarding_step = body.step;
    }

    if (body.completed !== undefined) {
      updateData.onboarding_completed = body.completed;

      // 완료 처리 시 step도 COMPLETED로 설정
      if (body.completed) {
        updateData.onboarding_step = ONBOARDING_STEPS.COMPLETED;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return apiBadRequest("업데이트할 필드가 없습니다.");
    }

    // DB 업데이트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("users")
      .update(updateData)
      .eq("id", user.id);

    if (updateError) {
      console.error("[Onboarding API] Update error:", updateError.message);
      return apiInternalError("온보딩 상태 업데이트에 실패했습니다.");
    }

    // 업데이트된 상태 반환
    const { data: rawUpdatedData } = await supabase
      .from("users")
      .select("onboarding_completed, onboarding_step")
      .eq("id", user.id)
      .single();

    const updatedData = rawUpdatedData as {
      onboarding_completed: boolean | null;
      onboarding_step: number | null;
    } | null;

    return apiSuccess({
      completed: updatedData?.onboarding_completed ?? false,
      currentStep: (updatedData?.onboarding_step ?? 0) as OnboardingStep,
      message: "온보딩 상태가 업데이트되었습니다.",
    });
  } catch (error) {
    console.error("[Onboarding API] PUT error:", error);
    return apiInternalError();
  }
}
