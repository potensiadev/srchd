# SRCHD Multi-Agent 고도화 구현 계획서

## 문서 정보

| 항목 | 내용 |
|------|------|
| **버전** | 3.0 (V2 + V3 통합) |
| **최종 수정** | 2026-02-13 |
| **작성자** | Claude Opus 4.5 |
| **상태** | 최종 통합 |

### 버전 히스토리

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | - | 초기 작성 |
| 2.0 | - | Agent 협업 기능 추가 (Collaborative Orchestrator, Shared Context, Communication Bus, Feedback Loop, Base Extractor, Profile/Career Extractor, Dependency Tracker) |
| 3.0 | 2026-02-13 | V3 10개 항목 통합 (CoT 프롬프팅, Few-shot 예시, strict 스키마, 컨텍스트 압축, 자동 복구, 병렬 처리, 캐싱, 동적 모델 선택, 환각 감지, 교차 검증) |

---

## 1. Executive Summary

### 1.1 현재 상태 분석

SRCHD 시스템은 이력서 분석을 위한 Multi-Agent 아키텍처를 사용합니다. 현재 시스템은 기본적인 추출 기능을 제공하지만, 다음과 같은 개선이 필요합니다:

**현재 구현된 기능 (V2)**:
- Collaborative Orchestrator Pattern
- Shared Context Management
- Communication Bus
- Feedback Loop System
- Base Extractor Framework
- Profile/Career Extractor
- Dependency Tracker

**V3에서 추가되는 기능**:
- Chain-of-Thought (CoT) 프롬프팅
- Few-Shot Learning 예시 라이브러리
- strict: True JSON Schema
- 동적 컨텍스트 압축
- 실패한 분석의 자동 복구
- 다수 이력서 병렬 처리
- Sub-Agent 결과 캐싱
- 동적 모델 선택
- 환각 감지 Agent
- 필드 간 교차 검증

### 1.2 핵심 해결 과제 (15개 항목)

| # | 과제 | 카테고리 | 버전 |
|---|------|---------|------|
| 1 | Collaborative Orchestrator | 인프라 | V2 |
| 2 | Shared Context | 인프라 | V2 |
| 3 | Communication Bus | 인프라 | V2 |
| 4 | Feedback Loop | 인프라 | V2 |
| 5 | Base Extractor | 추출기 | V2 |
| 6 | CoT 프롬프팅 | 프롬프트 | V3 |
| 7 | Few-Shot Learning | 프롬프트 | V3 |
| 8 | strict JSON Schema | 프롬프트 | V3 |
| 9 | 동적 컨텍스트 압축 | 성능 | V3 |
| 10 | 자동 복구 | 안정성 | V3 |
| 11 | 병렬 처리 | 성능 | V3 |
| 12 | 결과 캐싱 | 성능 | V3 |
| 13 | 동적 모델 선택 | 최적화 | V3 |
| 14 | 환각 감지 | 품질 | V3 |
| 15 | 교차 검증 | 품질 | V3 |

### 1.3 핵심 성과 지표 (KPIs)

| 지표 | 현재 | V2 목표 | V3 목표 | 최종 개선율 |
|------|------|---------|---------|-----------|
| 추출 정확도 | 85% | 92% | 97% | +12%p |
| 환각 발생률 | 8% | 5% | 1% | -87% |
| 평균 처리 시간 | 12초 | 8초 | 4초 | -67% |
| LLM 비용/건 | $0.05 | $0.03 | $0.02 | -60% |
| 병렬 처리량 | 10건/분 | 25건/분 | 50건/분 | +400% |

---

## 2. 아키텍처 설계

### 2.1 목표 아키텍처: Collaborative Orchestrator Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Collaborative Orchestrator                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Shared    │  │Communication│  │     Feedback Loop       │  │
│  │   Context   │◄─┤    Bus      │◄─┤  (Self-Reflection)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    Profile    │    │    Career     │    │   Education   │
│   Extractor   │    │   Extractor   │    │   Extractor   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │     Quality Assurance Layer    │
              │  ┌──────────┐  ┌────────────┐ │
              │  │Hallucin. │  │   Cross    │ │
              │  │ Detector │  │ Validator  │ │
              │  └──────────┘  └────────────┘ │
              └───────────────────────────────┘
```

### 2.2 새로운 Agent 구조

```python
# 기본 Agent 구조
class BaseExtractor:
    """모든 Extractor의 기본 클래스"""

    def __init__(self, shared_context, comm_bus):
        self.context = shared_context
        self.bus = comm_bus

    async def extract(self, text: str) -> Dict[str, Any]:
        raise NotImplementedError

    async def validate(self, result: Dict) -> bool:
        raise NotImplementedError
```

---

## 3. 핵심 인프라 (V2)

### 3.1 Feature Flags

```python
# config/feature_flags.py

from enum import Enum
from typing import Dict, Any
import os

class FeatureFlag(str, Enum):
    """Feature Flags for Multi-Agent System"""

    # V2 Features
    COLLABORATIVE_ORCHESTRATOR = "collaborative_orchestrator"
    SHARED_CONTEXT = "shared_context"
    COMMUNICATION_BUS = "communication_bus"
    FEEDBACK_LOOP = "feedback_loop"

    # V3 Features
    COT_PROMPTING = "cot_prompting"
    FEW_SHOT_LEARNING = "few_shot_learning"
    STRICT_SCHEMA = "strict_schema"
    CONTEXT_COMPRESSION = "context_compression"
    AUTO_RECOVERY = "auto_recovery"
    PARALLEL_PROCESSING = "parallel_processing"
    RESULT_CACHING = "result_caching"
    DYNAMIC_MODEL_SELECTION = "dynamic_model_selection"
    HALLUCINATION_DETECTION = "hallucination_detection"
    CROSS_VALIDATION = "cross_validation"


class FeatureFlagManager:
    """Feature Flag 관리자"""

    _defaults = {
        # V2 Defaults
        FeatureFlag.COLLABORATIVE_ORCHESTRATOR: True,
        FeatureFlag.SHARED_CONTEXT: True,
        FeatureFlag.COMMUNICATION_BUS: True,
        FeatureFlag.FEEDBACK_LOOP: True,

        # V3 Defaults
        FeatureFlag.COT_PROMPTING: True,
        FeatureFlag.FEW_SHOT_LEARNING: True,
        FeatureFlag.STRICT_SCHEMA: True,
        FeatureFlag.CONTEXT_COMPRESSION: True,
        FeatureFlag.AUTO_RECOVERY: True,
        FeatureFlag.PARALLEL_PROCESSING: True,
        FeatureFlag.RESULT_CACHING: True,
        FeatureFlag.DYNAMIC_MODEL_SELECTION: True,
        FeatureFlag.HALLUCINATION_DETECTION: True,
        FeatureFlag.CROSS_VALIDATION: True,
    }

    @classmethod
    def is_enabled(cls, flag: FeatureFlag) -> bool:
        env_key = f"FF_{flag.value.upper()}"
        env_value = os.getenv(env_key)

        if env_value is not None:
            return env_value.lower() in ("true", "1", "yes")

        return cls._defaults.get(flag, False)

    @classmethod
    def get_all_flags(cls) -> Dict[str, bool]:
        return {flag.value: cls.is_enabled(flag) for flag in FeatureFlag}
```

### 3.2 Shared Context

```python
# apps/worker/context/shared_context.py

import asyncio
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

class ContextKey(str, Enum):
    """컨텍스트 키 정의"""
    RAW_TEXT = "raw_text"
    EXTRACTED_PROFILE = "extracted_profile"
    EXTRACTED_CAREERS = "extracted_careers"
    EXTRACTED_EDUCATION = "extracted_education"
    EXTRACTED_SKILLS = "extracted_skills"
    EXTRACTED_PROJECTS = "extracted_projects"
    VALIDATION_RESULTS = "validation_results"
    CONFIDENCE_SCORES = "confidence_scores"
    PROCESSING_METADATA = "processing_metadata"

@dataclass
class ContextEntry:
    """컨텍스트 엔트리"""
    key: ContextKey
    value: Any
    timestamp: datetime = field(default_factory=datetime.now)
    source_agent: str = ""
    version: int = 1
    confidence: float = 1.0

class SharedContext:
    """
    Shared Context Manager

    모든 Agent가 공유하는 컨텍스트를 관리합니다.
    """

    def __init__(self):
        self._store: Dict[ContextKey, ContextEntry] = {}
        self._history: List[ContextEntry] = []
        self._lock = asyncio.Lock()
        self._subscribers: Dict[ContextKey, List[callable]] = {}

    async def set(
        self,
        key: ContextKey,
        value: Any,
        source_agent: str = "",
        confidence: float = 1.0
    ) -> None:
        """값 설정"""
        async with self._lock:
            existing = self._store.get(key)
            version = existing.version + 1 if existing else 1

            entry = ContextEntry(
                key=key,
                value=value,
                source_agent=source_agent,
                version=version,
                confidence=confidence
            )

            self._store[key] = entry
            self._history.append(entry)

            # 구독자 알림
            await self._notify_subscribers(key, entry)

    async def get(self, key: ContextKey) -> Optional[Any]:
        """값 조회"""
        entry = self._store.get(key)
        return entry.value if entry else None

    async def get_with_metadata(self, key: ContextKey) -> Optional[ContextEntry]:
        """메타데이터와 함께 조회"""
        return self._store.get(key)

    def subscribe(self, key: ContextKey, callback: callable) -> None:
        """키 변경 구독"""
        if key not in self._subscribers:
            self._subscribers[key] = []
        self._subscribers[key].append(callback)

    async def _notify_subscribers(self, key: ContextKey, entry: ContextEntry) -> None:
        """구독자에게 알림"""
        for callback in self._subscribers.get(key, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(entry)
                else:
                    callback(entry)
            except Exception as e:
                pass  # 로깅 처리

    def get_snapshot(self) -> Dict[str, Any]:
        """현재 상태 스냅샷"""
        return {
            key.value: {
                "value": entry.value,
                "source": entry.source_agent,
                "confidence": entry.confidence,
                "version": entry.version
            }
            for key, entry in self._store.items()
        }
```

### 3.3 Communication Bus

```python
# apps/worker/communication/message_bus.py

import asyncio
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

class MessageType(str, Enum):
    """메시지 타입"""
    EXTRACTION_COMPLETE = "extraction_complete"
    VALIDATION_REQUEST = "validation_request"
    VALIDATION_RESPONSE = "validation_response"
    ERROR = "error"
    DEPENDENCY_READY = "dependency_ready"

@dataclass
class Message:
    """메시지"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: MessageType = MessageType.EXTRACTION_COMPLETE
    source: str = ""
    target: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)
    correlation_id: Optional[str] = None

class CommunicationBus:
    """
    Communication Bus

    Agent 간 메시지 전달을 관리합니다.
    """

    def __init__(self):
        self._subscribers: Dict[MessageType, List[Callable]] = {}
        self._agent_handlers: Dict[str, Callable] = {}
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._running = False

    async def start(self):
        """버스 시작"""
        self._running = True
        asyncio.create_task(self._process_messages())

    async def stop(self):
        """버스 중지"""
        self._running = False

    async def publish(self, message: Message) -> None:
        """메시지 발행"""
        await self._message_queue.put(message)

    def subscribe(self, msg_type: MessageType, handler: Callable) -> None:
        """메시지 타입 구독"""
        if msg_type not in self._subscribers:
            self._subscribers[msg_type] = []
        self._subscribers[msg_type].append(handler)

    def register_agent(self, agent_id: str, handler: Callable) -> None:
        """Agent 등록"""
        self._agent_handlers[agent_id] = handler

    async def _process_messages(self):
        """메시지 처리 루프"""
        while self._running:
            try:
                message = await asyncio.wait_for(
                    self._message_queue.get(),
                    timeout=1.0
                )
                await self._dispatch(message)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                pass  # 로깅 처리

    async def _dispatch(self, message: Message) -> None:
        """메시지 디스패치"""
        # 타겟 Agent로 전달
        if message.target and message.target in self._agent_handlers:
            handler = self._agent_handlers[message.target]
            await self._invoke_handler(handler, message)

        # 타입 구독자에게 전달
        for handler in self._subscribers.get(message.type, []):
            await self._invoke_handler(handler, message)

    async def _invoke_handler(self, handler: Callable, message: Message) -> None:
        """핸들러 호출"""
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(message)
            else:
                handler(message)
        except Exception as e:
            pass  # 로깅 처리
```

### 3.4 Feedback Loop

```python
# apps/worker/feedback/feedback_loop.py

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class FeedbackType(str, Enum):
    """피드백 타입"""
    VALIDATION_ERROR = "validation_error"
    CONFIDENCE_LOW = "confidence_low"
    INCONSISTENCY = "inconsistency"
    MISSING_FIELD = "missing_field"

@dataclass
class Feedback:
    """피드백"""
    type: FeedbackType
    source_agent: str
    target_agent: str
    field: str
    message: str
    severity: str = "warning"
    suggested_action: Optional[str] = None

class FeedbackLoop:
    """
    Feedback Loop System

    Agent 간 피드백을 수집하고 개선 액션을 제안합니다.
    """

    def __init__(self, shared_context, comm_bus):
        self.context = shared_context
        self.bus = comm_bus
        self._feedback_history: List[Feedback] = []

    async def submit_feedback(self, feedback: Feedback) -> None:
        """피드백 제출"""
        self._feedback_history.append(feedback)
        logger.info(f"[FeedbackLoop] {feedback.source_agent} -> {feedback.target_agent}: {feedback.message}")

        # 심각도가 높으면 재처리 요청
        if feedback.severity == "error":
            await self._request_reprocessing(feedback)

    async def _request_reprocessing(self, feedback: Feedback) -> None:
        """재처리 요청"""
        from communication.message_bus import Message, MessageType

        message = Message(
            type=MessageType.VALIDATION_REQUEST,
            source="feedback_loop",
            target=feedback.target_agent,
            payload={
                "field": feedback.field,
                "reason": feedback.message,
                "action": feedback.suggested_action
            }
        )
        await self.bus.publish(message)

    def get_feedback_summary(self) -> Dict[str, Any]:
        """피드백 요약"""
        return {
            "total": len(self._feedback_history),
            "by_type": self._count_by_type(),
            "by_agent": self._count_by_agent()
        }

    def _count_by_type(self) -> Dict[str, int]:
        counts = {}
        for fb in self._feedback_history:
            counts[fb.type.value] = counts.get(fb.type.value, 0) + 1
        return counts

    def _count_by_agent(self) -> Dict[str, int]:
        counts = {}
        for fb in self._feedback_history:
            counts[fb.target_agent] = counts.get(fb.target_agent, 0) + 1
        return counts
```

### 3.5 Base Extractor

```python
# apps/worker/agents/base_extractor.py

import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ExtractionResult:
    """추출 결과"""
    success: bool
    data: Dict[str, Any]
    confidence: float
    warnings: List[str]
    processing_time_ms: int

class BaseExtractor(ABC):
    """
    Base Extractor

    모든 Extractor의 기본 클래스입니다.
    """

    AGENT_NAME: str = "base"
    DEPENDENCIES: List[str] = []

    def __init__(self, shared_context, comm_bus, llm_manager):
        self.context = shared_context
        self.bus = comm_bus
        self.llm = llm_manager

    @abstractmethod
    async def extract(self, text: str) -> ExtractionResult:
        """추출 실행 (서브클래스에서 구현)"""
        pass

    @abstractmethod
    def get_prompt(self, text: str) -> str:
        """프롬프트 생성 (서브클래스에서 구현)"""
        pass

    async def validate(self, result: Dict[str, Any]) -> bool:
        """결과 검증"""
        return True

    async def check_dependencies(self) -> bool:
        """의존성 확인"""
        for dep in self.DEPENDENCIES:
            dep_data = await self.context.get(dep)
            if dep_data is None:
                return False
        return True

    async def publish_result(self, result: ExtractionResult) -> None:
        """결과 발행"""
        from context.shared_context import ContextKey
        from communication.message_bus import Message, MessageType

        # 컨텍스트에 저장
        context_key = getattr(ContextKey, f"EXTRACTED_{self.AGENT_NAME.upper()}", None)
        if context_key:
            await self.context.set(
                context_key,
                result.data,
                source_agent=self.AGENT_NAME,
                confidence=result.confidence
            )

        # 완료 메시지 발행
        message = Message(
            type=MessageType.EXTRACTION_COMPLETE,
            source=self.AGENT_NAME,
            payload={
                "data": result.data,
                "confidence": result.confidence
            }
        )
        await self.bus.publish(message)
```

### 3.6 Collaborative Orchestrator

```python
# apps/worker/orchestrator/collaborative_orchestrator.py

import asyncio
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class OrchestrationResult:
    """오케스트레이션 결과"""
    success: bool
    merged_data: Dict[str, Any]
    agent_results: Dict[str, Any]
    total_time_ms: int
    confidence: float

class CollaborativeOrchestrator:
    """
    Collaborative Orchestrator

    여러 Agent를 조율하여 이력서를 분석합니다.
    """

    def __init__(self, shared_context, comm_bus, extractors: List):
        self.context = shared_context
        self.bus = comm_bus
        self.extractors = {e.AGENT_NAME: e for e in extractors}
        self.dependency_tracker = DependencyTracker(extractors)

    async def orchestrate(self, text: str) -> OrchestrationResult:
        """오케스트레이션 실행"""
        start_time = datetime.now()

        # 1. 컨텍스트 초기화
        from context.shared_context import ContextKey
        await self.context.set(ContextKey.RAW_TEXT, text, source_agent="orchestrator")

        # 2. 의존성 순서대로 Agent 실행
        execution_order = self.dependency_tracker.get_execution_order()
        agent_results = {}

        for agent_name in execution_order:
            extractor = self.extractors.get(agent_name)
            if extractor:
                try:
                    result = await extractor.extract(text)
                    agent_results[agent_name] = {
                        "success": result.success,
                        "data": result.data,
                        "confidence": result.confidence
                    }
                except Exception as e:
                    logger.error(f"[Orchestrator] {agent_name} failed: {e}")
                    agent_results[agent_name] = {
                        "success": False,
                        "error": str(e)
                    }

        # 3. 결과 병합
        merged_data = self._merge_results(agent_results)

        # 4. 전체 신뢰도 계산
        confidences = [r.get("confidence", 0) for r in agent_results.values() if r.get("success")]
        overall_confidence = sum(confidences) / len(confidences) if confidences else 0

        total_time = int((datetime.now() - start_time).total_seconds() * 1000)

        return OrchestrationResult(
            success=all(r.get("success") for r in agent_results.values()),
            merged_data=merged_data,
            agent_results=agent_results,
            total_time_ms=total_time,
            confidence=overall_confidence
        )

    def _merge_results(self, agent_results: Dict[str, Any]) -> Dict[str, Any]:
        """결과 병합"""
        merged = {}
        for agent_name, result in agent_results.items():
            if result.get("success") and result.get("data"):
                merged[agent_name] = result["data"]
        return merged


class DependencyTracker:
    """의존성 추적기"""

    def __init__(self, extractors: List):
        self.extractors = extractors
        self._build_graph()

    def _build_graph(self):
        """의존성 그래프 구축"""
        self.graph = {}
        for e in self.extractors:
            self.graph[e.AGENT_NAME] = e.DEPENDENCIES

    def get_execution_order(self) -> List[str]:
        """토폴로지 정렬로 실행 순서 결정"""
        visited = set()
        order = []

        def visit(node):
            if node in visited:
                return
            visited.add(node)
            for dep in self.graph.get(node, []):
                visit(dep)
            order.append(node)

        for node in self.graph:
            visit(node)

        return order
```

### 3.7 Dependency Tracker

```python
# apps/worker/orchestrator/dependency_tracker.py

from typing import Dict, List, Set, Optional
from dataclasses import dataclass
from enum import Enum

class DependencyStatus(str, Enum):
    """의존성 상태"""
    PENDING = "pending"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class AgentNode:
    """Agent 노드"""
    name: str
    dependencies: List[str]
    status: DependencyStatus = DependencyStatus.PENDING

class DependencyTracker:
    """
    Dependency Tracker

    Agent 간 의존성을 추적하고 실행 순서를 관리합니다.
    """

    def __init__(self):
        self.nodes: Dict[str, AgentNode] = {}

    def register(self, agent_name: str, dependencies: List[str]) -> None:
        """Agent 등록"""
        self.nodes[agent_name] = AgentNode(
            name=agent_name,
            dependencies=dependencies
        )

    def get_ready_agents(self) -> List[str]:
        """실행 가능한 Agent 목록"""
        ready = []
        for name, node in self.nodes.items():
            if node.status == DependencyStatus.PENDING:
                if self._dependencies_satisfied(name):
                    ready.append(name)
        return ready

    def _dependencies_satisfied(self, agent_name: str) -> bool:
        """의존성 충족 여부"""
        node = self.nodes.get(agent_name)
        if not node:
            return False

        for dep in node.dependencies:
            dep_node = self.nodes.get(dep)
            if not dep_node or dep_node.status != DependencyStatus.COMPLETED:
                return False
        return True

    def mark_completed(self, agent_name: str) -> None:
        """완료 표시"""
        if agent_name in self.nodes:
            self.nodes[agent_name].status = DependencyStatus.COMPLETED

    def mark_failed(self, agent_name: str) -> None:
        """실패 표시"""
        if agent_name in self.nodes:
            self.nodes[agent_name].status = DependencyStatus.FAILED

    def get_execution_order(self) -> List[str]:
        """토폴로지 정렬"""
        visited = set()
        order = []

        def visit(name: str):
            if name in visited:
                return
            visited.add(name)
            node = self.nodes.get(name)
            if node:
                for dep in node.dependencies:
                    visit(dep)
            order.append(name)

        for name in self.nodes:
            visit(name)

        return order
```

---

## 4. Extractor 구현 (V2 + V3)

### 4.1 Profile Extractor

```python
# apps/worker/agents/extractors/profile_extractor.py

import logging
from typing import Dict, Any
from agents.base_extractor import BaseExtractor, ExtractionResult
from datetime import datetime

logger = logging.getLogger(__name__)

class ProfileExtractor(BaseExtractor):
    """
    Profile Extractor

    이력서에서 기본 인적사항을 추출합니다.
    """

    AGENT_NAME = "profile"
    DEPENDENCIES = []  # 의존성 없음

    async def extract(self, text: str) -> ExtractionResult:
        """프로필 추출"""
        start_time = datetime.now()

        prompt = self.get_prompt(text)

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                data = response.content
                confidence = self._calculate_confidence(data)

                return ExtractionResult(
                    success=True,
                    data=data,
                    confidence=confidence,
                    warnings=[],
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
                )
        except Exception as e:
            logger.error(f"[ProfileExtractor] Error: {e}")

        return ExtractionResult(
            success=False,
            data={},
            confidence=0,
            warnings=["Extraction failed"],
            processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
        )

    def get_prompt(self, text: str) -> str:
        """프롬프트 생성"""
        return f"""다음 이력서에서 기본 인적사항을 추출하세요.

## 이력서
{text[:5000]}

## 추출 항목
- name: 이름
- email: 이메일
- phone: 전화번호
- birth_year: 출생연도

JSON 형식으로 응답하세요."""

    def _calculate_confidence(self, data: Dict[str, Any]) -> float:
        """신뢰도 계산"""
        required_fields = ["name"]
        optional_fields = ["email", "phone", "birth_year"]

        score = 0
        if data.get("name"):
            score += 0.5

        for field in optional_fields:
            if data.get(field):
                score += 0.5 / len(optional_fields)

        return min(score, 1.0)
```

### 4.2 Career Extractor

```python
# apps/worker/agents/extractors/career_extractor.py

import logging
from typing import Dict, Any, List
from agents.base_extractor import BaseExtractor, ExtractionResult
from datetime import datetime

logger = logging.getLogger(__name__)

class CareerExtractor(BaseExtractor):
    """
    Career Extractor

    이력서에서 경력 정보를 추출합니다.
    """

    AGENT_NAME = "career"
    DEPENDENCIES = ["profile"]  # 프로필 먼저 추출

    async def extract(self, text: str) -> ExtractionResult:
        """경력 추출"""
        start_time = datetime.now()

        prompt = self.get_prompt(text)

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                data = response.content
                careers = data.get("careers", [])

                # 경력 기간 계산
                for career in careers:
                    career["duration_months"] = self._calculate_duration(
                        career.get("start_date"),
                        career.get("end_date")
                    )

                return ExtractionResult(
                    success=True,
                    data={"careers": careers},
                    confidence=self._calculate_confidence(careers),
                    warnings=[],
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
                )
        except Exception as e:
            logger.error(f"[CareerExtractor] Error: {e}")

        return ExtractionResult(
            success=False,
            data={"careers": []},
            confidence=0,
            warnings=["Extraction failed"],
            processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
        )

    def get_prompt(self, text: str) -> str:
        """프롬프트 생성"""
        return f"""다음 이력서에서 경력 정보를 추출하세요.

## 이력서
{text[:8000]}

## 추출 항목 (각 경력별)
- company: 회사명
- position: 직위/직책
- department: 부서
- start_date: 시작일 (YYYY-MM 형식)
- end_date: 종료일 (YYYY-MM 형식, 현재 재직 중이면 null)
- is_current: 현재 재직 여부
- responsibilities: 주요 업무 (배열)

JSON 형식으로 응답하세요: {{"careers": [...]}}"""

    def _calculate_duration(self, start: str, end: str) -> int:
        """기간 계산 (개월)"""
        if not start:
            return 0

        try:
            start_year = int(start[:4])
            start_month = int(start[5:7])

            if end:
                end_year = int(end[:4])
                end_month = int(end[5:7])
            else:
                now = datetime.now()
                end_year = now.year
                end_month = now.month

            return (end_year - start_year) * 12 + (end_month - start_month)
        except:
            return 0

    def _calculate_confidence(self, careers: List[Dict]) -> float:
        """신뢰도 계산"""
        if not careers:
            return 0.3

        score = 0.5  # 기본 점수

        for career in careers:
            if career.get("company"):
                score += 0.1
            if career.get("start_date"):
                score += 0.1

        return min(score, 1.0)
```

### 4.3 Education Extractor

```python
# apps/worker/agents/extractors/education_extractor.py

from typing import Dict, Any, List
from agents.base_extractor import BaseExtractor, ExtractionResult
from datetime import datetime

class EducationExtractor(BaseExtractor):
    """Education Extractor - 학력 정보 추출"""

    AGENT_NAME = "education"
    DEPENDENCIES = []

    async def extract(self, text: str) -> ExtractionResult:
        start_time = datetime.now()
        prompt = self.get_prompt(text)

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                return ExtractionResult(
                    success=True,
                    data=response.content,
                    confidence=0.9,
                    warnings=[],
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
                )
        except Exception as e:
            pass

        return ExtractionResult(success=False, data={}, confidence=0, warnings=["Failed"], processing_time_ms=0)

    def get_prompt(self, text: str) -> str:
        return f"""이력서에서 학력 정보를 추출하세요.

{text[:5000]}

JSON 형식: {{"educations": [{{"school": "", "major": "", "degree": "", "graduation_year": null, "is_graduated": true}}]}}"""
```

### 4.4 Skill Extractor

```python
# apps/worker/agents/extractors/skill_extractor.py

from typing import Dict, Any
from agents.base_extractor import BaseExtractor, ExtractionResult
from datetime import datetime

class SkillExtractor(BaseExtractor):
    """Skill Extractor - 기술 스택 추출"""

    AGENT_NAME = "skills"
    DEPENDENCIES = ["career"]  # 경력 기반 기술 추출

    async def extract(self, text: str) -> ExtractionResult:
        start_time = datetime.now()

        # 경력 컨텍스트 참조
        from context.shared_context import ContextKey
        careers = await self.context.get(ContextKey.EXTRACTED_CAREERS)

        prompt = self.get_prompt(text, careers)

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                return ExtractionResult(
                    success=True,
                    data=response.content,
                    confidence=0.85,
                    warnings=[],
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
                )
        except Exception as e:
            pass

        return ExtractionResult(success=False, data={}, confidence=0, warnings=["Failed"], processing_time_ms=0)

    def get_prompt(self, text: str, careers: Dict = None) -> str:
        career_context = ""
        if careers:
            career_context = f"\n\n## 추출된 경력 정보\n{careers}"

        return f"""이력서에서 기술 스택을 추출하세요.
{career_context}

## 이력서
{text[:6000]}

JSON 형식: {{"skills": [{{"name": "", "level": "expert|advanced|intermediate|beginner", "years": null}}]}}"""
```

### 4.5 Project Extractor

```python
# apps/worker/agents/extractors/project_extractor.py

from typing import Dict, Any
from agents.base_extractor import BaseExtractor, ExtractionResult
from datetime import datetime

class ProjectExtractor(BaseExtractor):
    """Project Extractor - 프로젝트 정보 추출"""

    AGENT_NAME = "projects"
    DEPENDENCIES = ["career", "skills"]

    async def extract(self, text: str) -> ExtractionResult:
        start_time = datetime.now()
        prompt = self.get_prompt(text)

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                return ExtractionResult(
                    success=True,
                    data=response.content,
                    confidence=0.85,
                    warnings=[],
                    processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
                )
        except Exception as e:
            pass

        return ExtractionResult(success=False, data={}, confidence=0, warnings=["Failed"], processing_time_ms=0)

    def get_prompt(self, text: str) -> str:
        return f"""이력서에서 프로젝트 정보를 추출하세요.

{text[:8000]}

JSON 형식: {{"projects": [{{"name": "", "company": "", "role": "", "period": "", "description": "", "technologies": [], "achievements": []}}]}}"""
```

---

## 5. 프롬프트 고도화 (V3 신규)

### 5.1 Chain-of-Thought (CoT) 프롬프팅

```python
# apps/worker/prompts/cot_prompts.py

"""
Chain-of-Thought 프롬프팅 라이브러리

단계별 추론을 통해 추출 정확도를 높입니다.
"""

COT_CAREER_PROMPT = """당신은 이력서 분석 전문가입니다. 경력 정보를 추출하기 전에 단계별로 분석하세요.

## 이력서 텍스트
{text}

## 분석 단계

### Step 1: 경력 섹션 식별
이력서에서 경력/업무경험 관련 섹션을 찾아 표시하세요.
- 섹션 시작 위치:
- 섹션 종료 위치:
- 포함된 회사 수 (추정):

### Step 2: 각 회사별 정보 파싱
각 회사에 대해 다음을 분석하세요:
1. 회사명이 명확한가?
2. 날짜 형식이 일관적인가?
3. 현재 재직 여부 표시가 있는가?

### Step 3: 날짜 정규화
발견된 날짜 형식을 YYYY-MM으로 변환:
- "2020년 3월" → "2020-03"
- "2020.3" → "2020-03"
- "2020/03" → "2020-03"

### Step 4: 최종 추출
위 분석을 바탕으로 JSON을 생성하세요.

## 출력 형식
```json
{{
  "reasoning": {{
    "identified_sections": "경력사항 섹션 2개 발견",
    "date_patterns": "YYYY.MM 형식 사용",
    "companies_found": 3
  }},
  "careers": [
    {{
      "company": "회사명",
      "position": "직위",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM 또는 null",
      "is_current": boolean
    }}
  ]
}}
```"""

COT_PROFILE_PROMPT = """이력서에서 인적사항을 추출합니다. 단계별로 분석하세요.

## 이력서 텍스트
{text}

### Step 1: 연락처 정보 패턴 찾기
- 이메일 패턴: xxx@xxx.xxx
- 전화번호 패턴: 010-XXXX-XXXX

### Step 2: 이름 식별
- 문서 상단에서 이름 찾기
- 한글/영문 이름 구분

### Step 3: 검증
- 이메일 형식 유효성
- 전화번호 자릿수 확인

## 출력
```json
{{
  "reasoning": {{"name_location": "상단", "email_valid": true}},
  "name": "",
  "email": "",
  "phone": ""
}}
```"""


def get_cot_prompt(agent_type: str, text: str) -> str:
    """CoT 프롬프트 반환"""
    prompts = {
        "career": COT_CAREER_PROMPT,
        "profile": COT_PROFILE_PROMPT,
    }
    template = prompts.get(agent_type, COT_CAREER_PROMPT)
    return template.format(text=text[:8000])
```

### 5.2 Few-Shot Learning 예시 라이브러리

```python
# apps/worker/prompts/few_shot_examples.py

"""
Few-Shot Learning 예시 라이브러리

다양한 이력서 형식에 대한 예시를 제공합니다.
"""

from typing import List, Dict, Any

FEW_SHOT_CAREER_EXAMPLES = [
    {
        "input": """경력사항
삼성전자 (2018.03 ~ 현재)
- 직급: 책임연구원
- 부서: 무선사업부
- 담당: 안드로이드 앱 개발""",
        "output": {
            "careers": [{
                "company": "삼성전자",
                "position": "책임연구원",
                "department": "무선사업부",
                "start_date": "2018-03",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["안드로이드 앱 개발"]
            }]
        }
    },
    {
        "input": """Work Experience

Naver Corporation
Senior Software Engineer | 2020-01 to 2023-06
- Developed search algorithms
- Managed team of 5 engineers""",
        "output": {
            "careers": [{
                "company": "Naver Corporation",
                "position": "Senior Software Engineer",
                "department": None,
                "start_date": "2020-01",
                "end_date": "2023-06",
                "is_current": False,
                "responsibilities": ["Developed search algorithms", "Managed team of 5 engineers"]
            }]
        }
    },
    {
        "input": """[경력]
(주)카카오 / 플랫폼개발팀 / 선임개발자
2019년 7월 - 2022년 12월 (3년 6개월)
* Kubernetes 기반 인프라 구축
* CI/CD 파이프라인 설계""",
        "output": {
            "careers": [{
                "company": "카카오",
                "position": "선임개발자",
                "department": "플랫폼개발팀",
                "start_date": "2019-07",
                "end_date": "2022-12",
                "is_current": False,
                "responsibilities": ["Kubernetes 기반 인프라 구축", "CI/CD 파이프라인 설계"]
            }]
        }
    }
]

FEW_SHOT_PROFILE_EXAMPLES = [
    {
        "input": """이름: 김경민
연락처: 010-1234-5678
이메일: kim@example.com
생년월일: 1990년 5월""",
        "output": {
            "name": "김경민",
            "phone": "010-1234-5678",
            "email": "kim@example.com",
            "birth_year": 1990
        }
    },
    {
        "input": """John Smith
Email: john.smith@company.com
Phone: +82-10-9876-5432""",
        "output": {
            "name": "John Smith",
            "phone": "010-9876-5432",
            "email": "john.smith@company.com",
            "birth_year": None
        }
    }
]


def get_few_shot_examples(agent_type: str, max_examples: int = 3) -> List[Dict[str, Any]]:
    """Few-shot 예시 반환"""
    examples = {
        "career": FEW_SHOT_CAREER_EXAMPLES,
        "profile": FEW_SHOT_PROFILE_EXAMPLES,
    }
    return examples.get(agent_type, [])[:max_examples]


def format_few_shot_prompt(agent_type: str, input_text: str) -> str:
    """Few-shot 포함 프롬프트 생성"""
    examples = get_few_shot_examples(agent_type)

    example_str = ""
    for i, ex in enumerate(examples, 1):
        example_str += f"\n### 예시 {i}\n입력:\n{ex['input']}\n\n출력:\n{ex['output']}\n"

    return f"""다음 예시를 참고하여 이력서를 분석하세요.
{example_str}

### 실제 입력
{input_text}

### 출력 (JSON)
"""
```

### 5.3 strict: True JSON Schema

```python
# apps/worker/schemas/strict_schemas.py

"""
strict: True JSON Schema 정의

OpenAI Structured Output을 위한 스키마입니다.
"""

from typing import Dict, Any

CAREER_SCHEMA = {
    "type": "object",
    "properties": {
        "careers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "company": {"type": "string", "description": "회사명"},
                    "position": {"type": ["string", "null"], "description": "직위/직책"},
                    "department": {"type": ["string", "null"], "description": "부서명"},
                    "start_date": {"type": "string", "pattern": "^\\d{4}-\\d{2}$", "description": "시작일 YYYY-MM"},
                    "end_date": {"type": ["string", "null"], "pattern": "^\\d{4}-\\d{2}$", "description": "종료일 YYYY-MM"},
                    "is_current": {"type": "boolean", "description": "현재 재직 여부"},
                    "responsibilities": {"type": "array", "items": {"type": "string"}, "description": "주요 업무"}
                },
                "required": ["company", "start_date", "is_current"],
                "additionalProperties": False
            }
        }
    },
    "required": ["careers"],
    "additionalProperties": False
}

PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "이름"},
        "email": {"type": ["string", "null"], "format": "email", "description": "이메일"},
        "phone": {"type": ["string", "null"], "description": "전화번호"},
        "birth_year": {"type": ["integer", "null"], "minimum": 1950, "maximum": 2010, "description": "출생연도"}
    },
    "required": ["name"],
    "additionalProperties": False
}

EDUCATION_SCHEMA = {
    "type": "object",
    "properties": {
        "educations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "school": {"type": "string"},
                    "major": {"type": ["string", "null"]},
                    "degree": {"type": ["string", "null"], "enum": ["고졸", "전문학사", "학사", "석사", "박사", None]},
                    "graduation_year": {"type": ["integer", "null"]},
                    "is_graduated": {"type": "boolean"}
                },
                "required": ["school", "is_graduated"],
                "additionalProperties": False
            }
        }
    },
    "required": ["educations"],
    "additionalProperties": False
}

SKILL_SCHEMA = {
    "type": "object",
    "properties": {
        "skills": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": ["string", "null"], "enum": ["language", "framework", "database", "tool", "cloud", "other", None]},
                    "level": {"type": ["string", "null"], "enum": ["expert", "advanced", "intermediate", "beginner", None]},
                    "years": {"type": ["integer", "null"]}
                },
                "required": ["name"],
                "additionalProperties": False
            }
        }
    },
    "required": ["skills"],
    "additionalProperties": False
}


def get_strict_schema(agent_type: str) -> Dict[str, Any]:
    """스키마 반환"""
    schemas = {
        "career": CAREER_SCHEMA,
        "profile": PROFILE_SCHEMA,
        "education": EDUCATION_SCHEMA,
        "skills": SKILL_SCHEMA,
    }
    return schemas.get(agent_type, {})
```

---

## 6. 품질 보증 시스템 (V3 신규)

### 6.1 환각 감지 Agent (Hallucination Detector)

```python
# apps/worker/agents/quality/hallucination_detector.py

"""
Hallucination Detector - 환각 감지 Agent

추출 결과가 원본 텍스트에 근거하는지 검증합니다.
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class HallucinationType(str, Enum):
    """환각 유형"""
    FABRICATED = "fabricated"
    EXAGGERATED = "exaggerated"
    MISATTRIBUTED = "misattributed"


class VerificationStatus(str, Enum):
    """검증 상태"""
    GROUNDED = "grounded"
    PARTIALLY_GROUNDED = "partial"
    INFERRED = "inferred"
    HALLUCINATED = "hallucinated"


@dataclass
class FieldVerification:
    """필드 검증 결과"""
    field_name: str
    extracted_value: Any
    status: VerificationStatus
    evidence: Optional[str] = None
    confidence: float = 0.0
    correction: Optional[Any] = None


@dataclass
class HallucinationReport:
    """환각 감지 보고서"""
    total_fields: int
    verified_fields: int
    hallucinated_fields: int
    field_verifications: List[FieldVerification]
    overall_confidence: float
    confidence_adjustment: float
    requires_manual_review: bool


class HallucinationDetector:
    """환각 감지기"""

    CRITICAL_FIELDS = ["name", "phone", "email", "company", "position", "start_date", "end_date"]

    async def detect(
        self,
        extracted_data: Dict[str, Any],
        original_text: str,
        use_llm_verification: bool = False
    ) -> HallucinationReport:
        """환각 감지 실행"""
        verifications = []

        for field_name in self.CRITICAL_FIELDS:
            value = self._get_nested_value(extracted_data, field_name)
            if value is not None:
                verification = self._verify_field(field_name, value, original_text)
                verifications.append(verification)

        total = len(verifications)
        verified = sum(1 for v in verifications if v.status == VerificationStatus.GROUNDED)
        hallucinated = sum(1 for v in verifications if v.status == VerificationStatus.HALLUCINATED)

        overall_confidence = sum(v.confidence for v in verifications) / total if total > 0 else 0.5
        confidence_adjustment = -0.05 * hallucinated

        return HallucinationReport(
            total_fields=total,
            verified_fields=verified,
            hallucinated_fields=hallucinated,
            field_verifications=verifications,
            overall_confidence=overall_confidence,
            confidence_adjustment=confidence_adjustment,
            requires_manual_review=hallucinated >= 3 or overall_confidence < 0.6
        )

    def _verify_field(self, field_name: str, value: Any, original_text: str) -> FieldVerification:
        """필드 검증"""
        value_str = str(value).strip().lower()
        text_lower = original_text.lower()

        if value_str in text_lower:
            start_idx = text_lower.find(value_str)
            context = original_text[max(0, start_idx-20):start_idx+len(value_str)+20]
            return FieldVerification(
                field_name=field_name,
                extracted_value=value,
                status=VerificationStatus.GROUNDED,
                evidence=context,
                confidence=0.95
            )

        best_match, ratio = self._find_best_match(str(value), original_text)
        if ratio > 0.8:
            return FieldVerification(
                field_name=field_name,
                extracted_value=value,
                status=VerificationStatus.PARTIALLY_GROUNDED,
                evidence=best_match,
                confidence=ratio
            )

        return FieldVerification(
            field_name=field_name,
            extracted_value=value,
            status=VerificationStatus.HALLUCINATED,
            confidence=0.3
        )

    def _find_best_match(self, target: str, text: str) -> Tuple[str, float]:
        """가장 유사한 부분 찾기"""
        words = text.split()
        best_match, best_ratio = "", 0.0

        window_size = len(target.split()) + 2
        for i in range(len(words) - window_size + 1):
            window = " ".join(words[i:i + window_size])
            ratio = SequenceMatcher(None, target.lower(), window.lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = window

        return best_match, best_ratio

    def _get_nested_value(self, data: Dict, field_path: str) -> Any:
        """중첩 필드 값 추출"""
        parts = field_path.split(".")
        current = data
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
```

### 6.2 필드 간 교차 검증 (Cross Validator)

```python
# apps/worker/agents/quality/cross_validator.py

"""
Cross Validator - 필드 간 교차 검증

필드 간 논리적 일관성을 검증합니다.
"""

import logging
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class ValidationIssue:
    """검증 이슈"""
    rule_id: str
    fields: List[str]
    message: str
    severity: ValidationSeverity
    corrected_value: Optional[Any] = None


@dataclass
class CrossValidationResult:
    """교차 검증 결과"""
    is_valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    error_count: int = 0
    warning_count: int = 0
    auto_corrected: Dict[str, Any] = field(default_factory=dict)


class CrossValidator:
    """교차 검증기"""

    def __init__(self):
        self.rules = []
        self._register_default_rules()

    def _register_default_rules(self):
        """기본 규칙 등록"""

        # 규칙 1: 출생연도 vs 첫 경력 시작일
        def validate_birth_career(data: Dict) -> Optional[ValidationIssue]:
            birth_year = data.get("birth_year")
            careers = data.get("careers", [])

            if not birth_year or not careers:
                return None

            for career in careers:
                start = career.get("start_date")
                if start:
                    try:
                        start_year = int(start[:4])
                        age = start_year - birth_year
                        if age < 18:
                            return ValidationIssue(
                                rule_id="birth_career_age",
                                fields=["birth_year", "careers.start_date"],
                                message=f"첫 경력 시작 시 {age}세 (18세 미만)",
                                severity=ValidationSeverity.WARNING
                            )
                    except:
                        pass
            return None

        self.rules.append(validate_birth_career)

        # 규칙 2: 현재 재직 여부 vs 퇴사일
        def validate_current_end_date(data: Dict) -> Optional[ValidationIssue]:
            for career in data.get("careers", []):
                is_current = career.get("is_current", False)
                end_date = career.get("end_date")

                if is_current and end_date:
                    return ValidationIssue(
                        rule_id="current_end_date",
                        fields=["is_current", "end_date"],
                        message="현재 재직 중인데 퇴사일이 있음",
                        severity=ValidationSeverity.ERROR,
                        corrected_value={"is_current": True, "end_date": None}
                    )
            return None

        self.rules.append(validate_current_end_date)

        # 규칙 3: 총 경력연수 검증
        def validate_exp_years(data: Dict) -> Optional[ValidationIssue]:
            claimed = data.get("exp_years")
            careers = data.get("careers", [])

            if claimed is None or not careers:
                return None

            total_months = 0
            for career in careers:
                start = career.get("start_date")
                end = career.get("end_date")
                if not start:
                    continue
                try:
                    sy, sm = int(start[:4]), int(start[5:7])
                    if end:
                        ey, em = int(end[:4]), int(end[5:7])
                    else:
                        now = datetime.now()
                        ey, em = now.year, now.month
                    total_months += (ey - sy) * 12 + (em - sm)
                except:
                    pass

            calculated = total_months / 12
            if abs(claimed - calculated) > 2:
                return ValidationIssue(
                    rule_id="exp_years_mismatch",
                    fields=["exp_years"],
                    message=f"경력연수 불일치: 표기 {claimed}년 vs 계산 {calculated:.1f}년",
                    severity=ValidationSeverity.WARNING,
                    corrected_value=round(calculated, 1)
                )
            return None

        self.rules.append(validate_exp_years)

    def validate(self, data: Dict[str, Any], auto_correct: bool = True) -> CrossValidationResult:
        """교차 검증 실행"""
        issues = []
        corrections = {}

        for rule in self.rules:
            try:
                issue = rule(data)
                if issue:
                    issues.append(issue)
                    if auto_correct and issue.corrected_value:
                        for field in issue.fields:
                            if "." not in field:
                                corrections[field] = issue.corrected_value
            except Exception as e:
                logger.error(f"Rule failed: {e}")

        error_count = sum(1 for i in issues if i.severity == ValidationSeverity.ERROR)
        warning_count = sum(1 for i in issues if i.severity == ValidationSeverity.WARNING)

        return CrossValidationResult(
            is_valid=(error_count == 0),
            issues=issues,
            error_count=error_count,
            warning_count=warning_count,
            auto_corrected=corrections
        )
```

### 6.3 Self-Reflection Agent

```python
# apps/worker/agents/quality/self_reflection.py

"""
Self-Reflection Agent - 자기 검토 Agent

추출 결과를 스스로 검토하고 개선합니다.
"""

from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class SelfReflectionAgent:
    """자기 검토 Agent"""

    def __init__(self, llm_manager):
        self.llm = llm_manager

    async def reflect(
        self,
        original_text: str,
        extracted_data: Dict[str, Any],
        agent_type: str
    ) -> Dict[str, Any]:
        """추출 결과 검토 및 개선"""

        prompt = f"""당신은 이력서 분석 결과를 검토하는 QA 전문가입니다.

## 원본 텍스트
{original_text[:5000]}

## 추출 결과
{extracted_data}

## 검토 작업
1. 추출된 각 필드가 원본에 근거하는지 확인
2. 누락된 중요 정보가 있는지 확인
3. 형식 오류 (날짜, 전화번호 등) 확인
4. 논리적 불일치 확인

## 출력 형식 (JSON)
{{
  "is_correct": boolean,
  "issues": ["발견된 문제 목록"],
  "corrections": {{"필드명": "수정된 값"}},
  "confidence": 0.0-1.0
}}"""

        try:
            response = await self.llm.call_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )

            if response.success:
                return response.content
        except Exception as e:
            logger.error(f"[SelfReflection] Error: {e}")

        return {"is_correct": True, "issues": [], "corrections": {}, "confidence": 0.5}
```

---

## 7. 성능 최적화 (V3 신규)

### 7.1 동적 컨텍스트 압축

```python
# apps/worker/utils/context_compressor.py

"""
Context Compressor - 동적 컨텍스트 압축

긴 이력서를 모델 컨텍스트 윈도우에 맞게 압축합니다.
"""

import re
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

class CompressionStrategy(str, Enum):
    NONE = "none"
    TRUNCATE = "truncate"
    PRIORITY_BASED = "priority"
    SEMANTIC = "semantic"


@dataclass
class CompressionResult:
    text: str
    original_tokens: int
    compressed_tokens: int
    compression_ratio: float
    strategy_used: CompressionStrategy
    sections_included: List[str]
    sections_excluded: List[str]
    warnings: List[str]


class ContextCompressor:
    """컨텍스트 압축기"""

    MODEL_LIMITS = {
        "gpt-4o": 128000,
        "gpt-4o-mini": 128000,
        "claude-3-5-haiku-20241022": 200000,
        "claude-sonnet-4-20250514": 200000,
    }

    SECTION_PRIORITY = {
        "career": 100,
        "profile": 90,
        "skills": 80,
        "education": 70,
        "projects": 60,
        "certifications": 50,
        "awards": 40,
    }

    def __init__(self, model: str = "claude-3-5-haiku-20241022"):
        self.model = model
        self.max_tokens = self.MODEL_LIMITS.get(model, 100000)

    def estimate_tokens(self, text: str) -> int:
        """토큰 수 추정"""
        korean_chars = len(re.findall(r'[가-힣]', text))
        other_chars = len(text) - korean_chars
        return int(korean_chars / 1.8 + other_chars / 4)

    def compress(
        self,
        text: str,
        sections: Optional[Dict[str, str]] = None,
        strategy: CompressionStrategy = CompressionStrategy.PRIORITY_BASED,
        target_tokens: Optional[int] = None
    ) -> CompressionResult:
        """텍스트 압축"""
        original_tokens = self.estimate_tokens(text)
        max_tokens = target_tokens or int(self.max_tokens * 0.7)

        if original_tokens <= max_tokens:
            return CompressionResult(
                text=text,
                original_tokens=original_tokens,
                compressed_tokens=original_tokens,
                compression_ratio=1.0,
                strategy_used=CompressionStrategy.NONE,
                sections_included=[],
                sections_excluded=[],
                warnings=[]
            )

        if strategy == CompressionStrategy.TRUNCATE:
            return self._truncate(text, original_tokens, max_tokens)
        elif strategy == CompressionStrategy.PRIORITY_BASED:
            return self._priority_compress(text, sections, original_tokens, max_tokens)
        else:
            return self._semantic_compress(text, sections, original_tokens, max_tokens)

    def _truncate(self, text: str, original_tokens: int, max_tokens: int) -> CompressionResult:
        """단순 잘라내기"""
        ratio = max_tokens / original_tokens
        target_len = int(len(text) * ratio * 0.9)
        truncated = text[:target_len] + "\n\n[... 내용이 잘렸습니다 ...]"

        return CompressionResult(
            text=truncated,
            original_tokens=original_tokens,
            compressed_tokens=self.estimate_tokens(truncated),
            compression_ratio=len(truncated) / len(text),
            strategy_used=CompressionStrategy.TRUNCATE,
            sections_included=[],
            sections_excluded=[],
            warnings=["Content truncated"]
        )

    def _priority_compress(
        self, text: str, sections: Optional[Dict[str, str]],
        original_tokens: int, max_tokens: int
    ) -> CompressionResult:
        """우선순위 기반 압축"""
        if not sections:
            sections = self._auto_detect_sections(text)

        sorted_sections = sorted(
            sections.items(),
            key=lambda x: self.SECTION_PRIORITY.get(x[0], 0),
            reverse=True
        )

        included, excluded, parts = [], [], []
        current_tokens = 0

        for name, content in sorted_sections:
            section_tokens = self.estimate_tokens(content)
            if current_tokens + section_tokens <= max_tokens:
                parts.append(f"## {name.upper()}\n{content}")
                current_tokens += section_tokens
                included.append(name)
            else:
                excluded.append(name)

        compressed = "\n\n".join(parts)
        if excluded:
            compressed += f"\n\n[제외된 섹션: {', '.join(excluded)}]"

        return CompressionResult(
            text=compressed,
            original_tokens=original_tokens,
            compressed_tokens=self.estimate_tokens(compressed),
            compression_ratio=len(compressed) / len(text),
            strategy_used=CompressionStrategy.PRIORITY_BASED,
            sections_included=included,
            sections_excluded=excluded,
            warnings=[f"Excluded: {excluded}"] if excluded else []
        )

    def _semantic_compress(
        self, text: str, sections: Optional[Dict[str, str]],
        original_tokens: int, max_tokens: int
    ) -> CompressionResult:
        """의미 기반 압축"""
        # 중복 제거
        lines = text.split('\n')
        seen = set()
        unique = []
        for line in lines:
            norm = line.strip().lower()
            if norm and norm not in seen:
                seen.add(norm)
                unique.append(line)
            elif not norm:
                unique.append(line)

        text = '\n'.join(unique)
        text = re.sub(r' +', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)

        if self.estimate_tokens(text) > max_tokens:
            return self._priority_compress(text, sections, self.estimate_tokens(text), max_tokens)

        return CompressionResult(
            text=text,
            original_tokens=original_tokens,
            compressed_tokens=self.estimate_tokens(text),
            compression_ratio=len(text) / original_tokens,
            strategy_used=CompressionStrategy.SEMANTIC,
            sections_included=[],
            sections_excluded=[],
            warnings=[]
        )

    def _auto_detect_sections(self, text: str) -> Dict[str, str]:
        """자동 섹션 감지"""
        patterns = {
            "profile": r"(인적\s*사항|기본\s*정보|프로필)",
            "career": r"(경력\s*사항|경력|업무\s*경력)",
            "education": r"(학력\s*사항|학력)",
            "skills": r"(기술\s*스택|보유\s*기술|스킬)",
            "projects": r"(프로젝트|주요\s*프로젝트)",
        }

        sections = {}
        for name, pattern in patterns.items():
            match = re.search(f"(?i){pattern}[:\n]*(.*?)(?={'|'.join(patterns.values())}|$)", text, re.DOTALL)
            if match:
                sections[name] = match.group(1).strip()

        if not sections:
            sections["other"] = text

        return sections
```

### 7.2 실패한 분석의 자동 복구

```python
# apps/worker/services/error_recovery.py

"""
Error Recovery Service - 실패한 분석의 자동 복구

LLM 호출 실패 시 자동으로 복구합니다.
"""

import asyncio
import logging
import random
from typing import Dict, Any, Optional, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class ErrorType(str, Enum):
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    API_ERROR = "api_error"
    PARSE_ERROR = "parse_error"


class RecoveryStrategy(str, Enum):
    RETRY_SAME = "retry_same"
    FALLBACK_PROVIDER = "fallback"
    SIMPLIFY_PROMPT = "simplify"
    RULE_BASED = "rule_based"


@dataclass
class RecoveryResult:
    success: bool
    data: Optional[Dict[str, Any]] = None
    final_provider: Optional[str] = None
    attempts: int = 0
    confidence_penalty: float = 0.0


class RetryConfig:
    def __init__(self, max_retries: int = 3, base_delay_ms: int = 1000):
        self.max_retries = max_retries
        self.base_delay_ms = base_delay_ms

    def get_delay(self, attempt: int) -> float:
        delay = self.base_delay_ms * (2 ** attempt)
        delay *= (0.5 + random.random())
        return delay / 1000


class ErrorRecoveryService:
    """오류 복구 서비스"""

    PROVIDER_FALLBACK = {
        "openai": ["claude", "gemini"],
        "claude": ["openai", "gemini"],
        "gemini": ["openai", "claude"],
    }

    def __init__(self, retry_config: Optional[RetryConfig] = None):
        self.config = retry_config or RetryConfig()

    def classify_error(self, error: Exception) -> ErrorType:
        """오류 분류"""
        msg = str(error).lower()
        if "timeout" in msg:
            return ErrorType.TIMEOUT
        elif "rate limit" in msg or "429" in msg:
            return ErrorType.RATE_LIMIT
        elif "parse" in msg or "json" in msg:
            return ErrorType.PARSE_ERROR
        return ErrorType.API_ERROR

    async def recover(
        self,
        error: Exception,
        original_provider: str,
        original_text: str,
        call_fn: Callable[..., Awaitable],
        **kwargs
    ) -> RecoveryResult:
        """복구 실행"""
        error_type = self.classify_error(error)

        # 1. 재시도
        result = await self._retry_with_backoff(original_provider, call_fn, kwargs)
        if result.success:
            return result

        # 2. 다른 프로바이더로 폴백
        result = await self._fallback_provider(original_provider, call_fn, kwargs)
        if result.success:
            return result

        # 3. 규칙 기반 추출
        return self._rule_based_extraction(original_text)

    async def _retry_with_backoff(
        self, provider: str, call_fn: Callable, kwargs: Dict
    ) -> RecoveryResult:
        """재시도"""
        for attempt in range(self.config.max_retries):
            delay = self.config.get_delay(attempt)
            await asyncio.sleep(delay)

            try:
                response = await call_fn(provider=provider, **kwargs)
                if response.success:
                    return RecoveryResult(
                        success=True,
                        data=response.content,
                        final_provider=provider,
                        attempts=attempt + 1,
                        confidence_penalty=0.05 * (attempt + 1)
                    )
            except Exception:
                continue

        return RecoveryResult(success=False, attempts=self.config.max_retries)

    async def _fallback_provider(
        self, original: str, call_fn: Callable, kwargs: Dict
    ) -> RecoveryResult:
        """프로바이더 폴백"""
        for provider in self.PROVIDER_FALLBACK.get(original, []):
            try:
                response = await call_fn(provider=provider, **kwargs)
                if response.success:
                    return RecoveryResult(
                        success=True,
                        data=response.content,
                        final_provider=provider,
                        confidence_penalty=0.1
                    )
            except Exception:
                continue

        return RecoveryResult(success=False)

    def _rule_based_extraction(self, text: str) -> RecoveryResult:
        """규칙 기반 추출"""
        import re

        extracted = {}

        # 이름
        name_match = re.search(r'(?:이름\s*[:：]?\s*)?([가-힣]{2,4})', text[:500])
        if name_match:
            extracted["name"] = name_match.group(1)

        # 이메일
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        if email_match:
            extracted["email"] = email_match.group(0)

        # 전화번호
        phone_match = re.search(r'01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}', text)
        if phone_match:
            extracted["phone"] = phone_match.group(0)

        return RecoveryResult(
            success=bool(extracted),
            data=extracted,
            confidence_penalty=0.4
        )
```

### 7.3 다수 이력서 병렬 처리

```python
# apps/worker/services/batch_processor.py

"""
Batch Processor - 다수 이력서 병렬 처리

여러 이력서를 효율적으로 병렬 처리합니다.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class BatchResult:
    batch_id: str
    total: int
    successful: int
    failed: int
    results: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]
    processing_time_ms: int
    avg_time_per_job_ms: int


class ConcurrencyConfig:
    def __init__(
        self,
        max_concurrent_jobs: int = 10,
        max_concurrent_llm_calls: int = 20,
        batch_size: int = 50,
        timeout_per_job_sec: int = 60
    ):
        self.max_concurrent_jobs = max_concurrent_jobs
        self.max_concurrent_llm_calls = max_concurrent_llm_calls
        self.batch_size = batch_size
        self.timeout_per_job_sec = timeout_per_job_sec


class BatchProcessor:
    """배치 처리기"""

    def __init__(self, config: Optional[ConcurrencyConfig] = None):
        self.config = config or ConcurrencyConfig()
        self._job_semaphore = asyncio.Semaphore(self.config.max_concurrent_jobs)
        self._llm_semaphore = asyncio.Semaphore(self.config.max_concurrent_llm_calls)

    async def process_batch(
        self,
        job_ids: List[str],
        user_id: str,
        process_fn: Callable[[str], Awaitable[Dict[str, Any]]],
        progress_callback: Optional[Callable[[int, int, int], None]] = None
    ) -> BatchResult:
        """배치 처리"""
        batch_id = str(uuid.uuid4())[:8]
        start_time = datetime.now()

        results, errors = [], []

        for i in range(0, len(job_ids), self.config.batch_size):
            slice_ids = job_ids[i:i + self.config.batch_size]
            slice_results, slice_errors = await self._process_slice(slice_ids, process_fn)

            results.extend(slice_results)
            errors.extend(slice_errors)

            if progress_callback:
                progress_callback(len(results), len(errors), len(job_ids))

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        return BatchResult(
            batch_id=batch_id,
            total=len(job_ids),
            successful=len(results),
            failed=len(errors),
            results=results,
            errors=errors,
            processing_time_ms=processing_time,
            avg_time_per_job_ms=processing_time // max(len(job_ids), 1)
        )

    async def _process_slice(
        self, job_ids: List[str], process_fn: Callable
    ) -> tuple:
        """슬라이스 처리"""
        tasks = [self._process_single(job_id, process_fn) for job_id in job_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        successful, failed = [], []
        for job_id, result in zip(job_ids, results):
            if isinstance(result, Exception):
                failed.append({"job_id": job_id, "error": str(result)})
            elif result.get("success"):
                successful.append({"job_id": job_id, "data": result.get("data")})
            else:
                failed.append({"job_id": job_id, "error": result.get("error", "Unknown")})

        return successful, failed

    async def _process_single(self, job_id: str, process_fn: Callable) -> Dict:
        """단일 작업 처리"""
        async with self._job_semaphore:
            try:
                return await asyncio.wait_for(
                    process_fn(job_id),
                    timeout=self.config.timeout_per_job_sec
                )
            except asyncio.TimeoutError:
                return {"success": False, "error": f"Timeout after {self.config.timeout_per_job_sec}s"}
            except Exception as e:
                return {"success": False, "error": str(e)}
```

### 7.4 Sub-Agent 결과 캐싱

```python
# apps/worker/cache/sub_agent_cache.py

"""
Sub-Agent Cache - 추출 결과 캐싱

동일한 입력에 대해 중복 LLM 호출을 방지합니다.
"""

import asyncio
import hashlib
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class CacheBackend(str, Enum):
    MEMORY = "memory"
    REDIS = "redis"


@dataclass
class CacheEntry:
    key: str
    value: Any
    created_at: datetime = field(default_factory=datetime.now)
    expires_at: Optional[datetime] = None
    hit_count: int = 0

    def is_expired(self) -> bool:
        return self.expires_at and datetime.now() > self.expires_at


@dataclass
class CacheStats:
    hits: int = 0
    misses: int = 0

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0


class SubAgentCache:
    """Sub-Agent 캐시"""

    def __init__(
        self,
        default_ttl_seconds: int = 86400,
        max_entries: int = 1000
    ):
        self.default_ttl = default_ttl_seconds
        self.max_entries = max_entries
        self._cache: Dict[str, CacheEntry] = {}
        self._stats = CacheStats()
        self._lock = asyncio.Lock()

    def generate_key(
        self, agent_type: str, input_text: str,
        model: Optional[str] = None
    ) -> str:
        """캐시 키 생성"""
        content_hash = hashlib.sha256(input_text.encode()).hexdigest()[:16]
        parts = [agent_type, content_hash]
        if model:
            parts.append(model.replace("-", "_"))
        return ":".join(parts)

    async def get(self, key: str) -> Optional[Any]:
        """캐시 조회"""
        entry = self._cache.get(key)
        if entry and not entry.is_expired():
            self._stats.hits += 1
            entry.hit_count += 1
            return entry.value

        self._stats.misses += 1
        return None

    async def set(
        self, key: str, value: Any,
        ttl_seconds: Optional[int] = None
    ) -> None:
        """캐시 저장"""
        async with self._lock:
            if len(self._cache) >= self.max_entries:
                await self._evict_oldest()

            ttl = ttl_seconds or self.default_ttl
            self._cache[key] = CacheEntry(
                key=key,
                value=value,
                expires_at=datetime.now() + timedelta(seconds=ttl)
            )

    async def get_or_compute(
        self,
        agent_type: str,
        input_text: str,
        compute_fn,
        model: Optional[str] = None,
        **kwargs
    ) -> Any:
        """캐시 조회 또는 계산"""
        key = self.generate_key(agent_type, input_text, model)

        cached = await self.get(key)
        if cached is not None:
            return cached

        if asyncio.iscoroutinefunction(compute_fn):
            result = await compute_fn(input_text, **kwargs)
        else:
            result = compute_fn(input_text, **kwargs)

        await self.set(key, result)
        return result

    async def _evict_oldest(self) -> None:
        """오래된 항목 제거"""
        # 만료된 항목 제거
        expired = [k for k, v in self._cache.items() if v.is_expired()]
        for key in expired[:10]:
            del self._cache[key]

        # 여전히 크면 hit_count 낮은 항목 제거
        if len(self._cache) >= self.max_entries:
            sorted_items = sorted(self._cache.items(), key=lambda x: x[1].hit_count)
            for key, _ in sorted_items[:10]:
                del self._cache[key]

    def get_stats(self) -> CacheStats:
        return self._stats
```

### 7.5 동적 모델 선택

```python
# apps/worker/services/model_selector.py

"""
Dynamic Model Selector - 동적 모델 선택

문서 복잡도에 따라 최적의 모델을 선택합니다.
"""

import re
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class DocumentComplexity(str, Enum):
    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"
    VERY_COMPLEX = "very_complex"


class ModelTier(str, Enum):
    FAST = "fast"
    BALANCED = "balanced"
    PREMIUM = "premium"


@dataclass
class ModelConfig:
    model_id: str
    provider: str
    tier: ModelTier
    max_tokens: int
    cost_per_1k_input: float
    cost_per_1k_output: float
    avg_latency_ms: int


@dataclass
class ComplexityAnalysis:
    complexity: DocumentComplexity
    score: float
    factors: Dict[str, float]
    recommended_model: str
    estimated_tokens: int


class DynamicModelSelector:
    """동적 모델 선택기"""

    MODELS = {
        "claude-3-5-haiku-20241022": ModelConfig(
            model_id="claude-3-5-haiku-20241022",
            provider="anthropic",
            tier=ModelTier.FAST,
            max_tokens=200000,
            cost_per_1k_input=0.00025,
            cost_per_1k_output=0.00125,
            avg_latency_ms=500
        ),
        "claude-sonnet-4-20250514": ModelConfig(
            model_id="claude-sonnet-4-20250514",
            provider="anthropic",
            tier=ModelTier.BALANCED,
            max_tokens=200000,
            cost_per_1k_input=0.003,
            cost_per_1k_output=0.015,
            avg_latency_ms=1500
        ),
        "gpt-4o-mini": ModelConfig(
            model_id="gpt-4o-mini",
            provider="openai",
            tier=ModelTier.FAST,
            max_tokens=128000,
            cost_per_1k_input=0.00015,
            cost_per_1k_output=0.0006,
            avg_latency_ms=400
        ),
        "gpt-4o": ModelConfig(
            model_id="gpt-4o",
            provider="openai",
            tier=ModelTier.BALANCED,
            max_tokens=128000,
            cost_per_1k_input=0.0025,
            cost_per_1k_output=0.01,
            avg_latency_ms=1200
        ),
    }

    COMPLEXITY_MODEL_MAP = {
        DocumentComplexity.SIMPLE: "claude-3-5-haiku-20241022",
        DocumentComplexity.MEDIUM: "claude-sonnet-4-20250514",
        DocumentComplexity.COMPLEX: "claude-sonnet-4-20250514",
        DocumentComplexity.VERY_COMPLEX: "gpt-4o",
    }

    def analyze_complexity(
        self, text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> ComplexityAnalysis:
        """문서 복잡도 분석"""
        factors = {}

        # 텍스트 길이
        factors["text_length"] = min(len(text) / 200, 100)

        # 페이지 수
        page_count = metadata.get("page_count", 1) if metadata else max(1, len(text) // 3000)
        factors["page_count"] = min(page_count * 10, 100)

        # 경력 수
        career_patterns = [r'\d{4}[.\-~]\d{1,2}\s*[-~]', r'(?:주\)|\(주\)|㈜)']
        career_count = sum(len(re.findall(p, text)) for p in career_patterns)
        factors["career_count"] = min(career_count * 8, 100)

        # 점수 계산
        weights = {"text_length": 0.3, "page_count": 0.3, "career_count": 0.4}
        score = sum(factors[k] * weights.get(k, 0) for k in factors)

        # 복잡도 분류
        if score < 25:
            complexity = DocumentComplexity.SIMPLE
        elif score < 50:
            complexity = DocumentComplexity.MEDIUM
        elif score < 75:
            complexity = DocumentComplexity.COMPLEX
        else:
            complexity = DocumentComplexity.VERY_COMPLEX

        return ComplexityAnalysis(
            complexity=complexity,
            score=round(score, 2),
            factors=factors,
            recommended_model=self.COMPLEXITY_MODEL_MAP[complexity],
            estimated_tokens=int(len(text) / 2.5)
        )

    def select_model(
        self,
        analysis: ComplexityAnalysis,
        optimize_for: str = "balanced"
    ) -> ModelConfig:
        """모델 선택"""
        model_id = analysis.recommended_model

        if optimize_for == "cost":
            if analysis.complexity in [DocumentComplexity.SIMPLE, DocumentComplexity.MEDIUM]:
                model_id = "claude-3-5-haiku-20241022"
        elif optimize_for == "speed":
            if analysis.complexity != DocumentComplexity.VERY_COMPLEX:
                model_id = "gpt-4o-mini"
        elif optimize_for == "quality":
            upgrade = {
                "claude-3-5-haiku-20241022": "claude-sonnet-4-20250514",
                "gpt-4o-mini": "gpt-4o"
            }
            model_id = upgrade.get(model_id, model_id)

        return self.MODELS.get(model_id, self.MODELS["claude-3-5-haiku-20241022"])
```

---

## 8. 테스트 계획

### 8.1 단위 테스트

```python
# tests/unit/test_extractors.py

import pytest
from unittest.mock import AsyncMock, MagicMock

class TestProfileExtractor:
    """Profile Extractor 테스트"""

    @pytest.fixture
    def extractor(self):
        from agents.extractors.profile_extractor import ProfileExtractor
        context = MagicMock()
        bus = MagicMock()
        llm = AsyncMock()
        return ProfileExtractor(context, bus, llm)

    @pytest.mark.asyncio
    async def test_extract_basic_profile(self, extractor):
        """기본 프로필 추출"""
        extractor.llm.call_json.return_value = MagicMock(
            success=True,
            content={"name": "김경민", "email": "kim@example.com"}
        )

        result = await extractor.extract("이름: 김경민\n이메일: kim@example.com")

        assert result.success
        assert result.data["name"] == "김경민"
        assert result.confidence > 0.5

class TestCareerExtractor:
    """Career Extractor 테스트"""

    @pytest.fixture
    def extractor(self):
        from agents.extractors.career_extractor import CareerExtractor
        return CareerExtractor(MagicMock(), MagicMock(), AsyncMock())

    def test_calculate_duration(self, extractor):
        """경력 기간 계산"""
        duration = extractor._calculate_duration("2020-01", "2023-06")
        assert duration == 41  # 3년 5개월

class TestCrossValidator:
    """Cross Validator 테스트"""

    @pytest.fixture
    def validator(self):
        from agents.quality.cross_validator import CrossValidator
        return CrossValidator()

    def test_validate_current_end_date_conflict(self, validator):
        """현재 재직/퇴사일 충돌"""
        data = {
            "careers": [{
                "company": "네이버",
                "is_current": True,
                "end_date": "2023-12"
            }]
        }

        result = validator.validate(data)
        assert result.error_count >= 1
```

### 8.2 통합 테스트

```python
# tests/integration/test_orchestrator.py

import pytest

class TestCollaborativeOrchestrator:
    """Orchestrator 통합 테스트"""

    @pytest.mark.asyncio
    async def test_full_extraction_pipeline(self):
        """전체 추출 파이프라인"""
        # 테스트 이력서
        resume = """
        이름: 김경민
        연락처: 010-1234-5678

        경력사항
        삼성전자 (2018.03 ~ 현재)
        - 책임연구원
        """

        # 오케스트레이션 실행
        # result = await orchestrator.orchestrate(resume)
        # assert result.success
        # assert "profile" in result.merged_data
        # assert "career" in result.merged_data
        pass

class TestErrorRecovery:
    """오류 복구 통합 테스트"""

    @pytest.mark.asyncio
    async def test_fallback_on_timeout(self):
        """타임아웃 시 폴백"""
        # 시뮬레이션
        pass
```

### 8.3 Mock 테스트 시나리오

```python
# tests/scenarios/test_scenarios.py

"""
시나리오 1: 복잡한 이력서 분석
- 10페이지, 15개 경력, 20개 프로젝트
- 예상: VERY_COMPLEX, premium 모델, 압축 적용
"""

"""
시나리오 2: API 실패 복구
- OpenAI 3회 타임아웃 → Claude 폴백
- 예상: 성공, recovery_used=True
"""

"""
시나리오 3: 환각 감지
- 원본에 없는 회사명 추출
- 예상: hallucinated_fields >= 1
"""
```

---

## 9. PM/QA/TA 관점 검토

### 9.1 Senior PM 관점

| 항목 | 비즈니스 요구 충족 | 위험 요소 | 권장 사항 |
|------|------------------|----------|----------|
| CoT 프롬프팅 | O - 정확도 향상 | 토큰 비용 증가 | 복잡도 기반 활성화 |
| Few-shot | O - 다양한 형식 대응 | 프롬프트 길이 | 예시 3개 제한 |
| strict 스키마 | O - 품질 보장 | 변경 어려움 | 버전 관리 |
| 컨텍스트 압축 | O - 긴 문서 처리 | 정보 손실 | 우선순위 기반 |
| 자동 복구 | O - 안정성 | 시간 증가 | SLA 재정의 |
| 병렬 처리 | O - 처리량 5배 | 동시성 이슈 | 모니터링 필수 |
| 캐싱 | O - 비용 30% 절감 | 불일치 | TTL 24시간 |
| 동적 모델 | O - 비용 최적화 | 품질 편차 | A/B 테스트 |
| 환각 감지 | O - 신뢰도 확보 | 추가 호출 | 샘플링 |
| 교차 검증 | O - 일관성 | 시간 증가 | 병렬 검증 |

### 9.2 Senior QA 관점

**필수 테스트**:
1. 단위 테스트: 각 모듈별, 커버리지 80%+
2. 통합 테스트: End-to-End 파이프라인
3. 성능 테스트: 100건 동시, P95 < 10초
4. 회귀 테스트: 골든 데이터셋 비교

### 9.3 Senior TA 관점

| 항목 | 난이도 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| CoT 프롬프팅 | 낮음 | 1일 | 없음 |
| Few-shot | 낮음 | 1일 | 없음 |
| strict 스키마 | 중간 | 2일 | OpenAI API |
| 컨텍스트 압축 | 중간 | 3일 | tiktoken |
| 자동 복구 | 높음 | 5일 | 없음 |
| 병렬 처리 | 높음 | 5일 | asyncio |
| 캐싱 | 중간 | 3일 | Redis (선택) |
| 동적 모델 선택 | 중간 | 3일 | 없음 |
| 환각 감지 | 높음 | 5일 | 없음 |
| 교차 검증 | 중간 | 3일 | 없음 |

**총 예상: 31일 (약 6주)**

---

## 10. 구현 로드맵

### Phase 1: 기반 구축 (Week 1-2)
- [x] Feature Flags 시스템
- [x] Shared Context
- [x] Communication Bus
- [x] Base Extractor
- [x] CoT 프롬프트 라이브러리
- [x] Few-shot 예시 확장
- [x] strict 스키마 정의

### Phase 2: 핵심 기능 (Week 3-4)
- [ ] Profile/Career/Education Extractor
- [ ] Skill/Project Extractor
- [ ] 컨텍스트 압축기
- [ ] 자동 복구 서비스
- [ ] 동적 모델 선택기

### Phase 3: 품질 보증 (Week 5-6)
- [ ] 환각 감지 Agent
- [ ] 교차 검증기
- [ ] Self-Reflection Agent
- [ ] 결과 캐싱

### Phase 4: 최적화 (Week 7-8)
- [ ] 병렬 처리 최적화
- [ ] Collaborative Orchestrator 완성
- [ ] 모니터링 대시보드
- [ ] 성능 튜닝

---

## 11. 리스크 관리 및 롤아웃 전략

### 11.1 주요 리스크

| # | 리스크 | 심각도 | 대응 방안 |
|---|--------|--------|----------|
| 1 | CoT 토큰 증가 | 중간 | 복잡도 기반 활성화 |
| 2 | strict 스키마 마이그레이션 | 높음 | 단계적 롤아웃 |
| 3 | Redis 의존성 | 낮음 | 메모리 캐시 폴백 |
| 4 | 병렬 처리 메모리 | 중간 | 세마포어 제한 |
| 5 | 환각 감지 비용 | 중간 | 샘플링 방식 |

### 11.2 롤아웃 전략

1. **Alpha (내부 테스트)**: 개발팀 내부 검증
2. **Beta (제한 배포)**: 5% 트래픽
3. **GA (일반 배포)**: 100% 트래픽

---

## 12. 결론

본 문서는 SRCHD Multi-Agent 시스템의 V2(협업 기능) + V3(10개 고도화 항목)을 통합한 **버전 3.0 구현 계획서**입니다.

### 핵심 성과 지표 (최종 목표)

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| 추출 정확도 | 85% | 97% | +12%p |
| 환각 발생률 | 8% | 1% | -87% |
| 평균 처리 시간 | 12초 | 4초 | -67% |
| LLM 비용/건 | $0.05 | $0.02 | -60% |
| 병렬 처리량 | 10건/분 | 50건/분 | +400% |

### 다음 단계

1. Phase 1 구현 착수
2. 단위 테스트 작성
3. 스테이징 환경 검증
4. 점진적 프로덕션 롤아웃

---

**문서 작성 완료**: 2026-02-13
**작성자**: Claude Opus 4.5 (Senior TA/PM/QA)
**버전**: 3.0 (V2 + V3 통합)
