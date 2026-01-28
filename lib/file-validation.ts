/**
 * File Validation Utilities
 *
 * 파일 업로드 보안을 위한 검증 로직
 * - 확장자 검증
 * - 매직 바이트 검증 (파일 시그니처)
 * - 파일 크기 검증
 */

import { PLANS, type PlanType } from "@/types/auth";

// ─────────────────────────────────────────────────
// 설정 상수
// ─────────────────────────────────────────────────

export const FILE_CONFIG = {
  ALLOWED_EXTENSIONS: [".hwp", ".hwpx", ".doc", ".docx", ".pdf"] as const,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB (이력서에 충분한 크기)
  MIN_FILE_SIZE: 1024, // 1KB (빈 파일 방지)
} as const;

// PLANS에서 파생된 플랜 설정 (단일 소스)
export const PLAN_CONFIG = {
  BASE_CREDITS: Object.fromEntries(
    Object.entries(PLANS).map(([plan, config]) => [plan, config.baseCredits])
  ) as Record<PlanType, number>,
  EXPORT_LIMITS: Object.fromEntries(
    Object.entries(PLANS).map(([plan, config]) => [plan, config.blindExportLimit])
  ) as Record<PlanType, number>,
} as const;

// ─────────────────────────────────────────────────
// 매직 바이트 정의
// ─────────────────────────────────────────────────

/**
 * 파일 형식별 매직 바이트 (시그니처)
 *
 * PDF: %PDF (0x25 0x50 0x44 0x46)
 * DOCX/HWPX: PK (ZIP 형식, 0x50 0x4B 0x03 0x04)
 * DOC/HWP: OLE 형식 (0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1)
 */
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
  // PDF 파일
  ".pdf": [
    { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],

  // DOCX 파일 (ZIP/OOXML 형식)
  ".docx": [
    { bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK.. (ZIP)
    { bytes: [0x50, 0x4B, 0x05, 0x06] }, // PK.. (Empty ZIP)
    { bytes: [0x50, 0x4B, 0x07, 0x08] }, // PK.. (Spanned ZIP)
  ],

  // DOC 파일 (OLE 형식)
  ".doc": [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }, // OLE Compound Document
  ],

  // HWP 파일 (OLE 형식 - HWP 5.0 이상)
  ".hwp": [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }, // OLE Compound Document
  ],

  // HWPX 파일 (ZIP/OOXML 형식 - HWP 2014 이상)
  ".hwpx": [
    { bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK.. (ZIP)
    { bytes: [0x50, 0x4B, 0x05, 0x06] }, // PK.. (Empty ZIP)
    { bytes: [0x50, 0x4B, 0x07, 0x08] }, // PK.. (Spanned ZIP)
  ],
};

// ─────────────────────────────────────────────────
// 검증 결과 타입
// ─────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  extension?: string;
}

// ─────────────────────────────────────────────────
// 확장자 검증
// ─────────────────────────────────────────────────

/**
 * 파일 확장자 검증
 * 이중 확장자 공격 방지 (예: file.hwp.exe)
 */
export function validateExtension(fileName: string): FileValidationResult {
  if (!fileName || typeof fileName !== "string") {
    return { valid: false, error: "파일명이 올바르지 않습니다. 파일을 다시 선택해주세요." };
  }

  // 파일명 정규화 (공백 제거, 소문자 변환)
  const normalizedName = fileName.trim().toLowerCase();

  // 파일명에서 모든 확장자 추출 (이중 확장자 탐지)
  const parts = normalizedName.split(".");

  if (parts.length < 2) {
    return { valid: false, error: "파일 확장자가 없습니다. HWP, HWPX, DOC, DOCX, PDF 형식의 파일을 선택해주세요." };
  }

  // 마지막 확장자
  const lastExt = "." + parts[parts.length - 1];

  // 허용된 확장자인지 확인
  if (!FILE_CONFIG.ALLOWED_EXTENSIONS.includes(lastExt as typeof FILE_CONFIG.ALLOWED_EXTENSIONS[number])) {
    return {
      valid: false,
      error: `지원하지 않는 파일 형식입니다. HWP, HWPX, DOC, DOCX, PDF 파일만 업로드할 수 있습니다.`,
    };
  }

  // 이중 확장자 탐지 (예: file.hwp.exe, file.pdf.js)
  // 실행 가능한 확장자가 포함되어 있으면 거부
  const dangerousExtensions = [
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".js", ".vbs", ".wsf", ".wsh", ".ps1", ".jar",
    ".php", ".asp", ".aspx", ".jsp", ".py", ".rb", ".pl",
    ".sh", ".bash", ".zsh", ".csh",
  ];

  for (let i = 1; i < parts.length - 1; i++) {
    const middleExt = "." + parts[i];
    if (dangerousExtensions.includes(middleExt)) {
      return {
        valid: false,
        error: "보안상 위험한 파일입니다. 이력서 파일만 업로드해주세요.",
      };
    }
  }

  return { valid: true, extension: lastExt };
}

// ─────────────────────────────────────────────────
// 매직 바이트 검증
// ─────────────────────────────────────────────────

/**
 * 파일 매직 바이트 검증
 * 파일의 실제 내용이 확장자와 일치하는지 확인
 */
export function validateMagicBytes(
  buffer: ArrayBuffer,
  expectedExtension: string
): FileValidationResult {
  const ext = expectedExtension.toLowerCase();
  const signatures = MAGIC_BYTES[ext];

  if (!signatures) {
    // 시그니처가 정의되지 않은 확장자는 통과 (하지만 로그 남김)
    console.warn(`No magic bytes defined for extension: ${ext}`);
    return { valid: true, extension: ext };
  }

  const bytes = new Uint8Array(buffer);

  // 파일이 너무 작으면 거부
  if (bytes.length < 8) {
    return { valid: false, error: "파일이 너무 작습니다. 파일이 손상되었거나 빈 파일일 수 있습니다." };
  }

  // 각 시그니처와 비교
  for (const signature of signatures) {
    const offset = signature.offset || 0;
    let matches = true;

    for (let i = 0; i < signature.bytes.length; i++) {
      if (bytes[offset + i] !== signature.bytes[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return { valid: true, extension: ext };
    }
  }

  return {
    valid: false,
    error: `파일 내용이 ${ext.toUpperCase().replace(".", "")} 형식과 일치하지 않습니다. 파일이 손상되었거나 확장자가 변경되었을 수 있습니다.`,
  };
}

// ─────────────────────────────────────────────────
// 파일 크기 검증
// ─────────────────────────────────────────────────

/**
 * ZIP 구조 검증 (DOCX, HWPX)
 * ZIP 기반 파일의 내부 구조를 검증하여 위조된 파일 탐지
 */
export async function validateZipStructure(
  buffer: ArrayBuffer,
  expectedExtension: string
): Promise<FileValidationResult> {
  const ext = expectedExtension.toLowerCase();

  // ZIP 기반 파일만 검증
  if (![".docx", ".hwpx"].includes(ext)) {
    return { valid: true, extension: ext };
  }

  try {
    // JSZip을 동적으로 로드 (서버 사이드 전용)
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);

    // DOCX 파일 구조 검증
    if (ext === ".docx") {
      const requiredFiles = ["[Content_Types].xml", "word/document.xml"];
      for (const file of requiredFiles) {
        if (!zip.file(file)) {
          return {
            valid: false,
            error: "DOCX 파일 구조가 올바르지 않습니다. 파일이 손상되었거나 위조된 파일일 수 있습니다.",
          };
        }
      }
    }

    // HWPX 파일 구조 검증
    if (ext === ".hwpx") {
      // HWPX는 OWPML 형식 - Contents/content.hpf 또는 mimetype 파일 확인
      const hasContentHpf = zip.file("Contents/content.hpf") !== null;
      const hasMimetype = zip.file("mimetype") !== null;
      const hasSection = Object.keys(zip.files).some((name) =>
        name.startsWith("Contents/section")
      );

      if (!hasContentHpf && !hasMimetype && !hasSection) {
        return {
          valid: false,
          error: "HWPX 파일 구조가 올바르지 않습니다. 파일이 손상되었거나 위조된 파일일 수 있습니다.",
        };
      }
    }

    return { valid: true, extension: ext };
  } catch (error) {
    console.error("ZIP structure validation error:", error);
    return {
      valid: false,
      error: "파일을 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.",
    };
  }
}

/**
 * 파일 크기 검증
 */
export function validateFileSize(
  size: number,
  maxSize: number = FILE_CONFIG.MAX_FILE_SIZE,
  minSize: number = FILE_CONFIG.MIN_FILE_SIZE
): FileValidationResult {
  if (size <= 0) {
    return { valid: false, error: "빈 파일은 업로드할 수 없습니다. 파일 내용이 있는지 확인해주세요." };
  }

  if (size < minSize) {
    const minKB = Math.round(minSize / 1024);
    return { valid: false, error: `파일 크기가 너무 작습니다 (최소 ${minKB}KB). 올바른 이력서 파일인지 확인해주세요.` };
  }

  if (size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `파일 크기가 ${maxMB}MB를 초과합니다. 더 작은 파일을 선택해주세요.` };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────
// 통합 검증 함수
// ─────────────────────────────────────────────────

export interface FullFileValidationOptions {
  fileName: string;
  fileSize: number;
  fileBuffer?: ArrayBuffer;
  maxSize?: number;
}

/**
 * 파일 전체 검증 (확장자 + 크기 + 매직 바이트)
 */
export function validateFile(options: FullFileValidationOptions): FileValidationResult {
  const { fileName, fileSize, fileBuffer, maxSize } = options;

  // 1. 확장자 검증
  const extResult = validateExtension(fileName);
  if (!extResult.valid) {
    return extResult;
  }

  // 2. 파일 크기 검증
  const sizeResult = validateFileSize(fileSize, maxSize);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  // 3. 매직 바이트 검증 (버퍼가 제공된 경우만)
  if (fileBuffer && extResult.extension) {
    const magicResult = validateMagicBytes(fileBuffer, extResult.extension);
    if (!magicResult.valid) {
      return magicResult;
    }
  }

  return { valid: true, extension: extResult.extension };
}

// ─────────────────────────────────────────────────
// 크레딧 계산 유틸리티
// ─────────────────────────────────────────────────

export interface UserCreditsInfo {
  credits: number;
  credits_used_this_month: number;
  plan: string;
}

/**
 * 남은 크레딧 계산
 */
export function calculateRemainingCredits(userInfo: UserCreditsInfo): number {
  const baseCredits = PLAN_CONFIG.BASE_CREDITS[userInfo.plan as keyof typeof PLAN_CONFIG.BASE_CREDITS] || 50;
  return baseCredits - userInfo.credits_used_this_month + userInfo.credits;
}

/**
 * 크레딧 충분 여부 확인
 */
export function hasEnoughCredits(userInfo: UserCreditsInfo, required: number = 1): boolean {
  return calculateRemainingCredits(userInfo) >= required;
}
