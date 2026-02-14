# Multi-Agent Pipeline Architecture

> **Last Updated**: 2026-02-14
> **Version**: 1.2.0

---

## 🚦 Implementation Status (Code-Aligned)

> This document distinguishes **current implementation** and **planned** items to avoid doc-code drift.

- **Current (implemented):** RouterAgent, IdentityChecker, AnalystAgent, ValidationAgent, PrivacyAgent, VisualAgent, **DocumentClassifier**, **CoverageCalculator**, **GapFillerAgent**
- **Core invariant:** Every agent/orchestrator/sub-agent must receive a **unified resume context** (`resume_intent=true`, `resume_id`, `raw_text`, `sections`, `evidence_map`) before running.

| 상태 | 에이전트 |
|------|---------|
| ✅ **구현 완료** (6개) | RouterAgent, IdentityChecker, AnalystAgent, ValidationAgent, PrivacyAgent, VisualAgent |
| ✅ **Phase 1 구현 완료** (3개) | DocumentClassifier, CoverageCalculator, GapFillerAgent |
| ✅ **오케스트레이터 통합 완료** | PipelineOrchestrator에 Phase 1 에이전트 통합 |

> **Phase 1 완료**: DocumentClassifier, CoverageCalculator, GapFillerAgent가 구현되어 PipelineOrchestrator에 통합되었습니다. Feature Flag로 점진적 롤아웃이 가능합니다.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pipeline Architecture](#2-pipeline-architecture)
3. [Agent Specifications](#3-agent-specifications)
4. [Service Layer](#4-service-layer)
5. [Error Handling & Recovery](#5-error-handling--recovery)
6. [Performance Optimization](#6-performance-optimization)
7. [Extension Points](#7-extension-points)
8. [Roadmap: Phase 1 & Phase 2 Enhancements](#8-roadmap-phase-1--phase-2-enhancements)

---

## 1. Overview

The Multi-Agent Pipeline is the core AI processing engine of SRCHD. It transforms raw resume files into structured, searchable, and privacy-protected candidate profiles through a series of specialized agents.

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Single Responsibility** | Each agent handles one specific task |
| **Fail-Fast** | Early rejection of invalid files saves credits |
| **Graceful Degradation** | Partial success is better than total failure |
| **Cost Optimization** | Minimize LLM calls, use cheap models first |
| **Auditability** | Every decision is logged with confidence scores |

### Pipeline Statistics

| Metric | Before Phase 1 | After Phase 1 (구현됨) |
|--------|------------------|-------------------------|
| Agent Count | 6 specialized agents | 9 agents (6 + 3 Phase 1) |
| LLM Calls | 3 (1 cheap + 2 primary) | 3~5 (field-level selective retry) |
| Average Processing Time | 8-15 seconds | P95 < 10s (fast queue), < 18s (slow queue) |
| Success Rate | ~95% | >98% pipeline success |
| Field Coverage@source-present | Not guaranteed | >99% (with GapFillerAgent) |
| Cost per Resume | ~$0.02-0.05 | <$0.06 with adaptive escalation |

> **구현 상태**: 현재 9개 에이전트가 구현되었습니다. Phase 1 에이전트(DocumentClassifier, CoverageCalculator, GapFillerAgent)는 **구현 완료, 오케스트레이터 통합 완료** 상태입니다. Feature Flag로 점진적 활성화가 가능합니다.

---

## 2. Pipeline Architecture

### 2.1 High-Level Flow

```
                                    MULTI-AGENT PIPELINE
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  INPUT                                                                           │
│  ┌──────────────┐                                                               │
│  │ Resume File  │  PDF, DOCX, HWP, HWPX                                         │
│  │ (bytes)      │  Max 50MB, Max 50 pages                                       │
│  └──────┬───────┘                                                               │
│         │                                                                        │
│         ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         STAGE 1: VALIDATION                               │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │  RouterAgent   │  • Magic Number detection                            │   │
│  │  │                │  • DRM/encryption check                              │   │
│  │  │  [Rule-based]  │  • Page count validation                             │   │
│  │  │  0 LLM calls   │  • File size validation                              │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │ ✓ Valid file                    ✗ Rejected                     │   │
│  │          │                                  └──► Return error (no credit) │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │  File Parser   │  • HWP: 3-stage fallback                             │   │
│  │  │                │  • PDF: pdfplumber                                    │   │
│  │  │  [Deterministic│  • DOCX: python-docx                                  │   │
│  │  │   extraction]  │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  └──────────┼────────────────────────────────────────────────────────────────┘   │
│             ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         STAGE 2: PRE-SCREENING                            │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │ Document       │  • Resume vs Non-resume classification   [Phase 1]   │   │
│  │  │ Classifier     │  • Rule-based + GPT-4o-mini fallback                 │   │
│  │  │  [구현 완료]    │  • Outputs: document_kind, doc_confidence            │   │
│  │  │  0-1 LLM calls │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │ ✓ Resume                     ✗ Non-resume                      │   │
│  │          │                               └──► Reject + refund             │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │IdentityChecker │  • Detect multi-person documents                     │   │
│  │  │                │  • Fast rejection for abuse prevention               │   │
│  │  │  [LLM: GPT-4o  │  • Uses cheap, fast model                            │   │
│  │  │   -mini]       │                                                       │   │
│  │  │  1 LLM call    │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │ ✓ Single person              ✗ Multiple people                 │   │
│  │          │                               └──► Reject (no credit charged)  │   │
│  │          ▼                                                                │   │
│  └──────────┼────────────────────────────────────────────────────────────────┘   │
│             │                                                                    │
│  ┌──────────┼────────────────────────────────────────────────────────────────┐   │
│  │          ▼          STAGE 3: AI ANALYSIS                                  │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │  AnalystAgent  │  • Structured information extraction                 │   │
│  │  │                │  • 2-way cross-check (OpenAI + Gemini)               │   │
│  │  │  [LLM: GPT-4o  │  • Field-level confidence scoring                    │   │
│  │  │   + Gemini]    │  • Warnings for low-confidence fields                │   │
│  │  │  2 LLM calls   │                                                       │   │
│  │  │  (parallel)    │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │ValidationAgent │  • Cross-reference filename with name                │   │
│  │  │                │  • Korean name pattern validation                    │   │
│  │  │  [Rule-based]  │  • Contact format verification                       │   │
│  │  │  0 LLM calls   │  • Career duration consistency                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │ Coverage       │  • Calculate field coverage score        [Phase 1]   │   │
│  │  │ Calculator     │  • Track missing_reason per field                    │   │
│  │  │  [구현 완료]    │  • Evidence extraction from raw text                 │   │
│  │  │  0 LLM calls   │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │ GapFiller      │  • Targeted re-extraction for empty fields [Phase 1] │   │
│  │  │ Agent          │  • Max 2 retries, 5s timeout                         │   │
│  │  │  [구현 완료]    │  • Skip if coverage >= 85%                           │   │
│  │  │  0-2 LLM calls │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  └──────────┼────────────────────────────────────────────────────────────────┘   │
│             │                                                                    │
│  ┌──────────┼────────────────────────────────────────────────────────────────┐   │
│  │          ▼          STAGE 4: PRIVACY & STORAGE                            │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │  PrivacyAgent  │  • PII pattern detection (regex)                     │   │
│  │  │                │  • AES-256-GCM encryption                            │   │
│  │  │  [Crypto]      │  • SHA-256 hashing (deduplication)                   │   │
│  │  │  0 LLM calls   │  • Masked display values                             │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │EmbeddingService│  • Semantic chunking (2000 tokens)                   │   │
│  │  │                │  • text-embedding-3-small (1536 dims)                │   │
│  │  │  [OpenAI API]  │  • 7 chunk types                                     │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │DatabaseService │  • Duplicate detection (4-tier)                      │   │
│  │  │                │  • Version stacking                                  │   │
│  │  │  [Supabase]    │  • Atomic transactions                               │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  │          ▼                                                                │   │
│  │  ┌────────────────┐                                                       │   │
│  │  │  VisualAgent   │  • Portfolio URL screenshot (optional)               │   │
│  │  │                │  • Face detection + blurring                         │   │
│  │  │  [Playwright]  │  • Profile photo extraction                          │   │
│  │  │  0 LLM calls   │                                                       │   │
│  │  └───────┬────────┘                                                       │   │
│  │          │                                                                │   │
│  └──────────┼────────────────────────────────────────────────────────────────┘   │
│             │                                                                    │
│             ▼                                                                    │
│  OUTPUT                                                                          │
│  ┌──────────────┐                                                               │
│  │  Candidate   │  Searchable, encrypted, versioned                             │
│  │  Record      │  With embeddings for vector search                            │
│  └──────────────┘                                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pipeline Orchestrator

The `PipelineOrchestrator` (`apps/worker/orchestrator/pipeline_orchestrator.py`) coordinates all agents:

### 2.3 Unified Resume Context Contract

To satisfy resume-only understanding and prevent cross-domain drift, all workers operate under a shared context contract.

```json
{
  "resume_intent": true,
  "document_type": "resume",
  "resume_id": "uuid",
  "raw_text": "...",
  "sections": ["profile", "career", "education", "skills", "projects"],
  "evidence_map": {"field": ["char_span", "page"]},
  "missing_policy": "allow_null_only_if_not_found_in_source"
}
```

**Rules:**
1. If `document_type != resume`, pipeline must stop before LLM-heavy stages.
2. All agent outputs must include field-level evidence references.
3. Orchestrator can only persist fields with `value + evidence` or explicit `missing_reason`.
4. Gap filling retries only empty fields and keeps the same `resume_id` context.

---

### 2.4 Pipeline Orchestrator Details

```python
class PipelineOrchestrator:
    """
    Orchestrates the multi-agent pipeline execution.

    Responsibilities:
    - Initialize and manage agent lifecycle
    - Handle stage transitions
    - Manage error recovery and rollback
    - Track processing metrics
    - Send webhook notifications
    """

    async def execute(self, job: ProcessingJob) -> PipelineResult:
        """
        Execute full pipeline for a single job.

        Stages:
        1. File validation (RouterAgent)
        2. Text extraction (Parser)
        3. Identity check (IdentityChecker)
        4. AI analysis (AnalystAgent)
        5. Post-validation (ValidationAgent)
        6. Privacy protection (PrivacyAgent)
        7. Vectorization (EmbeddingService)
        8. Storage (DatabaseService)
        9. Visual capture (VisualAgent) - optional

        Returns:
            PipelineResult with candidate_id and metrics
        """
```

---

## 3. Agent Specifications

### 3.1 RouterAgent

**Purpose**: Validate file integrity and determine processing route.

**Location**: `apps/worker/agents/router_agent.py`

```python
class RouterAgent:
    """
    First-line defense against invalid files.
    Uses deterministic rules (no LLM) for fast rejection.
    """

    MAGIC_NUMBERS = {
        b'\xD0\xCF\x11\xE0': 'ole',      # HWP, DOC, XLS
        b'PK\x03\x04': 'zip',             # HWPX, DOCX, XLSX
        b'%PDF': 'pdf',                   # PDF
    }

    def analyze(self, file_bytes: bytes, filename: str) -> RouterResult:
        """
        Validate file and determine type.

        Checks:
        1. Magic number matches extension
        2. Not encrypted/DRM protected
        3. Page count <= 50
        4. File size <= 50MB

        Returns:
            RouterResult(
                file_type: str,
                is_encrypted: bool,
                is_rejected: bool,
                rejection_reason: Optional[str],
                page_count: int
            )
        """
```

**Decision Matrix**:

| Condition | Action | Credit |
|-----------|--------|--------|
| Invalid magic number | Reject | No charge |
| DRM/encryption detected | Reject | No charge |
| Page count > 50 | Reject | No charge |
| File size > 50MB | Reject | No charge |
| Valid file | Continue | - |

---

### 3.2 IdentityChecker

**Purpose**: Detect multi-person documents to prevent abuse.

**Location**: `apps/worker/agents/identity_checker.py`

```python
class IdentityChecker:
    """
    Fast, cheap LLM check for document authenticity.
    Uses GPT-4o-mini for cost efficiency.
    """

    async def check(self, resume_text: str) -> IdentityCheckResult:
        """
        Detect if document contains multiple people's information.

        LLM Prompt Strategy:
        - Ask to count distinct individuals
        - Look for multiple names, contact info, career histories
        - Confidence threshold: reject if person_count > 1

        Returns:
            IdentityCheckResult(
                person_count: int,
                should_reject: bool,
                detected_names: List[str],
                confidence: float
            )
        """
```

**Cost Optimization**:
- Uses `gpt-4o-mini` (~10x cheaper than GPT-4o)
- Short prompt (~500 tokens)
- Runs before expensive analysis

---

### 3.3 AnalystAgent

**Purpose**: Extract structured information from resume text using LLM.

**Location**: `apps/worker/agents/analyst_agent.py`

```python
class AnalystAgent:
    """
    Core AI analysis using 2-way cross-check (OpenAI + Gemini).

    Design Evolution:
    - v1: 8 separate LLM calls (expensive, slow)
    - v2: Single unified schema, 2 parallel calls (current)
    - v3: Progressive calling based on confidence (planned)
    """

    async def analyze(
        self,
        resume_text: str,
        mode: AnalysisMode,
        filename: str
    ) -> AnalysisResult:
        """
        Extract structured candidate information.

        Extraction Schema:
        - Basic Info: name, birth_year, gender
        - Contact: phone, email, address
        - Career: companies, positions, duration, responsibilities
        - Skills: technical skills, tools, languages
        - Education: schools, degrees, majors
        - Projects: name, description, tech stack, role
        - Summary: AI-generated profile summary
        - Strengths: Key highlights

        Cross-Check Strategy:
        1. Call OpenAI GPT-4o (primary)
        2. Call Gemini 2.0 Flash (secondary) - parallel
        3. Compare critical fields (name, phone, email)
        4. Use highest confidence values
        5. Flag discrepancies for review

        Returns:
            AnalysisResult(
                data: Dict[str, Any],
                confidence_score: float,
                field_confidence: Dict[str, float],
                warnings: List[str],
                cross_check_passed: bool
            )
        """
```

**Cross-Check Algorithm**:

```
OpenAI Result ──┬──► Compare Critical Fields ──► Final Result
                │   (name, phone, email)
Gemini Result ──┘

Comparison Rules:
├── Both match → High confidence (0.9+)
├── Minor diff → Use OpenAI, flag for review
├── Major diff → Low confidence, requires review
└── One fails → Use successful result
```

**Structured Output Schema**:

```json
{
  "name": { "value": "string", "confidence": 0.95 },
  "birth_year": { "value": 1990, "confidence": 0.85 },
  "phone": { "value": "010-1234-5678", "confidence": 0.90 },
  "email": { "value": "user@example.com", "confidence": 0.92 },
  "careers": [
    {
      "company": "Example Corp",
      "position": "Senior Engineer",
      "start_date": "2020-01",
      "end_date": "2024-12",
      "responsibilities": ["..."]
    }
  ],
  "skills": ["Python", "TypeScript", "PostgreSQL"],
  "education": [...],
  "projects": [...],
  "summary": "AI-generated summary...",
  "strengths": ["...", "..."]
}
```

---

### 3.4 ValidationAgent

**Purpose**: Post-analysis verification using rule-based checks.

**Location**: `apps/worker/agents/validation_agent.py`

```python
class ValidationAgent:
    """
    Rule-based validation after LLM analysis.
    Catches common LLM errors without additional API calls.
    """

    def validate(
        self,
        analyzed_data: Dict,
        original_text: str,
        filename: str
    ) -> ValidationResult:
        """
        Verify analysis quality and consistency.

        Checks:
        1. Filename vs extracted name correlation
        2. Korean name pattern validation (2-4 syllables)
        3. Phone number format (010-XXXX-XXXX)
        4. Email format validation
        5. Career duration sanity (no future dates)
        6. Age vs career start consistency

        Adjustments:
        - Boost confidence if filename matches name
        - Lower confidence if format errors found
        - Add warnings for suspicious patterns

        Returns:
            ValidationResult(
                corrected_data: Dict,
                confidence_adjustments: Dict[str, float],
                warnings: List[str],
                is_valid: bool
            )
        """
```

**Validation Rules**:

| Rule | Check | Action |
|------|-------|--------|
| Name in filename | `filename.contains(extracted_name)` | +0.05 confidence |
| Korean name | `re.match(r'^[가-힣]{2,4}$', name)` | Pass/warn |
| Phone format | `re.match(r'^01[0-9]-\d{4}-\d{4}$')` | Normalize |
| Career dates | `end_date <= today` | Truncate if future |
| Age consistency | `career_start > birth_year + 18` | Warn if suspicious |

---

### 3.5 PrivacyAgent

**Purpose**: Protect PII through encryption and masking.

**Location**: `apps/worker/agents/privacy_agent.py`

```python
class PrivacyAgent:
    """
    Privacy protection through encryption, hashing, and masking.
    Implements AES-256-GCM with key versioning.
    """

    PII_PATTERNS = {
        'phone': r'01[0-9]-?\d{4}-?\d{4}',
        'email': r'[\w\.-]+@[\w\.-]+\.\w+',
        'ssn': r'\d{6}-[1-4]\d{6}',
        'passport': r'[A-Z]{1,2}\d{7,8}',
        'credit_card': r'\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}',
    }

    def process(self, analyzed_data: Dict) -> PrivacyResult:
        """
        Apply privacy protection to sensitive fields.

        Operations:
        1. Detect PII using regex patterns
        2. Encrypt: AES-256-GCM with random nonce
        3. Hash: SHA-256 for deduplication
        4. Mask: Generate display versions

        Encryption Format:
        [HEADER:4][VERSION:1][SALT:16][NONCE:12][CIPHERTEXT:N][TAG:16]

        Returns:
            PrivacyResult(
                encrypted_store: Dict[str, bytes],  # For database
                hash_store: Dict[str, str],         # For dedup
                masked_display: Dict[str, str],     # For UI
                pii_count: int
            )
        """
```

**Encryption Implementation**:

```python
def encrypt_field(self, plaintext: str, key_version: int = 0) -> bytes:
    """
    AES-256-GCM encryption with authenticated encryption.

    Process:
    1. Generate random 96-bit nonce
    2. Generate random 128-bit salt
    3. Derive key: PBKDF2(master_key, salt, iterations=100000)
    4. Encrypt: AES-256-GCM(derived_key, nonce, plaintext)
    5. Concatenate: header + version + salt + nonce + ciphertext + tag

    Security Properties:
    - Nonce ensures unique ciphertext per encryption
    - Salt prevents key reuse attacks
    - GCM provides authenticity verification
    - Key versioning enables rotation
    """
```

**Masking Rules**:

| Field | Input | Masked Output |
|-------|-------|---------------|
| Phone | `010-1234-5678` | `010-****-5678` |
| Email | `user@example.com` | `u***@example.com` |
| Address | `서울시 강남구 삼성동 123-45` | `서울시 강남구 ***` |

---

### 3.6 VisualAgent

**Purpose**: Capture portfolio screenshots and extract profile photos.

**Location**: `apps/worker/agents/visual_agent.py`

```python
class VisualAgent:
    """
    Visual content processing using Playwright and OpenCV.
    Non-blocking, optional stage.
    """

    async def capture_portfolio_thumbnail(
        self,
        url: str,
        timeout: int = 30000
    ) -> Optional[str]:
        """
        Screenshot portfolio URL and upload to storage.

        Process:
        1. Validate URL (no private IPs, no localhost)
        2. Launch headless Chromium via Playwright
        3. Navigate to URL with timeout
        4. Capture viewport screenshot (1280x800)
        5. Compress to JPEG (quality 80)
        6. Upload to Supabase Storage
        7. Return public URL

        Returns:
            Storage URL or None if failed
        """

    def extract_profile_photo(
        self,
        file_bytes: bytes,
        file_type: str
    ) -> Optional[str]:
        """
        Extract profile photo from resume file.

        Process:
        1. Extract embedded images from document
        2. Detect faces using OpenCV cascade
        3. Select largest face region
        4. Apply privacy blur to background faces
        5. Crop and resize to standard dimensions
        6. Upload to storage

        Returns:
            Storage URL or None if no photo found
        """
```

---

## 4. Service Layer

### 4.1 LLMManager

**Purpose**: Unified interface for multiple LLM providers.

**Location**: `apps/worker/services/llm_manager.py`

```python
class LLMManager:
    """
    Multi-provider LLM client with fallback support.

    Providers:
    - OpenAI (GPT-4o, GPT-4o-mini)
    - Gemini (2.0 Flash)
    - Claude (3.5 Sonnet) - Phase 2

    Features:
    - Lazy initialization
    - Timeout management (120s default)
    - Structured output support
    - JSON mode for Gemini
    - Error classification
    """

    async def call_openai(
        self,
        prompt: str,
        system_prompt: str,
        model: str = "gpt-4o",
        response_format: Optional[Type] = None
    ) -> LLMResponse:
        """Call OpenAI with structured output support."""

    async def call_gemini(
        self,
        prompt: str,
        system_prompt: str,
        model: str = "gemini-2.0-flash"
    ) -> LLMResponse:
        """Call Gemini with JSON mode."""

    async def call_parallel(
        self,
        prompt: str,
        system_prompt: str
    ) -> Tuple[LLMResponse, LLMResponse]:
        """Call OpenAI and Gemini in parallel for cross-check."""
```

### 4.2 EmbeddingService

**Purpose**: Generate vector embeddings for semantic search.

**Location**: `apps/worker/services/embedding_service.py`

```python
class EmbeddingService:
    """
    Semantic chunking and vector embedding generation.

    Chunking Strategy:
    - Chunk size: 2000 tokens
    - Overlap: 500 tokens (for context preservation)
    - Optimized for Korean text

    Chunk Types:
    1. summary - AI-generated profile summary
    2. career - Work experience sections
    3. project - Project descriptions
    4. skill - Skills and technologies
    5. education - Education history
    6. raw_full - Full document (fallback search)
    7. raw_section - Document sections
    """

    async def process_candidate(
        self,
        data: Dict,
        generate_embeddings: bool = True,
        raw_text: Optional[str] = None
    ) -> EmbeddingResult:
        """
        Generate chunks and embeddings for a candidate.

        Returns:
            EmbeddingResult(
                chunks: List[Chunk],  # With embeddings
                token_count: int,
                truncation_warnings: List[str]
            )
        """
```

### 4.3 DatabaseService

**Purpose**: Manage data persistence with duplicate detection.

**Location**: `apps/worker/services/database_service.py`

```python
class DatabaseService:
    """
    Supabase integration with duplicate detection and versioning.

    Features:
    - 4-tier duplicate detection
    - Version stacking
    - Compensating transactions
    - RLS bypass (service role)
    """

    async def save_candidate(
        self,
        candidate_data: Dict,
        chunks: List[Chunk],
        user_id: str
    ) -> SaveResult:
        """
        Save candidate with duplicate detection.

        Duplicate Detection Waterfall:
        1. phone_hash - Exact phone match
        2. email_hash - Exact email match
        3. name + phone_prefix - Name + first 4 digits
        4. name + birth_year - Name + birth year

        Version Handling:
        - If duplicate: Create new version, link to parent
        - If new: Create fresh record

        Returns:
            SaveResult(
                candidate_id: str,
                is_duplicate: bool,
                parent_id: Optional[str],
                version: int
            )
        """
```

**Duplicate Detection Flow**:

```
┌─────────────────┐
│  New Candidate  │
│  (phone, email, │
│   name, birth)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                 TIER 1: phone_hash                       │
│  SELECT * WHERE phone_hash = SHA256(phone_digits)       │
└────────────────────────┬────────────────────────────────┘
         │               │
         │ No match      │ Match found
         ▼               └──► Return existing_id (UPDATE)
┌─────────────────────────────────────────────────────────┐
│                 TIER 2: email_hash                       │
│  SELECT * WHERE email_hash = SHA256(email.lower())      │
└────────────────────────┬────────────────────────────────┘
         │               │
         │ No match      │ Match found
         ▼               └──► Return existing_id (UPDATE)
┌─────────────────────────────────────────────────────────┐
│              TIER 3: name + phone_prefix                 │
│  SELECT * WHERE name = $1 AND phone_prefix = $2         │
└────────────────────────┬────────────────────────────────┘
         │               │
         │ No match      │ Match found
         ▼               └──► Return existing_id (UPDATE)
┌─────────────────────────────────────────────────────────┐
│              TIER 4: name + birth_year                   │
│  SELECT * WHERE name = $1 AND birth_year = $2           │
└────────────────────────┬────────────────────────────────┘
         │               │
         │ No match      │ Match found
         ▼               └──► Return existing_id (UPDATE)
┌─────────────────┐
│  CREATE new     │
│  candidate      │
└─────────────────┘
```

---

## 5. Error Handling & Recovery

### 5.1 Exception Hierarchy

```python
# apps/worker/exceptions.py

class WorkerError(Exception):
    """Base exception for worker errors."""

class RetryableError(WorkerError):
    """Temporary failure, should retry."""
    # TIMEOUT, RATE_LIMIT, NETWORK_ERROR,
    # TEMPORARY_FAILURE, SERVICE_UNAVAILABLE

class PermanentError(WorkerError):
    """Permanent failure, should not retry."""
    # INVALID_FILE, UNSUPPORTED_TYPE, FILE_REJECTED,
    # MULTI_IDENTITY, ANALYSIS_FAILED, TEXT_TOO_SHORT,
    # PERMISSION_DENIED, BAD_REQUEST
```

### 5.2 Retry Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    RETRY DECISION TREE                   │
│                                                          │
│  Exception raised                                        │
│       │                                                  │
│       ▼                                                  │
│  ┌────────────────┐                                      │
│  │ RetryableError?│                                      │
│  └───────┬────────┘                                      │
│     Yes  │  No                                           │
│          │  │                                            │
│          │  ▼                                            │
│          │  ┌────────────────┐                           │
│          │  │PermanentError? │                           │
│          │  └───────┬────────┘                           │
│          │     Yes  │  No                                │
│          │          │  │                                 │
│          │          │  ▼                                 │
│          │          │  is_retryable(exc) → classify      │
│          │          │                                    │
│          ▼          ▼                                    │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │   RETRY     │  │   FAIL      │                       │
│  │ (exp backoff│  │ (DLQ/refund)│                       │
│  └─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘

Retry Configuration:
- Max retries: 2
- Backoff: Exponential (1s, 2s, 4s)
- Total max wait: ~7 seconds
```

### 5.3 Dead Letter Queue

```python
def on_job_failure(job, connection, type, value, traceback):
    """
    Handle permanent job failures.

    Actions:
    1. Extract job metadata
    2. Classify error type
    3. Store in Redis DLQ hash
    4. Update job status in database
    5. Refund credit if applicable
    6. Send alert for manual review
    """
```

### 5.4 Compensating Transactions

```
Pipeline Stage Failure Recovery:

Stage 1-3 (Validation, Identity):
└── No data written, no cleanup needed

Stage 4 (Analysis):
└── Delete partial candidate record if exists

Stage 5 (Privacy):
└── Delete candidate + encrypted fields

Stage 6 (Embedding):
└── Delete candidate + chunks

Stage 7 (Storage):
└── Delete candidate + chunks + storage files

Stage 8 (Visual):
└── Non-critical, ignore failure
```

---

## 6. Performance Optimization

### 6.1 LLM Call Optimization

**Before (v1)**: 8 sequential LLM calls
```
[Basic Info] → [Contact] → [Career] → [Skills] →
[Education] → [Projects] → [Summary] → [Strengths]
Total: ~16 seconds, ~$0.15/resume
```

**After (v2)**: 2 parallel LLM calls
```
[Unified Schema: OpenAI] ──┬──► [Cross-Check] → [Result]
[Unified Schema: Gemini] ──┘
Total: ~4 seconds, ~$0.03/resume
```

### 6.2 Parallel Processing

```python
async def analyze_with_cross_check(self, text: str):
    """Run OpenAI and Gemini in parallel."""
    openai_task = self.llm.call_openai(text, ANALYSIS_PROMPT)
    gemini_task = self.llm.call_gemini(text, ANALYSIS_PROMPT)

    # Wait for both to complete
    openai_result, gemini_result = await asyncio.gather(
        openai_task,
        gemini_task,
        return_exceptions=True
    )

    # Handle partial failures
    if isinstance(openai_result, Exception):
        return gemini_result  # Fallback
    if isinstance(gemini_result, Exception):
        return openai_result  # Fallback

    return self.merge_results(openai_result, gemini_result)
```

### 6.3 Connection Pooling

```python
# Singleton pattern for expensive clients
class ServiceFactory:
    _llm_manager: Optional[LLMManager] = None
    _db_service: Optional[DatabaseService] = None
    _embedding_service: Optional[EmbeddingService] = None

    @classmethod
    def get_llm_manager(cls) -> LLMManager:
        if cls._llm_manager is None:
            cls._llm_manager = LLMManager()
        return cls._llm_manager
```

---

## 7. Extension Points

### 7.1 Adding a New Agent

```python
# 1. Create agent file: apps/worker/agents/new_agent.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class NewAgentResult:
    """Result from NewAgent processing."""
    data: dict
    success: bool
    error: Optional[str] = None

class NewAgent:
    """
    Agent for [specific task].

    Position in pipeline: After [existing agent]
    LLM calls: 0 | 1 | N
    Dependencies: [list]
    """

    async def process(self, input_data: dict) -> NewAgentResult:
        """Process input and return result."""
        pass

# 2. Register in pipeline_orchestrator.py
# 3. Add to exception handling
# 4. Update tests
```

### 7.2 Adding a New LLM Provider

```python
# 1. Add to llm_manager.py

class LLMManager:
    async def call_new_provider(
        self,
        prompt: str,
        system_prompt: str,
        **kwargs
    ) -> LLMResponse:
        """Call new LLM provider."""
        client = self._get_or_create_client("new_provider")
        # Implementation...

# 2. Add configuration in config.py
# 3. Add environment variable
# 4. Update cross-check logic if needed
```

### 7.3 Adding New PII Patterns

```python
# In privacy_agent.py

PII_PATTERNS = {
    # Existing patterns...
    'new_pii_type': r'regex_pattern_here',
}

MASKING_RULES = {
    # Existing rules...
    'new_pii_type': lambda x: mask_function(x),
}
```

---

## 8. Pipeline Evolution Roadmap

> 📖 **상세 설계**: [`PHASE1_PHASE2_DETAILED_DESIGN.md`](PHASE1_PHASE2_DETAILED_DESIGN.md)

### 8.1 Phase 1: Field Completeness Enhancement ✅ 완료

**목표**: 필드 완성도 개선 (현재 78% → 목표 90%+)
**상태**: 구현 완료, 오케스트레이터 통합 완료

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENHANCED PIPELINE (Phase 1)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RouterAgent → Parser → [NEW] DocumentClassifier                │
│                              │                                  │
│                              ▼                                  │
│                         IdentityChecker                         │
│                              │                                  │
│                              ▼                                  │
│                        AnalystAgent                             │
│                              │                                  │
│                              ▼                                  │
│                      ValidationAgent                            │
│                              │                                  │
│                              ▼                                  │
│                   [NEW] CoverageCalculator ←── Field Weights    │
│                              │                                  │
│                              ▼                                  │
│                    [NEW] GapFillerAgent ←── Targeted Prompts    │
│                              │                                  │
│                              ▼                                  │
│                        PrivacyAgent                             │
│                              │                                  │
│                              ▼                                  │
│                    EmbeddingService → DatabaseService           │
│                              │                                  │
│                              ▼                                  │
│                        VisualAgent                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 1 신규 컴포넌트**:

| Component | 역할 | LLM 호출 |
|-----------|------|----------|
| **DocumentClassifier** | 이력서 vs 비이력서 분류 (규칙 + GPT-4o-mini) | 0~1 |
| **CoverageCalculator** | 필드 완성도 점수 산출 + missing_reason 추적 | 0 |
| **GapFillerAgent** | 빈 필드 타겟 재추출 (최대 2회 재시도) | 0~2 |

**구현 세부**:

1. **DocumentClassifier** (`apps/worker/agents/document_classifier.py`)
   - 규칙 기반 신호: 이름/연락처/경력 존재 여부
   - Fallback: GPT-4o-mini (신뢰도 < 0.7 시)
   - 출력: `document_kind`, `doc_confidence`, `non_resume_type`

2. **CoverageCalculator** (`apps/worker/agents/coverage_calculator.py`)
   - 필드 가중치: Critical (0.3) / Important (0.15) / Optional (0.05)
   - 출력: `coverage_score`, `evidence_backed_ratio`, `missing_reason`

3. **GapFillerAgent** (`apps/worker/agents/gap_filler_agent.py`)
   - 타겟 필드만 재추출 (phone, email, skills, careers 우선)
   - 타임아웃: 5초, 최대 재시도: 2회
   - 출력: 개선된 필드 데이터

**DB 스키마 변경**:

```sql
-- candidates 테이블 확장
ALTER TABLE candidates ADD COLUMN field_metadata JSONB DEFAULT '{}';
ALTER TABLE candidates ADD COLUMN document_kind document_kind_enum DEFAULT 'resume';
ALTER TABLE candidates ADD COLUMN doc_confidence DECIMAL(3,2);

-- ENUM 타입
CREATE TYPE document_kind_enum AS ENUM ('resume', 'non_resume', 'uncertain');
CREATE TYPE missing_reason_enum AS ENUM (
  'not_found_in_source', 'parser_error', 'llm_extraction_failed',
  'low_confidence', 'schema_mismatch', 'timeout'
);
```

### 8.2 Phase 2: Advanced Pipeline Features (조건부)

> Phase 1 완료 후, 데이터 기반 의사결정으로 진행 여부 결정

**Phase 2A: retry_gapfill 큐**
```
GapFillerAgent 실패 시 → retry_gapfill 큐로 이동
                       → 24시간 후 배치 재처리
                       → 인간 검토 연계 가능
```

**Phase 2B: KPI 대시보드**
- 필드별 완성도 트렌드
- 에이전트별 성공/실패율
- 파일 타입별 분석 통계

**Phase 2C: 도메인 병렬화 POC** (신중히 검토)
```
현재: Sequential
  AnalystAgent → [Basic] → [Contact] → [Career] → [Skills] → ...

제안: Domain Parallelization (조건부)
                    ┌─► [Career+Skills Agent]
  AnalystAgent ─────┤
                    └─► [Basic+Contact Agent]

전제조건:
- 병렬화 이점 > 복잡성 비용 증명 필요
- 현재 2-Way Cross-Check로 충분히 빠름 (~4초)
- LLM 비용 증가 우려
```

### 8.3 Deferred (Phase 3+)

다음 항목들은 현재 시점에서 **명시적으로 제외**:

| 제외 항목 | 제외 근거 |
|-----------|-----------|
| Separate Orchestrators (Latency/Completeness) | 단일 오케스트레이터로 충분, 복잡성 대비 이점 불명확 |
| Evidence Agent (별도 에이전트) | ValidationAgent에 evidence 필드 추가로 대체 |
| Conflict Resolver Agent | 2-Way Cross-Check merge 로직에서 처리 |
| Normalizer Agent | PrivacyAgent의 후처리 단계에서 처리 |
| 3-Way Cross-Check (Claude 포함) | Phase 2 이후 비용/정확도 분석 후 결정 |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-02-14 | Phase 1 구현 완료: DocumentClassifier, CoverageCalculator, GapFillerAgent. PipelineOrchestrator 통합 완료. |
| 1.1.0 | 2026-02-14 | Phase 1/2 로드맵 추가, DocumentClassifier/CoverageCalculator/GapFillerAgent 설계 |
| 1.0.0 | 2026-02-14 | Initial multi-agent pipeline documentation |
