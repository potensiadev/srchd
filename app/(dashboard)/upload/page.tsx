"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import FileUploader from "@/components/upload/FileUploader";

export default function UploadPage() {
  const router = useRouter();
  const [uploadResult, setUploadResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  const handleUploadComplete = (results: { success: number; failed: number }) => {
    setUploadResult(results);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/20 text-primary">
            <Upload size={24} />
          </div>
          <h1 className="text-3xl font-bold text-white">이력서 업로드</h1>
        </div>
        <p className="text-slate-400">
          이력서 파일을 업로드하면 AI가 자동으로 분석하여 후보자 정보를 추출합니다.
        </p>
      </div>

      {/* Upload Result Banner */}
      {uploadResult && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border ${
            uploadResult.failed === 0
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-yellow-500/10 border-yellow-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {uploadResult.failed === 0 ? (
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
              )}
              <div>
                <p className="font-medium text-white">
                  업로드 완료: {uploadResult.success}개 성공
                  {uploadResult.failed > 0 && `, ${uploadResult.failed}개 실패`}
                </p>
                <p className="text-sm text-slate-400">
                  AI 분석이 진행 중입니다. 잠시 후 대시보드에서 확인하세요.
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10
                       hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              대시보드로 이동
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Uploader */}
      <FileUploader onUploadComplete={handleUploadComplete} />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          title="지원 형식"
          description="HWP, HWPX, DOC, DOCX, PDF"
          icon="📄"
        />
        <InfoCard
          title="AI 분석"
          description="2-Way Cross-Check (GPT-4o + Gemini)"
          icon="🤖"
        />
        <InfoCard
          title="개인정보 보호"
          description="AES-256 암호화 + PII 마스킹"
          icon="🔒"
        />
      </div>

      {/* Process Steps */}
      <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">처리 과정</h3>
        <div className="flex items-center justify-between">
          <ProcessStep step={1} label="업로드" description="파일 저장" active />
          <StepArrow />
          <ProcessStep step={2} label="파싱" description="텍스트 추출" />
          <StepArrow />
          <ProcessStep step={3} label="AI 분석" description="Cross-Check" />
          <StepArrow />
          <ProcessStep step={4} label="임베딩" description="벡터 생성" />
          <StepArrow />
          <ProcessStep step={5} label="완료" description="검색 가능" />
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
      <div className="text-2xl mb-2">{icon}</div>
      <h4 className="font-medium text-white">{title}</h4>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  );
}

function ProcessStep({
  step,
  label,
  description,
  active = false,
}: {
  step: number;
  label: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
          active
            ? "bg-primary text-white"
            : "bg-slate-700 text-slate-400"
        }`}
      >
        {step}
      </div>
      <p className="text-sm font-medium text-white mt-2">{label}</p>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

function StepArrow() {
  return (
    <div className="flex-1 h-px bg-slate-700 mx-2 relative top-[-12px]">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-slate-700" />
    </div>
  );
}
