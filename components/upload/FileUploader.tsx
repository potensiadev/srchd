"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderUp,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 지원하는 파일 확장자
const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 30;
const CONCURRENT_UPLOADS = 3;

type FileStatus = "pending" | "uploading" | "success" | "error";

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  candidateId?: string;
}

interface FileUploaderProps {
  onUploadComplete?: (results: { success: number; failed: number }) => void;
}

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 파일 유효성 검사
  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `지원하지 않는 형식입니다. (${ALLOWED_EXTENSIONS.join(", ")})`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return "파일 크기가 50MB를 초과합니다.";
    }
    return null;
  };

  // 파일 추가
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);

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
            progress: 0,
            error,
          } as UploadFile;
        });

      return [...prev, ...filesToAdd];
    });
  }, []);

  // 파일 제거
  const removeFile = useCallback((id: string) => {
    // 업로드 중인 파일이면 취소
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // 모든 파일 제거
  const clearFiles = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    setFiles([]);
  }, []);

  // 단일 파일 업로드
  const uploadFile = async (uploadFile: UploadFile): Promise<boolean> => {
    const controller = new AbortController();
    abortControllersRef.current.set(uploadFile.id, controller);

    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id ? { ...f, status: "uploading", progress: 0 } : f
      )
    );

    try {
      const formData = new FormData();
      formData.append("file", uploadFile.file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "업로드 실패");
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: "success", progress: 100, candidateId: result.candidateId }
            : f
        )
      );

      return true;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return false;
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: "error", error: (error as Error).message }
            : f
        )
      );

      return false;
    } finally {
      abortControllersRef.current.delete(uploadFile.id);
    }
  };

  // 모든 파일 업로드 (병렬)
  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failedCount = 0;

    // 동시 업로드 수 제한
    const chunks: UploadFile[][] = [];
    for (let i = 0; i < pendingFiles.length; i += CONCURRENT_UPLOADS) {
      chunks.push(pendingFiles.slice(i, i + CONCURRENT_UPLOADS));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(uploadFile));
      successCount += results.filter(Boolean).length;
      failedCount += results.filter((r) => !r).length;
    }

    setIsUploading(false);
    onUploadComplete?.({ success: successCount, failed: failedCount });
  };

  // 실패한 파일 재시도
  const retryFailed = useCallback(() => {
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "error" && !validateFile(f.file)
          ? { ...f, status: "pending", error: undefined }
          : f
      )
    );
  }, []);

  // Drag & Drop 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles]
  );

  // 통계
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    uploading: files.filter((f) => f.status === "uploading").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
  };

  const overallProgress =
    stats.total > 0
      ? Math.round(((stats.success + stats.error) / stats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-gray-700 hover:border-gray-600 bg-gray-800/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />

        <motion.div
          animate={{ y: isDragging ? -5 : 0 }}
          className="flex flex-col items-center gap-4"
        >
          <div
            className={cn(
              "p-4 rounded-full transition-colors",
              isDragging ? "bg-primary/20 text-primary" : "bg-gray-700 text-gray-400"
            )}
          >
            {isDragging ? <FolderUp size={40} /> : <Upload size={40} />}
          </div>

          <div>
            <p className="text-lg font-medium text-white">
              {isDragging ? "파일을 여기에 놓으세요" : "이력서 파일을 드래그하거나 클릭하세요"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {ALLOWED_EXTENSIONS.join(", ")} • 최대 50MB • 최대 {MAX_FILES}개
            </p>
          </div>
        </motion.div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-white">
                파일 목록 ({stats.total}/{MAX_FILES})
              </h3>
              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>업로드 중... {overallProgress}%</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {stats.error > 0 && !isUploading && (
                <button
                  onClick={retryFailed}
                  className="px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm
                           hover:bg-yellow-500/20 transition-colors"
                >
                  실패 재시도 ({stats.error})
                </button>
              )}
              <button
                onClick={clearFiles}
                disabled={isUploading}
                className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-sm
                         hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Trash2 size={14} />
                전체 삭제
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {isUploading && (
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">
              대기: <span className="text-white">{stats.pending}</span>
            </span>
            <span className="text-gray-400">
              진행: <span className="text-blue-400">{stats.uploading}</span>
            </span>
            <span className="text-gray-400">
              완료: <span className="text-emerald-400">{stats.success}</span>
            </span>
            {stats.error > 0 && (
              <span className="text-gray-400">
                실패: <span className="text-red-400">{stats.error}</span>
              </span>
            )}
          </div>

          {/* File Items */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            <AnimatePresence mode="popLayout">
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    file.status === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : file.status === "error"
                      ? "bg-red-500/10 border-red-500/30"
                      : file.status === "uploading"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-gray-800/50 border-gray-700"
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      file.status === "success"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : file.status === "error"
                        ? "bg-red-500/20 text-red-400"
                        : file.status === "uploading"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-gray-700 text-gray-400"
                    )}
                  >
                    {file.status === "success" ? (
                      <CheckCircle size={18} />
                    ) : file.status === "error" ? (
                      <AlertCircle size={18} />
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
                    <p className="text-xs text-gray-500">
                      {file.error || (
                        <>
                          {(file.file.size / 1024 / 1024).toFixed(2)} MB
                          {file.candidateId && (
                            <span className="text-emerald-400 ml-2">
                              ID: {file.candidateId.slice(0, 8)}...
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Upload Button */}
          <button
            onClick={uploadAll}
            disabled={isUploading || stats.pending === 0}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2",
              isUploading || stats.pending === 0
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 text-white"
            )}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                업로드 중... ({stats.uploading + stats.success}/{stats.total})
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {stats.pending}개 파일 업로드 시작
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
