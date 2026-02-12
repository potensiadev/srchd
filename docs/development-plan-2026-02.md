# SRCHD 개발 계획서 (2026-02)

## 문서 정보
- **작성일**: 2026-02-13
- **버전**: 1.0
- **기반 문서**: 최종 코드 리뷰 리포트 (2026-02-12)

---

# P0: 출시 전 필수 (1-2주)

## P0-1: Lint 에러 제로화

### 목표
- 76개 린트 에러 → 0개
- CI에서 에러 시 빌드 실패 강제
- Warning 예산 도입 (1664 → 1000 → 500 단계적 감소)

### 상세 작업

#### P0-1-1: react/no-unescaped-entities (18개)
**파일 및 수정 내용**:

| 파일 | 라인 | 현재 | 수정 |
|------|------|------|------|
| `app/(auth)/consent/page.tsx` | 319, 357, 374, 426, 449 | `"텍스트"`, `'텍스트'` | `&quot;텍스트&quot;`, `&apos;텍스트&apos;` |
| `app/(marketing)/page.tsx` | 다수 | 동일 | 동일 |

**예시**:
```tsx
// Before
<p>사용자가 "동의"를 클릭하면...</p>

// After
<p>사용자가 &quot;동의&quot;를 클릭하면...</p>
// 또는
<p>사용자가 {'"'}동의{'"'}를 클릭하면...</p>
```

**담당**: Frontend
**예상 소요**: 1시간

---

#### P0-1-2: react-hooks/purity (2개)
**파일**: `app/(dashboard)/analytics/components/skeletons/ChartSkeleton.tsx`

**현재 코드** (라인 29, 33):
```tsx
<div style={{ height: `${30 + Math.random() * 70}%` }} />
```

**수정 방안**:
```tsx
// 옵션 1: 고정 배열 사용
const BAR_HEIGHTS = [45, 72, 38, 65, 55, 80, 42, 68, 50, 75];

export function ChartSkeleton() {
  return (
    <div className="flex gap-2">
      {BAR_HEIGHTS.map((height, i) => (
        <div key={i} style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

// 옵션 2: useMemo로 mount 시 1회 생성
export function ChartSkeleton() {
  const heights = useMemo(() =>
    Array.from({ length: 10 }, () => 30 + Math.random() * 70),
    []
  );
  // ...
}
```

**권장**: 옵션 1 (더 예측 가능)
**담당**: Frontend
**예상 소요**: 30분

---

#### P0-1-3: @typescript-eslint/no-explicit-any (14개)
**파일 목록**:

| 파일 | 라인 | 수정 방법 |
|------|------|----------|
| `app/api/positions/route.ts` | 다수 | Supabase 제네릭 타입 적용 |
| `app/(dashboard)/projects/[id]/page.tsx` | 14, 15 | 인터페이스 정의 |
| `lib/search/*.ts` | 다수 | SearchResult 타입 강화 |

**수정 예시**:
```typescript
// Before
const data: any = await supabase.from("positions").select("*");

// After
interface Position {
  id: string;
  title: string;
  required_skills: string[];
  // ...
}
const { data } = await supabase
  .from("positions")
  .select("*")
  .returns<Position[]>();
```

**담당**: Frontend + Backend
**예상 소요**: 4시간

---

#### P0-1-4: prefer-const (2개)
**파일 및 수정**:

```typescript
// app/(dashboard)/candidates/page.tsx:219
// Before
let errorMessageMap: Record<string, string> = {};
// After
const errorMessageMap: Record<string, string> = {};

// app/api/search/route.ts:456
// Before
let keywords = query.split(/\s+/);
// After
const keywords = query.split(/\s+/);
```

**담당**: Frontend
**예상 소요**: 10분

---

#### P0-1-5: react-hooks/rules-of-hooks (8개)
**파일**: `tests/e2e/fixtures/index.ts`

**문제**: 테스트 fixture에서 React hook 패턴 사용
**수정**: Playwright fixture는 React hook이 아니므로 eslint-disable 또는 파일명 변경

```typescript
// 파일 상단에 추가
/* eslint-disable react-hooks/rules-of-hooks */

// 또는 eslint 설정에서 tests/ 폴더 제외
// eslint.config.js
{
  ignores: ["tests/**/*.ts"]
}
```

**담당**: QA/DevOps
**예상 소요**: 30분

---

#### P0-1-6: CI 린트 게이트 설정
**파일**: `.github/workflows/ci.yml` (신규 또는 수정)

```yaml
name: CI

on:
  push:
    branches: [main, development]
  pull_request:
    branches: [main, development]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      # Phase 1: 에러만 차단
      - name: Lint (errors only)
        run: npm run lint -- --max-warnings 9999

      # Phase 2 (2주 후): Warning 예산 적용
      # - name: Lint (warning budget)
      #   run: npm run lint -- --max-warnings 1000
```

**담당**: DevOps
**예상 소요**: 1시간

---

## P0-2: Redirect Sanitization

### 목표
- Open Redirect 취약점 제거
- 내부 경로만 허용하는 검증 함수 도입

### 상세 작업

#### P0-2-1: 검증 유틸리티 생성
**파일**: `lib/security/redirect.ts` (신규)

```typescript
/**
 * Redirect URL 검증
 * - 내부 경로만 허용 (/ 시작)
 * - 프로토콜 상대 URL 차단 (//)
 * - 외부 URL 차단 (http:, https:, javascript:)
 */

const BLOCKED_PATTERNS = [
  /^\/\//,           // Protocol-relative URL
  /^[a-z]+:/i,       // Any protocol (http:, https:, javascript:, data:)
  /%2f%2f/i,         // URL-encoded //
  /\\/,              // Backslash (IE quirk)
];

const DEFAULT_REDIRECT = "/candidates";

export function sanitizeRedirectPath(path: string | null): string {
  // null/undefined → 기본 경로
  if (!path) {
    return DEFAULT_REDIRECT;
  }

  // 공백 제거
  const trimmed = path.trim();

  // 빈 문자열 → 기본 경로
  if (!trimmed) {
    return DEFAULT_REDIRECT;
  }

  // / 로 시작하지 않으면 → 기본 경로
  if (!trimmed.startsWith("/")) {
    return DEFAULT_REDIRECT;
  }

  // 차단 패턴 검사
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`[Security] Blocked redirect attempt: ${trimmed}`);
      return DEFAULT_REDIRECT;
    }
  }

  // URL 파싱 시도 (추가 검증)
  try {
    const url = new URL(trimmed, "http://localhost");

    // hostname이 localhost가 아니면 외부 URL 시도
    if (url.hostname !== "localhost") {
      console.warn(`[Security] External redirect blocked: ${trimmed}`);
      return DEFAULT_REDIRECT;
    }
  } catch {
    // URL 파싱 실패 → 안전하지 않음
    return DEFAULT_REDIRECT;
  }

  return trimmed;
}

/**
 * 허용된 내부 경로 목록 (화이트리스트 방식)
 */
const ALLOWED_PATHS = [
  "/candidates",
  "/positions",
  "/upload",
  "/search",
  "/settings",
  "/analytics",
  "/consent",
];

export function isAllowedRedirectPath(path: string): boolean {
  const sanitized = sanitizeRedirectPath(path);
  return ALLOWED_PATHS.some(allowed =>
    sanitized === allowed || sanitized.startsWith(`${allowed}/`)
  );
}
```

**담당**: Backend
**예상 소요**: 2시간

---

#### P0-2-2: 미들웨어 적용
**파일**: `middleware.ts`

**수정 전** (라인 139-140, 161-162):
```typescript
const nextUrl = request.nextUrl.searchParams.get("next") || "/candidates";
return NextResponse.redirect(new URL(nextUrl, request.url));
```

**수정 후**:
```typescript
import { sanitizeRedirectPath } from "@/lib/security/redirect";

// 라인 139-140
const rawNext = request.nextUrl.searchParams.get("next");
const nextUrl = sanitizeRedirectPath(rawNext);
return NextResponse.redirect(new URL(nextUrl, request.url));

// 라인 161-162 (동일 수정)
const rawNext = request.nextUrl.searchParams.get("next");
const nextUrl = sanitizeRedirectPath(rawNext);
return NextResponse.redirect(new URL(nextUrl, request.url));
```

**담당**: Backend
**예상 소요**: 30분

---

#### P0-2-3: 단위 테스트
**파일**: `tests/unit/security/redirect.test.ts` (신규)

```typescript
import { describe, it, expect } from "vitest";
import { sanitizeRedirectPath } from "@/lib/security/redirect";

describe("sanitizeRedirectPath", () => {
  // 정상 케이스
  it("allows valid internal paths", () => {
    expect(sanitizeRedirectPath("/candidates")).toBe("/candidates");
    expect(sanitizeRedirectPath("/positions/123")).toBe("/positions/123");
    expect(sanitizeRedirectPath("/search?q=react")).toBe("/search?q=react");
  });

  // 차단 케이스
  it("blocks protocol-relative URLs", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe("/candidates");
    expect(sanitizeRedirectPath("//evil.com/path")).toBe("/candidates");
  });

  it("blocks absolute URLs", () => {
    expect(sanitizeRedirectPath("https://evil.com")).toBe("/candidates");
    expect(sanitizeRedirectPath("http://evil.com/path")).toBe("/candidates");
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/candidates");
  });

  it("blocks URL-encoded attacks", () => {
    expect(sanitizeRedirectPath("/%2f/evil.com")).toBe("/candidates");
    expect(sanitizeRedirectPath("/\\evil.com")).toBe("/candidates");
  });

  // 엣지 케이스
  it("handles null and empty", () => {
    expect(sanitizeRedirectPath(null)).toBe("/candidates");
    expect(sanitizeRedirectPath("")).toBe("/candidates");
    expect(sanitizeRedirectPath("   ")).toBe("/candidates");
  });

  it("rejects paths not starting with /", () => {
    expect(sanitizeRedirectPath("candidates")).toBe("/candidates");
    expect(sanitizeRedirectPath("../etc/passwd")).toBe("/candidates");
  });
});
```

**담당**: QA
**예상 소요**: 1시간

---

## P0-3: CSRF 정책 강화

### 목표
- Origin/Referer 누락 시 요청 거부 (브라우저 요청)
- 서버간 통신은 HMAC 헤더로 분리
- 기존 Webhook 인증 방식 유지

### 상세 작업

#### P0-3-1: CSRF 검증 로직 강화
**파일**: `lib/csrf.ts`

**수정 전** (라인 73-78):
```typescript
if (!origin) {
  if (!referer) {
    return { valid: true };  // ← 취약점
  }
  // ...
}
```

**수정 후**:
```typescript
/**
 * CSRF 검증 개선
 *
 * 정책:
 * 1. 브라우저 요청: Origin 또는 Referer 필수
 * 2. 서버간 요청: X-Internal-Secret 헤더 사용
 * 3. Webhook: 기존 HMAC/Secret 방식 유지
 */

// 서버간 통신용 시크릿 (환경 변수)
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

// Webhook 경로 (CSRF 검증 제외)
const WEBHOOK_PATHS = [
  "/api/webhooks/worker",
  "/api/webhooks/paddle",
];

export function validateOrigin(request: NextRequest): CSRFValidationResult {
  const { pathname } = request.nextUrl;

  // Webhook 경로는 자체 인증 사용
  if (WEBHOOK_PATHS.some(path => pathname.startsWith(path))) {
    return { valid: true };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const internalSecret = request.headers.get("x-internal-secret");

  // 서버간 요청 (Internal Secret)
  if (internalSecret) {
    if (INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
      return { valid: true };
    }
    return { valid: false, error: "Invalid internal secret" };
  }

  // 브라우저 요청: Origin 또는 Referer 필수
  if (!origin && !referer) {
    // 프로덕션에서는 거부, 개발 환경에서는 경고 후 허용
    if (process.env.NODE_ENV === "production") {
      return {
        valid: false,
        error: "Missing origin/referer header"
      };
    }
    console.warn("[CSRF] Missing origin/referer in development");
    return { valid: true };
  }

  // 기존 로직 유지 (Origin/Referer 검증)
  // ... (나머지 코드 동일)
}
```

**담당**: Backend
**예상 소요**: 2시간

---

#### P0-3-2: 환경 변수 추가
**파일**: `.env.example`

```bash
# 서버간 통신용 시크릿 (Worker → API 등)
# 32자 이상 랜덤 문자열 권장
INTERNAL_API_SECRET=your-internal-api-secret-here
```

**파일**: `apps/worker/.env.example`
```bash
# Next.js API 호출 시 사용
INTERNAL_API_SECRET=your-internal-api-secret-here
```

**담당**: DevOps
**예상 소요**: 30분

---

#### P0-3-3: Worker 수정 (서버간 통신)
**파일**: `apps/worker/services/webhook_service.py` (해당 부분)

```python
import os
import httpx

INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET")

async def notify_frontend(endpoint: str, payload: dict):
    """프론트엔드 API에 알림 전송"""
    headers = {
        "Content-Type": "application/json",
    }

    # 서버간 통신 시크릿 추가
    if INTERNAL_SECRET:
        headers["X-Internal-Secret"] = INTERNAL_SECRET

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{FRONTEND_URL}{endpoint}",
            json=payload,
            headers=headers,
            timeout=30.0
        )
        return response
```

**담당**: Backend (Python)
**예상 소요**: 1시간

---

## P0-4: Coverage 도구 설치

### 목표
- Vitest coverage 활성화
- CI에서 coverage 리포트 생성
- 최소 커버리지 임계값 설정 (추후)

### 상세 작업

#### P0-4-1: 패키지 설치
```bash
npm install -D @vitest/coverage-v8
```

**담당**: DevOps
**예상 소요**: 10분

---

#### P0-4-2: Vitest 설정 수정
**파일**: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    exclude: ["node_modules", "tests/e2e/**"],

    // Coverage 설정 추가
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "app/**/*.{ts,tsx}",
        "lib/**/*.ts",
        "hooks/**/*.ts",
        "components/**/*.tsx",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/node_modules/**",
        "app/**/layout.tsx",
        "app/**/loading.tsx",
        "app/**/error.tsx",
      ],
      // Phase 2: 임계값 설정 (추후 활성화)
      // thresholds: {
      //   statements: 60,
      //   branches: 50,
      //   functions: 60,
      //   lines: 60,
      // },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

**담당**: DevOps
**예상 소요**: 30분

---

#### P0-4-3: package.json 스크립트 추가
```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

**담당**: DevOps
**예상 소요**: 10분

---

#### P0-4-4: CI 통합
**파일**: `.github/workflows/ci.yml`

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
```

**담당**: DevOps
**예상 소요**: 30분

---

## P0 완료 체크리스트

```
□ P0-1-1: react/no-unescaped-entities 18개 수정
□ P0-1-2: Math.random() purity 수정
□ P0-1-3: no-explicit-any 14개 타입 지정
□ P0-1-4: prefer-const 2개 수정
□ P0-1-5: rules-of-hooks 테스트 파일 제외
□ P0-1-6: CI lint 게이트 설정
□ P0-2-1: sanitizeRedirectPath 유틸 생성
□ P0-2-2: middleware.ts 적용
□ P0-2-3: redirect 단위 테스트
□ P0-3-1: CSRF 검증 로직 강화
□ P0-3-2: INTERNAL_API_SECRET 환경 변수
□ P0-3-3: Worker 서버간 통신 헤더 추가
□ P0-4-1: @vitest/coverage-v8 설치
□ P0-4-2: vitest.config.ts coverage 설정
□ P0-4-3: package.json 스크립트
□ P0-4-4: CI coverage 업로드
```

**총 예상 소요**: 1주일 (풀타임 1인 기준)

---

# P1: 안정화 (2-4주)

## P1-1: Candidates 페이지 Hook 분리

### 목표
- 717줄 단일 파일 → 5개 모듈로 분리
- useEffect 의존성 경고 해결
- 테스트 용이성 향상

### 아키텍처 설계

```
app/(dashboard)/candidates/
├── page.tsx                    # 메인 컴포넌트 (200줄 이하)
├── components/
│   ├── CandidateCard.tsx       # 개별 카드 UI
│   ├── CandidateStats.tsx      # 통계 섹션
│   └── CandidateFilters.tsx    # 검색/정렬 UI
└── hooks/
    ├── useCandidatesQuery.ts   # 데이터 페칭
    ├── useCandidatesRealtime.ts # Supabase Realtime
    ├── useCandidatesFilter.ts  # 필터/정렬 로직
    └── useBulkRetry.ts         # 일괄 재시도

lib/candidates/
├── types.ts                    # 타입 정의
├── career-utils.ts             # 경력 계산 유틸
└── transform.ts                # 데이터 변환
```

### 상세 작업

#### P1-1-1: 타입 정의 분리
**파일**: `lib/candidates/types.ts` (신규)

```typescript
import type { CandidateStatus } from "@/types";

export interface Career {
  company?: string;
  position?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  is_current?: boolean;
  isCurrent?: boolean;
}

export interface QuickExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  last_company?: string;
  last_position?: string;
}

export interface Candidate {
  id: string;
  name: string;
  last_position: string | null;
  last_company: string | null;
  exp_years: number;
  skills: string[];
  confidence_score: number;
  created_at: string;
  summary: string | null;
  careers: Career[] | null;
  status?: CandidateStatus;
  quick_extracted?: QuickExtractedData;
  hasBeenMatched?: boolean;
  errorMessage?: string;
}

export interface ExperienceDuration {
  years: number;
  months: number;
  totalMonths: number;
}

export type SortBy = "recent" | "confidence" | "exp";

export interface CandidatesFilterState {
  searchQuery: string;
  sortBy: SortBy;
}
```

**담당**: Frontend
**예상 소요**: 1시간

---

#### P1-1-2: 경력 계산 유틸 분리
**파일**: `lib/candidates/career-utils.ts` (신규)

```typescript
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
```

**담당**: Frontend
**예상 소요**: 30분

---

#### P1-1-3: 데이터 페칭 Hook
**파일**: `app/(dashboard)/candidates/hooks/useCandidatesQuery.ts` (신규)

```typescript
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Candidate, Career } from "@/lib/candidates/types";

interface FetchCandidatesResult {
  candidates: Candidate[];
  userId: string | null;
}

async function fetchCandidates(): Promise<FetchCandidatesResult> {
  const supabase = createClient();

  // 1. 현재 사용자 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { candidates: [], userId: null };
  }

  // 2. public.users에서 user_id 조회
  const { data: userData } = await supabase
    .from("users")
    .select("id")
    .eq("email", user.email)
    .single();

  const userId = userData?.id || user.id;

  // 3. 후보자 목록 조회 (RLS 적용)
  const { data: candidatesData, error } = await supabase
    .from("candidates")
    .select(`
      id, name, last_position, last_company, exp_years,
      skills, confidence_score, created_at, summary,
      careers, status, quick_extracted
    `)
    .in("status", ["processing", "parsed", "analyzed", "completed", "failed"])
    .eq("is_latest", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!candidatesData?.length) {
    return { candidates: [], userId };
  }

  // 4. 매칭 여부 조회
  const candidateIds = candidatesData.map((c) => c.id);
  const { data: matchedData } = await supabase
    .from("position_candidates")
    .select("candidate_id")
    .in("candidate_id", candidateIds);

  const matchedSet = new Set(matchedData?.map((m) => m.candidate_id) || []);

  // 5. 실패 에러 메시지 조회
  const failedIds = candidatesData
    .filter((c) => c.status === "failed")
    .map((c) => c.id);

  let errorMap: Record<string, string> = {};
  if (failedIds.length > 0) {
    const { data: jobsData } = await supabase
      .from("processing_jobs")
      .select("candidate_id, error_message")
      .in("candidate_id", failedIds)
      .eq("status", "failed")
      .order("created_at", { ascending: false });

    if (jobsData) {
      const seen = new Set<string>();
      for (const job of jobsData) {
        if (job.candidate_id && !seen.has(job.candidate_id)) {
          seen.add(job.candidate_id);
          if (job.error_message) {
            errorMap[job.candidate_id] = job.error_message;
          }
        }
      }
    }
  }

  // 6. 데이터 조합
  const candidates: Candidate[] = candidatesData.map((c) => ({
    ...c,
    careers: c.careers as Career[] | null,
    hasBeenMatched: matchedSet.has(c.id),
    errorMessage: errorMap[c.id],
  }));

  return { candidates, userId };
}

export function useCandidatesQuery() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    staleTime: 30_000, // 30초
    refetchInterval: 60_000, // 1분
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };

  return {
    candidates: query.data?.candidates ?? [],
    userId: query.data?.userId ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}
```

**담당**: Frontend
**예상 소요**: 3시간

---

#### P1-1-4: Realtime Hook
**파일**: `app/(dashboard)/candidates/hooks/useCandidatesRealtime.ts` (신규)

```typescript
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseCandidatesRealtimeOptions {
  userId: string | null;
  onUpdate: () => void;
  enabled?: boolean;
}

export function useCandidatesRealtime({
  userId,
  onUpdate,
  enabled = true,
}: UseCandidatesRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!userId || !enabled) return;

    // 기존 채널 정리
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`candidates-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("[Realtime] Candidate change:", payload.eventType);
          onUpdate();
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, onUpdate, enabled, supabase]);
}
```

**담당**: Frontend
**예상 소요**: 1시간

---

#### P1-1-5: 필터/정렬 Hook
**파일**: `app/(dashboard)/candidates/hooks/useCandidatesFilter.ts` (신규)

```typescript
"use client";

import { useMemo, useState, useCallback } from "react";
import type { Candidate, SortBy } from "@/lib/candidates/types";
import { calculateTotalExperience } from "@/lib/candidates/career-utils";

interface UseCandidatesFilterOptions {
  candidates: Candidate[];
}

export function useCandidatesFilter({ candidates }: UseCandidatesFilterOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const filteredCandidates = useMemo(() => {
    let result = [...candidates];

    // 검색 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.last_position?.toLowerCase().includes(query) ||
          c.last_company?.toLowerCase().includes(query) ||
          c.skills?.some((s) => s.toLowerCase().includes(query))
      );
    }

    // 정렬
    switch (sortBy) {
      case "confidence":
        result.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
        break;
      case "exp":
        result.sort((a, b) => {
          const expA = calculateTotalExperience(a.careers || []).totalMonths;
          const expB = calculateTotalExperience(b.careers || []).totalMonths;
          return expB - expA;
        });
        break;
      default: // recent
        result.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return result;
  }, [candidates, searchQuery, sortBy]);

  // 통계 계산
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return {
      total: candidates.length,
      needsReview: candidates.filter(
        (c) => c.status === "completed" && !c.hasBeenMatched
      ).length,
      recentWeek: candidates.filter(
        (c) => new Date(c.created_at).getTime() > weekAgo
      ).length,
      processing: candidates.filter(
        (c) => c.status && !["completed", "failed"].includes(c.status)
      ).length,
      failed: candidates.filter((c) => c.status === "failed").length,
    };
  }, [candidates]);

  return {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredCandidates,
    stats,
  };
}
```

**담당**: Frontend
**예상 소요**: 2시간

---

#### P1-1-6: 일괄 재시도 Hook
**파일**: `app/(dashboard)/candidates/hooks/useBulkRetry.ts` (신규)

```typescript
"use client";

import { useState, useCallback } from "react";

interface UseBulkRetryOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useBulkRetry({ onSuccess, onError }: UseBulkRetryOptions = {}) {
  const [isRetrying, setIsRetrying] = useState(false);

  const retryOne = useCallback(async (candidateId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/candidates/${candidateId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("[Retry] Failed:", data?.error?.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error("[Retry] Network error:", error);
      return false;
    }
  }, []);

  const retryBulk = useCallback(
    async (candidateIds: string[]): Promise<void> => {
      if (candidateIds.length === 0 || isRetrying) return;

      setIsRetrying(true);
      try {
        const response = await fetch("/api/candidates/bulk-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data?.error?.message || "일괄 재시도 실패";
          onError?.(message);
          return;
        }

        const result = await response.json();
        console.log("[Bulk Retry] Success:", result.data?.summary);
        onSuccess?.();
      } catch (error) {
        console.error("[Bulk Retry] Network error:", error);
        onError?.("네트워크 오류");
      } finally {
        setIsRetrying(false);
      }
    },
    [isRetrying, onSuccess, onError]
  );

  return {
    isRetrying,
    retryOne,
    retryBulk,
  };
}
```

**담당**: Frontend
**예상 소요**: 1시간

---

#### P1-1-7: 메인 페이지 리팩토링
**파일**: `app/(dashboard)/candidates/page.tsx` (수정)

```typescript
"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Search, Filter, Upload, Loader2, RotateCcw } from "lucide-react";

// Hooks
import { useCandidatesQuery } from "./hooks/useCandidatesQuery";
import { useCandidatesRealtime } from "./hooks/useCandidatesRealtime";
import { useCandidatesFilter } from "./hooks/useCandidatesFilter";
import { useBulkRetry } from "./hooks/useBulkRetry";

// Components
import { CandidateCard } from "./components/CandidateCard";
import { CandidateStats } from "./components/CandidateStats";
import ProcessingCard from "@/components/dashboard/ProcessingCard";
import ResumeUploadDrawer from "@/components/upload/ResumeUploadDrawer";
import { EmptyState, CardSkeleton } from "@/components/ui/empty-state";

// Utils
import { useState } from "react";

export default function CandidatesPage() {
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);

  // 데이터 페칭
  const { candidates, userId, isLoading, invalidate } = useCandidatesQuery();

  // Realtime 구독
  useCandidatesRealtime({
    userId,
    onUpdate: invalidate,
    enabled: !!userId,
  });

  // 필터/정렬
  const {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredCandidates,
    stats,
  } = useCandidatesFilter({ candidates });

  // 일괄 재시도
  const { isRetrying, retryOne, retryBulk } = useBulkRetry({
    onSuccess: invalidate,
  });

  const failedCandidates = candidates.filter((c) => c.status === "failed");

  const handleBulkRetry = useCallback(() => {
    retryBulk(failedCandidates.map((c) => c.id));
  }, [retryBulk, failedCandidates]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 mt-1">
            등록된 모든 후보자를 확인하고 관리하세요
          </p>
        </div>
        {candidates.length > 0 && (
          <button
            onClick={() => setIsUploadDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary
                     hover:bg-primary/90 text-white font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            이력서 업로드
          </button>
        )}
      </div>

      <ResumeUploadDrawer
        isOpen={isUploadDrawerOpen}
        onClose={() => setIsUploadDrawerOpen(false)}
      />

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="이름, 직책, 회사, 스킬로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-gray-200
                     text-gray-900 placeholder:text-gray-400 focus:outline-none
                     focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-3 rounded-xl bg-white border border-gray-200"
          >
            <option value="recent">최근 등록순</option>
            <option value="confidence">신뢰도순</option>
            <option value="exp">경력순</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <CandidateStats stats={stats} />

      {/* Processing Status */}
      <div className="flex items-center justify-between">
        {stats.processing > 0 && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{stats.processing}개의 이력서 분석 중...</span>
          </div>
        )}
        {failedCandidates.length >= 2 && (
          <button
            onClick={handleBulkRetry}
            disabled={isRetrying}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                     bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium"
          >
            {isRetrying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                재시도 중...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                실패 {failedCandidates.length}개 모두 재시도
              </>
            )}
          </button>
        )}
      </div>

      {/* Candidate List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton count={6} />
        </div>
      ) : filteredCandidates.length === 0 ? (
        <EmptyState
          variant={searchQuery ? "search-results" : "candidates"}
          title={searchQuery ? "검색 결과가 없습니다" : undefined}
          cta={!searchQuery ? {
            label: "이력서 업로드",
            onClick: () => setIsUploadDrawerOpen(true),
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map((candidate) =>
            candidate.status && candidate.status !== "completed" ? (
              <ProcessingCard
                key={candidate.id}
                candidate={candidate}
                errorMessage={candidate.errorMessage}
                onRetry={retryOne}
              />
            ) : (
              <CandidateCard key={candidate.id} candidate={candidate} />
            )
          )}
        </div>
      )}
    </div>
  );
}
```

**담당**: Frontend
**예상 소요**: 4시간

---

## P1-2: Skeleton Purity 수정

### 작업 내용
P0-1-2에서 상세 설명됨. P1에서 추가 Skeleton 컴포넌트 검토.

**파일 목록**:
- `app/(dashboard)/analytics/components/skeletons/ChartSkeleton.tsx`
- `components/ui/skeleton.tsx` (확인 필요)

**담당**: Frontend
**예상 소요**: 1시간

---

## P1-3: useEffect 의존성 수정

### 작업 내용
P1-1의 Hook 분리로 대부분 해결됨. 나머지 파일:

| 파일 | 라인 | 누락 의존성 | 해결 방법 |
|------|------|------------|----------|
| `positions/page.tsx` | 116 | `fetchPositions`, `supabase.auth` | Hook 분리 또는 useCallback |
| `projects/[id]/page.tsx` | 20 | `fetchProjectDetails` | useCallback 래핑 |
| `review/page.tsx` | 27 | `fetchReviewQueue` | useCallback 래핑 |
| `settings/page.tsx` | 68 | `fetchProfile` | useCallback 래핑 |

**수정 패턴**:
```typescript
// Before
useEffect(() => {
  fetchData();
}, []); // 경고: fetchData 누락

// After
const fetchData = useCallback(async () => {
  // ...
}, [dependency1, dependency2]);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

**담당**: Frontend
**예상 소요**: 3시간

---

## P1-4: API 공통 래퍼 확대

### 목표
- 모든 API 라우트에 일관된 인증/에러/로깅 적용
- 중복 코드 제거

### 상세 작업

#### P1-4-1: API 래퍼 생성
**파일**: `lib/api/handler.ts` (신규)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRateLimit } from "@/lib/rate-limit";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiInternalError } from "@/lib/api/response";

type RateLimitContext = "default" | "search" | "upload";

interface ApiHandlerOptions {
  rateLimit?: RateLimitContext;
  requireAuth?: boolean;
  requireConsent?: boolean;
}

interface ApiContext {
  request: NextRequest;
  user: { id: string; email: string };
  supabase: ReturnType<typeof createClient>;
}

type ApiHandler<T> = (ctx: ApiContext) => Promise<NextResponse<T>>;

export function createApiHandler<T>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions = {}
) {
  const { rateLimit = "default", requireAuth = true } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    // 1. Rate Limiting
    const rateLimitResult = await withRateLimit(request, rateLimit);
    if (rateLimitResult) return rateLimitResult;

    // 2. Authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (requireAuth && (authError || !user)) {
      return apiUnauthorized();
    }

    // 3. Execute Handler
    try {
      const ctx: ApiContext = {
        request,
        user: user!,
        supabase,
      };

      return await handler(ctx);
    } catch (error) {
      console.error("[API Error]", error);

      if (error instanceof ApiValidationError) {
        return apiBadRequest(error.message);
      }

      return apiInternalError();
    }
  };
}

// 커스텀 에러 클래스
export class ApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiValidationError";
  }
}
```

**담당**: Backend
**예상 소요**: 4시간

---

#### P1-4-2: 기존 라우트 마이그레이션
**예시**: `app/api/candidates/route.ts`

```typescript
// Before (현재)
export async function GET(request: NextRequest) {
  const rateLimitResult = await withRateLimit(request, "default");
  if (rateLimitResult) return rateLimitResult;

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return apiUnauthorized();
  }

  try {
    const { data } = await supabase.from("candidates").select("*");
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError();
  }
}

// After (리팩토링)
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler(async ({ supabase }) => {
  const { data } = await supabase.from("candidates").select("*");
  return apiSuccess(data);
});
```

**마이그레이션 우선순위**:
1. `/api/candidates/*` (가장 많이 사용)
2. `/api/search/*`
3. `/api/positions/*`
4. 나머지

**담당**: Backend
**예상 소요**: 8시간 (전체)

---

## P1-5: Lint Warning 감소

### 목표
- 1664개 → 500개 이하
- 주요 카테고리별 해결

### Warning 카테고리별 해결 방안

| 카테고리 | 개수(추정) | 해결 방법 |
|---------|----------|----------|
| `@typescript-eslint/no-unused-vars` | ~200 | 삭제 또는 `_` prefix |
| `react-hooks/exhaustive-deps` | ~50 | P1-3에서 해결 |
| `@next/next/no-img-element` | ~30 | `next/image` 사용 |
| `prefer-const` | ~20 | `const`로 변경 |

**자동 수정 가능**:
```bash
npm run lint -- --fix
# 71개 자동 수정 가능
```

**담당**: Frontend
**예상 소요**: 8시간

---

## P1 완료 체크리스트

```
□ P1-1-1: lib/candidates/types.ts 생성
□ P1-1-2: lib/candidates/career-utils.ts 생성
□ P1-1-3: useCandidatesQuery hook 생성
□ P1-1-4: useCandidatesRealtime hook 생성
□ P1-1-5: useCandidatesFilter hook 생성
□ P1-1-6: useBulkRetry hook 생성
□ P1-1-7: candidates/page.tsx 리팩토링
□ P1-2: Skeleton purity 추가 검토
□ P1-3: useEffect 의존성 수정 (4개 파일)
□ P1-4-1: API 공통 래퍼 생성
□ P1-4-2: 기존 라우트 마이그레이션
□ P1-5: Lint warning 500개 이하
```

**총 예상 소요**: 3주 (풀타임 1인 기준)

---

# P2: 확장 국면 (3-6개월)

## P2-1: Worker 플랫폼 고도화

### 배경
- 현재 RQ 기반으로 동작 중
- Queue 분리, 백프레셔, DLQ 이미 구현됨
- 대규모 트래픽 시 수평 확장 필요

### 전환 판단 기준
다음 조건 중 2개 이상 해당 시 전환 검토:
- [ ] 동시 처리량 요구 > 100 이력서/시간
- [ ] 평균 큐 대기 시간 > 5분
- [ ] Worker 단일 장애로 전체 서비스 영향
- [ ] GPU 기반 처리 (OCR, 이미지) 필요

### Phase 2-1-A: 현재 아키텍처 최적화 (선행)

#### 2-1-A-1: DLQ 자동 정리 스케줄러
**파일**: `apps/worker/services/dlq_scheduler.py` (신규)

```python
"""
DLQ 자동 정리 스케줄러
- 30일 이상 된 항목 자동 삭제
- 매일 03:00 AM KST 실행
"""

import asyncio
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.queue_service import QueueService

class DLQScheduler:
    def __init__(self, queue_service: QueueService):
        self.queue_service = queue_service
        self.scheduler = AsyncIOScheduler()

    def start(self):
        # 매일 03:00 KST 실행
        self.scheduler.add_job(
            self.cleanup_old_entries,
            'cron',
            hour=3,
            minute=0,
            timezone='Asia/Seoul'
        )
        self.scheduler.start()

    async def cleanup_old_entries(self):
        """30일 이상 된 DLQ 항목 정리"""
        cutoff = datetime.now() - timedelta(days=30)

        stats_before = await self.queue_service.get_dlq_stats()

        await self.queue_service.clear_dlq(
            before_date=cutoff,
            dry_run=False
        )

        stats_after = await self.queue_service.get_dlq_stats()

        print(f"[DLQ Cleanup] Removed {stats_before['total'] - stats_after['total']} entries")
```

**담당**: Backend (Python)
**예상 소요**: 4시간

---

#### 2-1-A-2: 큐 모니터링 API
**파일**: `apps/worker/routes/monitoring.py` (신규)

```python
from fastapi import APIRouter
from services.queue_service import QueueService

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

@router.get("/queues")
async def get_queue_stats():
    """전체 큐 상태 조회"""
    service = QueueService()

    return {
        "queues": {
            "fast": service.get_queue_depth("fast_queue"),
            "slow": service.get_queue_depth("slow_queue"),
            "parse": service.get_queue_depth("parse_queue"),
            "process": service.get_queue_depth("process_queue"),
        },
        "dlq": await service.get_dlq_stats(),
        "workers": service.get_active_workers(),
        "throttling": service.should_throttle(),
    }

@router.get("/health/detailed")
async def detailed_health():
    """상세 헬스 체크"""
    return {
        "redis": await check_redis_connection(),
        "supabase": await check_supabase_connection(),
        "workers": get_worker_status(),
    }
```

**담당**: Backend (Python)
**예상 소요**: 3시간

---

### Phase 2-1-B: Celery 전환 (조건부)

#### 전환 시 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                  │
│                                                      │
│  ┌──────────────┐     ┌──────────────────────┐     │
│  │   API Pod    │     │    Redis Cluster     │     │
│  │  (FastAPI)   │────▶│   (Sentinel HA)      │     │
│  │   HPA: 2-10  │     │                      │     │
│  └──────────────┘     └──────────┬───────────┘     │
│                                   │                  │
│         ┌─────────────────────────┼─────────────┐   │
│         ▼                         ▼             ▼   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │ Celery     │  │ Celery     │  │ Celery     │   │
│  │ Worker     │  │ Worker     │  │ Worker     │   │
│  │ (fast-q)   │  │ (slow-q)   │  │ (gpu-q)    │   │
│  │ HPA: 2-20  │  │ HPA: 1-5   │  │ HPA: 0-3   │   │
│  └────────────┘  └────────────┘  └────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │              Celery Beat                      │  │
│  │   (스케줄러: DLQ 정리, 통계 집계)              │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### 2-1-B-1: Celery 설정
**파일**: `apps/worker/celery_config.py` (신규)

```python
from celery import Celery

app = Celery(
    "rai_worker",
    broker=os.getenv("REDIS_URL"),
    backend=os.getenv("REDIS_URL"),
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,

    # 큐 라우팅
    task_routes={
        "tasks.parse_resume": {"queue": "parse_queue"},
        "tasks.process_resume": {"queue": "process_queue"},
        "tasks.full_pipeline": {"queue": "fast_queue"},
        "tasks.full_pipeline_hwp": {"queue": "slow_queue"},
    },

    # 재시도 설정
    task_default_retry_delay=30,
    task_max_retries=3,

    # 백프레셔
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# Beat 스케줄 (DLQ 정리 등)
app.conf.beat_schedule = {
    "cleanup-dlq-daily": {
        "task": "tasks.cleanup_dlq",
        "schedule": crontab(hour=3, minute=0),
    },
    "aggregate-stats-hourly": {
        "task": "tasks.aggregate_stats",
        "schedule": crontab(minute=0),
    },
}
```

**담당**: Backend (Python)
**예상 소요**: 16시간

---

#### 2-1-B-2: Kubernetes 매니페스트
**파일**: `k8s/worker-deployment.yaml` (신규)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rai-worker-fast
spec:
  replicas: 2
  selector:
    matchLabels:
      app: rai-worker
      queue: fast
  template:
    metadata:
      labels:
        app: rai-worker
        queue: fast
    spec:
      containers:
      - name: worker
        image: rai-worker:latest
        command: ["celery", "-A", "celery_config", "worker", "-Q", "fast_queue,parse_queue"]
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: rai-secrets
              key: redis-url
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rai-worker-fast-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rai-worker-fast
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: redis_queue_length
        selector:
          matchLabels:
            queue: fast_queue
      target:
        type: AverageValue
        averageValue: "10"
```

**담당**: DevOps
**예상 소요**: 16시간

---

## P2-2: 검색 엔진 이원화 PoC

### 배경
- 현재 pgvector 기반 하이브리드 검색
- 100K+ 후보자 시 성능 검증 필요
- Boolean 검색, Faceted 검색 요구사항

### 전환 판단 기준
- [ ] 검색 p95 latency > 500ms
- [ ] 후보자 수 > 50,000
- [ ] 복잡한 Boolean 쿼리 요구
- [ ] Faceted navigation 필요

### Phase 2-2-A: 현재 검색 최적화 (선행)

#### 2-2-A-1: Skill Expansion 배치화
**파일**: `lib/search/synonym-service.ts` (수정)

```typescript
// Before: 개별 쿼리
async function expandSkill(skill: string): Promise<string[]> {
  const { data } = await supabase
    .from("skill_synonyms")
    .select("variant")
    .eq("canonical_skill", skill.toLowerCase());
  return data?.map(d => d.variant) || [skill];
}

// After: 배치 쿼리
async function expandSkillsBatch(skills: string[]): Promise<Map<string, string[]>> {
  const normalized = skills.map(s => s.toLowerCase());

  const { data } = await supabase
    .from("skill_synonyms")
    .select("canonical_skill, variant")
    .in("canonical_skill", normalized);

  const result = new Map<string, string[]>();

  // 초기화
  for (const skill of normalized) {
    result.set(skill, [skill]);
  }

  // 동의어 추가
  for (const row of data || []) {
    const existing = result.get(row.canonical_skill) || [];
    existing.push(row.variant);
    result.set(row.canonical_skill, existing);
  }

  return result;
}
```

**담당**: Backend
**예상 소요**: 2시간

---

#### 2-2-A-2: 검색 성능 모니터링
**파일**: `lib/search/metrics.ts` (신규)

```typescript
interface SearchMetrics {
  queryId: string;
  userId: string;
  query: string;
  filterCount: number;
  resultCount: number;
  cacheHit: boolean;
  timings: {
    total: number;
    cacheCheck: number;
    skillExpansion: number;
    rdbFilter: number;
    vectorSearch: number;
    scoring: number;
  };
  timestamp: Date;
}

export async function logSearchMetrics(metrics: SearchMetrics): Promise<void> {
  // 1. 콘솔 로그 (개발)
  console.log("[Search Metrics]", JSON.stringify(metrics));

  // 2. Supabase 저장 (분석용)
  await supabase.from("search_metrics").insert({
    query_id: metrics.queryId,
    user_id: metrics.userId,
    query_text: metrics.query,
    filter_count: metrics.filterCount,
    result_count: metrics.resultCount,
    cache_hit: metrics.cacheHit,
    total_ms: metrics.timings.total,
    cache_check_ms: metrics.timings.cacheCheck,
    skill_expansion_ms: metrics.timings.skillExpansion,
    rdb_filter_ms: metrics.timings.rdbFilter,
    vector_search_ms: metrics.timings.vectorSearch,
    scoring_ms: metrics.timings.scoring,
  });
}
```

**담당**: Backend
**예상 소요**: 4시간

---

### Phase 2-2-B: Elasticsearch 도입 (조건부)

#### 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                Search Infrastructure                 │
│                                                      │
│  ┌────────────────┐                                 │
│  │  Query Router  │                                 │
│  └───────┬────────┘                                 │
│          │                                           │
│    ┌─────┴─────┐                                    │
│    ▼           ▼                                    │
│ Simple      Complex                                  │
│ Queries     Queries                                  │
│    │           │                                    │
│    ▼           ▼                                    │
│ ┌──────┐   ┌──────────────┐                        │
│ │ PG   │   │ Elasticsearch │                        │
│ │vector│   │  (OpenSearch) │                        │
│ └──────┘   └──────────────┘                        │
│                 ▲                                    │
│                 │                                    │
│         ┌──────┴──────┐                            │
│         │   Debezium  │  ← CDC                     │
│         │     CDC     │                            │
│         └─────────────┘                            │
│                 ▲                                    │
│                 │                                    │
│         ┌──────┴──────┐                            │
│         │ PostgreSQL  │                            │
│         │  (Source)   │                            │
│         └─────────────┘                            │
└─────────────────────────────────────────────────────┘
```

#### 2-2-B-1: Elasticsearch 인덱스 설계
**파일**: `elasticsearch/mappings/candidates.json` (신규)

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "user_id": { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "korean",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "skills": {
        "type": "keyword",
        "normalizer": "lowercase"
      },
      "skills_text": {
        "type": "text",
        "analyzer": "standard"
      },
      "exp_years": { "type": "integer" },
      "last_company": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "last_position": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "summary": {
        "type": "text",
        "analyzer": "korean"
      },
      "embedding": {
        "type": "dense_vector",
        "dims": 1536,
        "index": true,
        "similarity": "cosine"
      },
      "created_at": { "type": "date" },
      "confidence_score": { "type": "float" }
    }
  },
  "settings": {
    "analysis": {
      "analyzer": {
        "korean": {
          "type": "custom",
          "tokenizer": "nori_tokenizer",
          "filter": ["lowercase", "nori_part_of_speech"]
        }
      }
    },
    "index": {
      "number_of_shards": 3,
      "number_of_replicas": 1
    }
  }
}
```

**담당**: Backend
**예상 소요**: 8시간

---

#### 2-2-B-2: CDC 파이프라인 (Debezium)
**파일**: `docker-compose.cdc.yml` (신규)

```yaml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  debezium:
    image: debezium/connect:2.4
    depends_on:
      - kafka
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: 1
      CONFIG_STORAGE_TOPIC: debezium_configs
      OFFSET_STORAGE_TOPIC: debezium_offsets
      STATUS_STORAGE_TOPIC: debezium_statuses
    volumes:
      - ./debezium/connectors:/kafka/connect

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"

  es-sink-connector:
    image: rai-es-sink:latest
    depends_on:
      - kafka
      - elasticsearch
    environment:
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
      ELASTICSEARCH_URL: http://elasticsearch:9200
```

**담당**: DevOps
**예상 소요**: 24시간

---

## P2-3: Outbox 기반 EDA 확장

### 배경
- 현재 Webhook + Supabase Realtime 사용
- 서비스 간 느슨한 결합 필요
- Audit trail 요구사항

### 전환 판단 기준
- [ ] 서비스 분리 (Microservices) 시작
- [ ] Audit 로그 법적 요구사항
- [ ] 외부 시스템 연동 증가

### Phase 2-3-A: Outbox 패턴 도입

#### 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   Outbox Pattern                     │
│                                                      │
│  ┌────────────┐     ┌────────────────────┐         │
│  │  API/Worker │────▶│   PostgreSQL        │         │
│  │  (Producer) │     │                    │         │
│  └────────────┘     │  ┌──────────────┐  │         │
│                      │  │ candidates   │  │         │
│                      │  └──────────────┘  │         │
│                      │  ┌──────────────┐  │         │
│                      │  │ outbox_events│◀─┼─ Trigger│
│                      │  └──────┬───────┘  │         │
│                      └─────────┼──────────┘         │
│                                │                     │
│                      ┌─────────▼───────┐            │
│                      │  Event Relay    │            │
│                      │  (pg_notify or  │            │
│                      │   polling)      │            │
│                      └─────────┬───────┘            │
│                                │                     │
│              ┌─────────────────┼─────────────────┐  │
│              ▼                 ▼                 ▼  │
│        ┌──────────┐     ┌──────────┐     ┌──────────┐
│        │ Webhook  │     │ Analytics│     │  Search  │
│        │ Handler  │     │  Service │     │  Index   │
│        └──────────┘     └──────────┘     └──────────┘
└─────────────────────────────────────────────────────┘
```

#### 2-3-A-1: Outbox 테이블 생성
**파일**: `supabase/migrations/xxx_outbox_events.sql` (신규)

```sql
-- Outbox Events Table
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50) NOT NULL,  -- 'candidate', 'position', 'user'
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,     -- 'CandidateCreated', 'CandidateAnalyzed'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT
);

-- 인덱스
CREATE INDEX idx_outbox_unprocessed
  ON outbox_events(created_at)
  WHERE processed_at IS NULL;

CREATE INDEX idx_outbox_aggregate
  ON outbox_events(aggregate_type, aggregate_id);

-- 이벤트 생성 함수
CREATE OR REPLACE FUNCTION create_outbox_event(
  p_aggregate_type VARCHAR,
  p_aggregate_id UUID,
  p_event_type VARCHAR,
  p_payload JSONB
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES (p_aggregate_type, p_aggregate_id, p_event_type, p_payload)
  RETURNING id INTO v_event_id;

  -- NOTIFY로 실시간 알림
  PERFORM pg_notify('outbox_events', v_event_id::text);

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Candidates 테이블 트리거
CREATE OR REPLACE FUNCTION candidates_outbox_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM create_outbox_event(
      'candidate',
      NEW.id,
      'CandidateCreated',
      jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'name', NEW.name,
        'status', NEW.status
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- 상태 변경 시 이벤트 발행
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM create_outbox_event(
        'candidate',
        NEW.id,
        'CandidateStatusChanged',
        jsonb_build_object(
          'id', NEW.id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'confidence_score', NEW.confidence_score
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_outbox_trigger
AFTER INSERT OR UPDATE ON candidates
FOR EACH ROW EXECUTE FUNCTION candidates_outbox_trigger();
```

**담당**: Backend
**예상 소요**: 8시간

---

#### 2-3-A-2: Event Relay Service
**파일**: `apps/event-relay/main.py` (신규)

```python
"""
Event Relay Service
- Outbox 테이블에서 이벤트 읽기
- 구독자에게 전달 (Webhook, Kafka, etc.)
"""

import asyncio
import asyncpg
from typing import Callable, Dict, List

class EventRelay:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.handlers: Dict[str, List[Callable]] = {}
        self.pool = None

    async def start(self):
        self.pool = await asyncpg.create_pool(self.database_url)

        # pg_notify 리스너
        conn = await self.pool.acquire()
        await conn.add_listener('outbox_events', self.on_notify)

        # 초기 미처리 이벤트 처리
        await self.process_pending()

    async def on_notify(self, conn, pid, channel, payload):
        """새 이벤트 알림 처리"""
        event_id = payload
        await self.process_event(event_id)

    async def process_pending(self):
        """미처리 이벤트 일괄 처리"""
        async with self.pool.acquire() as conn:
            events = await conn.fetch("""
                SELECT id, aggregate_type, aggregate_id, event_type, payload
                FROM outbox_events
                WHERE processed_at IS NULL
                ORDER BY created_at
                LIMIT 100
            """)

            for event in events:
                await self.process_event(event['id'])

    async def process_event(self, event_id: str):
        """단일 이벤트 처리"""
        async with self.pool.acquire() as conn:
            event = await conn.fetchrow("""
                SELECT * FROM outbox_events WHERE id = $1
            """, event_id)

            if not event or event['processed_at']:
                return

            try:
                # 핸들러 실행
                handlers = self.handlers.get(event['event_type'], [])
                for handler in handlers:
                    await handler(event)

                # 처리 완료 마킹
                await conn.execute("""
                    UPDATE outbox_events
                    SET processed_at = NOW()
                    WHERE id = $1
                """, event_id)

            except Exception as e:
                # 에러 기록
                await conn.execute("""
                    UPDATE outbox_events
                    SET retry_count = retry_count + 1,
                        error_message = $2
                    WHERE id = $1
                """, event_id, str(e))

    def subscribe(self, event_type: str, handler: Callable):
        """이벤트 핸들러 등록"""
        if event_type not in self.handlers:
            self.handlers[event_type] = []
        self.handlers[event_type].append(handler)


# 사용 예시
async def main():
    relay = EventRelay(os.getenv("DATABASE_URL"))

    # 핸들러 등록
    relay.subscribe("CandidateCreated", notify_frontend)
    relay.subscribe("CandidateStatusChanged", update_search_index)
    relay.subscribe("CandidateStatusChanged", send_analytics)

    await relay.start()

    # 무한 대기
    while True:
        await asyncio.sleep(60)
        await relay.process_pending()  # 누락 방지
```

**담당**: Backend (Python)
**예상 소요**: 16시간

---

## P2 완료 체크리스트

```
Phase 2-1: Worker 플랫폼
□ 2-1-A-1: DLQ 자동 정리 스케줄러
□ 2-1-A-2: 큐 모니터링 API
□ 2-1-B-1: Celery 설정 (조건부)
□ 2-1-B-2: Kubernetes 매니페스트 (조건부)

Phase 2-2: 검색 엔진
□ 2-2-A-1: Skill expansion 배치화
□ 2-2-A-2: 검색 성능 모니터링
□ 2-2-B-1: ES 인덱스 설계 (조건부)
□ 2-2-B-2: CDC 파이프라인 (조건부)

Phase 2-3: EDA 확장
□ 2-3-A-1: Outbox 테이블 생성
□ 2-3-A-2: Event Relay Service
```

**총 예상 소요**: 3-6개월 (조건부 작업 포함)

---

# 부록: 마일스톤 타임라인

```
Week 1-2:   P0 완료 (출시 전 필수)
            ├─ Lint 에러 0화
            ├─ Redirect sanitization
            ├─ CSRF 강화
            └─ Coverage 도구

Week 3-5:   P1-1 ~ P1-3 (페이지 리팩토링)
            ├─ Candidates 페이지 hook 분리
            ├─ Skeleton purity
            └─ useEffect 의존성

Week 6-8:   P1-4 ~ P1-5 (API/Lint)
            ├─ API 공통 래퍼
            └─ Lint warning 감소

Month 3-4:  P2-1, P2-2-A (Worker/검색 최적화)
            ├─ DLQ 스케줄러
            ├─ 모니터링 API
            └─ 검색 배치화/메트릭

Month 5-6:  P2-2-B, P2-3 (조건부 확장)
            ├─ Elasticsearch (필요 시)
            └─ Outbox/EDA (필요 시)
```

---

# 담당자 배정 (예시)

| 역할 | P0 | P1 | P2 |
|------|----|----|----|
| Frontend | Lint, Skeleton, Hooks | 페이지 분리, Warning | - |
| Backend (TS) | Redirect, CSRF | API 래퍼 | 검색 최적화 |
| Backend (Python) | - | - | Worker, EDA |
| DevOps | CI, Coverage | - | K8s, CDC |
| QA | 테스트 작성 | E2E | 성능 테스트 |

---

**문서 끝**
