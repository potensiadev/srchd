/**
 * Position Types for RAI
 * 포지션-후보자 매칭 기능
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Position Status & Priority
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PositionStatus = "open" | "paused" | "closed" | "filled";
export type PositionPriority = "urgent" | "high" | "normal" | "low";
export type JobType = "full-time" | "contract" | "freelance" | "internship";

export type MatchStage =
  | "matched"      // 자동 매칭됨
  | "reviewed"     // 검토 완료
  | "contacted"    // 연락함
  | "interviewing" // 인터뷰 중
  | "offered"      // 오퍼 제안
  | "placed"       // 채용 완료
  | "rejected"     // 제외됨
  | "withdrawn";   // 후보자 철회

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Position Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Position {
  id: string;
  userId: string;

  // 기본 정보
  title: string;
  clientCompany?: string;
  department?: string;

  // 상세 설명
  description?: string;
  summary?: string;

  // JD 상세 섹션 (원문 보존)
  responsibilities?: string;          // 주요업무/담당업무 원문
  qualifications?: string;            // 자격요건/필수요건 원문
  preferredQualifications?: string;   // 우대사항/우대요건 원문
  benefits?: string;                  // 복리후생/혜택

  // 필수 요건
  requiredSkills: string[];
  preferredSkills: string[];
  minExpYears: number;
  maxExpYears?: number;

  // 학력 요건
  requiredEducationLevel?: string;
  preferredMajors: string[];

  // 근무 조건
  locationCity?: string;
  jobType: JobType;
  salaryMin?: number;
  salaryMax?: number;

  // 상태 관리
  status: PositionStatus;
  priority: PositionPriority;
  deadline?: string;

  // 메타데이터
  createdAt: string;
  updatedAt: string;

  // 매칭 통계 (조회 시 계산)
  matchCount?: number;
  stageStats?: Record<MatchStage, number>;
}

export interface PositionListItem {
  id: string;
  title: string;
  clientCompany?: string;
  requiredSkills: string[];
  minExpYears: number;
  maxExpYears?: number;
  locationCity?: string;
  status: PositionStatus;
  priority: PositionPriority;
  deadline?: string;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Position Candidate (Matching Result)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 동의어 매칭 정보
export interface SynonymMatch {
  candidate_skill: string;  // 후보자가 가진 스킬 (예: "리액트")
  matched_to: string;       // 매칭된 요구 스킬 (예: "React")
  is_synonym: boolean;      // 동의어 매칭 여부
}

export interface PositionCandidate {
  id: string;
  positionId: string;
  candidateId: string;

  // 매칭 점수 (0-100)
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  semanticScore: number;

  // 매칭 상세
  matchedSkills: string[];
  missingSkills: string[];
  synonymMatches?: SynonymMatch[];  // 동의어 매칭 상세 정보
  matchExplanation?: {
    summary: string;
    highlights: string[];
  };

  // 상태 관리
  stage: MatchStage;
  rejectionReason?: string;
  notes?: string;

  // 타임스탬프
  matchedAt: string;
  stageUpdatedAt: string;

  // 후보자 정보 (조인)
  candidate?: {
    id: string;
    name: string;
    lastPosition?: string;
    lastCompany?: string;
    expYears: number;
    skills: string[];
    photoUrl?: string;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Position Activity Log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ActivityType =
  | "position_created"
  | "position_updated"
  | "matches_refreshed"
  | "stage_changed"
  | "note_added"
  | "candidate_contacted";

export interface PositionActivity {
  id: string;
  positionId: string;
  candidateId?: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Request/Response Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CreatePositionRequest {
  title: string;
  clientCompany?: string;
  department?: string;
  description?: string;
  responsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  benefits?: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  minExpYears: number;
  maxExpYears?: number;
  requiredEducationLevel?: string;
  preferredMajors?: string[];
  locationCity?: string;
  jobType?: JobType;
  salaryMin?: number;
  salaryMax?: number;
  priority?: PositionPriority;
  deadline?: string;
}

export interface UpdatePositionRequest {
  title?: string;
  clientCompany?: string;
  department?: string;
  description?: string;
  responsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  benefits?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  minExpYears?: number;
  maxExpYears?: number;
  requiredEducationLevel?: string;
  preferredMajors?: string[];
  locationCity?: string;
  jobType?: JobType;
  salaryMin?: number;
  salaryMax?: number;
  status?: PositionStatus;
  priority?: PositionPriority;
  deadline?: string;
}

export interface PositionMatchesResponse {
  matches: PositionCandidate[];
  total: number;
  scoreDistribution: {
    excellent: number;  // 80-100
    good: number;       // 60-80
    fair: number;       // 40-60
    low: number;        // 0-40
  };
}

export interface UpdateMatchStageRequest {
  stage: MatchStage;
  notes?: string;
  rejectionReason?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getScoreLevel(score: number): "excellent" | "good" | "fair" | "low" {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "low";
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "emerald";
  if (score >= 60) return "blue";
  if (score >= 40) return "yellow";
  return "gray";
}

export function getPriorityColor(priority: PositionPriority): string {
  switch (priority) {
    case "urgent":
      return "red";
    case "high":
      return "orange";
    case "normal":
      return "blue";
    case "low":
      return "gray";
  }
}

export function getStatusLabel(status: PositionStatus): string {
  switch (status) {
    case "open":
      return "진행중";
    case "paused":
      return "일시중지";
    case "closed":
      return "마감";
    case "filled":
      return "채용완료";
  }
}

export function getStageLabel(stage: MatchStage): string {
  switch (stage) {
    case "matched":
      return "매칭됨";
    case "reviewed":
      return "검토완료";
    case "contacted":
      return "연락함";
    case "interviewing":
      return "인터뷰중";
    case "offered":
      return "오퍼제안";
    case "placed":
      return "채용완료";
    case "rejected":
      return "제외됨";
    case "withdrawn":
      return "철회됨";
  }
}

/**
 * DB row를 Position으로 변환
 */
export function toPosition(row: Record<string, unknown>): Position {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    clientCompany: row.client_company as string | undefined,
    department: row.department as string | undefined,
    description: row.description as string | undefined,
    summary: row.summary as string | undefined,
    responsibilities: row.responsibilities as string | undefined,
    qualifications: row.qualifications as string | undefined,
    preferredQualifications: row.preferred_qualifications as string | undefined,
    benefits: row.benefits as string | undefined,
    requiredSkills: (row.required_skills as string[]) || [],
    preferredSkills: (row.preferred_skills as string[]) || [],
    minExpYears: (row.min_exp_years as number) || 0,
    maxExpYears: row.max_exp_years as number | undefined,
    requiredEducationLevel: row.required_education_level as string | undefined,
    preferredMajors: (row.preferred_majors as string[]) || [],
    locationCity: row.location_city as string | undefined,
    jobType: (row.job_type as JobType) || "full-time",
    salaryMin: row.salary_min as number | undefined,
    salaryMax: row.salary_max as number | undefined,
    status: (row.status as PositionStatus) || "open",
    priority: (row.priority as PositionPriority) || "normal",
    deadline: row.deadline as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * DB row를 PositionListItem으로 변환
 */
export function toPositionListItem(row: Record<string, unknown>): PositionListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    clientCompany: row.client_company as string | undefined,
    requiredSkills: (row.required_skills as string[]) || [],
    minExpYears: (row.min_exp_years as number) || 0,
    maxExpYears: row.max_exp_years as number | undefined,
    locationCity: row.location_city as string | undefined,
    status: (row.status as PositionStatus) || "open",
    priority: (row.priority as PositionPriority) || "normal",
    deadline: row.deadline as string | undefined,
    matchCount: (row.match_count as number) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * DB row를 PositionCandidate로 변환
 */
export function toPositionCandidate(row: Record<string, unknown>): PositionCandidate {
  return {
    id: row.id as string,
    positionId: row.position_id as string,
    candidateId: row.candidate_id as string,
    overallScore: Math.round(((row.overall_score as number) || 0) * 100),
    skillScore: Math.round(((row.skill_score as number) || 0) * 100),
    experienceScore: Math.round(((row.experience_score as number) || 0) * 100),
    educationScore: Math.round(((row.education_score as number) || 0) * 100),
    semanticScore: Math.round(((row.semantic_score as number) || 0) * 100),
    matchedSkills: (row.matched_skills as string[]) || [],
    missingSkills: (row.missing_skills as string[]) || [],
    matchExplanation: row.match_explanation as PositionCandidate["matchExplanation"],
    stage: (row.stage as MatchStage) || "matched",
    rejectionReason: row.rejection_reason as string | undefined,
    notes: row.notes as string | undefined,
    matchedAt: row.matched_at as string,
    stageUpdatedAt: row.stage_updated_at as string,
    candidate: row.candidate_name
      ? {
          id: row.candidate_id as string,
          name: row.candidate_name as string,
          lastPosition: row.candidate_last_position as string | undefined,
          lastCompany: row.candidate_last_company as string | undefined,
          expYears: (row.candidate_exp_years as number) || 0,
          skills: (row.candidate_skills as string[]) || [],
          photoUrl: row.candidate_photo_url as string | undefined,
        }
      : undefined,
  };
}
