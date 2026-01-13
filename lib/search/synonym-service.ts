/**
 * DB 기반 스킬 동의어 서비스
 *
 * 하드코딩된 동의어 사전 대신 DB의 skill_synonyms 테이블을 사용
 * - 메모리 캐싱으로 성능 최적화 (TTL: 5분)
 * - 새 동의어 추가 시 코드 배포 없이 DB만 업데이트하면 됨
 */

import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────
// 캐시 설정
// ─────────────────────────────────────────────────

/** 캐시 TTL (5분) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** 동의어 캐시: canonical_skill -> variants[] */
let synonymCache: Map<string, string[]> | null = null;

/** 역방향 캐시: variant -> canonical_skill */
let reverseSynonymCache: Map<string, string> | null = null;

/** 마지막 캐시 갱신 시간 */
let lastCacheUpdate = 0;

// ─────────────────────────────────────────────────
// 캐시 관리
// ─────────────────────────────────────────────────

/**
 * 캐시가 유효한지 확인
 */
function isCacheValid(): boolean {
  return (
    synonymCache !== null &&
    reverseSynonymCache !== null &&
    Date.now() - lastCacheUpdate < CACHE_TTL_MS
  );
}

/**
 * DB에서 동의어 데이터 로드 및 캐시 갱신
 */
interface SkillSynonymRow {
  canonical_skill: string;
  variant: string;
}

async function refreshCache(): Promise<void> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("skill_synonyms")
      .select("canonical_skill, variant");

    if (error) {
      console.error("[SynonymService] Failed to load synonyms from DB:", error);
      throw error;
    }

    // 캐시 초기화
    const newSynonymCache = new Map<string, string[]>();
    const newReverseSynonymCache = new Map<string, string>();

    for (const row of (data || []) as SkillSynonymRow[]) {
      const canonical = row.canonical_skill;
      const variant = row.variant;

      // 정방향 캐시: canonical -> variants[]
      if (!newSynonymCache.has(canonical)) {
        newSynonymCache.set(canonical, []);
      }
      newSynonymCache.get(canonical)!.push(variant);

      // 역방향 캐시: variant (lowercase) -> canonical
      newReverseSynonymCache.set(variant.toLowerCase(), canonical);
    }

    // canonical 자체도 역방향 캐시에 추가 (소문자)
    for (const canonical of newSynonymCache.keys()) {
      newReverseSynonymCache.set(canonical.toLowerCase(), canonical);
    }

    // 캐시 교체
    synonymCache = newSynonymCache;
    reverseSynonymCache = newReverseSynonymCache;
    lastCacheUpdate = Date.now();

    console.log(`[SynonymService] Cache refreshed: ${newSynonymCache.size} skills, ${newReverseSynonymCache.size} variants`);
  } catch (error) {
    console.error("[SynonymService] Cache refresh failed:", error);
    // 캐시 갱신 실패 시 기존 캐시 유지 (있는 경우)
    throw error;
  }
}

/**
 * 캐시가 없거나 만료된 경우 갱신
 */
async function ensureCacheLoaded(): Promise<void> {
  if (!isCacheValid()) {
    await refreshCache();
  }
}

// ─────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────

/**
 * 스킬명을 정규화된 이름으로 변환 (DB 기반)
 * @param skill 원본 스킬명
 * @returns 정규화된 스킬명 (없으면 원본 반환)
 */
export async function normalizeSkillFromDB(skill: string): Promise<string> {
  await ensureCacheLoaded();
  return reverseSynonymCache?.get(skill.toLowerCase()) || skill;
}

/**
 * 스킬명에 대한 모든 동의어 반환 (DB 기반)
 * @param skill 스킬명
 * @returns 동의어 배열 (자기 자신 포함)
 */
export async function getSkillSynonymsFromDB(skill: string): Promise<string[]> {
  await ensureCacheLoaded();

  // 먼저 정규화
  const canonical = reverseSynonymCache?.get(skill.toLowerCase()) || skill;

  // 동의어 배열 가져오기
  const synonyms = synonymCache?.get(canonical) || [];

  // canonical과 동의어 배열 합쳐서 반환
  if (synonyms.length > 0) {
    return [canonical, ...synonyms.filter(s => s !== canonical)];
  }

  // DB에 없는 스킬은 자기 자신만 반환
  return [skill];
}

/**
 * 여러 스킬에 대한 동의어를 일괄 조회 (DB 기반)
 * @param skills 스킬 배열
 * @returns 모든 동의어가 포함된 Set
 */
export async function expandSkillsFromDB(skills: string[]): Promise<Set<string>> {
  await ensureCacheLoaded();

  const expanded = new Set<string>();

  for (const skill of skills) {
    const synonyms = await getSkillSynonymsFromDB(skill);
    for (const syn of synonyms) {
      expanded.add(syn);
    }
  }

  return expanded;
}

/**
 * 두 스킬이 동의어 관계인지 확인 (DB 기반)
 * @param skill1 첫 번째 스킬
 * @param skill2 두 번째 스킬
 * @returns 동의어 여부
 */
export async function areSkillsSynonymsFromDB(
  skill1: string,
  skill2: string
): Promise<boolean> {
  const canonical1 = await normalizeSkillFromDB(skill1);
  const canonical2 = await normalizeSkillFromDB(skill2);
  return canonical1 === canonical2;
}

/**
 * 캐시 강제 갱신 (관리자용)
 */
export async function forceRefreshSynonymCache(): Promise<void> {
  await refreshCache();
}

/**
 * 캐시 상태 조회 (디버깅/모니터링용)
 */
export function getSynonymCacheStatus(): {
  isValid: boolean;
  skillCount: number;
  variantCount: number;
  lastUpdate: Date | null;
  ttlRemaining: number;
} {
  return {
    isValid: isCacheValid(),
    skillCount: synonymCache?.size || 0,
    variantCount: reverseSynonymCache?.size || 0,
    lastUpdate: lastCacheUpdate > 0 ? new Date(lastCacheUpdate) : null,
    ttlRemaining: Math.max(0, CACHE_TTL_MS - (Date.now() - lastCacheUpdate)),
  };
}
