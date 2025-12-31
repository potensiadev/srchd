import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Worker URL (환경 변수로 설정)
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

// 지원하는 파일 확장자
const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf"];

// 최대 파일 크기 (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface UploadResponse {
  success: boolean;
  jobId?: string;
  candidateId?: string;
  message?: string;
  error?: string;
}

interface ProcessResult {
  success: boolean;
  candidate_id?: string;  // Worker가 저장한 candidate ID
  data?: CandidateData;
  confidence_score?: number;
  field_confidence?: Record<string, number>;
  analysis_warnings?: Array<{ type: string; field: string; message: string; severity: string }>;
  pii_count?: number;
  pii_types?: string[];
  privacy_warnings?: string[];
  encrypted_fields?: string[];
  chunk_count?: number;
  chunks_saved?: number;  // 실제 저장된 청크 수
  chunks_summary?: ChunkSummary[];
  embedding_tokens?: number;
  processing_time_ms?: number;
  mode?: string;
  error?: string;
}

interface CandidateData {
  name?: string;
  birth_year?: number;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  location_city?: string;
  exp_years?: number;
  last_company?: string;
  last_position?: string;
  careers?: Career[];
  skills?: string[];
  education_level?: string;
  education_school?: string;
  education_major?: string;
  educations?: Education[];
  projects?: Project[];
  summary?: string;
  strengths?: string[];
  portfolio_url?: string;
  github_url?: string;
  linkedin_url?: string;
}

interface Career {
  company: string;
  position?: string;
  department?: string;
  start_date?: string;
  end_date?: string;
  is_current: boolean;
  description?: string;
}

interface Education {
  school: string;
  degree?: string;
  major?: string;
  graduation_year?: number;
  is_graduated: boolean;
}

interface Project {
  name: string;
  role?: string;
  period?: string;
  description?: string;
  technologies?: string[];
}

interface ChunkSummary {
  type: string;
  index: number;
  content_preview: string;
  has_embedding: boolean;
  embedding?: number[];
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
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
        filename: file.name,
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

    // Worker에 파싱 요청 전송
    try {
      const workerFormData = new FormData();
      workerFormData.append("file", new Blob([fileBuffer]), file.name);
      workerFormData.append("user_id", user.id);
      workerFormData.append("job_id", jobData.id);

      const workerResponse = await fetch(`${WORKER_URL}/parse`, {
        method: "POST",
        body: workerFormData,
      });

      if (!workerResponse.ok) {
        const errorData = await workerResponse.json();
        throw new Error(errorData.detail || "Worker parsing failed");
      }

      const parseResult = await workerResponse.json();

      // 파싱 성공 시 job 상태 업데이트
      await supabaseAny
        .from("processing_jobs")
        .update({
          status: parseResult.success ? "parsed" : "failed",
          raw_text: parseResult.text || null,
          page_count: parseResult.page_count || 0,
          parse_method: parseResult.parse_method || null,
          error_message: parseResult.error_message || null,
        })
        .eq("id", jobData.id);

      if (!parseResult.success) {
        return NextResponse.json(
          {
            success: false,
            jobId: jobData.id,
            error: parseResult.error_message || "Parsing failed",
          },
          { status: 422 }
        );
      }

      // ─────────────────────────────────────────────────
      // Step 2: /process 호출 (분석 + PII + 임베딩 + DB 저장)
      // Worker가 직접 DB 저장, 크레딧 차감까지 처리
      // ─────────────────────────────────────────────────
      try {
        const processResponse = await fetch(`${WORKER_URL}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: parseResult.text,
            user_id: user.id,
            job_id: jobData.id,
            mode: userInfo.plan === "enterprise" ? "phase_2" : "phase_1",
            generate_embeddings: true,
            mask_pii: true,
            save_to_db: true,
            source_file: storagePath,
            file_type: ext.replace(".", ""),
          }),
        });

        if (!processResponse.ok) {
          throw new Error("Worker processing failed");
        }

        const processResult: ProcessResult = await processResponse.json();

        if (!processResult.success) {
          // 분석 실패
          return NextResponse.json({
            success: false,
            jobId: jobData.id,
            error: processResult.error || "Analysis failed",
          }, { status: 422 });
        }

        // Worker가 이미 DB 저장, 크레딧 차감을 완료함
        return NextResponse.json({
          success: true,
          jobId: jobData.id,
          candidateId: processResult.candidate_id || undefined,
          message: `Resume processed successfully (confidence: ${Math.round((processResult.confidence_score || 0) * 100)}%, chunks: ${processResult.chunks_saved || 0})`,
        });

      } catch (processError) {
        console.error("Processing failed:", processError);

        // 분석 실패해도 파싱은 성공했으므로 parsed 상태 유지
        await supabaseAny
          .from("processing_jobs")
          .update({
            status: "parsed",
            error_message: "Analysis pending - will retry",
          })
          .eq("id", jobData.id);

        return NextResponse.json({
          success: true,
          jobId: jobData.id,
          message: `File parsed successfully - analysis pending (${parseResult.page_count} pages)`,
        });
      }
    } catch (workerError) {
      // Worker 연결 실패 시 job을 queued 상태로 유지 (나중에 처리)
      console.error("Worker request failed:", workerError);

      await supabaseAny
        .from("processing_jobs")
        .update({
          status: "queued",
          error_message: "Worker temporarily unavailable - queued for retry",
        })
        .eq("id", jobData.id);

      return NextResponse.json({
        success: true,
        jobId: jobData.id,
        message: "File uploaded - processing queued",
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: 업로드 상태 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    // 특정 job 조회
    const { data, error } = await supabaseAny
      .from("processing_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  }

  // 최근 job 목록 조회
  const { data, error } = await supabaseAny
    .from("processing_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
