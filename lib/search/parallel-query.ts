/**
 * 병렬 쿼리 실행 유틸리티
 *
 * PRD 요구사항:
 * - 동의어 확장 시 OR 조건이 많아져 쿼리 성능 저하
 * - 스킬별로 쿼리를 분리하여 병렬 실행
 * - 최대 5개 병렬 쿼리 제한 (DB 연결 풀 고갈 방지)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { expandSkillsFromDB } from "./synonym-service";

// 병렬 쿼리 설정
const MAX_PARALLEL_QUERIES = 5;
const MAX_SKILLS_PER_GROUP = 15;  // BUG-004: 그룹당 최대 스킬 수 제한 (성능 보장)
const MAX_TOTAL_SKILLS = MAX_PARALLEL_QUERIES * MAX_SKILLS_PER_GROUP;  // 75개

export interface ParallelQueryOptions {
  userId: string;
  skills: string[];
  expandSynonyms?: boolean;
  expYearsMin?: number;
  expYearsMax?: number;
  location?: string;
  companies?: string[];
  excludeCompanies?: string[];
  limit?: number;
}

export interface ParallelQueryResult {
  id: string;
  name: string;
  last_position: string;
  last_company: string;
  exp_years: number;
  skills: string[];
  photo_url?: string;
  summary?: string;
  confidence_score: number;
  requires_review: boolean;
  risk_level: string;
  created_at: string;
  updated_at: string;
}

/**
 * ILIKE 패턴 이스케이프
 */
function escapeILikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * 스킬을 병렬 쿼리 그룹으로 분리 (DB 기반 동의어 확장)
 * - 동의어 확장 후 최대 MAX_PARALLEL_QUERIES 그룹으로 분리
 * - 초과 시 마지막 그룹에 나머지 스킬 모두 포함
 */
export async function groupSkillsForParallel(
  skills: string[],
  expandSynonyms: boolean = true
): Promise<string[][]> {
  // Defense in depth: null/undefined/empty 필터링 (BUG-003)
  const sanitizedSkills = skills.filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );

  if (sanitizedSkills.length === 0) {
    return [];
  }

  // DB 기반 동의어 확장 (하드코딩 제거)
  let allSkills: string[];
  if (expandSynonyms) {
    const expandedSet = await expandSkillsFromDB(sanitizedSkills);
    allSkills = Array.from(expandedSet);
  } else {
    allSkills = [...sanitizedSkills];
  }

  // BUG-004: 총 스킬 수 제한 (성능 보장)
  // 동의어 확장으로 스킬이 너무 많아지면 상위 N개만 사용
  const effectiveSkills = allSkills.length > MAX_TOTAL_SKILLS
    ? allSkills.slice(0, MAX_TOTAL_SKILLS)
    : allSkills;

  // 스킬 수가 적으면 그룹화하지 않음
  if (effectiveSkills.length <= MAX_PARALLEL_QUERIES) {
    return effectiveSkills.map((skill) => [skill]);
  }

  // BUG-004: 그룹 크기 제한 적용
  // 그룹당 최대 MAX_SKILLS_PER_GROUP개로 제한하여 쿼리 성능 보장
  const groups: string[][] = [];
  const groupSize = Math.min(
    Math.ceil(effectiveSkills.length / MAX_PARALLEL_QUERIES),
    MAX_SKILLS_PER_GROUP
  );

  for (let i = 0; i < MAX_PARALLEL_QUERIES; i++) {
    const start = i * groupSize;
    const end = Math.min(start + groupSize, effectiveSkills.length);
    if (start < effectiveSkills.length) {
      groups.push(effectiveSkills.slice(start, end));
    }
  }

  return groups;
}

/**
 * Keyword Search용 병렬 쿼리 실행
 * - 스킬 그룹별로 쿼리를 분리하여 병렬 실행
 * - 결과 중복 제거 및 병합
 */
export async function executeParallelKeywordSearch(
  supabase: SupabaseClient,
  options: ParallelQueryOptions
): Promise<{
  results: ParallelQueryResult[];
  total: number;
}> {
  const {
    userId,
    skills,
    expandSynonyms = true,
    expYearsMin,
    expYearsMax,
    location,
    companies,
    excludeCompanies,
    limit = 50,
  } = options;

  // Defense in depth: null/undefined/empty 필터링 (BUG-003)
  const sanitizedSkills = skills?.filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  ) || [];

  if (sanitizedSkills.length === 0) {
    return { results: [], total: 0 };
  }

  // 스킬을 병렬 쿼리 그룹으로 분리 (DB 기반 동의어 확장)
  const skillGroups = await groupSkillsForParallel(sanitizedSkills, expandSynonyms);

  // 각 그룹에 대해 쿼리 생성
  const queryPromises = skillGroups.map(async (skillGroup) => {
    let queryBuilder = supabase
      .from("candidates")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("is_latest", true)
      .overlaps("skills", skillGroup);

    // 추가 필터 적용
    if (expYearsMin !== undefined) {
      queryBuilder = queryBuilder.gte("exp_years", expYearsMin);
    }
    if (expYearsMax !== undefined) {
      queryBuilder = queryBuilder.lte("exp_years", expYearsMax);
    }
    if (location) {
      const escapedLocation = escapeILikePattern(location);
      queryBuilder = queryBuilder.ilike("location_city", `%${escapedLocation}%`);
    }
    if (companies && companies.length > 0) {
      const companyConditions = companies
        .map((c) => `last_company.ilike.%${escapeILikePattern(c)}%`)
        .join(",");
      queryBuilder = queryBuilder.or(companyConditions);
    }
    if (excludeCompanies && excludeCompanies.length > 0) {
      for (const company of excludeCompanies) {
        queryBuilder = queryBuilder.not(
          "last_company",
          "ilike",
          `%${escapeILikePattern(company)}%`
        );
      }
    }

    // 각 그룹당 limit 개씩 가져옴 (나중에 병합 후 전체 limit 적용)
    const perGroupLimit = Math.ceil(limit / skillGroups.length) + 10;

    const { data, error } = await queryBuilder
      .order("confidence_score", { ascending: false })
      .limit(perGroupLimit);

    if (error) {
      console.error("Parallel query error:", error);
      return [];
    }

    return data || [];
  });

  // 병렬 실행
  const results = await Promise.all(queryPromises);

  // 결과 병합 및 중복 제거
  const seenIds = new Set<string>();
  const merged: ParallelQueryResult[] = [];

  for (const batch of results) {
    for (const row of batch) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        merged.push(row as ParallelQueryResult);
      }
    }
  }

  // confidence_score로 정렬 후 limit 적용
  merged.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
  const limitedResults = merged.slice(0, limit);

  return {
    results: limitedResults,
    total: merged.length,
  };
}

/**
 * 스킬 필터가 병렬 쿼리에 적합한지 확인
 * - 스킬 수가 2개 이상일 때만 병렬 쿼리 사용
 */
export function shouldUseParallelQuery(skills?: string[]): boolean {
  return !!skills && skills.length >= 2;
}

/**
 * JOIN 기반 스킬 검색 (Phase 2 최적화)
 * - skill_synonyms 테이블과 JOIN하여 동의어 자동 확장
 * - 단일 쿼리로 모든 스킬 매칭 수행
 */
export async function executeJoinBasedSkillSearch(
  supabase: SupabaseClient,
  options: ParallelQueryOptions
): Promise<{
  results: ParallelQueryResult[];
  total: number;
}> {
  const {
    userId,
    skills,
    expYearsMin,
    expYearsMax,
    location,
    companies,
    excludeCompanies,
    limit = 50,
  } = options;

  // Defense in depth: null/undefined/empty 필터링 (BUG-003)
  const sanitizedSkills = skills?.filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  ) || [];

  if (sanitizedSkills.length === 0) {
    return { results: [], total: 0 };
  }

  try {
    const { data, error } = await supabase.rpc("search_candidates_by_skills", {
      p_user_id: userId,
      p_skills: sanitizedSkills,
      p_match_count: limit,
      p_exp_years_min: expYearsMin ?? null,
      p_exp_years_max: expYearsMax ?? null,
      p_location: location ?? null,
      p_companies: companies ?? null,
      p_exclude_companies: excludeCompanies ?? null,
    });

    if (error) {
      console.error("JOIN-based skill search error:", error);
      // 폴백: 기존 병렬 쿼리 사용
      return executeParallelKeywordSearch(supabase, options);
    }

    return {
      results: (data || []) as ParallelQueryResult[],
      total: data?.length || 0,
    };
  } catch (err) {
    console.error("JOIN-based skill search exception:", err);
    // 폴백: 기존 병렬 쿼리 사용
    return executeParallelKeywordSearch(supabase, options);
  }
}

/**
 * 환경 변수로 JOIN 기반 검색 사용 여부 결정
 */
export function shouldUseJoinBasedSearch(): boolean {
  return process.env.USE_JOIN_BASED_SKILL_SEARCH === "true";
}
