"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  CheckCircle,
  TrendingUp,
  Target,
  Quote,
  Loader2,
  FileSearch,
  Search,
} from "lucide-react";
import { TESTIMONIALS } from "@/lib/marketing-data";
import { BlobBackground } from "@/components/marketing/hero-background";
import SpotlightButton from "@/components/ui/spotlight-button";

// ============================================
// DATA & CONSTANTS
// ============================================

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
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function LandingPageContent() {
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [, setIsLoggedIn] = useState(false);

  // Demo Section Refs
  const demo2Ref = useRef<HTMLDivElement>(null);
  const demo3Ref = useRef<HTMLDivElement>(null);

  // Demo 2 State
  const [demo2Step, setDemo2Step] = useState<"idle" | "input" | "analyzing" | "matching" | "complete">("idle");
  const [demo2JD, setDemo2JD] = useState("");
  const demo2TimeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const [, setDemo2MobileSlide] = useState(0);
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

  }, []);

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

  // Demo 3 typing animation text
  const demo3TypingText = "경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘";

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
        setDemo3Results(searchResults[demo3TypingText] || searchResults["경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘"]);
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
            setDemo3Results(searchResults[demo3TypingText] || searchResults["경력 10년 이상의 컨설팅펌 출신 전략기획 후보자 찾아줘"]);
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
    if (demo2Ref.current) observer.observe(demo2Ref.current);
    if (demo3Ref.current) observer.observe(demo3Ref.current);

    return () => {
      observer.disconnect();
      resetDemo2();
      resetDemo3();
    };
  }, [mounted, resetDemo2, runDemo2, runDemo3WithTyping, resetDemo3]);

  // Signup Handler - directly navigate to signup
  const handleSignupClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = "/signup";
  };



  return (
    <div className="overflow-hidden">
      {/* Skip to main content link for keyboard navigation (Accessibility) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:font-medium focus:shadow-lg"
      >
        본문으로 건너뛰기
      </a>

      <main id="main-content" className="flex-1" role="main">
        {/* ============================================
            SECTION 1: HERO
        ============================================ */}
        <section className="relative px-6 md:px-8 py-16 md:py-24 max-w-7xl mx-auto overflow-hidden">
          <BlobBackground />
          <div className="text-center max-w-4xl mx-auto relative z-10">

            {/* Main Headline - Version C: 자산화 & 검색 중심 */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-[1.1] tracking-tight"
            >
              폴더 속에 묻혀있는 이력서,
              <br />
              <span className="text-primary">살아있는 자산으로 만드세요.</span>
            </motion.h1>

            {/* Sub-copy */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10"
            >
              ChatGPT는 내 PC 폴더를 뒤져주지 않습니다.
              <br className="hidden md:block" />
              업로드만 하세요. JD가 뜰 때마다 <b>당신이 이미 갖고 있던</b> 최고의 후보자를 1초 만에 찾아드립니다.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <SpotlightButton
                onClick={handleSignupClick}
                className="bg-primary hover:bg-blue-600"
              >
                무료로 시작하기
              </SpotlightButton>
            </motion.div>

            {/* Hero Stats - ROI 중심 수치 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="grid grid-cols-3 gap-4 md:gap-8 mt-16 pt-12 border-t border-gray-200"
            >
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">+150%</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">월 매출 증가 효과</p>
                <p className="text-xs text-gray-400 hidden md:block">단순 업무 시간 절감 덕분</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">10초</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">이력서 분석 시간</p>
                <p className="text-xs text-gray-400 hidden md:block">하루 종일 걸리던 일을 순식간에</p>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <span className="text-2xl md:text-4xl font-bold text-primary">0%</span>
                </div>
                <p className="text-xs md:text-sm text-gray-500">도입 실패율</p>
                <p className="text-xs text-gray-400 hidden md:block">누구나 바로 쓰는 쉬운 사용성</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================
            SECTION 2: SOCIAL PROOF (Testimonials - 상단 이동)
        ============================================ */}
        <section className="bg-gray-900 px-6 md:px-8 py-16">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <p className="text-primary font-medium mb-2">업계 탑티어들이 선택한 솔루션</p>
              <h2 className="text-2xl md:text-3xl font-bold text-white">먼저 써본 분들의 성과</h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-gray-800 rounded-2xl p-6 relative"
                >
                  <Quote className="w-8 h-8 text-primary/30 absolute top-4 right-4" />

                  <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Sparkles key={star} className="w-4 h-4 text-primary fill-primary" />
                    ))}
                  </div>

                  <p className="text-gray-300 mb-6 leading-relaxed">&quot;{t.quote}&quot;</p>

                  <div className="flex items-center gap-4">
                    {/* Avatar Placeholder */}
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.avatarBg} flex items-center justify-center text-white font-bold`}>
                      {t.author[0]}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{t.author}</div>
                      <div className="text-xs text-gray-400">{t.role} | {t.company}</div>
                    </div>
                  </div>

                  {/* ROI Badge */}
                  <div className="mt-6 pt-4 border-t border-gray-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium text-emerald-400">{t.metric}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================
            SECTION 3: HOW IT WORKS (Live Demos)
        ============================================ */}

        {/* Demo 2: JD 기반 자동 매칭 */}
        <section ref={demo2Ref} className="py-24 bg-gray-50 px-6 md:px-8 overflow-hidden">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-primary text-sm font-semibold mb-6">
                <Target className="w-4 h-4" />
                JD 매칭 엔진
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                JD 분석부터 추천까지,
                <br />
                <span className="text-primary">커피 한 잔이면 끝.</span>
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                &quot;이 스택은 필수고, 저건 우대사항이고...&quot; 머리 아프게 분석하지 마세요.
                AI가 채용공고의 행간까지 읽어내어, 가장 핏(Fit)한 인재를 즉시 찾아냅니다.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-primary font-bold">1</div>
                  <p className="text-gray-700">채용 공고(JD) 복사해서 붙여넣기</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-primary font-bold">2</div>
                  <p className="text-gray-700">AI가 필수/우대 요건 자동 추출</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-primary font-bold">3</div>
                  <p className="text-gray-700">Top 3 후보자 추천 및 매칭 사유 제공</p>
                </div>
              </div>
            </div>

            {/* Interactive Demo UI */}
            <div className="flex-1 w-full max-w-lg lg:max-w-none">
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden aspect-[4/5] md:aspect-[4/3] w-full">
                {/* Browser Controls */}
                <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-2">
                  <div className="hidden md:flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400/20"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400/20"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/20"></div>
                  </div>
                  <div className="flex-1 mx-4 h-5 bg-white rounded-md border border-gray-200 text-[10px] flex items-center px-2 text-gray-400">
                    searched.ai/dashboard/jobs
                  </div>
                </div>

                {/* Demo Content */}
                <div className="p-6 h-full flex flex-col relative">

                  {/* Step Indicators */}
                  <div className="flex gap-2 mb-6">
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-500 ${demo2Step !== "idle" ? "bg-primary" : "bg-gray-100"}`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-500 ${["analyzing", "matching", "complete"].includes(demo2Step) ? "bg-primary" : "bg-gray-100"}`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-500 ${["complete"].includes(demo2Step) ? "bg-primary" : "bg-gray-100"}`} />
                  </div>

                  <div
                    ref={demo2CarouselRef}
                    onScroll={handleDemo2Scroll}
                    className="flex-1 flex overflow-x-hidden snap-x snap-mandatory scroll-smooth relative"
                  >

                    {/* Slide 1: Input */}
                    <div className="w-full flex-shrink-0 snap-center flex flex-col">
                      <h3 className="text-sm font-bold text-gray-900 mb-3">새 포지션 등록</h3>
                      <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300 relative">
                        {demo2Step === "idle" ? (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                            채용 공고 내용을 여기에 입력하세요
                          </div>
                        ) : (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-gray-600 whitespace-pre-wrap font-sans"
                          >
                            {demo2JD}
                          </motion.div>
                        )}
                        {/* Fake Cursor when typing */}
                        {demo2Step === "input" && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute bottom-4 right-4 bg-primary text-white text-xs px-2 py-1 rounded shadow-lg flex items-center gap-1"
                          >
                            <Loader2 className="w-3 h-3 animate-spin" />
                            AI Reading...
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Slide 2: Analysis */}
                    <div className="w-full flex-shrink-0 snap-center flex flex-col justify-center px-1">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                        </div>
                        <h3 className="font-bold text-gray-900">JD 분석 중...</h3>
                        <p className="text-xs text-gray-500 mt-1">AI가 핵심 역량을 추출하고 있습니다</p>
                      </div>

                      <div className="space-y-2 max-w-xs mx-auto w-full">
                        <div className="flex justify-between text-xs font-medium text-gray-700">
                          <span>경력 요건</span>
                          <span className="text-primary">5년+</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8 }}
                            className="h-full bg-primary"
                          />
                        </div>

                        <div className="flex justify-between text-xs font-medium text-gray-700 mt-4">
                          <span>기술 스택 (Kubernetes, Python)</span>
                          <span className="text-primary">필수</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="h-full bg-primary"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Slide 3: Results */}
                    <div className="w-full flex-shrink-0 snap-center flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-900">추천 후보자 (Top 3)</h3>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">매칭 완료</span>
                      </div>

                      <div className="space-y-3">
                        {[
                          { name: "김현우", role: "MLOps Enigneer", score: 97, reason: "Kubeflow 파이프라인 구축 경험 보유" },
                          { name: "이서준", role: "Backend Developer", score: 88, reason: "Python 상급, 인프라 경험 부족" },
                          { name: "박민지", role: "DevOps", score: 85, reason: "K8s 운영 강점, ML 경험 부족" }
                        ].map((c, i) => (
                          <motion.div
                            key={c.name}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`p-3 rounded-xl border ${i === 0 ? "bg-blue-50/50 border-blue-200" : "bg-white border-gray-100"}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <div>
                                <div className="font-bold text-sm text-gray-900">{c.name}</div>
                                <div className="text-xs text-gray-500">{c.role}</div>
                              </div>
                              <div className={`text-sm font-bold ${i === 0 ? "text-primary" : "text-gray-400"}`}>
                                {c.score}%
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1 flex gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              {c.reason}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Demo 3: 자연어 검색 */}
        <section ref={demo3Ref} className="py-24 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-16">
            <div className="flex-1 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold mb-6">
                <FileSearch className="w-4 h-4" />
                시맨틱 검색
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                키워드 말고,
                <br />
                <span className="text-indigo-600">사람 말로 찾으세요.</span>
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                &quot;일 잘하는 5년차 마케터 찾아줘&quot;라고 동료에게 말하듯 검색하세요.
                AI가 찰떡같이 알아듣고, 단순 키워드 매칭으로는 찾을 수 없었던 숨은 인재까지 발굴해냅니다.
              </p>

              <div className="flex flex-wrap gap-2">
                {searchExamples.slice(0, 3).map((ex, i) => (
                  <div key={i} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">
                    &quot;{ex}&quot;
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Search UI */}
            <div className="flex-1 w-full relative">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8 min-h-[500px]">
                {/* Search Input */}
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={demo3Query}
                    readOnly
                    placeholder="찾으시는 인재상을 입력해주세요..."
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-50 border-0 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary/20 text-lg shadow-inner"
                  />
                  {demo3Searching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  )}
                </div>

                {/* Search Results */}
                <div className="space-y-4">
                  {demo3IsTyping ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <Search className="w-6 h-6" />
                      </div>
                      <p>AI가 입력 내용을 분석하고 있어요...</p>
                    </div>
                  ) : demo3Results ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {/* AI Interpretation */}
                      <div className="bg-indigo-50 rounded-xl p-4 mb-6 flex gap-3 text-sm text-indigo-800">
                        <Sparkles className="w-5 h-5 flex-shrink-0" />
                        <div>
                          <span className="font-bold">AI 검색 의도 분석: </span>
                          {`${demo3Results.interpretation.experience || ''} ${demo3Results.interpretation.companyType || ''} ${demo3Results.interpretation.jobFunction || ''} 경력자`}를 찾았습니다.
                        </div>
                      </div>

                      {/* Candidates List */}
                      <div className="space-y-3">
                        {demo3Results.candidates.map((c, i) => (
                          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all bg-white group">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                              {c.name[0]}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">{c.name}</span>
                                <span className="text-xs text-gray-400">• {c.experience}</span>
                              </div>
                              <div className="text-sm text-gray-600">{c.currentRole}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-primary">{c.matchScore}%</div>
                              <div className="text-xs text-gray-400">적합도</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <p>검색어를 입력하면 AI가 후보자를 찾아드려요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================
            SECTION 4: FINAL CTA
        ============================================ */}
        <section className="py-24 px-6 relative overflow-hidden">
          <div className="max-w-5xl mx-auto relative z-10 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-8">
              지금 바로 잠들어있는 DB를 깨워<br />
              <span className="text-primary">매출로 만드세요.</span>
            </h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              폴더 속에 묻혀있는 이력서, 그대로 두면 그냥 파일일 뿐입니다.<br className="hidden md:block" />
              서치드로 살아있는 자산으로 바꾸세요.
            </p>
            <SpotlightButton
              onClick={handleSignupClick}
              className="bg-primary hover:bg-blue-600 text-xl px-10 py-5 h-auto"
            >
              무료로 시작하기
            </SpotlightButton>
            <p className="mt-6 text-sm text-gray-400">
              14일 무료 체험 • 신용카드 등록 없음 • 언제든 해지 가능
            </p>
          </div>

          {/* Background Element */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        </section>

      </main>
    </div>
  );
}
