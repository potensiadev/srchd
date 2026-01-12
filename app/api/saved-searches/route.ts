/**
 * GET /api/saved-searches - 저장된 검색 목록 조회
 * POST /api/saved-searches - 새 검색 저장
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiSuccess,
  apiCreated,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { withRateLimit } from "@/lib/rate-limit";

export interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: Record<string, unknown>;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateSavedSearchRequest {
  name: string;
  query?: string;
  filters?: Record<string, unknown>;
}

// Transform DB row to SavedSearch
function toSavedSearch(row: Record<string, unknown>): SavedSearch {
  return {
    id: row.id as string,
    name: row.name as string,
    query: row.query as string | null,
    filters: (row.filters as Record<string, unknown>) || {},
    useCount: (row.use_count as number) || 0,
    lastUsedAt: row.last_used_at as string | null,
    createdAt: row.created_at as string,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Rate Limit
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

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

    // 저장된 검색 조회 (최근 사용순, 최신 생성순)
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", publicUserId)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Saved searches fetch error:", error);
      return apiInternalError();
    }

    const savedSearches = (data || []).map(toSavedSearch);

    return apiSuccess({
      savedSearches,
      total: savedSearches.length,
    });
  } catch (error) {
    console.error("Saved searches API error:", error);
    return apiInternalError();
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate Limit
    const rateLimitResponse = await withRateLimit(request, "default");
    if (rateLimitResponse) return rateLimitResponse;

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
    const body: CreateSavedSearchRequest = await request.json();

    // 유효성 검사
    if (!body.name || body.name.trim().length === 0) {
      return apiBadRequest("검색 이름을 입력해주세요.");
    }

    if (body.name.length > 100) {
      return apiBadRequest("검색 이름은 100자 이내로 입력해주세요.");
    }

    // 중복 이름 검사
    const { data: existing } = await supabase
      .from("saved_searches")
      .select("id")
      .eq("user_id", publicUserId)
      .eq("name", body.name.trim())
      .single();

    if (existing) {
      return apiBadRequest("이미 같은 이름의 저장된 검색이 있습니다.");
    }

    // 저장 개수 제한 (최대 20개)
    const { count } = await supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", publicUserId);

    if (count && count >= 20) {
      return apiBadRequest("저장된 검색은 최대 20개까지 가능합니다.");
    }

    // 새 검색 저장
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("saved_searches")
      .insert({
        user_id: publicUserId,
        name: body.name.trim(),
        query: body.query || null,
        filters: body.filters || {},
      })
      .select()
      .single();

    if (error) {
      console.error("Saved search insert error:", error);
      return apiInternalError();
    }

    return apiCreated(toSavedSearch(data as Record<string, unknown>));
  } catch (error) {
    console.error("Save search API error:", error);
    return apiInternalError();
  }
}
