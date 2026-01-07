/**
 * POST /api/upload/confirm
 * 클라이언트가 Storage에 직접 업로드 완료 후 Worker 파이프라인 트리거
 *
 * 보안: 업로드된 파일의 매직 바이트를 검증하여 위조된 파일 차단
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateMagicBytes } from "@/lib/file-validation";
import { withRateLimit } from "@/lib/rate-limit";
import { callWorkerPipelineAsync } from "@/lib/fetch-retry";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiFileValidationError,
} from "@/lib/api-response";

// Worker URL
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
    try {
        // 레이트 제한 체크
        const rateLimitResponse = await withRateLimit(request, "upload");
        if (rateLimitResponse) return rateLimitResponse;

        const supabase = await createClient();

        // 인증 확인
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return apiUnauthorized();
        }

        // 요청 바디 파싱
        const { jobId, candidateId, storagePath, fileName, userId, plan } = await request.json();

        if (!jobId || !storagePath || !fileName) {
            return apiBadRequest("업로드 정보가 올바르지 않습니다. 페이지를 새로고침하고 다시 시도해주세요.");
        }

        // 파일 확장자 안전하게 추출
        const fileNameParts = fileName.split(".");
        if (fileNameParts.length < 2) {
            return apiBadRequest("파일 확장자가 없습니다. HWP, HWPX, DOC, DOCX, PDF 형식의 파일을 선택해주세요.");
        }
        const ext = "." + fileNameParts[fileNameParts.length - 1].toLowerCase();

        // ─────────────────────────────────────────────────
        // 보안: Storage에서 파일 헤더를 읽어 매직 바이트 검증
        // 위조된 파일 (예: .exe를 .pdf로 변경) 차단
        // ─────────────────────────────────────────────────
        try {
            const { data: fileData, error: downloadError } = await supabase.storage
                .from("resumes")
                .download(storagePath);

            if (downloadError || !fileData) {
                console.error("[Upload Confirm] Failed to download file for validation:", downloadError);
                return apiInternalError("파일 검증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            }

            // 파일 버퍼로 변환 (처음 16바이트만 필요하지만 전체를 읽음)
            const fileBuffer = await fileData.arrayBuffer();

            // 매직 바이트 검증
            const magicValidation = validateMagicBytes(fileBuffer, ext);
            if (!magicValidation.valid) {
                console.error("[Upload Confirm] Magic byte validation failed:", magicValidation.error);

                // 위조된 파일 삭제
                await supabase.storage.from("resumes").remove([storagePath]);

                // job 상태 업데이트
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any)
                    .from("processing_jobs")
                    .update({ status: "failed", error_message: magicValidation.error })
                    .eq("id", jobId);

                // candidate 삭제
                if (candidateId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any)
                        .from("candidates")
                        .delete()
                        .eq("id", candidateId);
                }

                return apiFileValidationError(magicValidation.error || "파일 형식이 올바르지 않습니다. 파일이 손상되었거나 확장자가 변경되었을 수 있습니다. 원본 파일을 확인해주세요.");
            }
        } catch (validationError) {
            console.error("[Upload Confirm] File validation error:", validationError);
            return apiInternalError("파일 검증 중 오류가 발생했습니다. 파일이 손상되었을 수 있습니다. 다른 파일로 다시 시도해주세요.");
        }

        // Worker 파이프라인 호출 (비동기, 재시도 로직 포함)
        const workerPayload = {
            file_url: storagePath,
            file_name: fileName,
            user_id: userId,
            job_id: jobId,
            candidate_id: candidateId,
            mode: plan === "enterprise" ? "phase_2" : "phase_1",
        };

        console.log("[Upload Confirm] Calling Worker pipeline with retry:", {
            url: `${WORKER_URL}/pipeline`,
            jobId,
        });

        // 비동기 호출: 재시도 로직 포함, 실패 시 상태 업데이트
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;
        callWorkerPipelineAsync(WORKER_URL, workerPayload, async (error, attempts) => {
            console.error(`[Upload Confirm] Worker pipeline failed after ${attempts} attempts: ${error}`);

            // 모든 재시도 실패 시 job 상태를 failed로 업데이트
            await supabaseAny
                .from("processing_jobs")
                .update({
                    status: "failed",
                    error_message: `Worker connection failed after ${attempts} attempts: ${error}`,
                })
                .eq("id", jobId);

            // candidate 상태도 업데이트
            if (candidateId) {
                await supabaseAny
                    .from("candidates")
                    .update({ status: "failed" })
                    .eq("id", candidateId);
            }
        });

        return apiSuccess({
            jobId,
            message: "파일이 업로드되었습니다. 백그라운드에서 분석 중입니다.",
        });
    } catch (error) {
        console.error("Confirm error:", error);
        return apiInternalError();
    }
}
