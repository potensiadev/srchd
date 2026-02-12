"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  BarChart3,
} from "lucide-react";
import { CORE_FEATURES } from "@/lib/marketing-data";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import SpotlightButton from "@/components/ui/spotlight-button";

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
  return (
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

      {/* Core Features - Bento Grid with Spotlight */}
      <div className="max-w-7xl mx-auto mb-32">
        <BentoGrid className="md:auto-rows-[25rem]">
          {CORE_FEATURES.map((feature, i) => (
            <BentoGridItem
              key={feature.title}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              className={i === 3 || i === 6 ? "md:col-span-2" : ""}
              details={feature.details}
              header={
                <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-100 relative group-hover/bento:border-blue-100 transition-colors items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                  <feature.icon className="h-12 w-12 text-blue-500/20 group-hover/bento:text-blue-500 transition-colors duration-300" />
                </div>
              }
            />
          ))}
        </BentoGrid>
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
              className="flex items-start gap-5 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-blue-100 transition-colors"
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

          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              다음 주 월요일,<br className="md:hidden" /> 이력서 걱정 없이 출근하세요
            </h2>
            <p className="text-blue-100 mb-10 max-w-lg mx-auto text-lg">
              14일 무료 체험. 신용카드 필요 없음.
              <br />
              5분이면 첫 이력서 분석까지 완료됩니다.
            </p>

            <SpotlightButton
              onClick={() => window.location.href = "/signup"}
              className="bg-primary hover:bg-blue-600"
            >
              무료로 시작하기
            </SpotlightButton>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
