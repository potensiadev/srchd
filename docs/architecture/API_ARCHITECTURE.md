# API Architecture

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0

## Table of Contents

1. [Overview](#1-overview)
2. [API Design Principles](#2-api-design-principles)
3. [Endpoint Reference](#3-endpoint-reference)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Rate Limiting](#5-rate-limiting)
6. [Error Handling](#6-error-handling)
7. [Webhook Integrations](#7-webhook-integrations)

---

## 1. Overview

SRCHD's API is built on Next.js App Router API Routes, deployed as Vercel Serverless Functions. The API serves as the Backend-for-Frontend (BFF) layer, handling authentication, data validation, and communication with the Python Worker.

### API Characteristics

| Aspect | Implementation |
|--------|----------------|
| Protocol | HTTPS (TLS 1.3) |
| Format | JSON |
| Auth | Cookie-based (Supabase SSR) |
| Versioning | None (single version) |
| Documentation | OpenAPI 3.1 (`openapi.yaml`) |

---

## 2. API Design Principles

### 2.1 Response Format

All API responses follow a consistent structure:

```typescript
// Success Response
interface SuccessResponse<T> {
  success: true;
  data: T;
}

// Error Response
interface ErrorResponse {
  success: false;
  error: {
    code: string;       // Machine-readable code (e.g., "INVALID_FILE_TYPE")
    message: string;    // Human-readable message (Korean)
  };
}

// Combined Type
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
```

### 2.2 HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read resources | Yes |
| POST | Create resources, trigger actions | No |
| PATCH | Partial update | Yes |
| DELETE | Remove resources | Yes |

### 2.3 Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH, DELETE |
| 201 | Created | Successful POST with resource creation |
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource or state conflict |
| 422 | Unprocessable | Valid syntax but semantic errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server-side error |

---

## 3. Endpoint Reference

### 3.1 Authentication Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTH ENDPOINTS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/auth/callback
  Purpose: Handle OAuth callback from Supabase Auth
  Auth: None (callback handler)
  Body: { code: string }
  Response: Redirect to dashboard or error page

POST /api/auth/consent
  Purpose: Record user consent for terms/privacy
  Auth: Required
  Body: {
    terms_of_service: boolean,
    privacy_policy: boolean,
    third_party_data_guarantee: boolean,
    marketing_consent?: boolean
  }
  Response: { success: true, data: { consented_at: string } }

POST /api/auth/logout
  Purpose: Clear session cookies
  Auth: Required
  Response: { success: true }
```

### 3.2 Upload Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UPLOAD ENDPOINTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/upload
  Purpose: Upload resume file for AI processing
  Auth: Required
  Content-Type: multipart/form-data
  Body: {
    file: File,              // Resume file (PDF, DOCX, HWP, HWPX)
    project_id?: string      // Optional folder assignment
  }

  Validations:
  - File type: PDF, DOCX, HWP, HWPX only
  - File size: Max 50MB
  - Page count: Max 50 pages
  - Magic number verification
  - DRM/encryption detection
  - Credit availability
  - Concurrent upload limit (5 per user)

  Response: {
    success: true,
    data: {
      job_id: string,
      candidate_id: string,
      status: "queued"
    }
  }

  Errors:
  - 400: INVALID_FILE_TYPE, FILE_TOO_LARGE, PAGE_LIMIT_EXCEEDED
  - 402: INSUFFICIENT_CREDITS
  - 429: CONCURRENT_UPLOAD_LIMIT

GET /api/upload/status/:jobId
  Purpose: Poll job processing status
  Auth: Required
  Response: {
    success: true,
    data: {
      status: "queued" | "processing" | "analyzing" | "completed" | "failed",
      progress: number,        // 0-100
      candidate_id?: string,
      error?: { code: string, message: string }
    }
  }
```

### 3.3 Candidate Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CANDIDATE ENDPOINTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

GET /api/candidates
  Purpose: List user's candidates with pagination
  Auth: Required
  Query Params:
    - page: number (default: 1)
    - limit: number (default: 20, max: 100)
    - status: "processing" | "analyzed" | "completed" | "all"
    - sort: "created_at" | "name" | "exp_years" | "confidence_score"
    - order: "asc" | "desc"
    - project_id: string (filter by folder)

  Response: {
    success: true,
    data: {
      candidates: Candidate[],
      pagination: {
        total: number,
        page: number,
        limit: number,
        hasMore: boolean
      }
    }
  }

GET /api/candidates/:id
  Purpose: Get single candidate with full details
  Auth: Required (owner only)
  Response: {
    success: true,
    data: {
      id: string,
      name: string,
      phone_masked: string,
      email_masked: string,
      skills: string[],
      exp_years: number,
      careers: Career[],
      projects: Project[],
      education: Education[],
      summary: string,
      strengths: string[],
      confidence_score: number,
      requires_review: boolean,
      status: CandidateStatus,
      created_at: string,
      updated_at: string
    }
  }

PATCH /api/candidates/:id
  Purpose: Update candidate after review
  Auth: Required (owner only)
  Body: {
    name?: string,
    skills?: string[],
    exp_years?: number,
    careers?: Career[],
    summary?: string,
    status?: "completed"     // Confirm analysis
  }
  Response: { success: true, data: Candidate }

DELETE /api/candidates/:id
  Purpose: Soft-delete candidate
  Auth: Required (owner only)
  Response: {
    success: true,
    data: {
      deleted: true,
      credit_refunded: boolean    // True if within refund window
    }
  }

GET /api/candidates/:id/export
  Purpose: Export candidate as blind profile (no contact info)
  Auth: Required (owner only)
  Query Params:
    - format: "pdf" | "docx"
  Response: Binary file download

  Privacy:
  - Phone/email completely removed
  - Address anonymized
  - Company names optionally blinded
```

### 3.4 Search Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEARCH ENDPOINTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/search
  Purpose: Hybrid search across candidates
  Auth: Required
  Rate Limit: 30 requests/minute

  Body: {
    query: string,              // Free-text search query
    filters?: {
      exp_years_min?: number,
      exp_years_max?: number,
      skills?: string[],
      location?: string,
      education_level?: string,
      company?: string
    },
    page?: number,
    limit?: number              // Max 50
  }

  Response: {
    success: true,
    data: {
      candidates: SearchResult[],
      facets: {
        experience: { junior: number, mid: number, senior: number },
        skills: Array<{ skill: string, count: number }>,
        companies: Array<{ company: string, count: number }>
      },
      pagination: {
        total: number,
        page: number,
        hasMore: boolean
      },
      query_info: {
        search_type: "rdb" | "hybrid",
        cached: boolean,
        processing_time_ms: number
      }
    }
  }

POST /api/saved-searches
  Purpose: Save a search for quick access
  Auth: Required
  Body: {
    name: string,
    query: string,
    filters: object
  }
  Response: { success: true, data: SavedSearch }

GET /api/saved-searches
  Purpose: List user's saved searches
  Auth: Required
  Response: { success: true, data: SavedSearch[] }

DELETE /api/saved-searches/:id
  Purpose: Delete saved search
  Auth: Required
  Response: { success: true }
```

### 3.5 Position Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          POSITION ENDPOINTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/positions
  Purpose: Create job position (for candidate matching)
  Auth: Required
  Body: {
    title: string,
    company: string,
    description: string,
    requirements: string,
    skills_required: string[],
    exp_years_min?: number,
    exp_years_max?: number,
    location?: string
  }
  Response: { success: true, data: Position }

GET /api/positions/:id/match
  Purpose: Find matching candidates for position
  Auth: Required
  Query Params:
    - limit: number (default: 20)
  Response: {
    success: true,
    data: {
      matches: Array<{
        candidate: CandidateSummary,
        match_score: number,         // 0-100
        matching_skills: string[],
        missing_skills: string[]
      }>
    }
  }

POST /api/positions/extract-jd
  Purpose: Extract structured data from job description
  Auth: Required
  Body: { jd_text: string }
  Response: {
    success: true,
    data: {
      title: string,
      company?: string,
      skills_required: string[],
      exp_years_min?: number,
      exp_years_max?: number,
      responsibilities: string[]
    }
  }
```

### 3.6 User Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER ENDPOINTS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

GET /api/user/me
  Purpose: Get current user profile and credits
  Auth: Required
  Response: {
    success: true,
    data: {
      id: string,
      email: string,
      name: string,
      avatar_url?: string,
      plan: "free" | "starter" | "pro",
      credits: number,
      credits_used_this_month: number,
      credits_reset_at: string,
      consents_completed: boolean
    }
  }

GET /api/user/usage
  Purpose: Get usage statistics
  Auth: Required
  Query Params:
    - period: "week" | "month" | "year"
  Response: {
    success: true,
    data: {
      uploads: Array<{ date: string, count: number }>,
      searches: Array<{ date: string, count: number }>,
      exports: Array<{ date: string, count: number }>,
      total_candidates: number,
      storage_used_mb: number
    }
  }

PATCH /api/user/settings
  Purpose: Update user preferences
  Auth: Required
  Body: {
    name?: string,
    notification_email?: boolean,
    default_export_format?: "pdf" | "docx"
  }
  Response: { success: true, data: UserSettings }
```

### 3.7 Webhook Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEBHOOK ENDPOINTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/webhooks/worker
  Purpose: Receive processing status updates from Worker
  Auth: Webhook secret (X-Webhook-Secret header)

  Body: {
    event: "job.started" | "job.parsing" | "job.analyzed" | "job.completed" | "job.failed",
    job_id: string,
    candidate_id: string,
    data?: {
      confidence_score?: number,
      chunk_count?: number,
      pii_count?: number,
      error_code?: string,
      error_message?: string
    },
    timestamp: string
  }

  Response: { success: true }

  Actions:
  - Update processing_jobs status
  - Update candidate status/metadata
  - Trigger credit deduction (on success)
  - Trigger credit refund (on failure)

POST /api/webhooks/paddle
  Purpose: Handle Paddle subscription events
  Auth: Paddle signature verification
  Status: Not implemented (Phase 1 pending)

  Events to handle:
  - subscription.created
  - subscription.updated
  - subscription.canceled
  - payment.succeeded
  - payment.failed
```

---

## 4. Authentication & Authorization

### 4.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  User visits    │
                    │  /login         │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Click OAuth    │
                    │  (Google/Kakao) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Supabase Auth  │
                    │  handles OAuth  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Redirect to    │
                    │  /api/auth/     │
                    │  callback       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │  New User?      │          │  Existing User  │
     │                 │          │                 │
     │  Create user    │          │  Load session   │
     │  record in DB   │          │                 │
     └────────┬────────┘          └────────┬────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Consent check  │
                    │  completed?     │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │  Not complete   │          │  Complete       │
     │                 │          │                 │
     │  Redirect to    │          │  Redirect to    │
     │  /consent       │          │  /dashboard     │
     └─────────────────┘          └─────────────────┘
```

### 4.2 Session Management

```typescript
// lib/supabase/middleware.ts

export async function updateSession(request: NextRequest) {
  // Create Supabase client with request cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => {
          // Set cookie on response
        },
        remove: (name, options) => {
          // Remove cookie
        },
      },
    }
  )

  // Refresh session if needed
  const { data: { session }, error } = await supabase.auth.getSession()

  // Return user if authenticated
  return session?.user ?? null
}
```

### 4.3 Authorization Middleware

```typescript
// middleware.ts

const PROTECTED_ROUTES = [
  '/dashboard',
  '/candidates',
  '/upload',
  '/search',
  '/settings',
  '/api/candidates',
  '/api/upload',
  '/api/search',
]

const CONSENT_REQUIRED_ROUTES = [
  '/dashboard',
  '/candidates',
  '/upload',
  '/search',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if route is protected
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const user = await updateSession(request)

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check consent for specific routes
    if (CONSENT_REQUIRED_ROUTES.some(route => pathname.startsWith(route))) {
      const consentsCompleted = await checkConsents(user.id)

      if (!consentsCompleted) {
        return NextResponse.redirect(new URL('/consent', request.url))
      }
    }
  }

  return NextResponse.next()
}
```

### 4.4 CSRF Protection

```typescript
// lib/csrf.ts

export function validateCSRF(request: NextRequest): boolean {
  // Only validate state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true
  }

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  // Origin must match host
  if (origin) {
    const originUrl = new URL(origin)
    if (originUrl.host !== host) {
      return false
    }
  }

  // Referer must match origin
  if (referer) {
    const refererUrl = new URL(referer)
    if (refererUrl.origin !== origin) {
      return false
    }
  }

  return true
}
```

---

## 5. Rate Limiting

### 5.1 Rate Limit Configuration

```typescript
// lib/rate-limit.ts

interface RateLimitConfig {
  window: number;        // Time window in seconds
  max: number;           // Max requests per window
  keyPrefix: string;     // Redis key prefix
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Upload endpoints
  'POST /api/upload': {
    window: 60,
    max: 10,
    keyPrefix: 'rl:upload'
  },

  // Search endpoints (higher limit for productivity)
  'POST /api/search': {
    window: 60,
    max: 30,
    keyPrefix: 'rl:search'
  },

  // Auth endpoints (strict to prevent brute force)
  'POST /api/auth/*': {
    window: 60,
    max: 5,
    keyPrefix: 'rl:auth'
  },

  // General API (catch-all)
  'default': {
    window: 60,
    max: 100,
    keyPrefix: 'rl:default'
  }
}
```

### 5.2 Rate Limit Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMIT FLOW                                         │
└─────────────────────────────────────────────────────────────────────────────┘

Request arrives
      │
      ▼
┌─────────────────┐
│ Extract keys:   │
│ • IP address    │
│ • User ID       │
│ • Endpoint      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Redis INCR      │
│                 │
│ Key: rl:{type}: │
│ {user}:{endpoint}│
│                 │
│ EXPIRE: window  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check count     │
│ vs max          │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 ≤ max      > max
    │         │
    ▼         ▼
 Continue   Return 429
            {
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: "요청이 너무 많습니다",
                retry_after: <seconds>
              }
            }
```

### 5.3 Response Headers

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1707900000
Retry-After: 45  (only on 429)
```

---

## 6. Error Handling

### 6.1 Error Code Reference

```typescript
// Error codes by category

// Authentication Errors (AUTH_*)
const AUTH_ERRORS = {
  AUTH_REQUIRED: "인증이 필요합니다",
  AUTH_INVALID_TOKEN: "유효하지 않은 인증 토큰입니다",
  AUTH_EXPIRED: "인증이 만료되었습니다",
  AUTH_CONSENT_REQUIRED: "서비스 이용 동의가 필요합니다",
}

// File Errors (FILE_*)
const FILE_ERRORS = {
  FILE_REQUIRED: "파일을 선택해주세요",
  FILE_TOO_LARGE: "파일 크기는 50MB를 초과할 수 없습니다",
  FILE_INVALID_TYPE: "지원하지 않는 파일 형식입니다",
  FILE_ENCRYPTED: "암호화된 파일은 처리할 수 없습니다",
  FILE_DRM_PROTECTED: "DRM이 적용된 파일은 처리할 수 없습니다",
  FILE_PAGE_LIMIT: "50페이지 이하의 문서만 처리 가능합니다",
  FILE_CORRUPTED: "손상된 파일입니다",
}

// Credit Errors (CREDIT_*)
const CREDIT_ERRORS = {
  CREDIT_INSUFFICIENT: "크레딧이 부족합니다",
  CREDIT_RESERVATION_FAILED: "크레딧 예약에 실패했습니다",
}

// Processing Errors (PROCESS_*)
const PROCESS_ERRORS = {
  PROCESS_FAILED: "파일 처리 중 오류가 발생했습니다",
  PROCESS_TIMEOUT: "처리 시간이 초과되었습니다",
  PROCESS_MULTI_IDENTITY: "여러 명의 정보가 포함된 문서입니다",
  PROCESS_TEXT_TOO_SHORT: "추출된 텍스트가 너무 짧습니다",
}

// Resource Errors (RESOURCE_*)
const RESOURCE_ERRORS = {
  RESOURCE_NOT_FOUND: "리소스를 찾을 수 없습니다",
  RESOURCE_ACCESS_DENIED: "접근 권한이 없습니다",
  RESOURCE_DELETED: "삭제된 리소스입니다",
}

// Validation Errors (VALIDATION_*)
const VALIDATION_ERRORS = {
  VALIDATION_FAILED: "입력값이 유효하지 않습니다",
  VALIDATION_REQUIRED_FIELD: "필수 항목이 누락되었습니다",
}

// Rate Limit Errors (RATE_*)
const RATE_ERRORS = {
  RATE_LIMIT_EXCEEDED: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
  RATE_CONCURRENT_LIMIT: "동시 업로드 한도를 초과했습니다",
}

// Server Errors (SERVER_*)
const SERVER_ERRORS = {
  SERVER_ERROR: "서버 오류가 발생했습니다",
  SERVER_UNAVAILABLE: "서비스를 일시적으로 사용할 수 없습니다",
}
```

### 6.2 Error Response Helper

```typescript
// lib/api-response.ts

export function errorResponse(
  code: string,
  message: string,
  status: number = 400
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message }
    },
    { status }
  )
}

export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status }
  )
}

// Usage
export async function POST(request: Request) {
  try {
    const file = await request.formData()

    if (!file) {
      return errorResponse('FILE_REQUIRED', '파일을 선택해주세요', 400)
    }

    // ... processing

    return successResponse({ jobId, candidateId }, 201)

  } catch (error) {
    console.error('Upload error:', error)
    return errorResponse('SERVER_ERROR', '서버 오류가 발생했습니다', 500)
  }
}
```

---

## 7. Webhook Integrations

### 7.1 Worker Webhook

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WORKER WEBHOOK FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Python Worker completes processing
         │
         ▼
┌─────────────────┐
│ Construct       │
│ webhook payload │
│                 │
│ {               │
│   event,        │
│   job_id,       │
│   candidate_id, │
│   data,         │
│   timestamp     │
│ }               │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate HMAC   │
│                 │
│ X-Webhook-      │
│ Signature:      │
│ sha256=...      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ POST /api/      │
│ webhooks/worker │
│                 │
│ Headers:        │
│ X-Webhook-Secret│
│ X-Webhook-      │
│ Signature       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      API HANDLER                                             │
│                                                                              │
│  1. Verify X-Webhook-Secret matches env var                                 │
│  2. Verify HMAC signature                                                   │
│  3. Parse event type                                                        │
│  4. Update database accordingly                                             │
│                                                                              │
│  Event Handlers:                                                            │
│  ┌─────────────────┬───────────────────────────────────────────────────┐   │
│  │ Event           │ Actions                                           │   │
│  ├─────────────────┼───────────────────────────────────────────────────┤   │
│  │ job.started     │ Update job status = 'processing'                  │   │
│  │ job.parsing     │ Update job status = 'parsing', progress = 25      │   │
│  │ job.analyzed    │ Update job status = 'analyzing', progress = 75    │   │
│  │                 │ Update candidate preliminary data                 │   │
│  │ job.completed   │ Update job status = 'completed', progress = 100   │   │
│  │                 │ Update candidate final data + confidence          │   │
│  │                 │ Deduct credit from user                           │   │
│  │ job.failed      │ Update job status = 'failed'                      │   │
│  │                 │ Store error details                               │   │
│  │                 │ Refund reserved credit                            │   │
│  └─────────────────┴───────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Webhook Security

```typescript
// Webhook signature verification

async function verifyWebhookSignature(
  request: Request,
  body: string
): Promise<boolean> {
  const signature = request.headers.get('X-Webhook-Signature')
  const secret = process.env.WEBHOOK_SECRET

  if (!signature || !secret) {
    return false
  }

  // Extract algorithm and hash
  const [algorithm, hash] = signature.split('=')

  if (algorithm !== 'sha256') {
    return false
  }

  // Compute expected hash
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  )

  const expectedHash = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(expectedHash)
  )
}
```

### 7.3 Webhook Retry Policy

```
Worker sends webhook
        │
        ▼
   ┌─────────┐
   │ HTTP    │
   │ Request │
   └────┬────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
2xx/4xx    5xx/timeout
   │         │
   │         ▼
   │    ┌─────────┐
   │    │ Retry 1 │ After 1 second
   │    └────┬────┘
   │         │
   │    ┌────┴────┐
   │    │         │
   │    ▼         ▼
   │  2xx/4xx   5xx
   │    │         │
   │    │         ▼
   │    │    ┌─────────┐
   │    │    │ Retry 2 │ After 2 seconds
   │    │    └────┬────┘
   │    │         │
   │    │    ┌────┴────┐
   │    │    │         │
   │    │    ▼         ▼
   │    │  2xx/4xx   5xx
   │    │    │         │
   │    │    │         ▼
   │    │    │    ┌─────────┐
   │    │    │    │ Retry 3 │ After 4 seconds
   │    │    │    └────┬────┘
   │    │    │         │
   │    │    │    ┌────┴────┐
   │    │    │    │         │
   │    │    │    ▼         ▼
   │    │    │  Success   Failure
   │    │    │    │         │
   │    │    │    │         ▼
   │    │    │    │    Log to DLQ
   │    │    │    │    Alert admin
   └────┴────┴────┴─────────┘
              │
              ▼
           Done
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-14 | Initial API architecture documentation |
