/**
 * GET /api/saved-searches/[id] - 저장된 검색 상세 조회
 * PATCH /api/saved-searches/[id] - 저장된 검색 수정
 * DELETE /api/saved-searches/[id] - 저장된 검색 삭제
 * POST /api/saved-searches/[id]/use - 저장된 검색 사용 (use_count 증가)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
  apiForbidden,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateSavedSearchRequest {
  name?: string;
  query?: string;
  filters?: Record<string, unknown>;
}

interface SavedSearchRow {
  id: string;
  name: string;
  query: string;
  filters: Record<string, unknown> | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  user_id: string;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 저장된 검색 조회
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("id", id)
      .eq("user_id", publicUserId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return apiNotFound("저장된 검색을 찾을 수 없습니다.");
      }
      console.error("Saved search fetch error:", error);
      return apiInternalError();
    }

    const row = data as SavedSearchRow;
    return apiSuccess({
      id: row.id,
      name: row.name,
      query: row.query,
      filters: row.filters || {},
      useCount: row.use_count || 0,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error("Saved search detail API error:", error);
    return apiInternalError();
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 요청 바디 파싱
    const body: UpdateSavedSearchRequest = await request.json();

    // 소유권 확인
    const { data: existing, error: fetchError } = await supabase
      .from("saved_searches")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound("저장된 검색을 찾을 수 없습니다.");
    }

    const existingRow = existing as { user_id: string };
    if (existingRow.user_id !== publicUserId) {
      return apiForbidden("이 검색을 수정할 권한이 없습니다.");
    }

    // 이름 변경 시 중복 검사
    if (body.name && body.name.trim().length > 0) {
      const { data: duplicate } = await supabase
        .from("saved_searches")
        .select("id")
        .eq("user_id", publicUserId)
        .eq("name", body.name.trim())
        .neq("id", id)
        .single();

      if (duplicate) {
        return apiBadRequest("이미 같은 이름의 저장된 검색이 있습니다.");
      }
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.query !== undefined) updateData.query = body.query;
    if (body.filters !== undefined) updateData.filters = body.filters;

    if (Object.keys(updateData).length === 0) {
      return apiBadRequest("업데이트할 필드가 없습니다.");
    }

    // 업데이트 실행
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("saved_searches")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", publicUserId)
      .select()
      .single();

    if (error) {
      console.error("Saved search update error:", error);
      return apiInternalError();
    }

    const row = data as SavedSearchRow;
    return apiSuccess({
      id: row.id,
      name: row.name,
      query: row.query,
      filters: row.filters || {},
      useCount: row.use_count || 0,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error("Saved search update API error:", error);
    return apiInternalError();
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const supabase = await createClient();

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return apiUnauthorized();
    }

    // 사용자 ID 조회
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 소유권 확인 후 삭제
    const { data: existing, error: fetchError } = await supabase
      .from("saved_searches")
      .select("user_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound("저장된 검색을 찾을 수 없습니다.");
    }

    const existingRow = existing as { user_id: string };
    if (existingRow.user_id !== publicUserId) {
      return apiForbidden("이 검색을 삭제할 권한이 없습니다.");
    }

    // 삭제 실행
    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", publicUserId);

    if (error) {
      console.error("Saved search delete error:", error);
      return apiInternalError();
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("Saved search delete API error:", error);
    return apiInternalError();
  }
}
