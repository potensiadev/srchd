"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Sparkles,
  Check,
  ArrowRight,
  Menu,
  X,
  Zap,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import DeepSpaceBackground from "@/components/layout/DeepSpaceBackground";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

// Pricing plans
const plans = [
  {
    name: "Starter",
    description: "개인 헤드헌터 또는 소규모 팀을 위한 플랜",
    price: "49,000",
    period: "월",
    icon: Zap,
    highlight: false,
    features: [
      "월 100건 이력서 분석",
      "2-Way AI Cross-Check",
      "기본 시맨틱 검색",
      "블라인드 내보내기",
      "이메일 지원",
      "기본 리스크 대시보드",
    ],
    notIncluded: [
      "팀 협업 기능",
      "API 액세스",
      "커스텀 템플릿",
      "우선 지원",
    ],
    cta: "Starter 시작하기",
    ctaLink: "/signup?plan=starter",
  },
  {
    name: "Professional",
    description: "성장하는 서치펌과 HR팀을 위한 플랜",
    price: "149,000",
    period: "월",
    icon: Building2,
    highlight: true,
    badge: "인기",
    features: [
      "월 500건 이력서 분석",
      "2-Way AI Cross-Check",
      "고급 시맨틱 검색 + 필터",
      "블라인드 내보내기",
      "우선 이메일 + 채팅 지원",
      "전체 리스크 대시보드",
      "팀 협업 (최대 5명)",
      "API 액세스",
      "커스텀 내보내기 템플릿",
      "포지션 매칭",
    ],
    notIncluded: [],
    cta: "Professional 시작하기",
    ctaLink: "/signup?plan=professional",
  },
];

// FAQ items
const faqs = [
  {
    question: "무료 체험 기간이 있나요?",
    answer:
      "네, Closed Beta 기간 동안 모든 신규 사용자에게 14일간 무료 체험을 제공합니다. 신용카드 없이 바로 시작할 수 있습니다.",
  },
  {
    question: "분석 건수를 초과하면 어떻게 되나요?",
    answer:
      "월간 분석 건수를 초과하면 추가 분석이 일시 중단됩니다. 추가 크레딧을 구매하거나 다음 달까지 기다릴 수 있습니다. 플랜 업그레이드도 가능합니다.",
  },
  {
    question: "플랜을 변경할 수 있나요?",
    answer:
      "언제든지 플랜을 업그레이드하거나 다운그레이드할 수 있습니다. 변경은 다음 결제 주기부터 적용됩니다.",
  },
  {
    question: "Enterprise 플랜이 필요합니다.",
    answer:
      "대규모 팀이나 특별한 요구사항이 있으신 경우 별도로 문의해 주세요. 맞춤형 플랜을 제안해 드립니다.",
  },
];

export default function PricingPage() {
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
                  link.href === "/pricing"
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
                  link.href === "/pricing"
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
        <section className="px-6 md:px-8 pt-16 pb-12 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              심플한
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-neon-purple to-neon-cyan">
                {" "}요금제
              </span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              필요한 만큼만 사용하세요. 언제든지 업그레이드하거나 취소할 수 있습니다.
            </p>
          </motion.div>
        </section>

        {/* Pricing Cards */}
        <section className="px-6 md:px-8 py-12 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl p-8 ${
                  plan.highlight
                    ? "bg-gradient-to-b from-primary/20 via-primary/10 to-transparent border-2 border-primary/40"
                    : "bg-white/[0.03] border border-white/[0.08]"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full bg-primary text-white text-xs font-medium">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan Icon & Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      plan.highlight
                        ? "bg-primary/30 border border-primary/50"
                        : "bg-white/10 border border-white/20"
                    }`}
                  >
                    <plan.icon
                      className={`w-5 h-5 ${
                        plan.highlight ? "text-primary" : "text-slate-300"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <p className="text-sm text-slate-400">{plan.description}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6 pb-6 border-b border-white/10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">₩{plan.price}</span>
                    <span className="text-slate-400">/{plan.period}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-300">{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 opacity-50">
                      <X className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-500">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Link
                  href={plan.ctaLink}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium transition-all ${
                    plan.highlight
                      ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Enterprise CTA */}
        <section className="px-6 md:px-8 py-12 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
          >
            <h3 className="text-xl font-bold text-white mb-2">Enterprise</h3>
            <p className="text-slate-400 mb-4">
              대규모 팀을 위한 맞춤형 솔루션이 필요하신가요?
            </p>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
            >
              영업팀 문의하기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </section>

        {/* FAQ Section */}
        <section className="px-6 md:px-8 py-20 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-4">자주 묻는 질문</h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.08]"
              >
                <h3 className="text-white font-medium mb-2">{faq.question}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
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
