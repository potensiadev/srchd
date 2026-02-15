# Data Architecture

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema](#2-database-schema)
3. [Data Flows](#3-data-flows)
4. [Encryption Strategy](#4-encryption-strategy)
5. [Vector Search Architecture](#5-vector-search-architecture)
6. [Row-Level Security](#6-row-level-security)
7. [Data Lifecycle](#7-data-lifecycle)

---

## 1. Overview

SRCHD's data architecture is designed around three core principles:

1. **Privacy by Design**: All PII is encrypted at rest using AES-256-GCM
2. **Search Performance**: Hybrid search combining RDB filtering and vector similarity
3. **Data Integrity**: Version stacking, duplicate detection, and audit trails

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary Database | PostgreSQL 15 | Transactional data storage |
| Vector Extension | pgvector | Semantic similarity search |
| Encryption | pgcrypto + App-level | PII protection |
| File Storage | Supabase Storage | Resume files, photos |
| Cache | Redis (Upstash) | Search results, rate limiting |

---

## 2. Database Schema

### 2.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SRCHD DATABASE SCHEMA                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     users       │       │  user_consents  │       │  subscriptions  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, FK)     │───┐   │ id (PK)         │       │ id (PK)         │
│ email           │   │   │ user_id (FK)────│───────│ user_id (FK)────│──┐
│ name            │   │   │ terms_of_service│       │ plan_type       │  │
│ avatar_url      │   │   │ privacy_policy  │       │ status          │  │
│ plan            │   │   │ third_party_data│       │ paddle_sub_id   │  │
│ credits         │   │   │ marketing       │       │ current_period  │  │
│ credits_used    │   │   │ ip_address      │       │ created_at      │  │
│ credits_reserved│   │   │ user_agent      │       └─────────────────┘  │
│ consents_done   │   │   │ created_at      │                            │
│ created_at      │   │   └─────────────────┘                            │
└─────────────────┘   │                                                  │
         │            │   ┌─────────────────┐                            │
         │            │   │  credit_ledger  │                            │
         │            │   ├─────────────────┤                            │
         │            └───│ user_id (FK)────│────────────────────────────┘
         │                │ amount          │
         │                │ type            │
         │                │ reference_id    │
         │                │ created_at      │
         │                └─────────────────┘
         │
         │  1:N
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   candidates    │       │candidate_chunks │       │ processing_jobs │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │───┐   │ id (PK)         │       │ id (PK)         │
│ user_id (FK)    │   │   │ candidate_id(FK)│───────│ user_id (FK)    │
│                 │   │   │ chunk_type      │       │ candidate_id(FK)│──┐
│ -- BASIC INFO --│   │   │ chunk_index     │       │ status          │  │
│ name            │   │   │ content         │       │ file_path       │  │
│ birth_year      │   │   │ metadata (JSONB)│       │ file_name       │  │
│ gender          │   │   │ embedding (vec) │       │ file_type       │  │
│                 │   │   │ created_at      │       │ confidence      │  │
│ -- ENCRYPTED -- │   │   └─────────────────┘       │ error_code      │  │
│ phone_encrypted │   │                             │ error_message   │  │
│ email_encrypted │   │                             │ rq_job_id       │  │
│ address_encrypt │   │                             │ progress        │  │
│                 │   │                             │ created_at      │  │
│ -- HASHES --    │   │                             │ completed_at    │  │
│ phone_hash      │   │                             └─────────────────┘  │
│ email_hash      │   │                                                  │
│                 │   │   ┌─────────────────┐                            │
│ -- MASKED --    │   │   │  saved_searches │                            │
│ phone_masked    │   │   ├─────────────────┤                            │
│ email_masked    │   └───│ user_id (FK)    │                            │
│ address_masked  │       │ query           │                            │
│                 │       │ filters (JSONB) │                            │
│ -- SEARCHABLE --│       │ created_at      │                            │
│ skills (TEXT[]) │       └─────────────────┘                            │
│ exp_years       │                                                      │
│ last_company    │       ┌─────────────────┐                            │
│ last_position   │       │ skill_synonyms  │                            │
│ education_level │       ├─────────────────┤                            │
│ location_city   │       │ user_id (FK)    │                            │
│                 │       │ base_skill      │                            │
│ -- AI GENERATED │       │ synonyms (TEXT[])                            │
│ summary         │       │ created_at      │                            │
│ strengths(TEXT[])       └─────────────────┘                            │
│ careers (JSONB) │                                                      │
│ projects (JSONB)│       ┌─────────────────┐                            │
│ education(JSONB)│       │   positions     │                            │
│                 │       ├─────────────────┤                            │
│ -- VISUAL --    │       │ id (PK)         │                            │
│ photo_url       │       │ user_id (FK)────│────────────────────────────┘
│ portfolio_url   │       │ title           │
│ portfolio_thumb │       │ company         │
│ github_url      │       │ description     │
│ linkedin_url    │       │ requirements    │
│                 │       │ skills_required │
│ -- VERSION --   │       │ status          │
│ version         │       │ created_at      │
│ parent_id (FK)──│───┐   └─────────────────┘
│ is_latest       │   │
│                 │   │   ┌─────────────────┐
│ -- QUALITY --   │   │   │    projects     │
│ confidence_score│   │   ├─────────────────┤
│ risk_level      │   │   │ id (PK)         │
│ requires_review │   └───│ user_id (FK)    │
│                 │       │ name            │
│ -- META --      │       │ description     │
│ status          │       │ candidate_ids[] │
│ analysis_mode   │       │ created_at      │
│ created_at      │       └─────────────────┘
│ updated_at      │
└─────────────────┘
```

### 2.2 Core Tables

#### `users`

Primary user account table, linked to Supabase Auth.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,

  -- Subscription
  plan plan_type DEFAULT 'free',
  credits INTEGER DEFAULT 0,
  credits_used_this_month INTEGER DEFAULT 0,
  credits_reserved INTEGER DEFAULT 0,
  credits_reset_at TIMESTAMPTZ,

  -- Consent tracking
  consents_completed BOOLEAN DEFAULT FALSE,
  consents_completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);
```

#### `candidates`

Core resume data with encryption and search optimization.

```sql
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic Info (plaintext, searchable)
  name TEXT NOT NULL,
  birth_year INTEGER,
  gender TEXT,

  -- Encrypted PII (BYTEA, not searchable)
  phone_encrypted BYTEA,
  email_encrypted BYTEA,
  address_encrypted BYTEA,

  -- Hashes (for deduplication, indexed)
  phone_hash TEXT,
  email_hash TEXT,

  -- Masked Display (for UI, readable)
  phone_masked TEXT,
  email_masked TEXT,
  address_masked TEXT,

  -- Searchable Fields (denormalized for performance)
  skills TEXT[] DEFAULT '{}',
  exp_years INTEGER,
  last_company TEXT,
  last_position TEXT,
  education_level TEXT,
  education_school TEXT,
  education_major TEXT,
  location_city TEXT,

  -- AI-Generated Content
  summary TEXT,
  strengths TEXT[] DEFAULT '{}',
  careers JSONB DEFAULT '[]',
  projects JSONB DEFAULT '[]',
  education JSONB DEFAULT '[]',

  -- Visual Assets
  photo_url TEXT,
  portfolio_url TEXT,
  portfolio_thumbnail_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,

  -- Version Control
  version INTEGER DEFAULT 1,
  parent_id UUID REFERENCES candidates(id),
  is_latest BOOLEAN DEFAULT TRUE,

  -- Quality Metrics
  confidence_score DECIMAL(3,2),
  risk_level risk_level DEFAULT 'low',
  requires_review BOOLEAN DEFAULT FALSE,

  -- Status & Meta
  status candidate_status DEFAULT 'processing',
  analysis_mode analysis_mode DEFAULT 'phase_1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_confidence CHECK (confidence_score BETWEEN 0 AND 1)
);

-- Indexes
CREATE INDEX idx_candidates_user_latest ON candidates(user_id, is_latest, created_at DESC);
CREATE INDEX idx_candidates_phone_hash ON candidates(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX idx_candidates_email_hash ON candidates(email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX idx_candidates_skills ON candidates USING GIN(skills);
CREATE INDEX idx_candidates_search ON candidates(user_id, exp_years, location_city, status);
```

#### `candidate_chunks`

Vector embeddings for semantic search.

```sql
CREATE TABLE candidate_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  chunk_type chunk_type NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_chunk UNIQUE (candidate_id, chunk_type, chunk_index)
);

-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX idx_chunks_embedding ON candidate_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- B-tree for filtering
CREATE INDEX idx_chunks_candidate ON candidate_chunks(candidate_id, chunk_type);
```

### 2.3 Enum Types

```sql
-- Plan types
CREATE TYPE plan_type AS ENUM ('free', 'starter', 'pro', 'enterprise');

-- Candidate processing status
CREATE TYPE candidate_status AS ENUM (
  'processing',   -- Initial upload, waiting for worker
  'analyzing',    -- Worker is running AI analysis
  'analyzed',     -- AI analysis complete, awaiting user review
  'completed',    -- User has reviewed and confirmed
  'failed',       -- Processing failed
  'deleted'       -- Soft deleted
);

-- Analysis mode
CREATE TYPE analysis_mode AS ENUM (
  'phase_1',      -- Single LLM (GPT-4o only)
  'phase_2'       -- Cross-check (GPT-4o + Gemini)
);

-- Risk level
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');

-- Chunk types for embeddings
CREATE TYPE chunk_type AS ENUM (
  'summary',      -- AI-generated summary
  'career',       -- Work experience
  'project',      -- Project descriptions
  'skill',        -- Skills section
  'education',    -- Education background
  'raw_full',     -- Full document text
  'raw_section'   -- Document sections
);

-- Processing job status
CREATE TYPE processing_status AS ENUM (
  'queued',       -- In Redis queue
  'processing',   -- Worker picked up
  'parsing',      -- File parsing in progress
  'analyzing',    -- AI analysis in progress
  'completed',    -- Successfully processed
  'failed',       -- Permanent failure
  'dlq'           -- In dead letter queue
);
```

---

## 3. Data Flows

### 3.1 Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UPLOAD DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

User uploads file (browser)
         │
         ▼
┌─────────────────┐
│  POST /upload   │  API validates request
│                 │
│  Validations:   │
│  • Auth check   │
│  • Credit check │
│  • File type    │
│  • File size    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATOMIC TRANSACTION                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ 1. Reserve      │  │ 2. Create       │  │ 3. Create job   │             │
│  │    Credit       │  │    Candidate    │  │    Record       │             │
│  │                 │  │                 │  │                 │             │
│  │ UPDATE users    │  │ INSERT INTO     │  │ INSERT INTO     │             │
│  │ SET credits_    │  │ candidates (    │  │ processing_jobs │             │
│  │ reserved += 1   │  │   status =      │  │ (status =       │             │
│  │ WHERE credits   │  │   'processing') │  │   'queued')     │             │
│  │ - reserved > 0  │  │                 │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┴────────────────────┘                       │
│                                │                                            │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FILE STORAGE                                          │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                   │
│  │ 4. Upload to    │  │ 5. Enqueue to   │                                   │
│  │    Supabase     │  │    Redis RQ     │                                   │
│  │    Storage      │  │                 │                                   │
│  │                 │  │ Queue:          │                                   │
│  │ Path:           │  │ • fast_queue    │                                   │
│  │ /resumes/{uid}/ │  │   (PDF, DOCX)   │                                   │
│  │ {job_id}/       │  │ • slow_queue    │                                   │
│  │ {filename}      │  │   (HWP, HWPX)   │                                   │
│  └─────────────────┘  └─────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                      Response: { jobId, candidateId }
```

### 3.2 Processing Flow (Worker)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WORKER PROCESSING FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

Redis Queue → Worker polls job
         │
         ▼
┌─────────────────┐
│ 1. Download     │  Fetch file from Supabase Storage
│    File         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Parse Text   │  Extract text content
│                 │  (HWP/PDF/DOCX parsers)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. AI Analysis  │  Call LLMs (OpenAI + Gemini)
│                 │  Extract structured data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Privacy      │  Encrypt PII, generate hashes
│    Processing   │  Create masked display values
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Duplicate    │  4-tier waterfall check
│    Detection    │  Link to existing if found
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE WRITES                                       │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ 6. Update       │  │ 7. Insert       │  │ 8. Update Job   │             │
│  │    Candidate    │  │    Chunks +     │  │    Status       │             │
│  │                 │  │    Embeddings   │  │                 │             │
│  │ SET             │  │                 │  │ SET status =    │             │
│  │  name, skills,  │  │ INSERT INTO     │  │ 'completed',    │             │
│  │  encrypted_*,   │  │ candidate_chunks│  │ confidence_score│             │
│  │  confidence...  │  │ (bulk insert)   │  │ = 0.92          │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ 9. Webhook      │  POST /api/webhooks/worker
│    Notification │  { event: 'job.completed', ... }
└─────────────────┘
```

### 3.3 Search Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEARCH DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

User submits search query
         │
         ▼
┌─────────────────┐
│ POST /search    │
│                 │
│ Body:           │
│ { query,        │
│   filters,      │
│   page, limit } │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CACHE CHECK                                           │
│                                                                              │
│  Key: search:{user_id}:{hash(query+filters)}                                │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │ Redis Lookup    │                                                        │
│  │                 │                                                        │
│  │ Cache HIT ──────│──► Return cached results (SWR: background refresh)    │
│  │ Cache MISS ─────│──► Continue to search                                  │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    QUERY TYPE DETECTION                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │   query.length <= 10        query.length > 10                       │   │
│  │        │                           │                                 │   │
│  │        ▼                           ▼                                 │   │
│  │   RDB-ONLY SEARCH            HYBRID SEARCH                          │   │
│  │   (keyword filter)           (RDB + Vector)                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ (Hybrid Search Path)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: SKILL SYNONYM EXPANSION                           │
│                                                                              │
│  Query: "React 개발자"                                                       │
│                                                                              │
│  SELECT synonyms FROM skill_synonyms                                        │
│  WHERE base_skill ILIKE '%React%'                                           │
│  OR 'React' = ANY(synonyms)                                                 │
│                                                                              │
│  Result: ['React', 'ReactJS', 'React.js', 'React Native']                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 2: RDB PRE-FILTERING                                 │
│                                                                              │
│  SELECT id FROM candidates                                                  │
│  WHERE user_id = $1                                                         │
│    AND is_latest = TRUE                                                     │
│    AND status = 'completed'                                                 │
│    AND exp_years BETWEEN $2 AND $3                          -- Filter      │
│    AND location_city ILIKE $4                               -- Filter      │
│    AND skills && $5::text[]                                 -- Synonym exp │
│  LIMIT 1000                                                                 │
│                                                                              │
│  Result: [uuid1, uuid2, uuid3, ... uuid847]  (pre-filtered set)            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: GENERATE QUERY EMBEDDING                          │
│                                                                              │
│  OpenAI API call:                                                           │
│  model: text-embedding-3-small                                              │
│  input: "React 개발자 5년 경력 스타트업"                                       │
│                                                                              │
│  Result: [0.0123, -0.0456, ..., 0.0789]  (1536 dimensions)                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: VECTOR SIMILARITY SEARCH                          │
│                                                                              │
│  SELECT                                                                     │
│    c.id,                                                                    │
│    c.name,                                                                  │
│    c.skills,                                                                │
│    1 - (ch.embedding <=> $query_embedding) AS similarity                   │
│  FROM candidates c                                                          │
│  JOIN candidate_chunks ch ON ch.candidate_id = c.id                        │
│  WHERE c.id = ANY($pre_filtered_ids)                                       │
│    AND ch.chunk_type IN ('summary', 'career', 'skill')                     │
│  ORDER BY ch.embedding <=> $query_embedding                                 │
│  LIMIT $page_size                                                           │
│  OFFSET $page_offset                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 5: FACET CALCULATION                                 │
│                                                                              │
│  -- Experience distribution                                                 │
│  SELECT                                                                     │
│    CASE                                                                     │
│      WHEN exp_years < 3 THEN 'junior'                                      │
│      WHEN exp_years < 7 THEN 'mid'                                         │
│      ELSE 'senior'                                                          │
│    END as level,                                                            │
│    COUNT(*) as count                                                        │
│  FROM candidates WHERE id = ANY($result_ids)                               │
│  GROUP BY level                                                             │
│                                                                              │
│  -- Top skills                                                              │
│  SELECT UNNEST(skills) as skill, COUNT(*) as count                         │
│  FROM candidates WHERE id = ANY($result_ids)                               │
│  GROUP BY skill ORDER BY count DESC LIMIT 10                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 6: CACHE & RETURN                                    │
│                                                                              │
│  Redis SET:                                                                 │
│    Key: search:{user_id}:{hash}                                            │
│    Value: JSON results                                                      │
│    TTL: 3600 seconds (1 hour)                                              │
│                                                                              │
│  Response:                                                                  │
│  {                                                                          │
│    success: true,                                                           │
│    data: {                                                                  │
│      candidates: [...],                                                     │
│      facets: { experience: {...}, skills: {...} },                         │
│      pagination: { total, page, hasMore }                                  │
│    }                                                                        │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Encryption Strategy

### 4.1 Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENCRYPTION LAYERS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │       Application Layer          │
                    │                                  │
                    │  ┌───────────────────────────┐  │
                    │  │     AES-256-GCM           │  │
                    │  │     (privacy_agent.py)    │  │
                    │  │                           │  │
                    │  │  Fields:                  │  │
                    │  │  • phone_encrypted        │  │
                    │  │  • email_encrypted        │  │
                    │  │  • address_encrypted      │  │
                    │  └───────────────────────────┘  │
                    │                                  │
                    │  Key: ENCRYPTION_KEY (env var)  │
                    │  Versioning: Supports rotation  │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │       Database Layer             │
                    │                                  │
                    │  ┌───────────────────────────┐  │
                    │  │     Supabase TDE          │  │
                    │  │     (Transparent Data     │  │
                    │  │      Encryption)          │  │
                    │  │                           │  │
                    │  │  All data encrypted at   │  │
                    │  │  rest by default         │  │
                    │  └───────────────────────────┘  │
                    │                                  │
                    │  Managed by: Supabase Cloud     │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │       Storage Layer              │
                    │                                  │
                    │  ┌───────────────────────────┐  │
                    │  │     S3 SSE               │  │
                    │  │     (Server-Side         │  │
                    │  │      Encryption)         │  │
                    │  │                           │  │
                    │  │  Resume files encrypted  │  │
                    │  │  at rest in buckets      │  │
                    │  └───────────────────────────┘  │
                    │                                  │
                    │  Managed by: Supabase Storage   │
                    └─────────────────────────────────┘
```

### 4.2 AES-256-GCM Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENCRYPTION PROCESS                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Plaintext: "010-1234-5678"
            │
            ▼
┌───────────────────────────────────────┐
│  1. Generate Random Components        │
│                                       │
│  Nonce: 12 bytes (random)            │
│  Salt:  16 bytes (random)            │
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  2. Derive Encryption Key             │
│                                       │
│  PBKDF2(                             │
│    password = ENCRYPTION_KEY,        │
│    salt = random_salt,               │
│    iterations = 100000,              │
│    dkLen = 32                        │
│  )                                   │
│                                       │
│  Result: 256-bit derived key         │
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  3. Encrypt with AES-GCM              │
│                                       │
│  AES_GCM_ENCRYPT(                    │
│    key = derived_key,                │
│    nonce = random_nonce,             │
│    plaintext = "010-1234-5678",      │
│    aad = None                        │
│  )                                   │
│                                       │
│  Result:                             │
│  • ciphertext (N bytes)              │
│  • auth_tag (16 bytes)               │
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  4. Assemble Final Blob               │
│                                       │
│  ┌────────┬────────┬────────┬───────┐│
│  │ HEADER │VERSION │  SALT  │ NONCE ││
│  │ 4 bytes│ 1 byte │16 bytes│12 byte││
│  └────────┴────────┴────────┴───────┘│
│  ┌─────────────────┬────────────────┐│
│  │   CIPHERTEXT    │   AUTH TAG     ││
│  │   N bytes       │   16 bytes     ││
│  └─────────────────┴────────────────┘│
│                                       │
│  Total: 4 + 1 + 16 + 12 + N + 16    │
└───────────────────────────────────────┘

Stored in: candidates.phone_encrypted (BYTEA)
```

### 4.3 Key Rotation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KEY ROTATION STRATEGY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Current State:
┌───────────────────────────────────────┐
│  KEY_VERSIONS = {                    │
│    0: "original_key_base64",         │  ← Old key
│    1: "rotated_key_base64"           │  ← Current key
│  }                                   │
└───────────────────────────────────────┘

Old encrypted data:
┌────────┬───┬────────┬───────┬─────────────┬────────┐
│ HEADER │ 0 │  SALT  │ NONCE │ CIPHERTEXT  │  TAG   │
│        │ ↑ │        │       │             │        │
│        │ │ │        │       │             │        │
│        │ └─ Version byte = 0              │        │
└────────┴───┴────────┴───────┴─────────────┴────────┘
                    │
                    ▼
            Decrypt with KEY_VERSIONS[0]

New encrypted data:
┌────────┬───┬────────┬───────┬─────────────┬────────┐
│ HEADER │ 1 │  SALT  │ NONCE │ CIPHERTEXT  │  TAG   │
│        │ ↑ │        │       │             │        │
│        │ │ │        │       │             │        │
│        │ └─ Version byte = 1              │        │
└────────┴───┴────────┴───────┴─────────────┴────────┘
                    │
                    ▼
            Decrypt with KEY_VERSIONS[1]

Rotation Process:
1. Add new key to KEY_VERSIONS with incremented version
2. New encryptions use latest version
3. Decryption reads version byte, uses appropriate key
4. Optional: Background job to re-encrypt old data
```

### 4.4 Hashing for Deduplication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HASH GENERATION                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Phone Hashing:
┌───────────────────────────────────────┐
│  Input: "010-1234-5678"              │
│                                       │
│  1. Normalize: "01012345678"         │
│     (remove hyphens, spaces)         │
│                                       │
│  2. Hash: SHA256("01012345678")      │
│                                       │
│  3. Output: "a3f2b8c9d4e5..."       │
│     (64 hex characters)              │
│                                       │
│  Stored in: candidates.phone_hash    │
│  Indexed: B-tree for O(1) lookup     │
└───────────────────────────────────────┘

Email Hashing:
┌───────────────────────────────────────┐
│  Input: "User@Example.COM"           │
│                                       │
│  1. Normalize: "user@example.com"    │
│     (lowercase)                       │
│                                       │
│  2. Hash: SHA256("user@example.com") │
│                                       │
│  3. Output: "b4c3d2e1f0a9..."       │
│                                       │
│  Stored in: candidates.email_hash    │
└───────────────────────────────────────┘
```

---

## 5. Vector Search Architecture

### 5.1 Embedding Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMBEDDING GENERATION                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Resume Text (analyzed data)
         │
         ▼
┌───────────────────────────────────────┐
│  1. Semantic Chunking                 │
│                                       │
│  Parameters:                          │
│  • Chunk size: 2000 tokens           │
│  • Overlap: 500 tokens               │
│  • Min chunk: 100 tokens             │
│                                       │
│  Korean-optimized tokenization       │
│  (tiktoken with cl100k_base)         │
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  2. Chunk Type Assignment             │
│                                       │
│  ┌─────────────┬───────────────────┐ │
│  │ Chunk Type  │ Content           │ │
│  ├─────────────┼───────────────────┤ │
│  │ summary     │ AI summary        │ │
│  │ career      │ Work experience   │ │
│  │ project     │ Project details   │ │
│  │ skill       │ Skills list       │ │
│  │ education   │ Education info    │ │
│  │ raw_full    │ Full document     │ │
│  │ raw_section │ Document parts    │ │
│  └─────────────┴───────────────────┘ │
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  3. Embedding Generation              │
│                                       │
│  Model: text-embedding-3-small       │
│  Dimensions: 1536                    │
│  Cost: ~$0.02 / 1M tokens            │
│                                       │
│  For each chunk:                     │
│  embedding = openai.embed(chunk.text)│
└────────────────┬──────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────┐
│  4. Batch Insert to Database          │
│                                       │
│  INSERT INTO candidate_chunks (       │
│    candidate_id,                     │
│    chunk_type,                       │
│    chunk_index,                      │
│    content,                          │
│    embedding                         │
│  ) VALUES (...)                      │
│                                       │
│  Typical: 8-15 chunks per candidate  │
└───────────────────────────────────────┘
```

### 5.2 Vector Index Configuration

```sql
-- IVFFlat index for approximate nearest neighbor
CREATE INDEX idx_chunks_embedding ON candidate_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index tuning notes:
-- lists = sqrt(n) where n = expected rows
-- For 10K candidates × 10 chunks = 100K rows
-- sqrt(100000) ≈ 316, but 100 is sufficient for speed

-- Query-time configuration
SET ivfflat.probes = 10;  -- Check 10 of 100 lists
-- Higher probes = more accurate, slower
-- Typical: probes = lists / 10
```

### 5.3 Similarity Search Query

```sql
-- Find similar candidates to query embedding
SELECT
  c.id,
  c.name,
  c.skills,
  c.last_company,
  c.exp_years,
  c.phone_masked,
  c.confidence_score,
  1 - (ch.embedding <=> $1) AS similarity
FROM candidates c
JOIN candidate_chunks ch ON ch.candidate_id = c.id
WHERE c.user_id = $2
  AND c.is_latest = TRUE
  AND c.status = 'completed'
  AND ch.chunk_type IN ('summary', 'career', 'skill')
ORDER BY ch.embedding <=> $1
LIMIT 20;

-- Operators:
-- <=> : Cosine distance (1 - cosine similarity)
-- <-> : Euclidean distance (L2)
-- <#> : Inner product (for normalized vectors)
```

---

## 6. Row-Level Security

### 6.1 RLS Policy Overview

```sql
-- Enable RLS on all user-data tables
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_synonyms ENABLE ROW LEVEL SECURITY;
```

### 6.2 Policy Definitions

```sql
-- CANDIDATES TABLE

-- Select: Users can only view their own candidates
CREATE POLICY "Users can view own candidates"
  ON candidates FOR SELECT
  USING (user_id = auth.uid());

-- Insert: Users can only create candidates for themselves
CREATE POLICY "Users can insert own candidates"
  ON candidates FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Update: Users can only modify their own candidates
CREATE POLICY "Users can update own candidates"
  ON candidates FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: Users can only delete their own candidates
CREATE POLICY "Users can delete own candidates"
  ON candidates FOR DELETE
  USING (user_id = auth.uid());


-- CANDIDATE_CHUNKS TABLE (via join to candidates)

CREATE POLICY "Users can view own chunks"
  ON candidate_chunks FOR SELECT
  USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage chunks"
  ON candidate_chunks FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);


-- PROCESSING_JOBS TABLE

CREATE POLICY "Users can view own jobs"
  ON processing_jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own jobs"
  ON processing_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### 6.3 Service Role Bypass

```typescript
// lib/supabase/admin.ts

import { createClient } from '@supabase/supabase-js'

// Admin client bypasses RLS
// Used ONLY in server-side API routes
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // Service role key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Usage: Worker webhooks, admin operations, migrations
```

---

## 7. Data Lifecycle

### 7.1 Candidate Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CANDIDATE STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   UPLOAD     │
                    │  (trigger)   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  processing  │  Initial state after upload
                    │              │  Waiting for worker pickup
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ analyzing│ │  failed  │ │  deleted │
       │          │ │          │ │          │
       │ AI work  │ │ Error    │ │ User     │
       │ in prog. │ │ occurred │ │ canceled │
       └────┬─────┘ └──────────┘ └──────────┘
            │
            ▼
       ┌──────────┐
       │ analyzed │  AI analysis complete
       │          │  Awaiting user review
       └────┬─────┘
            │
            │  User confirms/edits
            ▼
       ┌──────────┐
       │completed │  Final state
       │          │  Searchable
       └──────────┘
```

### 7.2 Data Retention

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA RETENTION POLICY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┬───────────────┬────────────────────────────────┐
│ Data Type               │ Retention     │ Action                         │
├─────────────────────────┼───────────────┼────────────────────────────────┤
│ Active candidates       │ Indefinite    │ Keep until user deletes        │
│ Soft-deleted candidates │ 30 days       │ Hard delete after grace period │
│ Processing jobs         │ 90 days       │ Archive to cold storage        │
│ Raw resume files        │ 7 days        │ Delete after processing        │
│ Search cache            │ 1 hour        │ Auto-expire in Redis           │
│ Audit logs              │ 1 year        │ Archive to cold storage        │
│ Failed job logs (DLQ)   │ 30 days       │ Delete after review            │
└─────────────────────────┴───────────────┴────────────────────────────────┘
```

### 7.3 Cleanup Jobs

```typescript
// Scheduled cleanup (Vercel Cron)

// cron/cleanup-storage.ts - Daily
// Deletes processed resume files older than 7 days

// cron/cleanup-deleted.ts - Weekly
// Hard-deletes soft-deleted candidates after 30 days

// cron/archive-jobs.ts - Monthly
// Moves old processing_jobs to archive table
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Initial data architecture documentation |
