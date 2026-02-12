/**
 * 경력 계산 유틸리티
 */

import type { Career, ExperienceDuration } from "./types";

/**
 * 경력 기간 계산 (중복 기간 병합)
 */
export function calculateTotalExperience(careers: Career[]): ExperienceDuration {
  if (!careers || careers.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  const ranges: { start: number; end: number }[] = [];

  for (const career of careers) {
    const startDate = career.start_date || career.startDate;
    if (!startDate) continue;

    const startParts = startDate.split("-");
    const startYear = parseInt(startParts[0], 10);
    const startMonth = startParts[1] ? parseInt(startParts[1], 10) : 1;

    if (isNaN(startYear)) continue;

    const startMonthIndex = startYear * 12 + startMonth;
    let endMonthIndex: number;

    const isCurrent = career.is_current || career.isCurrent;
    const endDate = career.end_date || career.endDate;

    if (isCurrent || !endDate) {
      const now = new Date();
      endMonthIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
    } else {
      const endParts = endDate.split("-");
      const endYear = parseInt(endParts[0], 10);
      const endMonth = endParts[1] ? parseInt(endParts[1], 10) : 12;
      if (isNaN(endYear)) continue;
      endMonthIndex = endYear * 12 + endMonth;
    }

    if (endMonthIndex >= startMonthIndex) {
      ranges.push({ start: startMonthIndex, end: endMonthIndex });
    }
  }

  if (ranges.length === 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  // 기간 병합
  ranges.sort((a, b) => a.start - b.start);
  const mergedRanges: { start: number; end: number }[] = [];
  let currentRange = { ...ranges[0] };

  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.start <= currentRange.end + 1) {
      currentRange.end = Math.max(currentRange.end, range.end);
    } else {
      mergedRanges.push(currentRange);
      currentRange = { ...range };
    }
  }
  mergedRanges.push(currentRange);

  const totalMonths = mergedRanges.reduce(
    (sum, range) => sum + (range.end - range.start + 1),
    0
  );

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    totalMonths,
  };
}

/**
 * 경력 문자열 포맷팅
 */
export function formatExperience(exp: ExperienceDuration): string {
  if (exp.totalMonths === 0) return "경력 없음";
  if (exp.years === 0) return `${exp.months}개월`;
  if (exp.months === 0) return `${exp.years}년`;
  return `${exp.years}년 ${exp.months}개월`;
}
