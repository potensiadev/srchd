/**
 * POST /api/upload/presign
 * 파일을 Supabase Storage에 직접 업로드하기 위한 presigned URL 생성
 *
 * Vercel의 4.5MB 제한을 우회하기 위해 클라이언트가 직접 Storage에 업로드
 *
 * 주의: presign은 메타데이터만 검증 (확장자, 크기)
 * 매직 바이트 검증은 /api/upload/confirm에서 수행
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateFile,
  calculateRemainingCredits,
  type UserCreditsInfo,
} from "@/lib/file-validation";
import { withRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    try {
        // 레이트 제한 체크
        const rateLimitResponse = withRateLimit(request, "upload");
        if (rateLimitResponse) return rateLimitResponse;

        const supabase = await createClient();

        // 인증 확인
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        // 요청 바디 파싱
        const { fileName, fileSize, fileType } = await request.json();

        if (!fileName || !fileSize || !fileType) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // 파일 검증 (확장자 + 크기, 매직 바이트는 confirm에서 검증)
        const validation = validateFile({
            fileName,
            fileSize,
            // fileBuffer 없음 - presign은 메타데이터만 받음
        });

        if (!validation.valid) {
            return NextResponse.json(
                { success: false, error: validation.error },
                { status: 400 }
            );
        }

        const ext = validation.extension || "." + fileName.split(".").pop()?.toLowerCase();

        // 크레딧 확인
        if (!user.email) {
            return NextResponse.json(
                { success: false, error: "User email not found" },
                { status: 400 }
            );
        }

        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, credits, credits_used_this_month, plan")
            .eq("email", user.email)
            .single();

        if (userError || !userData) {
            return NextResponse.json(
                { success: false, error: "User not found" },
                { status: 404 }
            );
        }

        const publicUserId = (userData as { id: string }).id;
        const userInfo = userData as UserCreditsInfo;

        // 크레딧 계산 (공통 유틸리티 사용)
        const remaining = calculateRemainingCredits(userInfo);

        if (remaining <= 0) {
            return NextResponse.json(
                { success: false, error: "Insufficient credits" },
                { status: 402 }
            );
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
            return NextResponse.json(
                { success: false, error: "Failed to create processing job" },
                { status: 500 }
            );
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
        return NextResponse.json({
            success: true,
            storagePath,
            jobId: jobData.id,
            candidateId,
            userId: publicUserId,
            plan: userInfo.plan,
            message: "Ready for direct upload to storage",
        });
    } catch (error) {
        console.error("Presign error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
