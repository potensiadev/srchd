/**
 * POST /api/candidates/[id]/retry
 * AI 분석 실패한 후보자 재시도
 *
 * 크레딧 로직 (v3):
 * - 이전에 차감됨 → 재시도 시 차감 안 함 (skip_credit_deduction: true)
 * - 이전에 미차감 → 성공 시에만 차감 (Worker에서 처리)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { callWorkerPipelineAsync } from "@/lib/fetch-retry";
import { calculateRemainingCredits, type UserCreditsInfo } from "@/lib/file-validation";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiInsufficientCredits,
  apiInternalError,
} from "@/lib/api-response";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    const supabase = await createClient();

    // 1. 인증 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    // 2. public.users에서 현재 사용자 ID 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData, error: userError } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (userError || !userData) {
      return apiBadRequest("사용자 정보를 찾을 수 없습니다.");
    }

    const publicUserId = userData.id;

    // 3. 후보자 정보 조회 + 권한 검증
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: candidateError } = await (supabase as any)
      .from("candidates")
      .select("id, user_id, status, source_file")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return apiNotFound("후보자를 찾을 수 없습니다.");
    }

    // 소유권 검증
    if (candidate.user_id !== publicUserId) {
      return apiForbidden("이 후보자에 대한 권한이 없습니다.");
    }

    // 4. 상태 검증 - failed 상태만 재시도 가능
    if (candidate.status !== "failed") {
      return apiBadRequest(
        "분석 실패 상태의 후보자만 재시도할 수 있습니다.",
        { currentStatus: candidate.status }
      );
    }

    // 5. 가장 최근 processing_job 조회 (파일 정보 + 에러 정보)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestJob, error: jobError } = await (supabase as any)
      .from("processing_jobs")
      .select("id, file_name, file_type, file_size, file_path, analysis_mode")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (jobError || !latestJob) {
      console.error("[Retry] Failed to fetch latest job:", jobError);
      return apiNotFound("이전 처리 작업을 찾을 수 없습니다.");
    }

    // file_path 검증 - 없으면 candidate.source_file 사용
    const filePath = latestJob.file_path || candidate.source_file;
    if (!filePath) {
      console.error("[Retry] No file path found for candidate:", candidateId);
      return apiBadRequest("이력서 파일 경로를 찾을 수 없습니다. 새로 업로드해주세요.");
    }

    // 6. 이전 크레딧 차감 여부 확인
    const adminClient = getAdminClient();
    const { data: existingTransaction, error: txError } = await adminClient
      .from("credit_transactions")
      .select("id, type")
      .eq("candidate_id", candidateId)
      .in("type", ["usage"])
      .limit(1)
      .maybeSingle();

    // maybeSingle()은 결과가 없으면 data=null, 에러 없음
    // 에러가 있으면 실제 DB 에러이므로 로깅
    if (txError) {
      console.error("[Retry] Failed to check credit transaction:", txError);
    }

    const wasAlreadyCharged = !!existingTransaction;
    const skipCreditDeduction = wasAlreadyCharged;

    // 7. 이전에 차감 안 됐으면 크레딧 체크 (차감은 성공 후 Worker에서)
    if (!wasAlreadyCharged) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userCredits, error: creditsError } = await (supabase as any)
        .from("users")
        .select("credits, credits_used_this_month, plan")
        .eq("id", publicUserId)
        .single();

      if (creditsError || !userCredits) {
        return apiInternalError("크레딧 정보를 확인할 수 없습니다.");
      }

      const remaining = calculateRemainingCredits(userCredits as UserCreditsInfo);
      if (remaining <= 0) {
        return apiInsufficientCredits(
          "크레딧이 부족합니다. 재시도하려면 크레딧을 충전해주세요."
        );
      }
    }

    // 8. 새 processing_job 생성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newJob, error: newJobError } = await (supabase as any)
      .from("processing_jobs")
      .insert({
        user_id: publicUserId,
        candidate_id: candidateId,
        status: "queued",
        file_name: latestJob.file_name,
        file_type: latestJob.file_type,
        file_size: latestJob.file_size,
        file_path: filePath,
        analysis_mode: latestJob.analysis_mode || "phase_1",
      })
      .select("id")
      .single();

    if (newJobError || !newJob) {
      console.error("[Retry] Failed to create new job:", newJobError);
      return apiInternalError("재시도 작업을 생성할 수 없습니다.");
    }

    // 9. candidates.status = 'processing' 업데이트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("candidates")
      .update({ status: "processing" })
      .eq("id", candidateId);

    // 10. Worker 파이프라인 호출
    const workerPayload = {
      file_url: filePath,
      file_name: latestJob.file_name,
      user_id: publicUserId,
      job_id: newJob.id,
      candidate_id: candidateId,
      mode: latestJob.analysis_mode || "phase_1",
      is_retry: true,
      skip_credit_deduction: skipCreditDeduction,
    };

    console.log("[Retry] Calling Worker pipeline:", {
      candidateId,
      jobId: newJob.id,
      skipCreditDeduction,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;
    callWorkerPipelineAsync(WORKER_URL, workerPayload, async (error, attempts) => {
      console.error(
        `[Retry] Worker pipeline failed after ${attempts} attempts:`,
        error
      );

      // 실패 시 job/candidate 상태 업데이트
      await supabaseAny
        .from("processing_jobs")
        .update({
          status: "failed",
          error_message: `Worker connection failed after ${attempts} attempts: ${error}`,
        })
        .eq("id", newJob.id);

      await supabaseAny
        .from("candidates")
        .update({ status: "failed" })
        .eq("id", candidateId);

      // 크레딧은 성공 시에만 차감하므로 복구 불필요
      console.log(`[Retry] Worker failed - no credit to release (deduct on success only)`);
    });

    return apiSuccess({
      candidateId,
      jobId: newJob.id,
      message: "분석을 다시 시작했습니다.",
    });
  } catch (error) {
    console.error("[Retry] Unexpected error:", error);
    return apiInternalError("재시도 중 오류가 발생했습니다.");
  }
}
