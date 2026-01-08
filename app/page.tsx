"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Shield,
  Zap,
  Brain,
  ArrowRight,
  Users,
  FileSearch,
  Lock,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import DeepSpaceBackground from "@/components/layout/DeepSpaceBackground";

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
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

// Floating orb component
function FloatingOrb({ delay = 0, size = 200, color = "primary" }: { delay?: number; size?: number; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.5, delay }}
      className="absolute pointer-events-none"
      style={{
        width: size,
        height: size,
      }}
    >
      <motion.div
        animate={{
          y: [-20, 20, -20],
          x: [-10, 10, -10],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`w-full h-full rounded-full blur-3xl ${
          color === "primary" ? "bg-primary/20" : "bg-neon-cyan/15"
        }`}
      />
    </motion.div>
  );
}

// Feature card component
function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      variants={fadeInUp}
      custom={index * 0.1}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group"
    >
      <motion.div
        animate={{
          scale: isHovered ? 1.02 : 1,
          y: isHovered ? -5 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="relative p-6 rounded-2xl bg-white/[0.03] backdrop-blur-xl
                   border border-white/[0.08] overflow-hidden h-full"
      >
        {/* Glow effect */}
        <motion.div
          animate={{
            opacity: isHovered ? 1 : 0,
          }}
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-neon-cyan/10"
        />

        {/* Icon */}
        <motion.div
          animate={{
            scale: isHovered ? 1.1 : 1,
            rotate: isHovered ? 5 : 0,
          }}
          className="relative w-12 h-12 rounded-xl bg-primary/20 border border-primary/30
                     flex items-center justify-center mb-4"
        >
          <Icon className="w-6 h-6 text-primary" />
        </motion.div>

        {/* Content */}
        <h3 className="relative text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="relative text-sm text-slate-400 leading-relaxed">{description}</p>

        {/* Bottom accent */}
        <motion.div
          animate={{
            scaleX: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-neon-purple to-neon-cyan origin-left"
        />
      </motion.div>
    </motion.div>
  );
}

// Stats component
function StatItem({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="text-center"
    >
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </motion.div>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    setMounted(true);

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      mouseX.set((clientX - innerWidth / 2) / 50);
      mouseY.set((clientY - innerHeight / 2) / 50);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const features = [
    {
      icon: Brain,
      title: "2-Way AI Cross-Check",
      description: "자체 AI엔진으로 99.2% 정확도의 이력서 분석을 제공합니다.",
    },
    {
      icon: Shield,
      title: "Privacy Shield",
      description: "AES-256 암호화와 PII 마스킹으로 후보자의 개인정보를 안전하게 보호합니다.",
    },
    {
      icon: Zap,
      title: "30초 분석",
      description: "PDF, HWP, DOCX 형식의 이력서를 30초 이내에 구조화된 데이터로 변환합니다.",
    },
    {
      icon: FileSearch,
      title: "시맨틱 검색",
      description: "벡터 임베딩 기반 검색으로 키워드가 아닌 의미로 최적의 후보자를 찾습니다.",
    },
    {
      icon: Users,
      title: "중복 감지",
      description: "동일 후보자의 다른 버전 이력서를 자동으로 감지하고 버전 관리합니다.",
    },
    {
      icon: Lock,
      title: "블라인드 내보내기",
      description: "개인 식별 정보를 제거한 블라인드 이력서를 PDF로 즉시 생성합니다.",
    },
  ];

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <DeepSpaceBackground />

      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%]">
          <FloatingOrb delay={0.2} size={300} color="primary" />
        </div>
        <div className="absolute top-40 right-[15%]">
          <FloatingOrb delay={0.5} size={200} color="cyan" />
        </div>
        <div className="absolute bottom-40 left-[20%]">
          <FloatingOrb delay={0.8} size={250} color="cyan" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-white">RAI</span>
          </div>

          <div className="flex items-center gap-4">
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
        </motion.nav>

        {/* Hero Section */}
        <section className="relative px-8 pt-20 pb-32 max-w-7xl mx-auto">
          <motion.div
            style={{ x: springX, y: springY }}
            className="text-center"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                       bg-primary/10 border border-primary/20 mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-primary font-medium">Closed Beta</span>
            </motion.div>

            {/* Main heading */}
            <motion.h1
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            >
              Recruitment
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-neon-purple to-neon-cyan">
                Asset Intelligence
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              custom={0.1}
              className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              AI 기반 이력서 분석 플랫폼으로
              <br />
              헤드헌터의 업무 효율을 극대화하세요
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              custom={0.2}
              className="flex items-center justify-center gap-4"
            >
              <Link
                href="/signup"
                className="group flex items-center gap-2 px-8 py-4 rounded-xl
                         bg-primary hover:bg-primary/90 text-white font-semibold
                         transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40"
              >
                무료로 시작하기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 px-8 py-4 rounded-xl
                         bg-white/5 hover:bg-white/10 border border-white/10
                         text-white font-semibold transition-all"
              >
                데모 보기
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex items-center justify-center gap-12 mt-16 pt-16 border-t border-white/5"
            >
              <StatItem value="99.2%" label="분석 정확도" delay={0.7} />
              <StatItem value="30초" label="평균 처리 시간" delay={0.8} />
              <StatItem value="2-Way" label="AI Cross-Check" delay={0.9} />
            </motion.div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="relative px-8 py-24 max-w-7xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-white mb-4">
              왜 RAI인가요?
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              최신 AI 기술과 보안 아키텍처로 채용 프로세스를 혁신합니다
            </p>
          </motion.div>

          {/* Feature grid */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} {...feature} index={index} />
            ))}
          </motion.div>
        </section>

        {/* CTA Section */}
        <section className="relative px-8 py-24 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent
                       border border-primary/20 text-center overflow-hidden"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <h2 className="text-3xl font-bold text-white mb-4">
                지금 바로 시작하세요
              </h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">
                Closed Beta 기간 동안 무료로 모든 기능을 체험해보세요.
                <br />
                월 100건의 이력서 분석이 제공됩니다.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/signup"
                  className="group flex items-center gap-2 px-8 py-4 rounded-xl
                           bg-white text-deep-space font-semibold
                           hover:bg-white/90 transition-all"
                >
                  무료 체험 시작
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center justify-center gap-6 mt-8 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>신용카드 불필요</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>즉시 시작</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>언제든 취소 가능</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="relative px-8 py-12 border-t border-white/5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-slate-500">
                © 2025 RAI. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="#" className="hover:text-white transition-colors">
                이용약관
              </Link>
              <Link href="#" className="hover:text-white transition-colors">
                개인정보처리방침
              </Link>
              <Link href="#" className="hover:text-white transition-colors">
                문의하기
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
