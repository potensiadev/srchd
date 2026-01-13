"use client";

import { motion } from "framer-motion";
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
import DeepSpaceBackground from "@/components/layout/DeepSpaceBackground";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      delay,
      ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number],
    },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Product features data
const coreFeatures = [
  {
    icon: Brain,
    title: "2-Way AI Cross-Check",
    description:
      "GPT-4o와 Gemini 1.5 Pro 두 개의 AI 엔진이 독립적으로 이력서를 분석하고 교차 검증하여 99.2% 정확도를 달성합니다.",
    details: [
      "독립적인 듀얼 AI 분석",
      "교차 검증을 통한 오류 최소화",
      "신뢰도 점수 제공",
      "필드별 정확도 표시",
    ],
  },
  {
    icon: Shield,
    title: "Privacy Shield",
    description:
      "AES-256-GCM 암호화와 자동 PII 마스킹으로 후보자의 민감한 개인정보를 안전하게 보호합니다.",
    details: [
      "AES-256-GCM 암호화",
      "자동 PII 탐지 및 마스킹",
      "RLS 기반 데이터 격리",
      "GDPR/PIPA 준수",
    ],
  },
  {
    icon: Zap,
    title: "30초 분석",
    description:
      "PDF, HWP, DOCX 등 다양한 형식의 이력서를 30초 이내에 구조화된 데이터로 변환합니다.",
    details: [
      "PDF, HWP, DOCX 지원",
      "평균 처리 시간 30초",
      "비동기 병렬 처리",
      "대용량 배치 업로드",
    ],
  },
  {
    icon: FileSearch,
    title: "시맨틱 검색",
    description:
      "벡터 임베딩 기반 검색으로 키워드가 아닌 의미를 이해하여 최적의 후보자를 찾아냅니다.",
    details: [
      "OpenAI 임베딩 기반",
      "동의어 자동 확장",
      "스킬 매칭 점수",
      "고급 필터링",
    ],
  },
  {
    icon: Users,
    title: "중복 감지",
    description:
      "동일 후보자의 다른 버전 이력서를 자동으로 감지하고 효율적으로 버전 관리합니다.",
    details: [
      "해시 기반 중복 탐지",
      "유사도 점수 계산",
      "버전 히스토리 관리",
      "병합/삭제 옵션",
    ],
  },
  {
    icon: Lock,
    title: "블라인드 내보내기",
    description:
      "개인 식별 정보를 제거한 블라인드 이력서를 PDF로 즉시 생성하여 공정한 채용을 지원합니다.",
    details: [
      "원클릭 블라인드 PDF",
      "선택적 필드 마스킹",
      "커스텀 템플릿",
      "배치 내보내기",
    ],
  },
];

// Additional features
const additionalFeatures = [
  {
    icon: BarChart3,
    title: "리스크 대시보드",
    description: "데이터 품질 문제를 한눈에 파악하고 관리할 수 있습니다.",
  },
  {
    icon: Sparkles,
    title: "포지션 매칭",
    description: "채용 포지션과 후보자를 자동으로 매칭하여 추천합니다.",
  },
];

export default function ProductsPage() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <DeepSpaceBackground />

      <div className="relative z-10">
        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between px-6 md:px-8 py-6 max-w-7xl mx-auto"
        >
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-white">RAI</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  link.href === "/products"
                    ? "text-white font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10
                       text-sm text-white font-medium transition-all"
            >
              시작하기
            </Link>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </motion.nav>

        {/* Mobile Menu */}
        <motion.div
          initial={false}
          animate={{
            height: mobileMenuOpen ? "auto" : 0,
            opacity: mobileMenuOpen ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
          className="md:hidden overflow-hidden"
        >
          <div className="px-6 pb-6 space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block py-2 transition-colors ${
                  link.href === "/products"
                    ? "text-white font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-slate-300 hover:text-white transition-colors"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-3 px-4 rounded-lg bg-primary text-white text-center font-medium"
              >
                시작하기
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Hero Section */}
        <section className="px-6 md:px-8 pt-16 pb-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              AI 기반 이력서 분석의
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-neon-purple to-neon-cyan">
                새로운 기준
              </span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              RAI는 최신 AI 기술을 활용하여 이력서 분석, 후보자 검색, 데이터 관리를
              <br className="hidden md:block" />
              하나의 플랫폼에서 해결합니다.
            </p>
          </motion.div>
        </section>

        {/* Core Features */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-white mb-4">핵심 기능</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              헤드헌터의 업무 효율을 극대화하는 6가지 핵심 기능
            </p>
          </motion.div>

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
                custom={index * 0.1}
                className="group relative p-6 rounded-2xl bg-white/[0.03] backdrop-blur-xl
                         border border-white/[0.08] hover:border-primary/30 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30
                              flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>

                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  {feature.description}
                </p>

                <ul className="space-y-2">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-center gap-2 text-sm text-slate-500">
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Additional Features */}
        <section className="px-6 md:px-8 py-20 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-4">추가 기능</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {additionalFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-4 p-5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div className="w-10 h-10 rounded-lg bg-neon-cyan/20 border border-neon-cyan/30
                              flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-neon-cyan" />
                </div>
                <div>
                  <h3 className="text-white font-medium mb-1">{feature.title}</h3>
                  <p className="text-sm text-slate-400">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 md:px-8 py-20 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative p-10 md:p-12 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent
                       border border-primary/20 text-center"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              지금 바로 시작하세요
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Closed Beta 기간 동안 모든 기능을 무료로 체험해보세요.
            </p>

            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl
                       bg-primary hover:bg-primary/90 text-white font-semibold
                       transition-all shadow-lg shadow-primary/25"
            >
              무료 체험 시작
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="relative px-6 md:px-8 py-12 border-t border-white/5">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-slate-500">
                © 2025 RAI. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/terms" className="hover:text-white transition-colors">
                이용약관
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                개인정보처리방침
              </Link>
              <Link href="/support" className="hover:text-white transition-colors">
                문의하기
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
