/**
 * QA 테스트: DB 기반 동의어 검색 검증
 *
 * 테스트 범위:
 * 1. DB 동의어 매칭 테스트
 * 2. 한글 혼합 쿼리 테스트
 * 3. DB에 없는 키워드 AI 유사성 매칭 테스트
 * 4. 직군별 키워드 커버리지 테스트
 */

import {
  getSkillSynonymsFromDB,
  expandSkillsFromDB,
  normalizeSkillFromDB,
  getSynonymCacheStatus,
} from "@/lib/search/synonym-service";
import { parseSearchQuery } from "@/lib/search/sanitize";

// ─────────────────────────────────────────────────
// 테스트 케이스 정의
// ─────────────────────────────────────────────────

interface TestCase {
  input: string;
  expectedMatch: string[];
  category: string;
  description: string;
}

// PM 선정 키워드 기반 테스트 케이스
const testCases: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════
  // 1. Frontend Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "React개발자",
    expectedMatch: ["React", "개발자"],
    category: "Frontend",
    description: "한영 혼합 쿼리 - React + 개발자",
  },
  {
    input: "리액트",
    expectedMatch: ["React"],
    category: "Frontend",
    description: "한글 동의어 - 리액트 → React",
  },
  {
    input: "프론트엔드개발자",
    expectedMatch: ["프론트엔드개발자", "Frontend Developer", "FE개발자"],
    category: "Frontend",
    description: "직책 동의어 - 프론트엔드개발자",
  },
  {
    input: "시니어React",
    expectedMatch: ["시니어", "React"],
    category: "Frontend",
    description: "한영 혼합 - 시니어 + React",
  },
  {
    input: "Redux",
    expectedMatch: ["Redux", "리덕스", "Redux Toolkit", "RTK"],
    category: "Frontend",
    description: "상태관리 - Redux 동의어",
  },
  {
    input: "SSR",
    expectedMatch: ["SSR", "서버사이드렌더링", "Server Side Rendering"],
    category: "Frontend",
    description: "개념 - SSR 동의어",
  },
  {
    input: "웹접근성",
    expectedMatch: ["웹접근성", "Accessibility", "a11y", "WCAG"],
    category: "Frontend",
    description: "접근성 - 웹접근성 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. Backend Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "자바개발자",
    expectedMatch: ["Java", "개발자"],
    category: "Backend",
    description: "한영 혼합 - 자바 + 개발자",
  },
  {
    input: "스프링",
    expectedMatch: ["Spring", "SpringBoot", "Spring Boot"],
    category: "Backend",
    description: "프레임워크 - 스프링 동의어",
  },
  {
    input: "백엔드개발자",
    expectedMatch: ["백엔드개발자", "Backend Developer", "BE개발자"],
    category: "Backend",
    description: "직책 - 백엔드개발자 동의어",
  },
  {
    input: "마이크로서비스",
    expectedMatch: ["마이크로서비스", "Microservices", "MSA"],
    category: "Backend",
    description: "아키텍처 - 마이크로서비스 동의어",
  },
  {
    input: "Kubernetes",
    expectedMatch: ["Kubernetes", "쿠버네티스", "K8s", "k8s"],
    category: "Backend",
    description: "컨테이너 - Kubernetes 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. Data/ML Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "데이터엔지니어",
    expectedMatch: ["데이터엔지니어", "Data Engineer", "DE"],
    category: "Data",
    description: "직책 - 데이터엔지니어 동의어",
  },
  {
    input: "머신러닝",
    expectedMatch: ["머신러닝", "Machine Learning", "ML"],
    category: "Data",
    description: "ML - 머신러닝 동의어",
  },
  {
    input: "LLM",
    expectedMatch: ["LLM", "엘엘엠", "Large Language Model"],
    category: "Data",
    description: "AI - LLM 동의어",
  },
  {
    input: "허깅페이스",
    expectedMatch: ["Hugging Face", "허깅페이스", "HF"],
    category: "Data",
    description: "ML Framework - 허깅페이스 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. Mobile Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "iOS개발자",
    expectedMatch: ["iOS개발자", "iOS Developer", "아이폰개발자"],
    category: "Mobile",
    description: "직책 - iOS개발자 동의어",
  },
  {
    input: "리액트네이티브",
    expectedMatch: ["React Native", "리액트네이티브", "RN"],
    category: "Mobile",
    description: "크로스플랫폼 - React Native 동의어",
  },
  {
    input: "플러터",
    expectedMatch: ["Flutter", "플러터"],
    category: "Mobile",
    description: "크로스플랫폼 - Flutter 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. DevOps Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "DevOps엔지니어",
    expectedMatch: ["DevOps엔지니어", "DevOps Engineer", "데브옵스"],
    category: "DevOps",
    description: "직책 - DevOps엔지니어 동의어",
  },
  {
    input: "테라폼",
    expectedMatch: ["Terraform", "테라폼", "TF"],
    category: "DevOps",
    description: "IaC - Terraform 동의어",
  },
  {
    input: "깃옵스",
    expectedMatch: ["GitOps", "깃옵스"],
    category: "DevOps",
    description: "CI/CD - GitOps 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. PM/Design Keywords
  // ═══════════════════════════════════════════════════════════════
  {
    input: "프로덕트매니저",
    expectedMatch: ["Product Manager", "프로덕트매니저", "PM"],
    category: "PM",
    description: "직책 - PM 동의어",
  },
  {
    input: "UX디자이너",
    expectedMatch: ["UX디자이너", "UX Designer", "UXD"],
    category: "Design",
    description: "직책 - UX디자이너 동의어",
  },
  {
    input: "애자일",
    expectedMatch: ["Agile", "애자일"],
    category: "PM",
    description: "방법론 - Agile 동의어",
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. Edge Cases (엣지 케이스)
  // ═══════════════════════════════════════════════════════════════
  {
    input: "C++개발자",
    expectedMatch: ["C++", "개발자"],
    category: "Edge",
    description: "특수문자 - C++ 분리",
  },
  {
    input: "Node.js시니어",
    expectedMatch: ["Node.js", "시니어"],
    category: "Edge",
    description: "특수문자 - Node.js 분리",
  },
  {
    input: "5년차React개발자",
    expectedMatch: ["5년차", "React", "개발자"],
    category: "Edge",
    description: "숫자+한글 - 5년차 보존",
  },
];

// ─────────────────────────────────────────────────
// DB에 없는 키워드 (AI 유사성 테스트용)
// ─────────────────────────────────────────────────
const aiSimilarityTestCases: TestCase[] = [
  {
    input: "ReactJS전문가",
    expectedMatch: ["React"], // ReactJS → React로 매칭되어야 함
    category: "AI",
    description: "AI 유사성 - ReactJS는 React의 동의어",
  },
  {
    input: "프런트앤드",
    expectedMatch: ["프론트엔드"], // 오타 수정
    category: "AI",
    description: "AI 유사성 - 오타 교정 (프런트앤드 → 프론트엔드)",
  },
  {
    input: "백앤드",
    expectedMatch: ["백엔드"], // 오타 수정
    category: "AI",
    description: "AI 유사성 - 오타 교정 (백앤드 → 백엔드)",
  },
  {
    input: "Golang개발자",
    expectedMatch: ["Go"], // Golang → Go
    category: "AI",
    description: "AI 유사성 - Golang은 Go의 동의어",
  },
  {
    input: "쿠베르네티스",
    expectedMatch: ["Kubernetes"], // 오타/발음
    category: "AI",
    description: "AI 유사성 - 발음 기반 매칭",
  },
  {
    input: "NextJS개발",
    expectedMatch: ["Next.js"], // NextJS → Next.js
    category: "AI",
    description: "AI 유사성 - NextJS는 Next.js의 동의어",
  },
  {
    input: "타스",
    expectedMatch: ["TypeScript"], // 타스 → TypeScript (구어체)
    category: "AI",
    description: "AI 유사성 - 구어체 (타스 → TypeScript)",
  },
  {
    input: "노션",
    expectedMatch: ["Notion"],
    category: "AI",
    description: "AI 유사성 - 노션 → Notion",
  },
];

// ─────────────────────────────────────────────────
// 테스트 실행 함수
// ─────────────────────────────────────────────────

interface TestResult {
  testCase: TestCase;
  passed: boolean;
  actualResult: string[];
  error?: string;
}

async function runSynonymTest(testCase: TestCase): Promise<TestResult> {
  try {
    // 1. 쿼리 파싱
    const parsedKeywords = parseSearchQuery(testCase.input);

    // 2. 각 키워드에 대해 동의어 조회
    const allSynonyms: string[] = [];
    for (const keyword of parsedKeywords) {
      const synonyms = await getSkillSynonymsFromDB(keyword);
      allSynonyms.push(...synonyms);
    }

    // 3. 기대 결과와 비교
    const uniqueSynonyms = [...new Set(allSynonyms)];
    const passed = testCase.expectedMatch.some((expected) =>
      uniqueSynonyms.some(
        (syn) => syn.toLowerCase() === expected.toLowerCase()
      )
    );

    return {
      testCase,
      passed,
      actualResult: uniqueSynonyms,
    };
  } catch (error) {
    return {
      testCase,
      passed: false,
      actualResult: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAllTests(): Promise<{
  dbTests: TestResult[];
  aiTests: TestResult[];
  summary: {
    dbTotal: number;
    dbPassed: number;
    dbFailed: number;
    aiTotal: number;
    aiPassed: number;
    aiFailed: number;
    coverageByCategory: Record<string, { passed: number; total: number }>;
  };
}> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  QA 테스트: DB 기반 동의어 검색 검증");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 캐시 상태 확인
  const cacheStatus = getSynonymCacheStatus();
  console.log("Cache Status:", cacheStatus);
  console.log("");

  // DB 동의어 테스트
  console.log("───────────────────────────────────────────────────────────");
  console.log("  Phase 1: DB 동의어 매칭 테스트");
  console.log("───────────────────────────────────────────────────────────\n");

  const dbResults: TestResult[] = [];
  const coverageByCategory: Record<string, { passed: number; total: number }> =
    {};

  for (const tc of testCases) {
    const result = await runSynonymTest(tc);
    dbResults.push(result);

    // 카테고리별 집계
    if (!coverageByCategory[tc.category]) {
      coverageByCategory[tc.category] = { passed: 0, total: 0 };
    }
    coverageByCategory[tc.category].total++;
    if (result.passed) {
      coverageByCategory[tc.category].passed++;
    }

    // 결과 출력
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} | ${tc.category} | ${tc.description}`);
    console.log(`       Input: "${tc.input}"`);
    console.log(`       Expected: ${JSON.stringify(tc.expectedMatch)}`);
    console.log(`       Actual: ${JSON.stringify(result.actualResult)}`);
    if (result.error) {
      console.log(`       Error: ${result.error}`);
    }
    console.log("");
  }

  // AI 유사성 테스트
  console.log("───────────────────────────────────────────────────────────");
  console.log("  Phase 2: AI 유사성 매칭 테스트 (DB에 없는 키워드)");
  console.log("───────────────────────────────────────────────────────────\n");

  const aiResults: TestResult[] = [];
  for (const tc of aiSimilarityTestCases) {
    const result = await runSynonymTest(tc);
    aiResults.push(result);

    const status = result.passed ? "✅ PASS" : "⚠️ MISS";
    console.log(`${status} | ${tc.category} | ${tc.description}`);
    console.log(`       Input: "${tc.input}"`);
    console.log(`       Expected: ${JSON.stringify(tc.expectedMatch)}`);
    console.log(`       Actual: ${JSON.stringify(result.actualResult)}`);
    console.log("");
  }

  // 요약
  const dbPassed = dbResults.filter((r) => r.passed).length;
  const aiPassed = aiResults.filter((r) => r.passed).length;

  return {
    dbTests: dbResults,
    aiTests: aiResults,
    summary: {
      dbTotal: dbResults.length,
      dbPassed,
      dbFailed: dbResults.length - dbPassed,
      aiTotal: aiResults.length,
      aiPassed,
      aiFailed: aiResults.length - aiPassed,
      coverageByCategory,
    },
  };
}

// ─────────────────────────────────────────────────
// QA 보고서 생성
// ─────────────────────────────────────────────────

function generateQAReport(results: Awaited<ReturnType<typeof runAllTests>>): string {
  const { summary, dbTests, aiTests } = results;

  const report = `
# QA 테스트 보고서: DB 기반 동의어 검색

> 테스트 일시: ${new Date().toISOString()}
> 테스터: Senior QA Engineer (FAANG Background)

---

## Executive Summary

| 테스트 유형 | 총 케이스 | 통과 | 실패 | 성공률 |
|------------|----------|------|------|--------|
| DB 동의어 매칭 | ${summary.dbTotal} | ${summary.dbPassed} | ${summary.dbFailed} | ${((summary.dbPassed / summary.dbTotal) * 100).toFixed(1)}% |
| AI 유사성 매칭 | ${summary.aiTotal} | ${summary.aiPassed} | ${summary.aiFailed} | ${((summary.aiPassed / summary.aiTotal) * 100).toFixed(1)}% |

---

## 직군별 커버리지

| 직군 | 통과 | 총 케이스 | 커버리지 |
|------|------|----------|---------|
${Object.entries(summary.coverageByCategory)
  .map(
    ([cat, { passed, total }]) =>
      `| ${cat} | ${passed} | ${total} | ${((passed / total) * 100).toFixed(1)}% |`
  )
  .join("\n")}

---

## 실패한 테스트 케이스

${
  dbTests
    .filter((r) => !r.passed)
    .map(
      (r) => `
### ❌ ${r.testCase.description}
- **Input**: \`${r.testCase.input}\`
- **Expected**: ${JSON.stringify(r.testCase.expectedMatch)}
- **Actual**: ${JSON.stringify(r.actualResult)}
${r.error ? `- **Error**: ${r.error}` : ""}
`
    )
    .join("") || "없음 (모든 테스트 통과)"
}

---

## AI 유사성 매칭 결과

| 입력 | 기대 결과 | 실제 결과 | 상태 |
|------|----------|----------|------|
${aiTests
  .map(
    (r) =>
      `| \`${r.testCase.input}\` | ${r.testCase.expectedMatch[0]} | ${r.actualResult[0] || "N/A"} | ${r.passed ? "✅" : "⚠️"} |`
  )
  .join("\n")}

---

## QA 소견

### 1. 테스트 결과 분석

${summary.dbPassed === summary.dbTotal ? "✅ DB 동의어 매칭 테스트 **전체 통과**" : `⚠️ DB 동의어 매칭 테스트 **${summary.dbFailed}건 실패**`}

${summary.aiPassed > 0 ? `✅ AI 유사성 매칭 **${summary.aiPassed}건 성공**` : ""}
${summary.aiFailed > 0 ? `⚠️ AI 유사성 매칭 **${summary.aiFailed}건 미지원**` : ""}

### 2. 발견된 이슈

${
  summary.dbFailed > 0
    ? `
- DB에 등록되지 않은 동의어 발견
- 일부 한글 키워드 동의어 누락
`
    : "- DB 동의어 매칭은 정상 작동"
}

${
  summary.aiFailed > 0
    ? `
- **AI 유사성 매칭 미구현**: 현재 시스템은 DB에 정확히 등록된 동의어만 매칭
- 오타 교정, 발음 기반 매칭, 구어체 매칭은 지원되지 않음
`
    : ""
}

### 3. 개선 권장사항

1. **DB 동의어 확장**
   - 실패한 테스트 케이스의 동의어를 skill_synonyms 테이블에 추가

2. **AI 유사성 매칭 구현** (Phase 2)
   - OpenAI Embedding 기반 유사도 계산
   - Levenshtein Distance 기반 오타 교정
   - 발음 유사성 매칭 (예: 쿠베르네티스 → Kubernetes)

3. **자동 동의어 학습**
   - 사용자 검색 로그 분석
   - 자주 검색되지만 매칭되지 않는 키워드 자동 감지

---

## 테스트 환경

- 테스트 프레임워크: Custom TypeScript Test Suite
- 동의어 데이터 소스: skill_synonyms 테이블 (DB 기반)
- 캐시 TTL: 5분
`;

  return report;
}

// Export for use
export { runAllTests, generateQAReport, testCases, aiSimilarityTestCases };
