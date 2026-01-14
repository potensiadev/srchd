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
  FacetItem,
  ExpYearsFacet,
  SearchFacets,
  ChunkType,
  CandidateChunk,
  ProcessingStatus,
  ParseMethod,
  ProcessingJob,
  FeedbackType,
  SearchFeedback,
  // Progressive Loading types
  QuickExtractedData,
  CandidatePartial,
} from './candidate';

export {
  CONFIDENCE_LEVELS,
  CHUNK_WEIGHTS,
  getConfidenceLevel,
  requiresReview,
  toCandidateListItem,
  toCandidatePartial,
} from './candidate';

// Position Types
export type {
  PositionStatus,
  PositionPriority,
  JobType,
  MatchStage,
  Position,
  PositionListItem,
  PositionCandidate,
  ActivityType,
  PositionActivity,
  CreatePositionRequest,
  UpdatePositionRequest,
  PositionMatchesResponse,
  UpdateMatchStageRequest,
} from './position';

export {
  getScoreLevel,
  getScoreColor,
  getPriorityColor,
  getStatusLabel,
  getStageLabel,
  toPosition,
  toPositionListItem,
  toPositionCandidate,
} from './position';

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
        Insert: {
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          credits?: number;
          credits_used_this_month?: number;
          consents_completed?: boolean;
          consents_completed_at?: string | null;
        };
        Update: {
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          plan?: string;
          credits?: number;
          credits_used_this_month?: number;
          consents_completed?: boolean;
          consents_completed_at?: string | null;
        };
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
          address_encrypted: string | null;
          phone_masked: string | null;
          email_masked: string | null;
          address_masked: string | null;
          phone_hash: string | null;
          email_hash: string | null;
          skills: string[];
          exp_years: number;
          last_company: string | null;
          last_position: string | null;
          education_level: string | null;
          education_school: string | null;
          education_major: string | null;
          education: Record<string, unknown>[];
          location_city: string | null;
          summary: string | null;
          strengths: string[];
          careers: Record<string, unknown>[];
          projects: Record<string, unknown>[];
          photo_url: string | null;
          portfolio_thumbnail_url: string | null;
          portfolio_url: string | null;
          github_url: string | null;
          linkedin_url: string | null;
          version: number;
          parent_id: string | null;
          is_latest: boolean;
          confidence_score: number;
          field_confidence: Record<string, number> | null;
          analysis_mode: string;
          requires_review: boolean;
          warnings: string[];
          source_file: string | null;
          file_type: string | null;
          status: string;
          risk_level: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          birth_year?: number | null;
          gender?: string | null;
          phone_encrypted?: string | null;
          email_encrypted?: string | null;
          address_encrypted?: string | null;
          phone_masked?: string | null;
          email_masked?: string | null;
          address_masked?: string | null;
          phone_hash?: string | null;
          email_hash?: string | null;
          skills?: string[];
          exp_years?: number;
          last_company?: string | null;
          last_position?: string | null;
          education_level?: string | null;
          education_school?: string | null;
          education_major?: string | null;
          education?: Record<string, unknown>[];
          location_city?: string | null;
          summary?: string | null;
          strengths?: string[];
          careers?: Record<string, unknown>[];
          projects?: Record<string, unknown>[];
          photo_url?: string | null;
          portfolio_thumbnail_url?: string | null;
          portfolio_url?: string | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          version?: number;
          parent_id?: string | null;
          is_latest?: boolean;
          confidence_score?: number;
          field_confidence?: Record<string, number> | null;
          analysis_mode?: string;
          requires_review?: boolean;
          warnings?: string[];
          source_file?: string | null;
          file_type?: string | null;
          status?: string;
          risk_level?: string | null;
        };
        Update: {
          user_id?: string;
          name?: string;
          birth_year?: number | null;
          gender?: string | null;
          phone_encrypted?: string | null;
          email_encrypted?: string | null;
          address_encrypted?: string | null;
          phone_masked?: string | null;
          email_masked?: string | null;
          address_masked?: string | null;
          phone_hash?: string | null;
          email_hash?: string | null;
          skills?: string[];
          exp_years?: number;
          last_company?: string | null;
          last_position?: string | null;
          education_level?: string | null;
          education_school?: string | null;
          education_major?: string | null;
          education?: Record<string, unknown>[];
          location_city?: string | null;
          summary?: string | null;
          strengths?: string[];
          careers?: Record<string, unknown>[];
          projects?: Record<string, unknown>[];
          photo_url?: string | null;
          portfolio_thumbnail_url?: string | null;
          portfolio_url?: string | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          version?: number;
          parent_id?: string | null;
          is_latest?: boolean;
          confidence_score?: number;
          field_confidence?: Record<string, number> | null;
          analysis_mode?: string;
          requires_review?: boolean;
          warnings?: string[];
          source_file?: string | null;
          file_type?: string | null;
          status?: string;
          risk_level?: string | null;
        };
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
        Insert: {
          user_id: string;
          terms_of_service?: boolean;
          terms_of_service_version?: string | null;
          terms_of_service_agreed_at?: string | null;
          privacy_policy?: boolean;
          privacy_policy_version?: string | null;
          privacy_policy_agreed_at?: string | null;
          third_party_data_guarantee?: boolean;
          third_party_data_guarantee_version?: string | null;
          third_party_data_guarantee_agreed_at?: string | null;
          marketing_consent?: boolean;
          marketing_consent_agreed_at?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: {
          user_id?: string;
          terms_of_service?: boolean;
          terms_of_service_version?: string | null;
          terms_of_service_agreed_at?: string | null;
          privacy_policy?: boolean;
          privacy_policy_version?: string | null;
          privacy_policy_agreed_at?: string | null;
          third_party_data_guarantee?: boolean;
          third_party_data_guarantee_version?: string | null;
          third_party_data_guarantee_agreed_at?: string | null;
          marketing_consent?: boolean;
          marketing_consent_agreed_at?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
        };
      };
      processing_jobs: {
        Row: {
          id: string;
          user_id: string;
          candidate_id: string | null;
          status: 'queued' | 'processing' | 'completed' | 'failed' | 'rejected';
          file_name: string;
          file_type: string;
          file_size: number;
          file_path: string | null;
          parse_method: string | null;
          page_count: number | null;
          analysis_mode: string | null;
          confidence_score: number | null;
          error_code: string | null;
          error_message: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          user_id: string;
          candidate_id?: string | null;
          status: 'queued' | 'processing' | 'completed' | 'failed' | 'rejected';
          file_name: string;
          file_type: string;
          file_size: number;
          file_path?: string | null;
          parse_method?: string | null;
          page_count?: number | null;
          analysis_mode?: string | null;
          confidence_score?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          user_id?: string;
          candidate_id?: string | null;
          status?: 'queued' | 'processing' | 'completed' | 'failed' | 'rejected';
          file_name?: string;
          file_type?: string;
          file_size?: number;
          file_path?: string | null;
          parse_method?: string | null;
          page_count?: number | null;
          analysis_mode?: string | null;
          confidence_score?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
        };
      };
      candidate_chunks: {
        Row: {
          id: string;
          candidate_id: string;
          chunk_type: 'summary' | 'career' | 'project' | 'skill' | 'education' | 'raw_full' | 'raw_section';
          content: string;
          embedding: number[] | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          candidate_id: string;
          chunk_type: 'summary' | 'career' | 'project' | 'skill' | 'education' | 'raw_full' | 'raw_section';
          content: string;
          embedding?: number[] | null;
          metadata?: Record<string, unknown>;
        };
        Update: {
          candidate_id?: string;
          chunk_type?: 'summary' | 'career' | 'project' | 'skill' | 'education' | 'raw_full' | 'raw_section';
          content?: string;
          embedding?: number[] | null;
          metadata?: Record<string, unknown>;
        };
      };
      blind_exports: {
        Row: {
          id: string;
          user_id: string;
          candidate_id: string;
          format: 'pdf' | 'docx';
          file_name: string;
          masked_fields: string[];
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          candidate_id: string;
          format: 'pdf' | 'docx';
          file_name: string;
          masked_fields: string[];
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: {
          user_id?: string;
          candidate_id?: string;
          format?: 'pdf' | 'docx';
          file_name?: string;
          masked_fields?: string[];
          ip_address?: string | null;
          user_agent?: string | null;
        };
      };
      search_feedback: {
        Row: {
          id: string;
          user_id: string;
          candidate_id: string;
          search_query: string;
          feedback_type: string;
          result_position: number;
          relevance_score: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          candidate_id: string;
          search_query: string;
          feedback_type: string;
          result_position: number;
          relevance_score: number;
        };
        Update: {
          user_id?: string;
          candidate_id?: string;
          search_query?: string;
          feedback_type?: string;
          result_position?: number;
          relevance_score?: number;
        };
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          amount: number;
          balance_after: number;
          description: string | null;
          candidate_id: string | null;
          payment_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: string;
          amount: number;
          balance_after: number;
          description?: string | null;
          candidate_id?: string | null;
          payment_id?: string | null;
        };
        Update: {
          user_id?: string;
          type?: string;
          amount?: number;
          balance_after?: number;
          description?: string | null;
          candidate_id?: string | null;
          payment_id?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_candidates: {
        Args: {
          p_user_id: string;
          p_query_embedding: number[];
          p_match_count: number;
          p_exp_years_min: number | null;
          p_exp_years_max: number | null;
          p_skills: string[] | null;
          p_location: string | null;
        };
        Returns: {
          id: string;
          name: string;
          last_position: string | null;
          last_company: string | null;
          exp_years: number;
          skills: string[];
          photo_url: string | null;
          summary: string | null;
          confidence_score: number;
          requires_review: boolean;
          match_score: number;
        }[];
      };
      get_user_credits: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          plan: string;
          base_credits: number;
          credits_used: number;
          bonus_credits: number;
          remaining_credits: number;
        }[];
      };
      get_monthly_blind_export_count: {
        Args: {
          p_user_id: string;
        };
        Returns: number;
      };
      deduct_credit: {
        Args: {
          p_user_id: string;
          p_candidate_id?: string;
          p_description?: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

/**
 * Typed Supabase Client Helper
 * API에서 as any 캐스팅 없이 타입 안전하게 사용
 */
export type TypedSupabaseClient = import('@supabase/supabase-js').SupabaseClient<Database>;

/**
 * 테이블 Row 타입 헬퍼
 */
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

/**
 * RPC 함수 타입 헬퍼
 */
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T];
