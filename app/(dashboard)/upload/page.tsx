"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, AlertTriangle, ArrowRight, X, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import GravityDropZone from "@/components/upload/GravityDropZone";
import ProcessingVisualization, { ProcessingPhase } from "@/components/upload/ProcessingVisualization";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 30;

type FileStatus = "pending" | "uploading" | "processing" | "success" | "error";

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  phase: ProcessingPhase;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeProcessingFile, setActiveProcessingFile] = useState<UploadFile | null>(null);

  // 파일 유효성 검사
  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `지원하지 않는 형식입니다.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return "파일 크기가 50MB를 초과합니다.";
    }
    return null;
  };

  // 파일 추가
  const handleFilesDropped = useCallback((droppedFiles: FileList) => {
    const fileArray = Array.from(droppedFiles);

    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.file.name));
      const remaining = MAX_FILES - prev.length;

      const filesToAdd = fileArray
        .filter((file) => !existingNames.has(file.name))
        .slice(0, remaining)
        .map((file) => {
          const error = validateFile(file);
          return {
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            status: error ? "error" : "pending",
            phase: "idle" as ProcessingPhase,
            error,
          } as UploadFile;
        });

      return [...prev, ...filesToAdd];
    });
  }, []);

  // 파일 제거
  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // 단일 파일 업로드
  const uploadFile = async (uploadFile: UploadFile): Promise<boolean> => {
    // 상태 업데이트: uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id ? { ...f, status: "uploading", phase: "uploading" } : f
      )
    );
    setActiveProcessingFile({ ...uploadFile, phase: "routing" });

    try {
      const formData = new FormData();
      formData.append("file", uploadFile.file);

      // Phase 시뮬레이션 (실제로는 서버에서 SSE로 받아야 함)
      const phases: ProcessingPhase[] = ["routing", "analyzing", "extracting", "embedding"];

      for (const phase of phases) {
        setActiveProcessingFile((prev) => prev ? { ...prev, phase } : null);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, phase } : f
          )
        );
        await new Promise((r) => setTimeout(r, 800)); // 시뮬레이션 딜레이
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "업로드 실패");
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "success", phase: "complete" } : f
        )
      );
      setActiveProcessingFile((prev) => prev ? { ...prev, phase: "complete" } : null);

      return true;
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: "error", error: (error as Error).message }
            : f
        )
      );
      return false;
    }
  };

  // 모든 파일 업로드
  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    for (const file of pendingFiles) {
      await uploadFile(file);
      await new Promise((r) => setTimeout(r, 500)); // 파일 간 딜레이
    }

    setIsUploading(false);
    setActiveProcessingFile(null);
  };

  // 통계
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
  };

  const hasFiles = files.length > 0;
  const allComplete = stats.pending === 0 && stats.total > 0;

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

      {/* Success Banner */}
      <AnimatePresence>
        {allComplete && stats.success > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "p-4 rounded-xl border",
              stats.error === 0
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-yellow-500/10 border-yellow-500/30"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {stats.error === 0 ? (
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                )}
                <div>
                  <p className="font-medium text-white">
                    업로드 완료: {stats.success}개 성공
                    {stats.error > 0 && `, ${stats.error}개 실패`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push("/candidates")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10
                         hover:bg-white/20 text-white text-sm font-medium transition-colors"
              >
                후보자 목록으로 이동
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Processing Visualization */}
      <AnimatePresence>
        {activeProcessingFile && activeProcessingFile.phase !== "idle" && (
          <ProcessingVisualization
            phase={activeProcessingFile.phase}
            fileName={activeProcessingFile.file.name}
          />
        )}
      </AnimatePresence>

      {/* Gravity Drop Zone */}
      {!isUploading && (
        <GravityDropZone
          onFilesDropped={handleFilesDropped}
          accept={ALLOWED_EXTENSIONS.join(",")}
          maxFiles={MAX_FILES}
          disabled={isUploading}
        />
      )}

      {/* File List */}
      <AnimatePresence>
        {hasFiles && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                파일 목록 ({stats.total}/{MAX_FILES})
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">
                  대기: <span className="text-white">{stats.pending}</span>
                </span>
                <span className="text-slate-400">
                  완료: <span className="text-emerald-400">{stats.success}</span>
                </span>
                {stats.error > 0 && (
                  <span className="text-slate-400">
                    실패: <span className="text-red-400">{stats.error}</span>
                  </span>
                )}
              </div>
            </div>

            {/* File Items */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    file.status === "success" && "bg-emerald-500/10 border-emerald-500/30",
                    file.status === "error" && "bg-red-500/10 border-red-500/30",
                    file.status === "uploading" && "bg-blue-500/10 border-blue-500/30",
                    file.status === "pending" && "bg-slate-800/50 border-slate-700"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "p-2 rounded-lg",
                    file.status === "success" && "bg-emerald-500/20 text-emerald-400",
                    file.status === "error" && "bg-red-500/20 text-red-400",
                    file.status === "uploading" && "bg-blue-500/20 text-blue-400",
                    file.status === "pending" && "bg-slate-700 text-slate-400"
                  )}>
                    {file.status === "success" ? (
                      <CheckCircle size={18} />
                    ) : file.status === "uploading" ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {file.file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {file.error || `${(file.file.size / 1024 / 1024).toFixed(2)} MB`}
                    </p>
                  </div>

                  {/* Remove */}
                  {file.status !== "uploading" && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Upload Button */}
            {stats.pending > 0 && (
              <button
                onClick={uploadAll}
                disabled={isUploading}
                className={cn(
                  "w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2",
                  isUploading
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 text-white"
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    {stats.pending}개 파일 업로드 시작
                  </>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
