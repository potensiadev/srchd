/**
 * POST /api/upload/cleanup
 * 업로드 실패 시 orphan 데이터 정리
 *
 * - processing_jobs 레코드 삭제 또는 상태 업데이트
 * - candidates 레코드 삭제
 * - Storage 파일 삭제
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
} from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    const { jobId, candidateId, storagePath } = await request.json();

    if (!jobId) {
      return apiBadRequest("jobId가 필요합니다.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    // ─────────────────────────────────────────────────
    // 보안: public.users에서 현재 사용자의 ID 조회
    // auth.users.id와 public.users.id가 다를 수 있으므로 email로 조회
    // ─────────────────────────────────────────────────
    const { data: userData, error: userError } = await supabaseAny
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (userError || !userData) {
      console.warn(`[Cleanup] User not found: email=${user.email}`);
      return apiBadRequest("사용자 정보를 찾을 수 없습니다.");
    }

    const publicUserId = userData.id;

    // 1. 먼저 Job 상태 확인 (이미 구체적인 에러가 있으면 덮어쓰지 않음)
    const { data: existingJob } = await supabaseAny
      .from("processing_jobs")
      .select("status, error_message")
      .eq("id", jobId)
      .eq("user_id", publicUserId)
      .single();

    // 이미 failed 상태이고 구체적인 에러 메시지가 있으면 덮어쓰지 않음
    const shouldUpdateMessage = !existingJob?.error_message ||
      existingJob.error_message === "Upload cancelled or failed";

    // Job 상태를 failed로 업데이트 (user_id로 소유권 검증)
    const { data: jobData, error: jobError } = await supabaseAny
      .from("processing_jobs")
      .update({
        status: "failed",
        // 이미 구체적인 에러가 있으면 유지, 없으면 기본 메시지
        ...(shouldUpdateMessage && { error_message: "Upload cancelled or failed" }),
      })
      .eq("id", jobId)
      .eq("user_id", publicUserId)  // IDOR 방지: public.users.id로 검증
      .select()
      .single();

    // 소유권 검증 실패 시 (다른 사용자의 데이터 접근 시도)
    if (jobError || !jobData) {
      console.warn(`[Cleanup] Unauthorized attempt: publicUserId=${publicUserId}, jobId=${jobId}`);
      return apiBadRequest("작업을 찾을 수 없거나 권한이 없습니다.");
    }

    // 2. Candidate 삭제 (존재하는 경우) - user_id로 소유권 검증
    if (candidateId) {
      await supabaseAny
        .from("candidates")
        .delete()
        .eq("id", candidateId)
        .eq("user_id", publicUserId);  // IDOR 방지: public.users.id로 검증
    }

    // 3. Storage 파일 삭제 (존재하는 경우)
    if (storagePath) {
      await supabase.storage
        .from("resumes")
        .remove([storagePath]);
    }

    return apiSuccess({
      message: "Cleanup completed",
      cleaned: { jobId, candidateId, storagePath },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    // 정리 작업 실패는 200 반환 (best effort)
    return apiSuccess({
      message: "Cleanup attempted with errors",
      error: (error as Error).message,
    });
  }
}
