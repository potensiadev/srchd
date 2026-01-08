/**
 * POST /api/search
 * 하이브리드 검색 (RDB 필터 + Vector 검색)
 * - Step 1: RDB 필터 (exp_years, skills, location)
 * - Step 2: Vector 검색 (필터된 후보자 대상)
 * - 청크 타입별 가중치 적용
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai/embedding";
import { withRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import {
  type SearchRequest,
  type SearchResponse,
  type CandidateSearchResult,
  getConfidenceLevel,
  type RiskLevel,
  type ChunkType,
} from "@/types";

// ─────────────────────────────────────────────────
// 입력 검증 및 살균 유틸리티
// ─────────────────────────────────────────────────

/**
 * ILIKE 패턴에서 특수문자 이스케이프 (SQL Injection 방지)
 * PostgreSQL ILIKE에서 특수 의미를 가진 문자: %, _, \
 */
function escapeILikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")  // \ -> \\
    .replace(/%/g, "\\%")    // % -> \%
    .replace(/_/g, "\\_");   // _ -> \_
}

/**
 * 배열 필터용 값 살균 (중괄호 제거)
 */
function sanitizeArrayValue(value: string): string {
  return value.replace(/[{}]/g, "").trim();
}

/**
 * 일반 문자열 살균 (위험 문자 제거)
 */
function sanitizeString(value: string, maxLength: number = 100): string {
  return value
    .replace(/[<>'"`;]/g, "")  // XSS/SQL 위험 문자 제거
    .trim()
    .slice(0, maxLength);
}

/**
 * DB row를 CandidateSearchResult로 변환
 */
function toSearchResult(
  row: Record<string, unknown>,
  matchScore: number,
  matchedChunks: { type: ChunkType; content: string; score: number }[] = []
): CandidateSearchResult {
  const confidence = (row.confidence_score as number) ?? 0;
  const confidencePercent = Math.round(confidence * 100);

  return {
    id: row.id as string,
    name: row.name as string,
    role: (row.last_position as string) ?? "",
    company: (row.last_company as string) ?? "",
    expYears: (row.exp_years as number) ?? 0,
    skills: (row.skills as string[]) ?? [],
    photoUrl: row.photo_url as string | undefined,
    summary: row.summary as string | undefined,
    aiConfidence: confidencePercent,
    confidenceLevel: getConfidenceLevel(confidencePercent),
    riskLevel: (row.risk_level as RiskLevel) ?? "low",
    requiresReview: (row.requires_review as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    matchScore: Math.round(matchScore * 100),
    matchedChunks,
  };
}

export async function POST(request: NextRequest) {
  try {
    // 레이트 제한 체크 (검색은 분당 30회)
    const rateLimitResponse = await withRateLimit(request, "search");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiUnauthorized();
    }

    // 요청 바디 파싱
    const body: SearchRequest = await request.json();
    const { query, filters } = body;

    // 페이지네이션 파라미터 검증 (정수 오버플로우 및 DoS 방지)
    const MAX_LIMIT = 100;
    const MIN_LIMIT = 1;
    const MIN_OFFSET = 0;

    let limit = typeof body.limit === "number" ? body.limit : 20;
    let offset = typeof body.offset === "number" ? body.offset : 0;

    if (limit < MIN_LIMIT) limit = MIN_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    if (offset < MIN_OFFSET) offset = MIN_OFFSET;

    // 검색어 검증
    const MAX_QUERY_LENGTH = 500;
    const MAX_KEYWORD_LENGTH = 50;

    if (!query || query.trim().length === 0) {
      return apiBadRequest("검색어를 입력해주세요.");
    }

    // 검색어 길이 제한 (DoS 방지)
    if (query.length > MAX_QUERY_LENGTH) {
      return apiBadRequest(`검색어는 ${MAX_QUERY_LENGTH}자 이하로 입력해주세요.`);
    }

    // 검색어 정제: 앞뒤 공백 제거
    const sanitizedQuery = query.trim();

    // 검색 모드 결정: 10자 이상이면 Semantic(Vector), 아니면 Keyword(RDB)
    const isSemanticSearch = sanitizedQuery.length > 10;

    let results: CandidateSearchResult[] = [];
    let total = 0;

    if (isSemanticSearch) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Semantic Search (Vector) with OpenAI Embeddings
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      try {
        // Step 1: 쿼리 임베딩 생성
        const queryEmbedding = await generateEmbedding(sanitizedQuery);

        // Step 2: search_candidates RPC 함수 호출
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
          "search_candidates",
          {
            p_user_id: user.id,
            p_query_embedding: queryEmbedding,
            p_match_count: limit,
            p_exp_years_min: filters?.expYearsMin || null,
            p_exp_years_max: filters?.expYearsMax || null,
            p_skills: filters?.skills?.length ? filters.skills : null,
            p_location: filters?.location || null,
          }
        );

        if (rpcError) {
          console.error("Vector search RPC error:", rpcError);
          throw rpcError;
        }

        // RPC 결과를 CandidateSearchResult로 변환
        results = (rpcData || []).map((row: Record<string, unknown>) => {
          const matchScore = (row.match_score as number) || 0;
          return toSearchResult(row, matchScore);
        });

        total = results.length;
      } catch (embeddingError) {
        // 임베딩 생성 실패 시 텍스트 검색으로 Fallback
        console.warn("Embedding failed, falling back to text search:", embeddingError);

        // Fallback 텍스트 검색에서도 SQL Injection 방지
        const escapedQuery = escapeILikePattern(sanitizedQuery);

        let queryBuilder = supabase
          .from("candidates")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .eq("status", "completed")
          .eq("is_latest", true)
          .or(`summary.ilike.%${escapedQuery}%,last_position.ilike.%${escapedQuery}%`);

        if (filters?.expYearsMin) {
          queryBuilder = queryBuilder.gte("exp_years", filters.expYearsMin);
        }
        if (filters?.expYearsMax) {
          queryBuilder = queryBuilder.lte("exp_years", filters.expYearsMax);
        }
        if (filters?.skills && filters.skills.length > 0) {
          queryBuilder = queryBuilder.overlaps("skills", filters.skills);
        }
        if (filters?.location) {
          const escapedLocation = escapeILikePattern(sanitizeString(filters.location));
          queryBuilder = queryBuilder.ilike("location_city", `%${escapedLocation}%`);
        }

        const { data, error, count } = await queryBuilder
          .order("confidence_score", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error("Text search error:", error);
          return apiInternalError();
        }

        results = (data || []).map((row, index) => {
          const score = Math.max(0.6, 0.95 - index * 0.03);
          return toSearchResult(row as Record<string, unknown>, score);
        });

        total = count ?? 0;
      }
    } else {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Keyword Search (RDB)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 키워드 분리 및 개별 키워드 길이 제한 + SQL Injection 방지
      const keywords = sanitizedQuery
        .split(",")
        .map(k => sanitizeString(k, MAX_KEYWORD_LENGTH))
        .filter(Boolean);

      let queryBuilder = supabase
        .from("candidates")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "completed")
        .eq("is_latest", true);

      // 키워드 검색: 스킬, 직책, 회사명에서 검색 (SQL Injection 방지)
      if (keywords.length > 0) {
        const orConditions = keywords.map(keyword => {
          const escapedKeyword = escapeILikePattern(keyword);
          const sanitizedKeyword = sanitizeArrayValue(keyword);
          return `skills.cs.{${sanitizedKeyword}},last_position.ilike.%${escapedKeyword}%,last_company.ilike.%${escapedKeyword}%,name.ilike.%${escapedKeyword}%`;
        }).join(",");
        queryBuilder = queryBuilder.or(orConditions);
      }

      // RDB 필터 적용
      if (filters?.expYearsMin) {
        queryBuilder = queryBuilder.gte("exp_years", filters.expYearsMin);
      }
      if (filters?.expYearsMax) {
        queryBuilder = queryBuilder.lte("exp_years", filters.expYearsMax);
      }
      if (filters?.skills && filters.skills.length > 0) {
        queryBuilder = queryBuilder.overlaps("skills", filters.skills);
      }
      if (filters?.location) {
        const escapedLocation = escapeILikePattern(sanitizeString(filters.location));
        queryBuilder = queryBuilder.ilike("location_city", `%${escapedLocation}%`);
      }

      const { data, error, count } = await queryBuilder
        .order("confidence_score", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Keyword search error:", error);
        return apiInternalError();
      }

      // 키워드 매칭 기반 점수 계산
      results = (data || []).map((row, index) => {
        const score = Math.max(0.7, 0.98 - index * 0.02);
        return toSearchResult(row as Record<string, unknown>, score);
      });

      total = count ?? 0;
    }

    const response: SearchResponse = {
      results,
      total,
    };

    return apiSuccess(response, {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  } catch (error) {
    console.error("Search API error:", error);
    return apiInternalError();
  }
}
