# SRCHD Multi-Agent 고도화 요약 v2.0

## Quick Reference

### 목표 KPIs

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| 평균 처리 시간 | 8-12초 | 3-5초 | 60% 감소 |
| 필드 추출 정확도 | 85% | 95% | +10%p |
| 환각 발생률 | 8% | 2% | 75% 감소 |
| LLM 비용/건 | $0.05 | $0.03 | 40% 절감 |
| **Agent 협업률** | 0% | 80% | **신규** |

---

## 핵심 아키텍처 변경

### Before (현재)
```
AnalystAgent → GPT-4o + Gemini (병렬) → 결과 병합
                 │
                 └─ Agent 간 컨텍스트 공유 불가
                 └─ LLM 호출이 독립적 (협업 불가)
```

### After (목표 v2.0)
```
┌─────────────────────────────────────────────────────────────┐
│                  CollaborativeOrchestrator                  │
│                    복잡도 분석 → 전략 선택                    │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
      SIMPLE              PARALLEL          COLLABORATIVE
      (기존)           (Sub-Agent         (Sub-Agent +
                       병렬 추출)         Quality Agents +
                                         실시간 협업)
                              │
    ┌─────────────────────────┴─────────────────────────┐
    │           🔄 Agent Collaboration Layer            │
    │  ┌─────────────┬─────────────┬─────────────┐     │
    │  │SharedContext│Communication│ Feedback    │     │
    │  │  (공유DB)   │    Bus      │   Loop      │     │
    │  └─────────────┴─────────────┴─────────────┘     │
    └───────────────────────────────────────────────────┘
```

---

## 새로운 Agent 구조 (v2.0)

```
agents/
├── orchestrator/
│   └── collaborative_orchestrator.py  # 협업 조율 (v2.0)
├── extractors/                         # 섹션별 추출
│   ├── base_extractor.py               # 협업 지원 기본 클래스
│   ├── profile_extractor.py
│   ├── career_extractor.py
│   ├── education_extractor.py
│   ├── skill_extractor.py
│   └── project_extractor.py
├── quality/                            # 품질 검증
│   ├── reflection_agent.py
│   ├── hallucination_detector.py
│   └── consensus_agent.py
└── collaboration/                      # 🆕 협업 인프라 (v2.0)
    ├── shared_context.py               # 실시간 컨텍스트 공유
    ├── communication_bus.py            # Agent 간 메시징
    ├── feedback_loop.py                # 재추출 메커니즘
    └── dependency_tracker.py           # 실행 순서 최적화
```

---

## v2.0 핵심: Agent 협업 인프라

### 1. SharedExtractionContext (실시간 컨텍스트 공유)
```python
# 모든 Agent가 실시간으로 데이터 공유
context = SharedExtractionContext()

# Agent A: 데이터 발행
await context.publish("career", "company_name", "삼성전자", confidence=0.95)

# Agent B: 데이터 조회 (실시간)
company = context.get("company_name")  # → "삼성전자"

# Agent C: 데이터 대기 (비동기)
email = await context.wait_for("email", timeout_ms=5000)
```

### 2. AgentCommunicationBus (Agent 간 메시징)
```python
bus = AgentCommunicationBus()

# 재검토 요청
await bus.request_recheck(
    from_agent="skill",
    to_agent="career",
    field="career_entries[0].skills_used",
    reason="Java mentioned but not in career"
)

# 질의 응답
response = await bus.query(
    from_agent="career",
    to_agent="profile",
    question="What is the candidate's current title?"
)
```

### 3. FeedbackLoopManager (재추출 메커니즘)
```python
feedback_manager = FeedbackLoopManager(extractors, max_iterations=3)

# 저신뢰도 필드 자동 재추출
final_result = await feedback_manager.run_feedback_loop(
    context=context,
    bus=bus,
    confidence_threshold=0.8
)
# → 신뢰도 < 0.8인 필드는 다른 Agent 정보 참조하여 재추출
```

### 4. DependencyTracker (실행 순서 최적화)
```python
tracker = DependencyTracker()

# 의존성 정의
tracker.add_dependency("career", "profile")      # career는 profile 이후
tracker.add_dependency("skill", "career")        # skill은 career 이후

# 최적 실행 순서 계산
order = tracker.get_execution_order()
# → [["profile"], ["career", "education"], ["skill", "project"]]
```

---

## Feature Flags (v2.0)

```python
# config.py에 추가될 설정
USE_PARALLEL_EXTRACTION: bool = False     # 섹션별 병렬 추출
USE_SELF_REFLECTION: bool = False         # Self-Reflection Agent
USE_HALLUCINATION_DETECTION: bool = True  # 환각 감지 (기존)
USE_CONSENSUS_VOTING: bool = False        # 3-way 합의 투표
USE_DYNAMIC_MODEL_SELECTION: bool = False # 동적 모델 선택
USE_PROMPT_CACHE: bool = False            # 결과 캐싱

# 🆕 v2.0 협업 Feature Flags
USE_SHARED_CONTEXT: bool = False          # 실시간 컨텍스트 공유
USE_AGENT_COMMUNICATION: bool = False     # Agent 간 메시징
USE_FEEDBACK_LOOP: bool = False           # 재추출 메커니즘
USE_COLLABORATIVE_STRATEGY: bool = False  # COLLABORATIVE 전략 활성화
```

---

## 구현 일정 (v2.0)

| Phase | 기간 | 주요 작업 |
|-------|------|-----------|
| **Phase 1** | 2주 | 기반 구축 (Base Extractor, Profile/Career Extractor) |
| **Phase 2** | 3주 | 품질 강화 (Self-Reflection, Hallucination, Consensus) |
| **Phase 3** | 3주 | 통합 및 최적화 (Orchestrator, 캐싱) |
| **Phase 4** | 2주 | 🆕 협업 인프라 (SharedContext, Bus, FeedbackLoop) |
| **배포** | 2주 | 테스트, Canary, 전체 배포 |

**총 기간: 12주 (약 3개월)** ← v1.0 대비 +2주

---

## v1.0 vs v2.0 비교

| 항목 | v1.0 | v2.0 |
|------|------|------|
| Agent 간 컨텍스트 공유 | ❌ 불가 | ✅ SharedContext |
| Agent 간 실시간 통신 | ❌ 불가 | ✅ CommunicationBus |
| 저신뢰도 필드 재추출 | ❌ 불가 | ✅ FeedbackLoop |
| 의존성 기반 실행 | ❌ 단순 병렬 | ✅ DependencyTracker |
| 협업 메트릭 수집 | ❌ 없음 | ✅ CollaborationMetrics |
| 실행 전략 | SIMPLE, PARALLEL | + COLLABORATIVE |

---

## 핵심 개선 포인트

### 1. 동적 모델 선택
```python
# 문서 복잡도에 따른 모델 자동 선택
SIMPLE (2페이지 이하):   claude-3-5-haiku (빠르고 저렴)
MEDIUM (5페이지 이하):   claude-sonnet-4 (균형)
COMPLEX (그 외):         claude-opus-4-5 (최고 품질)
```

### 2. 병렬 Sub-Agent 추출 + 협업
```python
# Phase 1: 독립 Agent 병렬 실행
phase1_agents = ["profile", "education"]
phase1_results = await asyncio.gather(*[
    extractor.extract(section, context, bus)
    for extractor in phase1_agents
])

# Phase 2: 의존 Agent 실행 (Phase 1 결과 참조)
phase2_agents = ["career", "skill", "project"]
phase2_results = await asyncio.gather(*[
    extractor.extract(section, context, bus)  # context에서 Phase 1 결과 조회
    for extractor in phase2_agents
])
```

### 3. Self-Reflection + Feedback Loop
```python
# 1차 분석 결과 자체 검토
reflection_result = await reflection_agent.reflect(
    analysis_result,
    original_text,
)

# 저신뢰도 필드 재추출 (다른 Agent 컨텍스트 활용)
if reflection_result.low_confidence_fields:
    await feedback_manager.reextract_with_context(
        fields=reflection_result.low_confidence_fields,
        shared_context=context
    )
```

### 4. Consensus Voting (협업 강화)
```python
# 3-way 합의 (GPT + Gemini + Claude)
# 각 LLM이 SharedContext 참조하여 일관성 향상
consensus = await consensus_agent.vote(
    gpt_result,
    gemini_result,
    claude_result,
    shared_context=context  # 🆕 컨텍스트 참조
)
```

---

## 리스크 완화 (v2.0)

| 리스크 | 완화 전략 |
|--------|-----------|
| LLM 비용 증가 | 동적 모델 선택 + 캐싱 |
| 처리 시간 증가 | 병렬 처리 + 타임아웃 |
| 품질 저하 | Self-Reflection + Hallucination Detection |
| API 장애 | 다중 Provider Fallback |
| **협업 오버헤드** | DependencyTracker 최적화 + 타임아웃 |
| **메시지 폭주** | Rate Limiting + 우선순위 큐 |

---

## 시작하기 (v2.0)

### 1. Phase 1 개발 시작
```bash
# 새 브랜치 생성
git checkout -b feature/multi-agent-phase1

# 필요한 디렉토리 생성
mkdir -p apps/worker/agents/orchestrator
mkdir -p apps/worker/agents/extractors
mkdir -p apps/worker/agents/quality
mkdir -p apps/worker/agents/collaboration  # 🆕
mkdir -p apps/worker/prompts
mkdir -p apps/worker/cache
```

### 2. 기본 Feature Flag 설정
```python
# config.py에 추가
USE_PARALLEL_EXTRACTION: bool = Field(
    default=False,
    description="섹션별 병렬 추출 활성화"
)
USE_SHARED_CONTEXT: bool = Field(
    default=False,
    description="Agent 간 실시간 컨텍스트 공유"
)
```

### 3. 테스트 실행
```bash
pytest tests/agents/extractors/ -v
pytest tests/agents/quality/ -v
pytest tests/agents/collaboration/ -v  # 🆕
pytest tests/agents/test_orchestrator.py -v
```

---

## 참고 문서

- 상세 구현 계획: [MULTI_AGENT_IMPLEMENTATION_PLAN.md](./MULTI_AGENT_IMPLEMENTATION_PLAN.md)
- 기존 코드베이스 분석: [분석 결과 참조]

---

**작성일**: 2026-02-13
**버전**: 2.0
**변경사항**: Agent 협업 인프라 추가 (SharedContext, CommunicationBus, FeedbackLoop, DependencyTracker)
