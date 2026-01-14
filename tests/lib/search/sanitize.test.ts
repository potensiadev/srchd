import { describe, it, expect } from "vitest";
import {
  sanitizeSkill,
  sanitizeSkillsArray,
  parseSearchQuery,
  sanitizeString,
  MAX_SKILLS_ARRAY_SIZE,
  MAX_SKILL_LENGTH,
  MAX_KEYWORD_LENGTH,
  DANGEROUS_CHARS_PATTERN,
} from "@/lib/search/sanitize";

describe("Search Sanitize Utilities", () => {
  // ─────────────────────────────────────────────────
  // sanitizeSkill 테스트
  // ─────────────────────────────────────────────────

  describe("sanitizeSkill", () => {
    it("정상적인 스킬명 반환", () => {
      expect(sanitizeSkill("React")).toBe("React");
      expect(sanitizeSkill("Node.js")).toBe("Node.js");
      expect(sanitizeSkill("C++")).toBe("C++");
    });

    it("앞뒤 공백 제거", () => {
      expect(sanitizeSkill("  React  ")).toBe("React");
      expect(sanitizeSkill("\tTypeScript\n")).toBe("TypeScript");
    });

    it("null byte 제거", () => {
      expect(sanitizeSkill("React\u0000")).toBe("React");
      expect(sanitizeSkill("Re\u0000act")).toBe("React");
      expect(sanitizeSkill("\u0000React\u0000")).toBe("React");
    });

    it("제어 문자 제거", () => {
      expect(sanitizeSkill("React\u0001")).toBe("React");
      expect(sanitizeSkill("React\u001F")).toBe("React");
      expect(sanitizeSkill("React\u007F")).toBe("React");
    });

    it("Zero-width 문자 제거", () => {
      expect(sanitizeSkill("React\u200B")).toBe("React");
      expect(sanitizeSkill("React\uFEFF")).toBe("React");
    });

    it("빈 문자열은 null 반환", () => {
      expect(sanitizeSkill("")).toBeNull();
      expect(sanitizeSkill("   ")).toBeNull();
      expect(sanitizeSkill("\t\n")).toBeNull();
    });

    it("null/undefined는 null 반환", () => {
      expect(sanitizeSkill(null)).toBeNull();
      expect(sanitizeSkill(undefined)).toBeNull();
    });

    it("문자열이 아닌 타입은 null 반환", () => {
      expect(sanitizeSkill(123)).toBeNull();
      expect(sanitizeSkill({})).toBeNull();
      expect(sanitizeSkill([])).toBeNull();
      expect(sanitizeSkill(true)).toBeNull();
    });

    it("100자 초과 스킬은 null 반환", () => {
      const longSkill = "A".repeat(101);
      expect(sanitizeSkill(longSkill)).toBeNull();

      const exactSkill = "A".repeat(100);
      expect(sanitizeSkill(exactSkill)).toBe(exactSkill);
    });
  });

  // ─────────────────────────────────────────────────
  // sanitizeSkillsArray 테스트
  // ─────────────────────────────────────────────────

  describe("sanitizeSkillsArray", () => {
    it("정상적인 스킬 배열 반환", () => {
      const skills = ["React", "Node.js", "TypeScript"];
      expect(sanitizeSkillsArray(skills)).toEqual(["React", "Node.js", "TypeScript"]);
    });

    it("null/undefined 요소 필터링", () => {
      const skills = ["React", null, "Node.js", undefined, "TypeScript"];
      expect(sanitizeSkillsArray(skills)).toEqual(["React", "Node.js", "TypeScript"]);
    });

    it("빈 문자열 필터링", () => {
      const skills = ["React", "", "Node.js", "   ", "TypeScript"];
      expect(sanitizeSkillsArray(skills)).toEqual(["React", "Node.js", "TypeScript"]);
    });

    it("null byte 포함 요소 정제", () => {
      const skills = ["React\u0000", "Node.js", "\u0000TypeScript"];
      expect(sanitizeSkillsArray(skills)).toEqual(["React", "Node.js", "TypeScript"]);
    });

    it("배열이 아닌 경우 빈 배열 반환", () => {
      expect(sanitizeSkillsArray(null)).toEqual([]);
      expect(sanitizeSkillsArray(undefined)).toEqual([]);
      expect(sanitizeSkillsArray("React")).toEqual([]);
      expect(sanitizeSkillsArray({})).toEqual([]);
    });

    it("100개 초과 요소 잘림", () => {
      const skills = Array(150).fill("React");
      const result = sanitizeSkillsArray(skills);
      expect(result.length).toBe(MAX_SKILLS_ARRAY_SIZE);
    });

    it("숫자/객체 요소 필터링", () => {
      const skills = ["React", 123, "Node.js", {}, "TypeScript", []];
      expect(sanitizeSkillsArray(skills)).toEqual(["React", "Node.js", "TypeScript"]);
    });
  });

  // ─────────────────────────────────────────────────
  // parseSearchQuery 테스트 (Mixed Language Query)
  // ─────────────────────────────────────────────────

  describe("parseSearchQuery", () => {
    it("공백으로 분리", () => {
      expect(parseSearchQuery("React Node.js")).toEqual(["React", "Node.js"]);
    });

    it("쉼표로 분리", () => {
      expect(parseSearchQuery("React,Node.js,TypeScript")).toEqual([
        "React",
        "Node.js",
        "TypeScript",
      ]);
    });

    it("다중 공백/쉼표 처리", () => {
      expect(parseSearchQuery("React   Node.js,,TypeScript")).toEqual([
        "React",
        "Node.js",
        "TypeScript",
      ]);
    });

    it("한영 경계 분리 - 영문 뒤 한글", () => {
      expect(parseSearchQuery("React개발자")).toEqual(["React", "개발자"]);
    });

    it("한영 경계 분리 - 한글 뒤 영문", () => {
      expect(parseSearchQuery("시니어Developer")).toEqual(["시니어", "Developer"]);
    });

    it("복합 분리 (공백 + 한영 경계)", () => {
      expect(parseSearchQuery("React개발자 시니어")).toEqual([
        "React",
        "개발자",
        "시니어",
      ]);
    });

    it("빈 쿼리 처리", () => {
      expect(parseSearchQuery("")).toEqual([]);
      expect(parseSearchQuery("   ")).toEqual([]);
    });

    it("null/undefined 처리", () => {
      expect(parseSearchQuery(null as unknown as string)).toEqual([]);
      expect(parseSearchQuery(undefined as unknown as string)).toEqual([]);
    });

    it("제어 문자 제거", () => {
      expect(parseSearchQuery("React\u0000 Node")).toEqual(["React", "Node"]);
    });

    it("50자 초과 키워드는 잘림 (truncation)", () => {
      const longKeyword = "A".repeat(51);
      // 이제 필터링 대신 잘림 처리
      expect(parseSearchQuery(longKeyword)).toEqual(["A".repeat(50)]);

      const validKeyword = "A".repeat(50);
      expect(parseSearchQuery(validKeyword)).toEqual([validKeyword]);
    });

    it("한글만 있는 쿼리", () => {
      expect(parseSearchQuery("프론트엔드 백엔드")).toEqual(["프론트엔드", "백엔드"]);
    });

    it("특수문자 포함 스킬", () => {
      expect(parseSearchQuery("C++ C#")).toEqual(["C++", "C#"]);
    });

    // Edge Cases - 특수문자+한글 경계 분리
    it("C++ 뒤 한글 분리", () => {
      expect(parseSearchQuery("C++개발자")).toEqual(["C++", "개발자"]);
    });

    it("C# 뒤 한글 분리", () => {
      expect(parseSearchQuery("C#개발자")).toEqual(["C#", "개발자"]);
    });

    it("Node.js 뒤 한글 분리", () => {
      expect(parseSearchQuery("Node.js개발자")).toEqual(["Node.js", "개발자"]);
    });

    it("iOS 뒤 한글 분리 (대소문자 혼합)", () => {
      expect(parseSearchQuery("iOS개발자")).toEqual(["iOS", "개발자"]);
    });

    it("숫자-한글 경계는 분리하지 않음 (단위 보존)", () => {
      // "5년차", "3년차" 같은 숫자+한글 단위는 분리하지 않음
      expect(parseSearchQuery("5년차")).toEqual(["5년차"]);
      expect(parseSearchQuery("시니어 5년차 개발자")).toEqual(["시니어", "5년차", "개발자"]);
    });

    it("숫자가 영문 뒤에 붙은 경우 공백 권장", () => {
      // "React3개발자"는 숫자-한글 경계를 분리하지 않으므로 하나로 유지
      // 사용자는 "React3 개발자" 형태로 공백 사용 권장
      expect(parseSearchQuery("React3개발자")).toEqual(["React3개발자"]);
      expect(parseSearchQuery("React3 개발자")).toEqual(["React3", "개발자"]);
    });

    it("복합 케이스: 공백 + 특수문자 + 한영 혼합", () => {
      expect(parseSearchQuery("C++개발자 Node.js시니어")).toEqual([
        "C++", "개발자", "Node.js", "시니어"
      ]);
    });
  });

  // ─────────────────────────────────────────────────
  // sanitizeString 테스트
  // ─────────────────────────────────────────────────

  describe("sanitizeString", () => {
    it("정상 문자열 반환", () => {
      expect(sanitizeString("hello world")).toBe("hello world");
    });

    it("앞뒤 공백 제거", () => {
      expect(sanitizeString("  hello  ")).toBe("hello");
    });

    it("제어 문자 제거", () => {
      expect(sanitizeString("hello\u0000world")).toBe("helloworld");
    });

    it("길이 제한 적용", () => {
      expect(sanitizeString("hello world", 5)).toBe("hello");
    });

    it("빈 문자열/null 처리", () => {
      expect(sanitizeString("")).toBe("");
      expect(sanitizeString(null as unknown as string)).toBe("");
    });
  });

  // ─────────────────────────────────────────────────
  // 상수 테스트
  // ─────────────────────────────────────────────────

  describe("Constants", () => {
    it("MAX_SKILLS_ARRAY_SIZE는 100", () => {
      expect(MAX_SKILLS_ARRAY_SIZE).toBe(100);
    });

    it("MAX_SKILL_LENGTH는 100", () => {
      expect(MAX_SKILL_LENGTH).toBe(100);
    });

    it("MAX_KEYWORD_LENGTH는 50", () => {
      expect(MAX_KEYWORD_LENGTH).toBe(50);
    });

    it("DANGEROUS_CHARS_PATTERN이 null byte 매칭", () => {
      expect("\u0000".match(DANGEROUS_CHARS_PATTERN)).toBeTruthy();
      expect("a".match(DANGEROUS_CHARS_PATTERN)).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────────────
  // Edge Cases & Security Tests
  // ─────────────────────────────────────────────────

  describe("Security Edge Cases", () => {
    it("XSS 페이로드가 포함된 스킬", () => {
      // 제어 문자는 제거되지만 일반 특수문자는 유지됨
      const skill = sanitizeSkill("<script>alert(1)</script>");
      expect(skill).toBe("<script>alert(1)</script>");
    });

    it("SQL Injection 시도", () => {
      const skill = sanitizeSkill("'; DROP TABLE--");
      expect(skill).toBe("'; DROP TABLE--");
    });

    it("Null byte injection 차단", () => {
      // Null byte는 항상 제거됨
      const skill = sanitizeSkill("React\u0000<script>");
      expect(skill).toBe("React<script>");
      expect(skill).not.toContain("\u0000");
    });

    it("매우 긴 배열 처리 (DoS 방지)", () => {
      const hugeArray = Array(1000000).fill("React");
      const result = sanitizeSkillsArray(hugeArray);
      expect(result.length).toBe(MAX_SKILLS_ARRAY_SIZE);
    });

    it("Sparse array 처리", () => {
      // eslint-disable-next-line no-sparse-arrays
      const sparse = ["React", , , "Node.js", , "TypeScript"];
      const result = sanitizeSkillsArray(sparse);
      expect(result).toEqual(["React", "Node.js", "TypeScript"]);
    });
  });
});
