"use client";

import { motion, Variants } from "framer-motion";
import Link from "next/link";
import {
  Sparkles,
  Brain,
  Shield,
  Zap,
  FileSearch,
  Users,
  Lock,
  BarChart3,
  ArrowRight,
  CheckCircle,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

// Animation variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: typeof delay === "number" ? delay : 0,
      ease: "easeOut",
    },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

// Product features data
const coreFeatures = [
  {
    icon: Brain,
    title: "두 번 검증, 한 번에 정확하게",
    description:
      "두 개의 AI가 각각 이력서를 읽고 서로 검증합니다. 사람이 놓치는 것도, AI 하나가 틀리는 것도 잡아냅니다.",
    details: [
      "99.2% 분석 정확도",
      "오타·누락 자동 감지",
      "신뢰도 점수로 한눈에 확인",
      "어디가 불확실한지 바로 표시",
    ],
  },
  {
    icon: Shield,
    title: "후보자 정보, 걱정 없이",
    description:
      "이름, 연락처, 주민번호 같은 민감 정보는 자동으로 암호화됩니다. 규정 준수도 알아서.",
    details: [
      "금융권 수준 암호화 적용",
      "민감정보 자동 감지·보호",
      "팀원별 접근 권한 분리",
      "개인정보보호법(PIPA) 준수",
    ],
  },
  {
    icon: Zap,
    title: "이력서 올리고 30초면 끝",
    description:
      "PDF든 HWP든 DOCX든, 그냥 올리세요. 30초 후엔 깔끔하게 정리된 프로필이 됩니다.",
    details: [
      "어떤 파일 형식이든 OK",
      "드래그 앤 드롭으로 간편 업로드",
      "한 번에 여러 개도 가능",
      "업로드하면 알아서 정리",
    ],
  },
  {
    icon: FileSearch,
    title: "원하는 인재, 말로 찾으세요",
    description:
      "\"마케팅 경력 3년, 스타트업 경험 있는 분\" 이렇게 검색하면 됩니다. 딱 맞는 후보자가 나옵니다.",
    details: [
      "자연어로 검색 가능",
      "비슷한 표현도 알아서 찾기",
      "적합도 점수로 순위 확인",
      "조건 필터로 더 정밀하게",
    ],
  },
  {
    icon: Users,
    title: "같은 사람, 여러 이력서? 자동 정리",
    description:
      "한 후보자가 여러 번 지원했거나 버전이 다른 이력서가 있어도 자동으로 묶어줍니다.",
    details: [
      "중복 후보자 자동 감지",
      "어떤 버전이 최신인지 표시",
      "이력서 변경 이력 추적",
      "원클릭으로 병합·정리",
    ],
  },
  {
    icon: Lock,
    title: "공정한 채용을 위한 블라인드 이력서",
    description:
      "이름, 사진, 출신학교를 가린 이력서를 클릭 한 번으로 만들 수 있습니다. 실력만 보세요.",
    details: [
      "클릭 한 번으로 PDF 생성",
      "가릴 항목 직접 선택 가능",
      "우리 회사 양식으로 커스텀",
      "여러 명 한 번에 내보내기",
    ],
  },
];

// Additional features
const additionalFeatures = [
  {
    icon: BarChart3,
    title: "문제 있는 데이터, 먼저 알려드려요",
    description: "누락된 정보, 이상한 날짜 같은 문제를 대시보드에서 바로 확인하세요.",
  },
  {
    icon: Sparkles,
    title: "이 포지션에 딱 맞는 후보자 추천",
    description: "채용 공고만 등록하면, 적합한 후보자를 자동으로 찾아 추천해드립니다.",
  },
];

export default function ProductsPage() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/10 selection:text-primary">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/80 backdrop-blur-md border-b border-gray-100" : "bg-transparent"
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="text-xl font-bold tracking-tight text-gray-900">서치드</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${link.href === "/products"
                  ? "text-primary"
                  : "text-gray-500 hover:text-gray-900"
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
            >
              시작하기
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <motion.div
        initial={false}
        animate={{ height: mobileMenuOpen ? "auto" : 0, opacity: mobileMenuOpen ? 1 : 0 }}
        className="md:hidden overflow-hidden bg-white border-b border-gray-100 fixed top-20 left-0 right-0 z-40 shadow-lg"
      >
        <div className="p-6 space-y-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-base font-medium text-gray-900"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <Link
              href="/login"
              className="block w-full py-3 text-center text-gray-600 font-medium hover:text-gray-900"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="block w-full py-3 rounded-xl bg-primary text-white text-center font-medium hover:bg-primary/90"
            >
              시작하기
            </Link>
          </div>
        </div>
      </motion.div>

      <main className="pt-32 pb-20 px-6">
        {/* Hero */}
        <div className="max-w-4xl mx-auto text-center mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-tight">
              이력서 검토에 쓰는 시간,
              <br />
              <span className="text-primary">90% 줄이세요</span>
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">
              쌓여가는 이력서 더미에서 벗어나세요.
              <br className="hidden md:block" />
              AI가 분석하고, 당신은 면접에 집중하세요.
            </p>
          </motion.div>
        </div>

        {/* Core Features */}
        <div className="max-w-7xl mx-auto mb-32">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {coreFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
                className="group p-8 rounded-3xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed mb-6">{feature.description}</p>

                <ul className="space-y-3">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-center gap-3 text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Additional Features */}
        <div className="max-w-3xl mx-auto mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-gray-900">더 똑똑하게 일하기</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-5 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{feature.title}</h3>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative px-8 py-16 md:py-20 rounded-[2.5rem] bg-[#0F172A] text-center overflow-hidden"
          >
            {/* Background Gradient */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                다음 주 월요일,<br className="md:hidden" /> 이력서 걱정 없이 출근하세요
              </h2>
              <p className="text-blue-100 mb-10 max-w-lg mx-auto text-lg">
                14일 무료 체험. 신용카드 필요 없음.
                <br />
                5분이면 첫 이력서 분석까지 완료됩니다.
              </p>

              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-primary hover:bg-blue-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                무료로 시작하기
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-gray-400" />
            </div>
            <span className="text-sm text-gray-500">© 2025 서치드. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-gray-900 transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-gray-900 transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/support" className="hover:text-gray-900 transition-colors">
              문의하기
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
