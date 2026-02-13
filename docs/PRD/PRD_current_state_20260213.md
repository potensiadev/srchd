# 서치드(srchd) PRD — Product Requirements Document

> **Document Version**: v1.0 (Current State)
> **Product Name**: 서치드 (srchd) / 내부명 RAI (Recruitment Asset Intelligence)
> **Product Type**: B2B SaaS
> **Date**: 2026-02-13
> **Author**: Senior Product Manager
> **Status**: Phase 1 Near Completion → Closed Beta

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target User & Persona](#3-target-user--persona)
4. [Product Vision & Strategy](#4-product-vision--strategy)
5. [Core Features (Phase 1 — MVP)](#5-core-features-phase-1--mvp)
6. [User Flows](#6-user-flows)
7. [Information Architecture](#7-information-architecture)
8. [API Specification](#8-api-specification)
9. [Data Architecture](#9-data-architecture)
10. [AI Pipeline Architecture](#10-ai-pipeline-architecture)
11. [Security & Compliance](#11-security--compliance)
12. [Pricing & Monetization](#12-pricing--monetization)
13. [Success Metrics (KPIs)](#13-success-metrics-kpis)
14. [Phase Roadmap](#14-phase-roadmap)
15. [Technical Stack & Infrastructure](#15-technical-stack--infrastructure)
16. [Known Issues & Technical Debt](#16-known-issues--technical-debt)
17. [Appendix](#17-appendix)

---

## 1. Executive Summary

### 1.1. 한 줄 요약

> **서치드**는 헤드헌터의 PC에 방치된 이력서를 AI가 자동 분석하여 검색 가능한 인재 자산으로 전환하고, 개인정보를 안전하게 보호하면서 블라인드 내보내기까지 제공하는 **AI 이력서 분석 플랫폼**입니다.

### 1.2. Product Snapshot

| 항목 | 내용 |
|------|------|
| **Product Name** | 서치드 (srchd) |
| **Internal Codename** | srchd |
| **Service Domain** | HR Tech / Recruitment SaaS |
| **Target Market** | 한국 프리랜서 헤드헌터 & 소규모 서치펌 |
| **Core Philosophy** | "Zero Tolerance for Error" — 타협 없는 정확도 |
| **Current Phase** | Phase 1 (Core MVP) — 95% 완료 |
| **Go-To-Market** | Closed Beta → 유료 전환 |
| **Deployment** | Vercel (Frontend) + Railway (Worker) + Supabase Cloud |

### 1.3. Key Differentiators

| # | 차별점 | 설명 |
|---|--------|------|
| 1 | **Multi-Agent AI Pipeline** | 단일 LLM이 아닌, 6개 전문 에이전트가 역할 분담하여 분석 정확도 극대화 |
| 2 | **Cross-Check System** | GPT-4o + Gemini 2-Way (Phase 1), + Claude 3-Way (Phase 2) 교차 검증 |
| 3 | **HWP 3-Stage Fallback** | 한국 특화 — HWP/HWPX 파싱을 3단계로 보장 (직접 파싱 → LibreOffice → 한컴 API) |
| 4 | **Privacy-First Architecture** | AES-256-GCM 암호화, SHA-256 해시, PII 마스킹, 블라인드 내보내기 |
| 5 | **Hybrid Search** | RDB 필터 + Vector 시맨틱 검색의 하이브리드 검색 |

---

## 2. Problem Statement

### 2.1. 핵심 문제 (Pain Points)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     헤드헌터의 3대 고통                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔴 PAIN 1: Dead Assets (검색 불가 이력서)                          │
│  ─────────────────────────────────────────                           │
│  • PC에 수천 개 이력서가 폴더별로 방치                                │
│  • 필요한 후보자를 찾으려면 수작업으로 파일을 하나씩 열어야 함       │
│  • 과거에 만났던 좋은 후보자를 기억에 의존                           │
│                                                                      │
│  🔴 PAIN 2: Risk & Admin Overhead (리스크 + 행정 부담)              │
│  ─────────────────────────────────────────                           │
│  • 블라인드 처리 실수 → 직거래 리스크 (수수료 손실)                  │
│  • 이력서 정리/편집에 업무 시간의 40% 소모                           │
│  • 중복 연락, 잘못된 정보 전달 등 실수 빈발                         │
│                                                                      │
│  🔴 PAIN 3: Legal Compliance (법적 리스크)                          │
│  ─────────────────────────────────────────                           │
│  • 후보자 개인정보 처리에 대한 법적 책임 불명확                      │
│  • 입수경위(제3자 정보 보증) 입증 의무 증가                          │
│  • 개인정보 유출 사고 시 민·형사 책임                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2. 시장 컨텍스트

| 지표 | 수치 |
|------|------|
| 한국 헤드헌터 수 (추정) | ~15,000명 |
| 프리랜서/소규모 서치펌 비율 | ~60% |
| 평균 보유 이력서 | 1,000~5,000건/인 |
| 커미션 단가 | 연봉의 15~25% (평균 ~1,000만원/건) |
| 연간 성사 건수 (프리) | 4~12건/년 |

### 2.3. 기존 대안의 한계

| 대안 | 한계 |
|------|------|
| 엑셀/폴더 관리 | 검색 불가, 데이터 노후화, 블라인드 처리 수작업 |
| 대형 ATS (iCIMS, Greenhouse 등) | 한국 포맷(HWP) 미지원, 과도한 가격, 기업 대상 |
| 사람인 DB, 원티드 등 | 내가 만난 후보자가 아닌 공개 DB, 차별화 어려움 |

---

## 3. Target User & Persona

### 3.1. Primary Persona: 이서연 (프리랜서 헤드헌터)

| 항목 | 내용 |
|------|------|
| **나이/직업** | 38세, 프리랜서 IT 헤드헌터 (경력 8년) |
| **보유 이력서** | PC에 3,200건 (HWP 60%, PDF 30%, DOCX 10%) |
| **월 처리 포지션** | 3~5개 |
| **핵심 KPI** | TTR (Time To Recommend), 면접 전환율, 월 커미션 |
| **기술 수준** | 비기술직 — 엑셀과 카톡이 주 업무 도구 |
| **Pain** | "좋은 후보자가 내 PC 어딘가에 있는데, 찾을 수가 없어요" |
| **Goal** | "JD 받으면 당일 내에 3~5명 추천할 수 있으면 좋겠다" |
| **Willingness to Pay** | 월 5~15만원 (커미션 대비 미미한 비용) |

### 3.2. Secondary Persona: 김팀장 (소규모 서치펌 운영)

| 항목 | 내용 |
|------|------|
| **나이/직업** | 45세, 3인 서치펌 대표 |
| **팀 보유 이력서** | ~10,000건 (팀원별 분산) |
| **핵심 니즈** | 팀 공유 DB, 중복 접촉 방지, 성과 리포트 |
| **Phase 대상** | Phase 2 (Team CRM) |

---

## 4. Product Vision & Strategy

### 4.1. Product Vision

```
"헤드헌터의 이력서 폴더를 AI 기반 인재 인텔리전스 플랫폼으로 전환한다"

Dead Files  →  Searchable Assets  →  Revenue Engine
(현재)         (Phase 1)              (Phase 2)
```

### 4.2. Strategic Pillars

| Pillar | 설명 | Phase |
|--------|------|-------|
| **Accuracy** | "Zero Tolerance for Error" — AI Cross-Check로 정확도 극대화 | P1 ✅ |
| **Privacy** | 개인정보 암호화, 블라인드 내보내기, 법적 동의 관리 | P1 ✅ |
| **Speed** | JD 업로드 → 즉시 매칭, 하이브리드 검색 | P1 ✅ / P2 |
| **Intelligence** | 채용공고 크롤링, 수요-공급 자동 매칭 (Sales Radar) | P2 |
| **Collaboration** | 팀 CRM, 중복 접촉 방지, 공유 DB | P2 |

### 4.3. Go-To-Market Strategy

```
Phase 1: Product-Led Growth
  └── 무료 Starter (50크레딧/월)로 사용자 확보
  └── AI 분석 품질 체험 후 Pro 전환 유도

Phase 2: Sales-Assisted Growth
  └── 서치펌 대상 Enterprise 플랜 영업
  └── 업계 네트워크 레퍼럴 프로그램
```

---

## 5. Core Features (Phase 1 — MVP)

### 5.1. Feature Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         서치드 Feature Map (Phase 1)                    │
├───────────────┬───────────────┬───────────────┬───────────────────────── ┤
│  INGESTION    │  AI ANALYSIS  │  SEARCH       │  OUTPUT                  │
│               │               │               │                          │
│  • 이력서     │  • Multi-     │  • 하이브리드 │  • 후보자 목록/상세      │
│    업로드     │    Agent      │    검색       │  • AI 검토 UI            │
│  • HWP/PDF/  │    Pipeline   │  • 스킬 동의어│  • 블라인드 내보내기     │
│    DOCX/DOC   │  • 2-Way      │    확장       │  • 포지션 관리           │
│  • 파일 검증  │    Cross-     │  • 검색 피드백│  • 분석 대시보드         │
│  • 크레딧     │    Check      │  • 저장된     │  • 설정                  │
│    차감       │  • PII 마스킹 │    검색       │                          │
│               │  • 증명사진   │               │                          │
│               │  • 임베딩     │               │                          │
├───────────────┴───────────────┴───────────────┴───────────────────────── ┤
│  COMPLIANCE                                                             │
│  • 제3자 정보 보증 동의  • AES-256-GCM  • RLS  • CSRF  • Rate Limit   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2. Feature Details

#### F1. 이력서 업로드 `✅ Production Ready`

| 항목 | 스펙 |
|------|------|
| **지원 포맷** | HWP, HWPX, DOC, DOCX, PDF |
| **최대 크기** | 50MB |
| **최대 페이지** | 50페이지 (초과 시 업로드 거절) |
| **DRM/암호화** | 즉시 반려 (Magic Number 검증) |
| **다중 인물** | 2명 이상 감지 시 거절 (`identity_checker.py`) |
| **크레딧** | 1 파일 = 1 크레딧 (실패 시 자동 환불) |
| **비동기 처리** | Redis Queue → Python Worker |
| **실시간 상태** | Webhook 기반 프론트엔드 업데이트 |

#### F2. AI 분석 파이프라인 `✅ Production Ready`

| Agent | 역할 | 기술 |
|-------|------|------|
| **RouterAgent** | 파일 타입 감지, DRM 체크, 페이지 제한 | Magic Number, olefile |
| **AnalystAgent** | 이력서 구조화 + Cross-Check | GPT-4o + Gemini 2.0 Flash |
| **PrivacyAgent** | PII 감지/마스킹/암호화 | AES-256-GCM, SHA-256 |
| **VisualAgent** | 증명사진 추출, 포트폴리오 캡처 | OpenCV, Playwright |
| **IdentityChecker** | 다중 인물 감지 | 정규표현식 + AI |
| **ValidationAgent** | 최종 유효성 검증 | 스키마 검증 |

**Cross-Check 방식:**

| Mode | Providers | 메커니즘 |
|------|-----------|----------|
| Phase 1 (2-Way) | GPT-4o + Gemini | 양쪽 분석 비교, 불일치 시 경고 |
| Phase 2 (3-Way) | + Claude 3.5 Sonnet | 3자 다수결, 최고 정확도 |

#### F3. 하이브리드 검색 `✅ Production Ready`

| 모드 | 조건 | 기술 | 최적화 |
|------|------|------|--------|
| **키워드 검색** | 쿼리 ≤10자 | PostgreSQL ILIKE | 병렬 쿼리 |
| **시맨틱 검색** | 쿼리 >10자 | pgvector (cosine similarity) | IVFFlat 인덱스 |

**부가 기능:**
- 스킬 동의어 확장 (`skill_synonyms` 테이블)
- 타이포(오타) 보정 (`lib/search/typo.ts`)
- Facet 계산 (스킬, 회사, 경력년수)
- 검색 피드백 수집 (relevant / not_relevant)
- 저장된 검색 조건
- SQL Injection 방지 (`escapeILikePattern`)
- Rate Limiting (분당 30회)

#### F4. AI 검토 UI `✅ Production Ready`

| 기능 | 설명 |
|------|------|
| **필드별 신뢰도** | Progress Bar (녹 ≥95%, 황 ≥80%, 적 <80%) |
| **인라인 편집** | 필드별 즉시 수정 + Optimistic Update + 롤백 |
| **경고 시스템** | 낮은 신뢰도 필드 하이라이트 + 경고 메시지 |
| **경력 자동 계산** | 중복 기간 병합, "N년 M개월" 포맷 |
| **연타 방지** | 500ms debounce |

#### F5. 블라인드 내보내기 `✅ Production Ready`

| 항목 | 스펙 |
|------|------|
| **마스킹 대상** | 전화번호, 이메일, 주소 |
| **출력 형식** | HTML (클라이언트에서 PDF 변환) |
| **월 제한** | Starter: 30회, Pro: 무제한 |
| **감사 로그** | IP 익명화(SHA-256 앞 16자) + User Agent |
| **기록** | `blind_exports` 테이블에 저장 |

#### F6. 동의 플로우 `✅ Production Ready`

| 동의 항목 | 필수 여부 |
|----------|----------|
| 서비스 이용약관 | ✅ 필수 |
| 개인정보 처리방침 | ✅ 필수 |
| **제3자 정보 보증** | ✅ 필수 (핵심 — 후보자 정보 입수경위 보증) |
| 마케팅 정보 수신 | ⬜ 선택 |

- **Middleware 이중 검증**: `users.consents_completed` + `user_consents.third_party_data_guarantee`
- 미완료 시 모든 보호 경로에서 `/consent`로 리다이렉트

#### F7. 포지션 관리 `✅ Production Ready`

| 기능 | 설명 |
|------|------|
| JD 업로드/입력 | 채용공고(JD) 기반 포지션 생성 |
| JD 자동 추출 | AI가 JD에서 핵심 요구사항 추출 |
| 후보자 매칭 | 포지션 요구사항 기반 후보자 매칭 |

#### F8. 분석 대시보드 `✅ Production Ready`

| 기능 | 설명 |
|------|------|
| 파이프라인 현황 | 업로드/처리/완료/실패 통계 |
| 크레딧 사용량 | 월별 크레딧 소모 트래킹 |

---

## 6. User Flows

### 6.1. 핵심 사용자 플로우

```
┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐
│ Landing  │───▶│  Sign Up  │───▶│  Consent  │───▶│Dashboard │
│  Page    │    │  / Login  │    │  (필수)    │    │          │
└──────────┘    └───────────┘    └───────────┘    └────┬─────┘
                                                       │
        ┌──────────────────────────────────────────────┤
        │                    │                          │
        ▼                    ▼                          ▼
┌──────────────┐  ┌──────────────┐          ┌──────────────┐
│   Upload     │  │   Search     │          │  Candidates  │
│  이력서 업로드│  │  후보자 검색  │          │   목록/상세   │
└───────┬──────┘  └──────┬───────┘          └───────┬──────┘
        │                │                          │
        ▼                │                          ▼
┌──────────────┐         │                 ┌──────────────┐
│  AI 분석     │         │                 │  Review UI   │
│  (비동기)     │         │                 │  AI 결과 검토 │
└───────┬──────┘         │                 └───────┬──────┘
        │                │                         │
        ▼                │                         ▼
┌──────────────┐         │                 ┌──────────────┐
│  결과 확인   │◀────────┘                 │ Blind Export │
│  + 검토      │                           │ 블라인드 내보내기│
└──────────────┘                           └──────────────┘
```

### 6.2. 업로드 → 분석 완료 Flow (비동기)

```
1. 사용자가 이력서 파일 드래그 & 드롭
2. 프론트엔드: 파일 검증 (크기, 확장자)
3. API: Magic Number 검증, DRM 체크
4. API: Supabase Storage에 파일 저장
5. API: processing_jobs 레코드 생성
6. API: Redis Queue에 Job 등록
7. 프론트엔드: "분석 중" 상태 표시 (폴링 or Webhook)
8. Worker: RouterAgent → Parser → AnalystAgent → PrivacyAgent → VisualAgent → EmbeddingService
9. Worker: DB 저장 + 상태 업데이트
10. Worker: Webhook 통지
11. 프론트엔드: 분석 완료 → 결과 표시
```

---

## 7. Information Architecture

### 7.1. 라우팅 구조

```
/                           # 랜딩 페이지
├── /login                  # 로그인
├── /signup                 # 회원가입
├── /consent                # 필수 동의 화면
├── /pricing                # 가격 정책
├── /terms                  # 이용약관
├── /privacy                # 개인정보 처리방침
├── /products               # 제품 소개
├── /support                # 고객 지원
│
├── /candidates             # 후보자 목록 [🔒 인증 필요]
├── /candidates/[id]        # 후보자 상세
├── /upload                 # 이력서 업로드 [🔒]
├── /search                 # 검색 [🔒]
├── /analytics              # 분석 대시보드 [🔒]
├── /positions              # 포지션 관리 [🔒]
├── /projects               # 프로젝트 관리 [🔒]
├── /review                 # AI 검토 [🔒]
└── /settings               # 설정 [🔒]
```

### 7.2. Navigation Structure

```
Sidebar Navigation (Dashboard)
├── 📊 대시보드 (Analytics)
├── 📤 업로드 (Upload)
├── 👥 후보자 (Candidates)
├── 🔍 검색 (Search)
├── 📋 포지션 (Positions)
├── 📁 프로젝트 (Projects)
└── ⚙️ 설정 (Settings)
```

---

## 8. API Specification

### 8.1. 엔드포인트 요약

| Method | Endpoint | 설명 | Rate Limit |
|--------|----------|------|------------|
| `POST` | `/api/upload` | 이력서 업로드 + AI 분석 시작 | 분당 10회 |
| `GET` | `/api/upload` | 업로드 작업 상태 조회 | 분당 60회 |
| `GET` | `/api/candidates` | 후보자 목록 조회 (페이지네이션) | 분당 30회 |
| `GET` | `/api/candidates/[id]` | 후보자 상세 조회 | 분당 30회 |
| `PATCH` | `/api/candidates/[id]` | 후보자 정보 수정 | 분당 20회 |
| `DELETE` | `/api/candidates/[id]` | 후보자 삭제 | 분당 10회 |
| `POST` | `/api/candidates/[id]/export` | 블라인드 내보내기 | 분당 5회 |
| `GET` | `/api/candidates/[id]/export` | 내보내기 사용량 조회 | 분당 30회 |
| `POST` | `/api/search` | 하이브리드 검색 | 분당 30회 |
| `POST` | `/api/search/feedback` | 검색 피드백 저장 | 분당 30회 |
| `GET` | `/api/user/credits` | 크레딧 정보 조회 | 분당 30회 |
| `POST` | `/api/auth/check-email` | 이메일 중복 확인 | 분당 10회 |
| `POST` | `/api/positions` | 포지션 생성 | 분당 10회 |
| `GET` | `/api/positions` | 포지션 목록 조회 | 분당 30회 |
| `GET` | `/api/positions/[id]/matches` | 포지션 매칭 결과 | 분당 10회 |
| `GET` | `/api/saved-searches` | 저장된 검색 목록 | 분당 30회 |
| `POST` | `/api/webhooks/worker` | Worker → Frontend 알림 | 내부 전용 |
| `GET` | `/api/health` | 헬스 체크 | 제한 없음 |
| `GET` | `/api/cron/cleanup-storage` | 스토리지 정리 (일일 Cron) | 내부 전용 |

### 8.2. 표준 응답 형식

```json
// 성공
{
  "success": true,
  "data": { ... }
}

// 실패
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "크레딧이 부족합니다."
  }
}
```

### 8.3. 인증 방식

- **Supabase SSR 쿠키 기반** (Bearer Token 아님)
- Middleware에서 자동 세션 갱신 (`updateSession`)
- 보호된 경로: `/candidates`, `/upload`, `/search`, `/settings`, `/analytics`, `/risk`

---

## 9. Data Architecture

### 9.1. ERD (핵심 테이블)

```
┌──────────────┐      ┌──────────────────┐      ┌───────────────────┐
│    users     │      │   user_consents  │      │ credit_transactions│
│──────────────│      │──────────────────│      │───────────────────│
│ id (PK)      │ 1──N │ user_id (FK)     │      │ user_id (FK)      │
│ email        │      │ terms_of_service │      │ type              │
│ plan         │      │ privacy_policy   │      │ amount            │
│ credits      │      │ third_party_data │      │ balance_after     │
│ consents_    │      │   _guarantee ✅  │      │ candidate_id (FK) │
│   completed  │      └──────────────────┘      └───────────────────┘
└──────┬───────┘
       │ 1
       │
       │ N
┌──────┴───────┐      ┌──────────────────┐      ┌──────────────────┐
│  candidates  │      │ candidate_chunks │      │  blind_exports   │
│──────────────│      │──────────────────│      │──────────────────│
│ id (PK)      │ 1──N │ candidate_id(FK) │      │ candidate_id(FK) │
│ user_id (FK) │      │ content          │      │ user_id (FK)     │
│ name         │      │ chunk_type       │      │ format           │
│ skills[]     │      │ embedding        │      │ file_name        │
│ exp_years    │      │   (vector 1536)  │      │ masked_fields[]  │
│ phone_encryp │      └──────────────────┘      │ ip_address (hash)│
│ email_encryp │                                 └──────────────────┘
│ confidence   │
│ status       │      ┌──────────────────┐      ┌──────────────────┐
│ analysis_mode│      │ processing_jobs  │      │  positions       │
│ risk_level   │      │──────────────────│      │──────────────────│
│ ...          │      │ user_id (FK)     │      │ user_id (FK)     │
└──────────────┘      │ candidate_id(FK) │      │ title            │
                      │ status           │      │ requirements     │
                      │ file_name        │      │ skills_required[]│
                      │ error_message    │      └──────────────────┘
                      └──────────────────┘

┌──────────────────┐  ┌──────────────────┐      ┌──────────────────┐
│ skill_synonyms   │  │ search_feedback  │      │  saved_searches  │
│──────────────────│  │──────────────────│      │──────────────────│
│ canonical        │  │ search_id        │      │ user_id (FK)     │
│ synonym          │  │ candidate_id(FK) │      │ name             │
│ category         │  │ feedback         │      │ query            │
└──────────────────┘  └──────────────────┘      │ filters          │
                                                 └──────────────────┘
```

### 9.2. 핵심 테이블

| 테이블 | 용도 | RLS |
|--------|------|-----|
| `users` | 사용자 정보, 플랜, 크레딧′ | ✅ |
| `user_consents` | 약관 동의 기록 (버전 관리) | ✅ |
| `candidates` | 후보자 정형 데이터 + 암호화 필드 | ✅ |
| `candidate_chunks` | 벡터 검색용 청크 (pgvector 1536dim) | ✅ |
| `processing_jobs` | 비동기 작업 추적 | ✅ |
| `blind_exports` | 블라인드 내보내기 이력 + 감사 로그 | ✅ |
| `positions` | 채용 포지션 관리 | ✅ |
| `skill_synonyms` | 기술 동의어 매핑 (React↔리액트 등) | Public |
| `search_feedback` | 검색 결과 피드백 | ✅ |
| `credit_transactions` | 크레딧 거래 이력 | ✅ |
| `saved_searches` | 저장된 검색 조건 | ✅ |

### 9.3. 암호화 필드 구조

```
candidates 테이블:
├── phone_encrypted   (AES-256-GCM) ─── 원본 저장 (복호화 가능)
├── phone_hash        (SHA-256)     ─── 중복 감지용 (복호화 불가)
├── phone_masked      (마스킹)      ─── UI 표시용 ("010-****-5678")
│
├── email_encrypted   (AES-256-GCM)
├── email_hash        (SHA-256)
├── email_masked      (마스킹)
│
├── address_encrypted (AES-256-GCM)
└── address_masked    (마스킹)
```

---

## 10. AI Pipeline Architecture

### 10.1. Multi-Agent Pipeline Flow

```
                    ┌─────────────┐
                    │ File Upload │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │RouterAgent  │  파일 타입 감지
                    │             │  DRM/암호화 체크
                    │             │  페이지 수 검증
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Parser    │  HWP → 3-Stage Fallback
                    │             │  PDF → pdfplumber
                    │             │  DOCX → python-docx
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │  GPT-4o    │ │  Gemini   │ │  Claude    │
     │ (Primary)  │ │ (Second.) │ │ (Tertiary) │
     └─────┬──────┘ └─────┬─────┘ └─────┬──────┘
           │              │              │
           └──────┬───────┘              │
                  ▼                      │ (Phase 2)
           ┌────────────┐               │
           │ Cross-Check│◄──────────────┘
           │ (다수결)    │
           └──────┬─────┘
                  │
           ┌──────▼──────┐     ┌─────────────┐
           │PrivacyAgent │     │ VisualAgent  │
           │ PII 마스킹   │     │ 증명사진     │
           │ AES 암호화   │     │ 포트폴리오   │
           └──────┬──────┘     └──────┬──────┘
                  │                   │
                  └────────┬──────────┘
                           │
                    ┌──────▼──────┐
                    │  Embedding  │  텍스트 청킹
                    │  Service    │  → text-embedding-3-small
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Database   │  candidates + chunks
                    │  Service    │  → Supabase
                    └─────────────┘
```

### 10.2. HWP 3-Stage Fallback

```
1차: 직접 파싱 (olefile/ZIP) → 성공 시 반환
   ↓ 실패
2차: LibreOffice 변환 → 성공 시 반환
   ↓ 실패
3차: 한컴 API (HANCOM_API_KEY 필요) → 성공 시 반환
   ↓ 실패
파싱 실패 반환
```

### 10.3. 청크 타입별 가중치

| 청크 타입 | 가중치 | 용도 |
|----------|--------|------|
| summary | 1.0 | 핵심 요약 |
| career | 0.9 | 경력 사항 |
| skill | 0.85 | 기술 스택 |
| project | 0.8 | 프로젝트 경험 |
| education | 0.5 | 학력 |

---

## 11. Security & Compliance

### 11.1. 5대 리스크 방어

| # | 리스크 | 대응 | 구현 위치 |
|---|--------|------|----------|
| 1 | **직거래 (Skipping)** | PII 자동 마스킹 + 블라인드 내보내기 | `privacy_agent.py`, `export/route.ts` |
| 2 | **개인정보 유출** | AES-256-GCM 암호화 + 키 로테이션 | `privacy_agent.py` |
| 3 | **악성 파일/DRM** | Magic Number 검증 + 암호화 감지 | `router_agent.py` |
| 4 | **프롬프트 주입** | System Prompt Hardening | `llm_manager.py` |
| 5 | **개인정보보호법** | 제3자 동의 필수 + 동의 이력 관리 | `consent/page.tsx`, `middleware.ts` |

### 11.2. 인프라 보안

| 보호 기능 | 구현 |
|----------|------|
| CSRF 보호 | Origin/Referer 검증 (`middleware.ts`) |
| Rate Limiting | 엔드포인트별 차등 (`lib/rate-limit.ts`) |
| Auth Middleware | Supabase 세션 검증 |
| Row Level Security | 모든 사용자 데이터 테이블 |
| Security Headers | CSP, HSTS, X-Frame-Options 등 (`vercel.json`) |
| 암호화 키 관리 | `ENCRYPTION_KEY` + `ENCRYPTION_KEY_V1` (로테이션) |

### 11.3. 개인정보 처리 원칙

```
수집 → 동의 (제3자 정보 보증 포함)
저장 → 암호화 (AES-256-GCM)
표시 → 마스킹 (010-****-5678)
내보내기 → 블라인드 (연락처 완전 제거)
삭제 → CASCADE (사용자 삭제 시 모든 데이터 삭제)
감사 → blind_exports에 이력 기록 (IP 익명화)
```

---

## 12. Pricing & Monetization

### 12.1. 요금제 구조

| | **Starter** | **Pro** |
|--|-------------|---------|
| **가격** | 무료 | ₩49,000/월 (Paddle 기준) |
| **크레딧** | 50/월 | 150/월 |
| **Cross-Check** | 2-Way | 3-Way (Phase 2) |
| **블라인드 내보내기** | 30회/월 | 무제한 |
| **타겟** | 체험/소량 사용자 | 전업 헤드헌터 |

> ⚠️ **알려진 이슈**: `types/auth.ts` (PRD v6.0 가격: ₩79,000/₩149,000)와 `lib/paddle/config.ts` (₩0/₩49,000/₩99,000)의 가격이 불일치합니다.

### 12.2. 크레딧 정책

| 정책 | 상세 |
|------|------|
| 소모 | 이력서 1건 업로드 = 1 크레딧 (페이지 수 무관) |
| 환불 | 분석 실패 시 자동 환불 |
| 초과 | Overage Billing 미구현 (Phase 1 잔여) |
| 갱신 | 월 초 리셋 (구독 동기화 미구현) |

### 12.3. 결제 연동 현황

| 항목 | 상태 |
|------|------|
| Paddle 클라이언트 (프론트엔드) | ✅ 완료 |
| Paddle 설정 (플랜 매핑) | ✅ 완료 |
| **Paddle Webhook 처리** | ❌ **미구현** (Critical) |
| **구독 상태 동기화** | ❌ **미구현** (Critical) |
| Auto-Reload | ❌ 미구현 |
| Overage Billing | ❌ 미구현 |

---

## 13. Success Metrics (KPIs)

### 13.1. 프로덕트 메트릭

| 카테고리 | KPI | 목표 (Phase 1) | 측정 방법 |
|----------|-----|----------------|----------|
| **품질** | AI 파싱 성공률 | ≥95% | `processing_jobs` 완료율 |
| **품질** | HWP 성공률 | ≥95% | HWP 타입 한정 완료율 |
| **품질** | AI 분석 정확도 | ≥96% | `requires_review` 비율 역산 |
| **사용성** | 검색 만족도 | ≥80% | `search_feedback.relevant` 비율 |
| **활성도** | 월간 블라인드 내보내기 수 | 추적 중 | `blind_exports` 카운트 |
| **전환** | Starter → Pro 전환율 | ≥5% | 결제 이벤트 |
| **리텐션** | 월간 재방문율 | ≥40% | 세션 데이터 |

### 13.2. 비즈니스 메트릭 (Closed Beta)

| KPI | 목표 |
|-----|------|
| Beta 사용자 확보 | 50명 |
| NPS Score | ≥40 |
| 유료 전환 의향 | ≥30% |

---

## 14. Phase Roadmap

### Phase 1: Core MVP `95% 완료`

```
✅ 완료 (20개 기능)
├── Multi-Agent Pipeline (6개 Agent)
├── 2-Way Cross-Check (GPT + Gemini)
├── 3-Way Cross-Check (+ Claude) — 코드 완료, 활성화 대기
├── AES-256-GCM 암호화 + 키 로테이션
├── PII 마스킹
├── 동의 플로우 (제3자 정보 보증 포함)
├── 하이브리드 검색 (RDB + Vector)
├── 스킬 동의어 확장
├── 검색 피드백 수집
├── 병렬 쿼리 최적화
├── 청킹 전략
├── HWP 3단계 Fallback
├── PDF/DOCX 파싱
├── 증명사진 추출 (OpenCV)
├── 포트폴리오 썸네일 (Playwright)
├── CSRF 보호 + Rate Limiting
├── 블라인드 내보내기
├── AI 검토 UI (고급 기능)
├── 포지션 관리 + JD 추출
└── Paddle 클라이언트

❌ 미완료 (Phase 1 잔여 — Critical)
├── Paddle Webhook 처리 (예상 4h)
├── 구독 상태 동기화 (예상 2h)
└── E2E 테스트 보강 (예상 8h)
```

### Phase 2: Premium Features `계획 단계`

| 기능 | 설명 | 의존성 |
|------|------|--------|
| 3-Way Cross-Check 활성화 | Claude 추가 교차 검증 | Phase 1 완료 |
| **후보자 라이프사이클 관리** | CRM 스타일 필드 (이직의향, 마지막 연락일) | DB 마이그레이션 |
| **JD Auto-Match** | JD 업로드 → 즉시 상위 20명 매칭 | 기존 코드 조합 |
| **재활성 검색 필터** | 미접촉 기간 기반 필터링 | 라이프사이클 선행 |
| **후보자 제출 패키지** | JD 기반 매칭 근거 + 리스크 + 면접 질문 자동 생성 | GPT-4 |
| Sales Radar | 채용공고 크롤링 + 수요 알림 | 크롤러 개발 |
| Team CRM | 다중 사용자 + 공유 DB | RBAC |
| 캠페인 관리 | 접촉 스케줄링 + 중복 방지 | 라이프사이클 |

### Phase 3: Scale `미래 계획`

| 기능 | 설명 |
|------|------|
| API Platform | 외부 ATS 연동 API |
| White-Label | 서치펌 브랜딩 커스텀 |
| Global Expansion | 영어 이력서 지원 |
| AI Interview | 예비 인터뷰 자동화 |

---

## 15. Technical Stack & Infrastructure

### 15.1. 기술 스택 상세

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js (App Router) | 16.1 | 풀스택 프레임워크 |
| **Language** | TypeScript | 5.9 | 타입 안전성 |
| **UI Library** | React | 19 | UI 렌더링 |
| **Design System** | shadcn/ui + Radix UI | Latest | 컴포넌트 라이브러리 |
| **Styling** | Tailwind CSS | 4 | 유틸리티 CSS |
| **Animation** | Framer Motion | 12 | UI 애니메이션 |
| **3D** | Three.js + R3F | - | 랜딩 페이지 비주얼 |
| **State (Server)** | TanStack React Query | 5 | 서버 상태 관리 |
| **State (Client)** | Zustand | 5 | 클라이언트 상태 |
| **Forms** | React Hook Form + Zod | - | 폼 관리 + 검증 |
| **Worker** | Python (FastAPI) | 3.11 | AI 파이프라인 |
| **Database** | PostgreSQL (Supabase) | 15 | 메인 DB |
| **Vector DB** | pgvector | 0.5+ | 시맨틱 검색 |
| **Queue** | Redis + RQ | 7+ | 비동기 작업 |
| **Storage** | Supabase Storage | - | 파일 저장 |
| **Auth** | Supabase Auth (GoTrue) | - | 인증/인가 |
| **AI (Primary)** | OpenAI GPT-4o | - | 이력서 분석 |
| **AI (Secondary)** | Google Gemini 2.0 Flash | - | Cross-Check |
| **AI (Tertiary)** | Anthropic Claude 3.5 Sonnet | - | 3-Way Check |
| **AI (Embedding)** | text-embedding-3-small | 1536d | 벡터 임베딩 |
| **Image** | OpenCV | 4.8+ | 얼굴 감지 |
| **Screenshot** | Playwright | - | 포트폴리오 캡처 |
| **Payment** | Paddle | - | 결제 (Sandbox) |
| **Monitoring** | Sentry | 10 | 에러 추적 |
| **Testing (Unit)** | Vitest | 4 | 단위 테스트 |
| **Testing (E2E)** | Playwright | 1.57 | E2E 테스트 |
| **Hosting (Web)** | Vercel | - | ICN 리전 |
| **Hosting (Worker)** | Railway | - | Worker 배포 |
| **PDF** | pdfjs-dist + react-pdf | - | PDF 뷰어/파싱 |
| **Document** | JSZip + Mammoth | - | DOCX/ZIP 처리 |

### 15.2. 인프라 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel (ICN)                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js 16 App Router                                    │  │
│  │  ├── Static Pages (ISR)                                   │  │
│  │  ├── API Routes (Serverless, Max 60s)                     │  │
│  │  └── Middleware (Auth + Consent + CSRF)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐                                               │
│  │ Cron Job     │  /api/cron/cleanup-storage (매일 03:00)      │
│  └──────────────┘                                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Supabase Cloud  │  │   Upstash Redis  │  │  Railway Worker  │
│                  │  │                  │  │                  │
│  PostgreSQL 15   │  │  Job Queue       │  │  Python 3.11     │
│  + pgvector      │  │  Cache           │  │  FastAPI         │
│  + pgcrypto      │  │  Rate Limit      │  │  6 AI Agents     │
│  Storage (S3)    │  │  Session Store   │  │  3 LLM Providers │
│  Auth (GoTrue)   │  │                  │  │  File Parsers    │
│  RLS Policies    │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 16. Known Issues & Technical Debt

### 16.1. Critical Issues

| # | 이슈 | 영향 | 우선순위 |
|---|------|------|----------|
| 1 | **Paddle Webhook 미구현** | 결제 후 구독 상태 자동 동기화 불가 | 🔴 Critical |
| 2 | **구독 상태 동기화 미구현** | 플랜 업그레이드/다운그레이드 반영 불가 | 🔴 Critical |

### 16.2. Technical Debt

| # | 항목 | 상세 |
|---|------|------|
| 1 | **가격 불일치** | `types/auth.ts` vs `lib/paddle/config.ts` 가격 통일 필요 |
| 2 | **PlanType 불일치** | `auth.ts`에는 `starter|pro`만, PRD/Paddle에는 `enterprise` 포함 |
| 3 | **package.json name** | `temp_app` → `srchd` 변경 필요 |
| 4 | **PRD 버전 불일치** | README는 Next.js 16, PRD v0.3은 Next.js 14로 기재 |
| 5 | **E2E 테스트 보강** | 핵심 플로우 E2E 커버리지 부족 |
| 6 | **Auto-Reload** | 크레딧 소진 시 자동 충전 미구현 |
| 7 | **Overage Billing** | 크레딧 초과 사용 과금 미구현 |

### 16.3. 활성화 대기 기능

| 기능 | 조건 |
|------|------|
| 3-Way Cross-Check (Claude) | `ANTHROPIC_API_KEY` 설정 + `ANALYSIS_MODE=phase_2` |
| HWP 한컴 API (3차 Fallback) | `HANCOM_API_KEY` 설정 |
| Sentry 모니터링 | `SENTRY_DSN` 설정 |
| Paddle 결제 | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` + `PADDLE_API_KEY` 설정 |

---

## 17. Appendix

### 17.1. 관련 문서

| 문서 | 위치 | 설명 |
|------|------|------|
| PRD v0.3 (코드 검증) | `docs/rai_prd_v0.3.md` | 코드 검증 완료된 기존 PRD |
| PRD v0.2 | `docs/rai_prd_v0.2.md` | 이전 버전 PRD |
| 개발 가이드 | `docs/rai_development_guide.md` | 상세 개발/설정 가이드 |
| 로드맵 (인터뷰 기반) | `docs/PRODUCT_ROADMAP_FROM_INTERVIEW.md` | 헤드헌터 인터뷰 기반 로드맵 |
| 배포 가이드 | `DEPLOYMENT.md` | 배포 절차 |
| OpenAPI Spec | `openapi.yaml` | API 명세 (3.1.0) |
| E2E 시나리오 | `docs/E2E_Test_Scenarios.md` | E2E 테스트 시나리오 |
| 환불 정책 | `docs/PRD/prd_refund_policy_v0.4.md` | 환불 정책 PRD |
| 법적 문서 | `docs/legal_documents.md` | 이용약관, 개인정보처리방침 |
| PM 분석 리포트 | `docs/FAANG PM Critical Analysis Report_20260113.md` | PM 관점 분석 |

### 17.2. 신뢰도 레벨 기준

```
≥ 95% → HIGH   (녹색) — 검토 불필요
≥ 80% → MEDIUM (황색) — 검토 권장
< 80% → LOW    (적색) — 검토 필수
```

### 17.3. 파일 검증 규칙

| 규칙 | 값 |
|------|-----|
| 최대 파일 크기 | 50MB |
| 최대 페이지 수 | 50페이지 |
| 허용 포맷 | HWP, HWPX, DOC, DOCX, PDF |
| DRM/암호화 | 즉시 반려 |
| 다중 인물 | 2명 이상 감지 시 거절 |
| Magic Number 검증 | 파일 확장자 위조 방지 |

---

*이 문서는 2026-02-13 기준 코드베이스를 분석하여 작성된 Product Requirements Document입니다.*
*코드 검증 기반으로 작성되었으며, 실제 구현과의 정합성을 보장합니다.*
