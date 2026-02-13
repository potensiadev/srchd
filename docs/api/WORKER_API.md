# RAI Worker API Documentation

RAI Worker는 이력서 처리 파이프라인 서버입니다. 파일 파싱, AI 분석, PII 처리, 임베딩 생성, DB 저장 등의 기능을 제공합니다.

**Base URL:** `http://localhost:8000` (개발 환경)

**Version:** 1.0.0

---

## Table of Contents

1. [인증](#인증)
2. [기존 엔드포인트](#기존-엔드포인트)
   - [GET /health](#get-health)
   - [GET /debug](#get-debug)
   - [POST /parse](#post-parse)
   - [POST /analyze](#post-analyze)
   - [POST /process](#post-process)
   - [POST /pipeline](#post-pipeline)
   - [Queue 관련](#queue-관련-엔드포인트)
   - [DLQ 관련](#dlq-관련-엔드포인트)
3. [새 엔드포인트](#새-엔드포인트)
   - [GET /feature-flags](#get-feature-flags)
   - [POST /feature-flags/reload](#post-feature-flagsreload)
   - [GET /feature-flags/check](#get-feature-flagscheck)
   - [POST /pipeline/new](#post-pipelinenew)
   - [GET /metrics](#get-metrics)
   - [GET /metrics/health](#get-metricshealth)
   - [GET /metrics/recent](#get-metricsrecent)
   - [GET /metrics/llm-cost](#get-metricsllm-cost)

---

## 인증

### 인증 방식

프로덕션 환경에서는 다음 두 가지 방식 중 하나로 인증이 필요합니다:

1. **API Key 인증**: `X-API-Key` 헤더
2. **Webhook Signature 인증**: `X-Webhook-Signature` 헤더 (HMAC-SHA256)

### 개발 환경

개발 환경 (`ENV=development` 또는 `DEBUG=true`)에서는 인증이 스킵됩니다.

### 요청 헤더 예시

```http
X-API-Key: your-webhook-secret
```

또는

```http
X-Webhook-Signature: sha256=computed-hmac-signature
```

---

## 기존 엔드포인트

### GET /health

서버 헬스체크 엔드포인트입니다. 의존성(Supabase, LLM, Redis) 상태를 확인합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| detailed | boolean | No | `true`면 의존성 상태 상세 정보 포함 |

#### 응답 스키마

```json
{
  "status": "healthy | degraded | unhealthy",
  "mode": "phase_1 | phase_2",
  "version": "1.0.0",
  "dependencies": [
    {
      "name": "supabase",
      "status": "healthy | unhealthy | unconfigured",
      "latency_ms": 45.2,
      "error": null
    }
  ]
}
```

#### 상태 값

- `healthy`: 모든 필수 의존성 정상
- `degraded`: 일부 의존성 문제 있지만 동작 가능
- `unhealthy`: 핵심 의존성(Supabase, LLM) 실패

#### 예시 요청

```bash
# 기본 헬스체크
curl http://localhost:8000/health

# 상세 헬스체크
curl "http://localhost:8000/health?detailed=true"
```

#### 예시 응답

```json
{
  "status": "healthy",
  "mode": "phase_1",
  "version": "1.0.0",
  "dependencies": [
    {
      "name": "supabase",
      "status": "healthy",
      "latency_ms": 42.15,
      "error": null
    },
    {
      "name": "openai",
      "status": "healthy",
      "latency_ms": null,
      "error": null
    },
    {
      "name": "gemini",
      "status": "healthy",
      "latency_ms": null,
      "error": null
    },
    {
      "name": "anthropic",
      "status": "unconfigured",
      "latency_ms": null,
      "error": null
    },
    {
      "name": "redis",
      "status": "healthy",
      "latency_ms": null,
      "error": null
    }
  ]
}
```

#### 인증

인증 불필요

---

### GET /debug

LLM 및 서비스 설정 상태 확인을 위한 디버그 엔드포인트입니다.

> **주의**: 프로덕션 환경(`ENV=production`, `DEBUG=false`)에서는 404를 반환합니다.

#### 응답 스키마

```json
{
  "status": "healthy",
  "mode": "phase_1 | phase_2",
  "version": "1.0.0",
  "llm_providers": ["openai", "gemini", "anthropic"],
  "llm_status": {
    "openai": {
      "configured": true,
      "client_ready": true,
      "model": "gpt-4o"
    },
    "gemini": {
      "configured": true,
      "client_ready": true,
      "model": "gemini-1.5-pro"
    },
    "anthropic": {
      "configured": false,
      "client_ready": false,
      "model": "claude-3-sonnet"
    }
  },
  "feature_flags": {
    "use_new_pipeline": false,
    "use_llm_validation": true,
    "use_agent_messaging": true,
    "use_hallucination_detection": true,
    "use_evidence_tracking": true,
    "new_pipeline_rollout_percentage": 0.0,
    "new_pipeline_user_count": 0,
    "debug_pipeline": false
  },
  "supabase_configured": true,
  "redis_configured": true,
  "env": "development"
}
```

#### 예시 요청

```bash
curl http://localhost:8000/debug
```

#### 인증

인증 불필요 (개발 환경에서만 접근 가능)

---

### POST /parse

파일을 파싱하여 텍스트를 추출합니다.

#### 요청

**Content-Type:** `multipart/form-data`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| file | File | Yes | 업로드할 파일 (PDF, HWP, HWPX, DOC, DOCX) |
| user_id | string | Yes | 사용자 ID |
| job_id | string | No | 작업 ID |

#### 응답 스키마

```json
{
  "success": true,
  "text": "추출된 텍스트 내용...",
  "file_type": "pdf | hwp | hwpx | doc | docx",
  "parse_method": "pdfplumber | olefile | hancom_api | ...",
  "page_count": 3,
  "is_encrypted": false,
  "error_message": null,
  "warnings": []
}
```

#### 예시 요청

```bash
curl -X POST http://localhost:8000/parse \
  -H "X-API-Key: your-api-key" \
  -F "file=@resume.pdf" \
  -F "user_id=user-123" \
  -F "job_id=job-456"
```

#### 예시 응답

```json
{
  "success": true,
  "text": "이름: 홍길동\n연락처: 010-1234-5678\n...",
  "file_type": "pdf",
  "parse_method": "pdfplumber",
  "page_count": 2,
  "is_encrypted": false,
  "error_message": null,
  "warnings": []
}
```

#### 인증

필수 (`X-API-Key` 또는 `X-Webhook-Signature`)

---

### POST /analyze

파싱된 텍스트를 AI로 분석합니다. GPT-4o + Gemini 1.5 Pro 크로스체크를 수행합니다.

#### 요청 바디

```json
{
  "text": "이력서 텍스트 내용...",
  "user_id": "user-123",
  "job_id": "job-456",
  "mode": "phase_1 | phase_2"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string | Yes | 분석할 이력서 텍스트 |
| user_id | string | Yes | 사용자 ID |
| job_id | string | No | 작업 ID |
| mode | string | No | 분석 모드 (`phase_1`: 2-Way, `phase_2`: 3-Way) |

#### 응답 스키마

```json
{
  "success": true,
  "data": {
    "name": "홍길동",
    "email": "hong@example.com",
    "phone": "010-1234-5678",
    "education": [...],
    "experience": [...],
    "skills": [...]
  },
  "confidence_score": 0.92,
  "field_confidence": {
    "name": 1.0,
    "email": 0.95,
    "experience": 0.88
  },
  "warnings": [],
  "processing_time_ms": 3500,
  "mode": "phase_1",
  "error": null
}
```

#### 예시 요청

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "text": "이름: 홍길동\n경력: 삼성전자 5년...",
    "user_id": "user-123",
    "mode": "phase_1"
  }'
```

#### 인증

필수

---

### POST /process

이력서 전체 처리 파이프라인을 실행합니다.

1. 분석 (Analyst Agent)
2. PII 마스킹 (Privacy Agent)
3. 청킹 + 임베딩 (Embedding Service)
4. DB 저장

#### 요청 바디

```json
{
  "text": "이력서 텍스트...",
  "user_id": "user-123",
  "job_id": "job-456",
  "mode": "phase_1",
  "generate_embeddings": true,
  "mask_pii": true,
  "save_to_db": true,
  "source_file": "path/to/file.pdf",
  "file_type": "pdf"
}
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| text | string | Yes | - | 처리할 이력서 텍스트 |
| user_id | string | Yes | - | 사용자 ID |
| job_id | string | No | null | 작업 ID |
| mode | string | No | "phase_1" | 분석 모드 |
| generate_embeddings | boolean | No | true | 임베딩 생성 여부 |
| mask_pii | boolean | No | true | PII 마스킹 여부 |
| save_to_db | boolean | No | true | DB 저장 여부 |
| source_file | string | No | null | 원본 파일 경로 |
| file_type | string | No | null | 파일 타입 |

#### 응답 스키마

```json
{
  "success": true,
  "candidate_id": "cand-uuid",
  "data": {...},
  "confidence_score": 0.92,
  "field_confidence": {...},
  "analysis_warnings": [],
  "pii_count": 3,
  "pii_types": ["phone", "email", "name"],
  "privacy_warnings": [],
  "encrypted_fields": ["phone", "email"],
  "chunk_count": 5,
  "chunks_saved": 5,
  "embedding_tokens": 1200,
  "processing_time_ms": 5000,
  "mode": "phase_1",
  "error": null
}
```

#### 인증

필수

---

### POST /pipeline

전체 파이프라인 엔드포인트입니다. Supabase Storage에서 파일을 다운로드하여 처리합니다.

Feature Flag에 따라 새 파이프라인 또는 기존 파이프라인을 사용합니다.

#### 요청 바디

```json
{
  "file_url": "user-123/job-456/resume.pdf",
  "file_name": "resume.pdf",
  "user_id": "user-123",
  "job_id": "job-456",
  "candidate_id": "cand-uuid",
  "mode": "phase_1",
  "is_retry": false,
  "skip_credit_deduction": false
}
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| file_url | string | Yes | - | Supabase Storage 경로 |
| file_name | string | Yes | - | 파일명 |
| user_id | string | Yes | - | 사용자 ID |
| job_id | string | Yes | - | 작업 ID |
| candidate_id | string | No | null | 기존 후보자 ID (업데이트 시) |
| mode | string | No | "phase_1" | 분석 모드 |
| is_retry | boolean | No | false | 재시도 여부 |
| skip_credit_deduction | boolean | No | false | 크레딧 차감 스킵 |

#### 응답 스키마

```json
{
  "success": true,
  "message": "Pipeline completed",
  "job_id": "job-456"
}
```

#### 인증

필수

---

## Queue 관련 엔드포인트

### GET /queue/status

Redis Queue 상태를 확인합니다.

#### 응답 스키마

```json
{
  "available": true,
  "parse_queue_size": 5,
  "process_queue_size": 3
}
```

#### 인증

필수

---

### POST /queue/enqueue

Redis Queue에 작업을 추가합니다.

#### 요청 바디

```json
{
  "job_id": "job-456",
  "user_id": "user-123",
  "file_path": "path/to/file.pdf",
  "file_name": "resume.pdf",
  "mode": "phase_1"
}
```

#### 응답 스키마

```json
{
  "success": true,
  "job_id": "job-456",
  "rq_job_id": "rq-job-uuid",
  "status": "queued",
  "error": null
}
```

#### 인증

필수

---

### GET /queue/job/{rq_job_id}

RQ Job 상태를 조회합니다.

#### Path 파라미터

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| rq_job_id | string | RQ Job ID |

#### 응답 스키마

```json
{
  "status": "queued | started | finished | failed",
  "result": {...},
  "error": null
}
```

#### 인증

필수

---

## DLQ 관련 엔드포인트

### GET /dlq/stats

DLQ(Dead Letter Queue) 통계를 조회합니다.

#### 응답 스키마

```json
{
  "available": true,
  "total": 15,
  "by_job_type": {
    "full_pipeline": 10,
    "parse": 3,
    "process": 2
  },
  "by_error_type": {
    "TimeoutError": 8,
    "ValidationError": 5,
    "APIError": 2
  },
  "by_user": {
    "user-123": 5,
    "user-456": 3
  },
  "error": null
}
```

#### 인증

필수

---

### GET /dlq/entries

DLQ 항목 목록을 조회합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| limit | int | No | 50 | 최대 조회 수 |
| offset | int | No | 0 | 시작 위치 |
| job_type | string | No | null | 작업 타입 필터 |
| user_id | string | No | null | 사용자 ID 필터 |

#### 응답 스키마

```json
{
  "success": true,
  "total": 15,
  "entries": [
    {
      "dlq_id": "dlq-uuid",
      "job_id": "job-456",
      "rq_job_id": "rq-job-uuid",
      "job_type": "full_pipeline",
      "user_id": "user-123",
      "error_message": "Timeout exceeded",
      "error_type": "TimeoutError",
      "retry_count": 3,
      "failed_at": "2025-01-15T10:30:00Z",
      "job_kwargs": {...}
    }
  ]
}
```

#### 인증

필수

---

### GET /dlq/entry/{dlq_id}

단일 DLQ 항목을 조회합니다 (스택트레이스 포함).

#### Path 파라미터

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| dlq_id | string | DLQ 항목 ID |

#### 인증

필수

---

### POST /dlq/retry/{dlq_id}

DLQ에서 작업을 재시도합니다.

#### Path 파라미터

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| dlq_id | string | DLQ 항목 ID |

#### 응답 스키마

```json
{
  "success": true,
  "message": "Job retried successfully",
  "dlq_id": "dlq-uuid",
  "new_rq_job_id": "new-rq-job-uuid"
}
```

#### 인증

필수

---

### DELETE /dlq/entry/{dlq_id}

DLQ에서 항목을 삭제합니다.

#### Path 파라미터

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| dlq_id | string | DLQ 항목 ID |

#### 인증

필수

---

### DELETE /dlq/clear

DLQ를 정리합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| older_than_days | int | No | 지정된 일수보다 오래된 항목만 삭제 |

#### 응답 스키마

```json
{
  "success": true,
  "message": "Cleared 10 entries older than 7 days",
  "deleted_count": 10
}
```

#### 인증

필수

---

## 새 엔드포인트

### GET /feature-flags

현재 Feature Flags 상태를 조회합니다.

#### 응답 스키마

```json
{
  "use_new_pipeline": false,
  "use_llm_validation": true,
  "use_agent_messaging": true,
  "use_hallucination_detection": true,
  "use_evidence_tracking": true,
  "new_pipeline_rollout_percentage": 0.1,
  "new_pipeline_user_count": 5,
  "debug_pipeline": false
}
```

#### 필드 설명

| 필드 | 설명 |
|------|------|
| use_new_pipeline | 새 PipelineOrchestrator 사용 여부 |
| use_llm_validation | LLM 검증 기능 활성화 |
| use_agent_messaging | 에이전트 메시징 기능 활성화 |
| use_hallucination_detection | 환각 감지 기능 활성화 |
| use_evidence_tracking | 증거 추적 기능 활성화 |
| new_pipeline_rollout_percentage | 새 파이프라인 롤아웃 비율 (0.0-1.0) |
| new_pipeline_user_count | 새 파이프라인 화이트리스트 사용자 수 |
| debug_pipeline | 파이프라인 디버그 모드 |

#### 예시 요청

```bash
curl http://localhost:8000/feature-flags \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### POST /feature-flags/reload

환경 변수에서 Feature Flags를 다시 로드합니다.

런타임에서 플래그를 변경한 후 적용할 때 사용합니다.

#### 요청 바디

없음

#### 응답 스키마

```json
{
  "success": true,
  "message": "Feature flags reloaded",
  "flags": {
    "use_new_pipeline": true,
    "use_llm_validation": true,
    "new_pipeline_rollout_percentage": 0.2
  }
}
```

#### 예시 요청

```bash
curl -X POST http://localhost:8000/feature-flags/reload \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### GET /feature-flags/check

특정 user_id/job_id에 대해 어떤 파이프라인이 사용될지 확인합니다.

테스트 및 디버깅 용도입니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| user_id | string | No | 테스트할 사용자 ID |
| job_id | string | No | 테스트할 작업 ID |

#### 응답 스키마

```json
{
  "user_id": "user-123",
  "job_id": "job-456",
  "will_use_new_pipeline": true,
  "reason": "User user-123 is in whitelist"
}
```

#### reason 값 예시

- `"Main flag (USE_NEW_PIPELINE) is disabled"`
- `"User {user_id} is in whitelist"`
- `"100% rollout enabled"`
- `"Job selected by 20% rollout"`
- `"Job not selected by 20% rollout"`
- `"Following main flag setting"`

#### 예시 요청

```bash
curl "http://localhost:8000/feature-flags/check?user_id=user-123&job_id=job-456" \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### POST /pipeline/new

새 PipelineOrchestrator를 직접 호출합니다. Feature Flag와 상관없이 새 파이프라인을 사용합니다.

테스트 및 디버깅 목적으로 사용하세요.

#### 요청 바디

```json
{
  "file_url": "user-123/job-456/resume.pdf",
  "file_name": "resume.pdf",
  "user_id": "user-123",
  "job_id": "job-456",
  "candidate_id": null,
  "mode": "phase_1",
  "is_retry": false,
  "skip_credit_deduction": false
}
```

#### 응답 스키마

```json
{
  "success": true,
  "candidate_id": "cand-uuid",
  "confidence_score": 0.92,
  "field_confidence": {
    "name": 1.0,
    "email": 0.95
  },
  "chunk_count": 5,
  "chunks_saved": 5,
  "pii_count": 3,
  "warnings": [],
  "processing_time_ms": 4500,
  "pipeline_id": "pipeline-uuid",
  "is_update": false,
  "error": null
}
```

#### 예시 요청

```bash
curl -X POST http://localhost:8000/pipeline/new \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "file_url": "user-123/job-456/resume.pdf",
    "file_name": "resume.pdf",
    "user_id": "user-123",
    "job_id": "job-456",
    "mode": "phase_1"
  }'
```

#### 인증

필수

---

### GET /metrics

집계된 파이프라인 성능 및 비용 메트릭을 반환합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| minutes | int | No | 60 | 조회 기간 (분) |
| pipeline_type | string | No | null | 파이프라인 타입 필터 ("legacy" or "new") |

#### 응답 스키마

```json
{
  "total_requests": 150,
  "successful_requests": 142,
  "failed_requests": 8,
  "success_rate": 0.947,
  "avg_duration_ms": 4250.5,
  "min_duration_ms": 1200,
  "max_duration_ms": 12500,
  "errors_by_code": {
    "TIMEOUT": 3,
    "VALIDATION_ERROR": 5
  },
  "stage_avg_durations": {
    "parse": 850.2,
    "analyze": 2100.5,
    "pii": 200.3,
    "embedding": 800.5,
    "save": 300.0
  },
  "llm_total_calls": 300,
  "llm_total_tokens_input": 450000,
  "llm_total_tokens_output": 75000,
  "llm_total_cost_usd": 12.50,
  "llm_calls_by_provider": {
    "openai": 150,
    "gemini": 150
  },
  "requests_by_pipeline_type": {
    "legacy": 100,
    "new": 50
  },
  "period_start": "2025-01-15T09:00:00Z",
  "period_end": "2025-01-15T10:00:00Z"
}
```

#### 예시 요청

```bash
# 최근 1시간 메트릭
curl "http://localhost:8000/metrics" \
  -H "X-API-Key: your-api-key"

# 최근 24시간 메트릭
curl "http://localhost:8000/metrics?minutes=1440" \
  -H "X-API-Key: your-api-key"

# 새 파이프라인만 필터
curl "http://localhost:8000/metrics?pipeline_type=new" \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### GET /metrics/health

메트릭 기반 헬스 상태를 반환합니다. 최근 5분간 메트릭을 기반으로 시스템 상태를 판단합니다.

#### 응답 스키마

```json
{
  "status": "healthy | degraded | unhealthy",
  "error_rate": 0.05,
  "avg_duration_ms": 4250.5,
  "active_pipelines": 3,
  "total_requests_5min": 25
}
```

#### 상태 기준

| 상태 | 에러율 |
|------|--------|
| healthy | 10% 미만 |
| degraded | 10-50% |
| unhealthy | 50% 이상 |

#### 예시 요청

```bash
curl http://localhost:8000/metrics/health \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### GET /metrics/recent

최근 파이프라인 실행 메트릭 목록을 반환합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| count | int | No | 10 | 조회할 최근 실행 수 |

#### 응답 스키마

```json
{
  "success": true,
  "count": 10,
  "metrics": [
    {
      "pipeline_id": "pipeline-uuid",
      "job_id": "job-456",
      "user_id": "user-123",
      "pipeline_type": "new",
      "status": "completed",
      "duration_ms": 4500,
      "stage_durations": {
        "parse": 800,
        "analyze": 2200,
        "pii": 200,
        "embedding": 900,
        "save": 400
      },
      "llm_calls": 2,
      "llm_cost_usd": 0.08,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

#### 예시 요청

```bash
curl "http://localhost:8000/metrics/recent?count=20" \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

### GET /metrics/llm-cost

LLM 호출 비용 관련 상세 메트릭을 반환합니다.

#### 요청 파라미터

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| minutes | int | No | 1440 | 조회 기간 (분, 기본 24시간) |

#### 응답 스키마

```json
{
  "success": true,
  "period_minutes": 1440,
  "total_cost_usd": 45.2500,
  "total_calls": 1200,
  "total_tokens_input": 1800000,
  "total_tokens_output": 300000,
  "calls_by_provider": {
    "openai": 600,
    "gemini": 600
  },
  "estimates": {
    "hourly_cost_usd": 1.8854,
    "daily_cost_usd": 45.25,
    "monthly_cost_usd": 1357.50
  }
}
```

#### 예시 요청

```bash
# 최근 24시간 LLM 비용
curl http://localhost:8000/metrics/llm-cost \
  -H "X-API-Key: your-api-key"

# 최근 7일 LLM 비용
curl "http://localhost:8000/metrics/llm-cost?minutes=10080" \
  -H "X-API-Key: your-api-key"
```

#### 인증

필수

---

## 에러 응답

모든 엔드포인트는 에러 발생 시 다음 형식으로 응답합니다:

```json
{
  "detail": "에러 메시지"
}
```

### HTTP 상태 코드

| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 400 | 잘못된 요청 |
| 401 | 인증 실패 |
| 404 | 리소스를 찾을 수 없음 |
| 500 | 서버 내부 오류 |

---

## CORS 설정

### 개발 환경

다음 origin이 허용됩니다:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:8000`

### 프로덕션 환경

`ALLOWED_ORIGINS` 환경 변수에서 쉼표로 구분된 도메인 목록을 설정해야 합니다.

예: `ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`

---

## 환경 변수

Worker가 사용하는 주요 환경 변수:

| 변수명 | 설명 | 필수 |
|--------|------|------|
| ENV | 환경 (development/production) | No |
| DEBUG | 디버그 모드 | No |
| WEBHOOK_SECRET | API 인증 키 | Yes (prod) |
| SUPABASE_URL | Supabase URL | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Supabase 서비스 롤 키 | Yes |
| OPENAI_API_KEY | OpenAI API 키 | Yes |
| GOOGLE_AI_API_KEY | Google AI API 키 | No |
| ANTHROPIC_API_KEY | Anthropic API 키 | No |
| REDIS_URL | Redis 연결 URL | No |
| ALLOWED_ORIGINS | CORS 허용 도메인 | Yes (prod) |
| SENTRY_DSN | Sentry DSN | No |
| USE_NEW_PIPELINE | 새 파이프라인 사용 여부 | No |
| NEW_PIPELINE_ROLLOUT_PERCENTAGE | 새 파이프라인 롤아웃 비율 | No |
| NEW_PIPELINE_USER_IDS | 새 파이프라인 화이트리스트 사용자 | No |
