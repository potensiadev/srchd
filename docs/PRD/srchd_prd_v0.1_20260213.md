# 서치드(srchd) PRD v0.1

> **Version**: 0.1
> **Date**: 2026-02-13
> **Status**: Phase 1 Near Completion → Closed Beta
> **Author**: Product Manager
> **Package Name**: `srchd` (package.json 반영 완료)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Persona](#3-target-persona)
4. [Product Vision & Strategy](#4-product-vision--strategy)
5. [Pricing & Cost Analysis](#5-pricing--cost-analysis)
6. [Credit System](#6-credit-system)
7. [Core Features — 구현 완료](#7-core-features--구현-완료)
8. [신규 기획 — JD Auto-Match](#8-신규-기획--jd-auto-match)
9. [신규 기획 — 후보자 제출 패키지](#9-신규-기획--후보자-제출-패키지)
10. [신규 기획 — Overage Billing](#10-신규-기획--overage-billing)
11. [신규 기획 — 3-Way Cross-Check 활성화](#11-신규-기획--3-way-cross-check-활성화)
12. [이메일 알림 시스템](#12-이메일-알림-시스템)
13. [에러 모니터링 시스템](#13-에러-모니터링-시스템)
14. [온보딩 플로우](#14-온보딩-플로우)
15. [E2E 테스트 전략](#15-e2e-테스트-전략)
16. [Data Architecture](#16-data-architecture)
17. [Security & Compliance](#17-security--compliance)
18. [Phase Roadmap](#18-phase-roadmap)
19. [Success Metrics](#19-success-metrics)
20. [Appendix](#20-appendix)
21. [Code Review Action Plan](#21-code-review-action-plan)

---

## 1. Executive Summary

**서치드(srchd)**는 헤드헌터의 PC에 방치된 이력서를 AI가 자동 분석하여 검색 가능한 인재 자산으로 전환하고, 개인정보를 안전하게 보호하면서 블라인드 내보내기까지 제공하는 **AI 이력서 분석 플랫폼**입니다.

### Product Snapshot

| 항목 | 내용 |
|------|------|
| **Product Name** | 서치드 (srchd) |
| **Service Domain** | HR Tech / Recruitment SaaS |
| **Target Market** | 한국 프리랜서 헤드헌터 & 소규모 서치펌 |
| **Core Philosophy** | "Zero Tolerance for Error" |
| **Current Phase** | Phase 1 — 95% 완료, Closed Beta 준비 |
| **Deployment** | Vercel (Frontend) + Railway (Worker) + Supabase Cloud |
| **Plans** | Starter (무료) / Pro (유료) — 2-tier |

### Key Differentiators

| # | 차별점 |
|---|--------|
| 1 | **Multi-Agent AI Pipeline** — 6개 전문 에이전트 역할 분담 |
| 2 | **Cross-Check** — GPT-4o + Gemini 2-Way (Starter), + Claude 3-Way (Pro) |
| 3 | **HWP 3-Stage Fallback** — 한국 특화 HWP 파싱 보장 |
| 4 | **Privacy-First** — AES-256-GCM 암호화, 블라인드 내보내기 |
| 5 | **Hybrid Search** — RDB 필터 + Vector 시맨틱 검색 |

---

## 2. Problem Statement

### 헤드헌터의 3대 고통

| # | Pain Point | 현재 대안의 한계 |
|---|-----------|----------------|
| 🔴 | **Dead Assets** — PC에 수천 개 이력서가 검색 불가 상태로 방치 | 엑셀/폴더 관리로는 불가능 |
| 🔴 | **Risk & Admin** — 블라인드 처리 실수로 직거래 리스크, 행정 시간 40% 소모 | 수작업만으로 불가 |
| 🔴 | **Legal Risk** — 개인정보 처리 법적 책임 증가, 입수경위 입증 의무 | 체계적 관리 도구 부재 |

### 시장 컨텍스트

| 지표 | 수치 |
|------|------|
| 한국 헤드헌터 수 (추정) | ~15,000명 |
| 프리랜서/소규모 비율 | ~60% |
| 평균 보유 이력서 | 1,000~5,000건/인 |
| 커미션 단가 | 연봉의 15~25% (평균 ~₩10,000,000/건) |

---

## 3. Target Persona

### Primary: 이서연 (프리랜서 헤드헌터)

| 항목 | 내용 |
|------|------|
| **나이/직업** | 38세, IT 프리랜서 헤드헌터 (경력 8년) |
| **보유 이력서** | 3,200건 (HWP 60%, PDF 30%, DOCX 10%) |
| **월 포지션** | 3~5개 |
| **기술 수준** | 비기술직 — 엑셀, 카톡이 주 업무 도구 |
| **Pain** | "좋은 후보자가 내 PC 어딘가에 있는데, 찾을 수가 없어요" |
| **Willingness to Pay** | 월 5~15만원 (커미션 대비 미미한 비용) |

---

## 4. Product Vision & Strategy

```
Dead Files  →  Searchable Assets  →  Revenue Engine
(현재)         (Phase 1)              (Phase 2)
```

| Phase | 목표 | 상태 |
|-------|------|------|
| Phase 1 | AI 분석 + 검색 + 블라인드 + CRM 기초 | 95% ✅ |
| Phase 2 | JD Auto-Match + 제출 패키지 + 3-Way | 기획 중 |

---

## 5. Pricing & Cost Analysis

### 5.1. AI 비용 분석 (건당, Worst Case)

| 항목 | 2-Way (Starter) | 3-Way (Pro) |
|------|-----------------|-------------|
| GPT-4o (분석) | $0.025 (~₩35) | $0.025 (~₩35) |
| Gemini 2.0 Flash | $0.005 (~₩7) | $0.005 (~₩7) |
| Claude 3.5 Sonnet | — | $0.030 (~₩42) |
| Embedding (청킹) | $0.001 (~₩1) | $0.001 (~₩1) |
| **소계 (정상)** | **$0.031 (~₩43)** | **$0.061 (~₩85)** |
| **Worst Case (재시도 포함 ×2)** | **~₩86** | **~₩170** |

### 5.2. 인프라 비용 (월간, 100 사용자 기준)

| 항목 | 월 비용 | 사용자당 |
|------|---------|---------|
| Vercel Pro | ₩28,000 | ₩280 |
| Railway (Worker) | ₩28,000 | ₩280 |
| Supabase Pro | ₩35,000 | ₩350 |
| Upstash Redis | ₩14,000 | ₩140 |
| Sentry | ₩36,000 | ₩360 |
| **합계** | **₩141,000** | **₩1,410** |

### 5.3. Worst Case 시나리오별 비용

| 시나리오 | Starter (30 크레딧) | Pro (200 크레딧) |
|---------|---------------------|-----------------|
| AI 비용 (worst) | 30 × ₩86 = ₩2,580 | 200 × ₩170 = ₩34,000 |
| 인프라 배분 | ₩1,410 | ₩1,410 |
| **총 비용** | **₩3,990** | **₩35,410** |

### 5.4. 요금제 결정 (2-tier)

| | **Starter** | **Pro** |
|--|-------------|---------|
| **월 가격** | **₩0 (무료)** | **₩89,000/월** |
| **크레딧** | 30/월 | 200/월 |
| **Cross-Check** | 2-Way (GPT + Gemini) | 3-Way (GPT + Gemini + Claude) |
| **블라인드 내보내기** | 10회/월 | 무제한 |
| **추가 크레딧** | 구매 불가 | ₩1,500/건 |
| **JD Auto-Match** | ❌ | ✅ |
| **제출 패키지 생성** | ❌ | ✅ |
| **우선 지원** | ❌ | ✅ |

**가격 산정 근거:**
- Pro 총 비용 ₩35,410 → 가격 ₩89,000 → **Gross Margin 60.2%**
- 헤드헌터 커미션 1건(₩10,000,000) 대비 0.89% → **No-Brainer 가격대**
- Overage ₩1,500/건 (worst cost ₩170 대비 8.8배 마진)
- Starter 무료 → Pro 전환 유도 (30 크레딧은 체험용, 전업 사용 불가)

**리스크 시나리오:**

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 환율 급등 (₩1,600/$) | AI 비용 20%↑ | 마진 60%→52%, 여전히 안전 |
| API 가격 인상 (50%) | 건당 비용 ₩255 | Pro 마진 43%, 가격 인상 검토 시점 |
| 대량 사용자 (Starter 악용) | 인프라 비용 증가 | 30 크레딧 제한 + IP 기반 중복 가입 방지 |
| LLM 장애 (30분) | 분석 지연 | 자동 환불 + 재시도 큐 |

---

## 6. Credit System

### 6.1. 크레딧 정책

| 정책 | Starter | Pro |
|------|---------|-----|
| 월 기본 크레딧 | 30 | 200 |
| 크레딧 소모 | 1 파일 = 1 크레딧 | 1 파일 = 1 크레딧 |
| 분석 실패 시 | 자동 환불 | 자동 환불 |
| 추가 구매 | ❌ 불가 | ₩1,500/건 |
| 이월 | ❌ 미사용분 소멸 | ❌ 미사용분 소멸 |

### 6.2. 크레딧 리셋 로직 (결제일 기준)

```
┌─────────────────────────────────────────────────────────────┐
│                    크레딧 리셋 Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Starter 사용자]                                           │
│  ● 가입일(plan_started_at) 기준으로 매월 리셋               │
│  ● 예: 1월 15일 가입 → 2월 15일, 3월 15일... 리셋          │
│                                                             │
│  [Pro 사용자]                                               │
│  ● 결제일(billing_cycle_start) 기준으로 매월 리셋           │
│  ● Paddle subscription.activated 시 billing_cycle_start 설정│
│  ● 예: 1월 20일 결제 → 2월 20일, 3월 20일... 리셋          │
│                                                             │
│  [리셋 시 동작]                                             │
│  1. credits_used_this_month → 0                             │
│  2. billing_cycle_start → 현재 날짜                         │
│  3. 추가 구매 크레딧(credits)은 유지 (리셋 대상 아님)       │
│                                                             │
│  [트리거 방식]                                              │
│  ● Primary: get_user_credits RPC 호출 시 자동 체크/리셋     │
│  ● Backup: Daily Cron (/api/cron/credit-reset) 03:00 KST   │
│                                                             │
│  [월말 예외 처리]                                           │
│  ● 결제일이 29~31일인 경우 → 해당 월의 마지막 날에 리셋     │
│  ● 예: 1월 31일 결제 → 2월 28일, 3월 31일... 리셋          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**구현 현황:**
- ✅ `get_user_credits` RPC에 리셋 로직 포함
- ✅ `billing_cycle_start` 필드 존재
- ✅ `plan_started_at` 필드 존재
- ✅ `next_reset_date` 계산 (fallback 로직)
- ❌ Daily Cron 백업 미구현 → 구현 필요

---

## 7. Core Features — 구현 완료

> 아래는 코드 검증이 완료된 기능 목록입니다.

### F1. 이력서 업로드 `✅ Production Ready`

| 항목 | 스펙 |
|------|------|
| 지원 포맷 | HWP, HWPX, DOC, DOCX, PDF |
| 최대 크기 | 50MB |
| 최대 페이지 | 50페이지 |
| DRM/암호화 | 즉시 반려 |
| 다중 인물 | 2명 이상 감지 시 거절 |
| 크레딧 | 1 파일 = 1 크레딧 (실패 시 환불) |

### F2. AI 분석 (Multi-Agent Pipeline) `✅ Production Ready`

| Agent | 역할 |
|-------|------|
| RouterAgent | 파일 타입 감지, DRM 체크, 페이지 제한 |
| AnalystAgent | 2/3-Way Cross-Check |
| PrivacyAgent | PII 마스킹 + AES-256-GCM 암호화 |
| VisualAgent | 증명사진 추출 (OpenCV), 포트폴리오 캡처 |
| IdentityChecker | 다중 인물 감지 |
| ValidationAgent | 유효성 검증 |

### F3. 하이브리드 검색 `✅ Production Ready`

| 모드 | 조건 | 기술 |
|------|------|------|
| 키워드 | ≤10자 | PostgreSQL ILIKE + 병렬 쿼리 |
| 시맨틱 | >10자 | pgvector cosine similarity |

부가: 스킬 동의어, 타이포 보정, Facet, 피드백 수집, Rate Limiting

### F4. AI 검토 UI `✅ Production Ready`

필드별 신뢰도 (녹≥95%, 황≥80%, 적<80%), 인라인 편집, Optimistic Update, 경력 자동 계산

### F5. 블라인드 내보내기 `✅ Production Ready`

마스킹 대상: 전화번호, 이메일, 주소. 감사 로그 기록 (IP 익명화).

### F6. 동의 플로우 `✅ Production Ready`

필수 동의: 서비스 이용약관 + 개인정보 처리방침 + 제3자 정보 보증. Middleware 이중 검증.

### F7. 포지션 관리 `✅ Production Ready`

JD 업로드/입력, AI JD 요구사항 추출, 후보자 매칭.

### F8. 후보자 라이프사이클 관리 `✅ Production Ready`

| 기능 | 구현 위치 |
|------|----------|
| 이직 의향 (hot/warm/cold/unknown) | `CandidateLifecycle.tsx` |
| 마지막 연락일 | `candidates.last_contact_at` |
| 연락 이력 CRUD | `/api/candidates/[id]/contact` |
| 연락 유형 | email, phone, linkedin, meeting, note |
| 결과 추적 | interested, not_interested, no_response, callback, rejected |
| 희망 연봉, 근무지, 가용일 | DB 필드 구현 완료 |

### F9. 재활성 검색 `✅ Production Ready`

| 기능 | 구현 위치 |
|------|----------|
| 미접촉 기간 필터 | `/api/candidates/reactivation` |
| 이직 의향 필터 | `interestLevel` 파라미터 |
| 스킬/경력 필터 | `skills`, `expYearsMin/Max` |
| 기본값 | 30일 이상 미접촉 |
| RPC 기반 | `get_reactivation_candidates` |

### F10. Paddle 결제 연동 `✅ 코드 구현 완료 (Sandbox 미설정)`

| 항목 | 상태 |
|------|------|
| Paddle 클라이언트 (프론트) | ✅ 완료 |
| 플랜 설정 (Starter/Pro) | ✅ 완료 |
| Webhook 처리 (8개 이벤트) | ✅ 완료 |
| 서명 검증 (HMAC SHA-256) | ✅ 완료 |
| 구독 상태 동기화 | ✅ 완료 |
| 구독 취소 | ✅ 완료 |
| 환불 요청/처리 | ✅ 완료 |
| **Sandbox 계정 설정** | ❌ **미완료** |
| **실환경 통합 테스트** | ❌ **미완료** |

### F11. 환불 정책 `✅ Production Ready`

Paddle Adjustment API 기반. `refund_requests` 테이블. Pro-rata 환불 계산.

### F12. 분석 대시보드 `✅ Production Ready`

KPI Cards, Pipeline Funnel, Talent Pool Charts, Activity Feed, Position Health.

---

## 8. 신규 기획 — JD Auto-Match

> **Pro 전용**. JD 업로드 → 즉시 상위 후보자 매칭. TTR(Time To Recommend) 99% 단축.

### 8.1. 개요

| 항목 | 내용 |
|------|------|
| **목표** | JD 업로드 후 10~30초 내 상위 20명 후보자 매칭 |
| **플랜** | Pro 전용 |
| **예상 공수** | 3~4일 |
| **의존성** | 기존 `/api/positions/extract` + `/api/positions/[id]/matches` 통합 |

### 8.2. User Flow

```
1. [포지션 페이지] "JD 업로드" 버튼 클릭
2. JD 파일(PDF/DOCX/TXT) 또는 텍스트 붙여넣기
3. AI가 JD에서 핵심 요구사항 자동 추출 (기존 extract API)
   → 필수 스킬, 경력 년수, 도메인, 우대 사항 등
4. 추출 결과 확인 & 수정 (인라인 편집 가능)
5. "즉시 매칭" 클릭
6. 하이브리드 검색 (Vector + RDB) 실행
   → 상위 20명 매칭 결과 + 매칭 점수
7. 결과 목록에서 후보자 선택 → 제출 패키지 생성 (Section 9)
```

### 8.3. 매칭 알고리즘

```
매칭 점수 = (스킬 매칭 × 0.35) + (경력 적합도 × 0.25)
          + (도메인 경험 × 0.20) + (벡터 유사도 × 0.20)

스킬 매칭 = (보유 필수스킬 수 / 전체 필수스킬 수) × 100
경력 적합도 = 1 - |요구경력 - 실제경력| / 요구경력  (0~1)
도메인 경험 = 동일 업종 경험 여부 (0 or 1)
벡터 유사도 = cosine_similarity(JD embedding, candidate chunks)
```

### 8.4. API 설계

```
POST /api/positions/instant-match
├── Request: { jdText?: string, jdFileUrl?: string }
├── Response: {
│     position: { id, title, requirements },
│     matches: [{
│       candidateId, name, matchScore,
│       matchReasons: string[],
│       risks: string[],
│       skills: { matched: [], missing: [] }
│     }],
│     total: number
│   }
└── Rate Limit: 분당 5회
```

### 8.5. UI 스펙

| 화면 | 요소 |
|------|------|
| 매칭 결과 카드 | 매칭 점수 (원형 게이지), 매칭 이유 3개, 리스크 뱃지 |
| 필터/정렬 | 매칭 점수순, 경력순, 최근 연락순 |
| 액션 | "제출 패키지 생성", "블라인드 내보내기", "연락 기록 추가" |

---

## 9. 신규 기획 — 후보자 제출 패키지

> **Pro 전용**. JD 기반 맞춤 제출 문서 자동 생성. 제출 문서 작성 시간 95% 단축.

### 9.1. 개요

| 항목 | 내용 |
|------|------|
| **목표** | 후보자별 JD 맞춤 제출 패키지 2분 내 자동 생성 |
| **플랜** | Pro 전용 |
| **예상 공수** | 3~4일 |
| **AI 비용** | GPT-4o 1회 호출 (~$0.03/패키지) |

### 9.2. 패키지 구성

```
📋 후보자 제출 패키지
──────────────────────────
[1. 기본 정보] (Blind Export 기반)
  이름(마스킹 선택), 경력 N년, 핵심 스킬

[2. 매칭 분석] ← GPT-4o 생성
  ✅ 매칭 이유 (3~5개)
  • 결제 도메인 5년 경력 → JD 요구사항 정확 부합
  • Kafka/Spark 실무 경험 → 데이터 파이프라인 역량
  • B2B SaaS 스케일업 경험 → 성장 단계 핏

  ⚠️ 잠재 리스크 (2~3개)
  • 리더십 경험 제한적 → 팀 리드 역할 검증 필요
  • 최근 이직 주기 18개월 → 동기 확인 필요

[3. 면접 질문 제안] ← GPT-4o 생성
  1. Kafka 메시지 유실 처리 경험?
  2. 결제 장애 대응 사례?
  3. 6개월 내 이직 이유?

[4. 요약 의견]
  "결제 도메인 전문성이 높아 즉시 기여 가능한 후보자.
   리더십 경험 부족이 유일한 리스크이나 면접 확인 권장."
```

### 9.3. API 설계

```
POST /api/candidates/[id]/package
├── Request: { positionId: string, includeBlind?: boolean }
├── Response: {
│     packageId: string,
│     matchAnalysis: { reasons: string[], risks: string[] },
│     interviewQuestions: string[],
│     summary: string,
│     blindData?: object,
│     generatedAt: string
│   }
├── Rate Limit: 분당 5회
└── 비용: 크레딧 미차감 (Pro 기능, 추가 AI 비용은 구독에 포함)
```

### 9.4. 프롬프트 설계

```
System: "당신은 헤드헌터 어시스턴트입니다. 후보자 이력서와 JD를 비교 분석하여
        매칭 이유, 잠재 리스크, 면접 질문을 생성합니다.
        반드시 구체적 사실에 근거하며, 과장하지 않습니다."

Input: JD 요구사항 + 후보자 분석 데이터 (skills, career, projects)
Output: JSON { reasons[], risks[], questions[], summary }
```

---

## 10. 신규 기획 — Overage Billing (추가 크레딧)

> **Pro 전용**. 월 크레딧 소진 후 건당 ₩1,500으로 추가 분석 가능.

### 10.1. 정책

| 항목 | 스펙 |
|------|------|
| **대상** | Pro 플랜 사용자만 |
| **단가** | ₩1,500/건 |
| **과금 방식** | 월말 일괄 청구 (Paddle Usage-Based Billing) |
| **한도** | 월 최대 100건 추가 (안전장치) |
| **Starter** | 추가 구매 불가 → Pro 업그레이드 유도 |

### 10.2. User Flow

```
1. Pro 사용자가 월 200 크레딧 모두 소진
2. 업로드 시도 시 "크레딧 소진" 모달 표시
   ├── "추가 크레딧 사용 (₩1,500/건)" 버튼
   └── "이번 달 자동 추가 사용 켜기" 토글
3. 동의 시 → 분석 진행 + credit_transactions에 overage 기록
4. 월말 → Paddle metered billing으로 추가 사용량 일괄 청구
```

### 10.3. API 설계

```
POST /api/user/credits/overage
├── Request: { enable: boolean, monthlyLimit?: number }
├── Response: { enabled: boolean, usedOverage: number, limit: number }

GET /api/user/credits/overage
├── Response: {
│     enabled: boolean,
│     usedOverage: number,        // 이번 달 추가 사용 건수
│     limit: number,              // 한도 (기본 100)
│     estimatedCharge: number     // 예상 청구 금액
│   }
```

### 10.4. DB 변경

```sql
ALTER TABLE users ADD COLUMN overage_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN overage_limit INTEGER DEFAULT 100;
ALTER TABLE users ADD COLUMN overage_used_this_month INTEGER DEFAULT 0;

-- credit_transactions.type에 'overage' 추가
```

---

## 11. 신규 기획 — 3-Way Cross-Check 활성화

> **Pro 전용**. Claude 추가로 3자 교차 검증. 분석 정확도 극대화.

### 11.1. 현재 상태

| 항목 | 상태 |
|------|------|
| LLM Manager (`llm_manager.py`) | ✅ Phase 2 로직 구현 완료 |
| Claude 3.5 Sonnet 연동 | ✅ 코드 완료 |
| 다수결 로직 | ✅ 구현 완료 |
| `ANTHROPIC_API_KEY` 설정 | ❌ 미설정 |
| `ANALYSIS_MODE` 분기 | ✅ 구현 완료 |

### 11.2. 활성화 조건

```
1. ANTHROPIC_API_KEY 환경변수 설정 (Worker)
2. 사용자 플랜이 'pro'인 경우 자동으로 phase_2 적용
3. Starter 사용자는 phase_1 (2-Way) 유지
```

### 11.3. 플랜별 분석 모드 분기

```python
# Worker에서 플랜 기반 분석 모드 결정
def get_analysis_mode(user_plan: str) -> str:
    if user_plan == "pro" and os.getenv("ANTHROPIC_API_KEY"):
        return "phase_2"  # 3-Way
    return "phase_1"      # 2-Way
```

### 11.4. 비용 영향

| 항목 | Phase 1 (2-Way) | Phase 2 (3-Way) | 차이 |
|------|-----------------|-----------------|------|
| 건당 비용 | ~₩43 | ~₩85 | +₩42 |
| 200건/월 | ₩8,600 | ₩17,000 | +₩8,400 |
| Pro 마진 | 71% | 60% | -11%p |

---

## 12. 이메일 알림 시스템

### 12.1. 시스템 아키텍처

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Event 발생  │────▶│ Email Queue  │────▶│  발송 서비스  │
│  (API/Worker)│     │ (DB Table)   │     │  (Resend)    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                          ┌──────▼──────┐
                                          │  사용자 수신 │
                                          │ (이메일 주소)│
                                          └─────────────┘
```

- **발송 서비스**: Resend (무료 100통/일, 유료 $20/월 50,000통)
- **발송 주소**: `noreply@srchd.com`
- **수신 주소**: 사용자 가입 시 등록한 이메일 (Supabase Auth email)
- **템플릿**: React Email 기반 HTML 템플릿
- **언어**: 한국어

### 12.2. 이메일 케이스 정의 (12개)

#### 📩 계정 관련 (3개)

| # | 이벤트 | 트리거 | 제목 | 핵심 내용 |
|---|--------|--------|------|----------|
| E-01 | **환영 이메일** | 회원가입 완료 | "[서치드] 가입을 환영합니다!" | 서비스 소개, 첫 업로드 가이드 링크, 무료 크레딧 안내 |
| E-02 | **비밀번호 변경** | 비밀번호 변경 요청 | "[서치드] 비밀번호 변경 안내" | 변경 확인, 본인 아닌 경우 안내 |
| E-03 | **계정 삭제 확인** | 탈퇴 요청 | "[서치드] 계정 삭제가 완료되었습니다" | 데이터 삭제 확인, 30일 복구 안내 |

#### 📊 분석 관련 (3개)

| # | 이벤트 | 트리거 | 제목 | 핵심 내용 |
|---|--------|--------|------|----------|
| E-04 | **분석 완료** | Worker 분석 성공 | "[서치드] 이력서 분석이 완료되었습니다 (N건)" | 완료 건수, 결과 확인 링크, 검토 필요 건수 |
| E-05 | **분석 실패** | Worker 분석 실패 | "[서치드] 이력서 분석 실패 안내" | 실패 사유, 크레딧 자동 환불 안내, 재업로드 가이드 |
| E-06 | **JD 매칭 완료** | Instant Match 완료 | "[서치드] JD 매칭 결과가 준비되었습니다" | 매칭 후보자 수, 최고 매칭 점수, 결과 링크 (Pro 전용) |

#### 💳 결제/크레딧 관련 (4개)

| # | 이벤트 | 트리거 | 제목 | 핵심 내용 |
|---|--------|--------|------|----------|
| E-07 | **크레딧 부족 경고** | 잔여 ≤5건 | "[서치드] 크레딧이 N건 남았습니다" | 잔여 수, Pro 업그레이드 안내 (Starter) 또는 추가 구매 안내 (Pro) |
| E-08 | **크레딧 소진** | 잔여 = 0 | "[서치드] 이번 달 크레딧을 모두 사용했습니다" | 리셋일 안내, 업그레이드/추가 구매 CTA |
| E-09 | **크레딧 갱신** | 월간 리셋 실행 | "[서치드] 크레딧이 갱신되었습니다" | 새 크레딧 수, 지난달 사용량 요약 |
| E-10 | **결제 실패** | Paddle past_due | "[서치드] 결제에 실패했습니다" | 실패 사유, 카드 정보 업데이트 링크, 서비스 제한 예고 |

#### 🔔 구독 관련 (2개)

| # | 이벤트 | 트리거 | 제목 | 핵심 내용 |
|---|--------|--------|------|----------|
| E-11 | **구독 시작/갱신** | subscription.activated | "[서치드] Pro 플랜이 활성화되었습니다" | 플랜 정보, 크레딧, 시작일, 기능 안내 |
| E-12 | **구독 취소 확인** | subscription.canceled | "[서치드] 구독 취소가 처리되었습니다" | 취소 확인, 잔여 기간 안내, 데이터 보존 안내, 복구 방법 |

### 12.3. 이메일 발송 조건 및 제한

| 정책 | 값 |
|------|-----|
| 동일 이벤트 중복 발송 방지 | 1시간 내 동일 타입 미발송 |
| 일일 최대 발송 | 사용자당 20통 |
| 분석 완료 배치 | 5분 간격 배치 (동시 업로드 시 묶어서 발송) |
| Unsubscribe | E-04, E-06, E-09만 구독 해제 가능 (나머지는 필수) |

### 12.4. DB 스키마

```sql
CREATE TABLE email_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_type VARCHAR(20) NOT NULL,  -- 'E-01' ~ 'E-12'
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending/sent/failed/skipped
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',  -- 이벤트별 추가 데이터
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_notifications_user ON email_notifications(user_id, email_type, created_at DESC);

-- 사용자별 알림 설정
CREATE TABLE email_preferences (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  analysis_complete BOOLEAN DEFAULT TRUE,   -- E-04
  match_complete BOOLEAN DEFAULT TRUE,      -- E-06
  credit_renewal BOOLEAN DEFAULT TRUE,      -- E-09
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.5. 구현 우선순위

| 순위 | 이메일 | 이유 |
|------|--------|------|
| 1차 | E-04, E-05 (분석 완료/실패) | 핵심 UX — 사용자가 결과를 기다리고 있음 |
| 2차 | E-07, E-08 (크레딧 경고/소진) | 전환 유도 — Pro 업그레이드 트리거 |
| 3차 | E-01 (환영) | 온보딩 시작점 |
| 4차 | E-10, E-11, E-12 (결제 관련) | Paddle 연동 후 |
| 5차 | E-02, E-03, E-06, E-09 (나머지) | 완성도 |

---

## 13. 에러 모니터링 시스템

### 13.1. 모니터링 스택

```
┌──────────────────────────────────────────────────────────┐
│                    Monitoring Stack                        │
├────────────┬─────────────────────────────────────────────┤
│  Frontend  │  Sentry (Next.js SDK)                       │
│            │  • JavaScript 에러 캡처                      │
│            │  • Performance 트레이싱                      │
│            │  • Session Replay (opt-in)                   │
├────────────┼─────────────────────────────────────────────┤
│  API       │  Sentry (serverless)                        │
│            │  • API Route 에러 캡처                       │
│            │  • 요청/응답 메타데이터                      │
│            │  • Custom Breadcrumbs                        │
├────────────┼─────────────────────────────────────────────┤
│  Worker    │  Sentry (Python SDK)                        │
│            │  • Agent 에러 캡처                           │
│            │  • LLM 호출 실패 추적                       │
│            │  • 파싱 오류 분류                            │
├────────────┼─────────────────────────────────────────────┤
│  Infra     │  Vercel Analytics + Railway Logs            │
│            │  • Cold Start 시간                          │
│            │  • 메모리 사용량                             │
│            │  • 함수 실행 시간                            │
└────────────┴─────────────────────────────────────────────┘
```

### 13.2. 알림 규칙

| 레벨 | 조건 | 알림 채널 | 응답 시간 |
|------|------|----------|----------|
| 🔴 **P0** | AI 분석 성공률 <90% (1시간) | Slack + 이메일 | 30분 내 |
| 🔴 **P0** | Webhook 처리 실패 연속 3회 | Slack + 이메일 | 30분 내 |
| 🟡 **P1** | API 에러율 >5% (15분) | Slack | 2시간 내 |
| 🟡 **P1** | 평균 응답시간 >3초 (5분) | Slack | 2시간 내 |
| 🟢 **P2** | 새로운 에러 유형 감지 | Slack | 24시간 내 |
| 🟢 **P2** | LLM 비용 일일 ₩50,000 초과 | 이메일 | 24시간 내 |

### 13.3. 구현 체크리스트

| # | 항목 | 상태 | 액션 |
|---|------|------|------|
| 1 | Sentry DSN 설정 (Frontend) | ✅ `next.config.ts`에 통합 | 환경변수 설정 필요 |
| 2 | Sentry DSN 설정 (Worker) | ❌ 미확인 | `apps/worker/main.py`에 추가 |
| 3 | Error Boundary (React) | ❌ 커스텀 미구현 | `app/error.tsx` 생성 |
| 4 | Source Maps 업로드 | ❌ 미설정 | Vercel CI에 Sentry sourcemap 연동 |
| 5 | Custom Tags | ❌ 미설정 | `user_plan`, `feature_area` 태그 추가 |
| 6 | Performance 트레이싱 | ❌ 미설정 | `tracesSampleRate: 0.1` |
| 7 | Slack Webhook 연동 | ❌ 미설정 | Sentry → Slack integration |
| 8 | Health Check 엔드포인트 | ✅ `/api/health` | 외부 모니터링 연동 |

### 13.4. 핵심 대시보드 지표

| 지표 | 수집 소스 | 알림 임계값 |
|------|----------|-----------|
| AI 분석 성공률 | `processing_jobs` | <90% |
| 평균 분석 시간 | Worker 로그 | >120초 |
| API P95 응답시간 | Sentry Performance | >3초 |
| 일일 에러 수 | Sentry Issues | >50건 |
| LLM API 에러율 | Worker 로그 | >10% |

---

## 14. 온보딩 플로우

### 14.1. 전체 플로우

```
회원가입 → 동의 → 온보딩 시작
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
     [Step 1]    [Step 2]    [Step 3]
     환영 +      첫 업로드    검색 체험
     서비스 소개   가이드       가이드
         │           │           │
         ▼           ▼           ▼
     [Step 4]    [Step 5]    [완료]
     검토 UI     블라인드      대시보드
     가이드      내보내기      진입
                  가이드
```

### 14.2. Step 별 상세

#### Step 1: 환영 + 서비스 소개 (첫 로그인 시)

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│     👋 서치드에 오신 것을 환영합니다!                 │
│                                                      │
│     이서연님, 서치드가 도와드릴 것들:                 │
│                                                      │
│     📥 이력서를 올리면 AI가 자동으로 분석합니다       │
│     🔍 키워드나 문장으로 후보자를 instantly 검색       │
│     🔒 개인정보는 AES-256으로 안전하게 암호화          │
│     📋 블라인드 이력서를 한 클릭으로 생성              │
│                                                      │
│     무료 크레딧 30건이 제공됩니다!                    │
│                                                      │
│     [ 시작하기 →]      [ 나중에 ]                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

| 항목 | 스펙 |
|------|------|
| 트리거 | 첫 로그인 (동의 완료 직후) |
| 표시 조건 | `users.onboarding_completed = false` |
| 스킵 가능 | ✅ "나중에" 클릭 시 대시보드 이동 |
| 저장 | `users.onboarding_step` 필드에 진행 상태 저장 |

#### Step 2: 첫 이력서 업로드 가이드

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│     📥 첫 이력서를 올려볼까요?                       │
│                                                      │
│     ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐          │
│     │                                     │          │
│     │   여기에 이력서 파일을              │          │
│     │   드래그 & 드롭하세요               │          │
│     │                                     │          │
│     │   HWP, PDF, DOCX 모두 지원          │          │
│     │                                     │          │
│     └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘          │
│                                                      │
│     💡 Tip: 여러 파일을 한 번에 올릴 수 있어요       │
│                                                      │
│     [ 샘플 이력서로 체험 ]  [ 내 이력서 올리기 ]     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

| 항목 | 스펙 |
|------|------|
| 샘플 이력서 | 미리 준비된 데모 이력서 (HWP 1건 + PDF 1건) 제공 |
| Tooltip | 업로드 영역에 하이라이트 펄스 애니메이션 |
| 완료 조건 | 1건 이상 업로드 성공 |
| 자동 진행 | 업로드 후 "분석 중..." 로딩 → 완료 시 Step 3으로 |

#### Step 3: 검색 체험 가이드

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│     🔍 이제 검색해볼까요?                            │
│                                                      │
│     방금 분석된 후보자를 찾아보세요.                  │
│                                                      │
│     ┌────────────────────────────────────┐           │
│     │ 🔍 "Java 백엔드 5년차"  [검색]     │ ← 하이라이트│
│     └────────────────────────────────────┘           │
│                                                      │
│     💡 짧은 키워드(스킬, 회사명)도 되고,             │
│        긴 문장("결제 도메인 경력 3년 이상")도 됩니다  │
│                                                      │
│     [ 건너뛰기 ]                                     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

| 항목 | 스펙 |
|------|------|
| 사전 입력 | 업로드된 이력서 기반 추천 검색어 |
| Tooltip | 검색바에 포커스 + 펄스 |
| 완료 조건 | 검색 1회 실행 |

#### Step 4: 검토 UI 가이드

```
Tooltip 가이드 (후보자 상세 페이지):
1. "여기서 AI가 추출한 스킬을 확인하세요" → skills 영역 하이라이트
2. "노란색은 AI가 확신하지 못하는 항목입니다. 클릭해서 수정하세요" → 황색 필드
3. "수정 사항은 즉시 저장됩니다" → 저장 확인 토스트
```

| 항목 | 스펙 |
|------|------|
| 표시 방식 | Tooltip 시퀀스 (3단계) |
| 완료 조건 | 모든 tooltip 확인 또는 스킵 |

#### Step 5: 블라인드 내보내기 가이드

```
Tooltip: "여기를 클릭하면 개인정보가 제거된
          블라인드 이력서를 다운로드할 수 있습니다"
→ 내보내기 버튼 하이라이트
```

| 항목 | 스펙 |
|------|------|
| 표시 방식 | 단일 Tooltip |
| 완료 조건 | 버튼 클릭 또는 스킵 |

### 14.3. 완료 화면

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│     🎉 준비 완료!                                   │
│                                                      │
│     서치드를 사용할 준비가 되었습니다.                │
│                                                      │
│     남은 크레딧: NN건                                │
│     분석된 후보자: N명                               │
│                                                      │
│     [ 대시보드로 가기 → ]                            │
│                                                      │
│     📌 언제든 설정에서 가이드를 다시 볼 수 있어요     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 14.4. DB 변경

```sql
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 0;
-- 0: 미시작, 1~5: 각 단계, 6: 완료
```

### 14.5. 구현 스펙

| 항목 | 스펙 |
|------|------|
| UI 라이브러리 | `react-joyride` 또는 커스텀 Tooltip |
| 상태 관리 | `users.onboarding_step` (서버) + Zustand (클라이언트) |
| 리셋 | 설정 페이지에서 "가이드 다시 보기" 가능 |
| Analytics | 각 Step 완료/스킵 이벤트 추적 |
| 예상 공수 | 6~8시간 |

---

## 15. E2E 테스트 전략

### 15.1. 테스트 현황

| 항목 | 상태 |
|------|------|
| 프레임워크 | Playwright 1.57 ✅ |
| 테스트 파일 수 | 16개 |
| CI 연동 | ❌ 미연동 |
| 커버리지 | 핵심 플로우 일부만 |

### 15.2. 핵심 테스트 시나리오 (우선순위순)

| # | 시나리오 | 파일 | 상태 | 우선순위 |
|---|---------|------|------|----------|
| 1 | 회원가입 → 동의 → 대시보드 | `auth.spec.ts` | ✅ 있음 | 🔴 P0 |
| 2 | 이력서 업로드 → 분석 완료 확인 | `upload.spec.ts` | ✅ 있음 | 🔴 P0 |
| 3 | 후보자 검색 (키워드 + 시맨틱) | `search.spec.ts` | ✅ 있음 | 🔴 P0 |
| 4 | 블라인드 내보내기 | `export.spec.ts` | ✅ 있음 | 🔴 P0 |
| 5 | AI 검토 UI (인라인 편집) | `candidates.spec.ts` | ✅ 있음 | 🟡 P1 |
| 6 | 포지션 생성 + 매칭 | `positions.spec.ts` | ✅ 있음 | 🟡 P1 |
| 7 | 설정 + 구독 관리 | `settings.spec.ts` | ✅ 있음 | 🟡 P1 |
| 8 | 온보딩 플로우 | 미작성 | ❌ | 🟡 P1 |
| 9 | 크레딧 소진 → 업그레이드 유도 | 미작성 | ❌ | 🟡 P1 |
| 10 | JD Auto-Match (Phase 2) | 미작성 | ❌ | 🟢 P2 |

### 15.3. CI/CD 연동 계획

```
GitHub Actions Workflow:
1. PR 생성 시 → Unit Tests (Vitest) 실행
2. main 브랜치 push 시 → E2E Tests (Playwright) 실행
3. E2E 실패 시 → 배포 차단 (Vercel Preview만 허용)
4. 테스트 리포트 → PR Comment로 자동 첨부
```

### 15.4. 예상 공수

| 항목 | 공수 |
|------|------|
| CI/CD 파이프라인 구축 | 4h |
| 미작성 E2E 시나리오 추가 (#8,9,10) | 4h |
| 기존 E2E 안정화 (flaky test 수정) | 4h |
| **합계** | **12h** |

---

## 16. Data Architecture

### 16.1. 핵심 ERD

```
users ──1:N── candidates ──1:N── candidate_chunks (vector 1536)
  │                │
  │                ├──1:N── contact_history
  │                │
  │                └──1:N── blind_exports
  │
  ├──1:N── processing_jobs
  ├──1:N── credit_transactions
  ├──1:N── user_consents
  ├──1:N── email_notifications (NEW)
  ├──1:1── email_preferences (NEW)
  ├──1:N── positions ──1:N── position_matches
  ├──1:N── saved_searches
  ├──1:N── search_feedback
  └──1:N── refund_requests
```

### 16.2. 신규 마이그레이션 요약

```sql
-- 온보딩
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 0;

-- Overage
ALTER TABLE users ADD COLUMN overage_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN overage_limit INTEGER DEFAULT 100;
ALTER TABLE users ADD COLUMN overage_used_this_month INTEGER DEFAULT 0;

-- 이메일 알림
CREATE TABLE email_notifications (...);
CREATE TABLE email_preferences (...);

-- 제출 패키지
CREATE TABLE candidate_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  match_reasons TEXT[],
  risks TEXT[],
  interview_questions TEXT[],
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 17. Security & Compliance

### 17.1. 5대 보안 원칙

| # | 원칙 | 구현 |
|---|------|------|
| 1 | PII 암호화 | AES-256-GCM + SHA-256 해시 |
| 2 | 접근 제어 | Supabase RLS + Middleware 이중 검증 |
| 3 | 전송 보안 | HTTPS + CSP + HSTS |
| 4 | CSRF 방어 | Origin/Referer 검증 |
| 5 | Rate Limiting | 엔드포인트별 차등 적용 |

### 17.2. PII 마스킹 규칙

```
전화번호: 010-1234-5678 → 010-****-5678
이메일: user@example.com → u***@example.com
주소: 서울시 강남구 역삼동 123 → 서울시 강남구 ***
```

---

## 18. Phase Roadmap

### Phase 1 완료 작업 (잔여)

```
Week 1 (즉시):
├── 가격/PlanType 통일 (4h)
├── package.json name 변경 → srchd (10min)
├── Paddle Sandbox 설정 + 통합 테스트 (8h)
└── Sentry 연동 검증 + 알림 설정 (4h)

Week 2:
├── 크레딧 리셋 Cron 백업 구현 (4h)
├── 이메일 알림 1차 (E-04, E-05 분석 완료/실패) (8h)
├── 이메일 알림 2차 (E-07, E-08 크레딧 경고) (4h)
└── 온보딩 플로우 구현 (8h)

Week 3:
├── E2E CI/CD 연동 (4h)
├── E2E 테스트 보강 (4h)
├── 환영 이메일 (E-01) + 결제 이메일 (E-10~12) (6h)
└── Error Boundary + Sentry 태깅 (4h)
```

### Phase 2 (차별화 기능)

```
Week 4-5:
├── 3-Way Cross-Check 활성화 (4h)
├── JD Auto-Match (3-4일)
└── 후보자 제출 패키지 (3-4일)

Week 6:
├── Overage Billing (8h)
└── 나머지 이메일 (E-02, 03, 06, 09) (4h)
```

---

## 19. Success Metrics

### 19.1. 프로덕트 KPI

| KPI | 목표 | 측정 |
|-----|------|------|
| AI 분석 성공률 | ≥95% | `processing_jobs` |
| HWP 파싱 성공률 | ≥95% | HWP 한정 |
| 검색 만족도 | ≥80% | `search_feedback` |
| 온보딩 완료율 | ≥60% | `users.onboarding_completed` |
| Starter→Pro 전환율 | ≥5% | 결제 이벤트 |
| 월 리텐션 | ≥40% | 세션 데이터 |

### 19.2. Business KPI (Closed Beta)

| KPI | 목표 |
|-----|------|
| Beta 사용자 | 50명 |
| NPS | ≥40 |
| Pro 전환 의향 | ≥30% |

---

## 20. Appendix

### 20.1. 환경 변수

**필수:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
REDIS_URL
ENCRYPTION_KEY
```

**선택:**
```
GEMINI_API_KEY                  # 2-Way Cross-Check
ANTHROPIC_API_KEY               # 3-Way (Pro)
HANCOM_API_KEY                  # HWP 3차 Fallback
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN # Paddle 결제
PADDLE_API_KEY / PADDLE_WEBHOOK_SECRET
SENTRY_DSN                      # 에러 모니터링
RESEND_API_KEY                  # 이메일 발송 (NEW)
```

### 20.2. 관련 문서

| 문서 | 위치 |
|------|------|
| 프로젝트 컨텍스트 | `claude.md` |
| 이전 PRD v0.3 | `docs/rai_prd_v0.3.md` |
| 로드맵 (인터뷰) | `docs/PRODUCT_ROADMAP_FROM_INTERVIEW.md` |
| 환불 정책 PRD | `docs/PRD/prd_refund_policy_v0.4.md` |
| OpenAPI Spec | `openapi.yaml` |

### 20.3. 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-02-13 | v0.1 | 초판 작성. 코드 검증 기반 기능 상태 업데이트. 가격 재산정. 신규 기획 6건 추가. |
| 2026-02-13 | v0.1.1 | 코드 리뷰 보고서 기반 Action Plan 추가 (Section 21). 아키텍처 설명 보정, 메트릭 정확도, 프롬프트 개선 계획 반영. |

---

## 21. Code Review Action Plan

> **배경**: 2026-02-13 외부 코드 리뷰를 통해 Multi-Agent Pipeline의 문서-코드 괴리, 메트릭 정확도, 프롬프트 견고성 등 주요 개선점이 식별되었습니다. 본 섹션은 리뷰 결과를 코드 검증 후 확정된 액션 아이템으로 정리합니다.

### 21.1. 아키텍처 현실 보정

#### 문서 대 실제 괴리 (P0)

| 항목 | 문서 설명 | 실제 코드 |
|------|----------|----------|
| 파이프라인 구조 | "Collaborative Orchestrator + Feedback Loop + Base Extractor" | `PipelineOrchestrator.run()` — Stage 1~9 **순차 호출** (line 163~207) |
| 에이전트 통신 | "MessageBus를 통한 에이전트 간 협업" | `send_message()` 호출은 `AnalystAgentContextAdapter.on_analysis_complete()` **1곳만** (line 349), 수신 처리 로직 없음 |
| 의사결정 | "다중 에이전트 합의" | `decide_all()`은 최고 신뢰도 제안을 자동 선택하는 단순 로직 |

#### 보정된 아키텍처 설명

```
현재 아키텍처: Multi-Stage Orchestrator Pipeline

┌─────────────────────────────────────────────────────────────────┐
│                   PipelineOrchestrator.run()                    │
│                                                                 │
│  Stage 1: Raw Input Setup                                       │
│      ↓                                                          │
│  Stage 2: File Parsing (RouterAgent → HWP/PDF/DOCX Parser)      │
│      ↓                                                          │
│  Stage 3: PII Extraction (Regex-only, pre-LLM masking)          │
│      ↓                                                          │
│  Stage 4: Identity Check (Multi-Identity Detection)             │
│      ↓                                                          │
│  Stage 5: AI Analysis (AnalystAgent - Progressive/Parallel LLM) │
│      ↓                                                          │
│  Stage 6: Validation + Hallucination Detection                  │
│      ↓                                                          │
│  Stage 7: PII Masking + Encryption (PrivacyAgent)               │
│      ↓                                                          │
│  Stage 8: Embedding Generation                                  │
│      ↓                                                          │
│  Stage 9: DB Save                                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PipelineContext (Central Hub)               │    │
│  │  - RawInput, ParsedData, PIIStore, StageResults         │    │
│  │  - EvidenceStore, DecisionManager, CurrentData           │    │
│  │  - HallucinationDetector, WarningCollector              │    │
│  │  - AuditLog, Guardrails                                 │    │
│  │  - MessageBus (구현됨, 핵심 경로에서 미사용)             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

설계 원칙:
- 이력서 분석은 본질적으로 순차적 (파싱 → PII → 분석 → 검증)
- PipelineContext가 모든 상태를 중앙 관리하여 컨텍스트 손실 방지
- MessageBus는 특정 유스케이스(재분석, 비동기 검증)에서 활용 가능
- Feature flags로 각 단계의 활성화/비활성화 제어
```

### 21.2. 확인된 갭 목록 (코드 검증 완료)

#### P0 — 즉시 수정 (1주 내)

| # | 갭 | 코드 위치 | 영향 | 수정 방향 |
|---|-----|----------|------|----------|
| 1 | **메트릭 추정치 사용** | `pipeline_orchestrator.py:478-487` | LLM 비용 추적 부정확 (토큰을 `len(text)//4`로 추정, output을 `500` 하드코딩) | `AnalysisResult`에 `llm_usage: Dict[provider, usage]` 필드 추가. `LLMResponse.usage`에서 실제 값 전달. |
| 2 | **프로바이더 하드코딩** | `pipeline_orchestrator.py:482-484` | 메트릭에 항상 `openai/gpt-4o`로 기록. Gemini/Claude 사용 시 부정확. | `AnalysisResult`에 `providers_used` 목록 추가. 실제 사용 프로바이더 기록. |
| 3 | **아키텍처 문서 보정** | PRD 전반 | "Multi-Agent 협업" 표현이 실제와 불일치 | 본 섹션(21.1)으로 보정 완료. 향후 README, claude.md 등 동기화 필요. |

#### P1 — 2~4주 내

| # | 갭 | 코드 위치 | 영향 | 수정 방향 |
|---|-----|----------|------|----------|
| 4 | **스키마 strict: False** | `resume_schema.py` 전체 (line 19, 42, 78, 131, 152) | LLM이 `additionalProperties`로 정의되지 않은 필드 반환 가능 → 출력 불일치 | PROFILE_SCHEMA부터 단계적으로 `strict: True` + `additionalProperties: False` 전환. 회귀 테스트 필수. |
| 5 | **체크포인트 미사용** | `pipeline_context.py:441-496` | `create_checkpoint()` / `restore_from_checkpoint()` 구현은 있으나 `PipelineOrchestrator.run()`에서 미호출 | Stage 5 (AI 분석) 전후에 체크포인트 생성. LLM 호출 실패 시 체크포인트로부터 재시도 구현. |
| 6 | **CoT/Few-shot 프롬프트 부재** | `analyst_agent.py:435-457` | 단순 지시형 프롬프트로, 복잡한 이력서(비표준 형식)에서 정확도 저하 가능 | 한국 이력서 Few-shot 예제 2~3건 추가. 경력 연수 계산에 CoT 추론 유도. |
| 7 | **MessageBus 활용 범위 확정** | `message_bus.py`, `analyst_wrapper.py:349` | MessageBus 인프라는 있으나 핵심 경로에서 1곳만 사용 | 즉시: 비동기 품질 재검증 유스케이스에 활용. 장기: 별도 워커에서 백그라운드 품질 검증 시 MessageBus 활용. |

#### P2 — 1~2개월 내

| # | 갭 | 코드 위치 | 영향 | 수정 방향 |
|---|-----|----------|------|----------|
| 8 | **프롬프트 버전 관리** | `resume_schema.py`, `analyst_agent.py` | 프롬프트 변경 시 품질 회귀 추적 불가 | 스키마/프롬프트에 `version` 키 추가. 로그에 스키마 해시 기록. |
| 9 | **Feature Flag 커버리지 테이블** | `feature_flags.py` | 어떤 플래그가 어떤 코드 경로에 영향을 끼치는지 문서화 미흡 | Feature Flag → 코드 경로 매핑 테이블 작성. |
| 10 | **문서 자동 동기화** | PRD, README, claude.md | 수동 관리로 불일치 누적 위험 | CI에서 아키텍처 다이어그램 자동 생성 파이프라인 구축 검토. |

### 21.3. 구현 액션 플랜

#### Week 1: 메트릭 정확도 + 문서 보정 (P0)

```python
# Task 1-1: AnalysisResult에 실제 토큰 사용량 추가
# 파일: apps/worker/agents/analyst_agent.py

@dataclass
class AnalysisResult:
    # ... 기존 필드 ...
    llm_usage: Dict[str, Dict[str, int]] = field(default_factory=dict)
    # {"openai": {"prompt_tokens": 1234, "completion_tokens": 567, ...},
    #  "gemini": {"prompt_tokens": 1100, "completion_tokens": 432, ...}}
    providers_used: List[str] = field(default_factory=list)
```

```python
# Task 1-2: LLMResponse.usage를 AnalysisResult로 전달
# 파일: apps/worker/agents/analyst_agent.py - _merge_responses()

# 현재: usage 데이터 버려짐
# 수정 후: valid_responses에서 usage 수집하여 AnalysisResult.llm_usage에 저장
for provider, response in responses.items():
    if response.success and response.usage:
        result.llm_usage[provider.value] = response.usage
        result.providers_used.append(provider.value)
```

```python
# Task 1-3: Orchestrator에서 실제 토큰 사용 (추정치 제거)
# 파일: apps/worker/orchestrator/pipeline_orchestrator.py - _stage_analysis()

# 삭제할 코드 (line 478-487):
# estimated_tokens = len(text) // 4  # 대략적인 추정
# metrics_collector.record_llm_call(...tokens_input=estimated_tokens, tokens_output=500...)

# 교체할 코드:
if result.llm_usage:
    for provider, usage in result.llm_usage.items():
        metrics_collector.record_llm_call(
            ctx.metadata.pipeline_id,
            provider,
            result.model_for_provider.get(provider, "unknown"),
            tokens_input=usage.get("prompt_tokens", 0),
            tokens_output=usage.get("completion_tokens", 0),
        )
```

**예상 공수**: 4h (코드 수정 2h + 테스트 2h)

#### Week 2-3: 프롬프트 + 스키마 개선 (P1)

```
Task 2-1: 경력 연수 CoT 프롬프트 추가
├── RESUME_SCHEMA_PROMPT에 CoT 섹션 추가
│   예: "경력 연수 계산 시, 각 경력 항목의 start_date와 end_date를 나열하고
│        중복 기간을 제외한 순 경력 연수를 단계적으로 계산하세요."
├── Few-shot 예제 2건 추가 (표준 형식 + 비표준 형식)
└── A/B 테스트: 기존 프롬프트 vs CoT 프롬프트 (20건 샘플)

Task 2-2: PROFILE_SCHEMA strict 모드 전환 (시범)
├── strict: True, additionalProperties: False
├── 필수 필드 nullable 처리 방식 결정
├── 단위 테스트: 10개 샘플 이력서로 검증
└── 롤백 기준: 파싱 실패율 5% 초과 시 revert
```

**예상 공수**: 12h (CoT 6h + strict 스키마 6h)

#### Week 3-4: 체크포인트 활성화 + 운영 안정성 (P1)

```
Task 3-1: AI 분석 단계 체크포인트 구현
├── _stage_analysis() 진입 전 ctx.create_checkpoint()
├── LLM 호출 실패 시 ctx.restore_from_checkpoint()로 복원
├── 재시도 로직: 최대 1회 재시도, 체크포인트 기반
└── is_retry 플래그와 연동

Task 3-2: Feature Flag 커버리지 매핑 문서
├── USE_NEW_PIPELINE → pipeline_orchestrator.py 전체
├── USE_LLM_VALIDATION → _stage_validation() 분기
├── USE_AGENT_MESSAGING → analyst_wrapper.py:349
├── USE_HALLUCINATION_DETECTION → _detect_hallucinations()
├── USE_EVIDENCE_TRACKING → _process_analysis_result():512
└── DEBUG_PIPELINE → context_summary 포함 여부
```

**예상 공수**: 8h (체크포인트 6h + 문서 2h)

#### Week 5-6: 프롬프트 버전 관리 + 대시보드 (P2)

```
Task 4-1: 스키마/프롬프트 버전 키
├── RESUME_JSON_SCHEMA에 "version": "1.0.0" 추가
├── RESUME_SCHEMA_PROMPT에 version 주석 추가
├── 로그에 schema_version 기록
└── 메트릭에 schema_version 포함

Task 4-2: Provider 품질/비용 대시보드 기초
├── MetricsCollector에 provider별 집계 추가
├── /metrics 엔드포인트에 provider 상세 정보 포함
├── 평균 처리 시간, 성공률, 비용 per provider
└── Grafana/DataDog 연동은 추후 결정
```

**예상 공수**: 10h (버전 관리 4h + 대시보드 6h)

### 21.4. 리스크 매트릭스

| 리스크 | 현재 상태 | 심각도 | 발생 가능성 | 완화 방안 |
|--------|----------|--------|------------|----------|
| LLM 비용 추적 부정확 | 🔴 추정치 사용 | High | 확실 (현재 발생 중) | Week 1에서 실제 usage 전파 구현 |
| 프롬프트 변경으로 품질 회귀 | 🟡 버전 미관리 | Medium | 변경 시 발생 | Week 5에서 버전 키 도입 |
| 스키마 strict 전환 시 파싱 실패 | 🟡 strict: False | Medium | 전환 시 발생 | Week 2에서 시범 적용 + 5% 실패 기준 롤백 |
| 체크포인트 없이 LLM 실패 시 전체 재처리 | 🟡 미구현 | Medium | LLM 장애 시 | Week 3에서 분석 단계 체크포인트 활성화 |
| 문서 불일치 누적 | 🟡 수동 관리 | Low | 시간 경과 시 | Section 21.1로 1차 보정 완료. CI 자동화 검토. |

### 21.5. 총 예상 공수

| 주차 | 작업 | 공수 | 우선순위 |
|------|------|------|----------|
| Week 1 | 메트릭 정확도 + 문서 보정 | 4h | P0 |
| Week 2-3 | 프롬프트 CoT + 스키마 strict 시범 | 12h | P1 |
| Week 3-4 | 체크포인트 + Feature Flag 문서 | 8h | P1 |
| Week 5-6 | 프롬프트 버전 관리 + 대시보드 | 10h | P2 |
| **합계** | | **34h** | |

> **참고**: 위 공수는 코드 리뷰 회신 항목에 대한 개선만 포함합니다. Phase 1 잔여 작업(Section 18)과 별도로 병행합니다.

---

*이 문서는 2026-02-13 기준 코드베이스를 검증하여 작성되었습니다.*
*Enterprise 플랜은 제거되었으며, Starter(무료)/Pro(₩89,000) 2-tier로 운영합니다.*
