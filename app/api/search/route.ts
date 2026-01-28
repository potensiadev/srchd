/**
 * POST /api/search
 * 하이브리드 검색 (RDB 필터 + Vector 검색)
 * - Step 1: 캐시 확인 (Redis)
 * - Step 2: RDB 필터 (exp_years, skills, location)
 * - Step 3: Vector 검색 (필터된 후보자 대상)
 * - 청크 타입별 가중치 적용
 * - 결과 캐싱 (SWR 패턴)
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
  type SearchFacets,
  type FacetItem,
  type ExpYearsFacet,
  getConfidenceLevel,
  type RiskLevel,
  type ChunkType,
} from "@/types";
import {
  getSkillSynonymsFromDB,
  expandSkillsFromDB,
} from "@/lib/search/synonym-service";
import {
  groupSkillsForParallel,
  executeParallelKeywordSearch,
  executeJoinBasedSkillSearch,
  shouldUseParallelQuery,
  shouldUseJoinBasedSearch,
} from "@/lib/search/parallel-query";
import {
  generateCacheKey,
  getCacheStrategy,
  getSearchFromCache,
  setSearchCache,
} from "@/lib/cache";
import {
  sanitizeSkillsArray,
  sanitizeSkill,
  parseSearchQuery,
  sanitizeString,
} from "@/lib/search/sanitize";
import {
  MAX_SKILLS_ARRAY_SIZE,
  MAX_KEYWORD_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LIMIT,
  MIN_LIMIT,
  MIN_OFFSET,
  MAX_EXP_YEARS,
  MAX_SKILLS_COUNT,
  MAX_LOCATION_LENGTH,
} from "@/lib/search/constants";
import { recordSearchMetrics } from "@/lib/observability/metrics";
import { engToKor, korToEng } from "@/lib/search/typo";
import { calculateFacets, toSearchResult, escapeILikePattern, sanitizeArrayValue } from "@/lib/search/utils";


// sanitizeString is now imported from @/lib/search/sanitize

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
    let limit = typeof body.limit === "number" ? body.limit : 20;
    let offset = typeof body.offset === "number" ? body.offset : 0;

    if (limit < MIN_LIMIT) limit = MIN_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    if (offset < MIN_OFFSET) offset = MIN_OFFSET;

    if (filters) {
      // 경력 연수 검증
      if (filters.expYearsMin !== undefined) {
        if (typeof filters.expYearsMin !== "number" || filters.expYearsMin < 0 || filters.expYearsMin > MAX_EXP_YEARS) {
          return apiBadRequest(`최소 경력은 0-${MAX_EXP_YEARS}년 사이로 입력해주세요.`);
        }
      }
      if (filters.expYearsMax !== undefined) {
        if (typeof filters.expYearsMax !== "number" || filters.expYearsMax < 0 || filters.expYearsMax > MAX_EXP_YEARS) {
          return apiBadRequest(`최대 경력은 0-${MAX_EXP_YEARS}년 사이로 입력해주세요.`);
        }
      }
      if (filters.expYearsMin !== undefined && filters.expYearsMax !== undefined) {
        if (filters.expYearsMin > filters.expYearsMax) {
          return apiBadRequest("최소 경력이 최대 경력보다 클 수 없습니다.");
        }
      }

      // 스킬 배열 검증 및 살균 (BUG-003 fix: null/undefined/empty 필터링)
      if (filters.skills) {
        if (!Array.isArray(filters.skills)) {
          return apiBadRequest("스킬은 배열 형식이어야 합니다.");
        }

        // null, undefined, 빈 문자열 필터링 및 trim 적용
        filters.skills = filters.skills
          .filter((skill): skill is string =>
            typeof skill === 'string' && skill.trim().length > 0
          )
          .map(skill => skill.trim());

        if (filters.skills.length > MAX_SKILLS_COUNT) {
          return apiBadRequest(`스킬은 최대 ${MAX_SKILLS_COUNT}개까지 선택할 수 있습니다.`);
        }

        // 각 스킬 문자열 길이 검증
        for (const skill of filters.skills) {
          if (skill.length > 50) {
            return apiBadRequest("스킬명은 50자 이하의 문자열이어야 합니다.");
          }
        }
      }

      // 지역 검증
      if (filters.location !== undefined) {
        if (typeof filters.location !== "string" || filters.location.length > MAX_LOCATION_LENGTH) {
          return apiBadRequest(`지역은 ${MAX_LOCATION_LENGTH}자 이하로 입력해주세요.`);
        }
      }

      // 회사 필터 검증 (P0)
      if (filters.companies !== undefined) {
        if (!Array.isArray(filters.companies)) {
          return apiBadRequest("회사 필터는 배열 형식이어야 합니다.");
        }
        if (filters.companies.length > 10) {
          return apiBadRequest("회사는 최대 10개까지 선택할 수 있습니다.");
        }
      }

      if (filters.excludeCompanies !== undefined) {
        if (!Array.isArray(filters.excludeCompanies)) {
          return apiBadRequest("제외 회사 필터는 배열 형식이어야 합니다.");
        }
        if (filters.excludeCompanies.length > 10) {
          return apiBadRequest("제외 회사는 최대 10개까지 선택할 수 있습니다.");
        }
      }
    }

    // 검색어 검증 (상수는 @/lib/search/sanitize에서 import)
    if (!query || query.trim().length === 0) {
      return apiBadRequest("검색어를 입력해주세요.");
    }

    // 검색어 길이 제한 (DoS 방지)
    if (query.length > MAX_QUERY_LENGTH) {
      return apiBadRequest(`검색어는 ${MAX_QUERY_LENGTH}자 이하로 입력해주세요.`);
    }

    // 검색어 정제: 앞뒤 공백 제거
    const sanitizedQuery = query.trim();

    // 오타 보정 (한영/영한 변환)
    // 1. 영문(ASCII) 위주면 -> 한글 변환 시도 (rksr -> 간식)
    // 2. 한글 위주면 -> 영문 변환 시도 (key -> ㅏ됴?) - 보통 영문타자가 한글로 되는 경우가 많음
    // 3. 둘 다 섞여 있거나 애매하면 둘 다 생성

    // 간단한 휴리스틱: 한글이 하나도 없으면 영->한 시도
    const hasKorean = /[가-힣]/.test(sanitizedQuery);
    const correctedQueries: string[] = [];

    if (!hasKorean) {
      // 영 -> 한 변환 (예: rksr -> 간식)
      const kor = engToKor(sanitizedQuery);
      if (kor !== sanitizedQuery) {
        correctedQueries.push(kor);
      }
    } else {
      // 한 -> 영 변환 (예: ㅎ -> g) - 주로 약어 검색 등
      // 너무 긴 문장은 변환하지 않음 (성능 및 노이즈 방지)
      if (sanitizedQuery.length <= 10) {
        const eng = korToEng(sanitizedQuery);
        if (eng !== sanitizedQuery) {
          correctedQueries.push(eng);
        }
      }
    }

    // ─────────────────────────────────────────────────
    // 캐시 확인 (Redis)
    // ─────────────────────────────────────────────────
    const hasFilters = !!(
      filters?.expYearsMin !== undefined ||
      filters?.expYearsMax !== undefined ||
      (filters?.skills && filters.skills.length > 0) ||
      filters?.location ||
      (filters?.companies && filters.companies.length > 0) ||
      (filters?.excludeCompanies && filters.excludeCompanies.length > 0)
    );

    const cacheKey = generateCacheKey(user.id, sanitizedQuery, filters);
    const cacheStrategy = getCacheStrategy(sanitizedQuery, hasFilters);

    // 캐시에서 조회
    const cachedResult = await getSearchFromCache(cacheKey, cacheStrategy);
    if (cachedResult && !cachedResult.isStale) {
      // 캐시 히트 - 즉시 반환
      const response = cachedResult.data;
      return apiSuccess(response, {
        total: response.total,
        page: Math.floor(offset / limit) + 1,
        limit,
        cached: true,
        cacheAge: cachedResult.cacheAge,
      });
    }

    // 검색 모드 결정: 3자 이상이면 Semantic(Vector/AI), 2자 이하만 Keyword(RDB)
    // Phase 1: AI-Only 전환 - DB 동의어 의존성 최소화
    const isSemanticSearch = sanitizedQuery.length >= 3;


    // 검색 시작 시간 (성능 측정)
    const searchStartTime = Date.now();

    // 파싱된 키워드 (UI에 표시용)
    const parsedKeywords = parseSearchQuery(sanitizedQuery);

    let results: CandidateSearchResult[] = [];
    let total = 0;

    if (isSemanticSearch) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Semantic Search (Vector) with OpenAI Embeddings
      // 병렬 RPC 함수 사용 (스킬 2개 이상일 때)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      try {
        // Step 1: 쿼리 임베딩 생성
        const queryEmbedding = await generateEmbedding(sanitizedQuery);

        // Step 1.5: 스킬 필터 확인 및 병렬 쿼리 결정
        const shouldExpand = filters?.expandSynonyms !== false;
        const useParallel = shouldUseParallelQuery(filters?.skills);

        if (useParallel && filters?.skills) {
          // ─────────────────────────────────────────────────
          // 병렬 RPC 검색 (스킬 그룹별 분리, DB 기반 동의어 확장)
          // ─────────────────────────────────────────────────
          const skillGroups = await groupSkillsForParallel(filters.skills, shouldExpand);

          // 최대 5개 그룹으로 패딩
          const paddedGroups: (string[] | null)[] = [null, null, null, null, null];
          for (let i = 0; i < Math.min(skillGroups.length, 5); i++) {
            paddedGroups[i] = skillGroups[i];
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
            "search_candidates_parallel",
            {
              p_user_id: user.id,
              p_query_embedding: queryEmbedding,
              p_match_count: limit,
              p_exp_years_min: filters?.expYearsMin || null,
              p_exp_years_max: filters?.expYearsMax || null,
              p_skill_group_1: paddedGroups[0],
              p_skill_group_2: paddedGroups[1],
              p_skill_group_3: paddedGroups[2],
              p_skill_group_4: paddedGroups[3],
              p_skill_group_5: paddedGroups[4],
              p_location: filters?.location || null,
              p_companies: filters?.companies?.length ? filters.companies : null,
              p_exclude_companies: filters?.excludeCompanies?.length ? filters.excludeCompanies : null,
              p_education_level: filters?.educationLevel || null,
            }
          );

          if (rpcError) {
            console.error("Parallel vector search RPC error:", rpcError);
            throw rpcError;
          }

          results = (rpcData || []).map((row: Record<string, unknown>) => {
            const matchScore = (row.match_score as number) || 0;
            return toSearchResult(row, matchScore);
          });

          total = results.length;
        } else {
          // ─────────────────────────────────────────────────
          // Semantic Search with Relaxed Filtering (Boost Mode)
          // "Filter Trap" 해결: AI 모드에서는 필터를 '제외'가 아닌 '가산점'으로 처리
          // ─────────────────────────────────────────────────

          let expandedSkills: string[] | null = null;
          let boostSkills: string[] = [];

          if (filters?.skills && filters.skills.length > 0) {
            // 원본 스킬은 부스트용으로 저장
            boostSkills = filters.skills;

            // AI Semantic 모드에서는 RPC에 필터를 전달하지 않음 (Strict Filtering 방지)
            // 대신 검색 범위를 넓혀서 가져온 뒤 JS에서 Re-ranking 수행
            if (!isSemanticSearch) {
              if (shouldExpand) {
                const allSkills = await expandSkillsFromDB(filters.skills);
                expandedSkills = Array.from(allSkills);
              } else {
                expandedSkills = filters.skills;
              }
            } else {
              // Semantic Mode: 필터 해제 + 검색 범위 확대
              // limit을 3배로 늘려서 후보군 확보
              limit = limit * 3;
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
            "search_candidates",
            {
              p_user_id: user.id,
              p_query_embedding: queryEmbedding,
              p_match_count: limit,
              p_exp_years_min: filters?.expYearsMin || null,
              p_exp_years_max: filters?.expYearsMax || null,
              p_skills: expandedSkills, // Semantic 모드에서는 null
              p_location: filters?.location || null,
              p_companies: filters?.companies?.length ? filters.companies : null,
              p_exclude_companies: filters?.excludeCompanies?.length ? filters.excludeCompanies : null,
              p_education_level: filters?.educationLevel || null,
            }

          );

          if (rpcError) {
            console.error("Vector search RPC error:", rpcError);
            throw rpcError;
          }

          results = (rpcData || []).map((row: Record<string, unknown>) => {
            const matchScore = (row.match_score as number) || 0;
            return toSearchResult(row, matchScore);
          });

          total = results.length;
        }
      } catch (embeddingError) {
        // 임베딩 생성 실패 시 텍스트 검색으로 Fallback
        // P0: Structured logging for observability
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'search',
          event: 'fallback_triggered',
          reason: embeddingError instanceof Error ? embeddingError.message : 'Unknown',
          query_length: sanitizedQuery.length,
        }));

        // Fallback 텍스트 검색에서도 SQL Injection 방지
        const escapedQuery = escapeILikePattern(sanitizedQuery);

        let orCondition = `summary.ilike.%${escapedQuery}%,last_position.ilike.%${escapedQuery}%`;

        // 오타 보정 검색어 추가
        for (const corrected of correctedQueries) {
          const escapedCorrected = escapeILikePattern(corrected);
          orCondition += `,summary.ilike.%${escapedCorrected}%,last_position.ilike.%${escapedCorrected}%`;
        }

        let queryBuilder = supabase
          .from("candidates")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .eq("status", "completed")
          .eq("is_latest", true)
          .or(orCondition);

        if (filters?.expYearsMin) {
          queryBuilder = queryBuilder.gte("exp_years", filters.expYearsMin);
        }
        if (filters?.expYearsMax) {
          queryBuilder = queryBuilder.lte("exp_years", filters.expYearsMax);
        }
        if (filters?.skills && filters.skills.length > 0) {
          // P0: Fallback에서는 DB 의존 없이 순수 텍스트 매칭
          // AI-Only 아키텍처에서 Fallback은 최소 기능만 제공
          queryBuilder = queryBuilder.overlaps("skills", filters.skills);
        }

        if (filters?.location) {
          const escapedLocation = escapeILikePattern(sanitizeString(filters.location));
          queryBuilder = queryBuilder.ilike("location_city", `%${escapedLocation}%`);
        }
        // 회사 필터 (Fallback)
        if (filters?.companies && filters.companies.length > 0) {
          const companyConditions = filters.companies
            .map((c) => `last_company.ilike.%${escapeILikePattern(c)}%`)
            .join(",");
          queryBuilder = queryBuilder.or(companyConditions);
        }
        if (filters?.excludeCompanies && filters.excludeCompanies.length > 0) {
          for (const company of filters.excludeCompanies) {
            queryBuilder = queryBuilder.not(
              "last_company",
              "ilike",
              `%${escapeILikePattern(company)}%`
            );
          }
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
      // 병렬 쿼리 적용 (스킬 2개 이상일 때)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 키워드 분리: parseSearchQuery 유틸 함수 사용
      // Mixed Language Query 지원: 공백, 쉼표, 한글+영문 경계로 분리
      // 예: "React개발자" → ["React", "개발자"], "시니어Developer" → ["시니어", "Developer"]
      let keywords = parseSearchQuery(sanitizedQuery);

      // 오타 보정된 쿼리도 키워드로 분리하여 추가
      for (const corrected of correctedQueries) {
        const correctedKeywords = parseSearchQuery(corrected);
        for (const k of correctedKeywords) {
          if (!keywords.includes(k)) {
            keywords.push(k);
          }
        }
      }

      // 스킬 필터가 2개 이상일 때 병렬 쿼리 사용
      const useParallel = shouldUseParallelQuery(filters?.skills);
      const shouldExpand = filters?.expandSynonyms !== false;
      // JOIN 기반 검색 사용 여부 (Phase 2 최적화)
      const useJoinBased = shouldUseJoinBasedSearch();

      if (useParallel && filters?.skills) {
        // ─────────────────────────────────────────────────
        // 스킬 기반 최적화 쿼리 실행
        // - Phase 2: JOIN 기반 (skill_synonyms 테이블)
        // - Phase 1: 병렬 쿼리 (스킬 그룹별 분리)
        // ─────────────────────────────────────────────────
        const parallelResult = useJoinBased
          ? await executeJoinBasedSkillSearch(supabase, {
            userId: user.id,
            skills: filters.skills,
            expYearsMin: filters.expYearsMin,
            expYearsMax: filters.expYearsMax,
            location: filters.location,
            companies: filters.companies,
            excludeCompanies: filters.excludeCompanies,
            limit: limit,
          })
          : await executeParallelKeywordSearch(supabase, {
            userId: user.id,
            skills: filters.skills,
            expandSynonyms: shouldExpand,
            expYearsMin: filters.expYearsMin,
            expYearsMax: filters.expYearsMax,
            location: filters.location,
            companies: filters.companies,
            excludeCompanies: filters.excludeCompanies,
            limit: limit,
          });

        // 키워드로 추가 필터링 (있는 경우)
        // Mixed Language Query: 각 키워드에 DB 기반 동의어 확장 적용
        let filteredResults = parallelResult.results;
        if (keywords.length > 0) {
          // 모든 키워드의 동의어를 미리 조회 (비동기 처리)
          const keywordSynonymsMap = new Map<string, string[]>();
          for (const keyword of keywords) {
            const synonyms = await getSkillSynonymsFromDB(keyword);
            keywordSynonymsMap.set(keyword, synonyms.map(s => s.toLowerCase()));
          }

          filteredResults = parallelResult.results.filter(row => {
            return keywords.some(keyword => {
              const lowerSynonyms = keywordSynonymsMap.get(keyword) || [keyword.toLowerCase()];

              return lowerSynonyms.some(lowerKeyword => (
                row.skills?.some(s => s && typeof s === "string" && s.toLowerCase().includes(lowerKeyword)) ||
                row.last_position?.toLowerCase().includes(lowerKeyword) ||
                row.last_company?.toLowerCase().includes(lowerKeyword) ||
                row.name?.toLowerCase().includes(lowerKeyword)
              ));
            });
          });
        }

        results = filteredResults.map((row, index) => {
          const score = Math.max(0.7, 0.98 - index * 0.02);
          return toSearchResult(row as unknown as Record<string, unknown>, score);
        });

        total = results.length;
      } else {
        // ─────────────────────────────────────────────────
        // 기존 단일 쿼리 (스킬 필터 없거나 1개일 때)
        // ─────────────────────────────────────────────────
        let queryBuilder = supabase
          .from("candidates")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .eq("status", "completed")
          .eq("is_latest", true);

        // 키워드 검색: 스킬, 직책, 회사명에서 검색 (SQL Injection 방지)
        // Mixed Language Query: 각 키워드에 DB 기반 동의어 확장 적용
        if (keywords.length > 0) {
          // 모든 키워드의 동의어를 미리 조회 (비동기 처리)
          const allOrConditions: string[] = [];
          for (const keyword of keywords) {
            const synonyms = await getSkillSynonymsFromDB(keyword);
            for (const syn of synonyms) {
              const escapedKeyword = escapeILikePattern(syn);
              const sanitizedKeyword = sanitizeArrayValue(syn);
              allOrConditions.push(
                `skills.cs.{${sanitizedKeyword}},last_position.ilike.%${escapedKeyword}%,last_company.ilike.%${escapedKeyword}%,name.ilike.%${escapedKeyword}%`
              );
            }
          }
          queryBuilder = queryBuilder.or(allOrConditions.join(","));
        }

        // RDB 필터 적용
        if (filters?.expYearsMin) {
          queryBuilder = queryBuilder.gte("exp_years", filters.expYearsMin);
        }
        if (filters?.expYearsMax) {
          queryBuilder = queryBuilder.lte("exp_years", filters.expYearsMax);
        }
        if (filters?.skills && filters.skills.length > 0) {
          // DB 기반 동의어 확장 적용 (하드코딩 제거)
          let skillsToSearch = filters.skills;
          if (shouldExpand) {
            const allSkills = await expandSkillsFromDB(filters.skills);
            skillsToSearch = Array.from(allSkills);
          }
          queryBuilder = queryBuilder.overlaps("skills", skillsToSearch);
        }
        if (filters?.location) {
          const escapedLocation = escapeILikePattern(sanitizeString(filters.location));
          queryBuilder = queryBuilder.ilike("location_city", `%${escapedLocation}%`);
        }
        // 회사 필터 (Keyword Search)
        if (filters?.companies && filters.companies.length > 0) {
          const companyConditions = filters.companies
            .map((c) => `last_company.ilike.%${escapeILikePattern(c)}%`)
            .join(",");
          queryBuilder = queryBuilder.or(companyConditions);
        }
        if (filters?.excludeCompanies && filters.excludeCompanies.length > 0) {
          for (const company of filters.excludeCompanies) {
            queryBuilder = queryBuilder.not(
              "last_company",
              "ilike",
              `%${escapeILikePattern(company)}%`
            );
          }
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
    }

    // Facet 계산 (필터 적용 후 결과 기준)
    const facets = calculateFacets(results);

    // ─────────────────────────────────────────────────
    // Step 4: [Aha Moment] Generate Matching Reasoning
    // 상위 5개 결과에 대해 매칭 근거 생성 (Mock-up for now)
    // ─────────────────────────────────────────────────
    const topResults = results.slice(0, 5).map(res => {
      // 쿼리 키워드와 스킬/강점을 대조하여 근거 생성
      const matchedSkills = res.skills.filter(s =>
        parsedKeywords.some(k => s.toLowerCase().includes(k.toLowerCase()))
      );

      let reason = "";
      if (matchedSkills.length > 0) {
        reason = `✓ 검색된 기술(${matchedSkills.join(', ')}) 보유`;
      } else if (res.matchScore >= 90) {
        reason = "✓ 선호 경력 및 역량 기준에 매우 부합함";
      } else {
        reason = "✓ 이력서 내 관련 키워드 및 패턴 감지";
      }

      res.matchReason = reason;
      return res;
    });

    const response: SearchResponse = {
      results,
      total,
      facets,
      parsedKeywords,  // 한영 혼합 쿼리 분리 결과 (UI 표시용)
      typoCorrected: correctedQueries.length > 0 ? correctedQueries[0] : undefined // 오타 보정 결과 제안
    };

    // 검색 소요 시간
    const responseTime = Date.now() - searchStartTime;

    // P1: Record Metrics (Observability)
    recordSearchMetrics(
      responseTime,
      isSemanticSearch ? 'ai_semantic' : 'keyword',
      results.length
    );

    // ─────────────────────────────────────────────────
    // 결과 캐싱 (비동기, 응답 차단 안 함)
    // ─────────────────────────────────────────────────
    setSearchCache(cacheKey, response, sanitizedQuery, filters, cacheStrategy)
      .catch((err) => console.error("[SearchCache] Cache save error:", err));

    return apiSuccess(response, {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      cached: false,
      responseTime,
      searchMode: isSemanticSearch ? 'ai_semantic' : 'keyword',
    });

  } catch (error) {
    console.error("Search API error:", error);
    return apiInternalError();
  }
}
