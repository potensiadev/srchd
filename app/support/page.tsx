"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Sparkles,
  ChevronDown,
  Mail,
  MessageSquare,
  FileText,
  Clock,
  Menu,
  X,
  Send,
} from "lucide-react";
import { useState, useEffect } from "react";
import DeepSpaceBackground from "@/components/layout/DeepSpaceBackground";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

// FAQ categories
const faqCategories = [
  {
    title: "시작하기",
    faqs: [
      {
        question: "RAI는 어떤 서비스인가요?",
        answer:
          "RAI는 AI 기반 이력서 분석 플랫폼입니다. 헤드헌터와 HR 담당자를 위해 이력서를 자동으로 분석하고, 후보자를 검색하며, 데이터를 안전하게 관리할 수 있습니다.",
      },
      {
        question: "어떤 파일 형식을 지원하나요?",
        answer:
          "PDF, HWP, DOCX 형식의 이력서를 지원합니다. 업로드 시 자동으로 형식을 인식하여 처리합니다.",
      },
      {
        question: "무료 체험은 어떻게 시작하나요?",
        answer:
          "회원가입 후 14일간 모든 기능을 무료로 체험할 수 있습니다. 신용카드 정보 없이 바로 시작할 수 있습니다.",
      },
    ],
  },
  {
    title: "기능 관련",
    faqs: [
      {
        question: "2-Way AI Cross-Check이 무엇인가요?",
        answer:
          "GPT-4o와 Gemini 1.5 Pro 두 개의 AI 엔진이 독립적으로 이력서를 분석하고 결과를 교차 검증합니다. 이를 통해 99.2% 이상의 분석 정확도를 달성합니다.",
      },
      {
        question: "시맨틱 검색은 어떻게 작동하나요?",
        answer:
          "벡터 임베딩 기술을 사용하여 키워드가 아닌 의미를 기반으로 검색합니다. 예를 들어 'React'를 검색하면 'ReactJS', 'React.js', '리액트' 등 관련 키워드도 함께 검색됩니다.",
      },
      {
        question: "블라인드 내보내기란 무엇인가요?",
        answer:
          "이름, 연락처, 사진 등 개인 식별 정보를 제거한 이력서를 PDF로 내보내는 기능입니다. 공정한 채용 프로세스를 지원합니다.",
      },
    ],
  },
  {
    title: "보안 & 개인정보",
    faqs: [
      {
        question: "데이터는 어떻게 보호되나요?",
        answer:
          "모든 민감한 데이터는 AES-256-GCM으로 암호화됩니다. Row Level Security(RLS)를 통해 사용자별 데이터가 완벽히 격리됩니다.",
      },
      {
        question: "GDPR/PIPA를 준수하나요?",
        answer:
          "네, RAI는 GDPR과 개인정보보호법(PIPA)을 준수합니다. 데이터 삭제 요청, 접근 권한 관리, 처리 동의 등을 지원합니다.",
      },
      {
        question: "데이터는 어디에 저장되나요?",
        answer:
          "모든 데이터는 AWS 한국 리전에 저장됩니다. 추가 리전 지원이 필요한 경우 Enterprise 플랜으로 문의해 주세요.",
      },
    ],
  },
  {
    title: "결제 & 요금",
    faqs: [
      {
        question: "플랜을 변경할 수 있나요?",
        answer:
          "언제든지 플랜을 업그레이드하거나 다운그레이드할 수 있습니다. 변경은 다음 결제 주기부터 적용됩니다.",
      },
      {
        question: "결제 수단은 무엇을 지원하나요?",
        answer:
          "신용카드(Visa, Mastercard, AMEX)와 계좌이체를 지원합니다. Enterprise 플랜은 세금계산서 발행도 가능합니다.",
      },
      {
        question: "환불 정책은 어떻게 되나요?",
        answer:
          "결제 후 7일 이내에 서비스를 이용하지 않은 경우 전액 환불이 가능합니다. 자세한 내용은 이용약관을 참조해 주세요.",
      },
    ],
  },
];

// Contact options
const contactOptions = [
  {
    icon: Mail,
    title: "이메일 문의",
    description: "support@rai.kr로 문의해 주세요",
    detail: "영업일 기준 24시간 내 답변",
  },
  {
    icon: MessageSquare,
    title: "채팅 지원",
    description: "Professional 플랜 이상",
    detail: "평일 09:00 - 18:00",
  },
  {
    icon: FileText,
    title: "문서 센터",
    description: "상세 가이드와 튜토리얼",
    detail: "준비 중",
  },
];

// FAQ Item component
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-4 text-left"
      >
        <span className="text-white font-medium pr-4">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="w-5 h-5 text-slate-400" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <p className="pb-4 text-sm text-slate-400 leading-relaxed">{answer}</p>
      </motion.div>
    </div>
  );
}

// Contact Form component
function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    category: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
          <Send className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">문의가 접수되었습니다</h3>
        <p className="text-slate-400">영업일 기준 24시간 내에 답변 드리겠습니다.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
            이름
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10
                     text-white placeholder-slate-500 focus:outline-none focus:border-primary/50
                     transition-colors"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
            이메일
          </label>
          <input
            type="email"
            id="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10
                     text-white placeholder-slate-500 focus:outline-none focus:border-primary/50
                     transition-colors"
            placeholder="example@company.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-slate-300 mb-2">
          문의 유형
        </label>
        <select
          id="category"
          required
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10
                   text-white focus:outline-none focus:border-primary/50
                   transition-colors appearance-none cursor-pointer"
        >
          <option value="" className="bg-deep-space">선택해 주세요</option>
          <option value="general" className="bg-deep-space">일반 문의</option>
          <option value="technical" className="bg-deep-space">기술 지원</option>
          <option value="billing" className="bg-deep-space">결제 문의</option>
          <option value="enterprise" className="bg-deep-space">Enterprise 문의</option>
          <option value="partnership" className="bg-deep-space">제휴 문의</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
          문의 내용
        </label>
        <textarea
          id="message"
          required
          rows={5}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10
                   text-white placeholder-slate-500 focus:outline-none focus:border-primary/50
                   transition-colors resize-none"
          placeholder="문의 내용을 자세히 작성해 주세요..."
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium
                 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            전송 중...
          </>
        ) : (
          <>
            문의 보내기
            <Send className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}

export default function SupportPage() {
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
                  link.href === "/support"
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
                  link.href === "/support"
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
              어떻게
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-neon-purple to-neon-cyan">
                {" "}도와드릴까요?
              </span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              자주 묻는 질문에서 답을 찾거나, 직접 문의해 주세요.
            </p>
          </motion.div>
        </section>

        {/* Contact Options */}
        <section className="px-6 md:px-8 py-8 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {contactOptions.map((option, index) => (
              <motion.div
                key={option.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30
                              flex items-center justify-center mx-auto mb-3">
                  <option.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-white font-medium mb-1">{option.title}</h3>
                <p className="text-sm text-slate-400 mb-2">{option.description}</p>
                <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {option.detail}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="px-6 md:px-8 py-16 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-4">자주 묻는 질문</h2>
          </motion.div>

          <div className="space-y-8">
            {faqCategories.map((category, categoryIndex) => (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: categoryIndex * 0.1 }}
              >
                <h3 className="text-lg font-semibold text-primary mb-4">{category.title}</h3>
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-6">
                  {category.faqs.map((faq) => (
                    <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="px-6 md:px-8 py-16 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">직접 문의하기</h2>
            <p className="text-slate-400">
              원하는 답을 찾지 못하셨나요? 아래 양식으로 문의해 주세요.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.08]"
          >
            <ContactForm />
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
