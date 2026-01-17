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

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

const plans = [
  {
    name: "Starter",
    description: "개인 헤드헌터 또는 소규모 팀을 위한 플랜",
    price: "79,000",
    period: "월",
    icon: Zap,
    highlight: false,
    features: [
      "월 50건 이력서 분석",
      "2-Way AI Cross-Check (GPT + Gemini)",
      "기본 시맨틱 검색",
      "블라인드 내보내기 (월 30회)",
      "이메일 지원",
      "기본 리스크 대시보드",
    ],
    notIncluded: [
      "3-Way AI Cross-Check",
      "팀 협업 기능",
      "API 액세스",
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
      "월 150건 이력서 분석",
      "3-Way AI Cross-Check (GPT + Gemini + Claude)",
      "고급 시맨틱 검색 + 필터",
      "무제한 블라인드 내보내기",
      "우선 이메일 + 채팅 지원",
      "전체 리스크 대시보드",
      "팀 협업 (최대 5명)",
      "API 액세스",
      "커스텀 내보내기 템플릿",
      "포지션 매칭",
    ],
    notIncluded: [],
    cta: "Professional 시작하기",
    ctaLink: "/signup?plan=pro",
  },
];

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

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${link.href === "/pricing"
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
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
              심플한 <span className="text-primary">요금제</span>
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed">
              필요한 만큼만 사용하세요. 언제든지 업그레이드하거나 취소할 수 있습니다.
            </p>
          </motion.div>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-5xl mx-auto mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-3xl p-8 border transition-all duration-300 ${plan.highlight
                    ? "bg-white border-primary shadow-xl scale-105 z-10"
                    : "bg-white border-gray-100 shadow-sm hover:shadow-lg hover:border-gray-200"
                  }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold tracking-wide shadow-sm">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-4 mb-6">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${plan.highlight ? "bg-primary/10" : "bg-gray-50"
                      }`}
                  >
                    <plan.icon
                      className={`w-6 h-6 ${plan.highlight ? "text-primary" : "text-gray-500"
                        }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-500">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-8 pb-8 border-b border-gray-100">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-gray-900">₩{plan.price}</span>
                    <span className="text-gray-500 font-medium">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 opacity-50">
                      <X className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.ctaLink}
                  className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold transition-all ${plan.highlight
                      ? "bg-primary hover:bg-blue-600 text-white shadow-md hover:shadow-lg"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                    }`}
                >
                  {plan.cta}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="max-w-3xl mx-auto mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center p-10 rounded-3xl bg-gray-50 border border-gray-100"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Enterprise</h3>
            <p className="text-gray-500 mb-6">
              대규모 팀을 위한 맞춤형 솔루션이 필요하신가요?
            </p>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 text-primary hover:text-blue-700 font-semibold transition-colors"
            >
              영업팀 문의하기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">자주 묻는 질문</h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{faq.question}</h3>
                <p className="text-gray-500 leading-relaxed text-sm">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-gray-400" />
            </div>
            <span className="text-sm text-gray-500">
              © 2025 서치드. All rights reserved.
            </span>
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
