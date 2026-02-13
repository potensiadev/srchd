# SRCHD Multi-Agent 고도화 요약 v3.0

## Quick Reference

### 목표 KPIs

| 지표 | 현재 | V2 목표 | V3 목표 | 최종 개선율 |
|------|------|---------|---------|-------------|
| 추출 정확도 | 85% | 92% | **97%** | +12%p |
| 환각 발생률 | 8% | 5% | **1%** | -87% |
| 평균 처리 시간 | 12초 | 8초 | **4초** | -67% |
| LLM 비용/건 | $0.05 | $0.03 | **$0.02** | -60% |
| 병렬 처리량 | 10건/분 | 25건/분 | **50건/분** | +400% |

---

## 15개 핵심 과제 현황

| # | 과제 | 카테고리 | 버전 | 상태 |
|---|------|---------|------|------|
| 1 | Collaborative Orchestrator | 인프라 | V2 | ✅ |
| 2 | Shared Context | 인프라 | V2 | ✅ |
| 3 | Communication Bus | 인프라 | V2 | ✅ |
| 4 | Feedback Loop | 인프라 | V2 | ✅ |
| 5 | Base Extractor | 추출기 | V2 | ✅ |
| 6 | **CoT 프롬프팅** | 프롬프트 | V3 | ✅ |
| 7 | **Few-Shot Learning** | 프롬프트 | V3 | ✅ |
| 8 | **strict JSON Schema** | 프롬프트 | V3 | ✅ |
| 9 | **동적 컨텍스트 압축** | 성능 | V3 | ✅ |
| 10 | **자동 복구** | 안정성 | V3 | ✅ |
| 11 | **병렬 처리** | 성능 | V3 | ✅ |
| 12 | **결과 캐싱** | 성능 | V3 | ✅ |
| 13 | **동적 모델 선택** | 최적화 | V3 | ✅ |
| 14 | **환각 감지** | 품질 | V3 | ✅ |
| 15 | **교차 검증** | 품질 | V3 | ✅ |

---

## 핵심 아키텍처 (v3.0)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Collaborative Orchestrator                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Shared    │  │Communication│  │  Feedback   │  │  Dynamic    │     │
│  │   Context   │◄─┤    Bus      │◄─┤    Loop     │◄─┤   Model     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  │  Selector   │     │
│                                                      └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│    Profile    │           │    Career     │           │   Education   │
│   Extractor   │           │   Extractor   │           │   Extractor   │
│  + CoT + Few  │           │  + CoT + Few  │           │  + CoT + Few  │
└───────────────┘           └───────────────┘           └───────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    ▼
              ┌─────────────────────────────────────────┐
              │        Quality Assurance Layer          │
              │  ┌──────────┐  ┌──────────┐  ┌────────┐│
              │  │Hallucin. │  │  Cross   │  │ Self-  ││
              │  │ Detector │  │Validator │  │Reflect ││
              │  └──────────┘  └──────────┘  └────────┘│
              └─────────────────────────────────────────┘
                                    │
              ┌─────────────────────────────────────────┐
              │        Performance Optimization         │
              │  ┌──────────┐  ┌──────────┐  ┌────────┐│
              │  │ Context  │  │  Error   │  │ Result ││
              │  │Compress  │  │ Recovery │  │ Cache  ││
              │  └──────────┘  └──────────┘  └────────┘│
              └─────────────────────────────────────────┘
```

---

## Agent 구조 (v3.0)

```
agents/
├── orchestrator/
│   ├── collaborative_orchestrator.py  # 협업 조율
│   ├── model_selector.py              # 🆕 동적 모델 선택
│   └── batch_processor.py             # 🆕 병렬 이력서 처리
├── extractors/
│   ├── base_extractor.py              # 협업 지원 기본 클래스
│   ├── profile_extractor.py           # + CoT + Few-shot
│   ├── career_extractor.py            # + CoT + Few-shot
│   ├── education_extractor.py         # + CoT + Few-shot
│   ├── skill_extractor.py             # + CoT + Few-shot
│   └── project_extractor.py           # + CoT + Few-shot
├── quality/
│   ├── reflection_agent.py            # Self-Reflection
│   ├── hallucination_detector.py      # 🆕 환각 감지 (상세 구현)
│   ├── cross_validator.py             # 🆕 교차 검증 (상세 구현)
│   └── consensus_agent.py             # 다중 LLM 합의
├── collaboration/
│   ├── shared_context.py              # 실시간 컨텍스트 공유
│   ├── communication_bus.py           # Agent 간 메시징
│   ├── feedback_loop.py               # 재추출 메커니즘
│   └── dependency_tracker.py          # 실행 순서 최적화
├── prompts/                           # 🆕 프롬프트 라이브러리
│   ├── cot_prompts.py                 # Chain-of-Thought 프롬프트
│   ├── few_shot_examples.py           # Few-shot 예시 (25개)
│   └── strict_schemas.py              # strict: true JSON 스키마
├── services/                          # 🆕 서비스 레이어
│   ├── context_compressor.py          # 동적 컨텍스트 압축
│   ├── error_recovery.py              # 자동 복구 서비스
│   └── result_cache.py                # 결과 캐싱
└── cache/
    └── sub_agent_cache.py             # Sub-Agent 결과 캐싱
```

---

## V3 신규 기능 하이라이트

### 1. Chain-of-Thought (CoT) 프롬프팅
```python
# Two-Phase CoT Pattern
COT_TRIGGER = """
Let's think step by step before extracting the information.
"""

# reasoning 필드 포함 JSON Schema
{
  "reasoning": "Step 1: 회사명 '삼성전자' 발견...",
  "data": { "careers": [...] }
}
```

### 2. Few-Shot Learning (25개 예시)
```python
# 5개 Extractor × 5개 케이스 = 25개
PROFILE_FEW_SHOT_EXAMPLES = [
    # 1. 표준 한글, 2. 영문, 3. 비정형, 4. 부분 정보, 5. 파일명 추론
]
CAREER_FEW_SHOT_EXAMPLES = [...]
EDUCATION_FEW_SHOT_EXAMPLES = [...]
SKILL_FEW_SHOT_EXAMPLES = [...]
PROJECT_FEW_SHOT_EXAMPLES = [...]
```

### 3. strict: True JSON Schema
```python
{
    "strict": True,
    "additionalProperties": False,
    "required": ["reasoning", "data"]
}
```

### 4. 동적 컨텍스트 압축
```python
compressor = ContextCompressor(max_tokens=8000)
compressed = await compressor.compress(
    text=long_resume,
    priority_sections=["profile", "career"]
)
# → 우선순위 기반 압축, 중요 정보 보존
```

### 5. 자동 복구 서비스
```python
recovery = ErrorRecoveryService()
result = await recovery.recover(
    error=TimeoutError(),
    original_provider=LLMProvider.OPENAI,
    strategies=[RETRY_SAME, FALLBACK_PROVIDER, RULE_BASED]
)
# → Exponential Backoff + Provider Fallback
```

### 6. 병렬 이력서 처리
```python
processor = BatchProcessor(max_concurrent=10)
results = await processor.process_batch(
    resumes=[resume1, resume2, ...],  # 100개 이력서
    progress_callback=update_progress
)
# → Semaphore 기반 동시성 제어
```

### 7. 결과 캐싱
```python
cache = SubAgentCache(
    memory_cache=LRUCache(max_size=1000),
    redis_cache=RedisCache(ttl=86400)
)
# → 다층 캐시: 메모리 → Redis
```

### 8. 동적 모델 선택
```python
selector = ModelSelector()
model = selector.select(
    complexity="COMPLEX",  # 10페이지, 15개 경력
    optimize_for="quality"  # 또는 "cost", "speed"
)
# → claude-opus-4-5-20251101
```

### 9. 환각 감지 Agent
```python
detector = HallucinationDetector()
report = await detector.detect(
    extracted={"company": "애플"},
    original_text="삼성전자 5년 근무"
)
# → HallucinationType.FABRICATION, confidence=0.95
```

### 10. 필드 간 교차 검증
```python
validator = CrossValidator()
result = validator.validate({
    "exp_years": 10,
    "careers": [{"start_date": "2020-01"}]  # 실제 4년
})
# → ValidationIssue: exp_years 불일치, 자동 수정 제안
```

---

## Feature Flags (v3.0)

```python
# V2 Feature Flags
USE_PARALLEL_EXTRACTION: bool = False     # 섹션별 병렬 추출
USE_SHARED_CONTEXT: bool = False          # 실시간 컨텍스트 공유
USE_COMMUNICATION_BUS: bool = False       # Agent 간 메시징
USE_FEEDBACK_LOOP: bool = False           # 재추출 메커니즘
USE_SELF_REFLECTION: bool = False         # Self-Reflection Agent
USE_CONSENSUS_VOTING: bool = False        # 3-way 합의 투표

# 🆕 V3 Feature Flags
USE_COT_PROMPTING: bool = False           # Chain-of-Thought 프롬프팅
USE_FEW_SHOT_EXAMPLES: bool = True        # Few-shot 예시 사용
USE_STRICT_SCHEMA: bool = True            # strict: true 스키마
USE_CONTEXT_COMPRESSION: bool = False     # 동적 컨텍스트 압축
USE_ERROR_RECOVERY: bool = True           # 자동 복구
USE_BATCH_PROCESSING: bool = False        # 병렬 이력서 처리
USE_RESULT_CACHE: bool = False            # 결과 캐싱
USE_DYNAMIC_MODEL_SELECTION: bool = False # 동적 모델 선택
USE_HALLUCINATION_DETECTION: bool = True  # 환각 감지
USE_CROSS_VALIDATION: bool = True         # 교차 검증
```

---

## 구현 로드맵 (v3.0)

| Phase | 기간 | 주요 작업 | V2/V3 |
|-------|------|-----------|-------|
| **Phase 1** | Week 1-2 | 기반 구축 (Base Extractor, Shared Context) | V2 |
| **Phase 2** | Week 3-4 | 프롬프트 고도화 (CoT, Few-shot, strict) | V3 |
| **Phase 3** | Week 5-6 | 품질 보증 (환각 감지, 교차 검증) | V3 |
| **Phase 4** | Week 7-8 | 성능 최적화 (압축, 복구, 캐싱, 병렬) | V3 |
| **배포** | Week 9-10 | 테스트, Canary, 전체 배포 | - |

**총 기간: 10주 (약 2.5개월)**

---

## v2.0 vs v3.0 비교

| 항목 | v2.0 | v3.0 |
|------|------|------|
| Agent 간 컨텍스트 공유 | ✅ SharedContext | ✅ 유지 |
| Agent 간 실시간 통신 | ✅ CommunicationBus | ✅ 유지 |
| 저신뢰도 필드 재추출 | ✅ FeedbackLoop | ✅ 유지 |
| 의존성 기반 실행 | ✅ DependencyTracker | ✅ 유지 |
| CoT 프롬프팅 | ❌ 미구현 | ✅ Two-Phase CoT |
| Few-Shot Learning | 부분 (2개) | ✅ 25개 예시 |
| strict JSON Schema | ❌ strict: false | ✅ strict: true |
| 동적 컨텍스트 압축 | ❌ 미구현 | ✅ 우선순위 기반 |
| 자동 복구 | ❌ 미구현 | ✅ Exponential Backoff |
| 병렬 이력서 처리 | ❌ 순차 처리 | ✅ Semaphore 기반 |
| 결과 캐싱 | ❌ 미구현 | ✅ 다층 캐시 |
| 동적 모델 선택 | 부분 (Flag만) | ✅ 복잡도 기반 |
| 환각 감지 | 부분 (Flag만) | ✅ 규칙+LLM 검증 |
| 교차 검증 | ❌ 미구현 | ✅ 6개 기본 규칙 |

---

## 리스크 완화 (v3.0)

| 리스크 | 심각도 | 완화 전략 |
|--------|--------|-----------|
| LLM 비용 증가 | 중간 | 동적 모델 선택 + 캐싱 |
| CoT 토큰 증가 | 중간 | 복잡도 기반 활성화 |
| strict 스키마 마이그레이션 | 높음 | 단계적 롤아웃 |
| 병렬 처리 메모리 | 중간 | Semaphore 제한 (10) |
| 환각 감지 비용 | 중간 | 샘플링 방식 |

---

## 시작하기 (v3.0)

### 1. 개발 환경 설정
```bash
# 새 브랜치 생성
git checkout -b feature/multi-agent-v3

# 필요한 디렉토리 생성
mkdir -p apps/worker/agents/{orchestrator,extractors,quality,collaboration}
mkdir -p apps/worker/{prompts,services,cache}
```

### 2. 의존성 설치
```bash
pip install tiktoken redis tenacity
```

### 3. Feature Flags 설정
```python
# config.py
USE_COT_PROMPTING = True
USE_FEW_SHOT_EXAMPLES = True
USE_STRICT_SCHEMA = True
USE_ERROR_RECOVERY = True
```

### 4. 테스트 실행
```bash
pytest tests/agents/ -v
pytest tests/services/ -v
pytest tests/prompts/ -v
```

---

## 참고 문서

- **상세 구현 계획**: [MULTI_AGENT_IMPLEMENTATION_PLAN.md](./MULTI_AGENT_IMPLEMENTATION_PLAN.md)
- **버전 히스토리**: v1.0 → v2.0 (협업) → v3.0 (고도화)

---

**작성일**: 2026-02-13
**버전**: 3.0
**변경사항**: V3 10개 항목 통합 (CoT, Few-shot, strict 스키마, 압축, 복구, 병렬처리, 캐싱, 동적 모델, 환각 감지, 교차 검증)
