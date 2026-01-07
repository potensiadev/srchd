/**
 * Candidate Types for RAI v6.0
 * PRD의 candidates 스키마 기반 타입 정의
 * 기존 LevitatingCard TalentProps와 호환
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confidence & Risk Levels (PRD v6.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';
// Progressive Loading: parsed, analyzed 상태 추가
export type CandidateStatus = 'processing' | 'parsed' | 'analyzed' | 'completed' | 'failed' | 'rejected';

/**
 * PRD v6.0 신뢰도 레벨 상수
 */
export const CONFIDENCE_LEVELS = {
  HIGH: { threshold: 0.95, color: "emerald", action: "optional_review" },
  MEDIUM: { threshold: 0.80, color: "yellow", action: "recommended_review" },
  LOW: { threshold: 0, color: "red", action: "required_review" },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List View (Dashboard / Search Results)
// 기존 LevitatingCard TalentProps와 호환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CandidateListItem {
  id: string;
  name: string;
  role: string;           // last_position
  company: string;        // last_company
  expYears: number;
  skills: string[];
  photoUrl?: string;
  summary?: string;

  // AI 분석 결과 (Zero Tolerance for Error)
  aiConfidence: number;   // 0-100
  confidenceLevel: ConfidenceLevel;
  riskLevel: RiskLevel;
  requiresReview: boolean;

  // 검색 결과용 (optional)
  matchScore?: number;    // 0-100, 검색 시에만

  // 메타
  createdAt: string;
  updatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detail View (Candidate Profile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Career {
  company: string;
  position: string;
  department?: string;
  startDate: string;      // YYYY-MM
  endDate?: string;       // YYYY-MM, null if current
  isCurrent: boolean;
  description?: string;
  achievements?: string[];
}

export interface Project {
  name: string;
  role: string;
  period: string;
  description: string;
  technologies?: string[];
  outcome?: string;
}

export interface Education {
  school: string;
  degree: string;
  major: string;
  startYear?: number;
  endYear?: number;
  status: 'graduated' | 'enrolled' | 'dropped';
}

export interface CandidateDetail extends CandidateListItem {
  // 개인정보 (암호화된 필드는 복호화 후 표시)
  birthYear?: number;
  gender?: 'male' | 'female' | 'other';

  // 연락처 (마스킹된 값, RLS 보호)
  phone?: string;
  email?: string;
  address?: string;

  // 학력 (분리 필드)
  educationLevel?: string;
  educationSchool?: string;
  educationMajor?: string;
  locationCity?: string;

  // 상세 정보
  careers: Career[];
  projects: Project[];
  education: Education[];

  // AI 생성 콘텐츠
  strengths: string[];

  // 시각 자산
  portfolioThumbnailUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  linkedinUrl?: string;

  // 버전 관리
  version: number;
  parentId?: string;
  isLatest: boolean;

  // AI 분석 메타
  analysisMode: 'phase_1' | 'phase_2';
  warnings: string[];
  fieldConfidence?: Record<string, number>;

  // 파일 정보
  sourceFile?: string;
  fileType?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Search Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CandidateSearchResult extends CandidateListItem {
  matchScore: number;       // 0-100, 검색 관련도
  matchedChunks: {
    type: ChunkType;
    content: string;
    score: number;
  }[];
}

export interface SearchFilters {
  expYearsMin?: number;
  expYearsMax?: number;
  skills?: string[];
  location?: string;
  educationLevel?: string;
  company?: string;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: CandidateSearchResult[];
  total: number;
  facets?: {
    skills: { value: string; count: number }[];
    companies: { value: string; count: number }[];
    locations: { value: string; count: number }[];
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vector Chunk Types (pgvector)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ChunkType = 'summary' | 'career' | 'project' | 'skill' | 'education';

export const CHUNK_WEIGHTS: Record<ChunkType, number> = {
  summary: 1.0,
  career: 0.9,
  skill: 0.85,
  project: 0.8,
  education: 0.5,
};

export interface CandidateChunk {
  id: string;
  candidateId: string;
  chunkType: ChunkType;
  content: string;
  embedding?: number[];    // pgvector
  createdAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Processing Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Progressive Loading: parsing, analyzing 상태 추가
export type ProcessingStatus = 'queued' | 'processing' | 'parsing' | 'analyzing' | 'completed' | 'failed' | 'rejected';
export type ParseMethod = 'direct' | 'libreoffice' | 'hancom_api' | 'failed';

export interface ProcessingJob {
  id: string;
  userId: string;
  candidateId?: string;
  status: ProcessingStatus;
  fileName: string;
  fileType: string;
  fileSize: number;

  // 파싱 결과
  parseMethod?: ParseMethod;
  pageCount?: number;

  // AI 분석 결과
  analysisMode?: 'phase_1' | 'phase_2';
  confidenceScore?: number;

  // 에러 정보
  errorCode?: string;
  errorMessage?: string;

  // 타임스탬프
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feedback Types (검색 품질 개선용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FeedbackType = 'relevant' | 'not_relevant' | 'clicked' | 'contacted';

export interface SearchFeedback {
  id: string;
  userId: string;
  searchQuery: string;
  candidateId: string;
  feedbackType: FeedbackType;
  resultPosition: number;
  relevanceScore: number;
  createdAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI 신뢰도 점수를 레벨로 변환
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 95) return 'high';
  if (score >= 80) return 'medium';
  return 'low';
}

/**
 * 신뢰도 레벨에 따른 리뷰 필요 여부
 */
export function requiresReview(score: number): boolean {
  return score < 95;
}

/**
 * DB row를 CandidateListItem으로 변환
 */
export function toCandidateListItem(row: Record<string, unknown>): CandidateListItem {
  const confidence = (row.confidence_score as number) ?? 0;

  return {
    id: row.id as string,
    name: row.name as string,
    role: (row.last_position as string) ?? '',
    company: (row.last_company as string) ?? '',
    expYears: (row.exp_years as number) ?? 0,
    skills: (row.skills as string[]) ?? [],
    photoUrl: row.photo_url as string | undefined,
    summary: row.summary as string | undefined,
    aiConfidence: Math.round(confidence * 100),
    confidenceLevel: getConfidenceLevel(confidence * 100),
    riskLevel: (row.risk_level as RiskLevel) ?? 'low',
    requiresReview: (row.requires_review as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Progressive Loading Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 빠른 추출 결과 (파싱 완료 직후, AI 분석 전)
 * 정규식 기반으로 추출한 기본 정보
 */
export interface QuickExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

/**
 * 부분 로딩 후보자 (처리 중 상태)
 * 완료되지 않은 후보자를 UI에 표시할 때 사용
 */
export interface CandidatePartial {
  id: string;
  status: CandidateStatus;
  name?: string;
  last_company?: string;
  last_position?: string;
  quick_extracted?: QuickExtractedData;
  created_at: string;
  updated_at?: string;
}

/**
 * DB row를 CandidatePartial로 변환
 */
export function toCandidatePartial(row: Record<string, unknown>): CandidatePartial {
  return {
    id: row.id as string,
    status: (row.status as CandidateStatus) ?? 'processing',
    name: row.name as string | undefined,
    last_company: row.last_company as string | undefined,
    last_position: row.last_position as string | undefined,
    quick_extracted: row.quick_extracted as QuickExtractedData | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string | undefined,
  };
}
