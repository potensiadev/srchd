/**
 * Supabase Admin Client (Service Role)
 *
 * API 라우트에서 RLS를 우회하고 고성능 작업을 수행할 때 사용
 * - 싱글톤 패턴으로 연결 재사용
 * - Service Role Key 사용 (RLS 우회)
 *
 * 주의: 이 클라이언트는 서버 사이드에서만 사용해야 함
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

// 싱글톤 캐시 - 현재 미사용 (캐싱 이슈 디버깅 중)
// let adminClient: SupabaseClient<Database> | null = null;

/**
 * Admin Supabase Client 가져오기 (싱글톤)
 *
 * @returns Supabase Admin Client
 */
export function getAdminClient(): SupabaseClient<Database> {
  // 항상 새로 생성 (캐싱 이슈 디버깅용)
  // if (adminClient) {
  //   return adminClient;
  // }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // 연결 풀링 설정
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-client-info": "rai-admin-client",
      },
    },
  });

  console.log("[AdminClient] Created with service role key (first 20 chars):", serviceRoleKey.substring(0, 20));

  adminClient = client;
  return client;
}

/**
 * RPC 함수 호출 헬퍼 (타입 안전)
 */
export async function callRpc<T>(
  functionName: string,
  params: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const client = getAdminClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.rpc as any)(functionName, params);

    if (error) {
      console.error(`[RPC] ${functionName} error:`, error);
      return { data: null, error: new Error(error.message || JSON.stringify(error)) };
    }

    console.log(`[RPC] ${functionName} result:`, data);
    return { data: data as T, error: null };
  } catch (err) {
    console.error(`[RPC] ${functionName} exception:`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * 크레딧 예약 (Atomic)
 */
export async function reserveCredit(
  userId: string,
  jobId?: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await callRpc<boolean>("reserve_credit", {
    p_user_id: userId,
    p_job_id: jobId || null,
    p_description: description || "이력서 분석 크레딧 예약",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: data === true };
}

/**
 * 크레딧 예약 해제 (실패 시 롤백)
 */
export async function releaseCreditReservation(
  userId: string,
  jobId?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await callRpc<boolean>("release_credit_reservation", {
    p_user_id: userId,
    p_job_id: jobId || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: data === true };
}

/**
 * 동시 업로드 제한 체크
 */
export async function checkConcurrentUploadLimit(
  userId: string,
  maxConcurrent: number = 5
): Promise<{ allowed: boolean; error?: string }> {
  const { data, error } = await callRpc<boolean>("check_concurrent_upload_limit", {
    p_user_id: userId,
    p_max_concurrent: maxConcurrent,
  });

  if (error) {
    // 에러 시 보수적으로 허용 (DB 함수 미존재 대응)
    console.warn("check_concurrent_upload_limit error:", error.message);
    return { allowed: true };
  }

  return { allowed: data === true };
}

/**
 * 트랜잭션 실행 헬퍼
 *
 * Supabase는 직접적인 트랜잭션을 지원하지 않으므로
 * 여러 작업을 순차적으로 실행하고 실패 시 롤백 로직 제공
 */
export async function withRollback<T>(
  operation: () => Promise<T>,
  rollback: () => Promise<void>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const result = await operation();
    return { data: result, error: null };
  } catch (err) {
    // 롤백 시도
    try {
      await rollback();
    } catch (rollbackErr) {
      console.error("Rollback failed:", rollbackErr);
    }

    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * 크레딧 예약 + 업로드 작업 생성 (Atomic)
 * PostgreSQL Function을 사용하여 모든 작업을 단일 트랜잭션으로 처리
 */
export interface CreateUploadJobResult {
  success: boolean;
  jobId?: string;
  candidateId?: string;
  error?: string;
}

export async function reserveAndCreateUploadJob(
  userId: string,
  fileName: string,
  fileSize: number,
  fileType: string,
  storagePath: string,
  description?: string
): Promise<CreateUploadJobResult> {
  const { data, error } = await callRpc<{
    success: boolean;
    job_id: string | null;
    candidate_id: string | null;
    error_message: string | null;
  }[]>("reserve_and_create_upload_job", {
    p_user_id: userId,
    p_file_name: fileName,
    p_file_size: fileSize,
    p_file_type: fileType,
    p_storage_path: storagePath,
    p_description: description || `이력서 업로드: ${fileName}`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // RPC returns array with single row
  const result = Array.isArray(data) ? data[0] : data;

  if (!result || !result.success) {
    return {
      success: false,
      error: result?.error_message || "업로드 작업 생성에 실패했습니다.",
    };
  }

  return {
    success: true,
    jobId: result.job_id || undefined,
    candidateId: result.candidate_id || undefined,
  };
}
