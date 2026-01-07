/**
 * POST /api/upload/presign
 * 파일을 Supabase Storage에 직접 업로드하기 위한 presigned URL 생성
 *
 * Vercel의 4.5MB 제한을 우회하기 위해 클라이언트가 직접 Storage에 업로드
 *
 * 주의: presign은 메타데이터만 검증 (확장자, 크기)
 * 매직 바이트 검증은 /api/upload/confirm에서 수행
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateFile,
  calculateRemainingCredits,
  type UserCreditsInfo,
} from "@/lib/file-validation";
import { withRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInsufficientCredits,
  apiInternalError,
  apiFileValidationError,
} from "@/lib/api-response";

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
        const { fileName, fileSize, fileType } = await request.json();

        if (!fileName || !fileSize) {
            return apiBadRequest("파일 정보가 올바르지 않습니다. 파일을 다시 선택해주세요.");
        }

        // 파일명 길이 검증 (Storage 경로 제한)
        if (fileName.length > 200) {
            return apiBadRequest("파일명이 너무 깁니다. 200자 이내로 파일명을 줄여주세요.");
        }

        // 0바이트 파일 체크
        if (fileSize === 0) {
            return apiBadRequest("빈 파일은 업로드할 수 없습니다. 파일 내용이 있는지 확인해주세요.");
        }

        // 파일 검증 (확장자 + 크기, 매직 바이트는 confirm에서 검증)
        const validation = validateFile({
            fileName,
            fileSize,
            // fileBuffer 없음 - presign은 메타데이터만 받음
        });

        if (!validation.valid) {
            return apiFileValidationError(validation.error || "파일 검증에 실패했습니다.");
        }

        // 확장자 안전하게 추출
        const ext = validation.extension;
        if (!ext) {
            return apiFileValidationError("파일 확장자가 없습니다. HWP, HWPX, DOC, DOCX, PDF 형식의 파일을 선택해주세요.");
        }

        // 크레딧 확인
        if (!user.email) {
            return apiBadRequest("사용자 이메일을 찾을 수 없습니다.");
        }

        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, credits, credits_used_this_month, plan")
            .eq("email", user.email)
            .single();

        if (userError || !userData) {
            return apiNotFound("사용자를 찾을 수 없습니다.");
        }

        const publicUserId = (userData as { id: string }).id;
        const userInfo = userData as UserCreditsInfo;

        // 크레딧 계산 (공통 유틸리티 사용)
        const remaining = calculateRemainingCredits(userInfo);

        if (remaining <= 0) {
            return apiInsufficientCredits();
        }

        // processing_jobs 레코드 생성
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any;
        const { data: job, error: jobError } = await supabaseAny
            .from("processing_jobs")
            .insert({
                user_id: publicUserId,
                file_name: fileName,
                file_size: fileSize,
                file_type: ext.replace(".", ""),
                status: "queued",
            })
            .select()
            .single();

        if (jobError || !job) {
            console.error("Failed to create job:", jobError);
            return apiInternalError("작업 생성에 실패했습니다.");
        }

        const jobData = job as { id: string };

        // Storage 경로 생성
        const safeFileName = `${jobData.id}${ext}`;
        const storagePath = `uploads/${user.id}/${safeFileName}`;

        // candidates 테이블에 초기 레코드 생성
        const { data: candidate, error: candidateError } = await supabaseAny
            .from("candidates")
            .insert({
                user_id: publicUserId,
                name: fileName,
                status: "processing",
                is_latest: true,
                version: 1,
                source_file: storagePath,
                file_type: ext.replace(".", ""),
            })
            .select()
            .single();

        if (candidateError) {
            console.error("Failed to create candidate:", candidateError);
        }

        const candidateId = candidate?.id;

        // processing_jobs에 candidate_id 업데이트
        if (candidateId) {
            await supabaseAny
                .from("processing_jobs")
                .update({ candidate_id: candidateId })
                .eq("id", jobData.id);
        }

        // 클라이언트가 직접 업로드할 정보 반환
        // 클라이언트에서 supabase.storage.from('resumes').upload() 사용
        return apiSuccess({
            storagePath,
            jobId: jobData.id,
            candidateId,
            userId: publicUserId,
            plan: userInfo.plan,
            message: "스토리지에 직접 업로드할 준비가 완료되었습니다.",
        });
    } catch (error) {
        console.error("Presign error:", error);
        return apiInternalError();
    }
}
