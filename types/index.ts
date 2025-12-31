/**
 * RAI v6.0 Type Exports
 * 모든 타입을 중앙에서 export
 */

// Candidate Types
export type {
  ConfidenceLevel,
  RiskLevel,
  CandidateStatus,
  CandidateListItem,
  Career,
  Project,
  Education,
  CandidateDetail,
  CandidateSearchResult,
  SearchFilters,
  SearchRequest,
  SearchResponse,
  ChunkType,
  CandidateChunk,
  ProcessingStatus,
  ParseMethod,
  ProcessingJob,
  FeedbackType,
  SearchFeedback,
} from './candidate';

export {
  CONFIDENCE_LEVELS,
  CHUNK_WEIGHTS,
  getConfidenceLevel,
  requiresReview,
  toCandidateListItem,
} from './candidate';

// Auth Types
export type {
  PlanType,
  AnalysisMode,
  Plan,
  UserProfile,
  ConsentVersions,
  UserConsent,
  ConsentState,
  TransactionType,
  CreditTransaction,
  AuthSession,
} from './auth';

export {
  PLANS,
  CONSENT_VERSIONS,
  isAllRequiredConsentsCompleted,
  getRemainingCredits,
  hasInsufficientCredits,
  toUserProfile,
} from './auth';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Common Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * API 응답 공통 타입
 */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

/**
 * Pagination 파라미터
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Sort 파라미터
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Database Types (Supabase 스키마 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Supabase Database 스키마 타입
 * supabase gen types 명령어로 자동 생성 가능
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          plan: string;
          credits: number;
          credits_used_this_month: number;
          consents_completed: boolean;
          consents_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      candidates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          birth_year: number | null;
          gender: string | null;
          phone_encrypted: string | null;
          email_encrypted: string | null;
          phone_hash: string | null;
          email_hash: string | null;
          skills: string[];
          exp_years: number;
          last_company: string | null;
          last_position: string | null;
          education_level: string | null;
          location_city: string | null;
          summary: string | null;
          strengths: string[];
          careers: Record<string, unknown>[];
          projects: Record<string, unknown>[];
          photo_url: string | null;
          portfolio_thumbnail_url: string | null;
          version: number;
          parent_id: string | null;
          is_latest: boolean;
          confidence_score: number;
          analysis_mode: string;
          requires_review: boolean;
          warnings: string[];
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['candidates']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['candidates']['Insert']>;
      };
      user_consents: {
        Row: {
          id: string;
          user_id: string;
          terms_of_service: boolean;
          terms_of_service_version: string | null;
          terms_of_service_agreed_at: string | null;
          privacy_policy: boolean;
          privacy_policy_version: string | null;
          privacy_policy_agreed_at: string | null;
          third_party_data_guarantee: boolean;
          third_party_data_guarantee_version: string | null;
          third_party_data_guarantee_agreed_at: string | null;
          marketing_consent: boolean;
          marketing_consent_agreed_at: string | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_consents']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_consents']['Insert']>;
      };
    };
    Functions: {
      search_candidates: {
        Args: {
          query_embedding: number[];
          match_count: number;
          filter_user_id: string;
        };
        Returns: Database['public']['Tables']['candidates']['Row'][];
      };
    };
  };
}
