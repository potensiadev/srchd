/**
 * GET /api/candidates/duplicates
 * 중복 후보자 감지 (phone_hash, email_hash 기반)
 */

import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiUnauthorized, apiInternalError } from "@/lib/api-response";

interface DuplicateGroup {
  hash: string;
  type: "phone" | "email";
  candidates: {
    id: string;
    name: string;
    last_position: string | null;
    last_company: string | null;
    created_at: string;
    source_file: string | null;
  }[];
}

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 전화번호 해시 기준 중복 조회
    const { data: phoneData, error: phoneError } = await supabase
      .from("candidates")
      .select("id, name, last_position, last_company, created_at, source_file, phone_hash")
      .eq("user_id", user.id)
      .eq("is_latest", true)
      .eq("status", "completed")
      .not("phone_hash", "is", null);

    if (phoneError) {
      console.error("Phone duplicates error:", phoneError);
      return apiInternalError();
    }

    // 이메일 해시 기준 중복 조회
    const { data: emailData, error: emailError } = await supabase
      .from("candidates")
      .select("id, name, last_position, last_company, created_at, source_file, email_hash")
      .eq("user_id", user.id)
      .eq("is_latest", true)
      .eq("status", "completed")
      .not("email_hash", "is", null);

    if (emailError) {
      console.error("Email duplicates error:", emailError);
      return apiInternalError();
    }

    // 중복 그룹화 함수
    function groupByHash<T extends Record<string, unknown>>(
      data: T[],
      hashField: string,
      type: "phone" | "email"
    ): DuplicateGroup[] {
      const hashMap = new Map<string, T[]>();

      for (const item of data) {
        const hash = item[hashField] as string;
        if (hash) {
          if (!hashMap.has(hash)) {
            hashMap.set(hash, []);
          }
          hashMap.get(hash)!.push(item);
        }
      }

      const duplicates: DuplicateGroup[] = [];
      for (const [hash, items] of hashMap) {
        if (items.length > 1) {
          duplicates.push({
            hash,
            type,
            candidates: items.map((item) => ({
              id: item.id as string,
              name: item.name as string,
              last_position: item.last_position as string | null,
              last_company: item.last_company as string | null,
              created_at: item.created_at as string,
              source_file: item.source_file as string | null,
            })),
          });
        }
      }

      return duplicates;
    }

    const phoneDuplicates = groupByHash(phoneData || [], "phone_hash", "phone");
    const emailDuplicates = groupByHash(emailData || [], "email_hash", "email");

    // 중복 해시 제거 (phone과 email이 같은 그룹일 수 있음)
    const seenHashes = new Set<string>();
    const allDuplicates: DuplicateGroup[] = [];

    for (const group of phoneDuplicates) {
      if (!seenHashes.has(group.hash)) {
        seenHashes.add(group.hash);
        allDuplicates.push(group);
      }
    }

    for (const group of emailDuplicates) {
      if (!seenHashes.has(group.hash)) {
        seenHashes.add(group.hash);
        allDuplicates.push(group);
      }
    }

    // 가장 많은 중복부터 정렬
    allDuplicates.sort((a, b) => b.candidates.length - a.candidates.length);

    return apiSuccess({
      duplicates: allDuplicates,
      summary: {
        totalGroups: allDuplicates.length,
        totalDuplicates: allDuplicates.reduce((acc, g) => acc + g.candidates.length, 0),
        byPhone: phoneDuplicates.length,
        byEmail: emailDuplicates.length,
      },
    });
  } catch (error) {
    console.error("Duplicates API error:", error);
    return apiInternalError();
  }
}
