"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronDown,
  Mail,
  MessageSquare,
  FileText,
  Clock,
  Menu,
  X,
  Send,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";

// Navigation links
const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
];

const faqCategories = [
  {
    title: "시작하기",
    faqs: [
      {
        question: "서치드는 어떤 서비스인가요?",
        answer:
          "서치드는 AI 기반 이력서 분석 플랫폼입니다. 헤드헌터와 HR 담당자를 위해 이력서를 자동으로 분석하고, 후보자를 검색하며, 데이터를 안전하게 관리할 수 있습니다.",
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
          "네, 서치드는 GDPR과 개인정보보호법(PIPA)을 준수합니다. 데이터 삭제 요청, 접근 권한 관리, 처리 동의 등을 지원합니다.",
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
          "결제일로부터 14일 이내 전액 환불이 가능합니다. 14일이 경과한 후에는 환불이 불가하며, 구독은 현재 결제 주기 종료 시까지 유지됩니다. 자세한 내용은 이용약관을 참조해 주세요.",
      },
    ],
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-5 text-left group"
      >
        <span className={`font-medium pr-4 transition-colors ${isOpen ? 'text-primary' : 'text-gray-900 group-hover:text-primary'}`}>
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className={`w-5 h-5 ${isOpen ? 'text-primary' : 'text-gray-400'}`} />
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
        <p className="pb-5 text-sm text-gray-600 leading-relaxed">{answer}</p>
      </motion.div>
    </div>
  );
}

function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    category: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "name":
        if (!value.trim()) return "이름을 입력해주세요";
        if (value.length < 2) return "이름은 2자 이상 입력해주세요";
        return "";
      case "email":
        if (!value.trim()) return "이메일을 입력해주세요";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return "올바른 이메일 형식을 입력해주세요";
        return "";
      case "category":
        if (!value) return "문의 유형을 선택해주세요";
        return "";
      case "message":
        if (!value.trim()) return "문의 내용을 입력해주세요";
        if (value.length < 10) return "문의 내용은 10자 이상 입력해주세요";
        return "";
      default:
        return "";
    }
  };

  const handleBlur = (name: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, formData[name as keyof typeof formData]);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    (Object.keys(formData) as Array<keyof typeof formData>).forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched({ name: true, email: true, category: true, message: true });
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateAll()) return;

    setIsSubmitting(true);
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
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
          <Send className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">문의가 접수되었습니다</h3>
        <p className="text-gray-500">영업일 기준 24시간 내에 답변 드리겠습니다.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
            이름 <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            className={`w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-4 transition-all
                     ${errors.name && touched.name
                       ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                       : "border-gray-200 focus:border-primary focus:ring-primary/10"}`}
            placeholder="홍길동"
            aria-invalid={!!(errors.name && touched.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name && touched.name && (
            <div id="name-error" className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span className="text-sm text-rose-600">{errors.name}</span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
            이메일 <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            onBlur={() => handleBlur("email")}
            className={`w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-4 transition-all
                     ${errors.email && touched.email
                       ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                       : "border-gray-200 focus:border-primary focus:ring-primary/10"}`}
            placeholder="example@company.com"
            aria-invalid={!!(errors.email && touched.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && touched.email && (
            <div id="email-error" className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span className="text-sm text-rose-600">{errors.email}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-2">
          문의 유형 <span className="text-rose-500">*</span>
        </label>
        <select
          id="category"
          value={formData.category}
          onChange={(e) => handleChange("category", e.target.value)}
          onBlur={() => handleBlur("category")}
          className={`w-full px-4 py-3 rounded-xl bg-white border text-gray-900
                   focus:outline-none focus:ring-4 transition-all appearance-none cursor-pointer
                   ${errors.category && touched.category
                     ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                     : "border-gray-200 focus:border-primary focus:ring-primary/10"}`}
          aria-invalid={!!(errors.category && touched.category)}
          aria-describedby={errors.category ? "category-error" : undefined}
        >
          <option value="" className="text-gray-500">선택해 주세요</option>
          <option value="general">일반 문의</option>
          <option value="technical">기술 지원</option>
          <option value="billing">결제 문의</option>
          <option value="enterprise">Enterprise 문의</option>
          <option value="partnership">제휴 문의</option>
        </select>
        {errors.category && touched.category && (
          <div id="category-error" className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="text-sm text-rose-600">{errors.category}</span>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2">
          문의 내용 <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="message"
          rows={5}
          value={formData.message}
          onChange={(e) => handleChange("message", e.target.value)}
          onBlur={() => handleBlur("message")}
          className={`w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder-gray-400
                   focus:outline-none focus:ring-4 transition-all resize-none
                   ${errors.message && touched.message
                     ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                     : "border-gray-200 focus:border-primary focus:ring-primary/10"}`}
          placeholder="문의 내용을 자세히 작성해 주세요..."
          aria-invalid={!!(errors.message && touched.message)}
          aria-describedby={errors.message ? "message-error" : undefined}
        />
        {errors.message && touched.message && (
          <div id="message-error" className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="text-sm text-rose-600">{errors.message}</span>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 rounded-xl bg-primary hover:bg-blue-600 text-white font-semibold
                 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
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
                className={`text-sm font-medium transition-colors ${link.href === "/support"
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
        <div className="max-w-4xl mx-auto text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
              어떻게 <span className="text-primary">도와드릴까요?</span>
            </h1>
          </motion.div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-2">자주 묻는 질문</h2>
            <p className="text-gray-500">궁금한 점을 빠르게 해결하세요</p>
          </motion.div>

          <div className="space-y-12">
            {faqCategories.map((category, categoryIndex) => (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: categoryIndex * 0.1 }}
              >
                <h3 className="text-lg font-bold text-primary mb-6 px-2 border-l-4 border-primary pl-4">{category.title}</h3>
                <div className="rounded-3xl bg-white border border-gray-100 p-2 shadow-sm">
                  {category.faqs.map((faq) => (
                    <div key={faq.question} className="px-6">
                      <FAQItem question={faq.question} answer={faq.answer} />
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Contact Form Section */}
        <div className="max-w-2xl mx-auto mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">직접 문의하기</h2>
            <p className="text-gray-500">
              원하는 답을 찾지 못하셨나요? 아래 양식으로 문의해 주세요.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 md:p-10 rounded-3xl bg-white border border-gray-100 shadow-xl shadow-gray-100/50"
          >
            <ContactForm />
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
