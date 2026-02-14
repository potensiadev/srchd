import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { invalidateUserSearchCache } from "@/lib/cache";
import { checkQualityRefundCondition } from "@/lib/refund/config";
import { queueEmail } from "@/lib/email/service";
import { generateEmailSubject } from "@/lib/email/templates";

// NextResponse는 Health check GET에서 사용

/**
 * Worker Webhook Endpoint
 *
 * Python Worker가 비동기 작업 완료 시 호출하는 웹훅
 * - 작업 상태 업데이트 알림 수신
 * - 실시간 클라이언트 알림 (향후 WebSocket/SSE 연동)
 */

// Webhook Secret 필수 검증
// 환경변수가 설정되지 않으면 모든 요청 거부
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * 다음 크레딧 갱신일 계산 (다음 달 1일)
 */
function getNextResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * 품질 환불 처리 함수
 *
 * PRD: prd_refund_policy_v0.4.md Section 3.3.2
 * QA: refund_policy_test_scenarios_v1.0.md (EC-001 ~ EC-030)
 *
 * Advisory Lock과 Idempotency를 포함한 RPC 호출
 */
async function processQualityRefund(
  supabase: SupabaseClient,
  params: {
    candidateId: string;
    userId: string;
    jobId: string;
    confidence: number;
    missingFields: string[];
  }
): Promise<{ success: boolean; idempotent?: boolean; error?: string }> {
  const { candidateId, userId, jobId, confidence, missingFields } = params;

  try {
    // RPC로 Atomic 환불 처리 (Advisory Lock 포함)
    const { data, error } = await supabase.rpc("process_quality_refund", {
      p_candidate_id: candidateId,
      p_user_id: userId,
      p_job_id: jobId,
      p_confidence: confidence,
      p_missing_fields: missingFields,
    });

    if (error) {
      console.error("[QualityRefund] RPC Error:", error);
      return { success: false, error: error.message };
    }

    // RPC 결과 확인
    const result = data as { success: boolean; idempotent?: boolean; error?: string };
    if (!result?.success) {
      console.error("[QualityRefund] RPC returned failure:", result?.error);
      return { success: false, error: result?.error || "Unknown error" };
    }

    // Storage 파일 삭제 시도 (실패해도 환불은 완료된 상태)
    try {
      const { data: job } = await supabase
        .from("processing_jobs")
        .select("file_name")
        .eq("id", jobId)
        .single();

      if (job?.file_name) {
        const ext = job.file_name.split(".").pop() || "pdf";
        const storagePath = `uploads/${userId}/${jobId}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from("resumes")
          .remove([storagePath]);

        if (storageError) {
          // Storage 삭제 실패 - 로깅 (배치 cleanup에서 재시도)
          console.error(
            `[QualityRefund] Storage deletion failed: ${storagePath}`,
            storageError
          );
        } else {
          console.log(`[QualityRefund] File deleted: ${storagePath}`);
        }
      }
    } catch (storageErr) {
      console.error("[QualityRefund] Storage operation error:", storageErr);
      // Storage 실패는 무시하고 환불 성공으로 처리
    }

    console.log(
      `[QualityRefund] Processed: candidate=${candidateId}, confidence=${confidence}, ` +
        `missing=${missingFields.join(",")}, idempotent=${result.idempotent}`
    );

    return { success: true, idempotent: result.idempotent };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[QualityRefund] Unexpected error:", err);
    return { success: false, error: errorMsg };
  }
}

/**
 * 사용자에게 Realtime 알림 전송
 *
 * PRD: prd_refund_policy_v0.4.md Section 3.4
 * Supabase Realtime Broadcast 사용
 */
async function notifyUserRefund(
  supabase: SupabaseClient,
  userId: string,
  eventType: "quality_refund" | "upload_refund",
  details: {
    candidateId?: string;
    confidence?: number;
    missingFields?: string[];
  }
): Promise<void> {
  try {
    // Supabase Realtime Broadcast
    const channel = supabase.channel(`user:${userId}`);

    await channel.send({
      type: "broadcast",
      event: "refund_notification",
      payload: {
        type: eventType,
        message:
          eventType === "quality_refund"
            ? "분석 품질이 기준에 미달하여 크레딧이 자동 환불되었습니다."
            : "파일 처리 실패로 크레딧이 환불되었습니다.",
        details,
        timestamp: new Date().toISOString(),
      },
    });

    // 채널 정리
    supabase.removeChannel(channel);

    console.log(`[Webhook] Refund notification sent to user: ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error("[Webhook] Failed to send refund notification:", err);
    // 알림 실패는 환불 성공에 영향 없음
  }
}

// Progressive Loading: parsed, analyzed 상태 추가
type WebhookStatus = "parsed" | "analyzed" | "completed" | "failed";
type WebhookPhase = "parsed" | "analyzed" | "completed";

interface QuickData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

interface WebhookPayload {
  job_id: string;
  status: WebhookStatus;
  phase?: WebhookPhase;  // Progressive Loading phase
  result?: {
    candidate_id?: string;
    phase?: WebhookPhase;
    quick_data?: QuickData;  // Phase 1: parsed 단계에서 전달
    confidence_score?: number;
    chunk_count?: number;
    pii_count?: number;
    processing_time_ms?: number;
    is_update?: boolean;
    parent_id?: string;
    portfolio_thumbnail_url?: string;
    embeddings_failed?: boolean;
    embeddings_error?: string;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Webhook Secret 필수 검증
    if (!WEBHOOK_SECRET) {
      console.error("[Webhook] WEBHOOK_SECRET environment variable is not configured");
      return apiInternalError("서버 설정 오류입니다.");
    }

    const authHeader = request.headers.get("X-Webhook-Secret");
    if (!authHeader || authHeader !== WEBHOOK_SECRET) {
      console.warn("[Webhook] Invalid or missing webhook secret");
      return apiUnauthorized("유효하지 않은 인증 정보입니다.");
    }

    const payload: WebhookPayload = await request.json();

    if (!payload.job_id || !payload.status) {
      return apiBadRequest("job_id와 status가 필요합니다.");
    }

    console.log(`[Webhook] Received: job=${payload.job_id}, status=${payload.status}`);

    // Supabase Admin 클라이언트 (Service Role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase credentials not configured");
      return apiInternalError("서버 설정 오류입니다.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // processing_jobs 상태 업데이트
    // Worker가 이미 업데이트했을 수 있으므로 중복 호출에도 안전
    const updateData: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.status === "completed" && payload.result) {
      updateData.candidate_id = payload.result.candidate_id;
      updateData.confidence_score = payload.result.confidence_score;
      updateData.chunk_count = payload.result.chunk_count;
      updateData.pii_count = payload.result.pii_count;
    }

    if (payload.status === "failed" && payload.error) {
      updateData.error_message = payload.error;
    }

    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update(updateData)
      .eq("id", payload.job_id);

    if (updateError) {
      console.error(`[Webhook] Failed to update job: ${updateError.message}`);
      return apiInternalError("작업 상태 업데이트에 실패했습니다.");
    }

    // ─────────────────────────────────────────────────
    // Progressive Loading: phase별 처리
    // Supabase Realtime이 자동으로 클라이언트에 전파
    // ─────────────────────────────────────────────────
    const phase = payload.result?.phase || payload.phase || payload.status;

    if (phase === "parsed" && payload.result?.candidate_id) {
      // Phase 1: 파싱 완료 - 빠른 기본 정보 추출됨
      console.log(
        `[Webhook] Progressive Phase 1 (parsed): candidate=${payload.result.candidate_id}, ` +
        `name=${payload.result.quick_data?.name}, company=${payload.result.quick_data?.last_company}`
      );
    }

    if (phase === "analyzed" && payload.result?.candidate_id) {
      // Phase 2: AI 분석 완료
      console.log(
        `[Webhook] Progressive Phase 2 (analyzed): candidate=${payload.result.candidate_id}, ` +
        `confidence=${payload.result.confidence_score}`
      );
    }

    if (payload.status === "completed" && payload.result?.candidate_id) {
      // Phase 3: 전체 처리 완료
      console.log(
        `[Webhook] Job completed: candidate=${payload.result.candidate_id}, ` +
        `is_update=${payload.result.is_update}, parent_id=${payload.result.parent_id}`
      );

      // ─────────────────────────────────────────────────
      // 품질 환불 조건 체크
      // PRD: prd_refund_policy_v0.4.md Section 3.2
      // QA: refund_policy_test_scenarios_v1.0.md (EC-001 ~ EC-025)
      // ─────────────────────────────────────────────────
      const qualityCheck = checkQualityRefundCondition(
        payload.result.confidence_score,
        payload.result.quick_data
      );

      if (qualityCheck.eligible) {
        console.log(
          `[Webhook] Quality refund triggered: confidence=${qualityCheck.confidence}, ` +
          `missing=${qualityCheck.missingFields.join(",")}`
        );

        // 사용자 정보 조회
        const { data: candidateData } = await supabase
          .from("candidates")
          .select("user_id")
          .eq("id", payload.result.candidate_id)
          .single();

        if (candidateData?.user_id) {
          // 품질 환불 처리 (RPC 호출)
          const refundResult = await processQualityRefund(supabase, {
            candidateId: payload.result.candidate_id,
            userId: candidateData.user_id,
            jobId: payload.job_id,
            confidence: qualityCheck.confidence,
            missingFields: qualityCheck.missingFields,
          });

          if (refundResult.success) {
            // 사용자 알림 전송
            await notifyUserRefund(supabase, candidateData.user_id, "quality_refund", {
              candidateId: payload.result.candidate_id,
              confidence: qualityCheck.confidence,
              missingFields: qualityCheck.missingFields,
            });

            // 검색 캐시 무효화 (환불 시에도)
            await invalidateUserSearchCache(candidateData.user_id);

            return apiSuccess({
              message: `Job ${payload.job_id} processed with quality refund`,
              action: "refunded",
              reason: "quality_below_threshold",
              idempotent: refundResult.idempotent,
            });
          } else {
            console.error("[Webhook] Quality refund failed:", refundResult.error);
            // 환불 실패해도 job은 완료 처리 (나중에 수동 처리)
          }
        }
      }

      // ─────────────────────────────────────────────────
      // 검색 캐시 무효화 (새 후보자 추가/수정 시)
      // ─────────────────────────────────────────────────
      try {
        const { data: candidateData } = await supabase
          .from("candidates")
          .select("user_id, name")
          .eq("id", payload.result.candidate_id)
          .single();

        if (candidateData?.user_id) {
          await invalidateUserSearchCache(candidateData.user_id);
          console.log(`[Webhook] Search cache invalidated for user: ${candidateData.user_id.slice(0, 8)}`);

          // ─────────────────────────────────────────────────
          // T1-1: 분석 완료 이메일 알림 (E-04)
          // ─────────────────────────────────────────────────
          try {
            // processing_jobs에서 파일명 조회
            const { data: jobData } = await supabase
              .from("processing_jobs")
              .select("file_name")
              .eq("id", payload.job_id)
              .single();

            const emailMetadata = {
              candidate_name: candidateData.name || "후보자",
              candidate_id: payload.result.candidate_id,
              file_name: jobData?.file_name || "이력서",
              confidence_score: payload.result.confidence_score,
            };

            const subject = generateEmailSubject("E-04", emailMetadata);
            await queueEmail(candidateData.user_id, "E-04", subject, emailMetadata);
            console.log(`[Webhook] E-04 email queued for user: ${candidateData.user_id.slice(0, 8)}`);
          } catch (emailError) {
            // 이메일 큐잉 실패는 로그만 남기고 계속 진행
            console.error("[Webhook] Failed to queue E-04 email:", emailError);
          }

          // ─────────────────────────────────────────────────
          // T1-3: 크레딧 부족 경고 이메일 (E-07, E-08)
          // ─────────────────────────────────────────────────
          try {
            // 사용자의 현재 크레딧 잔액 조회
            const { data: userData } = await supabase
              .from("users")
              .select("credits, credits_used_this_month, plan")
              .eq("id", candidateData.user_id)
              .single();

            if (userData) {
              const remaining = userData.credits - userData.credits_used_this_month;
              const planName = userData.plan === "pro" ? "Pro" : "Starter";
              const LOW_CREDIT_THRESHOLD = 5;

              if (remaining <= 0) {
                // E-08: 크레딧 완전 소진
                const metadata = {
                  plan_name: planName,
                  next_reset_date: getNextResetDate(),
                };
                const subject = generateEmailSubject("E-08", metadata);
                await queueEmail(candidateData.user_id, "E-08", subject, metadata);
                console.log(`[Webhook] E-08 email queued (credits exhausted): ${candidateData.user_id.slice(0, 8)}`);
              } else if (remaining <= LOW_CREDIT_THRESHOLD) {
                // E-07: 크레딧 부족 경고
                const metadata = {
                  remaining_credits: remaining,
                  plan_name: planName,
                };
                const subject = generateEmailSubject("E-07", metadata);
                await queueEmail(candidateData.user_id, "E-07", subject, metadata);
                console.log(`[Webhook] E-07 email queued (low credits: ${remaining}): ${candidateData.user_id.slice(0, 8)}`);
              }
            }
          } catch (creditEmailError) {
            console.error("[Webhook] Failed to check/queue credit emails:", creditEmailError);
          }
        }
      } catch (cacheError) {
        // 캐시 무효화 실패는 로그만 남기고 계속 진행
        console.warn("[Webhook] Cache invalidation failed:", cacheError);
      }
    }

    if (payload.status === "failed") {
      console.warn(`[Webhook] Job failed: ${payload.error}`);

      // ─────────────────────────────────────────────────
      // T1-2: 분석 실패 이메일 알림 (E-05)
      // ─────────────────────────────────────────────────
      try {
        // processing_jobs에서 사용자 ID와 파일명 조회
        const { data: jobData } = await supabase
          .from("processing_jobs")
          .select("user_id, file_name, is_refunded")
          .eq("id", payload.job_id)
          .single();

        if (jobData?.user_id) {
          const emailMetadata = {
            file_name: jobData.file_name || "이력서",
            error_reason: payload.error || "파일 처리 중 오류가 발생했습니다.",
            is_refunded: jobData.is_refunded ?? true, // 기본적으로 실패 시 환불
          };

          const subject = generateEmailSubject("E-05", emailMetadata);
          await queueEmail(jobData.user_id, "E-05", subject, emailMetadata);
          console.log(`[Webhook] E-05 email queued for user: ${jobData.user_id.slice(0, 8)}`);
        }
      } catch (emailError) {
        console.error("[Webhook] Failed to queue E-05 email:", emailError);
      }
    }

    return apiSuccess({
      message: `Job ${payload.job_id} status updated to ${payload.status}`,
    });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    return apiInternalError();
  }
}

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    data: {
      status: "ok",
      endpoint: "worker-webhook",
    },
  });
}
