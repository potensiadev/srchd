/**
 * Email Templates - 이메일 본문 템플릿
 *
 * PRD Section 12: Email Notifications System
 *
 * E-10: 결제 실패
 * E-11: 구독 시작/갱신
 * E-12: 구독 취소 확인
 */

import type { EmailType } from "./service";

const BRAND_COLOR = "#2563eb"; // blue-600
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://srchd.com";

/**
 * 공통 이메일 레이아웃
 */
function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>서치드</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="padding: 24px 32px; background-color: ${BRAND_COLOR};">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">서치드</h1>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        ${content}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 24px 32px; background-color: #f4f4f5; border-top: 1px solid #e4e4e7;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
          본 메일은 발신 전용입니다. 문의사항은 <a href="${APP_URL}/support" style="color: ${BRAND_COLOR};">고객센터</a>를 이용해 주세요.
        </p>
        <p style="margin: 0; font-size: 12px; color: #71717a;">
          © 2026 서치드. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * 버튼 스타일
 */
function ctaButton(text: string, url: string): string {
  return `
    <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 16px 0;">
      ${text}
    </a>
  `;
}

/**
 * E-10: 결제 실패 알림
 */
function templateE10(metadata: Record<string, unknown>): string {
  const planName = (metadata.plan_name as string) || "Pro";
  const retryUrl = `${APP_URL}/settings?tab=billing`;

  return emailLayout(`
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #18181b;">결제에 실패했습니다</h2>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      안녕하세요, 서치드입니다.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      <strong>${planName}</strong> 플랜 결제가 실패했습니다. 결제 수단을 확인해 주세요.
    </p>
    <div style="padding: 16px; background-color: #fef2f2; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 0; font-size: 14px; color: #991b1b;">
        결제가 7일 이내에 처리되지 않으면 구독이 일시 중지될 수 있습니다.
      </p>
    </div>
    ${ctaButton("결제 수단 업데이트", retryUrl)}
    <p style="margin: 24px 0 0 0; font-size: 14px; color: #71717a;">
      문제가 지속되면 <a href="${APP_URL}/support" style="color: ${BRAND_COLOR};">고객센터</a>로 문의해 주세요.
    </p>
  `);
}

/**
 * E-11: 구독 시작/갱신 알림
 */
function templateE11(metadata: Record<string, unknown>): string {
  const planName = (metadata.plan_name as string) || "Pro";
  const credits = (metadata.credits as number) || 200;
  const nextBillingDate = metadata.next_billing_date as string;
  const amount = metadata.amount as string;
  const isRenewal = metadata.is_renewal as boolean;

  const title = isRenewal ? "구독이 갱신되었습니다" : "Pro 플랜을 시작합니다";
  const dashboardUrl = `${APP_URL}/candidates`;

  return emailLayout(`
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #18181b;">${title}</h2>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      안녕하세요, 서치드입니다.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      ${isRenewal ? "구독이 성공적으로 갱신되었습니다." : "서치드 Pro 플랜 결제가 완료되었습니다."}
    </p>
    <div style="padding: 20px; background-color: #f0fdf4; border-radius: 8px; margin: 24px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">플랜</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">이용 가능 크레딧</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${credits}개</td>
        </tr>
        ${
          amount
            ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">결제 금액</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${amount}</td>
        </tr>
        `
            : ""
        }
        ${
          nextBillingDate
            ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">다음 결제일</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${nextBillingDate}</td>
        </tr>
        `
            : ""
        }
      </table>
    </div>
    ${ctaButton("대시보드로 이동", dashboardUrl)}
    <p style="margin: 24px 0 0 0; font-size: 14px; color: #71717a;">
      서치드를 이용해 주셔서 감사합니다.
    </p>
  `);
}

/**
 * E-09: 크레딧 갱신 알림
 */
function templateE09(metadata: Record<string, unknown>): string {
  const planName = (metadata.plan as string) === "pro" ? "Pro" : "Starter";
  const credits = planName === "Pro" ? 200 : 10;
  const dashboardUrl = `${APP_URL}/candidates`;

  return emailLayout(`
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #18181b;">크레딧이 갱신되었습니다</h2>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      안녕하세요, 서치드입니다.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      ${planName} 플랜의 월간 크레딧이 갱신되었습니다.
    </p>
    <div style="padding: 20px; background-color: #f0fdf4; border-radius: 8px; margin: 24px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">현재 플랜</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">이번 달 크레딧</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${credits}개</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      지금 바로 이력서를 분석하고 최고의 인재를 찾아보세요.
    </p>
    ${ctaButton("대시보드로 이동", dashboardUrl)}
    <p style="margin: 24px 0 0 0; font-size: 14px; color: #71717a;">
      서치드를 이용해 주셔서 감사합니다.
    </p>
  `);
}

/**
 * E-12: 구독 취소 확인
 */
function templateE12(metadata: Record<string, unknown>): string {
  const planName = (metadata.plan_name as string) || "Pro";
  const endDate = (metadata.end_date as string) || "구독 기간 종료일";
  const remainingCredits = metadata.remaining_credits as number;
  const resubscribeUrl = `${APP_URL}/pricing`;

  return emailLayout(`
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #18181b;">구독이 취소되었습니다</h2>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      안녕하세요, 서치드입니다.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      <strong>${planName}</strong> 플랜 구독 취소가 완료되었습니다.
    </p>
    <div style="padding: 20px; background-color: #fefce8; border-radius: 8px; margin: 24px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">서비스 이용 가능일</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${endDate}까지</td>
        </tr>
        ${
          typeof remainingCredits === "number"
            ? `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #3f3f46;">남은 크레딧</td>
          <td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right; font-weight: 500;">${remainingCredits}개</td>
        </tr>
        `
            : ""
        }
      </table>
    </div>
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      구독 종료 후에도 Starter 플랜(월 10 크레딧)으로 서비스를 계속 이용하실 수 있습니다.
    </p>
    <p style="margin: 0 0 24px 0; font-size: 16px; color: #3f3f46; line-height: 1.6;">
      언제든지 다시 업그레이드하실 수 있습니다.
    </p>
    ${ctaButton("다시 구독하기", resubscribeUrl)}
    <p style="margin: 24px 0 0 0; font-size: 14px; color: #71717a;">
      서비스를 이용해 주셔서 감사합니다. 더 나은 서비스로 다시 찾아뵙겠습니다.
    </p>
  `);
}

/**
 * 이메일 타입별 HTML 생성
 */
export function generateEmailHtml(
  emailType: EmailType,
  metadata: Record<string, unknown>
): string {
  switch (emailType) {
    case "E-09":
      return templateE09(metadata);
    case "E-10":
      return templateE10(metadata);
    case "E-11":
      return templateE11(metadata);
    case "E-12":
      return templateE12(metadata);
    // 다른 이메일 타입은 추후 구현
    default:
      return emailLayout(`
        <p style="font-size: 16px; color: #3f3f46;">
          서치드에서 알림이 도착했습니다.
        </p>
        <pre style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto;">
${JSON.stringify(metadata, null, 2)}
        </pre>
      `);
  }
}

/**
 * 이메일 타입별 제목 생성
 */
export function generateEmailSubject(
  emailType: EmailType,
  metadata: Record<string, unknown> = {}
): string {
  const planName = (metadata.plan_name as string) || "Pro";

  switch (emailType) {
    case "E-01":
      return "[서치드] 가입을 환영합니다!";
    case "E-02":
      return "[서치드] 비밀번호가 변경되었습니다";
    case "E-03":
      return "[서치드] 계정 삭제가 완료되었습니다";
    case "E-04":
      return "[서치드] 이력서 분석이 완료되었습니다";
    case "E-05":
      return "[서치드] 이력서 분석에 실패했습니다";
    case "E-06":
      return "[서치드] JD 매칭이 완료되었습니다";
    case "E-07":
      return "[서치드] 크레딧이 부족합니다";
    case "E-08":
      return "[서치드] 크레딧이 모두 소진되었습니다";
    case "E-09":
      return "[서치드] 크레딧이 갱신되었습니다";
    case "E-10":
      return `[서치드] ${planName} 플랜 결제에 실패했습니다`;
    case "E-11":
      return metadata.is_renewal
        ? `[서치드] ${planName} 플랜이 갱신되었습니다`
        : `[서치드] ${planName} 플랜 결제가 완료되었습니다`;
    case "E-12":
      return `[서치드] ${planName} 플랜 구독이 취소되었습니다`;
    default:
      return "[서치드] 알림";
  }
}
