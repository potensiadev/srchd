/**
 * Auth Types for RAI v6.0
 * 사용자 인증 및 동의 관련 타입 정의
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plan Types (PRD v6.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PlanType = 'starter' | 'pro';
export type AnalysisMode = 'phase_1' | 'phase_2';

export interface Plan {
  name: string;
  price: number;
  baseCredits: number;
  overageCost: number | null;
  blindExportLimit: number;
  crossCheckMode: AnalysisMode;
}

/**
 * PRD v6.0 요금제 상수
 */
export const PLANS: Record<PlanType, Plan> = {
  starter: {
    name: "Starter (실속형)",
    price: 79000,
    baseCredits: 50,
    overageCost: 1500,
    blindExportLimit: 30,
    crossCheckMode: "phase_1",
  },
  pro: {
    name: "Pro (비즈니스형)",
    price: 149000,
    baseCredits: 150,
    overageCost: 1000,
    blindExportLimit: Infinity,
    crossCheckMode: "phase_2", // 3-Way Cross-Check (GPT + Gemini + Claude)
  },
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;

  // 플랜 & 크레딧
  plan: PlanType;
  credits: number;
  creditsUsedThisMonth: number;

  // 7일 무료 체험
  trialEndsAt?: string;
  isTrialActive?: boolean;
  trialDaysRemaining?: number;

  // 동의 상태
  consentsCompleted: boolean;
  consentsCompletedAt?: string;

  // 메타
  createdAt: string;
  updatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Consent Types (제3자 정보 보증 포함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ConsentVersions {
  terms: string;
  privacy: string;
  thirdParty: string;
}

/**
 * 현재 약관 버전
 */
export const CONSENT_VERSIONS: ConsentVersions = {
  terms: "2025.01.01",
  privacy: "2025.01.01",
  thirdParty: "2025.01.01",
};

export interface UserConsent {
  id: string;
  userId: string;

  // 이용약관
  termsOfService: boolean;
  termsOfServiceVersion?: string;
  termsOfServiceAgreedAt?: string;

  // 개인정보처리방침
  privacyPolicy: boolean;
  privacyPolicyVersion?: string;
  privacyPolicyAgreedAt?: string;

  // 제3자 정보 보증 (핵심)
  thirdPartyDataGuarantee: boolean;
  thirdPartyDataGuaranteeVersion?: string;
  thirdPartyDataGuaranteeAgreedAt?: string;

  // 마케팅 (선택)
  marketingConsent: boolean;
  marketingConsentAgreedAt?: string;

  // 메타
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 동의 폼 상태 (클라이언트용)
 */
export interface ConsentState {
  terms: boolean;
  privacy: boolean;
  thirdParty: boolean;
  marketing: boolean;
}

/**
 * 모든 필수 동의가 완료되었는지 확인
 */
export function isAllRequiredConsentsCompleted(state: ConsentState): boolean {
  return state.terms && state.privacy && state.thirdParty;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Credit Transaction Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TransactionType =
  | 'subscription'    // 월 구독 크레딧
  | 'usage'           // 파일 처리 사용
  | 'overage'         // 초과 사용
  | 'refund'          // 환불
  | 'adjustment';     // 관리자 조정

export interface CreditTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;          // 양수: 충전, 음수: 사용
  balanceAfter: number;
  description: string;

  // 참조
  candidateId?: string;    // usage 타입인 경우
  paymentId?: string;      // 결제 관련인 경우

  createdAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AuthSession {
  user: {
    id: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
  };
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 플랜별 남은 크레딧 계산
 */
export function getRemainingCredits(user: UserProfile): number {
  const plan = PLANS[user.plan];
  return Math.max(0, plan.baseCredits - user.creditsUsedThisMonth);
}

/**
 * 크레딧 부족 여부 확인
 */
export function hasInsufficientCredits(user: UserProfile): boolean {
  return getRemainingCredits(user) <= 0 && user.credits <= 0;
}

/**
 * 무료 체험 기간 상수
 */
export const FREE_TRIAL_DAYS = 7;

/**
 * 무료 체험 활성 여부 확인
 */
export function isTrialActive(user: UserProfile): boolean {
  if (!user.trialEndsAt) return false;
  return new Date(user.trialEndsAt) > new Date();
}

/**
 * 남은 체험 일수 계산
 */
export function getTrialDaysRemaining(user: UserProfile): number {
  if (!user.trialEndsAt) return 0;
  const trialEnds = new Date(user.trialEndsAt);
  const now = new Date();
  if (trialEnds <= now) return 0;
  return Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 서비스 사용 가능 여부 (체험 중이거나 유료 구독)
 */
export function canUseService(user: UserProfile): boolean {
  // 체험 중이면 사용 가능
  if (isTrialActive(user)) return true;
  // 크레딧 남아있으면 사용 가능 (유료 사용자)
  return getRemainingCredits(user) > 0 || user.credits > 0;
}

/**
 * DB row를 UserProfile로 변환
 */
export function toUserProfile(row: Record<string, unknown>): UserProfile {
  const trialEndsAt = row.trial_ends_at as string | undefined;
  const trialEnds = trialEndsAt ? new Date(trialEndsAt) : null;
  const now = new Date();

  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string | undefined,
    avatarUrl: row.avatar_url as string | undefined,
    plan: (row.plan as PlanType) ?? 'starter',
    credits: (row.credits as number) ?? 0,
    creditsUsedThisMonth: (row.credits_used_this_month as number) ?? 0,
    trialEndsAt: trialEndsAt,
    isTrialActive: trialEnds ? trialEnds > now : false,
    trialDaysRemaining: trialEnds && trialEnds > now
      ? Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    consentsCompleted: (row.consents_completed as boolean) ?? false,
    consentsCompletedAt: row.consents_completed_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
