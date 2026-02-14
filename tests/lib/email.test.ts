/**
 * Email Service Tests
 *
 * T3-3: 결제 이메일 (E-10, E-11, E-12) 테스트
 */

import { describe, it, expect } from "vitest";
import { generateEmailHtml, generateEmailSubject } from "@/lib/email/templates";

describe("Email Templates", () => {
  describe("generateEmailSubject", () => {
    it("should generate E-10 subject for payment failure", () => {
      const subject = generateEmailSubject("E-10", { plan_name: "Pro" });
      expect(subject).toBe("[서치드] Pro 플랜 결제에 실패했습니다");
    });

    it("should generate E-11 subject for new subscription", () => {
      const subject = generateEmailSubject("E-11", { plan_name: "Pro", is_renewal: false });
      expect(subject).toBe("[서치드] Pro 플랜 결제가 완료되었습니다");
    });

    it("should generate E-11 subject for renewal", () => {
      const subject = generateEmailSubject("E-11", { plan_name: "Pro", is_renewal: true });
      expect(subject).toBe("[서치드] Pro 플랜이 갱신되었습니다");
    });

    it("should generate E-12 subject for cancellation", () => {
      const subject = generateEmailSubject("E-12", { plan_name: "Pro" });
      expect(subject).toBe("[서치드] Pro 플랜 구독이 취소되었습니다");
    });
  });

  describe("generateEmailHtml", () => {
    it("should generate E-10 HTML with plan name", () => {
      const html = generateEmailHtml("E-10", { plan_name: "Pro" });
      expect(html).toContain("결제에 실패했습니다");
      expect(html).toContain("Pro");
      expect(html).toContain("결제 수단 업데이트");
    });

    it("should generate E-11 HTML for new subscription", () => {
      const html = generateEmailHtml("E-11", {
        plan_name: "Pro",
        credits: 200,
        is_renewal: false,
      });
      expect(html).toContain("Pro 플랜을 시작합니다");
      expect(html).toContain("200");
      expect(html).toContain("대시보드로 이동");
    });

    it("should generate E-11 HTML for renewal", () => {
      const html = generateEmailHtml("E-11", {
        plan_name: "Pro",
        credits: 200,
        amount: "₩29,000",
        next_billing_date: "2026-03-14",
        is_renewal: true,
      });
      expect(html).toContain("구독이 갱신되었습니다");
      expect(html).toContain("₩29,000");
      expect(html).toContain("2026-03-14");
    });

    it("should generate E-12 HTML with end date", () => {
      const html = generateEmailHtml("E-12", {
        plan_name: "Pro",
        end_date: "2026-03-14",
        remaining_credits: 150,
      });
      expect(html).toContain("구독이 취소되었습니다");
      expect(html).toContain("2026-03-14");
      expect(html).toContain("150");
      expect(html).toContain("Starter 플랜");
    });

    it("should include common layout elements", () => {
      const html = generateEmailHtml("E-10", {});
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("서치드");
      expect(html).toContain("고객센터");
      expect(html).toContain("© 2026");
    });
  });
});
