/**
 * POST /api/upload
 * 이력서 파일 업로드 API
 *
 * 개선사항 (v3):
 * - Rate Limiting (버스트 + 사용자별 + 글로벌)
 * - 동시 업로드 제한 (DB 레벨)
 * - 메모리 최적화 (파일 크기 검증 강화)
 * - 크레딧은 분석 성공 후 Worker에서 차감 (실패 시 차감 없음)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminClient,
  checkConcurrentUploadLimit,
} from "@/lib/supabase/admin";
import { withRateLimit } from "@/lib/rate-limit";
import {
  validateFile,
  calculateRemainingCredits,
  type UserCreditsInfo,
  PLAN_CONFIG,
} from "@/lib/file-validation";
import {
  WORKER_PIPELINE_TIMEOUT,
  MAX_CONCURRENT_UPLOADS,
} from "@/lib/config/timeouts";

// App Router Route Segment Config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Worker URL - defaults to localhost:8000 for local dev
// In production, set WORKER_URL env var to point to deployed worker (e.g., Railway)
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

interface UploadResponse {
  success: boolean;
  jobId?: string;
  candidateId?: string;
  message?: string;
  error?: string;
  code?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  // 상태 추적
  let publicUserId = "";
  let jobId = "";
  let candidateId: string | undefined = undefined;
  let storagePath = "";

  try {
    // ─────────────────────────────────────────────────
    // 1. Rate Limiting 체크 (인증 전 IP 기반)
    // ─────────────────────────────────────────────────
    const rateLimitResponse = await withRateLimit(request, "upload");
    if (rateLimitResponse) return rateLimitResponse as NextResponse<UploadResponse>;

    const supabase = await createClient();
    const adminClient = getAdminClient();

    // ─────────────────────────────────────────────────
    // 2. 인증 확인
    // ─────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ─────────────────────────────────────────────────
    // 3. 사용자 정보 조회 (public.users)
    // ─────────────────────────────────────────────────
    if (!user.email) {
      return NextResponse.json(
        { success: false, error: "사용자 이메일을 찾을 수 없습니다.", code: "NO_EMAIL" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData, error: userError } = await (adminClient as any)
      .from("users")
      .select("id, credits, credits_used_this_month, plan")
      .eq("email", user.email)
      .single();

    if (userError || !userData) {
      // 민감한 정보(이메일) 로깅하지 않음
      console.error("[Upload] User not found: error code", userError?.code || "UNKNOWN");
      return NextResponse.json(
        { success: false, error: "사용자 정보를 찾을 수 없습니다.", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const typedUserData = userData as { id: string; credits: number; credits_used_this_month: number; plan: string };
    publicUserId = typedUserData.id;
    const userPlan = typedUserData.plan || "starter";

    // ─────────────────────────────────────────────────
    // 4. 동시 업로드 제한 체크 (DB 레벨)
    // ─────────────────────────────────────────────────
    const concurrentCheck = await checkConcurrentUploadLimit(
      publicUserId,
      MAX_CONCURRENT_UPLOADS
    );
    if (!concurrentCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `동시에 ${MAX_CONCURRENT_UPLOADS}개까지만 업로드할 수 있습니다. 진행 중인 업로드가 완료된 후 다시 시도해주세요.`,
          code: "CONCURRENT_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // ─────────────────────────────────────────────────
    // 5. 크레딧 사전 체크 (빠른 실패)
    // ─────────────────────────────────────────────────
    const userInfo = userData as UserCreditsInfo;
    const remainingCredits = calculateRemainingCredits(userInfo);

    if (remainingCredits <= 0) {
      return NextResponse.json(
        { success: false, error: "크레딧이 부족합니다.", code: "INSUFFICIENT_CREDITS" },
        { status: 402 }
      );
    }

    // ─────────────────────────────────────────────────
    // 6. FormData 파싱 및 파일 검증
    // ─────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "파일이 제공되지 않았습니다.", code: "NO_FILE" },
        { status: 400 }
      );
    }

    // 파일 버퍼 읽기 (매직 바이트 검증용)
    const fileBuffer = await file.arrayBuffer();

    // 파일 검증 (확장자 + 크기 + 매직 바이트)
    const validation = validateFile({
      fileName: file.name,
      fileSize: file.size,
      fileBuffer: fileBuffer,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || "파일 검증에 실패했습니다.", code: "INVALID_FILE" },
        { status: 400 }
      );
    }

    const ext = validation.extension || "." + file.name.split(".").pop()?.toLowerCase();

    // ─────────────────────────────────────────────────
    // 7. processing_jobs 레코드 생성
    // 크레딧은 분석 성공 후 Worker에서 차감
    // ─────────────────────────────────────────────────
    const jobInsert = {
      user_id: publicUserId,
      file_name: file.name,
      file_size: file.size,
      file_type: ext.replace(".", ""),
      status: "queued" as const,
      candidate_id: null,
      file_path: null,
      parse_method: null,
      page_count: null,
      analysis_mode: null,
      confidence_score: null,
      error_code: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: jobError } = await (adminClient as any)
      .from("processing_jobs")
      .insert(jobInsert)
      .select()
      .single();

    if (jobError) {
      // Unique constraint 위반 (중복 업로드)
      if (jobError.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error: "동일한 파일이 이미 처리 중입니다. 잠시 후 다시 시도해주세요.",
            code: "DUPLICATE_UPLOAD",
          },
          { status: 409 }
        );
      }

      console.error("[Upload] Failed to create job:", jobError);
      throw new Error("처리 작업 생성에 실패했습니다.");
    }

    jobId = (job as { id: string }).id;

    // ─────────────────────────────────────────────────
    // 10. Supabase Storage에 파일 업로드
    // ─────────────────────────────────────────────────
    const safeFileName = `${jobId}${ext}`;
    storagePath = `uploads/${user.id}/${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[Upload] Storage upload failed:", uploadError);

      // job 상태 업데이트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from("processing_jobs")
        .update({
          status: "failed",
          error_code: "STORAGE_ERROR",
          error_message: "파일 저장 중 오류가 발생했습니다.", // 상세 에러 메시지 노출하지 않음
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      throw new Error("파일 업로드에 실패했습니다.");
    }

    // ─────────────────────────────────────────────────
    // 11. candidates 테이블에 초기 레코드 생성
    // ─────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: candidateError } = await (adminClient as any)
      .from("candidates")
      .insert({
        user_id: publicUserId,
        name: file.name,
        status: "processing",
        is_latest: true,
        version: 1,
        source_file: storagePath,
        file_type: ext.replace(".", ""),
      })
      .select()
      .single();

    if (candidateError) {
      console.error("[Upload] Failed to create candidate:", candidateError);
      // 진행은 계속 (Worker가 처리)
    } else {
      candidateId = (candidate as { id: string }).id;

      // processing_jobs에 candidate_id 업데이트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from("processing_jobs")
        .update({ candidate_id: candidateId })
        .eq("id", jobId);
    }

    // ─────────────────────────────────────────────────
    // 12. Worker 파이프라인 호출
    // ─────────────────────────────────────────────────
    const workerPayload = {
      file_url: storagePath,
      file_name: file.name,
      user_id: publicUserId,
      job_id: jobId,
      candidate_id: candidateId,
      mode: userPlan === "pro" ? "phase_2" : "phase_1", // Pro: 3-Way (GPT+Gemini+Claude)
    };

    try {
      const response = await fetch(`${WORKER_URL}/pipeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.WEBHOOK_SECRET || "",
        },
        body: JSON.stringify(workerPayload),
        signal: AbortSignal.timeout(WORKER_PIPELINE_TIMEOUT),
      });

      if (!response.ok) {
        let errorMessage = `Worker 응답 오류 (${response.status})`;
        let errorCode = "WORKER_ERROR";

        try {
          const errorBody = await response.json();
          if (errorBody.error) errorMessage = errorBody.error;
          if (errorBody.code) errorCode = errorBody.code;
        } catch {
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText.slice(0, 200);
          } catch {
            // 무시
          }
        }

        console.error(`[Upload] Worker error: ${response.status} - ${errorMessage}`);

        // 상태 코드별 처리
        if (response.status === 503 || response.status === 502) {
          // Worker 과부하 - queued 유지 (재시도 가능)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (adminClient as any)
            .from("processing_jobs")
            .update({
              error_message: `Worker 일시적 오류: ${errorMessage}`,
            })
            .eq("id", jobId);
        } else if (response.status >= 400 && response.status < 500) {
          // 클라이언트 오류 - 실패 처리
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (adminClient as any)
            .from("processing_jobs")
            .update({
              status: "failed",
              error_code: errorCode,
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);

          if (candidateId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (adminClient as any)
              .from("candidates")
              .update({ status: "failed" })
              .eq("id", candidateId);
          }

          // 크레딧은 presign에서 차감하지 않으므로 환불 불필요

          return NextResponse.json(
            {
              success: false,
              error: `파일 처리 중 오류가 발생했습니다: ${errorMessage}`,
              code: errorCode,
              jobId,
            },
            { status: 400 }
          );
        }
      }
    } catch (error) {
      // Worker 연결 실패
      console.error("[Upload] Worker pipeline request failed:", error);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adminClient as any)
        .from("processing_jobs")
        .update({
          status: "failed",
          error_code: "WORKER_UNREACHABLE",
          error_message: "처리 서버 연결에 실패했습니다.", // 상세 에러 메시지 노출하지 않음
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (candidateId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (adminClient as any)
          .from("candidates")
          .update({ status: "failed" })
          .eq("id", candidateId);
      }

      // 크레딧은 presign에서 차감하지 않으므로 환불 불필요

      return NextResponse.json(
        {
          success: false,
          error: "서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
          code: "WORKER_UNREACHABLE",
          jobId,
        },
        { status: 503 }
      );
    }

    // ─────────────────────────────────────────────────
    // 13. 성공 응답
    // ─────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      jobId,
      candidateId: candidateId || undefined,
      message: "파일이 업로드되었습니다. 백그라운드에서 분석 중입니다.",
    });

  } catch (error) {
    console.error("[Upload] Unexpected error:", error);

    // 크레딧은 presign에서 차감하지 않으므로 환불 불필요

    // job 상태 업데이트 (생성되었다면)
    if (jobId) {
      try {
        const adminClientForCleanup = getAdminClient();
         
        // 내부 에러 메시지는 로깅에만 사용하고, DB에는 일반적인 메시지 저장
        // (프로덕션에서 민감한 정보 노출 방지)
        const sanitizedErrorMessage = "처리 중 오류가 발생했습니다.";
        if (process.env.NODE_ENV === "development") {
          console.error("[Upload] Original error:", error instanceof Error ? error.message : error);
        }
        await (adminClientForCleanup as any)
          .from("processing_jobs")
          .update({
            status: "failed",
            error_code: "INTERNAL_ERROR",
            error_message: sanitizedErrorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch (updateError) {
        console.error("[Upload] Failed to update job status:", updateError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "서버 오류가 발생했습니다.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────
// GET: 업로드 상태 조회
// ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  // 사용자 ID 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userData } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("email", user.email!)
    .single();

  const getPublicUserId = (userData as { id: string } | null)?.id || user.id;

  if (jobId) {
    // 특정 job 조회 (candidate status도 함께)
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("*, candidates!processing_jobs_candidate_id_fkey(status)")
      .eq("id", jobId)
      .eq("user_id", getPublicUserId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "작업을 찾을 수 없습니다.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // candidate status를 최상위 레벨로 추출
    const jobData = data as Record<string, unknown>;
    const candidateStatus = (jobData?.candidates as { status: string } | undefined)?.status;
    return NextResponse.json({
      data: {
        ...jobData,
        candidate_status: candidateStatus,
      }
    });
  }

  // 최근 job 목록 조회
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("user_id", getPublicUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    // 프로덕션에서는 상세 에러 메시지 노출하지 않음
    console.error("[Upload] Job list query error:", error.message);
    return NextResponse.json(
      { error: "데이터 조회 중 오류가 발생했습니다.", code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
