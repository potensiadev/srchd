/**
 * POST /api/candidates/[id]/contact
 * 후보자 연락 기록 생성
 *
 * GET /api/candidates/[id]/contact
 * 후보자 연락 이력 조회
 *
 * P0: 후보자 라이프사이클 관리 (헤드헌터 인터뷰 기반)
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type ContactHistory,
  type CreateContactRequest,
  type ContactType,
  type ContactOutcome,
} from "@/types";
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

// 유효한 contact_type 값
const VALID_CONTACT_TYPES: ContactType[] = [
  "email",
  "phone",
  "linkedin",
  "meeting",
  "note",
];

// 유효한 outcome 값
const VALID_OUTCOMES: ContactOutcome[] = [
  "interested",
  "not_interested",
  "no_response",
  "callback",
  "rejected",
  "pending",
];

/**
 * DB row를 ContactHistory로 변환
 */
function toContactHistory(row: Record<string, unknown>): ContactHistory {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    candidateId: row.candidate_id as string,
    contactType: row.contact_type as ContactType,
    subject: row.subject as string | undefined,
    content: row.content as string | undefined,
    outcome: (row.outcome as ContactOutcome) ?? "pending",
    nextContactDate: row.next_contact_date as string | undefined,
    nextContactNote: row.next_contact_note as string | undefined,
    positionId: row.position_id as string | undefined,
    contactedAt: row.contacted_at as string,
    createdAt: row.created_at as string,
  };
}

/**
 * GET /api/candidates/[id]/contact
 * 후보자 연락 이력 조회
 */
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 후보자 소유권 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: candidateError } = await (supabase as any)
      .from("candidates")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (candidateError || !candidate) {
      return apiNotFound("후보자를 찾을 수 없습니다.");
    }

    if (candidate.user_id !== publicUserId) {
      return apiForbidden("이 후보자의 연락 이력을 조회할 권한이 없습니다.");
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // 연락 이력 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (supabase as any)
      .from("contact_history")
      .select("*", { count: "exact" })
      .eq("candidate_id", id)
      .eq("user_id", publicUserId)
      .order("contacted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Contact history fetch error:", error);
      return apiInternalError();
    }

    const contacts = (data || []).map((row: Record<string, unknown>) =>
      toContactHistory(row)
    );

    return apiSuccess(
      { contacts, total: count || 0 },
      {
        total: count || 0,
        page: Math.floor(offset / limit) + 1,
        limit,
      }
    );
  } catch (error) {
    console.error("Get contact history error:", error);
    return apiInternalError();
  }
}

/**
 * POST /api/candidates/[id]/contact
 * 후보자 연락 기록 생성
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    const publicUserId = (userData as { id: string } | null)?.id;
    if (!publicUserId) {
      return apiUnauthorized("사용자 정보를 찾을 수 없습니다.");
    }

    // 후보자 소유권 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: candidate, error: candidateError } = await (supabase as any)
      .from("candidates")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (candidateError || !candidate) {
      return apiNotFound("후보자를 찾을 수 없습니다.");
    }

    if (candidate.user_id !== publicUserId) {
      return apiForbidden("이 후보자에게 연락 기록을 추가할 권한이 없습니다.");
    }

    // 요청 바디 파싱
    const body: CreateContactRequest = await request.json();

    // 필수 필드 검증
    if (!body.contactType) {
      return apiBadRequest("연락 유형(contactType)은 필수입니다.");
    }

    if (!VALID_CONTACT_TYPES.includes(body.contactType)) {
      return apiBadRequest(
        `유효하지 않은 연락 유형입니다. 허용: ${VALID_CONTACT_TYPES.join(", ")}`
      );
    }

    if (body.outcome && !VALID_OUTCOMES.includes(body.outcome)) {
      return apiBadRequest(
        `유효하지 않은 결과입니다. 허용: ${VALID_OUTCOMES.join(", ")}`
      );
    }

    // 연락 기록 생성
    const insertData = {
      user_id: publicUserId,
      candidate_id: id,
      contact_type: body.contactType,
      subject: body.subject || null,
      content: body.content || null,
      outcome: body.outcome || "pending",
      next_contact_date: body.nextContactDate || null,
      next_contact_note: body.nextContactNote || null,
      position_id: body.positionId || null,
      contacted_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("contact_history")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      console.error("Contact history insert error:", error);
      return apiInternalError("연락 기록 저장에 실패했습니다.");
    }

    // 트리거가 candidates.last_contact_at, contact_count를 자동 업데이트

    const contact = toContactHistory(data as Record<string, unknown>);

    return apiSuccess(contact, { message: "연락 기록이 저장되었습니다." });
  } catch (error) {
    console.error("Create contact history error:", error);
    return apiInternalError();
  }
}
