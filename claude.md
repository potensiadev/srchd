# CLAUDE.md — 서치드(srchd) 프로젝트 컨텍스트

> 이 파일은 AI 어시스턴트가 코드베이스를 이해하기 위한 **프로젝트 컨텍스트 문서**입니다.
> 마지막 업데이트: 2026-02-14

---

## ⚠️ 필수 규칙 (MANDATORY)

### 🔵 개발 시작 전: 반드시 이 문서를 먼저 읽어라
- **어떤 코드 작업이든 시작하기 전에 이 `CLAUDE.md` 문서를 반드시 먼저 읽고 프로젝트 컨텍스트를 파악하라.**
- 프로젝트 구조, 기술 스택, 컨벤션, 아키텍처 패턴을 이해한 상태에서 작업을 시작해야 한다.
- 관련 기능의 기존 구현 방식과 패턴을 확인하고, 이에 일관되게 코드를 작성하라.

### 🟠 코드 수정 후: 이 문서의 업데이트 필요 여부를 반드시 판단하라
아래 사항에 해당하는 코드 변경이 발생하면 **이 `CLAUDE.md` 파일도 함께 업데이트**해야 한다:
- **프로젝트 구조 변경**: 디렉토리/파일 추가·삭제·이동
- **기술 스택 변경**: 라이브러리 추가·제거, 버전 업그레이드
- **아키텍처 패턴 변경**: 데이터 플로우, 인증 방식, API 구조 변경
- **환경 변수 변경**: 새로운 환경 변수 추가 또는 기존 변수 삭제
- **개발 컨벤션 변경**: 코딩 스타일, 상태 관리 방식, 에러 처리 패턴 변경
- **배포 구성 변경**: 호스팅, CI/CD, 리전 등 인프라 변경
- **알려진 이슈 해결 또는 새로운 이슈 발견**

> 판단 기준: "새로 합류한 개발자나 AI가 이 문서만 읽었을 때, 변경된 내용을 모르면 실수할 수 있는가?" → **YES면 업데이트하라.**

---

## 1. 프로덕트 개요

**서치드(srchd, 내부명 RAI — Recruitment Asset Intelligence)**는 **프리랜서 헤드헌터**를 위한 AI 기반 이력서 분석 및 후보자 검색 SaaS 플랫폼입니다.

### 핵심 가치 제안
- **Dead Asset → Searchable Asset**: PC에 방치된 수천 개 이력서를 AI가 자동 분석하여 검색 가능한 인재 DB로 전환
- **Zero Tolerance for Error**: GPT-4o + Gemini 크로스체크로 업계 최고 수준의 분석 정확도 보장
- **Privacy-First**: AES-256-GCM 암호화 + 블라인드 내보내기로 직거래 리스크 차단

### 타겟 사용자
프리랜서/소규모 헤드헌팅 에이전시 서치펌 (한국 시장)

### 현재 단계
- **Phase 1 (Core MVP)**: 95% 완료 — Closed Beta 진행 중
- **결제(Paddle) Webhook**: 미구현 (Phase 1 잔여 작업)
- **Phase 2 (Premium)**: 계획 단계 (Sales Radar, 공고-후보자 매칭, Team CRM)

---

## 2. 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5.9 | |
| **UI** | Tailwind CSS 4 + shadcn/ui + Radix UI + Framer Motion | |
| **State Management** | Zustand, TanStack React Query, SWR | |
| **Backend (BFF)** | Next.js API Routes | Vercel Serverless Functions |
| **Worker** | Python 3.11 (FastAPI) | Railway 배포 |
| **Database** | Supabase (PostgreSQL 15 + pgvector + pgcrypto) | RLS 적용 |
| **Queue** | Redis + RQ | 비동기 작업 처리 |
| **File Storage** | Supabase Storage (S3 호환) | |
| **AI — 분석** | OpenAI GPT-4o (Primary), Gemini 2.0 Flash (Secondary), Claude 3.5 Sonnet (Tertiary) | |
| **AI — 임베딩** | text-embedding-3-small (1536 dim) | |
| **결제** | Paddle (Sandbox) | Webhook 미구현 |
| **Hosting** | Vercel (Frontend), Railway (Worker), Supabase Cloud | 리전: ICN (서울) |
| **Monitoring** | Sentry | |
| **Testing** | Vitest (Unit), Playwright (E2E) | |

---

## 3. 프로젝트 구조

```
srchd/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 인증 그룹 (login, signup, consent)
│   ├── (dashboard)/              # 대시보드 그룹 (인증 필요)
│   │   ├── analytics/            # 분석/통계 대시보드
│   │   ├── candidates/           # 후보자 목록 + 상세
│   │   ├── positions/            # 채용 포지션 관리
│   │   ├── projects/             # 프로젝트(폴더) 관리
│   │   ├── review/               # AI 분석 결과 검토
│   │   ├── settings/             # 설정
│   │   └── upload/               # 이력서 업로드
│   ├── (marketing)/              # 마케팅/랜딩 (비인증)
│   │   ├── page.tsx              # 랜딩 페이지
│   │   ├── pricing/              # 가격 정책
│   │   ├── privacy/              # 개인정보 처리방침
│   │   ├── terms/                # 이용약관
│   │   ├── products/             # 제품 소개
│   │   └── support/              # 고객 지원
│   └── api/                      # API Routes
│       ├── admin/                # 관리자 API
│       ├── auth/                 # 인증 API
│       ├── candidates/           # 후보자 CRUD + 내보내기 + 리뷰
│       ├── cron/                 # 스케줄러 (스토리지 정리)
│       ├── positions/            # 포지션 CRUD + JD 추출 + 매칭
│       ├── projects/             # 프로젝트 API
│       ├── refunds/              # 환불 API
│       ├── saved-searches/       # 저장된 검색
│       ├── search/               # 하이브리드 검색 API
│       ├── subscriptions/        # 구독 관리 API
│       ├── upload/               # 업로드 처리
│       ├── user/                 # 사용자 정보 API
│       └── webhooks/             # Worker/Paddle 콜백
├── apps/
│   └── worker/                   # Python Worker (별도 배포)
│       ├── agents/               # Multi-Agent Pipeline
│       │   ├── router_agent.py   # 파일 타입 감지, DRM 체크, 페이지 제한
│       │   ├── analyst_agent.py  # 2/3-Way Cross-Check (GPT+Gemini+Claude)
│       │   ├── privacy_agent.py  # AES-256-GCM 암호화, PII 마스킹
│       │   ├── visual_agent.py   # 증명사진 추출 (OpenCV), 포트폴리오 캡처
│       │   ├── identity_checker.py # 다중 인물 감지
│       │   ├── validation_agent.py # 유효성 검증
│       │   ├── document_classifier.py # [Phase 1] 이력서 vs 비이력서 분류
│       │   ├── coverage_calculator.py # [Phase 1] 필드 완성도 점수 산출
│       │   └── gap_filler_agent.py    # [Phase 1] 빈 필드 타겟 재추출
│       ├── orchestrator/         # 파이프라인 오케스트레이션
│       │   ├── pipeline_orchestrator.py # 9단계 파이프라인 실행
│       │   ├── feature_flags.py  # Feature Flag 관리
│       │   └── validation_wrapper.py   # LLM 검증 래퍼
│       ├── context/              # 중앙 컨텍스트 허브
│       │   ├── pipeline_context.py     # 모든 에이전트 정보 공유
│       │   ├── layers.py         # 데이터 레이어 (RawInput, ParsedData 등)
│       │   ├── decision.py       # 제안-결정 패턴 (Proposal → Decision)
│       │   ├── evidence.py       # LLM 추론 근거 추적
│       │   ├── hallucination.py  # 환각 탐지
│       │   └── warnings.py       # 경고 수집
│       ├── services/             # 서비스 레이어
│       │   ├── llm_manager.py    # OpenAI/Gemini/Claude 통합 클라이언트
│       │   ├── embedding_service.py # 청킹 + 벡터 임베딩
│       │   ├── database_service.py  # Supabase 데이터 저장
│       │   ├── queue_service.py     # Redis Queue 관리
│       │   ├── storage_service.py   # 파일 스토리지
│       │   └── metrics_service.py   # 파이프라인 메트릭 수집
│       ├── utils/                # 파일 파서
│       │   ├── hwp_parser.py     # HWP 3단계 Fallback (olefile → LibreOffice → 한컴API)
│       │   ├── pdf_parser.py     # PDF 파싱 (pdfplumber)
│       │   ├── docx_parser.py    # DOCX 파싱 (python-docx)
│       │   └── ...               # 경력 계산, 날짜 파서, URL 추출 등
│       ├── schemas/              # Pydantic 스키마
│       │   └── phase1_types.py   # [Phase 1] 공통 타입 정의
│       ├── tasks.py              # RQ 태스크 정의
│       └── main.py               # FastAPI 엔트리포인트
├── components/                   # React 컴포넌트
│   ├── ui/                       # 범용 UI (shadcn 기반)
│   ├── layout/                   # 레이아웃 (Sidebar, Header)
│   ├── dashboard/                # 대시보드 전용 컴포넌트
│   ├── detail/                   # 후보자 상세 페이지
│   ├── review/                   # AI 검토 UI (CandidateReviewPanel)
│   ├── upload/                   # 업로드 컴포넌트
│   └── refund/                   # 환불 컴포넌트
├── lib/                          # 유틸리티 & 서비스
│   ├── supabase/                 # Supabase 클라이언트 (client/server/middleware)
│   ├── search/                   # 검색 관련 (동의어, 병렬쿼리, 타이포 보정)
│   ├── paddle/                   # Paddle 결제 (client, config)
│   ├── openai/                   # OpenAI 클라이언트
│   ├── cache/                    # 캐싱 유틸
│   ├── security/                 # 보안 유틸
│   ├── csrf.ts                   # CSRF 보호
│   ├── rate-limit.ts             # Rate Limiting
│   ├── file-validation.ts        # 파일 검증 (Magic Number, 크기, DRM)
│   └── logger.ts                 # 구조화된 로깅
├── hooks/                        # React 커스텀 훅
│   ├── useCandidates.ts          # 후보자 데이터 훅
│   ├── useCredits.ts             # 크레딧 상태 훅
│   └── useSearch.ts              # 검색 훅
├── types/                        # TypeScript 타입 정의
│   ├── auth.ts                   # 인증, 플랜, 동의 타입
│   ├── candidate.ts              # 후보자 타입
│   ├── position.ts               # 포지션 타입
│   └── index.ts                  # 공통 타입
├── supabase/
│   └── migrations/               # DB 마이그레이션 (SQL)
├── tests/                        # E2E 테스트 (Playwright)
├── docs/                         # 프로젝트 문서
├── middleware.ts                  # Next.js 미들웨어 (인증 + 동의 + CSRF)
├── openapi.yaml                  # OpenAPI 3.1 스펙
└── vercel.json                   # Vercel 배포 설정 (ICN 리전)
```

---

## 4. 핵심 아키텍처 패턴

### 4.1. 업로드 → AI 분석 파이프라인

### Multi-Agent Pipeline

| 구분 | 구성 | 비고 |
|------|------|------|
| Core (6개) | RouterAgent, IdentityChecker, AnalystAgent, ValidationAgent, PrivacyAgent, VisualAgent | 운영 중 |
| Phase 1 (3개) | DocumentClassifier, CoverageCalculator, GapFillerAgent | ✅ 구현 완료 (Feature Flag 비활성) |

**Phase 1 에이전트 (Feature Flag로 활성화)**:
- `DocumentClassifier`: 이력서 vs 비이력서 분류 (LLM 0-1회)
- `CoverageCalculator`: 필드 완성도 점수 산출 (LLM 0회)
- `GapFillerAgent`: 빈 필드 타겟 재추출 (LLM 0-2회)

**Unified Context Rule:** 모든 agent/orchestrator/sub-agent는 `document_type=resume`와 공통 `resume_id`를 공유해야 하며, field-level evidence를 함께 전달해야 한다.

```
사용자 업로드 → Next.js API (파일 검증 + S3 저장 + Job 생성)
  → Redis Queue → Python Worker 수신
    → RouterAgent (파일 타입, DRM, 페이지 수 검증)
    → Parser (HWP 3-Stage / PDF / DOCX)
    → [DocumentClassifier] (이력서 vs 비이력서, Feature Flag)
    → IdentityChecker (다중 인물 감지)
    → AnalystAgent (GPT-4o + Gemini Cross-Check)
    → ValidationAgent (유효성 검증)
    → [CoverageCalculator] (필드 완성도, Feature Flag)
    → [GapFillerAgent] (빈 필드 재추출, Feature Flag)
    → PrivacyAgent (PII 마스킹, AES-256-GCM 암호화)
    → EmbeddingService (청킹 + 벡터 생성)
    → VisualAgent (증명사진 추출, 포트폴리오 캡처)
    → DB 저장 → Webhook 알림 → 프론트엔드 업데이트
```

### 4.2. 하이브리드 검색

- **짧은 쿼리 (≤10자)**: PostgreSQL RDB 필터링 (스킬, 회사명, 경력 등)
- **긴 쿼리 (>10자)**: pgvector 시맨틱 검색 (text-embedding-3-small)
- **공통**: 스킬 동의어 확장, 병렬 쿼리, Rate Limiting (분당 30회)

### 4.3. 인증/인가 플로우

```
정적 페이지 → login/signup → consent (필수 동의: 서비스 이용약관 + 개인정보 + 제3자 정보 보증)
  → 대시보드 접근
```

- **middleware.ts**: 모든 보호 경로에서 인증 + 동의 완료 여부 이중 체크
- **Supabase RLS**: 테이블별 사용자 데이터 격리

### 4.4. 개인정보 보호

- **저장 시**: AES-256-GCM 암호화 (phone, email, address) + SHA-256 해시 (중복 감지용)
- **표시 시**: 마스킹된 버전만 UI 노출 (`010-****-5678`)
- **내보내기 시**: 블라인드 처리 (연락처 완전 제거) + IP 익명화

---

## 5. 개발 규칙 & 컨벤션

### 5.1. 프론트엔드

- **App Router 전용**: Pages Router 사용 금지
- **서버 컴포넌트 우선**: 클라이언트 컴포넌트는 `"use client"` 명시
- **shadcn/ui 컴포넌트**: `components/ui/` 디렉토리에 위치, Radix 기반
- **상태 관리**: 서버 상태는 TanStack React Query, 클라이언트 상태는 Zustand
- **스타일링**: Tailwind CSS 4 + `cn()` 유틸리티 (`lib/utils.ts`)
- **폰트**: Inter (본문), JetBrains Mono (코드)

### 5.2. API 규칙

- **응답 형식**: `{ success: boolean, data?: T, error?: { code: string, message: string } }`
- **인증**: Supabase SSR 쿠키 기반 (Bearer Token 아님)
- **CSRF**: 상태 변경 요청(POST/PUT/DELETE/PATCH)에 Origin/Referer 검증
- **Rate Limiting**: 엔드포인트별 차등 적용 (`lib/rate-limit.ts`)
- **에러 처리**: `lib/api-response.ts`의 표준 응답 헬퍼 사용

### 5.3. Worker (Python)

- **비동기 처리**: Redis RQ 기반 Job Queue
- **LLM 호출**: `services/llm_manager.py`를 통해 통합 관리 (프로바이더 추상화)
- **타임아웃**: LLM 호출 120초, HWP 파싱 60초
- **실패 처리**: 크레딧 자동 환불 (`tasks.py`)

### 5.4. 데이터베이스

- **마이그레이션**: `supabase/migrations/` 디렉토리에 순번 SQL 파일
- **RLS 필수**: 모든 사용자 데이터 테이블에 Row Level Security 적용
- **Enum 타입**: `candidate_status`, `analysis_mode`, `risk_level` 등 DB 레벨 정의
- **인덱스**: GIN (skills 배열), B-tree (해시, 상태), IVFFlat (벡터)

### 5.5. 보안

- **개인정보 암호화**: `ENCRYPTION_KEY` (32바이트 Base64), 키 로테이션 지원
- **파일 검증**: Magic Number 검증, DRM/암호화 파일 차단, 50페이지 제한
- **보안 헤더**: CSP, HSTS, X-Frame-Options 등 (`vercel.json`)
- **프롬프트 인젝션 방어**: System Prompt Hardening (`llm_manager.py`)

---

## 6. 주요 환경 변수

### 필수
```
NEXT_PUBLIC_SUPABASE_URL        # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase 공개 키
SUPABASE_SERVICE_ROLE_KEY       # Supabase 서비스 키 (서버 전용)
OPENAI_API_KEY                  # OpenAI API 키
REDIS_URL                       # Redis 연결 URL
ENCRYPTION_KEY                  # AES-256 암호화 키 (32바이트 Base64)
```

### 선택 (기능 활성화)
```
GEMINI_API_KEY                  # 2-Way Cross-Check 활성화
ANTHROPIC_API_KEY               # 3-Way Cross-Check 활성화 (Phase 2)
HANCOM_API_KEY                  # HWP 3차 Fallback
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN # Paddle 결제
PADDLE_API_KEY                  # Paddle 서버 API
SENTRY_DSN                      # 에러 모니터링
```

---

## 7. 로컬 개발

```bash
# 프론트엔드
pnpm install        # 의존성 설치
pnpm dev            # 개발 서버 (http://localhost:3000)

# Worker
cd apps/worker
pip install -r requirements.txt
python run_worker.py

# 테스트
pnpm test           # Vitest 단위 테스트
pnpm e2e            # Playwright E2E 테스트
```

---

## 8. 배포

| 서비스 | 플랫폼 | 트리거 |
|--------|--------|--------|
| Frontend | Vercel (ICN 리전) | `main` 브랜치 push |
| Worker | Railway | `main` 브랜치 push |
| DB | Supabase Cloud | 마이그레이션 수동 적용 |

---

## 9. 주요 문서 참조

| 문서 | 위치 | 설명 |
|------|------|------|
| PRD v0.3 | `docs/rai_prd_v0.3.md` | 공식 요구사항 명세서 (코드 검증 완료) |
| 개발 가이드 | `docs/rai_development_guide.md` | 상세 개발 가이드 |
| 로드맵 | `docs/PRODUCT_ROADMAP_FROM_INTERVIEW.md` | 인터뷰 기반 제품 로드맵 |
| Multi-Agent Pipeline | `docs/architecture/MULTI_AGENT_PIPELINE.md` | 멀티에이전트 파이프라인 아키텍처 |
| System Architecture | `docs/architecture/SYSTEM_ARCHITECTURE.md` | 전체 시스템 토폴로지 |
| Phase 1 요구사항 | `docs/architecture/PHASE1_DEVELOPMENT_REQUIREMENTS.md` | Phase 1 개발 요구사항 및 설계 |
| Phase 1 개발 계획 | `docs/plans/PHASE1_DEVELOPMENT_PLAN.md` | 스프린트/마일스톤/WBS/배포 전략 |
| 운영 백로그 | `docs/backlog/20260214.md` | TIER 0-4 우선순위별 작업 목록 |
| OpenAPI Spec | `openapi.yaml` | API 명세 |
| 배포 가이드 | `DEPLOYMENT.md` | 배포 절차 |

---

## 10. 알려진 이슈 & 주의사항

### 운영 이슈 (TIER 0-1)
1. **Paddle Webhook 미구현**: 결제 완료 후 구독 상태 동기화 불가
2. **이메일 알림 미구현**: 분석 완료/실패 시 사용자에게 알림 불가
3. **Sentry 미연동**: 장애 인지 및 모니터링 불가

### 기술 이슈
4. **가격 불일치**: `types/auth.ts`와 `lib/paddle/config.ts`의 플랜 가격이 다름 → 통일 필요
5. **PlanType 불일치**: `types/auth.ts`에는 `starter | pro`만 정의, PRD에는 `enterprise` 포함
6. **package.json 이름**: `temp_app`으로 되어 있음 → `srchd` 또는 `rai`로 변경 권장
7. **한컴 API**: 코드 구현 완료되었으나 API 키 미설정 상태 (환경변수 설정 시 자동 활성화)

### Phase 1 에이전트 (구현 완료, 오케스트레이터 통합 완료, Feature Flag 비활성)
> 아래 에이전트들은 **구현 및 PipelineOrchestrator 통합 완료**되었으며, Feature Flag로 활성화 가능

8. **DocumentClassifier**: 이력서 vs 비이력서 분류 (`USE_DOCUMENT_CLASSIFIER=true`)
   - 파이프라인 위치: Stage 2.5 (파싱 → **문서분류** → PII추출)
   - 비이력서 감지 시 거부 + 크레딧 미차감
9. **CoverageCalculator**: 필드 완성도 점수 + missing_reason 추적 (`USE_COVERAGE_CALCULATOR=true`)
   - 파이프라인 위치: Stage 6.5 (검증 → **커버리지계산** → 갭필링)
   - OrchestratorResult.coverage_score 출력
10. **GapFillerAgent**: 빈 필드 타겟 재추출 (최대 2회) (`USE_GAP_FILLER=true`)
    - 파이프라인 위치: Stage 6.6 (커버리지계산 → **갭필링** → 개인정보처리)
    - OrchestratorResult.gap_fill_count 출력

**추가 환경 변수**:
```
USE_DOCUMENT_CLASSIFIER=true        # DocumentClassifier 활성화
USE_COVERAGE_CALCULATOR=true        # CoverageCalculator 활성화
USE_GAP_FILLER=true                 # GapFillerAgent 활성화
GAP_FILLER_MAX_RETRIES=2            # GapFiller 재시도 횟수
GAP_FILLER_TIMEOUT=5                # GapFiller 타임아웃 (초)
COVERAGE_THRESHOLD=0.85             # 이 이상이면 GapFiller 스킵
```

**활성화 조건** (Beta 피드백 기반):
- 비이력서 업로드 >5% → DocumentClassifier 활성화
- 필드 누락 불만 10건+ → CoverageCalculator + GapFiller 활성화

상세 설계: `docs/architecture/PHASE1_DEVELOPMENT_REQUIREMENTS.md`
