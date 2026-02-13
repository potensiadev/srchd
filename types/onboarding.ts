/**
 * 온보딩 관련 타입 정의
 * PRD v0.1 Section 14: 온보딩 플로우
 */

/**
 * 온보딩 단계 (0~6)
 * 0: 미시작
 * 1: 환영 + 서비스 소개
 * 2: 첫 업로드 가이드
 * 3: 검색 체험 가이드
 * 4: 검토 UI 가이드
 * 5: 블라인드 내보내기 가이드
 * 6: 완료
 */
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ONBOARDING_STEPS = {
  NOT_STARTED: 0,
  WELCOME: 1,
  UPLOAD_GUIDE: 2,
  SEARCH_GUIDE: 3,
  REVIEW_GUIDE: 4,
  EXPORT_GUIDE: 5,
  COMPLETED: 6,
} as const;

export interface OnboardingStepInfo {
  step: OnboardingStep;
  title: string;
  description: string;
  icon: string;
  skippable: boolean;
}

export const ONBOARDING_STEP_INFO: OnboardingStepInfo[] = [
  {
    step: 1,
    title: "서치드에 오신 것을 환영합니다!",
    description: "AI가 이력서를 자동으로 분석해 검색 가능한 인재 DB로 전환합니다.",
    icon: "👋",
    skippable: true,
  },
  {
    step: 2,
    title: "첫 이력서를 올려볼까요?",
    description: "HWP, PDF, DOCX 모두 지원합니다. 여러 파일을 한 번에 올릴 수 있어요.",
    icon: "📥",
    skippable: true,
  },
  {
    step: 3,
    title: "이제 검색해볼까요?",
    description: "짧은 키워드(스킬, 회사명)도, 긴 문장도 검색됩니다.",
    icon: "🔍",
    skippable: true,
  },
  {
    step: 4,
    title: "AI 분석 결과를 확인하세요",
    description: "노란색은 AI가 확신하지 못하는 항목입니다. 클릭해서 수정하세요.",
    icon: "✏️",
    skippable: true,
  },
  {
    step: 5,
    title: "블라인드 이력서 다운로드",
    description: "개인정보가 제거된 블라인드 이력서를 한 클릭으로 생성합니다.",
    icon: "📋",
    skippable: true,
  },
];

export interface OnboardingState {
  completed: boolean;
  currentStep: OnboardingStep;
  isLoading: boolean;
  error: string | null;
}

export interface OnboardingActions {
  nextStep: () => Promise<void>;
  skipStep: () => Promise<void>;
  skipAll: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}
