/**
 * POST /api/upload/confirm
 * 클라이언트가 Storage에 직접 업로드 완료 후 Worker 파이프라인 트리거
 *
 * 보안: 업로드된 파일의 매직 바이트를 검증하여 위조된 파일 차단
 * 크레딧은 분석 성공 후 Worker에서 차감 (실패 시 차감 없음)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateMagicBytes, validateZipStructure } from "@/lib/file-validation";
import { withRateLimit } from "@/lib/rate-limit";
import {
    callWorkerParseOnly,
    callWorkerAnalyzeAsync,
    type ParseOnlyResult,
} from "@/lib/fetch-retry";
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
        const { jobId, candidateId, storagePath, fileName, plan } = await request.json();

        if (!jobId || !storagePath || !fileName) {
            return apiBadRequest("업로드 정보가 올바르지 않습니다. 페이지를 새로고침하고 다시 시도해주세요.");
        }

        // ─────────────────────────────────────────────────
        // 보안: IDOR 방지 - jobId 소유권 검증
        // 클라이언트가 전달한 userId를 신뢰하지 않고, DB에서 직접 확인
        // ─────────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: jobData, error: jobError } = await (supabase as any)
            .from("processing_jobs")
            .select("user_id, status")
            .eq("id", jobId)
            .single();

        if (jobError || !jobData) {
            console.warn(`[Upload Confirm] Job not found: jobId=${jobId}, user=${user.id}`);
            return apiBadRequest("업로드 작업을 찾을 수 없습니다. 페이지를 새로고침하고 다시 시도해주세요.");
        }

        // public.users에서 현재 사용자의 ID 조회
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userData, error: userError } = await (supabase as any)
            .from("users")
            .select("id")
            .eq("email", user.email)
            .single();

        if (userError || !userData) {
            return apiBadRequest("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }

        const publicUserId = userData.id;

        // 소유권 검증: job의 user_id와 현재 사용자의 public.users.id 비교
        if (jobData.user_id !== publicUserId) {
            console.error(`[Upload Confirm] IDOR attempt detected: jobUserId=${jobData.user_id}, currentUser=${publicUserId}, jobId=${jobId}`);
            return apiUnauthorized();
        }

        // 이미 처리된 job인지 확인
        if (jobData.status !== "queued") {
            console.warn(`[Upload Confirm] Job already processed: jobId=${jobId}, status=${jobData.status}`);
            return apiBadRequest("이미 처리된 업로드입니다.");
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

                // 크레딧은 presign에서 차감하지 않으므로 복구 불필요

                return apiFileValidationError(magicValidation.error || "파일 형식이 올바르지 않습니다. 파일이 손상되었거나 확장자가 변경되었을 수 있습니다. 원본 파일을 확인해주세요.");
            }

            // ─────────────────────────────────────────────────
            // Issue #10: ZIP 기반 파일 내부 구조 검증 (DOCX, HWPX)
            // 매직 바이트만으로는 위조된 ZIP 파일을 탐지할 수 없으므로
            // 실제 파일 내부 구조를 검증
            // ─────────────────────────────────────────────────
            if ([".docx", ".hwpx"].includes(ext)) {
                const zipValidation = await validateZipStructure(fileBuffer, ext);
                if (!zipValidation.valid) {
                    console.error("[Upload Confirm] ZIP structure validation failed:", zipValidation.error);

                    // 위조된 파일 삭제
                    await supabase.storage.from("resumes").remove([storagePath]);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any)
                        .from("processing_jobs")
                        .update({ status: "failed", error_message: zipValidation.error })
                        .eq("id", jobId);

                    if (candidateId) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any)
                            .from("candidates")
                            .delete()
                            .eq("id", candidateId);
                    }

                    // 크레딧은 presign에서 차감하지 않으므로 복구 불필요

                    return apiFileValidationError(zipValidation.error || "파일 구조가 올바르지 않습니다.");
                }
            }
        } catch (validationError) {
            console.error("[Upload Confirm] File validation error:", validationError);

            // 크레딧은 presign에서 차감하지 않으므로 복구 불필요

            return apiInternalError("파일 검증 중 오류가 발생했습니다. 파일이 손상되었을 수 있습니다. 다른 파일로 다시 시도해주세요.");
        }

        // ─────────────────────────────────────────────────
        // Option C 하이브리드: 파싱 먼저, 분석은 비동기
        // ─────────────────────────────────────────────────

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;

        // Step 1: Worker /parse-only 동기 호출 (최대 15초)
        console.log("[Upload Confirm] Calling Worker /parse-only:", {
            url: `${WORKER_URL}/parse-only`,
            jobId,
            storagePath,
            fileName,
        });

        const parseResult: ParseOnlyResult = await callWorkerParseOnly(
            WORKER_URL,
            {
                file_url: storagePath,
                file_name: fileName,
                user_id: publicUserId,
                job_id: jobId,
                candidate_id: candidateId,
            },
            15000 // 15초 타임아웃
        );

        // Step 2: 파싱 실패 시 즉시 에러 반환 (빠른 피드백)
        if (!parseResult.success) {
            console.error("[Upload Confirm] Parsing failed:", {
                error_code: parseResult.error_code,
                error_message: parseResult.error_message,
            });

            // job 상태 업데이트 (Worker에서 이미 업데이트하지만 확실히)
            await supabaseAny
                .from("processing_jobs")
                .update({
                    status: "failed",
                    error_code: parseResult.error_code || "PARSE_FAILED",
                    error_message: parseResult.error_message?.substring(0, 500),
                })
                .eq("id", jobId);

            // candidate 상태도 업데이트
            if (candidateId) {
                await supabaseAny
                    .from("candidates")
                    .update({ status: "failed" })
                    .eq("id", candidateId);
            }

            // 사용자 친화적 에러 메시지 반환
            const userErrorMessages: Record<string, string> = {
                "ENCRYPTED": "비밀번호로 보호된 파일입니다. 비밀번호를 해제한 후 다시 업로드해주세요.",
                "PARSE_FAILED": parseResult.error_message || "파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.",
                "TEXT_TOO_SHORT": "파일에서 텍스트를 충분히 추출할 수 없습니다. 스캔 이미지이거나 내용이 너무 짧을 수 있습니다.",
                "STORAGE_ERROR": "파일을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                "CONNECTION_ERROR": "서버 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
            };

            const userMessage = userErrorMessages[parseResult.error_code || "PARSE_FAILED"]
                || parseResult.error_message
                || "파일 처리 중 오류가 발생했습니다.";

            return apiFileValidationError(userMessage);
        }

        // Step 3: 파싱 성공 - quick_extracted 데이터 업데이트 (Progressive Loading)
        console.log("[Upload Confirm] Parsing success:", {
            text_length: parseResult.text_length,
            file_type: parseResult.file_type,
            parse_method: parseResult.parse_method,
            page_count: parseResult.page_count,
            quick_extracted: parseResult.quick_extracted,
            duration_ms: parseResult.duration_ms,
        });

        // candidate에 quick_extracted 데이터 저장 (이미 Worker에서 업데이트하지만 확실히)
        if (candidateId && parseResult.quick_extracted) {
            await supabaseAny
                .from("candidates")
                .update({
                    status: "parsed",
                    quick_extracted: parseResult.quick_extracted,
                    // quick_extracted에서 추출된 기본 정보 반영
                    ...(parseResult.quick_extracted.name && { name: parseResult.quick_extracted.name }),
                })
                .eq("id", candidateId);
        }

        // Step 4: Worker /analyze-only 비동기 호출 (Fire-and-forget)
        console.log("[Upload Confirm] Calling Worker /analyze-only (async):", {
            url: `${WORKER_URL}/analyze-only`,
            jobId,
        });

        callWorkerAnalyzeAsync(
            WORKER_URL,
            {
                text: parseResult.text || "",
                file_url: storagePath,
                file_name: fileName,
                file_type: parseResult.file_type || ext.replace(".", ""),
                user_id: publicUserId,
                job_id: jobId,
                candidate_id: candidateId,
                mode: plan === "pro" ? "phase_2" : "phase_1",
            },
            async (error: string) => {
                console.error(`[Upload Confirm] Worker analyze-only failed: ${error}`);

                // 분석 실패 시 job 상태 업데이트
                await supabaseAny
                    .from("processing_jobs")
                    .update({
                        status: "failed",
                        error_message: `Analysis failed: ${error}`.substring(0, 500),
                    })
                    .eq("id", jobId);

                // candidate 상태도 업데이트
                if (candidateId) {
                    await supabaseAny
                        .from("candidates")
                        .update({ status: "failed" })
                        .eq("id", candidateId);
                }

                console.log(`[Upload Confirm] Analyze failed - no credit to release (deduct on success only)`);
            }
        );

        // Step 5: 즉시 성공 응답 (파싱 완료, 분석은 백그라운드)
        return apiSuccess({
            jobId,
            candidateId,
            status: "parsed",
            message: "파일이 업로드되었습니다. AI 분석 중입니다.",
            quick_extracted: parseResult.quick_extracted,
            parsing: {
                text_length: parseResult.text_length,
                file_type: parseResult.file_type,
                parse_method: parseResult.parse_method,
                page_count: parseResult.page_count,
                duration_ms: parseResult.duration_ms,
            },
        });
    } catch (error) {
        console.error("Confirm error:", error);
        return apiInternalError();
    }
}
