import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Async Upload Endpoint
 *
 * 파일을 업로드하고 Queue에 작업을 추가합니다.
 * 즉시 반환하고 Worker가 백그라운드에서 처리합니다.
 *
 * Flow:
 * 1. 파일 업로드 → Supabase Storage
 * 2. processing_jobs 레코드 생성 (status: queued)
 * 3. Redis Queue에 작업 추가
 * 4. 즉시 job_id 반환
 * 5. Worker가 처리 완료 시 Webhook으로 알림
 */

// Worker URL for queue operations
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

// 지원하는 파일 확장자
const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf"];

// 최대 파일 크기 (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface AsyncUploadResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AsyncUploadResponse>> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 크레딧 확인
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("credits, credits_used_this_month, plan")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // 크레딧 계산
    const baseCredits: Record<string, number> = {
      starter: 50,
      pro: 150,
      enterprise: 300,
    };
    const userInfo = userData as { credits: number; credits_used_this_month: number; plan: string };
    const remaining =
      (baseCredits[userInfo.plan] || 50) -
      userInfo.credits_used_this_month +
      userInfo.credits;

    if (remaining <= 0) {
      return NextResponse.json(
        { success: false, error: "Insufficient credits" },
        { status: 402 }
      );
    }

    // FormData 파싱
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // 파일 확장자 확인
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 파일 크기 확인
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // processing_jobs 레코드 생성
    const { data: job, error: jobError } = await supabaseAny
      .from("processing_jobs")
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
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

    // Supabase Storage에 파일 업로드
    const storagePath = `uploads/${user.id}/${jobData.id}/${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      // 업로드 실패 시 job 상태 업데이트
      await supabaseAny
        .from("processing_jobs")
        .update({ status: "failed", error_message: uploadError.message })
        .eq("id", jobData.id);

      console.error("Storage upload failed:", uploadError);
      return NextResponse.json(
        { success: false, error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Worker에 Queue 작업 추가 요청
    try {
      const queueResponse = await fetch(`${WORKER_URL}/queue/enqueue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobData.id,
          user_id: user.id,
          file_path: storagePath,
          file_name: file.name,
          mode: userInfo.plan === "enterprise" ? "phase_2" : "phase_1",
        }),
      });

      if (!queueResponse.ok) {
        // Queue 추가 실패해도 job은 queued 상태로 유지
        // 나중에 Worker가 polling으로 처리 가능
        console.warn("Failed to enqueue job, keeping in queued state");
      } else {
        const queueResult = await queueResponse.json();
        console.log(`Job queued: ${jobData.id}, rq_job_id: ${queueResult.rq_job_id}`);
      }
    } catch (queueError) {
      // Queue 서비스 연결 실패해도 계속 진행
      console.warn("Queue service unavailable:", queueError);
    }

    return NextResponse.json({
      success: true,
      jobId: jobData.id,
      message: "File uploaded and queued for processing",
    });

  } catch (error) {
    console.error("Async upload error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
