import { describe, it, expect } from "vitest";
import {
  validateExtension,
  validateMagicBytes,
  validateFileSize,
  validateFile,
  calculateRemainingCredits,
  hasEnoughCredits,
  FILE_CONFIG,
  PLAN_CONFIG,
} from "@/lib/file-validation";

// ─────────────────────────────────────────────────
// 테스트용 매직 바이트 생성 헬퍼
// ─────────────────────────────────────────────────

function createPDFBuffer(): ArrayBuffer {
  // %PDF-1.4 header
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return bytes.buffer;
}

function createDOCXBuffer(): ArrayBuffer {
  // PK (ZIP) header
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
  return bytes.buffer;
}

function createDOCBuffer(): ArrayBuffer {
  // OLE Compound Document header
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes.buffer;
}

function createHWPBuffer(): ArrayBuffer {
  // OLE Compound Document header (same as DOC)
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes.buffer;
}

function createHWPXBuffer(): ArrayBuffer {
  // PK (ZIP) header (same as DOCX)
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
  return bytes.buffer;
}

function createFakeBuffer(): ArrayBuffer {
  // Random bytes (not a valid document)
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  return bytes.buffer;
}

function createTinyBuffer(): ArrayBuffer {
  // Too small to be valid
  const bytes = new Uint8Array([0x00, 0x01]);
  return bytes.buffer;
}

// ─────────────────────────────────────────────────
// validateExtension 테스트
// ─────────────────────────────────────────────────

describe("validateExtension", () => {
  describe("유효한 확장자", () => {
    it.each([
      ["resume.pdf", ".pdf"],
      ["document.docx", ".docx"],
      ["file.doc", ".doc"],
      ["이력서.hwp", ".hwp"],
      ["한글문서.hwpx", ".hwpx"],
      ["FILE.PDF", ".pdf"], // 대문자
      ["my.resume.pdf", ".pdf"], // 다중 점
    ])("%s 파일은 유효해야 함", (fileName, expectedExt) => {
      const result = validateExtension(fileName);
      expect(result.valid).toBe(true);
      expect(result.extension).toBe(expectedExt);
    });
  });

  describe("유효하지 않은 확장자", () => {
    it.each([
      ["resume.exe", "지원하지 않는 파일 형식"],
      ["document.txt", "지원하지 않는 파일 형식"],
      ["file.jpg", "지원하지 않는 파일 형식"],
      ["script.js", "지원하지 않는 파일 형식"],
    ])("%s 파일은 거부되어야 함", (fileName, expectedError) => {
      const result = validateExtension(fileName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(expectedError);
    });
  });

  describe("이중 확장자 공격 방지", () => {
    // 마지막 확장자가 위험한 경우 -> "지원하지 않는 파일 형식"으로 거부
    it.each([
      ["resume.pdf.exe", "지원하지 않는 파일 형식"],
      ["document.hwp.bat", "지원하지 않는 파일 형식"],
      ["file.docx.js", "지원하지 않는 파일 형식"],
    ])("%s 파일은 거부되어야 함 (마지막 확장자 위험)", (fileName, expectedError) => {
      const result = validateExtension(fileName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(expectedError);
    });

    // 마지막 확장자는 허용되지만 중간에 위험한 확장자가 있는 경우 -> "보안상 위험한 파일"으로 거부
    it.each([
      ["malware.exe.pdf", "보안상 위험한 파일"],
      ["virus.bat.hwp", "보안상 위험한 파일"],
      ["script.js.docx", "보안상 위험한 파일"],
      ["backdoor.php.doc", "보안상 위험한 파일"],
      ["trojan.vbs.hwpx", "보안상 위험한 파일"],
    ])("%s 파일은 거부되어야 함 (중간 확장자 위험)", (fileName, expectedError) => {
      const result = validateExtension(fileName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(expectedError);
    });
  });

  describe("엣지 케이스", () => {
    it("빈 파일명은 거부", () => {
      const result = validateExtension("");
      expect(result.valid).toBe(false);
    });

    it("확장자 없는 파일은 거부", () => {
      const result = validateExtension("noextension");
      expect(result.valid).toBe(false);
    });

    it("null/undefined는 거부", () => {
      // @ts-expect-error 의도적 테스트
      const result1 = validateExtension(null);
      expect(result1.valid).toBe(false);

      // @ts-expect-error 의도적 테스트
      const result2 = validateExtension(undefined);
      expect(result2.valid).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────
// validateMagicBytes 테스트
// ─────────────────────────────────────────────────

describe("validateMagicBytes", () => {
  describe("유효한 매직 바이트", () => {
    it("PDF 파일 검증", () => {
      const result = validateMagicBytes(createPDFBuffer(), ".pdf");
      expect(result.valid).toBe(true);
    });

    it("DOCX 파일 검증", () => {
      const result = validateMagicBytes(createDOCXBuffer(), ".docx");
      expect(result.valid).toBe(true);
    });

    it("DOC 파일 검증", () => {
      const result = validateMagicBytes(createDOCBuffer(), ".doc");
      expect(result.valid).toBe(true);
    });

    it("HWP 파일 검증", () => {
      const result = validateMagicBytes(createHWPBuffer(), ".hwp");
      expect(result.valid).toBe(true);
    });

    it("HWPX 파일 검증", () => {
      const result = validateMagicBytes(createHWPXBuffer(), ".hwpx");
      expect(result.valid).toBe(true);
    });
  });

  describe("위조된 파일 감지", () => {
    it("PDF 확장자지만 다른 내용", () => {
      const result = validateMagicBytes(createFakeBuffer(), ".pdf");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("형식과 일치하지 않습니다");
    });

    it("DOCX 확장자지만 DOC 내용", () => {
      const result = validateMagicBytes(createDOCBuffer(), ".docx");
      expect(result.valid).toBe(false);
    });

    it("HWP 확장자지만 PDF 내용", () => {
      const result = validateMagicBytes(createPDFBuffer(), ".hwp");
      expect(result.valid).toBe(false);
    });
  });

  describe("엣지 케이스", () => {
    it("너무 작은 파일은 거부", () => {
      const result = validateMagicBytes(createTinyBuffer(), ".pdf");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("파일이 너무 작습니다");
    });

    it("빈 버퍼는 거부", () => {
      const result = validateMagicBytes(new ArrayBuffer(0), ".pdf");
      expect(result.valid).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────
// validateFileSize 테스트
// ─────────────────────────────────────────────────

describe("validateFileSize", () => {
  it("유효한 파일 크기", () => {
    const result = validateFileSize(1024 * 1024); // 1MB
    expect(result.valid).toBe(true);
  });

  it("최대 크기 경계값", () => {
    const result = validateFileSize(FILE_CONFIG.MAX_FILE_SIZE);
    expect(result.valid).toBe(true);
  });

  it("최대 크기 초과", () => {
    const result = validateFileSize(FILE_CONFIG.MAX_FILE_SIZE + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("50MB");
  });

  it("빈 파일 거부", () => {
    const result = validateFileSize(0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("빈 파일");
  });

  it("음수 크기 거부", () => {
    const result = validateFileSize(-1);
    expect(result.valid).toBe(false);
  });

  it("커스텀 최대 크기", () => {
    const result = validateFileSize(10 * 1024 * 1024, 5 * 1024 * 1024); // 10MB, max 5MB
    expect(result.valid).toBe(false);
    expect(result.error).toContain("5MB");
  });
});

// ─────────────────────────────────────────────────
// validateFile 통합 테스트
// ─────────────────────────────────────────────────

describe("validateFile", () => {
  it("유효한 PDF 파일", () => {
    const result = validateFile({
      fileName: "resume.pdf",
      fileSize: 1024 * 1024,
      fileBuffer: createPDFBuffer(),
    });
    expect(result.valid).toBe(true);
    expect(result.extension).toBe(".pdf");
  });

  it("유효한 DOCX 파일", () => {
    const result = validateFile({
      fileName: "document.docx",
      fileSize: 2 * 1024 * 1024,
      fileBuffer: createDOCXBuffer(),
    });
    expect(result.valid).toBe(true);
  });

  it("확장자 오류 우선", () => {
    const result = validateFile({
      fileName: "file.exe",
      fileSize: 1024,
      fileBuffer: createPDFBuffer(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("지원하지 않는 파일 형식");
  });

  it("크기 오류", () => {
    const result = validateFile({
      fileName: "big.pdf",
      fileSize: 100 * 1024 * 1024, // 100MB
      fileBuffer: createPDFBuffer(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("50MB");
  });

  it("매직 바이트 오류", () => {
    const result = validateFile({
      fileName: "fake.pdf",
      fileSize: 1024,
      fileBuffer: createFakeBuffer(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("형식과 일치하지 않습니다");
  });

  it("버퍼 없이 확장자/크기만 검증", () => {
    const result = validateFile({
      fileName: "document.pdf",
      fileSize: 1024,
      // fileBuffer 없음
    });
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// 크레딧 계산 테스트
// ─────────────────────────────────────────────────

describe("calculateRemainingCredits", () => {
  it("Starter 플랜 기본 크레딧", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 0,
      plan: "starter",
    });
    expect(result).toBe(PLAN_CONFIG.BASE_CREDITS.starter); // 50
  });

  it("Pro 플랜 기본 크레딧", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 0,
      plan: "pro",
    });
    expect(result).toBe(PLAN_CONFIG.BASE_CREDITS.pro); // 150
  });

  it("Enterprise 플랜 기본 크레딧", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 0,
      plan: "enterprise",
    });
    expect(result).toBe(PLAN_CONFIG.BASE_CREDITS.enterprise); // 300
  });

  it("사용한 크레딧 차감", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 30,
      plan: "starter",
    });
    expect(result).toBe(20); // 50 - 30
  });

  it("추가 구매 크레딧 포함", () => {
    const result = calculateRemainingCredits({
      credits: 100, // 추가 구매
      credits_used_this_month: 30,
      plan: "starter",
    });
    expect(result).toBe(120); // 50 - 30 + 100
  });

  it("알 수 없는 플랜은 기본값 50", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 0,
      plan: "unknown",
    });
    expect(result).toBe(50);
  });

  it("음수 크레딧 가능 (초과 사용)", () => {
    const result = calculateRemainingCredits({
      credits: 0,
      credits_used_this_month: 100,
      plan: "starter",
    });
    expect(result).toBe(-50); // 50 - 100
  });
});

describe("hasEnoughCredits", () => {
  it("충분한 크레딧", () => {
    const result = hasEnoughCredits({
      credits: 0,
      credits_used_this_month: 0,
      plan: "starter",
    });
    expect(result).toBe(true);
  });

  it("정확히 1개 남음", () => {
    const result = hasEnoughCredits({
      credits: 0,
      credits_used_this_month: 49,
      plan: "starter",
    });
    expect(result).toBe(true);
  });

  it("크레딧 부족", () => {
    const result = hasEnoughCredits({
      credits: 0,
      credits_used_this_month: 50,
      plan: "starter",
    });
    expect(result).toBe(false);
  });

  it("필요 크레딧 지정", () => {
    const result = hasEnoughCredits(
      {
        credits: 0,
        credits_used_this_month: 45,
        plan: "starter",
      },
      10 // 10개 필요
    );
    expect(result).toBe(false); // 5개 남음
  });
});

// ─────────────────────────────────────────────────
// 설정 상수 테스트
// ─────────────────────────────────────────────────

describe("FILE_CONFIG", () => {
  it("허용 확장자 목록", () => {
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).toContain(".pdf");
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).toContain(".docx");
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).toContain(".doc");
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).toContain(".hwp");
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).toContain(".hwpx");
    expect(FILE_CONFIG.ALLOWED_EXTENSIONS).not.toContain(".exe");
  });

  it("최대 파일 크기는 50MB", () => {
    expect(FILE_CONFIG.MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
  });
});

describe("PLAN_CONFIG", () => {
  it("플랜별 기본 크레딧", () => {
    expect(PLAN_CONFIG.BASE_CREDITS.starter).toBe(50);
    expect(PLAN_CONFIG.BASE_CREDITS.pro).toBe(150);
    expect(PLAN_CONFIG.BASE_CREDITS.enterprise).toBe(300);
  });

  it("플랜별 내보내기 제한", () => {
    expect(PLAN_CONFIG.EXPORT_LIMITS.starter).toBe(30);
    expect(PLAN_CONFIG.EXPORT_LIMITS.pro).toBe(Infinity);
    expect(PLAN_CONFIG.EXPORT_LIMITS.enterprise).toBe(Infinity);
  });
});
