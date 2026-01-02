# RAI v6.0 Deployment Guide

> **배포 완료**: 2025-01-02
> - Frontend: Vercel (Production)
> - Worker: Railway (`raiprod.up.railway.app`)
> - Database: Supabase Cloud

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vercel        │────▶│   Supabase      │◀────│   Railway       │
│   (Next.js)     │     │   (PostgreSQL)  │     │   (Python)      │
│   Frontend +    │     │   + pgvector    │     │   Worker API    │
│   API Routes    │     │   + Storage     │     │   + RQ Worker   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        └───────────── Redis (Upstash) ─────────────────┘
```

---

## 1. Supabase Setup

### 1.1 프로젝트 생성
1. https://supabase.com 에서 새 프로젝트 생성
2. Region: `Northeast Asia (Seoul)` 선택

### 1.2 Database Migration
```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref YOUR_PROJECT_REF

# 마이그레이션 실행
supabase db push
```

### 1.3 Storage Bucket 생성
- Bucket 이름: `resumes`
- Public: No (RLS로 제어)

### 1.4 필요한 키 확인
- `Settings > API`에서:
  - `URL`: SUPABASE_URL
  - `anon public`: NEXT_PUBLIC_SUPABASE_ANON_KEY
  - `service_role secret`: SUPABASE_SERVICE_ROLE_KEY

---

## 2. Upstash Redis Setup

### 2.1 Redis 생성
1. https://console.upstash.com 에서 Redis 생성
2. Region: `ap-northeast-1` (Tokyo) 선택

### 2.2 연결 정보
- `REDIS_URL`: `rediss://default:xxx@xxx.upstash.io:6379`

---

## 3. Railway Deployment (Python Worker)

### 3.1 Railway 프로젝트 생성
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성
railway init
```

### 3.2 GitHub 연결
1. Railway Dashboard에서 `New Project > Deploy from GitHub`
2. Repository 선택
3. Root Directory: `apps/worker` 설정

### 3.3 환경변수 설정
Railway Dashboard > Variables에서 설정:

```env
ENV=production
DEBUG=false
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
OPENAI_API_KEY=sk-xxx
GEMINI_API_KEY=AIzaSyxxx
ANTHROPIC_API_KEY=sk-ant-xxx
ENCRYPTION_KEY=xxx (64자 hex)
WEBHOOK_URL=https://your-app.vercel.app/api/webhooks/worker
WEBHOOK_SECRET=xxx
```

### 3.4 서비스 분리 (선택)
API 서버와 Worker를 분리하려면:

**Service 1: Web API**
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Service 2: Queue Worker**
- Start Command: `python run_worker.py`

---

## 4. Vercel Deployment (Next.js)

### 4.1 Vercel 프로젝트 생성
```bash
# Vercel CLI 설치
npm install -g vercel

# 로그인
vercel login

# 배포
vercel
```

### 4.2 GitHub 연결
1. https://vercel.com/new 에서 Repository 연결
2. Framework Preset: `Next.js` 자동 감지

### 4.3 환경변수 설정
Vercel Dashboard > Settings > Environment Variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
WORKER_URL=https://your-worker.up.railway.app
WEBHOOK_SECRET=xxx
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 4.4 도메인 설정
- Vercel Dashboard > Domains에서 커스텀 도메인 추가

---

## 5. Post-Deployment Checklist

### 5.1 Health Check
```bash
# Vercel (Next.js)
curl https://your-app.vercel.app/api/health

# Railway (Worker)
curl https://your-worker.up.railway.app/health
```

### 5.2 Queue Status
```bash
curl https://your-worker.up.railway.app/queue/status
```

### 5.3 Webhook 연결 테스트
```bash
curl -X POST https://your-app.vercel.app/api/webhooks/worker \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{"job_id": "test", "status": "completed"}'
```

---

## 6. Environment Variables Summary

### Vercel (Next.js)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Service Role Key |
| `WORKER_URL` | Yes | Railway Worker URL |
| `WEBHOOK_SECRET` | Yes | Worker 콜백 인증 |
| `NEXT_PUBLIC_APP_URL` | Yes | 앱 URL |

### Railway (Worker)
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service Role Key |
| `REDIS_URL` | Yes | Upstash Redis URL |
| `OPENAI_API_KEY` | Yes | OpenAI API Key |
| `GEMINI_API_KEY` | Yes | Google AI API Key |
| `ANTHROPIC_API_KEY` | No | Claude API Key (Phase 2) |
| `ENCRYPTION_KEY` | Yes | AES-256 Key (64자 hex) |
| `WEBHOOK_URL` | Yes | Vercel Webhook URL |
| `WEBHOOK_SECRET` | Yes | Webhook 인증 Secret |

---

## 7. Monitoring & Logs

### Vercel
- Dashboard > Deployments > Logs
- Vercel Analytics (선택)

### Railway
- Dashboard > Deployments > Logs
- `railway logs` CLI 명령어

### Upstash
- Console > Redis > Metrics

---

## 8. Troubleshooting

### Worker 연결 실패
1. Railway URL이 올바른지 확인
2. CORS 설정 확인
3. Health endpoint 테스트

### Queue 작업 안됨
1. Redis URL 확인 (SSL: `rediss://`)
2. Worker 프로세스 실행 확인
3. `railway logs` 로 에러 확인

### 파일 업로드 실패
1. Supabase Storage RLS 정책 확인
2. Service Role Key 권한 확인
3. 파일 크기 제한 확인 (50MB)
