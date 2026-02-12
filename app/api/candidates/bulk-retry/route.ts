/**
 * POST /api/candidates/bulk-retry
 * 여러 후보자의 AI 분석을 병렬로 재시도
 *
 * Request Body:
 * { candidateIds: string[] }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     results: Array<{ candidateId: string, success: boolean, jobId?: string, error?: string }>
 *   }
 * }
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { callWorkerPipelineAsync } from "@/lib/fetch-retry";
import {
  calculateRemainingCredits,
  type UserCreditsInfo,
} from "@/lib/file-validation";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";
const MAX_PARALLEL_RETRIES = 10; // 한 번에 최대 10개 병렬 처리

interface RetryResult {
  candidateId: string;
  success: boolean;
  jobId?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. 인증 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    // 2. Request body 파싱
    const body = await request.json();
    const { candidateIds } = body as { candidateIds: string[] };

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return apiBadRequest("candidateIds 배열이 필요합니다.");
    }

    if (candidateIds.length > MAX_PARALLEL_RETRIES) {
      return apiBadRequest(
        `한 번에 최대 ${MAX_PARALLEL_RETRIES}개까지 재시도할 수 있습니다.`
      );
    }

    // 3. public.users에서 현재 사용자 ID 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData, error: userError } = await (supabase as any)
      .from("users")
      .select("id, credits, credits_used_this_month, plan")
      .eq("email", user.email)
      .single();

    if (userError || !userData) {
      return apiBadRequest("사용자 정보를 찾을 수 없습니다.");
    }

    const publicUserId = userData.id;

    // 4. 모든 후보자 조회 + 권한 검증 (병렬)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidates, error: candidatesError } = await (supabase as any)
      .from("candidates")
      .select("id, user_id, status, source_file")
      .in("id", candidateIds)
      .eq("user_id", publicUserId); // 소유권 검증 포함

    if (candidatesError) {
      console.error("[Bulk Retry] Failed to fetch candidates:", candidatesError);
      return apiInternalError("후보자 정보를 조회할 수 없습니다.");
    }

    // 5. failed 상태인 후보자만 필터링
    const failedCandidates = (candidates || []).filter(
      (c: { status: string }) => c.status === "failed"
    );

    if (failedCandidates.length === 0) {
      return apiBadRequest("재시도 가능한 후보자가 없습니다. (failed 상태만 재시도 가능)");
    }

    // 6. 이전 크레딧 차감 여부 확인 (한 번에 조회)
    const adminClient = getAdminClient();
    const { data: existingTransactions } = await adminClient
      .from("credit_transactions")
      .select("candidate_id")
      .in(
        "candidate_id",
        failedCandidates.map((c: { id: string }) => c.id)
      )
      .in("type", ["usage"]);

    const chargedCandidateIds = new Set(
      (existingTransactions || []).map((t: { candidate_id: string }) => t.candidate_id)
    );

    // 7. 크레딧 체크 (차감 안 된 후보자 수만큼 필요)
    const uncharged = failedCandidates.filter(
      (c: { id: string }) => !chargedCandidateIds.has(c.id)
    );
    const remaining = calculateRemainingCredits(userData as UserCreditsInfo);

    if (uncharged.length > remaining) {
      return apiBadRequest(
        `크레딧이 부족합니다. 필요: ${uncharged.length}, 보유: ${remaining}`
      );
    }

    // 8. 각 후보자의 최근 processing_job 조회 (병렬)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestJobs } = await (supabase as any)
      .from("processing_jobs")
      .select("id, candidate_id, file_name, file_type, file_size, file_path, analysis_mode")
      .in(
        "candidate_id",
        failedCandidates.map((c: { id: string }) => c.id)
      )
      .order("created_at", { ascending: false });

    // candidate_id별 최신 job 매핑
    const jobByCandidate = new Map<string, typeof latestJobs[0]>();
    for (const job of latestJobs || []) {
      if (!jobByCandidate.has(job.candidate_id)) {
        jobByCandidate.set(job.candidate_id, job);
      }
    }

    // 9. 병렬로 재시도 처리
    const results: RetryResult[] = await Promise.all(
      failedCandidates.map(async (candidate: { id: string; source_file: string }) => {
        const candidateId = candidate.id;
        const latestJob = jobByCandidate.get(candidateId);

        // 파일 경로 결정
        const filePath = latestJob?.file_path || candidate.source_file;
        if (!filePath) {
          return {
            candidateId,
            success: false,
            error: "파일 경로를 찾을 수 없습니다.",
          };
        }

        try {
          // 새 processing_job 생성
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newJob, error: newJobError } = await (supabase as any)
            .from("processing_jobs")
            .insert({
              user_id: publicUserId,
              candidate_id: candidateId,
              status: "queued",
              file_name: latestJob?.file_name || "unknown",
              file_type: latestJob?.file_type || "application/pdf",
              file_size: latestJob?.file_size || 0,
              file_path: filePath,
              analysis_mode: latestJob?.analysis_mode || "phase_1",
            })
            .select("id")
            .single();

          if (newJobError || !newJob) {
            console.error(`[Bulk Retry] Failed to create job for ${candidateId}:`, newJobError);
            return {
              candidateId,
              success: false,
              error: "작업 생성 실패",
            };
          }

          // candidates.status = 'processing' 업데이트
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("candidates")
            .update({ status: "processing" })
            .eq("id", candidateId);

          // Worker 파이프라인 호출 (비동기)
          const skipCreditDeduction = chargedCandidateIds.has(candidateId);
          const workerPayload = {
            file_url: filePath,
            file_name: latestJob?.file_name || "unknown",
            user_id: publicUserId,
            job_id: newJob.id,
            candidate_id: candidateId,
            mode: latestJob?.analysis_mode || "phase_1",
            is_retry: true,
            skip_credit_deduction: skipCreditDeduction,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const supabaseAny = supabase as any;
          callWorkerPipelineAsync(WORKER_URL, workerPayload, async (error, attempts) => {
            console.error(
              `[Bulk Retry] Worker failed for ${candidateId} after ${attempts} attempts:`,
              error
            );

            await supabaseAny
              .from("processing_jobs")
              .update({
                status: "failed",
                error_message: `Worker connection failed: ${error}`,
              })
              .eq("id", newJob.id);

            await supabaseAny
              .from("candidates")
              .update({ status: "failed" })
              .eq("id", candidateId);
          });

          console.log(`[Bulk Retry] Started retry for ${candidateId}, jobId: ${newJob.id}`);

          return {
            candidateId,
            success: true,
            jobId: newJob.id,
          };
        } catch (err) {
          console.error(`[Bulk Retry] Error processing ${candidateId}:`, err);
          return {
            candidateId,
            success: false,
            error: err instanceof Error ? err.message : "알 수 없는 오류",
          };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`[Bulk Retry] Completed: ${successCount} success, ${failCount} failed`);

    return apiSuccess({
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error("[Bulk Retry] Unexpected error:", error);
    return apiInternalError("일괄 재시도 중 오류가 발생했습니다.");
  }
}
