/**
 * Candidates 관련 타입 정의
 */

import type { CandidateStatus } from "@/types";

export interface Career {
  company?: string;
  position?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  is_current?: boolean;
  isCurrent?: boolean;
}

export interface ExperienceDuration {
  years: number;
  months: number;
  totalMonths: number;
}

export interface QuickExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

export interface Candidate {
  id: string;
  name: string;
  last_position: string | null;
  last_company: string | null;
  exp_years: number;
  skills: string[];
  confidence_score: number;
  created_at: string;
  summary: string | null;
  careers: Career[] | null;
  status?: CandidateStatus;
  quick_extracted?: QuickExtractedData;
  hasBeenMatched?: boolean;
  errorMessage?: string;
}

export type SortBy = "recent" | "confidence" | "exp";

export interface CandidatesStats {
  total: number;
  needsReview: number;
  recentWeek: number;
  processing: number;
  failed: number;
}
