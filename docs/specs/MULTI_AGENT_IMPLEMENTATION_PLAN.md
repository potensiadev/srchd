# SRCHD Multi-Agent 고도화 구현 계획서

## 문서 정보
- **작성일**: 2026-02-13
- **버전**: 2.0 (Agent 협업 기능 추가)
- **대상 시스템**: SRCHD RAI Worker (apps/worker)
- **목표**: 실리콘밸리 수준의 고성능 고정확도 이력서 분석 시스템 구축

---

## 1. Executive Summary

### 1.1 현재 상태 분석

현재 SRCHD Worker는 이미 Multi-Agent 아키텍처를 갖추고 있으나, 다음과 같은 **핵심 문제점**이 존재합니다:

| 구분 | 현재 상태 | 문제점 | 목표 상태 |
|------|-----------|--------|-----------|
| LLM 호출 방식 | 2-way (GPT+Gemini) 또는 3-way (+Claude) | 독립적 호출, 협업 불가 | 동적 Orchestrator + 협업 Sub-Agent |
| 컨텍스트 공유 | 없음 | **Agent 간 정보 참조 불가** | Shared Context + Message Bus |
| 프롬프트 전략 | 단일 통합 프롬프트 | 섹션별 최적화 부족 | CoT + Few-shot + 섹션별 전문화 |
| 품질 검증 | ValidationAgent (Rule-based) | 재추출 없이 값만 수정 | Self-Reflection + Feedback Loop |
| 비용 효율 | 조건부 호출 (USE_CONDITIONAL_LLM) | 비효율적 재호출 | 동적 모델 선택 + 캐싱 |
| 처리 속도 | 8-12초/건 | 순차 처리 병목 | 3-5초/건 (목표) |

### 1.2 핵심 해결 과제

**기존 계획의 한계:**
```
문제 1: Agent 간 컨텍스트 공유 제한
- Profile Agent가 추출한 "이름"을 Career Agent가 참조 불가
- 경력에서 발견된 회사명을 Project Agent가 활용 불가

문제 2: LLM 호출이 독립적 (협업 불가)
- 추출 단계에서 Agent 간 실시간 협업 없음
- Quality Agent가 수정 제안해도 재추출 없이 값만 교체
- "이 경력이 의심스러우니 다시 확인해줘"라는 대화 불가
```

**해결책: 3가지 핵심 컴포넌트 추가**
1. **Shared Context** - Agent 간 실시간 데이터 공유
2. **Communication Bus** - Agent 간 메시지 교환
3. **Feedback Loop** - 불확실한 필드 재추출

### 1.3 핵심 성과 지표 (KPIs)

| 지표 | 현재 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|------|---------|---------|---------|---------|
| 평균 처리 시간 | 8-12초 | 6-8초 | 5-7초 | 4-5초 | 3-5초 |
| 필드 추출 정확도 | 85% | 88% | 92% | 95% | 97% |
| 환각 발생률 | 8% | 5% | 3% | 2% | 1% |
| LLM 비용/건 | $0.05 | $0.045 | $0.04 | $0.035 | $0.03 |
| 동시 처리량 | 10건/분 | 15건/분 | 25건/분 | 40건/분 | 50건/분 |
| Agent 협업 효과 | N/A | 기본 | 중간 | 높음 | 완전 |

---

## 2. 아키텍처 설계

### 2.1 목표 아키텍처: Collaborative Orchestrator Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COLLABORATIVE ORCHESTRATOR                              │
│  - 전체 파이프라인 조율 및 Agent 간 통신 중재                                │
│  - 컨텍스트 일관성 관리                                                      │
│  - 동적 전략 선택 (복잡도 기반)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
          ┌───────────────────┐           ┌───────────────────┐
          │  SHARED CONTEXT   │◄─────────►│  COMMUNICATION    │
          │  (읽기/쓰기)      │           │  BUS (실시간)     │
          │                   │           │                   │
          │  - 추출 데이터    │           │  - query/response │
          │  - 신뢰도 점수    │           │  - recheck 요청   │
          │  - 의존성 추적    │           │  - broadcast      │
          └───────────────────┘           └───────────────────┘
                      ▲                               ▲
          ┌───────────┼───────────┬───────────┬──────┤
          │           │           │           │      │
          ▼           ▼           ▼           ▼      ▼
      ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐
      │Profile│  │Career │  │ Edu   │  │ Skill │  │Quality│
      │Agent  │  │Agent  │  │ Agent │  │ Agent │  │Agent  │
      └───────┘  └───────┘  └───────┘  └───────┘  └───────┘
          │           │           │           │        │
          │     publish/subscribe + query/response     │
          └────────────────────────────────────────────┘
```

### 2.2 새로운 Agent 구조 (v2.0 업데이트)

```
apps/worker/
├── agents/
│   ├── orchestrator/                    # [NEW] Orchestrator Layer
│   │   ├── __init__.py
│   │   ├── collaborative_orchestrator.py # 협업 오케스트레이터 (v2.0)
│   │   ├── strategy_selector.py         # 동적 전략 선택
│   │   └── model_selector.py            # 동적 모델 선택
│   │
│   ├── extractors/                      # [NEW] Extraction Sub-Agents
│   │   ├── __init__.py
│   │   ├── base_extractor.py            # 추출 Agent 베이스 클래스 (v2.0: 컨텍스트 지원)
│   │   ├── profile_extractor.py         # 인적사항 추출
│   │   ├── career_extractor.py          # 경력 추출
│   │   ├── education_extractor.py       # 학력 추출
│   │   ├── skill_extractor.py           # 스킬 추출
│   │   └── project_extractor.py         # 프로젝트 추출
│   │
│   ├── analyzers/                       # [NEW] Analysis Sub-Agents
│   │   ├── __init__.py
│   │   ├── summary_analyzer.py          # 요약 생성
│   │   └── strength_analyzer.py         # 강점 분석
│   │
│   ├── quality/                         # [NEW] Quality Assurance Agents
│   │   ├── __init__.py
│   │   ├── reflection_agent.py          # Self-Reflection
│   │   ├── hallucination_detector.py    # 환각 감지
│   │   ├── consensus_agent.py           # 다중 LLM 합의
│   │   └── cross_validator.py           # 교차 검증
│   │
│   ├── analyst_agent.py                 # [REFACTOR] 레거시 호환 유지
│   ├── router_agent.py                  # [KEEP]
│   ├── validation_agent.py              # [KEEP]
│   ├── privacy_agent.py                 # [KEEP]
│   ├── identity_checker.py              # [KEEP]
│   └── visual_agent.py                  # [KEEP]
│
├── collaboration/                       # [NEW v2.0] Agent 협업 인프라
│   ├── __init__.py
│   ├── shared_context.py                # Agent 간 실시간 컨텍스트 공유
│   ├── communication_bus.py             # Agent 간 메시지 버스
│   ├── feedback_loop.py                 # 재추출 피드백 루프
│   └── dependency_tracker.py            # 필드 의존성 추적
│
├── prompts/                             # [NEW] Prompt Library
│   ├── __init__.py
│   ├── base_prompts.py                  # 공통 프롬프트 요소
│   ├── extraction_prompts.py            # 추출 전용 프롬프트
│   ├── analysis_prompts.py              # 분석 전용 프롬프트
│   └── few_shot_examples.py             # Few-shot 예시 라이브러리
│
├── cache/                               # [NEW] Caching Layer
│   ├── __init__.py
│   ├── sub_agent_cache.py               # Sub-Agent 결과 캐싱
│   └── embedding_cache.py               # 임베딩 캐싱
│
└── config.py                            # [UPDATE] 새 Feature Flags 추가
```

---

## 3. Phase별 구현 계획

### Phase 1: 기반 구축 + Shared Context (3주)

#### 3.1.1 Week 1: 인프라 및 기본 구조

##### Task 1.1: Feature Flags 추가
**파일**: `config.py`

```python
# [NEW] Multi-Agent 고도화 Feature Flags
class Settings(BaseSettings):
    # 기존 설정 유지...

    # ─────────────────────────────────────────────────
    # Multi-Agent 고도화 Feature Flags
    # ─────────────────────────────────────────────────
    USE_PARALLEL_EXTRACTION: bool = Field(
        default=False,
        description="섹션별 병렬 추출 활성화"
    )

    USE_SHARED_CONTEXT: bool = Field(
        default=False,
        description="Agent 간 컨텍스트 공유 활성화 (v2.0)"
    )

    USE_COMMUNICATION_BUS: bool = Field(
        default=False,
        description="Agent 간 메시지 버스 활성화 (v2.0)"
    )

    USE_FEEDBACK_LOOP: bool = Field(
        default=False,
        description="재추출 피드백 루프 활성화 (v2.0)"
    )

    USE_SELF_REFLECTION: bool = Field(
        default=False,
        description="Self-Reflection Agent 활성화"
    )

    USE_HALLUCINATION_DETECTION: bool = Field(
        default=True,
        description="환각 감지 Agent 활성화"
    )

    USE_CONSENSUS_VOTING: bool = Field(
        default=False,
        description="3-way 합의 투표 시스템 활성화"
    )

    USE_DYNAMIC_MODEL_SELECTION: bool = Field(
        default=False,
        description="복잡도 기반 동적 모델 선택"
    )

    USE_PROMPT_CACHE: bool = Field(
        default=False,
        description="Sub-Agent 결과 캐싱"
    )

    # 협업 설정
    MAX_REEXTRACTION_ATTEMPTS: int = Field(
        default=2,
        description="최대 재추출 시도 횟수"
    )

    CONTEXT_SHARE_TIMEOUT_MS: int = Field(
        default=5000,
        description="컨텍스트 공유 타임아웃 (ms)"
    )

    # 모델 선택 임계값
    COMPLEXITY_THRESHOLD_SIMPLE: int = Field(
        default=2,
        description="Simple 분류 최대 페이지 수"
    )

    COMPLEXITY_THRESHOLD_MEDIUM: int = Field(
        default=5,
        description="Medium 분류 최대 페이지 수"
    )
```

**예상 작업량**: 2시간

##### Task 1.2: Shared Context 구현 (핵심!)
**파일**: `collaboration/shared_context.py`

```python
"""
Shared Context - Agent 간 실시간 컨텍스트 공유

핵심 기능:
1. 추출된 데이터의 실시간 발행/구독
2. 다른 Agent가 추출한 값 참조
3. 신뢰도 점수 공유
4. 필드 의존성 추적
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class FieldStatus(str, Enum):
    """필드 상태"""
    PENDING = "pending"           # 아직 추출되지 않음
    EXTRACTED = "extracted"       # 추출 완료
    UNCERTAIN = "uncertain"       # 추출되었으나 불확실
    RECHECK_REQUESTED = "recheck" # 재확인 요청됨
    CONFIRMED = "confirmed"       # 확정됨


@dataclass
class ExtractedField:
    """추출된 필드 정보"""
    value: Any
    source_agent: str
    confidence: float
    status: FieldStatus = FieldStatus.EXTRACTED
    timestamp: datetime = field(default_factory=datetime.now)
    evidence: Optional[str] = None  # 원본 텍스트에서의 근거
    dependencies: List[str] = field(default_factory=list)  # 의존하는 다른 필드


@dataclass
class Query:
    """Agent 간 질의"""
    id: str
    from_agent: str
    question: str
    target_field: Optional[str] = None
    status: str = "pending"
    response: Any = None
    created_at: datetime = field(default_factory=datetime.now)


class SharedExtractionContext:
    """
    Agent 간 실시간 컨텍스트 공유

    사용 예시:
    ```python
    # Profile Agent가 이름 발행
    await context.publish("profile", "name", "김경민", 0.95)

    # Career Agent가 이름 참조
    name = context.get("name")  # "김경민"

    # Quality Agent가 재확인 요청
    await context.request_recheck("quality", "name", "파일명과 불일치")
    ```
    """

    def __init__(self):
        self._data: Dict[str, ExtractedField] = {}
        self._pending_queries: List[Query] = []
        self._subscribers: Dict[str, List[callable]] = {}
        self._lock = asyncio.Lock()
        self._field_events: Dict[str, asyncio.Event] = {}

        # 필드 의존성 정의
        self._dependencies = {
            "careers": ["name"],  # 경력 추출 시 이름 참조 가능
            "projects": ["name", "last_company"],  # 프로젝트 추출 시 이름, 회사 참조
            "skills": ["careers", "projects"],  # 스킬 추출 시 경력, 프로젝트 참조
            "summary": ["name", "careers", "skills"],  # 요약 생성 시 핵심 정보 참조
        }

    async def publish(
        self,
        agent: str,
        field: str,
        value: Any,
        confidence: float,
        evidence: Optional[str] = None,
        status: FieldStatus = FieldStatus.EXTRACTED,
    ) -> None:
        """
        추출 결과 발행 - 다른 Agent가 즉시 참조 가능

        Args:
            agent: 발행하는 Agent 이름
            field: 필드명
            value: 추출된 값
            confidence: 신뢰도 (0.0 ~ 1.0)
            evidence: 원본 텍스트에서의 근거
            status: 필드 상태
        """
        async with self._lock:
            # 기존 값보다 신뢰도가 높을 때만 업데이트 (또는 신규)
            existing = self._data.get(field)
            if existing is None or confidence > existing.confidence:
                self._data[field] = ExtractedField(
                    value=value,
                    source_agent=agent,
                    confidence=confidence,
                    status=status,
                    evidence=evidence,
                    dependencies=self._dependencies.get(field, []),
                )

                logger.debug(
                    f"[SharedContext] {agent} published {field}={value} "
                    f"(confidence={confidence:.2f})"
                )

                # 구독자에게 알림
                await self._notify_subscribers(field, value)

                # 대기 중인 Agent 깨우기
                if field in self._field_events:
                    self._field_events[field].set()

    def get(self, field: str) -> Optional[Any]:
        """
        다른 Agent가 추출한 값 참조

        Args:
            field: 필드명

        Returns:
            추출된 값 또는 None
        """
        extracted = self._data.get(field)
        if extracted:
            return extracted.value
        return None

    def get_with_metadata(self, field: str) -> Optional[ExtractedField]:
        """메타데이터 포함 조회"""
        return self._data.get(field)

    def get_confidence(self, field: str) -> float:
        """필드 신뢰도 조회"""
        extracted = self._data.get(field)
        return extracted.confidence if extracted else 0.0

    def get_all(self) -> Dict[str, Any]:
        """모든 추출된 데이터 조회"""
        return {k: v.value for k, v in self._data.items()}

    def get_all_with_metadata(self) -> Dict[str, ExtractedField]:
        """메타데이터 포함 전체 조회"""
        return self._data.copy()

    async def wait_for(
        self,
        field: str,
        timeout_ms: int = 5000
    ) -> Optional[Any]:
        """
        특정 필드가 추출될 때까지 대기

        Args:
            field: 대기할 필드명
            timeout_ms: 타임아웃 (밀리초)

        Returns:
            추출된 값 또는 None (타임아웃)
        """
        # 이미 추출되어 있으면 즉시 반환
        if field in self._data:
            return self._data[field].value

        # Event 생성 및 대기
        if field not in self._field_events:
            self._field_events[field] = asyncio.Event()

        try:
            await asyncio.wait_for(
                self._field_events[field].wait(),
                timeout=timeout_ms / 1000
            )
            return self._data.get(field, ExtractedField(None, "", 0)).value
        except asyncio.TimeoutError:
            logger.warning(f"[SharedContext] Timeout waiting for {field}")
            return None

    def subscribe(self, field: str, callback: callable) -> None:
        """
        필드 업데이트 구독

        Args:
            field: 구독할 필드명
            callback: 업데이트 시 호출할 콜백 (async)
        """
        if field not in self._subscribers:
            self._subscribers[field] = []
        self._subscribers[field].append(callback)

    async def _notify_subscribers(self, field: str, value: Any) -> None:
        """구독자에게 알림"""
        callbacks = self._subscribers.get(field, [])
        for callback in callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(field, value)
                else:
                    callback(field, value)
            except Exception as e:
                logger.error(f"[SharedContext] Subscriber callback error: {e}")

    async def request_recheck(
        self,
        requesting_agent: str,
        field: str,
        reason: str
    ) -> None:
        """
        필드 재확인 요청

        Args:
            requesting_agent: 요청하는 Agent
            field: 재확인할 필드
            reason: 재확인 이유
        """
        async with self._lock:
            if field in self._data:
                self._data[field].status = FieldStatus.RECHECK_REQUESTED
                logger.info(
                    f"[SharedContext] {requesting_agent} requested recheck for "
                    f"{field}: {reason}"
                )

    def get_fields_needing_recheck(self) -> List[str]:
        """재확인이 필요한 필드 목록"""
        return [
            field for field, data in self._data.items()
            if data.status == FieldStatus.RECHECK_REQUESTED
        ]

    def get_uncertain_fields(self, threshold: float = 0.7) -> List[str]:
        """신뢰도가 낮은 필드 목록"""
        return [
            field for field, data in self._data.items()
            if data.confidence < threshold
        ]

    def get_dependencies_for(self, field: str) -> List[str]:
        """특정 필드의 의존성 조회"""
        return self._dependencies.get(field, [])

    def are_dependencies_ready(self, field: str) -> bool:
        """특정 필드의 의존성이 모두 준비되었는지 확인"""
        deps = self._dependencies.get(field, [])
        return all(dep in self._data for dep in deps)

    def to_dict(self) -> Dict[str, Any]:
        """직렬화"""
        return {
            field: {
                "value": data.value,
                "source": data.source_agent,
                "confidence": data.confidence,
                "status": data.status.value,
            }
            for field, data in self._data.items()
        }

    def clear(self) -> None:
        """컨텍스트 초기화"""
        self._data.clear()
        self._pending_queries.clear()
        self._field_events.clear()
```

**예상 작업량**: 8시간

##### Task 1.3: Communication Bus 구현
**파일**: `collaboration/communication_bus.py`

```python
"""
Communication Bus - Agent 간 실시간 메시지 교환

핵심 기능:
1. Agent 간 질의/응답 (query/response)
2. 재확인 요청 (request_recheck)
3. 브로드캐스트 메시지
4. 비동기 응답 대기
"""

import asyncio
import uuid
import logging
from typing import Dict, Any, Optional, List, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class MessageType(str, Enum):
    """메시지 타입"""
    QUERY = "query"                 # 정보 질의
    RESPONSE = "response"           # 질의 응답
    REQUEST_RECHECK = "recheck"     # 재확인 요청
    INFORM = "inform"               # 정보 전달
    CONFIRM = "confirm"             # 확인 완료
    BROADCAST = "broadcast"         # 전체 공지


@dataclass
class AgentMessage:
    """Agent 간 메시지"""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    from_agent: str = ""
    to_agent: str = ""  # "all" for broadcast
    message_type: MessageType = MessageType.INFORM
    content: Dict[str, Any] = field(default_factory=dict)
    priority: int = 0  # 높을수록 우선
    timestamp: datetime = field(default_factory=datetime.now)
    correlation_id: Optional[str] = None  # 응답 연결용


@dataclass
class RecheckRequest:
    """재확인 요청"""
    field: str
    reason: str
    requesting_agent: str
    target_agent: str
    priority: int = 1
    max_attempts: int = 2


class AgentCommunicationBus:
    """
    Agent 간 실시간 통신 버스

    사용 예시:
    ```python
    # Quality Agent가 Career Agent에게 재확인 요청
    corrected = await bus.request_recheck(
        from_agent="quality",
        to_agent="career",
        field="careers",
        reason="경력 날짜 불일치: 삼성전자 (2018-03 ~ 2025-02)"
    )

    # Profile Agent가 전체에 이름 확정 알림
    await bus.broadcast(
        from_agent="profile",
        message_type=MessageType.CONFIRM,
        content={"field": "name", "value": "김경민", "confidence": 0.98}
    )
    ```
    """

    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}  # agent -> handlers
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._recheck_counts: Dict[str, int] = {}  # field -> recheck count

    def register_handler(
        self,
        agent_name: str,
        handler: Callable[[AgentMessage], Awaitable[Optional[Any]]]
    ) -> None:
        """
        메시지 핸들러 등록

        Args:
            agent_name: Agent 이름
            handler: 메시지 처리 핸들러 (async)
        """
        if agent_name not in self._handlers:
            self._handlers[agent_name] = []
        self._handlers[agent_name].append(handler)
        logger.debug(f"[CommBus] Registered handler for {agent_name}")

    async def send(self, message: AgentMessage) -> None:
        """
        메시지 전송

        Args:
            message: 전송할 메시지
        """
        await self._message_queue.put(message)

        # 대상 Agent에게 전달
        if message.to_agent == "all":
            # 브로드캐스트
            for agent, handlers in self._handlers.items():
                if agent != message.from_agent:
                    for handler in handlers:
                        try:
                            await handler(message)
                        except Exception as e:
                            logger.error(f"[CommBus] Handler error ({agent}): {e}")
        else:
            # 특정 Agent에게
            handlers = self._handlers.get(message.to_agent, [])
            for handler in handlers:
                try:
                    response = await handler(message)

                    # 응답이 있고, 대기 중인 요청이 있으면 완료 처리
                    if response and message.correlation_id:
                        if message.correlation_id in self._pending_requests:
                            self._pending_requests[message.correlation_id].set_result(response)
                except Exception as e:
                    logger.error(f"[CommBus] Handler error ({message.to_agent}): {e}")

    async def broadcast(
        self,
        from_agent: str,
        message_type: MessageType,
        content: Dict[str, Any],
        priority: int = 0
    ) -> None:
        """
        전체 Agent에게 메시지 브로드캐스트

        Args:
            from_agent: 발신 Agent
            message_type: 메시지 타입
            content: 메시지 내용
            priority: 우선순위
        """
        message = AgentMessage(
            from_agent=from_agent,
            to_agent="all",
            message_type=message_type,
            content=content,
            priority=priority,
        )
        await self.send(message)

    async def request_recheck(
        self,
        from_agent: str,
        to_agent: str,
        field: str,
        reason: str,
        timeout_ms: int = 10000,
        max_attempts: int = 2
    ) -> Optional[Any]:
        """
        다른 Agent에게 재확인 요청

        Args:
            from_agent: 요청하는 Agent
            to_agent: 대상 Agent
            field: 재확인할 필드
            reason: 재확인 이유
            timeout_ms: 응답 타임아웃
            max_attempts: 최대 시도 횟수

        Returns:
            재추출된 값 또는 None
        """
        # 재확인 횟수 체크
        recheck_key = f"{to_agent}:{field}"
        current_count = self._recheck_counts.get(recheck_key, 0)

        if current_count >= max_attempts:
            logger.warning(
                f"[CommBus] Max recheck attempts reached for {field} "
                f"({current_count}/{max_attempts})"
            )
            return None

        self._recheck_counts[recheck_key] = current_count + 1

        # 메시지 생성
        correlation_id = str(uuid.uuid4())[:8]
        message = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=MessageType.REQUEST_RECHECK,
            content={
                "field": field,
                "reason": reason,
                "attempt": current_count + 1,
                "max_attempts": max_attempts,
            },
            priority=1,  # 재확인은 우선순위 높음
            correlation_id=correlation_id,
        )

        # 응답 대기 Future 생성
        response_future = asyncio.get_event_loop().create_future()
        self._pending_requests[correlation_id] = response_future

        try:
            # 메시지 전송
            await self.send(message)

            # 응답 대기
            result = await asyncio.wait_for(
                response_future,
                timeout=timeout_ms / 1000
            )

            logger.info(
                f"[CommBus] Recheck response received for {field}: {result}"
            )
            return result

        except asyncio.TimeoutError:
            logger.warning(f"[CommBus] Recheck timeout for {field}")
            return None
        finally:
            # 정리
            self._pending_requests.pop(correlation_id, None)

    async def query(
        self,
        from_agent: str,
        to_agent: str,
        question: str,
        context: Optional[Dict[str, Any]] = None,
        timeout_ms: int = 5000
    ) -> Optional[Any]:
        """
        다른 Agent에게 질의

        Args:
            from_agent: 질의하는 Agent
            to_agent: 대상 Agent
            question: 질문
            context: 추가 컨텍스트
            timeout_ms: 응답 타임아웃

        Returns:
            응답 또는 None
        """
        correlation_id = str(uuid.uuid4())[:8]
        message = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=MessageType.QUERY,
            content={
                "question": question,
                "context": context or {},
            },
            correlation_id=correlation_id,
        )

        response_future = asyncio.get_event_loop().create_future()
        self._pending_requests[correlation_id] = response_future

        try:
            await self.send(message)
            return await asyncio.wait_for(
                response_future,
                timeout=timeout_ms / 1000
            )
        except asyncio.TimeoutError:
            logger.warning(f"[CommBus] Query timeout: {question[:50]}...")
            return None
        finally:
            self._pending_requests.pop(correlation_id, None)

    def respond(self, correlation_id: str, response: Any) -> None:
        """
        질의에 응답

        Args:
            correlation_id: 원본 메시지의 correlation_id
            response: 응답 데이터
        """
        if correlation_id in self._pending_requests:
            self._pending_requests[correlation_id].set_result(response)

    def get_recheck_count(self, agent: str, field: str) -> int:
        """특정 필드의 재확인 횟수 조회"""
        return self._recheck_counts.get(f"{agent}:{field}", 0)

    def reset_recheck_counts(self) -> None:
        """재확인 횟수 초기화"""
        self._recheck_counts.clear()
```

**예상 작업량**: 8시간

#### 3.1.2 Week 2: Base Extractor 및 협업 통합

##### Task 1.4: Base Extractor 클래스 (협업 지원 v2.0)
**파일**: `agents/extractors/base_extractor.py`

```python
"""
Base Extractor - 모든 추출 Sub-Agent의 베이스 클래스 (v2.0)

v2.0 업데이트:
- Shared Context 통합
- Communication Bus 핸들러
- 재추출 지원
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, TYPE_CHECKING
from dataclasses import dataclass, field
import logging
import asyncio

from services.llm_manager import get_llm_manager, LLMProvider, LLMResponse

if TYPE_CHECKING:
    from collaboration.shared_context import SharedExtractionContext
    from collaboration.communication_bus import AgentCommunicationBus, AgentMessage

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """추출 결과 데이터 클래스"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    confidence: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    processing_time_ms: int = 0
    error: Optional[str] = None
    used_context: Dict[str, Any] = field(default_factory=dict)  # v2.0: 참조한 컨텍스트

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "confidence": round(self.confidence, 2),
            "field_confidence": self.field_confidence,
            "warnings": self.warnings,
            "processing_time_ms": self.processing_time_ms,
            "error": self.error,
            "used_context": self.used_context,
        }


class BaseExtractor(ABC):
    """
    추출 Sub-Agent 베이스 클래스 (v2.0)

    v2.0 주요 기능:
    1. Shared Context에서 다른 Agent 결과 참조
    2. Communication Bus를 통한 재추출 요청 처리
    3. 추출 결과 자동 발행
    """

    # 서브클래스에서 오버라이드
    EXTRACTOR_NAME: str = "base"
    TARGET_FIELDS: List[str] = []
    DEPENDS_ON: List[str] = []  # v2.0: 의존하는 필드들
    DEFAULT_MODEL: str = "claude-3-5-haiku-20241022"

    def __init__(self):
        self.llm_manager = get_llm_manager()
        self._call_count = 0
        self._context: Optional['SharedExtractionContext'] = None
        self._bus: Optional['AgentCommunicationBus'] = None

    def set_collaboration(
        self,
        context: 'SharedExtractionContext',
        bus: 'AgentCommunicationBus'
    ) -> None:
        """협업 인프라 설정"""
        self._context = context
        self._bus = bus

        # 재추출 요청 핸들러 등록
        if self._bus:
            self._bus.register_handler(
                self.EXTRACTOR_NAME,
                self._handle_message
            )

    async def _handle_message(self, message: 'AgentMessage') -> Optional[Any]:
        """Communication Bus 메시지 핸들러"""
        from collaboration.communication_bus import MessageType

        if message.message_type == MessageType.REQUEST_RECHECK:
            field = message.content.get("field")
            reason = message.content.get("reason")

            logger.info(
                f"[{self.EXTRACTOR_NAME}] Recheck requested for {field}: {reason}"
            )

            # 재추출 수행
            if field in self.TARGET_FIELDS and self._last_section_text:
                result = await self._reextract_field(
                    field,
                    self._last_section_text,
                    self._last_filename,
                    reason
                )
                return result

        elif message.message_type == MessageType.QUERY:
            question = message.content.get("question")
            # 질의 응답 로직
            return self._answer_query(question, message.content.get("context", {}))

        return None

    async def _reextract_field(
        self,
        field: str,
        section_text: str,
        filename: Optional[str],
        reason: str
    ) -> Optional[Any]:
        """
        특정 필드 재추출

        Args:
            field: 재추출할 필드
            section_text: 섹션 텍스트
            filename: 파일명
            reason: 재추출 이유

        Returns:
            재추출된 값 또는 None
        """
        # 재추출용 프롬프트 강화
        enhanced_prompt = f"""
이전 추출에서 다음 문제가 발견되었습니다:
{reason}

다음 필드를 다시 추출하세요: {field}

주의사항:
- 이전 오류를 참고하여 더 신중하게 추출하세요
- 확실하지 않으면 null을 반환하세요
- 추측하지 마세요

섹션 텍스트:
{section_text}
"""

        try:
            result = await self.extract(
                section_text,
                filename,
                enhanced_prompt=enhanced_prompt
            )

            if result.success and result.data:
                value = result.data.get(field)
                if value is not None:
                    # 컨텍스트 업데이트
                    if self._context:
                        await self._context.publish(
                            self.EXTRACTOR_NAME,
                            field,
                            value,
                            result.field_confidence.get(field, 0.8)
                        )
                    return value

        except Exception as e:
            logger.error(f"[{self.EXTRACTOR_NAME}] Reextraction error: {e}")

        return None

    def _answer_query(
        self,
        question: str,
        context: Dict[str, Any]
    ) -> Optional[Any]:
        """질의 응답 (서브클래스에서 오버라이드 가능)"""
        return None

    @abstractmethod
    def get_system_prompt(self) -> str:
        """시스템 프롬프트 반환"""
        pass

    @abstractmethod
    def get_json_schema(self) -> Dict[str, Any]:
        """JSON 스키마 반환"""
        pass

    @abstractmethod
    def get_few_shot_examples(self) -> List[Dict[str, Any]]:
        """Few-shot 예시 반환"""
        pass

    def get_context_prompt(self) -> str:
        """
        v2.0: 컨텍스트 기반 프롬프트 생성

        다른 Agent가 추출한 정보를 프롬프트에 포함
        """
        if not self._context:
            return ""

        context_parts = []

        for dep_field in self.DEPENDS_ON:
            value = self._context.get(dep_field)
            if value is not None:
                confidence = self._context.get_confidence(dep_field)
                context_parts.append(
                    f"- {dep_field}: {value} (신뢰도: {confidence:.0%})"
                )

        if context_parts:
            return f"""
## 이미 확인된 정보 (다른 Agent가 추출)
{chr(10).join(context_parts)}

위 정보를 참고하여 추출하세요. 특히 이름, 회사명 등이 일관되게 사용되는지 확인하세요.
"""
        return ""

    async def extract(
        self,
        section_text: str,
        filename: Optional[str] = None,
        full_context: Optional[str] = None,
        model_override: Optional[str] = None,
        enhanced_prompt: Optional[str] = None,  # v2.0: 재추출용 강화 프롬프트
    ) -> ExtractionResult:
        """
        섹션에서 정보 추출

        v2.0 업데이트:
        - 의존성 대기
        - 컨텍스트 참조
        - 결과 자동 발행
        """
        import time
        start_time = time.time()

        # v2.0: 재추출을 위해 입력 저장
        self._last_section_text = section_text
        self._last_filename = filename

        try:
            # v2.0: 의존성 대기 (옵션)
            used_context = {}
            if self._context and self.DEPENDS_ON:
                for dep in self.DEPENDS_ON:
                    # 의존성이 준비될 때까지 짧게 대기
                    value = await self._context.wait_for(dep, timeout_ms=2000)
                    if value:
                        used_context[dep] = value

            # 메시지 빌드 (컨텍스트 포함)
            messages = self._build_messages(
                section_text,
                filename,
                full_context,
                enhanced_prompt
            )

            model = model_override or self.DEFAULT_MODEL

            response = await self.llm_manager.call_json(
                provider=LLMProvider.CLAUDE,
                messages=messages,
                json_schema=self.get_json_schema(),
                model=model,
                temperature=0.1,
            )

            self._call_count += 1
            processing_time = int((time.time() - start_time) * 1000)

            if not response.success:
                return ExtractionResult(
                    success=False,
                    error=response.error,
                    processing_time_ms=processing_time,
                )

            # 결과 후처리
            data, confidence, field_confidence = self._post_process(response.content)

            # v2.0: 결과를 Shared Context에 발행
            if self._context and data:
                for field, value in data.items():
                    if value is not None and field in self.TARGET_FIELDS:
                        await self._context.publish(
                            self.EXTRACTOR_NAME,
                            field,
                            value,
                            field_confidence.get(field, confidence)
                        )

            return ExtractionResult(
                success=True,
                data=data,
                confidence=confidence,
                field_confidence=field_confidence,
                processing_time_ms=processing_time,
                used_context=used_context,
            )

        except Exception as e:
            logger.error(f"[{self.EXTRACTOR_NAME}] Extraction error: {e}")
            return ExtractionResult(
                success=False,
                error=str(e),
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

    def _build_messages(
        self,
        section_text: str,
        filename: Optional[str],
        full_context: Optional[str],
        enhanced_prompt: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """LLM 메시지 빌드"""
        system_prompt = self.get_system_prompt()

        # v2.0: 컨텍스트 프롬프트 추가
        context_prompt = self.get_context_prompt()
        if context_prompt:
            system_prompt += context_prompt

        # Few-shot 예시 추가
        examples = self.get_few_shot_examples()
        if examples:
            examples_text = self._format_few_shot_examples(examples)
            system_prompt += f"\n\n## 예시\n{examples_text}"

        # 사용자 프롬프트
        if enhanced_prompt:
            user_prompt = enhanced_prompt
        else:
            user_prompt = f"""다음 섹션에서 정보를 추출하세요.

파일명: {filename or 'Unknown'}

---
{section_text}
---

JSON 형식으로만 응답하세요."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _format_few_shot_examples(self, examples: List[Dict[str, Any]]) -> str:
        """Few-shot 예시 포맷팅"""
        import json
        formatted = []
        for i, ex in enumerate(examples[:3], 1):
            formatted.append(
                f"### 예시 {i}\n"
                f"입력:\n{ex['input']}\n\n"
                f"출력:\n```json\n{json.dumps(ex['output'], ensure_ascii=False, indent=2)}\n```"
            )
        return "\n\n".join(formatted)

    def _post_process(
        self,
        content: Dict[str, Any]
    ) -> tuple[Dict[str, Any], float, Dict[str, float]]:
        """결과 후처리 (서브클래스에서 오버라이드 가능)"""
        if not content:
            return {}, 0.0, {}

        field_confidence = {}
        total_confidence = 0.0
        field_count = 0

        for target_field in self.TARGET_FIELDS:
            if target_field in content and content[target_field]:
                field_confidence[target_field] = 0.85
                total_confidence += 0.85
                field_count += 1
            else:
                field_confidence[target_field] = 0.0

        overall = total_confidence / max(field_count, 1)

        return content, overall, field_confidence
```

**예상 작업량**: 8시간

##### Task 1.5: Profile Extractor (협업 버전)
**파일**: `agents/extractors/profile_extractor.py`

```python
"""
Profile Extractor - 인적사항 추출 Sub-Agent (v2.0)

v2.0: 협업 지원
- 이름을 먼저 추출하여 다른 Agent가 참조 가능
- 파일명에서 이름 추론 시 Communication Bus로 확인 요청
"""

from typing import Dict, Any, List
from .base_extractor import BaseExtractor, ExtractionResult


class ProfileExtractor(BaseExtractor):
    """인적사항 추출 전문 Agent"""

    EXTRACTOR_NAME = "profile"
    TARGET_FIELDS = ["name", "birth_year", "gender", "phone", "email", "address", "location_city"]
    DEPENDS_ON = []  # 프로필은 의존성 없음 (가장 먼저 실행)
    DEFAULT_MODEL = "claude-3-5-haiku-20241022"

    def get_system_prompt(self) -> str:
        return """당신은 이력서에서 인적사항을 추출하는 전문가입니다.

## 추출 대상
- name: 후보자 이름 (가장 중요! 다른 Agent들이 참조합니다)
- birth_year: 출생 연도 (4자리)
- gender: 성별 (male/female)
- phone: 휴대폰 번호
- email: 이메일 주소
- address: 거주지 주소
- location_city: 거주 도시

## 추출 규칙
1. 이름: 문서 상단, 헤더, 또는 파일명에서 추출
2. 출생연도: 나이 언급 시 역산, 주민번호 앞자리에서 추론
3. 연락처: 010-xxxx-xxxx 형식 우선

## 주의사항
- 정보가 없으면 해당 필드 생략 (null 대신)
- 추측하지 말고 명시적 정보만 추출
- 이름은 반드시 추출해야 합니다 (다른 Agent가 참조함)"""

    def get_json_schema(self) -> Dict[str, Any]:
        return {
            "name": "profile_extraction",
            "strict": False,
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "후보자 이름"},
                    "birth_year": {"type": "integer", "description": "출생 연도"},
                    "gender": {"type": "string", "enum": ["male", "female"]},
                    "phone": {"type": "string", "description": "휴대폰 번호"},
                    "email": {"type": "string", "description": "이메일"},
                    "address": {"type": "string", "description": "주소"},
                    "location_city": {"type": "string", "description": "도시"},
                },
                "required": ["name"],
            }
        }

    def get_few_shot_examples(self) -> List[Dict[str, Any]]:
        return [
            {
                "input": """김경민
경기도 성남시 분당구
010-1234-5678
kim.kyungmin@gmail.com
1985년생 (만 41세)""",
                "output": {
                    "name": "김경민",
                    "birth_year": 1985,
                    "phone": "010-1234-5678",
                    "email": "kim.kyungmin@gmail.com",
                    "address": "경기도 성남시 분당구",
                    "location_city": "성남"
                }
            },
        ]

    async def extract(
        self,
        section_text: str,
        filename: Optional[str] = None,
        full_context: Optional[str] = None,
        model_override: Optional[str] = None,
        enhanced_prompt: Optional[str] = None,
    ) -> ExtractionResult:
        """
        인적사항 추출 (v2.0)

        특수 처리:
        - 이름을 높은 우선순위로 발행 (다른 Agent가 대기 중일 수 있음)
        - 파일명에서 이름 추론 시 신뢰도 조정
        """
        result = await super().extract(
            section_text,
            filename,
            full_context,
            model_override,
            enhanced_prompt
        )

        if result.success and result.data:
            # 파일명에서 이름 추론 여부 확인
            name = result.data.get("name")
            if name and filename:
                # 파일명에서 추론한 이름인지 확인
                name_in_text = name.lower() in section_text.lower()
                name_in_filename = name in filename

                if name_in_filename and not name_in_text:
                    # 파일명에서만 발견된 경우 신뢰도 낮춤
                    result.field_confidence["name"] = 0.7
                    result.warnings.append(
                        f"이름 '{name}'이 파일명에서만 발견됨 (본문에서 확인 필요)"
                    )

        return result
```

**예상 작업량**: 4시간

##### Task 1.6: Career Extractor (협업 버전)
**파일**: `agents/extractors/career_extractor.py`

```python
"""
Career Extractor - 경력 추출 Sub-Agent (v2.0)

v2.0: 협업 지원
- Profile Agent가 추출한 이름 참조
- 회사명이 이름과 혼동될 경우 확인
"""

from typing import Dict, Any, List, Optional
from .base_extractor import BaseExtractor, ExtractionResult


class CareerExtractor(BaseExtractor):
    """경력 추출 전문 Agent"""

    EXTRACTOR_NAME = "career"
    TARGET_FIELDS = ["careers", "exp_years", "last_company", "last_position"]
    DEPENDS_ON = ["name"]  # v2.0: 이름에 의존 (프롬프트에서 참조)
    DEFAULT_MODEL = "claude-3-5-haiku-20241022"

    def get_system_prompt(self) -> str:
        return """당신은 이력서에서 경력 정보를 추출하는 전문가입니다.

## 추출 대상
- careers: 경력 목록 (배열)
- exp_years: 총 경력 연수
- last_company: 최근/현재 직장명
- last_position: 최근/현재 직책

## 경력 항목 구조
각 경력은 다음 필드를 포함:
- company: 회사명 (정확한 법인명)
- position: 직책/직급
- department: 부서명
- start_date: 입사일 (YYYY-MM 형식)
- end_date: 퇴사일 (YYYY-MM 형식, 현재 재직 시 null)
- is_current: 현재 재직 여부 (boolean)
- description: 업무 내용

## 추출 규칙
1. 최신순으로 정렬
2. 날짜 형식: YYYY-MM (예: 2023-11)
3. "현재", "재직중" → is_current: true, end_date: null
4. 경력 연수: 첫 입사일 ~ 현재까지 계산

## Chain-of-Thought 추론
1. 먼저 모든 회사명을 식별
2. 각 회사별 기간 추출
3. 직급/역할 매핑
4. 업무 내용 요약"""

    def get_json_schema(self) -> Dict[str, Any]:
        return {
            "name": "career_extraction",
            "strict": False,
            "schema": {
                "type": "object",
                "properties": {
                    "exp_years": {"type": "number"},
                    "last_company": {"type": "string"},
                    "last_position": {"type": "string"},
                    "careers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "company": {"type": "string"},
                                "position": {"type": "string"},
                                "department": {"type": "string"},
                                "start_date": {"type": "string"},
                                "end_date": {"type": ["string", "null"]},
                                "is_current": {"type": "boolean"},
                                "description": {"type": "string"},
                            },
                            "required": ["company", "position", "start_date"],
                        }
                    }
                },
                "required": ["careers"],
            }
        }

    def get_few_shot_examples(self) -> List[Dict[str, Any]]:
        return [
            {
                "input": """경력사항
◆ 삼성전자 (2018.03 ~ 2023.02) - 5년
  - 직급: 선임연구원
  - 부서: 무선사업부 SW개발팀
  - 주요업무: Android Framework 개발

◆ 네이버 (2023.03 ~ 현재)
  - 직급: 시니어 엔지니어
  - 부서: Search Platform
  - 주요업무: 검색 랭킹 알고리즘 개발""",
                "output": {
                    "exp_years": 8,
                    "last_company": "네이버",
                    "last_position": "시니어 엔지니어",
                    "careers": [
                        {
                            "company": "네이버",
                            "position": "시니어 엔지니어",
                            "department": "Search Platform",
                            "start_date": "2023-03",
                            "end_date": None,
                            "is_current": True,
                            "description": "검색 랭킹 알고리즘 개발"
                        },
                        {
                            "company": "삼성전자",
                            "position": "선임연구원",
                            "department": "무선사업부 SW개발팀",
                            "start_date": "2018-03",
                            "end_date": "2023-02",
                            "is_current": False,
                            "description": "Android Framework 개발"
                        }
                    ]
                }
            }
        ]

    def _post_process(
        self,
        content: Dict[str, Any]
    ) -> tuple[Dict[str, Any], float, Dict[str, float]]:
        """경력 데이터 후처리 + v2.0: 컨텍스트 활용 검증"""
        if not content:
            return {}, 0.0, {}

        careers = content.get("careers", [])
        field_confidence = {}

        if careers:
            # 필수 필드 검증
            valid_careers = []
            for career in careers:
                if career.get("company") and career.get("start_date"):
                    valid_careers.append(career)

            content["careers"] = valid_careers

            # 신뢰도 계산
            has_dates = all(c.get("start_date") for c in valid_careers)
            has_positions = all(c.get("position") for c in valid_careers)

            base_confidence = 0.7
            if has_dates:
                base_confidence += 0.15
            if has_positions:
                base_confidence += 0.1

            field_confidence["careers"] = base_confidence
            field_confidence["exp_years"] = 0.9 if content.get("exp_years") else 0.0
            field_confidence["last_company"] = 0.9 if content.get("last_company") else 0.0

            # v2.0: 컨텍스트 기반 검증
            if self._context:
                name = self._context.get("name")
                if name:
                    # 회사명이 이름과 같은 경우 경고
                    for career in valid_careers:
                        if career.get("company") == name:
                            field_confidence["careers"] -= 0.2
                            logger.warning(
                                f"[CareerExtractor] Company name matches candidate name: {name}"
                            )

        overall = sum(field_confidence.values()) / max(len(field_confidence), 1)

        return content, overall, field_confidence
```

**예상 작업량**: 6시간

#### 3.1.3 Week 3: Feedback Loop 및 통합

##### Task 1.7: Feedback Loop 구현
**파일**: `collaboration/feedback_loop.py`

```python
"""
Feedback Loop - 불확실한 필드 재추출

핵심 기능:
1. 신뢰도 기반 재추출 트리거
2. Quality Agent의 재확인 요청 처리
3. Two-Phase Extraction 지원
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field

from .shared_context import SharedExtractionContext, FieldStatus
from .communication_bus import AgentCommunicationBus, MessageType

logger = logging.getLogger(__name__)


@dataclass
class ReextractionRequest:
    """재추출 요청"""
    field: str
    reason: str
    requesting_agent: str
    target_agent: str
    priority: int = 1
    context_hints: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FeedbackLoopResult:
    """피드백 루프 결과"""
    fields_reextracted: List[str]
    improvements: Dict[str, Dict[str, Any]]  # field -> {before, after, confidence_delta}
    total_reextractions: int
    success: bool


class FeedbackLoopManager:
    """
    Feedback Loop Manager

    불확실한 필드의 재추출을 관리합니다.

    사용 예시:
    ```python
    # Phase 1 추출 후 불확실한 필드 재추출
    feedback_result = await feedback_manager.run_feedback_loop(
        context=shared_context,
        bus=communication_bus,
        confidence_threshold=0.7,
        max_iterations=2
    )
    ```
    """

    def __init__(
        self,
        max_reextraction_attempts: int = 2,
        confidence_threshold: float = 0.7
    ):
        self.max_attempts = max_reextraction_attempts
        self.confidence_threshold = confidence_threshold
        self._reextraction_counts: Dict[str, int] = {}

    async def run_feedback_loop(
        self,
        context: SharedExtractionContext,
        bus: AgentCommunicationBus,
        confidence_threshold: Optional[float] = None,
        max_iterations: int = 2,
        fields_to_check: Optional[List[str]] = None
    ) -> FeedbackLoopResult:
        """
        피드백 루프 실행

        Args:
            context: Shared Context
            bus: Communication Bus
            confidence_threshold: 신뢰도 임계값 (기본: 0.7)
            max_iterations: 최대 반복 횟수
            fields_to_check: 확인할 필드 목록 (None이면 전체)

        Returns:
            FeedbackLoopResult
        """
        threshold = confidence_threshold or self.confidence_threshold
        improvements = {}
        total_reextractions = 0
        fields_reextracted = []

        for iteration in range(max_iterations):
            logger.info(f"[FeedbackLoop] Iteration {iteration + 1}/{max_iterations}")

            # 불확실한 필드 찾기
            uncertain_fields = self._find_uncertain_fields(
                context,
                threshold,
                fields_to_check
            )

            # 재확인 요청된 필드 추가
            recheck_fields = context.get_fields_needing_recheck()
            uncertain_fields.update(recheck_fields)

            if not uncertain_fields:
                logger.info("[FeedbackLoop] No uncertain fields, stopping")
                break

            logger.info(f"[FeedbackLoop] Uncertain fields: {uncertain_fields}")

            # 각 필드에 대해 재추출 요청
            for field_name in uncertain_fields:
                if self._reextraction_counts.get(field_name, 0) >= self.max_attempts:
                    continue

                # 이전 값 저장
                before_data = context.get_with_metadata(field_name)
                before_value = before_data.value if before_data else None
                before_confidence = before_data.confidence if before_data else 0

                # 재추출 요청
                target_agent = self._get_responsible_agent(field_name)
                if target_agent:
                    new_value = await bus.request_recheck(
                        from_agent="feedback_loop",
                        to_agent=target_agent,
                        field=field_name,
                        reason=f"Low confidence ({before_confidence:.2f}) or recheck requested",
                        max_attempts=self.max_attempts
                    )

                    total_reextractions += 1
                    self._reextraction_counts[field_name] = \
                        self._reextraction_counts.get(field_name, 0) + 1

                    if new_value is not None:
                        fields_reextracted.append(field_name)

                        # 개선 기록
                        after_data = context.get_with_metadata(field_name)
                        improvements[field_name] = {
                            "before": before_value,
                            "after": new_value,
                            "confidence_before": before_confidence,
                            "confidence_after": after_data.confidence if after_data else 0,
                            "confidence_delta": (
                                (after_data.confidence if after_data else 0) - before_confidence
                            )
                        }

        return FeedbackLoopResult(
            fields_reextracted=fields_reextracted,
            improvements=improvements,
            total_reextractions=total_reextractions,
            success=True
        )

    def _find_uncertain_fields(
        self,
        context: SharedExtractionContext,
        threshold: float,
        fields_to_check: Optional[List[str]]
    ) -> Set[str]:
        """신뢰도가 낮은 필드 찾기"""
        uncertain = set()
        all_data = context.get_all_with_metadata()

        for field_name, data in all_data.items():
            if fields_to_check and field_name not in fields_to_check:
                continue

            if data.confidence < threshold:
                uncertain.add(field_name)

            if data.status == FieldStatus.UNCERTAIN:
                uncertain.add(field_name)

        return uncertain

    def _get_responsible_agent(self, field_name: str) -> Optional[str]:
        """필드에 대한 책임 Agent 결정"""
        field_to_agent = {
            "name": "profile",
            "birth_year": "profile",
            "phone": "profile",
            "email": "profile",
            "careers": "career",
            "exp_years": "career",
            "last_company": "career",
            "last_position": "career",
            "educations": "education",
            "skills": "skill",
            "projects": "project",
        }
        return field_to_agent.get(field_name)

    def reset(self) -> None:
        """재추출 카운트 초기화"""
        self._reextraction_counts.clear()


# 싱글톤
_feedback_manager: Optional[FeedbackLoopManager] = None


def get_feedback_manager() -> FeedbackLoopManager:
    global _feedback_manager
    if _feedback_manager is None:
        from config import get_settings
        settings = get_settings()
        _feedback_manager = FeedbackLoopManager(
            max_reextraction_attempts=getattr(settings, 'MAX_REEXTRACTION_ATTEMPTS', 2),
            confidence_threshold=getattr(settings, 'LLM_CONFIDENCE_THRESHOLD', 0.7)
        )
    return _feedback_manager
```

**예상 작업량**: 8시간

##### Task 1.8: Collaborative Orchestrator 구현
**파일**: `agents/orchestrator/collaborative_orchestrator.py`

```python
"""
Collaborative Orchestrator - 협업 기반 Multi-Agent Orchestrator (v2.0)

핵심 기능:
1. Shared Context 기반 Agent 간 데이터 공유
2. Communication Bus 기반 실시간 협업
3. Two-Phase Extraction with Feedback Loop
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from config import get_settings
from utils.section_separator import get_section_separator, SemanticIR
from collaboration.shared_context import SharedExtractionContext
from collaboration.communication_bus import AgentCommunicationBus
from collaboration.feedback_loop import get_feedback_manager, FeedbackLoopResult

logger = logging.getLogger(__name__)
settings = get_settings()


class AnalysisStrategy(str, Enum):
    """분석 전략"""
    SIMPLE = "simple"              # 단일 통합 호출 (간단한 문서)
    PARALLEL = "parallel"          # 병렬 Sub-Agent (일반 문서)
    COLLABORATIVE = "collaborative" # v2.0: 협업 + 피드백 루프 (복잡한 문서)


@dataclass
class CollaborativeOrchestratorConfig:
    """오케스트레이터 설정"""
    use_parallel_extraction: bool = False
    use_shared_context: bool = False
    use_communication_bus: bool = False
    use_feedback_loop: bool = False
    use_self_reflection: bool = False
    use_hallucination_detection: bool = True
    use_consensus_voting: bool = False
    use_dynamic_model_selection: bool = False

    @classmethod
    def from_settings(cls) -> "CollaborativeOrchestratorConfig":
        return cls(
            use_parallel_extraction=getattr(settings, "USE_PARALLEL_EXTRACTION", False),
            use_shared_context=getattr(settings, "USE_SHARED_CONTEXT", False),
            use_communication_bus=getattr(settings, "USE_COMMUNICATION_BUS", False),
            use_feedback_loop=getattr(settings, "USE_FEEDBACK_LOOP", False),
            use_self_reflection=getattr(settings, "USE_SELF_REFLECTION", False),
            use_hallucination_detection=getattr(settings, "USE_HALLUCINATION_DETECTION", True),
            use_consensus_voting=getattr(settings, "USE_CONSENSUS_VOTING", False),
            use_dynamic_model_selection=getattr(settings, "USE_DYNAMIC_MODEL_SELECTION", False),
        )


@dataclass
class CollaborativeOrchestratorResult:
    """오케스트레이터 실행 결과"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    confidence_score: float = 0.0
    field_confidence: Dict[str, float] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    processing_time_ms: int = 0
    strategy_used: AnalysisStrategy = AnalysisStrategy.SIMPLE

    # v2.0: 협업 관련 메트릭
    sub_agent_results: Dict[str, Any] = field(default_factory=dict)
    quality_reports: Dict[str, Any] = field(default_factory=dict)
    feedback_loop_result: Optional[FeedbackLoopResult] = None
    context_summary: Optional[Dict[str, Any]] = None
    collaboration_metrics: Dict[str, Any] = field(default_factory=dict)

    error: Optional[str] = None


class CollaborativeOrchestrator:
    """
    Collaborative Orchestrator (v2.0)

    완벽한 Agent 협업을 위한 3가지 핵심 컴포넌트 통합:
    1. Shared Context - Agent 간 실시간 데이터 공유
    2. Communication Bus - Agent 간 메시지 교환
    3. Feedback Loop - 불확실한 필드 재추출
    """

    def __init__(self, config: Optional[CollaborativeOrchestratorConfig] = None):
        self.config = config or CollaborativeOrchestratorConfig.from_settings()
        self.section_separator = get_section_separator()

        # Lazy import
        self._extractors = None
        self._quality_agents = None

    def _init_extractors(self):
        """추출 Agent 초기화"""
        if self._extractors is not None:
            return

        from agents.extractors.profile_extractor import ProfileExtractor
        from agents.extractors.career_extractor import CareerExtractor
        from agents.extractors.education_extractor import EducationExtractor
        from agents.extractors.skill_extractor import SkillExtractor
        from agents.extractors.project_extractor import ProjectExtractor

        self._extractors = {
            "profile": ProfileExtractor(),
            "career": CareerExtractor(),
            "education": EducationExtractor(),
            "skill": SkillExtractor(),
            "project": ProjectExtractor(),
        }

    def _init_quality_agents(self):
        """품질 Agent 초기화"""
        if self._quality_agents is not None:
            return

        from agents.quality.reflection_agent import get_reflection_agent
        from agents.quality.hallucination_detector import get_hallucination_detector
        from agents.quality.consensus_agent import get_consensus_agent

        self._quality_agents = {
            "reflection": get_reflection_agent(),
            "hallucination": get_hallucination_detector(),
            "consensus": get_consensus_agent(),
        }

    async def analyze(
        self,
        resume_text: str,
        filename: Optional[str] = None,
        force_strategy: Optional[AnalysisStrategy] = None,
    ) -> CollaborativeOrchestratorResult:
        """
        이력서 분석 실행

        v2.0 전략:
        - SIMPLE: 기존 단일 호출
        - PARALLEL: 병렬 추출 (컨텍스트 공유 없음)
        - COLLABORATIVE: 협업 + 피드백 루프
        """
        start_time = datetime.now()

        try:
            # 1. 전처리: 섹션 분리
            ir = self.section_separator.separate(resume_text, filename)

            # 2. 전략 선택
            strategy = force_strategy or self._select_strategy(ir)
            logger.info(f"[CollaborativeOrchestrator] Strategy: {strategy.value}")

            # 3. 전략별 실행
            if strategy == AnalysisStrategy.SIMPLE:
                result = await self._execute_simple(resume_text, filename)
            elif strategy == AnalysisStrategy.PARALLEL:
                result = await self._execute_parallel(ir, filename, resume_text)
            else:  # COLLABORATIVE
                result = await self._execute_collaborative(ir, filename, resume_text)

            result.strategy_used = strategy
            result.processing_time_ms = int(
                (datetime.now() - start_time).total_seconds() * 1000
            )

            return result

        except Exception as e:
            logger.error(f"[CollaborativeOrchestrator] Error: {e}", exc_info=True)
            return CollaborativeOrchestratorResult(
                success=False,
                error=str(e),
                processing_time_ms=int(
                    (datetime.now() - start_time).total_seconds() * 1000
                ),
            )

    def _select_strategy(self, ir: SemanticIR) -> AnalysisStrategy:
        """문서 복잡도 기반 전략 선택"""
        page_count = ir.metadata.get("page_count", 1)
        text_length = len(ir.raw_text)

        # Feature flag 체크
        if not self.config.use_parallel_extraction:
            return AnalysisStrategy.SIMPLE

        # 협업 모드 활성화 여부
        collaborative_enabled = (
            self.config.use_shared_context or
            self.config.use_communication_bus or
            self.config.use_feedback_loop
        )

        # 복잡도 판단
        is_simple = (
            page_count <= settings.COMPLEXITY_THRESHOLD_SIMPLE and
            text_length < 3000
        )

        is_complex = (
            page_count > settings.COMPLEXITY_THRESHOLD_MEDIUM or
            text_length > 10000
        )

        if is_simple:
            return AnalysisStrategy.SIMPLE
        elif is_complex and collaborative_enabled:
            return AnalysisStrategy.COLLABORATIVE
        else:
            return AnalysisStrategy.PARALLEL

    async def _execute_simple(
        self,
        resume_text: str,
        filename: Optional[str],
    ) -> CollaborativeOrchestratorResult:
        """SIMPLE 전략: 기존 AnalystAgent 사용"""
        from agents.analyst_agent import get_analyst_agent

        analyst = get_analyst_agent()
        result = await analyst.analyze(resume_text, filename=filename)

        return CollaborativeOrchestratorResult(
            success=result.success,
            data=result.data,
            confidence_score=result.confidence_score,
            field_confidence=result.field_confidence,
            warnings=[w.to_dict() for w in result.warnings] if result.warnings else [],
            error=result.error,
        )

    async def _execute_parallel(
        self,
        ir: SemanticIR,
        filename: Optional[str],
        full_text: str,
    ) -> CollaborativeOrchestratorResult:
        """PARALLEL 전략: 병렬 추출 (컨텍스트 공유 없음)"""
        self._init_extractors()

        # 섹션별 텍스트 준비
        sections = self._prepare_sections(ir, full_text)

        # 병렬 추출 실행
        tasks = []
        for section_name, extractor in self._extractors.items():
            section_text = sections.get(section_name, "")
            if section_text:
                tasks.append(extractor.extract(section_text, filename, full_text))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 결과 병합
        return self._merge_extraction_results(results)

    async def _execute_collaborative(
        self,
        ir: SemanticIR,
        filename: Optional[str],
        full_text: str,
    ) -> CollaborativeOrchestratorResult:
        """
        COLLABORATIVE 전략: 협업 + 피드백 루프

        Phase 1: 초기 추출 (병렬, Shared Context 사용)
        Phase 2: 컨텍스트 기반 재추출 (의존성 있는 필드)
        Phase 3: Quality Agents + Feedback Loop
        """
        self._init_extractors()
        self._init_quality_agents()

        # 협업 인프라 초기화
        context = SharedExtractionContext()
        bus = AgentCommunicationBus()

        # Agent에 협업 인프라 연결
        for extractor in self._extractors.values():
            extractor.set_collaboration(context, bus)

        sections = self._prepare_sections(ir, full_text)
        collaboration_metrics = {
            "phase1_extractions": 0,
            "phase2_reextractions": 0,
            "feedback_loop_iterations": 0,
            "total_messages": 0,
        }

        # ═══════════════════════════════════════════════════════════════
        # Phase 1: 초기 추출 (의존성 순서대로)
        # ═══════════════════════════════════════════════════════════════
        logger.info("[CollaborativeOrchestrator] Phase 1: Initial extraction")

        # Profile 먼저 (다른 Agent가 의존)
        profile_text = sections.get("profile", full_text[:1000])
        await self._extractors["profile"].extract(profile_text, filename, full_text)
        collaboration_metrics["phase1_extractions"] += 1

        # 나머지 병렬 추출 (Profile 이후)
        other_tasks = []
        for name, extractor in self._extractors.items():
            if name != "profile":
                section_text = sections.get(name, "")
                if section_text:
                    other_tasks.append(extractor.extract(section_text, filename, full_text))

        await asyncio.gather(*other_tasks, return_exceptions=True)
        collaboration_metrics["phase1_extractions"] += len(other_tasks)

        # ═══════════════════════════════════════════════════════════════
        # Phase 2: Feedback Loop (불확실한 필드 재추출)
        # ═══════════════════════════════════════════════════════════════
        feedback_result = None
        if self.config.use_feedback_loop:
            logger.info("[CollaborativeOrchestrator] Phase 2: Feedback loop")

            feedback_manager = get_feedback_manager()
            feedback_result = await feedback_manager.run_feedback_loop(
                context=context,
                bus=bus,
                confidence_threshold=settings.LLM_CONFIDENCE_THRESHOLD,
                max_iterations=2
            )

            collaboration_metrics["phase2_reextractions"] = feedback_result.total_reextractions
            collaboration_metrics["feedback_loop_iterations"] = len(feedback_result.fields_reextracted)

        # ═══════════════════════════════════════════════════════════════
        # Phase 3: Quality Agents
        # ═══════════════════════════════════════════════════════════════
        quality_reports = {}
        extracted_data = context.get_all()

        if self.config.use_self_reflection:
            reflection = self._quality_agents["reflection"]
            reflection_result = await reflection.reflect(
                extracted_data,
                full_text,
                filename,
            )
            quality_reports["reflection"] = {
                "issues_found": len(reflection_result.issues_found),
                "corrections": reflection_result.corrections,
            }

            # 수정 사항 반영
            for correction in reflection_result.corrections:
                field_name = correction.get("field")
                new_value = correction.get("corrected_value")
                if field_name and new_value is not None:
                    await context.publish(
                        "reflection_agent",
                        field_name,
                        new_value,
                        0.9
                    )

        if self.config.use_hallucination_detection:
            detector = self._quality_agents["hallucination"]
            hallucination_result = await detector.detect(
                context.get_all(),
                full_text,
            )
            quality_reports["hallucination"] = {
                "count": hallucination_result.hallucination_count,
                "fields": hallucination_result.hallucination_fields,
            }

        # 최종 결과 구성
        final_data = context.get_all()
        all_metadata = context.get_all_with_metadata()

        field_confidence = {
            field: data.confidence
            for field, data in all_metadata.items()
        }

        overall_confidence = (
            sum(field_confidence.values()) / len(field_confidence)
            if field_confidence else 0.0
        )

        return CollaborativeOrchestratorResult(
            success=True,
            data=final_data,
            confidence_score=overall_confidence,
            field_confidence=field_confidence,
            quality_reports=quality_reports,
            feedback_loop_result=feedback_result,
            context_summary=context.to_dict(),
            collaboration_metrics=collaboration_metrics,
        )

    def _prepare_sections(
        self,
        ir: SemanticIR,
        full_text: str
    ) -> Dict[str, str]:
        """섹션별 텍스트 준비"""
        sections = {}

        # 프로필: 상단 1000자 또는 profile 섹션
        profile_block = ir.get_section("profile")
        sections["profile"] = profile_block.text if profile_block else full_text[:1000]

        # 나머지 섹션
        section_mapping = {
            "career": ["career", "experience", "work"],
            "education": ["education", "학력"],
            "skill": ["skills", "기술"],
            "project": ["projects", "프로젝트"],
        }

        for section_name, labels in section_mapping.items():
            for label in labels:
                block = ir.get_section(label)
                if block:
                    sections[section_name] = block.text
                    break
            else:
                sections[section_name] = ""

        return sections

    def _merge_extraction_results(
        self,
        results: List[Any]
    ) -> CollaborativeOrchestratorResult:
        """추출 결과 병합"""
        merged_data = {}
        total_confidence = 0.0
        field_count = 0
        warnings = []
        sub_agent_results = {}

        extractor_names = list(self._extractors.keys())

        for i, result in enumerate(results):
            extractor_name = extractor_names[i] if i < len(extractor_names) else f"agent_{i}"

            if isinstance(result, Exception):
                warnings.append(f"{extractor_name} extraction failed: {result}")
                continue

            if result and result.success:
                sub_agent_results[extractor_name] = result.to_dict()
                merged_data.update(result.data or {})
                total_confidence += result.confidence
                field_count += 1

        overall_confidence = total_confidence / max(field_count, 1)

        return CollaborativeOrchestratorResult(
            success=True,
            data=merged_data,
            confidence_score=overall_confidence,
            warnings=warnings,
            sub_agent_results=sub_agent_results,
        )


# 싱글톤
_collaborative_orchestrator: Optional[CollaborativeOrchestrator] = None


def get_collaborative_orchestrator() -> CollaborativeOrchestrator:
    global _collaborative_orchestrator
    if _collaborative_orchestrator is None:
        _collaborative_orchestrator = CollaborativeOrchestrator()
    return _collaborative_orchestrator
```

**예상 작업량**: 12시간

---

### Phase 2: 품질 강화 (3주)

(기존 Phase 2 내용 유지 - Self-Reflection, Hallucination Detection, Consensus Voting)

**주요 변경사항:**
- Quality Agent들이 Communication Bus를 통해 재확인 요청 가능
- Shared Context를 통해 전체 추출 결과 참조 가능

---

### Phase 3: 통합 및 최적화 (2주)

(기존 Phase 3 내용 유지 - 캐싱, AnalystAgent 통합)

---

### Phase 4: 고급 협업 기능 (2주) [NEW]

#### 3.4.1 Week 11: 의존성 기반 실행 순서 최적화

##### Task 4.1: Dependency Tracker 구현
**파일**: `collaboration/dependency_tracker.py`

```python
"""
Dependency Tracker - 필드 의존성 추적 및 실행 순서 최적화
"""

from typing import Dict, List, Set
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class DependencyGraph:
    """의존성 그래프"""
    nodes: Set[str]  # 모든 필드
    edges: Dict[str, List[str]]  # field -> 의존하는 필드들

    def get_execution_order(self) -> List[List[str]]:
        """
        위상 정렬로 실행 순서 결정

        Returns:
            단계별 실행 가능한 필드 목록
            예: [["name", "phone"], ["careers"], ["projects"]]
        """
        # 진입 차수 계산
        in_degree = {node: 0 for node in self.nodes}
        for deps in self.edges.values():
            for dep in deps:
                if dep in in_degree:
                    in_degree[dep] += 1

        # 위상 정렬
        result = []
        remaining = set(self.nodes)

        while remaining:
            # 진입 차수가 0인 노드들
            ready = {
                node for node in remaining
                if in_degree.get(node, 0) == 0
            }

            if not ready:
                # 순환 의존성 감지
                logger.warning(f"[DependencyTracker] Circular dependency detected: {remaining}")
                ready = remaining  # 나머지 모두 실행

            result.append(list(ready))
            remaining -= ready

            # 진입 차수 업데이트
            for node in ready:
                for dep_node, deps in self.edges.items():
                    if node in deps:
                        in_degree[dep_node] -= 1

        return result


class DependencyTracker:
    """
    필드 의존성 추적기

    Agent 실행 순서를 최적화합니다.
    """

    # 기본 의존성 정의
    DEFAULT_DEPENDENCIES = {
        # Profile Agent (의존성 없음)
        "name": [],
        "phone": [],
        "email": [],
        "birth_year": [],

        # Career Agent (이름 참조 가능)
        "careers": ["name"],
        "exp_years": ["careers"],
        "last_company": ["careers"],
        "last_position": ["careers"],

        # Education Agent
        "educations": ["name"],

        # Skill Agent (경력, 프로젝트 참조)
        "skills": ["careers", "projects"],

        # Project Agent (이름, 회사 참조)
        "projects": ["name", "last_company"],

        # Summary (모든 정보 참조)
        "summary": ["name", "careers", "skills", "educations"],
        "strengths": ["careers", "skills", "projects"],
    }

    def __init__(self, dependencies: Dict[str, List[str]] = None):
        self.dependencies = dependencies or self.DEFAULT_DEPENDENCIES

    def build_graph(self, fields: List[str]) -> DependencyGraph:
        """특정 필드들에 대한 의존성 그래프 생성"""
        nodes = set(fields)
        edges = {
            field: [d for d in self.dependencies.get(field, []) if d in nodes]
            for field in fields
        }
        return DependencyGraph(nodes=nodes, edges=edges)

    def get_agent_execution_order(self) -> List[List[str]]:
        """
        Agent 실행 순서 반환

        Returns:
            단계별 실행할 Agent 목록
            예: [["profile"], ["career", "education"], ["skill", "project"]]
        """
        # Agent별 담당 필드
        agent_fields = {
            "profile": ["name", "phone", "email", "birth_year"],
            "career": ["careers", "exp_years", "last_company", "last_position"],
            "education": ["educations"],
            "skill": ["skills"],
            "project": ["projects"],
        }

        # 각 Agent의 의존 Agent 계산
        agent_deps = {}
        for agent, fields in agent_fields.items():
            deps = set()
            for field in fields:
                field_deps = self.dependencies.get(field, [])
                for dep_field in field_deps:
                    # dep_field를 담당하는 Agent 찾기
                    for other_agent, other_fields in agent_fields.items():
                        if dep_field in other_fields and other_agent != agent:
                            deps.add(other_agent)
            agent_deps[agent] = list(deps)

        # 위상 정렬
        graph = DependencyGraph(
            nodes=set(agent_fields.keys()),
            edges=agent_deps
        )
        return graph.get_execution_order()


# 싱글톤
_tracker: Optional[DependencyTracker] = None


def get_dependency_tracker() -> DependencyTracker:
    global _tracker
    if _tracker is None:
        _tracker = DependencyTracker()
    return _tracker
```

**예상 작업량**: 6시간

#### 3.4.2 Week 12: 협업 메트릭 및 모니터링

##### Task 4.2: 협업 메트릭 수집
**파일**: `services/collaboration_metrics.py`

```python
"""
Collaboration Metrics - Agent 협업 메트릭 수집 및 모니터링
"""

from typing import Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class CollaborationMetrics:
    """협업 메트릭"""
    # 컨텍스트 공유
    context_publishes: int = 0
    context_reads: int = 0
    context_wait_timeouts: int = 0

    # Communication Bus
    messages_sent: int = 0
    recheck_requests: int = 0
    recheck_successes: int = 0
    query_responses: int = 0

    # Feedback Loop
    feedback_iterations: int = 0
    fields_reextracted: int = 0
    confidence_improvements: int = 0

    # 품질
    hallucinations_detected: int = 0
    corrections_made: int = 0

    # 타이밍
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "context": {
                "publishes": self.context_publishes,
                "reads": self.context_reads,
                "wait_timeouts": self.context_wait_timeouts,
            },
            "communication": {
                "messages_sent": self.messages_sent,
                "recheck_requests": self.recheck_requests,
                "recheck_successes": self.recheck_successes,
                "query_responses": self.query_responses,
            },
            "feedback_loop": {
                "iterations": self.feedback_iterations,
                "fields_reextracted": self.fields_reextracted,
                "confidence_improvements": self.confidence_improvements,
            },
            "quality": {
                "hallucinations_detected": self.hallucinations_detected,
                "corrections_made": self.corrections_made,
            },
            "timing": {
                "duration_ms": (
                    int((self.end_time - self.start_time).total_seconds() * 1000)
                    if self.end_time else None
                ),
            },
        }


class CollaborationMetricsCollector:
    """협업 메트릭 수집기"""

    def __init__(self):
        self._current_metrics: Optional[CollaborationMetrics] = None
        self._history: List[CollaborationMetrics] = []

    def start_session(self) -> None:
        """세션 시작"""
        self._current_metrics = CollaborationMetrics()

    def end_session(self) -> CollaborationMetrics:
        """세션 종료"""
        if self._current_metrics:
            self._current_metrics.end_time = datetime.now()
            self._history.append(self._current_metrics)
            metrics = self._current_metrics
            self._current_metrics = None
            return metrics
        return CollaborationMetrics()

    def record_context_publish(self) -> None:
        if self._current_metrics:
            self._current_metrics.context_publishes += 1

    def record_context_read(self) -> None:
        if self._current_metrics:
            self._current_metrics.context_reads += 1

    def record_context_timeout(self) -> None:
        if self._current_metrics:
            self._current_metrics.context_wait_timeouts += 1

    def record_message_sent(self) -> None:
        if self._current_metrics:
            self._current_metrics.messages_sent += 1

    def record_recheck_request(self, success: bool = False) -> None:
        if self._current_metrics:
            self._current_metrics.recheck_requests += 1
            if success:
                self._current_metrics.recheck_successes += 1

    def record_feedback_iteration(self, fields_reextracted: int = 0) -> None:
        if self._current_metrics:
            self._current_metrics.feedback_iterations += 1
            self._current_metrics.fields_reextracted += fields_reextracted

    def record_quality_issue(
        self,
        hallucinations: int = 0,
        corrections: int = 0
    ) -> None:
        if self._current_metrics:
            self._current_metrics.hallucinations_detected += hallucinations
            self._current_metrics.corrections_made += corrections

    def get_summary(self) -> Dict[str, Any]:
        """전체 요약 통계"""
        if not self._history:
            return {}

        total_sessions = len(self._history)
        total_recheck = sum(m.recheck_requests for m in self._history)
        total_success = sum(m.recheck_successes for m in self._history)

        return {
            "total_sessions": total_sessions,
            "avg_context_publishes": sum(m.context_publishes for m in self._history) / total_sessions,
            "avg_feedback_iterations": sum(m.feedback_iterations for m in self._history) / total_sessions,
            "recheck_success_rate": total_success / total_recheck if total_recheck > 0 else 0,
            "avg_hallucinations": sum(m.hallucinations_detected for m in self._history) / total_sessions,
        }


# 싱글톤
_collector: Optional[CollaborationMetricsCollector] = None


def get_collaboration_metrics_collector() -> CollaborationMetricsCollector:
    global _collector
    if _collector is None:
        _collector = CollaborationMetricsCollector()
    return _collector
```

**예상 작업량**: 6시간

---

## 4. 테스트 계획

### 4.1 협업 기능 테스트

```python
# tests/collaboration/test_shared_context.py

import pytest
import asyncio
from collaboration.shared_context import SharedExtractionContext, FieldStatus


@pytest.mark.asyncio
async def test_publish_and_get():
    """발행 및 조회 테스트"""
    context = SharedExtractionContext()

    await context.publish("profile", "name", "김경민", 0.95)

    assert context.get("name") == "김경민"
    assert context.get_confidence("name") == 0.95


@pytest.mark.asyncio
async def test_wait_for_field():
    """필드 대기 테스트"""
    context = SharedExtractionContext()

    # 백그라운드에서 발행
    async def publish_later():
        await asyncio.sleep(0.1)
        await context.publish("profile", "name", "홍길동", 0.9)

    asyncio.create_task(publish_later())

    # 대기
    value = await context.wait_for("name", timeout_ms=1000)
    assert value == "홍길동"


@pytest.mark.asyncio
async def test_dependencies():
    """의존성 확인 테스트"""
    context = SharedExtractionContext()

    # 의존성이 준비되지 않은 상태
    assert not context.are_dependencies_ready("careers")

    # name 발행
    await context.publish("profile", "name", "김철수", 0.9)

    # 이제 careers의 의존성 준비됨
    assert context.are_dependencies_ready("careers")
```

```python
# tests/collaboration/test_communication_bus.py

import pytest
import asyncio
from collaboration.communication_bus import (
    AgentCommunicationBus,
    AgentMessage,
    MessageType
)


@pytest.mark.asyncio
async def test_recheck_request():
    """재확인 요청 테스트"""
    bus = AgentCommunicationBus()

    # Career Agent 핸들러 등록
    async def career_handler(message):
        if message.message_type == MessageType.REQUEST_RECHECK:
            return {"company": "네이버 (수정됨)"}
        return None

    bus.register_handler("career", career_handler)

    # Quality Agent가 재확인 요청
    result = await bus.request_recheck(
        from_agent="quality",
        to_agent="career",
        field="careers",
        reason="회사명 확인 필요",
        timeout_ms=5000
    )

    assert result == {"company": "네이버 (수정됨)"}


@pytest.mark.asyncio
async def test_broadcast():
    """브로드캐스트 테스트"""
    bus = AgentCommunicationBus()
    received = []

    async def handler(message):
        received.append(message.from_agent)

    bus.register_handler("career", handler)
    bus.register_handler("education", handler)

    await bus.broadcast(
        from_agent="profile",
        message_type=MessageType.CONFIRM,
        content={"field": "name", "value": "김경민"}
    )

    # profile 제외하고 모두 수신
    assert len(received) == 2
    assert "profile" not in received
```

### 4.2 통합 테스트

```python
# tests/agents/test_collaborative_orchestrator.py

import pytest
from agents.orchestrator.collaborative_orchestrator import (
    CollaborativeOrchestrator,
    CollaborativeOrchestratorConfig,
    AnalysisStrategy,
)


@pytest.fixture
def orchestrator():
    config = CollaborativeOrchestratorConfig(
        use_parallel_extraction=True,
        use_shared_context=True,
        use_communication_bus=True,
        use_feedback_loop=True,
        use_hallucination_detection=True,
    )
    return CollaborativeOrchestrator(config)


@pytest.mark.asyncio
async def test_collaborative_strategy(orchestrator):
    """COLLABORATIVE 전략 테스트"""
    complex_resume = """김경민
010-1234-5678
kim@example.com

경력사항:
네이버 (2020.03 ~ 현재) - 백엔드 개발자
삼성전자 (2015.03 ~ 2020.02) - 소프트웨어 엔지니어

학력:
서울대학교 컴퓨터공학과 졸업

스킬:
Python, Java, AWS, Docker
"""

    result = await orchestrator.analyze(
        complex_resume,
        filename="김경민_이력서.pdf",
        force_strategy=AnalysisStrategy.COLLABORATIVE,
    )

    assert result.success
    assert result.strategy_used == AnalysisStrategy.COLLABORATIVE
    assert result.data.get("name") == "김경민"
    assert result.collaboration_metrics.get("phase1_extractions", 0) > 0


@pytest.mark.asyncio
async def test_context_sharing(orchestrator):
    """컨텍스트 공유 테스트"""
    resume = """홍길동
경력: 현 직장에서 3년 근무"""  # 회사명 없음

    result = await orchestrator.analyze(
        resume,
        filename="홍길동_네이버_이력서.pdf",  # 파일명에 힌트
        force_strategy=AnalysisStrategy.COLLABORATIVE,
    )

    assert result.success
    # 이름이 공유되어 Career Agent도 참조 가능
    assert result.data.get("name") == "홍길동"
```

---

## 5. 롤아웃 계획 (업데이트)

### 5.1 Feature Flag 기반 점진적 배포

```yaml
# Phase 1: 기반 + 컨텍스트 공유 (Week 1-3)
USE_PARALLEL_EXTRACTION: true
USE_SHARED_CONTEXT: true         # v2.0 활성화!
USE_COMMUNICATION_BUS: false
USE_FEEDBACK_LOOP: false
USE_SELF_REFLECTION: false
USE_HALLUCINATION_DETECTION: true

# Phase 2: 품질 강화 (Week 4-6)
USE_PARALLEL_EXTRACTION: true
USE_SHARED_CONTEXT: true
USE_COMMUNICATION_BUS: true      # v2.0 활성화!
USE_FEEDBACK_LOOP: false
USE_SELF_REFLECTION: true
USE_HALLUCINATION_DETECTION: true

# Phase 3: 통합 + 피드백 루프 (Week 7-9)
USE_PARALLEL_EXTRACTION: true
USE_SHARED_CONTEXT: true
USE_COMMUNICATION_BUS: true
USE_FEEDBACK_LOOP: true          # v2.0 활성화!
USE_SELF_REFLECTION: true
USE_HALLUCINATION_DETECTION: true
USE_CONSENSUS_VOTING: true

# Phase 4: 전체 배포 (Week 10-12)
USE_PARALLEL_EXTRACTION: true
USE_SHARED_CONTEXT: true
USE_COMMUNICATION_BUS: true
USE_FEEDBACK_LOOP: true
USE_SELF_REFLECTION: true
USE_HALLUCINATION_DETECTION: true
USE_CONSENSUS_VOTING: true
USE_DYNAMIC_MODEL_SELECTION: true
USE_PROMPT_CACHE: true
```

---

## 6. 리스크 및 완화 전략 (업데이트)

| 리스크 | 영향 | 확률 | 완화 전략 |
|--------|------|------|-----------|
| LLM 비용 증가 | 높음 | 중간 | 동적 모델 선택, 캐싱, 조건부 호출 |
| 처리 시간 증가 | 중간 | 중간 | 병렬 처리, 의존성 기반 실행 최적화 |
| 품질 저하 | 높음 | 낮음 | Self-Reflection, Hallucination Detection, Feedback Loop |
| API 장애 | 높음 | 낮음 | 다중 Provider Fallback |
| 복잡도 증가 | 높음 | 높음 | Feature Flag 기반 점진적 활성화, 메트릭 모니터링 |
| **협업 데드락** | 높음 | 중간 | **타임아웃 설정, 의존성 순환 감지 (v2.0)** |
| **메시지 유실** | 중간 | 낮음 | **재시도 로직, 메시지 로깅 (v2.0)** |

---

## 7. 일정 요약 (업데이트)

| Phase | 기간 | 주요 산출물 | 핵심 변경 |
|-------|------|-------------|-----------|
| **Phase 1** | Week 1-3 | Shared Context, Communication Bus, Feedback Loop | **Agent 협업 인프라 (v2.0)** |
| **Phase 2** | Week 4-6 | Self-Reflection, Hallucination Detector, Consensus Agent | 품질 Agent (기존) |
| **Phase 3** | Week 7-9 | Orchestrator 통합, 캐싱 | 통합 + 최적화 |
| **Phase 4** | Week 10-12 | 의존성 추적, 협업 메트릭, 전체 배포 | **완전한 협업 시스템 (v2.0)** |

**총 예상 기간: 12주 (약 3개월)** (+2주 from v1.0)

---

## 8. 부록

### A. v2.0 주요 변경 사항 요약

| 구분 | v1.0 | v2.0 |
|------|------|------|
| Agent 간 데이터 공유 | 결과 병합 (post-hoc) | Shared Context (실시간) |
| Agent 간 통신 | 없음 | Communication Bus |
| 재추출 메커니즘 | 값 교체만 | Feedback Loop (실제 재추출) |
| 의존성 관리 | 없음 | Dependency Tracker |
| 협업 메트릭 | 없음 | CollaborationMetricsCollector |

### B. 협업 시나리오 예시

```
시나리오: "현 직장에서 3년 근무" (회사명 없음)

v1.0 (기존):
1. Career Agent: company=null (회사명 없음)
2. Quality Agent: "회사명 누락" 경고
3. 결과: company 필드 비어있음

v2.0 (협업):
1. Profile Agent: name="홍길동" 발행 → Context
2. Career Agent: Context에서 name 참조, 파일명에서 "네이버" 발견
3. Career Agent: company="네이버" (추론) 발행, confidence=0.6
4. Quality Agent: confidence < 0.7, 재확인 요청 → Bus
5. Career Agent: 재추출 수행, company="네이버" 확정, confidence=0.85
6. 결과: company="네이버" (협업으로 해결)
```

### C. 용어 정의 (업데이트)

- **Shared Context**: Agent 간 실시간 데이터 공유 저장소
- **Communication Bus**: Agent 간 메시지 교환 채널
- **Feedback Loop**: 불확실한 필드의 재추출 메커니즘
- **Dependency Tracker**: 필드 간 의존성 추적 및 실행 순서 최적화

---

**문서 끝**
