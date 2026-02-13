# SRCHD Architecture Documentation

> **Last Updated**: 2026-02-14
> **Version**: 1.0.0
> **Status**: Production (Closed Beta)

## Overview

This directory contains comprehensive architecture documentation for **srchd (Recruitment Asset Intelligence)** — an AI-powered resume analysis and candidate search SaaS platform for Korean freelance headhunters.

## Documentation Index

| Document | Description |
|----------|-------------|
| [System Architecture](./SYSTEM_ARCHITECTURE.md) | High-level system design, component relationships, and deployment topology |
| [Multi-Agent Pipeline](./MULTI_AGENT_PIPELINE.md) | Deep dive into the AI processing pipeline with 6 specialized agents |
| [Data Architecture](./DATA_ARCHITECTURE.md) | Database schema, data flows, encryption strategy, and RLS policies |
| [API Architecture](./API_ARCHITECTURE.md) | RESTful API design, authentication, rate limiting, and webhook integrations |
| [Security Architecture](./SECURITY_ARCHITECTURE.md) | Encryption, authentication, authorization, and compliance considerations |

## Quick Reference

### Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend    │ Next.js 16 + React 19 + TypeScript 5.9      │
│  UI          │ Tailwind CSS 4 + shadcn/ui + Radix UI       │
│  State       │ Zustand + TanStack React Query + SWR        │
├─────────────────────────────────────────────────────────────┤
│  Backend     │ Next.js API Routes (Vercel Serverless)      │
│  Worker      │ Python 3.11 + FastAPI (Railway)             │
│  Queue       │ Redis + RQ (Upstash)                        │
├─────────────────────────────────────────────────────────────┤
│  Database    │ Supabase PostgreSQL 15 + pgvector           │
│  Storage     │ Supabase Storage (S3-compatible)            │
├─────────────────────────────────────────────────────────────┤
│  AI Models   │ GPT-4o + Gemini 2.0 Flash + Claude 3.5      │
│  Embeddings  │ text-embedding-3-small (1536 dims)          │
├─────────────────────────────────────────────────────────────┤
│  Payments    │ Paddle (Sandbox)                            │
│  Monitoring  │ Sentry                                      │
│  Region      │ Seoul (ICN)                                 │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Principles

1. **Privacy-First**: AES-256-GCM encryption for all PII, SHA-256 hashing for deduplication
2. **Zero Trust**: RLS on all tables, CSRF protection, rate limiting at multiple layers
3. **Resilience**: Dead Letter Queue, compensating transactions, graceful degradation
4. **Performance**: Hybrid search (RDB + Vector), parallel LLM calls, connection pooling
5. **Observability**: Structured logging, Sentry integration, webhook-based notifications

### Core Data Flows

```
Upload Flow:
  User → API → Validation → Storage → Redis Queue → Worker → AI Analysis → Database

Search Flow:
  User → API → Cache Check → Synonym Expansion → RDB Filter → Vector Search → Results

AI Pipeline:
  File → Router → Parser → Identity Check → Analysis → Privacy → Embedding → Storage
```

## Architecture Decision Records (ADRs)

Key architectural decisions documented in this codebase:

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | Multi-Agent Pipeline over Monolithic LLM | Modularity, testability, cost optimization |
| ADR-002 | 2-Way Cross-Check (GPT + Gemini) | Balance accuracy vs. cost (Claude in Phase 2) |
| ADR-003 | AES-256-GCM with Key Versioning | Support key rotation without data migration |
| ADR-004 | Hybrid Search (RDB + Vector) | Short queries use RDB, long queries use vectors |
| ADR-005 | Redis RQ over SQS/Pub-Sub | Simplicity for Korean market, Railway deployment |
| ADR-006 | Version Stacking for Duplicates | Maintain audit trail, support rollback |

## Diagrams

All diagrams in this documentation use:
- **Mermaid** for sequence diagrams and flowcharts
- **ASCII art** for quick inline visualizations
- **PlantUML** syntax (optional) for complex UML diagrams

## Contributing

When updating architecture documentation:

1. Follow the existing document structure
2. Update the version number and date in each file
3. Add entries to the changelog section
4. Update this README if adding new documents
5. Keep diagrams in sync with code changes

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) — Project context for AI assistants
- [PRD v0.3](../rai_prd_v0.3.md) — Product requirements document
- [Development Guide](../rai_development_guide.md) — Detailed development guidelines
- [OpenAPI Spec](../../openapi.yaml) — API specification
