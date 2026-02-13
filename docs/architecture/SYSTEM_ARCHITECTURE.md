# System Architecture

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0

## Table of Contents

1. [Overview](#1-overview)
2. [System Topology](#2-system-topology)
3. [Component Architecture](#3-component-architecture)
4. [Communication Patterns](#4-communication-patterns)
5. [Deployment Architecture](#5-deployment-architecture)
6. [Scalability Considerations](#6-scalability-considerations)

---

## 1. Overview

SRCHD is a **multi-tier, event-driven SaaS platform** designed to transform dormant resume files into a searchable, intelligent talent database. The architecture prioritizes:

- **Data Privacy**: Zero plaintext storage of sensitive PII
- **Accuracy**: Multi-LLM cross-validation for reliable extraction
- **Performance**: Sub-second search across thousands of candidates
- **Resilience**: Graceful degradation and automatic recovery

### Key Architectural Patterns

| Pattern | Implementation | Purpose |
|---------|----------------|---------|
| Event-Driven | Redis RQ + Webhooks | Decouple upload from processing |
| Multi-Agent | Specialized Python agents | Modular AI pipeline |
| CQRS-lite | Separate read/write optimizations | Search performance |
| Compensating Transaction | Rollback on failure | Data integrity |

---

## 2. System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Web Browser   │  │   Mobile PWA    │  │   Future Apps   │              │
│  │   (React SPA)   │  │   (Responsive)  │  │   (Native iOS/  │              │
│  │                 │  │                 │  │    Android)     │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼─────────────────────┼─────────────────────┼──────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ HTTPS (TLS 1.3)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE LAYER (Vercel)                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Vercel Edge Network (ICN)                        │   │
│  │  • CDN for static assets                                              │   │
│  │  • Edge Functions for middleware                                      │   │
│  │  • Automatic HTTPS/TLS termination                                    │   │
│  │  • DDoS protection                                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                 Next.js Application (Vercel)                        │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │     │
│  │  │   App Router │  │ API Routes   │  │  Middleware  │              │     │
│  │  │  (Frontend)  │  │  (Backend)   │  │  (Auth/CSRF) │              │     │
│  │  │              │  │              │  │              │              │     │
│  │  │ • Dashboard  │  │ • /upload    │  │ • Session    │              │     │
│  │  │ • Candidates │  │ • /search    │  │ • RLS Check  │              │     │
│  │  │ • Search     │  │ • /candidates│  │ • Rate Limit │              │     │
│  │  │ • Settings   │  │ • /webhooks  │  │ • Consent    │              │     │
│  │  └──────────────┘  └──────┬───────┘  └──────────────┘              │     │
│  └───────────────────────────┼────────────────────────────────────────┘     │
│                              │                                               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌──────────────────┐  ┌────────────────┐  ┌────────────────────┐
│   QUEUE LAYER    │  │  DATA LAYER    │  │   WORKER LAYER     │
│                  │  │                │  │                    │
│  ┌────────────┐  │  │ ┌────────────┐ │  │  ┌──────────────┐  │
│  │   Redis    │  │  │ │ Supabase   │ │  │  │Python Worker │  │
│  │  (Upstash) │◄─┼──┼─│ PostgreSQL │ │  │  │  (Railway)   │  │
│  │            │  │  │ │            │ │  │  │              │  │
│  │ • RQ Jobs  │  │  │ │ • Users    │ │  │  │ • FastAPI    │  │
│  │ • parse_q  │──┼──┼─│ • Cands    │◄┼──┼──│ • Agents     │  │
│  │ • fast_q   │  │  │ │ • Chunks   │ │  │  │ • Services   │  │
│  │ • slow_q   │  │  │ │ • Jobs     │ │  │  │ • Parsers    │  │
│  │ • DLQ      │  │  │ └────────────┘ │  │  └──────────────┘  │
│  └────────────┘  │  │                │  │                    │
│                  │  │ ┌────────────┐ │  │                    │
│                  │  │ │  Supabase  │ │  │                    │
│                  │  │ │  Storage   │◄┼──┼────────────────────│
│                  │  │ │            │ │  │                    │
│                  │  │ │ • Resumes  │ │  │                    │
│                  │  │ │ • Photos   │ │  │                    │
│                  │  │ └────────────┘ │  │                    │
└──────────────────┘  └────────────────┘  └────────────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   OpenAI     │  │   Gemini     │  │   Claude     │  │   Paddle     │     │
│  │   (GPT-4o)   │  │   (2.0 Flash)│  │   (3.5 Son)  │  │   (Payments) │     │
│  │              │  │              │  │              │  │              │     │
│  │ • Analysis   │  │ • Cross-     │  │ • Tertiary   │  │ • Subscrip-  │     │
│  │ • Embedding  │  │   Check      │  │   (Phase 2)  │  │   tions      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │   HanCom     │  │   Sentry     │  │   Vercel     │                       │
│  │   API        │  │   (Monitor)  │  │   Analytics  │                       │
│  │              │  │              │  │              │                       │
│  │ • HWP Parse  │  │ • Errors     │  │ • Usage      │                       │
│  │   (Fallback) │  │ • Traces     │  │ • Perf       │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Architecture

### 3.1 Frontend (Next.js App Router)

```
app/
├── (auth)/                    # Public authentication routes
│   ├── login/                 # OAuth + Email login
│   ├── signup/                # Registration flow
│   └── consent/               # 3-way consent (Terms, Privacy, Data Guarantee)
│
├── (dashboard)/               # Protected dashboard routes
│   ├── layout.tsx             # Sidebar + Header layout
│   ├── analytics/             # Usage statistics
│   ├── candidates/            # Candidate list + detail views
│   │   └── [id]/              # Individual candidate profile
│   ├── positions/             # Job position management
│   ├── projects/              # Folder/project organization
│   ├── review/                # AI analysis review queue
│   ├── settings/              # User preferences
│   └── upload/                # File upload interface
│
├── (marketing)/               # Public marketing pages
│   ├── page.tsx               # Landing page
│   ├── pricing/               # Subscription plans
│   ├── privacy/               # Privacy policy
│   └── terms/                 # Terms of service
│
└── api/                       # Backend API routes
    ├── auth/                  # Authentication endpoints
    ├── candidates/            # Candidate CRUD
    ├── search/                # Hybrid search
    ├── upload/                # File upload handler
    └── webhooks/              # Worker callbacks
```

### 3.2 API Layer (Next.js API Routes)

```
┌─────────────────────────────────────────────────────────────┐
│                      API ROUTE HANDLER                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Request   │  │  Middleware │  │   Handler   │          │
│  │   Parsing   │──│   Chain     │──│   Logic     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         │               │               │                    │
│         ▼               ▼               ▼                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Middleware Stack                     │    │
│  │  1. CSRF Validation (Origin/Referer)                │    │
│  │  2. Rate Limiting (IP + User + Global)              │    │
│  │  3. Authentication (Supabase SSR)                   │    │
│  │  4. Consent Verification (3-way check)              │    │
│  │  5. Request Validation (Zod schemas)                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Response Format:                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Success: { success: true, data: T }                 │    │
│  │ Error:   { success: false, error: { code, msg } }   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Worker Layer (Python FastAPI)

```
apps/worker/
├── main.py                    # FastAPI entrypoint + health checks
├── tasks.py                   # RQ task definitions
├── config.py                  # Settings management
├── exceptions.py              # Custom exception hierarchy
│
├── agents/                    # Multi-Agent Pipeline
│   ├── router_agent.py        # File type detection + validation
│   ├── analyst_agent.py       # LLM-based resume analysis
│   ├── privacy_agent.py       # PII masking + encryption
│   ├── validation_agent.py    # Post-analysis verification
│   ├── identity_checker.py    # Multi-identity detection
│   └── visual_agent.py        # Portfolio screenshot capture
│
├── orchestrator/              # Pipeline coordination
│   └── pipeline_orchestrator.py
│
├── services/                  # Infrastructure services
│   ├── llm_manager.py         # Multi-provider LLM client
│   ├── embedding_service.py   # Vector generation
│   ├── database_service.py    # Supabase operations
│   ├── queue_service.py       # Redis RQ management
│   └── storage_service.py     # File storage operations
│
├── utils/                     # File parsers + utilities
│   ├── hwp_parser.py          # HWP 3-stage fallback
│   ├── pdf_parser.py          # PDF extraction
│   ├── docx_parser.py         # DOCX extraction
│   └── ...                    # Date parsing, URL extraction, etc.
│
└── schemas/                   # Pydantic models
    └── ...
```

---

## 4. Communication Patterns

### 4.1 Synchronous (HTTP/JSON)

```
Client ──HTTP/JSON──► API Route ──Supabase Client──► Database
                              │
                              └──HTTP/JSON──► Worker (health check only)
```

### 4.2 Asynchronous (Event-Driven)

```
Upload Request
      │
      ▼
┌──────────────┐
│  API Route   │
│  /upload     │
└──────┬───────┘
       │ 1. Validate file
       │ 2. Upload to Storage
       │ 3. Create job record
       │ 4. Enqueue to Redis
       ▼
┌──────────────┐
│    Redis     │
│   RQ Queue   │
└──────┬───────┘
       │ (polling, 5s interval)
       ▼
┌──────────────┐
│   Worker     │
│  (Railway)   │
└──────┬───────┘
       │ 1. Download file
       │ 2. Run agent pipeline
       │ 3. Save to database
       │ 4. Send webhook
       ▼
┌──────────────┐
│  API Route   │
│  /webhooks   │
└──────┬───────┘
       │ Update job status
       ▼
┌──────────────┐
│  Frontend    │
│  (polling)   │
└──────────────┘
```

### 4.3 Webhook Payload Structure

```json
{
  "event": "job.completed",
  "job_id": "uuid",
  "candidate_id": "uuid",
  "status": "completed",
  "metadata": {
    "confidence_score": 0.92,
    "chunk_count": 12,
    "pii_count": 3,
    "processing_time_ms": 8500
  },
  "timestamp": "2026-02-14T10:30:00Z"
}
```

---

## 5. Deployment Architecture

### 5.1 Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    ASIA PACIFIC (Seoul)                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    VERCEL (ICN)                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ Edge CDN    │  │ Serverless  │  │ Edge        │  │    │
│  │  │ (Static)    │  │ Functions   │  │ Middleware  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   RAILWAY (ICN)                      │    │
│  │  ┌─────────────┐  ┌─────────────┐                   │    │
│  │  │ Worker Pod  │  │ Worker Pod  │  (Manual scaling) │    │
│  │  │ (Primary)   │  │ (Replica)   │                   │    │
│  │  └─────────────┘  └─────────────┘                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   SUPABASE (ICN)                     │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ PostgreSQL  │  │  pgvector   │  │  Storage    │  │    │
│  │  │ (Primary)   │  │ (Extension) │  │  (S3-like)  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   UPSTASH (ICN)                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │              Managed Redis                   │    │    │
│  │  │  • RQ Queues  • Cache  • Rate Limiting      │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Deployment Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GitHub     │     │   CI/CD      │     │  Production  │
│   (main)     │────►│   Pipeline   │────►│  Environment │
└──────────────┘     └──────────────┘     └──────────────┘

Triggers:
• Push to main → Auto-deploy Frontend + API
• Push to main → Auto-deploy Worker
• Manual → Database migrations (Supabase CLI)

Environments:
• Production: main branch
• Staging: staging branch (future)
• Development: Local + .env.local
```

### 5.3 Environment Variables

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend/API | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Yes | Public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | API/Worker | Yes | Admin key (bypasses RLS) |
| `OPENAI_API_KEY` | Worker | Yes | GPT-4o access |
| `GEMINI_API_KEY` | Worker | Optional | Cross-check capability |
| `ANTHROPIC_API_KEY` | Worker | Optional | Claude fallback (Phase 2) |
| `REDIS_URL` | API/Worker | Yes | Upstash Redis connection |
| `ENCRYPTION_KEY` | API/Worker | Yes | AES-256 key (Base64) |
| `WORKER_URL` | API | Yes | Worker health check URL |
| `WEBHOOK_SECRET` | API/Worker | Yes | Webhook authentication |

---

## 6. Scalability Considerations

### 6.1 Current Capacity

| Component | Current Limit | Bottleneck |
|-----------|---------------|------------|
| Frontend | ~10K req/min | Vercel auto-scales |
| API Routes | ~1K concurrent | Serverless cold starts |
| Worker | ~100 jobs/min | Single pod, LLM rate limits |
| Database | ~500 connections | Supabase connection pool |
| Vector Search | ~10K candidates | pgvector index size |

### 6.2 Scaling Strategy

**Phase 1 (Current - 1K users)**:
- Single worker pod
- Supabase free/pro tier
- Manual monitoring

**Phase 2 (1K-10K users)**:
- Worker pod replication (2-4 instances)
- Supabase team tier
- Dedicated queue monitoring

**Phase 3 (10K+ users)**:
- Kubernetes deployment for workers
- Supabase enterprise tier
- Read replicas for search
- Dedicated vector database (Pinecone/Weaviate)

### 6.3 Performance Optimizations

```
Current Optimizations:
├── RDB pre-filtering before vector search
├── Parallel LLM calls (OpenAI + Gemini)
├── Connection pooling (Supabase)
├── Redis caching (search results, 1hr TTL)
├── Semantic chunking (2000 tokens, 500 overlap)
└── Batch inserts (candidate_chunks)

Planned Optimizations:
├── Edge caching for static candidate data
├── Incremental embedding updates
├── Query result pre-computation
└── Read replicas for analytics
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Initial architecture documentation |
