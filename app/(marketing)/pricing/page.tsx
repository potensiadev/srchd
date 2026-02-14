"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ArrowRight, X, ShieldCheck } from "lucide-react";
import { PRICING_PLANS } from "@/lib/marketing-data";

const faqs = [
  {
    question: "무료 체험 기간이 있나요?",
    answer:
      "네, 모든 신규 사용자에게 7일간 무료 체험을 제공합니다. 신용카드 없이 바로 시작할 수 있습니다.",
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
  return (
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
            필요한 만큼만 사용하세요.
            <br className="md:hidden" /> 언제든지 업그레이드하거나 취소할 수 있습니다.
          </p>
        </motion.div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto mb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
          {/* Loop through normal plans */}
          {PRICING_PLANS.map((plan, index) => (
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

              <div className="mb-4 pb-8 border-b border-gray-100">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-gray-900">₩{plan.price}</span>
                  <span className="text-gray-500 font-medium">/{plan.period}</span>
                </div>
                {/* Trust Signal */}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 w-fit px-2 py-1 rounded-md">
                  <ShieldCheck className="w-3 h-3" />
                  7일 무료 체험 • 언제든 취소 가능
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

          {/* Enterprise Card - Visualized as 3rd column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col h-full rounded-3xl p-8 bg-slate-900 text-white shadow-xl"
          >
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <p className="text-slate-400 text-sm">대규모 팀과 전사적 도입을 위한 맞춤형 플랜</p>
            </div>

            <div className="mb-8 pb-8 border-b border-slate-700">
              <div className="text-3xl font-bold">별도 협의</div>
              <div className="mt-2 text-sm text-slate-400">맞춤형 견적 제공</div>
            </div>

            <ul className="space-y-4 mb-auto">
              {[
                "모든 Professional 기능 포함",
                "전담 어카운트 매니저 배정",
                "SSO (Single Sign-On) 연동",
                "맞춤형 계약 및 세금계산서",
                "온보딩 세션 지원",
                "SLA (서비스 수준 계약) 보장"
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm text-slate-200">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Link
                href="/support"
                className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition-colors"
              >
                도입 문의하기
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
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
  );
}
