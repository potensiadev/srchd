# RAI (Recruitment Asset Intelligence)

AI 기반 이력서 분석 및 인재 검색 플랫폼

## 주요 기능

- **AI 이력서 분석**: GPT-4o + Gemini Cross-Check로 정확한 정보 추출
- **다양한 파일 지원**: PDF, DOCX, DOC, HWP, HWPX
- **하이브리드 검색**: RDB 필터 + Vector 유사도 검색
- **개인정보 보호**: AES-256-GCM 암호화, 블라인드 내보내기
- **검토 UI**: AI 추출 결과 확인 및 인라인 편집

## 기술 스택

### Frontend
- Next.js 15 (App Router)
- React 19 + TypeScript
- Tailwind CSS + Shadcn/ui

### Backend
- Supabase (Auth + PostgreSQL + Storage)
- Redis + RQ (Job Queue)
- Python 3.11 Worker

### AI/ML
- OpenAI GPT-4o (Structured Outputs)
- Google Gemini 1.5 Pro
- OpenAI text-embedding-3-small

### 배포
- Vercel (Frontend)
- Railway (Worker)
- Supabase Cloud

## 시작하기

### 필수 요구사항
- Node.js 20+
- Python 3.11+
- Redis Server
- Supabase 프로젝트

### 설치

```bash
# 의존성 설치
pnpm install

# 환경변수 설정
cp .env.example .env.local

# 개발 서버 실행
pnpm dev
```

### Worker 실행

```bash
cd apps/worker

# 의존성 설치
pip install -r requirements.txt

# Worker 실행
python run_worker.py
```

## 프로젝트 구조

```
RAI/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── dashboard/         # 대시보드
│   └── candidates/        # 후보자 상세
├── apps/
│   └── worker/            # Python Worker
│       ├── agents/        # AI Agents
│       ├── utils/         # 파일 파서
│       └── services/      # LLM Manager
├── components/            # React 컴포넌트
├── lib/                   # 유틸리티
├── supabase/
│   └── migrations/        # DB 마이그레이션
└── docs/                  # 문서
```

## 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI API Keys
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# Redis
REDIS_URL=redis://localhost:6379

# Security
ENCRYPTION_KEY=  # 64자 hex
```

## 개발 현황

| 주차 | 목표 | 상태 |
|------|------|------|
| Week 1-2 | 기반 구축 + 업로드 | ✅ 완료 |
| Week 3-4 | 파싱 + AI 분석 | ✅ 완료 |
| Week 5-6 | 후처리 + 검토 UI | ✅ 완료 |
| Week 7 | 하이브리드 검색 | ✅ 완료 |
| Week 8 | 결제 + 배포 | ✅ 완료 |

### 배포 현황 (2025-01-02)

| 서비스 | 플랫폼 | URL |
|--------|--------|-----|
| Frontend | Vercel | Production 배포 완료 |
| Worker API | Railway | `raiprod.up.railway.app` |
| Database | Supabase | PostgreSQL + pgvector |

자세한 내용은 [개발 가이드](./docs/rai_development_guide.md)를 참조하세요.

## 라이선스

Private - All rights reserved
