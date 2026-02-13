"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  Send,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { FAQ_CATEGORIES } from "@/lib/marketing-data";

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
  return (
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
          {FAQ_CATEGORIES.map((category, categoryIndex) => (
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
  );
}
