"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  X,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import GravityDropZone from "@/components/upload/GravityDropZone";
import ProcessingVisualization, { ProcessingPhase } from "@/components/upload/ProcessingVisualization";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 30;

type FileStatus = "pending" | "uploading" | "processing" | "success" | "error";

interface QuickExtractedData {
  name?: string;
  phone?: string;
  email?: string;
}

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  phase: ProcessingPhase;
  error?: string;
  jobId?: string;
  candidateId?: string;
  storagePath?: string;
  // Option C: 파싱 완료 후 빠른 추출 데이터
  quickExtracted?: QuickExtractedData;
}

interface ResumeUploadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ResumeUploadDrawer({ isOpen, onClose }: ResumeUploadDrawerProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeProcessingFile, setActiveProcessingFile] = useState<UploadFile | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRef = useRef(false);

  // 파일 유효성 검사
  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `지원하지 않는 파일 형식입니다. HWP, HWPX, DOC, DOCX, PDF 파일만 업로드할 수 있습니다.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return "파일 크기가 50MB를 초과합니다. 더 작은 파일을 선택해주세요.";
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

  // 실패한 파일 재시도
  const retryFile = async (id: string) => {
    const fileToRetry = files.find((f) => f.id === id);
    if (!fileToRetry || fileToRetry.status !== "error") return;

    cancelRef.current = false;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "pending" as FileStatus, error: undefined, phase: "idle" as ProcessingPhase, jobId: undefined, candidateId: undefined, storagePath: undefined } : f
      )
    );

    setIsUploading(true);
    await uploadSingleFile({ ...fileToRetry, status: "pending", error: undefined, phase: "idle" as ProcessingPhase, jobId: undefined, candidateId: undefined, storagePath: undefined });
    setIsUploading(false);
    setActiveProcessingFile(null);
  };

  // 실패한 모든 파일 재시도
  const retryAllFailed = async () => {
    const failedFiles = files.filter((f) => f.status === "error");
    if (failedFiles.length === 0) return;

    cancelRef.current = false;
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "error" ? { ...f, status: "pending" as FileStatus, error: undefined, phase: "idle" as ProcessingPhase, jobId: undefined, candidateId: undefined, storagePath: undefined } : f
      )
    );

    setIsUploading(true);
    for (const file of failedFiles) {
      if (cancelRef.current) break;
      await uploadSingleFile({ ...file, status: "pending", error: undefined, phase: "idle" as ProcessingPhase, jobId: undefined, candidateId: undefined, storagePath: undefined });
      await new Promise((r) => setTimeout(r, 500));
    }
    setIsUploading(false);
    setActiveProcessingFile(null);
  };

  // 단일 파일 업로드
  const uploadSingleFile = async (uploadFile: UploadFile): Promise<boolean> => {
    // 취소 확인
    if (cancelRef.current) {
      return false;
    }

    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id ? { ...f, status: "uploading", phase: "uploading" } : f
      )
    );
    setActiveProcessingFile({ ...uploadFile, phase: "routing" });

    let presign: { storagePath?: string; jobId?: string; candidateId?: string; userId?: string; plan?: string } | null = null;

    try {
      // Phase 1: Presign
      setActiveProcessingFile((prev) => prev ? { ...prev, phase: "routing" } : null);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, phase: "routing" } : f
        )
      );

      // 취소 확인
      if (cancelRef.current) return false;

      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadFile.file.name,
          fileSize: uploadFile.file.size,
          fileType: uploadFile.file.type,
        }),
      });

      const contentType = presignRes.headers.get("content-type");
      let presignData;
      if (contentType && contentType.includes("application/json")) {
        presignData = await presignRes.json();
      } else {
        const text = await presignRes.text();
        throw new Error(text || "서버 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }

      if (!presignRes.ok || !presignData.success) {
        const serverError = presignData.error?.message || presignData.error || "";
        const userFriendlyErrors: Record<string, string> = {
          "크레딧이 부족합니다": "이번 달 업로드 가능 횟수를 모두 사용했습니다. 다음 달에 다시 시도하거나 플랜을 업그레이드해주세요.",
          "사용자를 찾을 수 없습니다": "로그인 세션이 만료되었습니다. 다시 로그인해주세요.",
        };
        throw new Error(userFriendlyErrors[serverError] || serverError || "업로드 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }

      presign = presignData.data;
      if (!presign?.storagePath || !presign?.jobId) {
        throw new Error("서버 응답에 문제가 있습니다. 페이지를 새로고침하고 다시 시도해주세요.");
      }

      // 파일에 jobId, candidateId, storagePath 저장 (취소 시 정리용)
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? {
            ...f,
            jobId: presign?.jobId,
            candidateId: presign?.candidateId,
            storagePath: presign?.storagePath
          } : f
        )
      );

      // 취소 확인
      if (cancelRef.current) return false;

      // Phase 2: Direct Storage Upload
      setActiveProcessingFile((prev) => prev ? { ...prev, phase: "uploading" } : null);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, phase: "uploading" } : f
        )
      );

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Storage RLS가 인증을 확인하므로 클라이언트 측 user 체크 불필요
      // Presign API에서 이미 서버 측 인증 완료됨

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(presign.storagePath, uploadFile.file, {
          contentType: uploadFile.file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        const storageErrorMap: Record<string, string> = {
          "The resource already exists": "동일한 파일이 이미 업로드되어 있습니다.",
          "Payload too large": "파일이 너무 큽니다. 50MB 이하의 파일을 선택해주세요.",
          "Invalid JWT": "로그인 세션이 만료되었습니다. 다시 로그인해주세요.",
          "access denied": "파일 접근 권한이 없습니다. 다시 로그인해주세요.",
          "row-level security": "접근 권한이 없습니다. 다시 로그인해주세요.",
          "permission denied": "파일 업로드 권한이 없습니다. 다시 로그인해주세요.",
        };

        const friendlyMessage = Object.entries(storageErrorMap).find(
          ([key]) => uploadError.message.toLowerCase().includes(key.toLowerCase())
        )?.[1];

        if (friendlyMessage) {
          throw new Error(friendlyMessage);
        } else {
          throw new Error(`파일 업로드에 실패했어요: ${uploadError.message || "알 수 없는 오류"}`);
        }
      }

      // 취소 확인
      if (cancelRef.current) return false;

      // Phase 3: Confirm
      setActiveProcessingFile((prev) => prev ? { ...prev, phase: "analyzing" } : null);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, phase: "analyzing" } : f
        )
      );

      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: presign.jobId,
          candidateId: presign.candidateId,
          storagePath: presign.storagePath,
          fileName: uploadFile.file.name,
          userId: presign.userId,
          plan: presign.plan,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || !confirmData.success) {
        const serverError = confirmData.error?.message || confirmData.error || "";
        const confirmErrorMap: Record<string, string> = {
          "파일 시그니처가 유효하지 않습니다": "파일 형식이 올바르지 않습니다. 파일이 손상되었거나 확장자가 변경되었을 수 있습니다.",
          "파일 검증에 실패했습니다": "파일을 검증할 수 없습니다. 파일이 손상되었을 수 있습니다.",
          "비밀번호로 보호된 파일입니다": "비밀번호로 보호된 파일입니다. 비밀번호를 해제한 후 다시 업로드해주세요.",
          "텍스트를 충분히 추출할 수 없습니다": "파일에서 텍스트를 추출할 수 없습니다. 스캔 이미지이거나 내용이 너무 짧을 수 있습니다.",
        };
        const friendlyMessage = Object.entries(confirmErrorMap).find(
          ([key]) => serverError.includes(key)
        )?.[1];
        throw new Error(friendlyMessage || serverError || "파일 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      }

      // Option C: 파싱 완료 - quick_extracted 데이터 저장
      const quickExtracted = confirmData.data?.quick_extracted as QuickExtractedData | undefined;

      // 완료 (파싱은 완료, 분석은 백그라운드에서 진행 중)
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? {
            ...f,
            status: "success",
            phase: "complete",
            quickExtracted,
          } : f
        )
      );
      setActiveProcessingFile((prev) => prev ? { ...prev, phase: "complete" } : null);

      return true;
    } catch (error) {
      if (presign?.jobId) {
        try {
          await fetch("/api/upload/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: presign.jobId,
              candidateId: presign.candidateId,
              storagePath: presign.storagePath,
            }),
          });
        } catch {
          // 정리 실패는 무시
        }
      }

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

    cancelRef.current = false;
    setIsUploading(true);

    for (const file of pendingFiles) {
      if (cancelRef.current) break;
      await uploadSingleFile(file);
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsUploading(false);
    setActiveProcessingFile(null);
  };

  // 업로드 취소 및 DB 정리
  const handleCancel = async () => {
    setIsCancelling(true);
    cancelRef.current = true;

    // 업로드 중이거나 처리 중인 파일들의 데이터 정리
    const filesToCleanup = files.filter(
      (f) => (f.status === "uploading" || f.status === "processing") && f.jobId
    );

    for (const file of filesToCleanup) {
      try {
        await fetch("/api/upload/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: file.jobId,
            candidateId: file.candidateId,
            storagePath: file.storagePath,
          }),
        });
      } catch {
        // 정리 실패는 무시
      }
    }

    // 상태 초기화
    setFiles([]);
    setActiveProcessingFile(null);
    setIsUploading(false);
    setIsCancelling(false);
    onClose();
  };

  // 드로어 닫기 (파일 초기화)
  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setActiveProcessingFile(null);
      onClose();
    }
  };

  // 통계
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    uploading: files.filter((f) => f.status === "uploading" || f.status === "processing").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
  };

  const hasFiles = files.length > 0;
  const allComplete = stats.pending === 0 && stats.uploading === 0 && stats.total > 0;
  const progressPercent = stats.total > 0 ? Math.round(((stats.success + stats.error) / stats.total) * 100) : 0;

  // 업로드 완료 시 자동으로 드로어 닫기
  useEffect(() => {
    if (allComplete && stats.success > 0 && !isUploading) {
      const timer = setTimeout(() => {
        setFiles([]);
        setActiveProcessingFile(null);
        onClose();
      }, 1500); // 1.5초 후 자동 닫기
      return () => clearTimeout(timer);
    }
  }, [allComplete, stats.success, isUploading, onClose]);

  // 파일별 상태 메시지
  const getFileStatusText = (file: UploadFile): string => {
    if (file.status === "error") return file.error || "업로드 실패";
    if (file.status === "success") return "완료";
    if (file.status === "pending") return "대기 중";

    switch (file.phase) {
      case "routing": return "문서 확인 중...";
      case "uploading": return "업로드 중...";
      case "analyzing": return "AI 분석 중...";
      case "extracting": return "정보 추출 중...";
      case "embedding": return "검색 최적화 중...";
      case "complete": return "완료";
      default: return "처리 중...";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">이력서 업로드</h2>
                  <p className="text-sm text-gray-500">AI가 자동으로 분석합니다</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isUploading}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  isUploading
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                )}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                        ? "bg-emerald-50 border-emerald-100"
                        : "bg-yellow-50 border-yellow-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {stats.error === 0 ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      )}
                      <p className="font-medium text-gray-900">
                        업로드 완료: {stats.success}개 성공
                        {stats.error > 0 && `, ${stats.error}개 실패`}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Progress Bar with Estimated Time */}
              <AnimatePresence>
                {isUploading && stats.total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-primary animate-pulse" />
                        <span className="text-sm font-medium text-gray-900">처리 중</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {stats.success + stats.error}/{stats.total}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full bg-primary rounded-full"
                      />
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

              {/* Drop Zone */}
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">
                        파일 목록 ({stats.total}/{MAX_FILES})
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">
                          대기: <span className="text-gray-900">{stats.pending}</span>
                        </span>
                        <span className="text-gray-500">
                          완료: <span className="text-emerald-600">{stats.success}</span>
                        </span>
                        {stats.error > 0 && (
                          <span className="text-gray-500">
                            실패: <span className="text-red-500">{stats.error}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2">
                      {files.map((file) => (
                        <motion.div
                          key={file.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                            file.status === "success" && "bg-emerald-50/50 border-emerald-200",
                            file.status === "error" && "bg-red-50/50 border-red-200",
                            file.status === "uploading" && "bg-blue-50/30 border-blue-200",
                            file.status === "pending" && "bg-white border-gray-100"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            file.status === "success" && "bg-emerald-100 text-emerald-600",
                            file.status === "error" && "bg-red-100 text-red-600",
                            file.status === "uploading" && "bg-blue-100 text-blue-600",
                            file.status === "pending" && "bg-gray-100 text-gray-500"
                          )}>
                            {file.status === "success" ? (
                              <CheckCircle size={16} />
                            ) : file.status === "error" ? (
                              <XCircle size={16} />
                            ) : file.status === "uploading" ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <FileText size={16} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.file.name}
                            </p>
                            <p className={cn(
                              "text-xs",
                              file.status === "error" ? "text-red-500" : "text-gray-500"
                            )}>
                              {getFileStatusText(file)}
                            </p>
                            {/* Option C: 파싱 완료 시 quick_extracted 표시 */}
                            {file.status === "success" && file.quickExtracted?.name && (
                              <p className="text-xs text-emerald-600 mt-0.5 truncate">
                                {file.quickExtracted.name}
                                {file.quickExtracted.phone && ` · ${file.quickExtracted.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')}`}
                              </p>
                            )}
                          </div>

                          {file.status === "error" && !isUploading && (
                            <button
                              onClick={() => retryFile(file.id)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors shrink-0"
                              title="재시도"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}

                          {file.status !== "uploading" && !isUploading && (
                            <button
                              onClick={() => removeFile(file.id)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info Cards - 업로드 전에만 표시 */}
              {!isUploading && !hasFiles && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-sm text-gray-600 text-center">
                    <span className="font-medium">HWP, DOCX, PDF</span> 파일을 업로드하면
                    <br />
                    AI가 자동으로 분석하여 후보자를 등록합니다.
                  </p>
                </div>
              )}
            </div>

            {/* Footer - Action Buttons */}
            {hasFiles && (
              <div className="p-6 border-t border-gray-100 space-y-3">
                {/* 업로드 중 - 취소 버튼 */}
                {isUploading && (
                  <button
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className={cn(
                      "w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors",
                      isCancelling
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-100"
                    )}
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        취소 중...
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        업로드 취소
                      </>
                    )}
                  </button>
                )}

                {/* 실패 파일 재시도 버튼 */}
                {stats.error > 0 && stats.pending === 0 && !isUploading && (
                  <button
                    onClick={retryAllFailed}
                    className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2
                             bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    실패 {stats.error}개 재시도
                  </button>
                )}

                {/* 업로드 시작 버튼 */}
                {stats.pending > 0 && !isUploading && (
                  <button
                    onClick={uploadAll}
                    className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors bg-primary hover:bg-primary/90 text-white"
                  >
                    <Upload className="w-4 h-4" />
                    {stats.pending}개 파일 업로드
                  </button>
                )}

                {/* 완료 후 닫기 버튼 */}
                {allComplete && stats.success > 0 && (
                  <button
                    onClick={handleClose}
                    className="w-full py-3 rounded-xl font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    완료
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
