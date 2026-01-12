/**
 * Cache module exports
 * 검색 캐싱 관련 유틸리티
 */

export {
  generateCacheKey,
  getCacheStrategy,
  getSearchFromCache,
  setSearchCache,
  getSearchWithSWR,
  invalidateUserSearchCache,
  getPopularQueries,
  getCacheStats,
  isCacheEnabled,
} from './search-cache';
