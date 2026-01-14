"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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

// Testimonials 데이터
const testimonials = [
  {
    quote: "JD 받으면 구글링부터 했는데, 이제 그냥 붙여넣기 하면 끝이에요. 월 40시간은 아끼는 것 같아요.",
    metric: "월 40시간 절약",
    author: "김소연",
    role: "시니어 파트너",
    company: "Executive Search Korea",
  },
  {
    quote: "5년치 이력서 3,000개를 드디어 활용하게 됐어요. 예전 후보 찾느라 폴더 뒤지던 시간이 0이 됐습니다.",
    metric: "3,000개 이력서 자산화",
    author: "박준혁",
    role: "헤드헌터",
    company: "Tech Talent Partners",
  },
  {
    quote: "JD 받고 같은 날 후보 3명 제안했어요. 클라이언트가 깜짝 놀라더라고요. 경쟁사보다 하루 빨랐습니다.",
    metric: "첫 제안까지 5분",
    author: "이민지",
    role: "리크루팅 매니저",
    company: "Global HR Solutions",
  },
];

// Pricing 데이터
const pricingTiers = [
  {
    name: "Free",
    price: "0",
    period: "월",
    description: "시작하기 좋은 플랜",
    features: ["월 100건 분석", "기본 검색", "이메일 지원"],
    cta: "무료로 시작",
    popular: false,
  },
  {
    name: "Pro",
    price: "99,000",
    period: "월",
    description: "성장하는 팀을 위한",
    features: ["무제한 분석", "스마트 검색", "JD 자동 매칭", "팀 협업 (3명)", "우선 지원"],
    cta: "Pro 시작하기",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "문의",
    period: "",
    description: "대규모 조직을 위한",
    features: ["무제한 분석", "API 액세스", "전담 매니저", "커스텀 연동", "SLA 보장"],
    cta: "문의하기",
    popular: false,
  },
];

// Company logos
const companyLogos = ["Executive Search Korea", "Tech Talent", "HR Partners", "Recruit Pro", "Talent Bridge"];

// ============================================
// MAIN COMPONENT
// ============================================

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Demo 3 State
  const [demo3Query, setDemo3Query] = useState("");
  const [demo3Searching, setDemo3Searching] = useState(false);
  const [demo3Results, setDemo3Results] = useState<typeof searchResults[string] | null>(null);
  const [demo3IsTyping, setDemo3IsTyping] = useState(false);
  const demo3IntervalRef = useRef<NodeJS.Timeout | null>(null);
  const demo3TimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
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

    const t1 = setTimeout(() => {
      setDemo2Step("analyzing");
      const t2 = setTimeout(() => {
        setDemo2Step("matching");
        const t3 = setTimeout(() => {
          setDemo2Step("complete");
        }, 1050); // 1500 * 0.7 = 1050
        demo2TimeoutRefs.current.push(t3);
      }, 1400); // 2000 * 0.7 = 1400
      demo2TimeoutRefs.current.push(t2);
    }, 700); // 1000 * 0.7 = 700
    demo2TimeoutRefs.current.push(t1);
  }, []);

  // Typing animation for Demo 3
  const runDemo3WithTyping = useCallback(() => {
    resetDemo3();

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
  }, [resetDemo3]);

  // Intersection Observer for Demo 1
  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Reset and start when entering view
            resetDemo1();
            demo1TimeoutRef.current = setTimeout(() => {
              runDemo1();
            }, 500);
          } else {
            // Reset when leaving view
            resetDemo1();
          }
        });
      },
      { threshold: 0.4 }
    );

    if (demo1Ref.current) {
      observer.observe(demo1Ref.current);
    }

    return () => {
      observer.disconnect();
      resetDemo1();
    };
  }, [mounted, resetDemo1, runDemo1]);

  // Intersection Observer for Demo 2
  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            resetDemo2();
            const t = setTimeout(() => {
              runDemo2();
            }, 500);
            demo2TimeoutRefs.current.push(t);
          } else {
            resetDemo2();
          }
        });
      },
      { threshold: 0.4 }
    );

    if (demo2Ref.current) {
      observer.observe(demo2Ref.current);
    }

    return () => {
      observer.disconnect();
      resetDemo2();
    };
  }, [mounted, resetDemo2, runDemo2]);

  // Intersection Observer for Demo 3
  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runDemo3WithTyping();
          } else {
            resetDemo3();
          }
        });
      },
      { threshold: 0.4 }
    );

    if (demo3Ref.current) {
      observer.observe(demo3Ref.current);
    }

    return () => {
      observer.disconnect();
      resetDemo3();
    };
  }, [mounted, runDemo3WithTyping, resetDemo3]);

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

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-hidden">
      {/* ============================================
          NAVIGATION
      ============================================ */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold">RAI</span>
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
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-sm text-white font-medium transition-all shadow-sm"
            >
              무료로 시작하기
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
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
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-3 px-4 rounded-lg bg-primary text-white text-center font-medium"
                >
                  무료로 시작하기
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1">
        {/* ============================================
            SECTION 1: HERO
        ============================================ */}
        <section className="relative px-6 md:px-8 py-16 md:py-24 max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            {/* Social Proof Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium mb-8"
            >
              <span>헤드헌터 500명 이상 사용 중</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-[1.1] tracking-tight"
            >
              JD 받고{" "}
              <span className="text-primary">5분 만에</span>
              <br />
              후보자 3명 제안하세요
            </motion.h1>

            {/* Pain Point */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-4 leading-relaxed"
            >
              <p className="text-gray-500 mb-2">
                "Kubernetes, GraphQL이 뭐지?" 검색하고 이해하는데 2시간...
                <br className="hidden md:block" />
                이력서 폴더 뒤지면서 하나씩 열어보고 읽느라 2시간, 후보 제안은 내일로...
              </p>
            </motion.div>

            {/* Solution */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-lg md:text-xl text-gray-900 max-w-2xl mx-auto mb-10"
            >
              <strong>JD만 붙이세요.</strong> RAI가 JD의 모든 내용을 분석하고,
              <br className="hidden md:block" />
              바쁘신 헤드헌터님의 후보자 데이터에서 최적의 후보를 즉시 찾아드립니다.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link
                href="/signup"
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                무료로 시작하기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button
                onClick={() => document.getElementById("demo-section")?.scrollIntoView({ behavior: "smooth" })}
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold text-lg transition-all"
              >
                <Play className="w-5 h-5" />
                데모 보기
              </button>
            </motion.div>

            {/* Hero Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="grid grid-cols-3 gap-4 md:gap-8 mt-16 pt-12 border-t border-gray-200"
            >
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-gray-900">5분</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">JD 받고 첫 후보 제안</p>
                <p className="text-xs text-gray-400 hidden md:block">기존 6시간 → 5분</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-gray-900">0분</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">JD 기술 용어 공부</p>
                <p className="text-xs text-gray-400 hidden md:block">AI가 자동 해석</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-gray-900">3,000+</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">이력서 검색 가능</p>
                <p className="text-xs text-gray-400 hidden md:block">폴더 → 자산화</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================
            SECTION 2: PAIN POINT
        ============================================ */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">혹시 이런 경험 있으신가요?</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Pain 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-red-50 border border-red-100 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">📧</div>
              <h4 className="font-bold text-gray-900 mb-2">오전 9시, 새 JD 도착</h4>
              <p className="text-gray-600 text-sm mb-3 italic">
                "MLOps Engineer, Feature Store 경험 필수, Kubeflow/Airflow 우대..."
              </p>
              <p className="text-gray-500 text-sm mb-4">→ "이게 다 뭐지?" 구글링 시작 🔍</p>
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                <Clock className="w-4 h-4" />
                <span>2시간 소요</span>
              </div>
            </motion.div>

            {/* Pain 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-orange-50 border border-orange-100 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">📁</div>
              <h4 className="font-bold text-gray-900 mb-2">오후 1시, 후보자 찾기</h4>
              <p className="text-gray-600 text-sm mb-3 italic">
                "그 후보... 작년에 봤는데... 2022년 폴더? 개발자 폴더? 시니어 폴더?"
              </p>
              <p className="text-gray-500 text-sm mb-4">→ 폴더 10개 열어서 Ctrl+F 🗂️</p>
              <div className="flex items-center gap-2 text-orange-600 text-sm font-medium">
                <Clock className="w-4 h-4" />
                <span>3시간 소요</span>
              </div>
            </motion.div>

            {/* Pain 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-gray-100 border border-gray-200 rounded-2xl p-6"
            >
              <div className="text-3xl mb-4">😰</div>
              <h4 className="font-bold text-gray-900 mb-2">오후 6시, 결과</h4>
              <p className="text-gray-600 text-sm mb-3 italic">"오늘 제안 못하겠네... 내일 아침에 보내야지"</p>
              <p className="text-gray-500 text-sm mb-4">→ 경쟁사가 먼저 제안할 수도 ⚠️</p>
              <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>기회 손실</span>
              </div>
            </motion.div>
          </div>

          {/* Solution Teaser */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-10 text-center"
          >
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-2xl px-8 py-6">
              <p className="text-emerald-800">
                <strong className="text-lg">RAI를 쓰면?</strong>
                <br />
                <span className="text-emerald-600">JD 도착 → 5분 후 후보 3명 제안 완료 ✅</span>
              </p>
            </div>
          </motion.div>
        </section>


        {/* ============================================
            SECTION 3: SOCIAL PROOF
        ============================================ */}
        <section className="bg-gray-50 px-6 md:px-8 py-10 border-y border-gray-200">
          <div className="max-w-7xl mx-auto">
            <p className="text-center text-sm text-gray-500 mb-6 font-medium">국내 Top 서치펌들이 신뢰하는 솔루션</p>
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
            SECTION 4: DEMO #1 - 이력서 분석
        ============================================ */}
        <section id="demo-section" className="bg-gray-50 px-6 md:px-8 py-20">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-4">
                DEMO 1
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">이력서 업로드, 30초 만에 분석 완료</h2>
              <p className="text-gray-600">수십 페이지 이력서도 즉시 구조화된 데이터로 변환됩니다</p>
            </motion.div>

            <motion.div
              ref={demo1Ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-gray-900 rounded-3xl p-6 md:p-10 shadow-2xl"
            >
              {/* Demo Header */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-gray-400 text-sm">RAI - 이력서 분석</span>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left: Upload */}
                <div className="space-y-4">
                  <div
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                      demo1Step !== "idle" ? "border-primary bg-primary/10" : "border-gray-700 bg-gray-800"
                    }`}
                  >
                    {demo1Step === "idle" && (
                      <>
                        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                        <p className="text-white font-medium mb-2">이력서를 드래그하거나 클릭하세요</p>
                        <p className="text-gray-400 text-sm">PDF, HWP, DOCX 지원</p>
                      </>
                    )}
                    {demo1Step === "uploading" && (
                      <>
                        <FileText className="w-12 h-12 mx-auto mb-4 text-primary" />
                        <p className="text-white font-medium mb-2">이력서_박지현_2024.pdf</p>
                        <p className="text-gray-400 text-sm">2.4 MB</p>
                      </>
                    )}
                    {(demo1Step === "analyzing" || demo1Step === "complete") && (
                      <>
                        <FileText className="w-12 h-12 mx-auto mb-4 text-primary" />
                        <p className="text-white font-medium mb-2">이력서_박지현_2024.pdf</p>
                        <p className="text-emerald-400 text-sm">✓ 업로드 완료</p>
                      </>
                    )}
                  </div>

                  {/* Progress */}
                  {demo1Step === "analyzing" && (
                    <div className="bg-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <span className="text-white">AI가 분석 중입니다...</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-100"
                          style={{ width: `${demo1Progress}%` }}
                        />
                      </div>
                      <p className="text-gray-400 text-sm mt-2">{Math.ceil((100 - demo1Progress) / 10)}초 남음</p>
                    </div>
                  )}

                  {/* Analysis Steps */}
                  <div className="space-y-2">
                    {[
                      { label: "텍스트 추출", done: demo1Progress > 25 },
                      { label: "경력 파싱", done: demo1Progress > 50 },
                      { label: "스킬 분석", done: demo1Progress > 75 },
                      { label: "완료", done: demo1Step === "complete" },
                    ].map((step, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                          step.done ? "bg-gray-800" : "bg-gray-800/50"
                        }`}
                      >
                        <CheckCircle className={`w-5 h-5 ${step.done ? "text-emerald-400" : "text-gray-600"}`} />
                        <span className={step.done ? "text-white" : "text-gray-500"}>{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Result */}
                <div className="bg-gray-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold">분석 결과</h3>
                    {demo1Step === "complete" && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                        신뢰도 {demoResumeResult.confidence}%
                      </span>
                    )}
                  </div>

                  {demo1Step === "complete" ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                      {[
                        { label: "이름", value: demoResumeResult.name },
                        { label: "현재 직책", value: `${demoResumeResult.currentRole} @ ${demoResumeResult.currentCompany}` },
                        { label: "총 경력", value: demoResumeResult.totalExperience },
                        { label: "학력", value: demoResumeResult.education },
                      ].map((field, i) => (
                        <div key={i} className="p-3 bg-gray-700/50 rounded-xl">
                          <p className="text-gray-400 text-xs mb-1">{field.label}</p>
                          <p className="text-white font-medium">{field.value}</p>
                        </div>
                      ))}
                      <div className="p-3 bg-gray-700/50 rounded-xl">
                        <p className="text-gray-400 text-xs mb-2">핵심 스킬</p>
                        <div className="flex flex-wrap gap-2">
                          {demoResumeResult.skills.slice(0, 4).map((skill) => (
                            <span key={skill} className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                      <FileSearch className="w-12 h-12 mb-4" />
                      <p>이력서를 업로드하면</p>
                      <p>분석 결과가 표시됩니다</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-play indicator */}
              {demo1Step === "idle" && (
                <div className="mt-6 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-400 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    데모가 곧 시작됩니다
                  </div>
                </div>
              )}
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
                RAI와 함께
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
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">JD만 붙이면, 후보자가 나옵니다</h2>
              <p className="text-gray-400">기술 용어를 몰라도 됩니다. AI가 해석하고 매칭합니다.</p>
            </motion.div>

            <motion.div
              ref={demo2Ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="grid md:grid-cols-3 gap-4"
            >
              {/* Step 1: JD Input */}
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
                      <p className="text-gray-400 text-xs mb-2">🎯 필수 요건</p>
                      <div className="flex flex-wrap gap-1">
                        {jdParsedResult.required.map((r) => (
                          <span key={r} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">⭐ 우대 사항</p>
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
                          <p className="text-gray-400 text-xs truncate">{c.currentRole}</p>
                        </div>
                        <span className="text-emerald-400 text-sm font-bold">{c.matchScore}%</span>
                      </motion.div>
                    ))}
                    <p className="text-gray-500 text-xs text-center mt-2">+ 4명 더 보기</p>
                  </motion.div>
                ) : demo2Step === "matching" ? (
                  <div className="flex flex-col items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-2" />
                    <p className="text-gray-400 text-sm">보유 이력서 3,247건에서 검색 중...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                    <Users className="w-8 h-8 mb-2" />
                    <p className="text-sm">분석이 완료되면</p>
                    <p className="text-sm">매칭 후보자가 표시됩니다</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Auto-play indicator */}
            {demo2Step === "idle" && (
              <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-400 text-sm">
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
                <p className="text-gray-400 text-sm">기존</p>
                <p className="text-white">JD 분석 2시간 + 후보 검색 3시간 = <strong className="text-red-400">5시간</strong></p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-600 rotate-90 md:rotate-0" />
              <div className="text-center md:text-left">
                <p className="text-gray-400 text-sm">RAI</p>
                <p className="text-white">JD 붙이기 10초 + 자동 매칭 = <strong className="text-emerald-400">1분</strong></p>
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
              JD 기술 용어,
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
                <span className="text-red-600 font-medium">RAI 없이</span>
              </div>
              <div className="p-4 text-center border-l border-gray-200">
                <span className="text-emerald-600 font-medium">RAI와 함께</span>
              </div>
            </div>
            {[
              { label: "JD 기술 용어 이해", before: "2시간", beforeSub: "구글링 & 공부", after: "0분", afterSub: "AI가 자동 해석" },
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
                <h5 className="font-medium text-red-600 mb-2">❌ RAI 없이</h5>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>"Feature Store가 뭐지?" 검색</li>
                  <li>"Feast vs Tecton 차이점" 공부</li>
                  <li>내 이력서 중 누가 해봤는지 모름</li>
                  <li>하나씩 열어보며 확인</li>
                </ol>
                <p className="text-red-600 text-sm font-medium mt-3">→ 2시간+ 소요</p>
              </div>
              <div className="bg-white rounded-xl p-4">
                <h5 className="font-medium text-emerald-600 mb-2">✅ RAI와 함께</h5>
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
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">생각나는 대로 검색하세요</h2>
              <p className="text-gray-600">
                복잡한 필터 조합 대신, 원하는 후보를 말로 설명하세요.
                <br />
                RAI가 정확히 이해하고 찾아드립니다.
              </p>
            </motion.div>

            <motion.div
              ref={demo3Ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
            >
              {/* Search Input with Typing Animation */}
              <div className={`flex items-center gap-2 border-2 rounded-xl p-3 mb-4 transition-colors ${
                demo3IsTyping ? "border-primary bg-primary/5" : "border-gray-200"
              }`}>
                <Search className={`w-5 h-5 ${demo3IsTyping ? "text-primary" : "text-gray-400"}`} />
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
                    <div className="space-y-3 mb-6">
                      {demo3Results.candidates.map((c, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {c.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-gray-900">{c.name}</h5>
                            <p className="text-sm text-gray-500">{c.currentRole}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.highlights.map((h) => (
                                <span key={h} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold text-primary">{c.matchScore}%</span>
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
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-lg transition-all shadow-lg"
            >
              무료 체험 시작
              <ArrowRight className="w-5 h-5" />
            </Link>
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
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">헤드헌터들의 실제 후기</h2>
              <p className="text-gray-400">RAI를 사용하는 채용 전문가들의 이야기</p>
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
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                      {t.author[0]}
                    </div>
                    <div>
                      <p className="text-white font-medium">{t.author}</p>
                      <p className="text-gray-400 text-sm">{t.role}, {t.company}</p>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">투명한 요금제</h2>
            <p className="text-gray-600">팀 규모에 맞는 플랜을 선택하세요. 언제든 업그레이드 가능합니다.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {pricingTiers.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl p-6 ${
                  tier.popular
                    ? "bg-primary text-white shadow-xl scale-105 z-10"
                    : "bg-white border border-gray-200"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-yellow-400 text-gray-900 text-sm font-bold">
                    가장 인기
                  </div>
                )}

                <h3 className={`text-xl font-bold mb-1 ${tier.popular ? "text-white" : "text-gray-900"}`}>
                  {tier.name}
                </h3>
                <p className={`text-sm mb-4 ${tier.popular ? "text-white/80" : "text-gray-500"}`}>
                  {tier.description}
                </p>

                <div className="mb-6">
                  <span className={`text-4xl font-bold ${tier.popular ? "text-white" : "text-gray-900"}`}>
                    {tier.price === "문의" ? "" : "₩"}{tier.price}
                  </span>
                  {tier.period && (
                    <span className={tier.popular ? "text-white/60" : "text-gray-500"}>/{tier.period}</span>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 ${tier.popular ? "text-white" : "text-primary"}`} />
                      <span className={tier.popular ? "text-white/90" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.name === "Enterprise" ? "/support" : "/signup"}
                  className={`block w-full py-3 rounded-xl text-center font-semibold transition-all ${
                    tier.popular
                      ? "bg-white text-primary hover:bg-gray-100"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  {tier.cta}
                </Link>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-gray-500 mt-8">
            모든 플랜에 14일 무료 체험이 포함됩니다. 신용카드 없이 시작하세요.
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">지금 바로 시작하세요</h2>
            <p className="text-white/80 text-lg mb-8 max-w-md mx-auto">
              14일 무료 체험으로 RAI의 모든 기능을 경험해보세요.
              <br />
              신용카드 없이 바로 시작할 수 있습니다.
            </p>

            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-primary font-semibold text-lg hover:bg-gray-100 transition-all shadow-lg"
            >
              무료 체험 시작
              <ArrowRight className="w-5 h-5" />
            </Link>

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
          FOOTER
      ============================================ */}
      <footer className="border-t border-gray-200 bg-white px-6 md:px-8 py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-gray-500">© 2025 RAI. All rights reserved.</span>
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
    </div>
  );
}
