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
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
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
    return { valid: false, error: "Invalid file name" };
  }

  // 파일명 정규화 (공백 제거, 소문자 변환)
  const normalizedName = fileName.trim().toLowerCase();

  // 파일명에서 모든 확장자 추출 (이중 확장자 탐지)
  const parts = normalizedName.split(".");

  if (parts.length < 2) {
    return { valid: false, error: "File has no extension" };
  }

  // 마지막 확장자
  const lastExt = "." + parts[parts.length - 1];

  // 허용된 확장자인지 확인
  if (!FILE_CONFIG.ALLOWED_EXTENSIONS.includes(lastExt as typeof FILE_CONFIG.ALLOWED_EXTENSIONS[number])) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed: ${FILE_CONFIG.ALLOWED_EXTENSIONS.join(", ")}`,
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
        error: "Potentially dangerous file detected (double extension)",
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
    return { valid: false, error: "File is too small to be valid" };
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
    error: `File content does not match ${ext} format (invalid file signature)`,
  };
}

// ─────────────────────────────────────────────────
// 파일 크기 검증
// ─────────────────────────────────────────────────

/**
 * 파일 크기 검증
 */
export function validateFileSize(
  size: number,
  maxSize: number = FILE_CONFIG.MAX_FILE_SIZE
): FileValidationResult {
  if (size <= 0) {
    return { valid: false, error: "File is empty" };
  }

  if (size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `File size exceeds ${maxMB}MB limit` };
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
