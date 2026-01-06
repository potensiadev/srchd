import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateFile,
  calculateRemainingCredits,
  type UserCreditsInfo,
} from "@/lib/file-validation";
import { withRateLimit } from "@/lib/rate-limit";
import { callWorkerPipelineAsync } from "@/lib/fetch-retry";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInsufficientCredits,
  apiInternalError,
  apiFileValidationError,
} from "@/lib/api-response";
import { createRequestLogger } from "@/lib/logger";

// App Router Route Segment Config: Allow large file uploads
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Note: For Vercel body size limit, use vercel.json or check plan limits
// The FUNCTION_PAYLOAD_TOO_LARGE error means file exceeds Vercel's 4.5MB limit
// Solution: Use direct-to-storage upload pattern instead of server upload

// Worker URL (환경 변수로 설정)
const WORKER_URL = process.env.WORKER_URL || "http://localhost:8000";

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

export async function POST(request: NextRequest) {
  // 요청별 구조화된 로거 생성
  const log = createRequestLogger();

  try {
    // 레이트 제한 체크 (인증 전 IP 기반)
    const rateLimitResponse = withRateLimit(request, "upload");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiUnauthorized();
    }

    // 크레딧 확인 (email로 조회 - auth.users.id와 public.users.id가 다를 수 있음)
    if (!user.email) {
      return apiBadRequest("사용자 이메일을 찾을 수 없습니다.");
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, credits, credits_used_this_month, plan")
      .eq("email", user.email)
      .single();

    if (userError || !userData) {
      log.error("User not found", userError, { email: user.email, action: "upload" });
      return apiNotFound("사용자를 찾을 수 없습니다.");
    }

    // public.users의 ID 사용 (auth.users.id와 다를 수 있음)
    const publicUserId = (userData as { id: string }).id;

    // 크레딧 계산 (공통 유틸리티 사용)
    const userInfo = userData as UserCreditsInfo;
    const remaining = calculateRemainingCredits(userInfo);

    if (remaining <= 0) {
      return apiInsufficientCredits();
    }

    // FormData 파싱
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiBadRequest("파일이 제공되지 않았습니다.");
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
      return apiFileValidationError(validation.error || "파일 검증에 실패했습니다.");
    }

    const ext = validation.extension || "." + file.name.split(".").pop()?.toLowerCase();

    // processing_jobs 레코드 생성 (publicUserId 사용)
    const { data: job, error: jobError } = await supabaseAny
      .from("processing_jobs")
      .insert({
        user_id: publicUserId,
        file_name: file.name,
        file_size: file.size,
        file_type: ext.replace(".", ""),
        status: "queued",
      })
      .select()
      .single();

    if (jobError || !job) {
      log.error("Failed to create job", jobError, { userId: publicUserId });
      return apiInternalError("작업 생성에 실패했습니다.");
    }

    const jobData = job as { id: string };

    // Supabase Storage에 파일 업로드
    // 한글 파일명 문제 방지: UUID + 확장자로 저장
    const safeFileName = `${jobData.id}${ext}`;
    const storagePath = `uploads/${user.id}/${safeFileName}`;
    // fileBuffer는 위에서 매직 바이트 검증 시 이미 읽음

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

      log.error("Storage upload failed", uploadError, { jobId: jobData.id });
      return apiInternalError("파일 업로드에 실패했습니다.");
    }

    // ─────────────────────────────────────────────────
    // 3. candidates 테이블에 초기 레코드 생성 (즉시 조회용)
    // ─────────────────────────────────────────────────
    const { data: candidate, error: candidateError } = await supabaseAny
      .from("candidates")
      .insert({
        user_id: publicUserId,
        name: file.name, // 임시 이름 (파일명)
        status: "processing", // 처리 중 상태
        is_latest: true,
        version: 1,
        source_file: storagePath, // Add source file path
        file_type: ext.replace(".", ""), // Add file type
      })
      .select()
      .single();

    if (candidateError || !candidate) {
      log.warn("Failed to create candidate (non-blocking)", { jobId: jobData.id, error: candidateError?.message });
      // 실패해도 진행은 가능하지만, UI 즉시 반영은 안됨. 로그만 남김.
    }

    const candidateId = candidate?.id;

    // processing_jobs에 candidate_id 업데이트
    if (candidateId) {
      await supabaseAny
        .from("processing_jobs")
        .update({ candidate_id: candidateId })
        .eq("id", jobData.id);
    }

    // ─────────────────────────────────────────────────
    // Worker에 비동기 처리 요청 (fire-and-forget)
    // Vercel 타임아웃 방지를 위해 응답을 기다리지 않음
    // Worker가 백그라운드에서 파싱 → 분석 → DB 저장 → 크레딧 차감
    // ─────────────────────────────────────────────────

    // Worker 전체 파이프라인 호출 (비동기, 재시도 로직 포함)
    const workerPayload = {
      file_url: storagePath,
      file_name: file.name,
      user_id: publicUserId,
      job_id: jobData.id,
      candidate_id: candidateId, // 생성된 candidate ID 전달
      mode: userInfo.plan === "enterprise" ? "phase_2" : "phase_1",
    };

    // 비동기 호출: 재시도 로직 포함, 실패 시 job 상태 업데이트
    callWorkerPipelineAsync(WORKER_URL, workerPayload, async (error, attempts) => {
      log.error(`Worker pipeline failed after ${attempts} attempts`, new Error(error), { jobId: jobData.id, attempts });
      // 모든 재시도 실패 시 job 상태를 failed로 업데이트
      await supabaseAny
        .from("processing_jobs")
        .update({
          status: "failed",
          error_message: `Worker connection failed after ${attempts} attempts: ${error}`,
        })
        .eq("id", jobData.id);

      // candidate 상태도 업데이트
      if (candidateId) {
        await supabaseAny
          .from("candidates")
          .update({ status: "failed" })
          .eq("id", candidateId);
      }
    });

    // 즉시 응답 반환 - Worker가 백그라운드에서 처리
    return apiSuccess({
      jobId: jobData.id,
      candidateId,
      message: "파일이 업로드되었습니다. 백그라운드에서 분석 중입니다.",
    });
  } catch (error) {
    log.error("Upload failed", error, { action: "upload" });
    return apiInternalError();
  }
}

// GET: 업로드 상태 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return apiUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  // processing_jobs 조회에 필요한 컬럼
  const JOB_COLUMNS = `
    id, status, file_name, file_size, file_type,
    candidate_id, confidence_score, chunk_count, pii_count,
    error_code, error_message, created_at, updated_at
  `;

  if (jobId) {
    // 특정 job 조회
    const { data, error } = await supabaseAny
      .from("processing_jobs")
      .select(JOB_COLUMNS)
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return apiNotFound("작업을 찾을 수 없습니다.");
    }

    return apiSuccess(data);
  }

  // 최근 job 목록 조회
  const { data, error } = await supabaseAny
    .from("processing_jobs")
    .select(JOB_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return apiInternalError(error.message);
  }

  return apiSuccess(data);
}
