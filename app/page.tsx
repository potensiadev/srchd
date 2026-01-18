"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Sparkles,
  Shield,
  Zap,
  Search,
  ArrowRight,
  Upload,
  FileText,
  Users,
  CheckCircle,
  Menu,
  X,
  Clock,
  TrendingUp,
  Target,
  Play,
  ChevronRight,
  Quote,
  Star,
  AlertTriangle,
  Loader2,
  FolderOpen,
  FileSearch,
  Brain,
  DollarSign,
  Calendar,
} from "lucide-react";

// ============================================
// DATA & CONSTANTS
// ============================================

const navLinks = [
  { href: "/products", label: "기능" },
  { href: "/pricing", label: "요금" },
  { href: "/support", label: "지원" },
];

// Demo 1: 이력서 분석 결과 데이터
const demoResumeResult = {
  name: "박지현",
  currentRole: "Product Manager",
  currentCompany: "쿠팡",
  totalExperience: "8년 2개월",
  education: "서울대학교 경영학과 학사",
  skills: ["Product Strategy", "Data Analysis", "A/B Testing", "SQL", "Figma"],
  experiences: [
    { company: "쿠팡", role: "Senior PM", duration: "3년" },
    { company: "네이버", role: "PM", duration: "2년" },
    { company: "패스트캠퍼스", role: "기획자", duration: "3년" },
  ],
  highlights: ["MAU 200만 서비스 담당", "전환율 40% 개선", "팀 빌딩 5명"],
  confidence: 96,
};

// Demo 2: JD 매칭 결과 데이터
const sampleJD = `[MLOps Engineer 채용]

담당 업무:
- ML 모델 배포 및 운영 파이프라인 구축
- Feature Store 설계 및 운영
- 모델 모니터링 및 재학습 자동화

자격 요건:
- 경력 5년 이상
- Kubernetes 운영 경험 3년 이상
- Python 능숙
- ML Pipeline (Kubeflow, Airflow 등) 경험

우대 사항:
- Feature Store (Feast, Tecton) 경험
- AWS/GCP 기반 ML 인프라 경험`;

const jdParsedResult = {
  required: ["Kubernetes 3년+", "Python", "ML Pipeline"],
  preferred: ["Kubeflow", "Airflow", "Feature Store"],
  experience: "5-10년",
  aiNote: '"Feature Store"는 ML 피처 관리 시스템입니다. Feast, Tecton 경험자를 우선 매칭합니다.',
};

const jdMatchedCandidates = [
  {
    name: "김현우",
    currentRole: "MLOps Engineer @ 카카오",
    experience: "7년",
    matchedSkills: ["Kubernetes", "Kubeflow", "Python"],
    matchScore: 97,
  },
  {
    name: "이서준",
    currentRole: "ML Engineer @ 네이버",
    experience: "6년",
    matchedSkills: ["Kubernetes", "Airflow", "Python"],
    matchScore: 94,
  },
  {
    name: "박민지",
    currentRole: "DevOps Engineer @ 라인",
    experience: "5년",
    matchedSkills: ["Kubernetes", "Python", "CI/CD"],
    matchScore: 89,
  },
];

// Demo 3: 검색 결과 데이터
const searchExamples = [
  "경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘",
  "네카라쿠배 출신 프론트엔드 개발자 5년 이상",
  "스타트업 CFO 경험 있는 회계사",
  "영어 능통 해외영업 경력 7년",
];

const searchResults: Record<string, {
  interpretation: { experience?: string; companyType?: string; jobFunction?: string };
  candidates: Array<{
    name: string;
    currentRole: string;
    experience: string;
    highlights: string[];
    matchScore: number;
  }>;
}> = {
  "경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘": {
    interpretation: {
      experience: "10년 이상",
      companyType: "컨설팅펌 (맥킨지, BCG, 베인 등)",
      jobFunction: "전략기획",
    },
    candidates: [
      {
        name: "정승현",
        currentRole: "전략기획 이사 @ 삼성전자",
        experience: "12년",
        highlights: ["맥킨지 5년", "전략기획", "M&A"],
        matchScore: 98,
      },
      {
        name: "한지원",
        currentRole: "CSO @ 토스",
        experience: "11년",
        highlights: ["BCG 4년", "신사업 기획", "BizDev"],
        matchScore: 95,
      },
      {
        name: "최민수",
        currentRole: "사업전략팀장 @ 현대자동차",
        experience: "10년",
        highlights: ["베인 3년", "사업전략", "해외 M&A"],
        matchScore: 92,
      },
      {
        name: "이수연",
        currentRole: "전략컨설턴트 @ 딜로이트",
        experience: "10년",
        highlights: ["딜로이트 6년", "전략 컨설팅"],
        matchScore: 89,
      },
    ],
  },
  "네카라쿠배 출신 프론트엔드 개발자 5년 이상": {
    interpretation: {
      experience: "5년 이상",
      companyType: "네이버, 카카오, 라인, 쿠팡, 배민",
      jobFunction: "프론트엔드 개발",
    },
    candidates: [
      {
        name: "김태영",
        currentRole: "Frontend Lead @ 당근",
        experience: "7년",
        highlights: ["네이버 3년", "React", "TypeScript"],
        matchScore: 96,
      },
      {
        name: "박서연",
        currentRole: "Senior FE @ 토스",
        experience: "6년",
        highlights: ["카카오 4년", "Vue.js", "성능최적화"],
        matchScore: 93,
      },
      {
        name: "이준호",
        currentRole: "FE Developer @ 직방",
        experience: "5년",
        highlights: ["배민 3년", "React Native", "Next.js"],
        matchScore: 90,
      },
    ],
  },
};

// Testimonials 데이터 - 결과 중심
const testimonials = [
  {
    quote: "솔직히 JD 오면 한숨부터 나왔어요. 기술 용어 검색하고, 이력서 뒤지고... 하루가 끝나있더라고요. 지금은 클라이언트한테 '오늘 중으로 보내드릴게요'라고 말해요. 진짜로요.",
    metric: "같은 날 후보 제안",
    author: "김소연",
    role: "시니어 파트너 · 12년차",
    company: "IT/테크 전문",
    avatarBg: "from-violet-500 to-purple-600",
    avatarUrl: null,
  },
  {
    quote: "PC에 이력서가 5,000개 넘어요. 근데 막상 찾으려면 기억도 안 나고, 폴더도 엉망이고. 그 후보들이 다 돈인데 썩히고 있었던 거죠. 이제는 '3년 전 그 후보'도 10초면 찾아요.",
    metric: "5,000개 이력서 자산화",
    author: "박준혁",
    role: "헤드헌터 · 8년차",
    company: "반도체/제조",
    avatarBg: "from-blue-500 to-cyan-600",
    avatarUrl: null,
  },
  {
    quote: "경쟁사보다 하루 늦게 제안하면 끝이에요. 그 하루 때문에 성사 직전에 뺏긴 적이 한두 번이 아니에요. 지금은 JD 받고 1시간 안에 제안해요. 클라이언트가 '벌써요?' 그래요.",
    metric: "경쟁사보다 하루 빠르게",
    author: "이민지",
    role: "팀장 · 10년차",
    company: "금융/핀테크",
    avatarBg: "from-emerald-500 to-teal-600",
    avatarUrl: null,
  },
];

// Pricing 데이터
const pricingTiers = [
  {
    name: "Starter",
    price: "79,000",
    period: "월",
    description: "서치드를 시작하세요",
    features: ["월 50건 이력서 분석", "2-Way AI Cross-Check", "기본 검색", "블라인드 내보내기 (월 30회)", "이메일 지원"],
    cta: "시작하기",
    popular: false,
  },
  {
    name: "Pro",
    price: "149,000",
    period: "월",
    description: "바쁜 헤드헌터를 위한 플랜",
    features: ["월 150건 이력서 분석", "3-Way AI Cross-Check", "동의어 검색", "버전 관리", "무제한 블라인드 내보내기", "우선 지원"],
    cta: "14일 무료 체험",
    popular: true,
  },
];

// Company logos
const companyLogos = ["Executive Search Korea", "Tech Talent", "HR Partners", "Recruit Pro", "Talent Bridge"];

// ============================================
// ANIMATION HELPERS (Accessibility)
// ============================================

const getAnimationProps = (prefersReducedMotion: boolean) => ({
  fadeInUp: {
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.6 },
  },
  fadeIn: {
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0 },
    animate: { opacity: 1 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.8 },
  },
  scaleIn: {
    initial: prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.6 },
  },
  slideInLeft: {
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.6 },
  },
  slideInRight: {
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.6 },
  },
});

// ============================================
// MAIN COMPONENT
// ============================================

// Exit popup localStorage key and cooldown duration
const EXIT_POPUP_STORAGE_KEY = "exitPopupDismissedAt";
const EXIT_POPUP_COOLDOWN_DAYS = 7;

function LandingPageContent() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [exitPopupShown, setExitPopupShown] = useState(false);
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Demo Section Refs
  const demo1Ref = useRef<HTMLDivElement>(null);
  const demo2Ref = useRef<HTMLDivElement>(null);
  const demo3Ref = useRef<HTMLDivElement>(null);

  // Demo 1 State
  const [demo1Step, setDemo1Step] = useState<"idle" | "uploading" | "analyzing" | "complete">("idle");
  const [demo1Progress, setDemo1Progress] = useState(0);
  const demo1TimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const demo1IntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Demo 2 State
  const [demo2Step, setDemo2Step] = useState<"idle" | "input" | "analyzing" | "matching" | "complete">("idle");
  const [demo2JD, setDemo2JD] = useState("");
  const demo2TimeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const [demo2MobileSlide, setDemo2MobileSlide] = useState(0);
  const demo2CarouselRef = useRef<HTMLDivElement>(null);

  // Demo 3 State
  const [demo3Query, setDemo3Query] = useState("");
  const [demo3Searching, setDemo3Searching] = useState(false);
  const [demo3Results, setDemo3Results] = useState<typeof searchResults[string] | null>(null);
  const [demo3IsTyping, setDemo3IsTyping] = useState(false);
  const demo3IntervalRef = useRef<NodeJS.Timeout | null>(null);
  const demo3TimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);

    // Check if user is logged in
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };
    checkAuth();

    // Check localStorage for exit popup cooldown
    const dismissedAt = localStorage.getItem(EXIT_POPUP_STORAGE_KEY);
    if (dismissedAt) {
      const dismissedDate = new Date(parseInt(dismissedAt));
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < EXIT_POPUP_COOLDOWN_DAYS) {
        setExitPopupShown(true); // Prevent showing during cooldown
      }
    }
  }, []);

  // Detect logout param and show message
  useEffect(() => {
    if (searchParams.get("logged_out") === "true") {
      setShowLogoutMessage(true);
      // Clean up URL without refreshing the page
      router.replace("/", { scroll: false });
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowLogoutMessage(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  // Detect prefers-reduced-motion for accessibility
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Exit intent detection (desktop only, non-logged-in users only)
  useEffect(() => {
    // Don't show popup if: not mounted, already shown, or user is logged in
    if (!mounted || exitPopupShown || isLoggedIn) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger when mouse leaves from the top of the viewport
      if (e.clientY <= 0 && !exitPopupShown && !isLoggedIn) {
        // Check if on desktop (not mobile)
        if (window.innerWidth >= 768) {
          setShowExitPopup(true);
          setExitPopupShown(true);
        }
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [mounted, exitPopupShown, isLoggedIn]);

  // Demo 3 typing animation text
  const demo3TypingText = "경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘";

  // Reset Demo 1
  const resetDemo1 = useCallback(() => {
    if (demo1TimeoutRef.current) clearTimeout(demo1TimeoutRef.current);
    if (demo1IntervalRef.current) clearInterval(demo1IntervalRef.current);
    setDemo1Step("idle");
    setDemo1Progress(0);
  }, []);

  // Reset Demo 2
  const resetDemo2 = useCallback(() => {
    demo2TimeoutRefs.current.forEach(t => clearTimeout(t));
    demo2TimeoutRefs.current = [];
    setDemo2Step("idle");
    setDemo2JD("");
    setDemo2MobileSlide(0);
  }, []);

  // Handle Demo 2 carousel scroll
  const handleDemo2Scroll = useCallback(() => {
    if (!demo2CarouselRef.current) return;
    const scrollLeft = demo2CarouselRef.current.scrollLeft;
    const slideWidth = demo2CarouselRef.current.offsetWidth;
    const newSlide = Math.round(scrollLeft / slideWidth);
    setDemo2MobileSlide(newSlide);
  }, []);

  // Scroll to specific slide on mobile
  const scrollToDemo2Slide = useCallback((index: number) => {
    if (!demo2CarouselRef.current) return;
    const slideWidth = demo2CarouselRef.current.offsetWidth;
    demo2CarouselRef.current.scrollTo({
      left: slideWidth * index,
      behavior: "smooth",
    });
  }, []);

  // Reset Demo 3
  const resetDemo3 = useCallback(() => {
    if (demo3IntervalRef.current) clearInterval(demo3IntervalRef.current);
    if (demo3TimeoutRef.current) clearTimeout(demo3TimeoutRef.current);
    setDemo3Query("");
    setDemo3Searching(false);
    setDemo3Results(null);
    setDemo3IsTyping(false);
  }, []);

  // Demo 1 Animation
  const runDemo1 = useCallback(() => {
    setDemo1Step("uploading");
    setDemo1Progress(0);

    demo1TimeoutRef.current = setTimeout(() => {
      setDemo1Step("analyzing");
      demo1IntervalRef.current = setInterval(() => {
        setDemo1Progress((prev) => {
          if (prev >= 100) {
            if (demo1IntervalRef.current) clearInterval(demo1IntervalRef.current);
            setDemo1Step("complete");
            return 100;
          }
          return prev + 4;
        });
      }, 100);
    }, 800);
  }, []);

  // Demo 2 Animation (30% faster)
  const runDemo2 = useCallback(() => {
    setDemo2JD(sampleJD);
    setDemo2Step("input");
    scrollToDemo2Slide(0); // Start at step 1

    const t1 = setTimeout(() => {
      setDemo2Step("analyzing");
      scrollToDemo2Slide(1); // Move to step 2
      const t2 = setTimeout(() => {
        setDemo2Step("matching");
        scrollToDemo2Slide(2); // Move to step 3
        const t3 = setTimeout(() => {
          setDemo2Step("complete");
        }, 1050); // 1500 * 0.7 = 1050
        demo2TimeoutRefs.current.push(t3);
      }, 1400); // 2000 * 0.7 = 1400
      demo2TimeoutRefs.current.push(t2);
    }, 700); // 1000 * 0.7 = 700
    demo2TimeoutRefs.current.push(t1);
  }, [scrollToDemo2Slide]);

  // Typing animation for Demo 3 (respects reduced motion)
  const runDemo3WithTyping = useCallback(() => {
    resetDemo3();

    // If user prefers reduced motion, skip typing animation
    if (prefersReducedMotion) {
      setDemo3Query(demo3TypingText);
      setDemo3Searching(true);
      demo3TimeoutRef.current = setTimeout(() => {
        setDemo3Searching(false);
        setDemo3Results(searchResults[demo3TypingText]);
      }, 300);
      return;
    }

    // Small delay before starting
    demo3TimeoutRef.current = setTimeout(() => {
      setDemo3IsTyping(true);

      let index = 0;
      demo3IntervalRef.current = setInterval(() => {
        if (index < demo3TypingText.length) {
          setDemo3Query(demo3TypingText.slice(0, index + 1));
          index++;
        } else {
          if (demo3IntervalRef.current) clearInterval(demo3IntervalRef.current);
          setDemo3IsTyping(false);
          // Start search after typing completes
          setDemo3Searching(true);
          demo3TimeoutRef.current = setTimeout(() => {
            setDemo3Searching(false);
            setDemo3Results(searchResults[demo3TypingText]);
          }, 800);
        }
      }, 50); // 50ms per character for natural typing feel
    }, 300);
  }, [resetDemo3, prefersReducedMotion]);

  // Consolidated Intersection Observer for all demos (Performance optimization)
  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target;

          // Demo 1
          if (target === demo1Ref.current) {
            if (entry.isIntersecting) {
              resetDemo1();
              demo1TimeoutRef.current = setTimeout(() => {
                runDemo1();
              }, 500);
            } else {
              resetDemo1();
            }
          }

          // Demo 2
          if (target === demo2Ref.current) {
            if (entry.isIntersecting) {
              resetDemo2();
              const t = setTimeout(() => {
                runDemo2();
              }, 500);
              demo2TimeoutRefs.current.push(t);
            } else {
              resetDemo2();
            }
          }

          // Demo 3
          if (target === demo3Ref.current) {
            if (entry.isIntersecting) {
              runDemo3WithTyping();
            } else {
              resetDemo3();
            }
          }
        });
      },
      { threshold: 0.4 }
    );

    // Observe all demo refs
    if (demo1Ref.current) observer.observe(demo1Ref.current);
    if (demo2Ref.current) observer.observe(demo2Ref.current);
    if (demo3Ref.current) observer.observe(demo3Ref.current);

    return () => {
      observer.disconnect();
      resetDemo1();
      resetDemo2();
      resetDemo3();
    };
  }, [mounted, resetDemo1, runDemo1, resetDemo2, runDemo2, runDemo3WithTyping, resetDemo3]);

  // Demo 3 Search
  const runDemo3Search = (query: string) => {
    setDemo3Query(query);
    setDemo3Searching(true);
    setDemo3Results(null);

    setTimeout(() => {
      setDemo3Searching(false);
      // Find matching result or use first example
      const result = searchResults[query] || searchResults[searchExamples[0]];
      setDemo3Results(result);
    }, 800);
  };

  // Signup Handler - directly navigate to signup
  const handleSignupClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = "/signup";
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-hidden">
      {/* Skip to main content link for keyboard navigation (Accessibility) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:font-medium focus:shadow-lg"
      >
        본문으로 건너뛰기
      </a>

      {/* ============================================
          NAVIGATION
      ============================================ */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50" role="navigation" aria-label="메인 네비게이션">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="text-xl font-bold">서치드</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">
              로그인
            </Link>
            <button
              onClick={handleSignupClick}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-sm text-white font-medium transition-all shadow-sm"
            >
              무료로 시작하기
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors"
            aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-gray-100 bg-white" role="menu">
            <div className="px-6 py-4 space-y-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-base font-medium text-gray-600 hover:text-primary transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-base font-medium text-gray-600"
                >
                  로그인
                </Link>
                <button
                  onClick={(e) => {
                    setMobileMenuOpen(false);
                    handleSignupClick(e);
                  }}
                  className="block w-full py-3 px-4 rounded-lg bg-primary text-white text-center font-medium"
                >
                  무료로 시작하기
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Logout Success Message */}
      <AnimatePresence>
        {showLogoutMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-white border border-gray-200 shadow-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">로그아웃 되었습니다</p>
                <p className="text-xs text-gray-500">서치드에서 안전하게 로그아웃 되었습니다</p>
              </div>
              <button
                onClick={() => setShowLogoutMessage(false)}
                className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main-content" className="flex-1" role="main">
        {/* ============================================
            SECTION 1: HERO
        ============================================ */}
        <section className="relative px-6 md:px-8 py-16 md:py-24 max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">

            {/* Main Headline - 고통을 정확히 찌르는 */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-[1.1] tracking-tight"
            >
              이력서 3,000개가
              <br />
              <span className="text-primary">돈이 되고 있나요?</span>
            </motion.h1>

            {/* Pain Point - 구체적인 상황 묘사 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-4 leading-relaxed"
            >
              <p className="text-gray-500 mb-2">
                분명 작년에 딱 맞는 후보 봤는데... 어느 폴더였지?
                <br className="hidden md:block" />
                결국 못 찾아서 처음부터 소싱. <span className="text-red-500 font-medium">그 시간에 경쟁사는 벌써 제안 완료.</span>
              </p>
            </motion.div>

            {/* Solution - 결과 중심 */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-lg md:text-xl text-gray-900 max-w-2xl mx-auto mb-10"
            >
              <strong>쌓아둔 이력서가 검색되는 순간,</strong>
              <br className="hidden md:block" />
              헤드헌터의 하루가 완전히 달라집니다.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={handleSignupClick}
                className="group flex items-center gap-0 px-8 py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                무료로 시작하기
                <ArrowRight className="w-15 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
              {/* <button
                onClick={() => document.getElementById("demo-section")?.scrollIntoView({ behavior: "smooth" })}
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold text-lg transition-all"
              >
                <Play className="w-5 h-5" />
                데모 보기
              </button> */}
            </motion.div>

            {/* Hero Stats - 결과 중심 수치 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="grid grid-cols-3 gap-4 md:gap-8 mt-16 pt-12 border-t border-gray-200"
            >
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">6시간</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">매일 버리는 시간</p>
                <p className="text-xs text-gray-400 hidden md:block">검색 · 정리 · 블라인드 처리</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">40%</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">행정업무 비율</p>
                <p className="text-xs text-gray-400 hidden md:block">영업할 시간이 없다</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">90%</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">죽어있는 이력서</p>
                <p className="text-xs text-gray-400 hidden md:block">PC에서 썩는 중</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================
            SECTION 2: PAIN POINT - 진짜 아픈 곳을 찌른다
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="text-primary font-medium mb-2">솔직히 말해볼게요</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              이력서는 쌓이는데,<br className="md:hidden" /> 왜 일은 안 줄어들까요?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Pain 1 - 죽은 자산 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-red-50 border border-red-100 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">💀</div>
              <h4 className="font-bold text-gray-900 mb-2">PC에서 썩는 이력서</h4>
              <p className="text-gray-600 text-sm mb-3">
                5년간 모은 이력서 3,000개.<br />
                바로 찾을 수 있는 건 몇 개?
              </p>
              <p className="text-gray-500 text-sm mb-4">
                폴더 정리 안 되고, 검색 안 되고, 결국 <strong className="text-red-600">처음부터 소싱</strong>.
                그 이력서들 다 돈인데.
              </p>
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                <DollarSign className="w-4 h-4" />
                <span>매달 수백만원 기회비용</span>
              </div>
            </motion.div>

            {/* Pain 2 - 시간 낭비 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-orange-50 border border-orange-100 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">⏰</div>
              <h4 className="font-bold text-gray-900 mb-2">하루의 40%가 행정업무</h4>
              <p className="text-gray-600 text-sm mb-3">
                이력서 정리, 블라인드 처리,<br />
                JD 분석, 폴더 검색...
              </p>
              <p className="text-gray-500 text-sm mb-4">
                <strong className="text-orange-600">클라이언트 만날 시간이 없어요.</strong><br />
                영업이 줄면 매출이 줄고, 악순환.
              </p>
              <div className="flex items-center gap-2 text-orange-600 text-sm font-medium">
                <Clock className="w-4 h-4" />
                <span>하루 6시간 낭비</span>
              </div>
            </motion.div>

            {/* Pain 3 - 경쟁 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-gray-100 border border-gray-200 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">🏃</div>
              <h4 className="font-bold text-gray-900 mb-2">경쟁사는 이미 제안 완료</h4>
              <p className="text-gray-600 text-sm mb-3">
                "내일 보내드릴게요" 했는데,<br />
                클라이언트가 이미 면접 잡았대요.
              </p>
              <p className="text-gray-500 text-sm mb-4">
                <strong className="text-gray-700">하루 늦으면 끝.</strong><br />
                성사 직전에 뺏긴 경험, 한두 번이 아니잖아요.
              </p>
              <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>성사율 하락</span>
              </div>
            </motion.div>
          </div>

          {/* Solution Teaser - 결과 약속 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-2xl px-8 py-6">
              <p className="text-gray-600 text-sm mb-2">서치드를 쓰면</p>
              <p className="text-emerald-800 text-xl md:text-2xl font-bold mb-2">
                JD 받고 5분 후, 후보 3명 제안.
              </p>
              <p className="text-emerald-600 text-sm">
                경쟁사보다 <strong>하루 빠르게</strong>. 그 차이가 성사를 만듭니다.
              </p>
            </div>
          </motion.div>
        </section>


        {/* ============================================
            SECTION 3: SOCIAL PROOF
        ============================================ */}
        <section className="bg-gray-50 px-6 md:px-8 py-10 border-y border-gray-200">
          <div className="max-w-7xl mx-auto">
            <p className="text-center text-sm text-gray-500 mb-6 font-medium">이 고민, 당신만의 문제가 아닙니다</p>
            <div className="flex items-center justify-center gap-6 md:gap-12 flex-wrap opacity-50">
              {companyLogos.map((logo) => (
                <div key={logo} className="text-gray-400 font-semibold text-sm md:text-base">
                  {logo}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================
            SECTION 4: DEMO - 이력서 분석 (Seamless Embedded)
        ============================================ */}
        <section id="demo-section" className="py-20">
          <div className="max-w-7xl mx-auto px-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">이력서 읽느라 하루가 끝났나요?</h2>
              <p className="text-lg text-gray-600">30페이지 이력서도 30초면 핵심만 정리</p>
            </motion.div>
          </div>

          {/* Full-width seamless demo */}
          <motion.div
            ref={demo1Ref}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            role="region"
            aria-label="이력서 분석 데모"
          >
            <img
              src="/demo-resume-analysis.gif"
              alt="서치드 이력서 분석 데모"
              className="w-full h-auto"
              loading="lazy"
            />
          </motion.div>

          <div className="max-w-7xl mx-auto px-6 md:px-8">
            {/* Feature highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="grid grid-cols-3 gap-6 mt-12"
            >
              {[
                { label: "분석 시간", value: "30초", desc: "30페이지 이력서 기준" },
                { label: "추출 정확도", value: "94%", desc: "AI 교차 검증" },
                { label: "지원 형식", value: "5종", desc: "PDF, HWP, DOCX 등" },
              ].map((stat, i) => (
                <div key={i} className="text-center py-6">
                  <p className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</p>
                  <p className="text-base font-semibold text-gray-900 mt-2">{stat.label}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.desc}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================
            SECTION 5: 이력서 자산화
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              5년간 모은 이력서,
              <br />
              <span className="text-primary">검색 가능한 자산</span>이 됩니다
            </h2>
            <p className="text-gray-600">더 이상 폴더를 뒤지지 마세요</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Before */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-red-50 border border-red-100 rounded-2xl p-6"
            >
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-red-500" />
                지금 당신의 현실
              </h4>
              <div className="bg-white rounded-xl p-4 font-mono text-sm text-gray-600 mb-4">
                <div>📁 이력서_2024</div>
                <div className="ml-4">📁 개발자</div>
                <div className="ml-8">📁 주니어</div>
                <div className="ml-8">📁 시니어</div>
                <div className="ml-4">📁 기획자</div>
                <div className="ml-4">📁 디자이너</div>
                <div>📁 이력서_2023</div>
                <div className="ml-4 text-gray-400">📁 ...</div>
                <div>📁 이력서_2022</div>
                <div className="text-gray-400">+ 2019, 2020, 2021...</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-red-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-700">3,000+</p>
                  <p className="text-xs text-red-600">잠자는 이력서</p>
                </div>
                <div className="bg-red-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-700">~3시간</p>
                  <p className="text-xs text-red-600">후보자 찾는 시간</p>
                </div>
                <div className="bg-red-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-red-700">50%</p>
                  <p className="text-xs text-red-600">못 찾는 후보</p>
                </div>
              </div>
            </motion.div>

            {/* After */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6"
            >
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-500" />
                서치드와 함께
              </h4>
              <div className="bg-white rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-3 mb-3">
                  <Search className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">쿠팡 출신 PM 5년차 이상</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "박지현", detail: "PM 8년 | 쿠팡, 네이버", match: 98 },
                    { name: "이준호", detail: "PM 6년 | 쿠팡, 배민", match: 94 },
                    { name: "김서연", detail: "PM 5년 | 쿠팡", match: 91 },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                        {c.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.detail}</p>
                      </div>
                      <span className="text-xs font-medium text-emerald-600">{c.match}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-700">3,000+</p>
                  <p className="text-xs text-emerald-600">검색 가능 자산</p>
                </div>
                <div className="bg-emerald-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-700">3초</p>
                  <p className="text-xs text-emerald-600">후보자 찾는 시간</p>
                </div>
                <div className="bg-emerald-100 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-700">100%</p>
                  <p className="text-xs text-emerald-600">활용 가능</p>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-gray-600 mt-8"
          >
            <strong>일괄 업로드 지원</strong> - 폴더째 드래그하면 끝. 3,000개 이력서도 하루 만에 자산화됩니다.
          </motion.p>
        </section>

        {/* ============================================
            SECTION 6: DEMO #2 - JD → 후보자 매칭
        ============================================ */}
        <section className="bg-gray-900 px-6 md:px-8 py-20">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <span className="inline-block px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm font-medium mb-4">
                DEMO 2
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">어려운 기술 용어 검색하면서 포지션 분석하세요?</h2>
              <p className="text-gray-300">"Feature Store가 뭐지?" </p>
              <p className="text-gray-300">JD 업로드하면 내 후보자들 중에서 적합한 후보를 찾아줍니다.</p>
            </motion.div>

            <motion.div
              ref={demo2Ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              role="region"
              aria-label="JD 매칭 데모"
              aria-live="polite"
            >
              {/* Desktop: Grid layout */}
              <div className="hidden md:grid md:grid-cols-3 gap-4" role="list" aria-label="JD 매칭 단계">
                {/* Step 1: JD Input */}
                <div className="bg-gray-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                      1
                    </span>
                    <h4 className="text-white font-medium">JD 업로드</h4>
                  </div>
                  <div className="bg-gray-700 rounded-xl p-3 h-48 overflow-hidden">
                    {demo2Step !== "idle" ? (
                      <pre className="text-gray-300 text-xs whitespace-pre-wrap">{demo2JD.slice(0, 300)}...</pre>
                    ) : (
                      <p className="text-gray-500 text-sm">클라이언트에게 받은 JD를 붙여넣으세요...</p>
                    )}
                  </div>
                </div>

                {/* Step 2: AI Analysis */}
                <div className="bg-gray-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                      2
                    </span>
                    <h4 className="text-white font-medium">AI가 해석</h4>
                  </div>
                  {demo2Step === "analyzing" || demo2Step === "matching" || demo2Step === "complete" ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                      <div>
                        <p className="text-gray-300 text-xs mb-2">🎯 필수 요건</p>
                        <div className="flex flex-wrap gap-1">
                          {jdParsedResult.required.map((r) => (
                            <span key={r} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-300 text-xs mb-2">⭐ 우대 사항</p>
                        <div className="flex flex-wrap gap-1">
                          {jdParsedResult.preferred.map((p) => (
                            <span key={p} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                        <p className="text-purple-300 text-xs flex items-start gap-2">
                          <Brain className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          {jdParsedResult.aiNote}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                      <Zap className="w-8 h-8 mb-2" />
                      <p className="text-sm">JD를 입력하면</p>
                      <p className="text-sm">자동으로 분석합니다</p>
                    </div>
                  )}
                </div>

                {/* Step 3: Matched Candidates */}
                <div className="bg-gray-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                      3
                    </span>
                    <h4 className="text-white font-medium">매칭 후보자</h4>
                    {demo2Step === "complete" && (
                      <span className="ml-auto text-emerald-400 text-xs font-medium">7명 발견</span>
                    )}
                  </div>
                  {demo2Step === "complete" ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                      {jdMatchedCandidates.map((c, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-3 p-2 bg-gray-700 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm">
                            {c.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{c.name}</p>
                            <p className="text-gray-300 text-xs truncate">{c.currentRole}</p>
                          </div>
                          <span className="text-emerald-400 text-sm font-bold">{c.matchScore}%</span>
                        </motion.div>
                      ))}
                      <p className="text-gray-500 text-xs text-center mt-2">+ 4명 더 보기</p>
                    </motion.div>
                  ) : demo2Step === "matching" ? (
                    <div className="flex flex-col items-center justify-center h-48">
                      <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-2" />
                      <p className="text-gray-300 text-sm">보유 이력서 3,247건에서 검색 중...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                      <Users className="w-8 h-8 mb-2" />
                      <p className="text-sm">분석이 완료되면</p>
                      <p className="text-sm">매칭 후보자가 표시됩니다</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile: Horizontal Carousel */}
              <div className="md:hidden">
                <div
                  ref={demo2CarouselRef}
                  onScroll={handleDemo2Scroll}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-6 px-6"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {/* Step 1: JD Input */}
                  <div className="flex-shrink-0 w-full snap-center px-2 first:pl-0 last:pr-0">
                    <div className="bg-gray-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                          1
                        </span>
                        <h4 className="text-white font-medium">JD 붙여넣기</h4>
                      </div>
                      <div className="bg-gray-700 rounded-xl p-3 h-48 overflow-hidden">
                        {demo2Step !== "idle" ? (
                          <pre className="text-gray-300 text-xs whitespace-pre-wrap">{demo2JD.slice(0, 300)}...</pre>
                        ) : (
                          <p className="text-gray-500 text-sm">클라이언트에게 받은 JD를 붙여넣으세요...</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: AI Analysis */}
                  <div className="flex-shrink-0 w-full snap-center px-2">
                    <div className="bg-gray-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                          2
                        </span>
                        <h4 className="text-white font-medium">AI가 해석</h4>
                      </div>
                      {demo2Step === "analyzing" || demo2Step === "matching" || demo2Step === "complete" ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                          <div>
                            <p className="text-gray-300 text-xs mb-2">🎯 필수 요건</p>
                            <div className="flex flex-wrap gap-1">
                              {jdParsedResult.required.map((r) => (
                                <span key={r} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-gray-300 text-xs mb-2">⭐ 우대 사항</p>
                            <div className="flex flex-wrap gap-1">
                              {jdParsedResult.preferred.map((p) => (
                                <span key={p} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                            <p className="text-purple-300 text-xs flex items-start gap-2">
                              <Brain className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              {jdParsedResult.aiNote}
                            </p>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                          <Zap className="w-8 h-8 mb-2" />
                          <p className="text-sm">JD를 입력하면</p>
                          <p className="text-sm">자동으로 분석합니다</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Matched Candidates */}
                  <div className="flex-shrink-0 w-full snap-center px-2 first:pl-0 last:pr-0">
                    <div className="bg-gray-800 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">
                          3
                        </span>
                        <h4 className="text-white font-medium">매칭 후보자</h4>
                        {demo2Step === "complete" && (
                          <span className="ml-auto text-emerald-400 text-xs font-medium">7명 발견</span>
                        )}
                      </div>
                      {demo2Step === "complete" ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                          {jdMatchedCandidates.map((c, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className="flex items-center gap-3 p-2 bg-gray-700 rounded-lg"
                            >
                              <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm">
                                {c.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{c.name}</p>
                                <p className="text-gray-300 text-xs truncate">{c.currentRole}</p>
                              </div>
                              <span className="text-emerald-400 text-sm font-bold">{c.matchScore}%</span>
                            </motion.div>
                          ))}
                          <p className="text-gray-500 text-xs text-center mt-2">+ 4명 더 보기</p>
                        </motion.div>
                      ) : demo2Step === "matching" ? (
                        <div className="flex flex-col items-center justify-center h-48">
                          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-2" />
                          <p className="text-gray-300 text-sm">보유 이력서 3,247건에서 검색 중...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                          <Users className="w-8 h-8 mb-2" />
                          <p className="text-sm">분석이 완료되면</p>
                          <p className="text-sm">매칭 후보자가 표시됩니다</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Carousel Dots */}
                <div className="flex justify-center gap-2 mt-4">
                  {[0, 1, 2].map((index) => (
                    <button
                      key={index}
                      onClick={() => scrollToDemo2Slide(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        demo2MobileSlide === index
                          ? "bg-purple-500 w-6"
                          : "bg-gray-600 hover:bg-gray-500"
                      }`}
                      aria-label={`Go to step ${index + 1}`}
                    />
                  ))}
                </div>

                {/* Swipe hint */}
                <p className="text-center text-gray-500 text-xs mt-2">좌우로 스와이프하세요</p>
              </div>
            </motion.div>

            {/* Auto-play indicator */}
            {demo2Step === "idle" && (
              <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  데모가 곧 시작됩니다
                </div>
              </div>
            )}

            {/* Key Message */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mt-10 bg-gray-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8"
            >
              <div className="text-center md:text-left">
                <p className="text-gray-300 text-sm">기존</p>
                <p className="text-white">JD 분석 2시간 + 후보 검색 3시간 = <strong className="text-red-400">5시간</strong></p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-500 rotate-90 md:rotate-0" />
              <div className="text-center md:text-left">
                <p className="text-gray-300 text-sm">서치드</p>
                <p className="text-white">JD 업로드 + 자동 매칭 = <strong className="text-emerald-400">30초 이내</strong></p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================
            SECTION 7: JD 러닝커브 제거
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              JD에 있는 전문 용어, 기술 용어
              <br />
              <span className="text-primary">몰라도 됩니다</span>
            </h2>
          </motion.div>

          {/* Comparison Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
              <div className="p-4"></div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="text-red-600 font-medium">서치드 없이</span>
              </div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="text-emerald-600 font-medium">서치드와 함께</span>
              </div>
            </div>
            {[
              { label: "전문/기술 용어 이해", before: "2시간", beforeSub: "구글링 & 공부", after: "0분", afterSub: "AI가 자동 해석" },
              { label: "적합 후보 기준 정리", before: "1시간", beforeSub: "수동 정리", after: "즉시", afterSub: "자동 파싱" },
              { label: "후보자 검색", before: "3시간", beforeSub: "폴더 뒤지기", after: "3초", afterSub: "즉시 매칭" },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 border-b border-gray-100 last:border-b-0">
                <div className="p-4 font-medium text-gray-700">{row.label}</div>
                <div className="p-4 text-center border-l border-gray-100">
                  <span className="text-red-600 font-bold">{row.before}</span>
                  <p className="text-xs text-gray-400">{row.beforeSub}</p>
                </div>
                <div className="p-4 text-center border-l border-gray-100">
                  <span className="text-emerald-600 font-bold">{row.after}</span>
                  <p className="text-xs text-gray-400">{row.afterSub}</p>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-3 bg-gray-50">
              <div className="p-4 font-bold text-gray-900">첫 후보 제안까지</div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="text-red-600 font-bold text-xl">6시간</span>
                <p className="text-xs text-gray-400">내일로 밀림</p>
              </div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="text-emerald-600 font-bold text-xl">5분</span>
                <p className="text-xs text-gray-400">바로 제안</p>
              </div>
            </div>
          </motion.div>

          {/* Example Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 bg-blue-50 border border-blue-100 rounded-2xl p-6"
          >
            <h4 className="font-bold text-gray-900 mb-4">
              💡 예시: JD에 "Feature Store 경험 필수"라고 적혀있다면?
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4">
                <h5 className="font-medium text-red-600 mb-2">❌ 서치드 없이</h5>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>"Feature Store가 뭐지?" 검색</li>
                  <li>"Feast vs Tecton 차이점" 공부</li>
                  <li>내 이력서 중 누가 해봤는지 모름</li>
                  <li>하나씩 열어보며 확인</li>
                </ol>
                <p className="text-red-600 text-sm font-medium mt-3">→ 2시간+ 소요</p>
              </div>
              <div className="bg-white rounded-xl p-4">
                <h5 className="font-medium text-emerald-600 mb-2">✅ 서치드와 함께</h5>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>JD 붙여넣기</li>
                  <li>AI: "Feature Store = ML 피처 관리"</li>
                  <li>자동: Feast, Tecton 경험자 필터링</li>
                  <li>결과: 매칭 후보 3명 표시</li>
                </ol>
                <p className="text-emerald-600 text-sm font-medium mt-3">→ 1분 소요</p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ============================================
            SECTION 8: DEMO #3 - 검색으로 후보자 찾기
        ============================================ */}
        <section className="bg-gray-50 px-6 md:px-8 py-20">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <span className="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-medium mb-4">
                DEMO 3
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">폴더 10개 뒤져도 그 후보가 안 나와요?</h2>
              <p className="text-gray-600">
                "분명 작년에 딱 맞는 사람 봤는데..." Ctrl+F 지옥 끝.
                <br />
                말로 설명하면 3초 만에 찾아드립니다.
              </p>
            </motion.div>

            <motion.div
              ref={demo3Ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
              role="region"
              aria-label="자연어 검색 데모"
              aria-live="polite"
            >
              {/* Search Input with Typing Animation */}
              <div
                className={`flex items-center gap-2 border-2 rounded-xl p-3 mb-4 transition-colors ${
                  demo3IsTyping ? "border-primary bg-primary/5" : "border-gray-200"
                }`}
                role="search"
                aria-label="후보자 검색"
              >
                <Search className={`w-5 h-5 ${demo3IsTyping ? "text-primary" : "text-gray-400"}`} aria-hidden="true" />
                <div className="flex-1 relative">
                  <span className={`${demo3Query ? "text-gray-900" : "text-gray-400"}`}>
                    {demo3Query || "예: 컨설팅펌 출신 전략기획 10년차"}
                  </span>
                  {demo3IsTyping && (
                    <span className="inline-block w-0.5 h-5 bg-primary animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
                {demo3Query && !demo3IsTyping && (
                  <span className="px-4 py-2 bg-primary text-white rounded-lg font-medium">
                    검색
                  </span>
                )}
              </div>

              {/* Auto-play indicator */}
              {!demo3Query && !demo3IsTyping && (
                <div className="flex justify-center mb-6">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 text-orange-600 text-sm">
                    <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    타이핑 데모가 곧 시작됩니다
                  </div>
                </div>
              )}

              {/* Results */}
              <div className="min-h-[300px]">
                {demo3Searching ? (
                  <div className="flex flex-col items-center justify-center h-64">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <p className="text-gray-500">보유 이력서 3,247건에서 검색 중...</p>
                  </div>
                ) : demo3Results ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {/* Results Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-gray-900">
                        <span className="text-primary">{demo3Results.candidates.length}명</span>의 후보자를 찾았습니다
                      </h4>
                      <span className="text-sm text-gray-400">검색 시간: 0.3초</span>
                    </div>

                    {/* Candidates */}
                    <div className="space-y-2 md:space-y-3 mb-6">
                      {demo3Results.candidates.map((c, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm md:text-base flex-shrink-0">
                            {c.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-gray-900 text-sm md:text-base">{c.name}</h5>
                            <p className="text-xs md:text-sm text-gray-500 truncate">{c.currentRole}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.highlights.map((h) => (
                                <span key={h} className="px-1.5 md:px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-xl md:text-2xl font-bold text-primary">{c.matchScore}%</span>
                            <p className="text-xs text-gray-400">매칭</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Search Interpretation */}
                    <div className="bg-blue-50 rounded-xl p-4">
                      <h5 className="font-medium text-gray-900 mb-2">🔍 검색어 해석</h5>
                      <div className="flex flex-wrap gap-2">
                        {demo3Results.interpretation.experience && (
                          <span className="px-3 py-1 bg-white rounded-full text-sm text-gray-700">
                            경력: {demo3Results.interpretation.experience}
                          </span>
                        )}
                        {demo3Results.interpretation.companyType && (
                          <span className="px-3 py-1 bg-white rounded-full text-sm text-gray-700">
                            회사: {demo3Results.interpretation.companyType}
                          </span>
                        )}
                        {demo3Results.interpretation.jobFunction && (
                          <span className="px-3 py-1 bg-white rounded-full text-sm text-gray-700">
                            직무: {demo3Results.interpretation.jobFunction}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <Users className="w-12 h-12 mb-4" />
                    <p>검색 데모가 곧 시작됩니다</p>
                    <p className="font-medium text-gray-600 mt-2">"경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘"</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Key Message */}
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mt-8 text-gray-600"
            >
              <strong>폴더 10개 열어서 Ctrl+F 하던 시간,</strong> 이제 검색 한 번에 끝.
            </motion.p>
          </div>
        </section>

        {/* ============================================
            SECTION 9: ROI 계산기
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Pro 플랜 <span className="text-primary">99,000원</span>,
              <br />
              <span className="text-emerald-600">30배 이상</span> 돌아옵니다
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-6"
          >
            {/* Time Saved */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-gray-900">월 절약 시간</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">JD 분석 시간</span>
                  <span className="font-medium text-blue-600">20시간</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">폴더 검색 시간</span>
                  <span className="font-medium text-blue-600">28시간</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">이력서 검토 시간</span>
                  <span className="font-medium text-blue-600">16시간</span>
                </div>
                <div className="border-t border-blue-200 pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-gray-900">총 절약</span>
                  <span className="font-bold text-blue-600">64시간/월</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">= 8일 (하루 8시간 기준)</p>
            </div>

            {/* Opportunity */}
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <h4 className="font-bold text-gray-900">추가 기회</h4>
              </div>
              <div className="space-y-4">
                <div className="text-center">
                  <span className="text-2xl font-bold text-purple-600">64시간</span>
                  <p className="text-sm text-gray-500">월 절약</p>
                </div>
                <div className="flex justify-center">
                  <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold text-purple-600">+2~3개</span>
                  <p className="text-sm text-gray-500">추가 포지션 진행</p>
                </div>
                <div className="flex justify-center">
                  <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold text-purple-600">+1건</span>
                  <p className="text-sm text-gray-500">월 추가 성사 가능</p>
                </div>
              </div>
            </div>

            {/* Revenue */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-gray-900">수익 환산</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">추가 성사 1건 × 수수료</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">1,500만원 ~ 3,000만원</p>
                </div>
                <div className="border-t border-emerald-200 pt-4">
                  <p className="text-sm text-gray-600">Pro 플랜 투자</p>
                  <p className="text-lg font-bold text-gray-900">99,000원</p>
                </div>
                <div className="bg-emerald-100 rounded-xl p-4 text-center">
                  <p className="text-sm text-emerald-700">예상 ROI</p>
                  <p className="text-3xl font-bold text-emerald-600">150~300배</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-10 text-center"
          >
            <p className="text-xl text-gray-900 mb-6">
              <strong>매달 99,000원</strong>으로 <strong className="text-emerald-600">1,500만원</strong> 추가 수익 기회를 만드세요.
            </p>
            <button
              onClick={handleSignupClick}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-lg transition-all shadow-lg"
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </section>

        {/* ============================================
            SECTION 10: TESTIMONIALS
        ============================================ */}
        <section className="bg-gray-900 px-6 md:px-8 py-20">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">이 분들도 똑같이 고민했어요</h2>
              <p className="text-gray-300">그리고 지금은 경쟁사보다 하루 먼저 제안합니다</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-gray-800 rounded-2xl p-6 relative"
                >
                  <Quote className="w-8 h-8 text-primary/30 absolute top-4 right-4" />

                  {/* Metric Badge */}
                  <div className="inline-block px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-4">
                    {t.metric}
                  </div>

                  {/* Stars */}
                  <div className="flex gap-1 mb-3">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>

                  {/* Quote */}
                  <p className="text-white mb-6 leading-relaxed">"{t.quote}"</p>

                  {/* Author */}
                  <div className="flex items-center gap-3">
                    {t.avatarUrl ? (
                      <img
                        src={t.avatarUrl}
                        alt={`${t.author} 프로필 사진`}
                        className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${t.avatarBg} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                        {t.author[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-white font-medium">{t.author}</p>
                      <p className="text-gray-300 text-sm">{t.role}, {t.company}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================
            SECTION 11: PRICING
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">월 10만원으로 하루 6시간 되찾으세요</h2>
            <p className="text-gray-600">하루 일찍 제안하면 성사율이 달라집니다. 그 시간을 드립니다.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSignupClick}
                className={`relative rounded-2xl p-8 cursor-pointer select-none ${
                  tier.popular
                    ? "bg-primary text-white shadow-xl ring-4 ring-primary/20 hover:shadow-2xl hover:ring-primary/30"
                    : "bg-white border-2 border-gray-200 hover:border-primary/50 hover:shadow-lg"
                } transition-all duration-200`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-yellow-400 text-gray-900 text-sm font-bold shadow-md">
                    추천
                  </div>
                )}

                <h3 className={`text-2xl font-bold mb-2 ${tier.popular ? "text-white" : "text-gray-900"}`}>
                  {tier.name}
                </h3>
                <p className={`text-sm mb-6 ${tier.popular ? "text-white/80" : "text-gray-500"}`}>
                  {tier.description}
                </p>

                <div className="mb-8">
                  <span className={`text-4xl font-bold ${tier.popular ? "text-white" : "text-gray-900"}`}>
                    ₩{tier.price}
                  </span>
                  <span className={tier.popular ? "text-white/60" : "text-gray-500"}>/{tier.period}</span>
                </div>

                <ul className="space-y-4 mb-8">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${tier.popular ? "text-white" : "text-primary"}`} />
                      <span className={tier.popular ? "text-white/90" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`block w-full py-3.5 rounded-xl text-center font-semibold transition-all ${
                    tier.popular
                      ? "bg-white text-primary group-hover:bg-gray-100 shadow-md"
                      : "bg-primary text-white group-hover:bg-primary/90"
                  }`}
                >
                  {tier.cta}
                </div>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-gray-500 mt-8">
            14일 써보고 결정하세요. 신용카드 필요 없고, 안 맞으면 안 쓰면 됩니다.
          </p>
        </section>

        {/* ============================================
            SECTION 12: FINAL CTA
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="p-10 md:p-12 rounded-3xl bg-gradient-to-br from-primary to-blue-600 text-white text-center shadow-2xl"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">내일도 6시간 낭비하실 건가요?</h2>
            <p className="text-white/80 text-lg mb-8 max-w-md mx-auto">
              오늘 가입하면 내일부터 경쟁사보다 하루 빠르게 제안합니다.
              <br />
              그 하루가 성사를 만듭니다.
            </p>

            <button
              onClick={handleSignupClick}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-primary font-semibold text-lg hover:bg-gray-100 transition-all shadow-lg"
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-white/60 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span>신용카드 불필요</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span>14일 무료 체험</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span>언제든 취소 가능</span>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ============================================
          MOBILE STICKY CTA
      ============================================ */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 z-50 safe-area-pb">
        <button
          onClick={handleSignupClick}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-base transition-all shadow-lg"
        >
          무료로 시작하기
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* ============================================
          FOOTER
      ============================================ */}
      <footer className="border-t border-gray-200 bg-white px-6 md:px-8 py-12 pb-24 md:pb-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-gray-500">© 2025 서치드. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-primary transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/support" className="hover:text-primary transition-colors">
              문의하기
            </Link>
          </div>
        </div>
      </footer>

      {/* ============================================
          EXIT INTENT POPUP (Desktop only, non-logged-in users only)
      ============================================ */}
      <AnimatePresence>
        {showExitPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => {
              setShowExitPopup(false);
              localStorage.setItem(EXIT_POPUP_STORAGE_KEY, Date.now().toString());
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-popup-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => {
                  setShowExitPopup(false);
                  localStorage.setItem(EXIT_POPUP_STORAGE_KEY, Date.now().toString());
                }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="팝업 닫기"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Content */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>

                <h2 id="exit-popup-title" className="text-2xl font-bold text-gray-900 mb-3">
                  소싱 시간, 절반으로 줄여보세요
                </h2>
                <p className="text-gray-600 mb-6">
                  이미 500+ 리크루터가 서치드로
                  <br />
                  <strong className="text-primary">더 빠르게 인재를 찾고 있습니다.</strong>
                </p>

                {/* Benefits */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>평균 소싱 시간 70% 단축</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>14일 무료, 신용카드 없이 시작</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>언제든 부담 없이 해지 가능</span>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={(e) => {
                    setShowExitPopup(false);
                    handleSignupClick(e);
                  }}
                  className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold transition-all"
                >
                  무료로 시작하기
                  <ArrowRight className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    setShowExitPopup(false);
                    localStorage.setItem(EXIT_POPUP_STORAGE_KEY, Date.now().toString());
                  }}
                  className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  나중에 볼게요
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Suspense wrapper for useSearchParams
export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LandingPageContent />
    </Suspense>
  );
}
