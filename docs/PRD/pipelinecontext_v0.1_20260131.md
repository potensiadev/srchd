# PipelineContext 설계 문서 v0.1

**작성일**: 2026-01-31
**버전**: v0.1
**작성자**: AI Architecture Team

---

## 1. 개요

### 1.1 목적
PipelineContext는 srchd 서비스의 multi-agent 파이프라인에서 모든 에이전트가 컨텍스트를 공유하고, 정보 손실 없이 협업할 수 있도록 하는 중앙 정보 허브입니다.

### 1.2 핵심 원칙
1. **컨텍스트 무손실**: 파이프라인 전체에서 어떤 정보도 잃지 않음
2. **에이전트 독립성**: 에이전트는 독립적으로 동작하되 모든 정보를 공유
3. **증거 기반 추론**: LLM이 왜 특정 값을 선택했는지 추적
4. **환각 검증**: 원본 텍스트와 교차 검증하여 환각 탐지
5. **PII 보호**: 개인정보는 LLM에 절대 전송하지 않음

### 1.3 의사결정 사항 (사용자 승인 완료)
| 항목 | 결정 |
|------|------|
| 환각 처리 | 에이전트 상호 검증으로 해결, 단순 알림이 아님 |
| PII 필드 | 이름/전화/이메일은 정규식으로만 추출, LLM 전송 금지 |
| 신뢰도 표시 | 숫자 점수 (0-100), 뱃지 아님 |
| 피드백 수집 | 필드별 수정 저장 → 학습 데이터로 활용 |
| 진행 표시 | "서치드AI엔진1/2" (실제 모델명 노출 안함) |
| LLM 실패 | Graceful degradation (단일 LLM 결과도 허용) |
| 재시도 전략 | Checkpoint 시스템 (2분 TTL) |
| Ground Truth | 샘플링 + 사용자 수정 혼합 |

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                      PipelineContext                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Raw Input   │  │ Parsed Data  │  │  PII Store   │          │
│  │    Layer     │  │    Layer     │  │    Layer     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Stage Results │  │Evidence Store│  │Decision Store│          │
│  │    Layer     │  │    Layer     │  │    Layer     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Current Data │  │ Message Bus  │  │ Hallucination│          │
│  │    Layer     │  │    Layer     │  │   Records    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Warnings   │  │   Metadata   │  │  Audit Log   │          │
│  │    Layer     │  │    Layer     │  │    Layer     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Guardrails & Limits                      ││
│  │  max_messages=100 | max_hops=10 | max_conflicts=5           ││
│  │  stage_timeout=120s | total_timeout=600s                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 레이어별 상세 설계

### 3.1 Raw Input Layer (원본 입력 레이어)

**역할**: 원본 파일과 메타데이터를 보존

```python
@dataclass
class RawInput:
    """원본 입력 데이터"""
    file_bytes: Optional[bytes] = None  # Lazy loading
    file_path: Optional[str] = None
    filename: str = ""
    file_extension: str = ""
    file_size: int = 0
    mime_type: str = ""
    upload_timestamp: datetime = field(default_factory=datetime.now)
    source: str = ""  # "upload", "url", "email"

    # S3 정보 (file_bytes 대신 참조)
    s3_bucket: Optional[str] = None
    s3_key: Optional[str] = None
```

**설계 이유**:
- `file_bytes`는 메모리 효율을 위해 lazy loading
- S3 참조를 통해 대용량 파일도 처리 가능
- 원본 파일명에서 이름 추출에 활용

---

### 3.2 Parsed Data Layer (파싱 데이터 레이어)

**역할**: 파싱된 텍스트와 구조화된 데이터 저장

```python
@dataclass
class ParsedData:
    """파싱된 데이터"""
    raw_text: str = ""
    cleaned_text: str = ""
    text_length: int = 0

    # 구조화된 섹션
    sections: Dict[str, str] = field(default_factory=dict)
    # {"경력": "...", "학력": "...", "기술스택": "..."}

    # 파싱 품질 지표
    parsing_confidence: float = 0.0
    parsing_method: str = ""  # "pdfplumber", "hwp5", "docx"
    parsing_warnings: List[str] = field(default_factory=list)

    # 테이블 데이터
    tables: List[Dict[str, Any]] = field(default_factory=list)

    # 이미지/시각 요소
    has_images: bool = False
    image_count: int = 0
```

**설계 이유**:
- `raw_text`와 `cleaned_text` 분리로 환각 검증 시 원본 대조 가능
- `sections`로 구조화하여 특정 섹션만 LLM에 전달 가능
- 파싱 품질 지표로 저품질 파싱 결과 사전 경고

---

### 3.3 PII Store Layer (개인정보 저장 레이어)

**역할**: 정규식으로 추출한 PII를 안전하게 저장 (LLM 전송 금지)

```python
@dataclass
class PIIStore:
    """개인정보 저장소 - LLM에 절대 전송하지 않음"""

    # 정규식으로 추출된 PII
    name: Optional[str] = None
    name_confidence: float = 0.0
    name_source: str = ""  # "filename", "text_header", "regex"

    phone: Optional[str] = None
    phone_confidence: float = 0.0
    phone_original_format: str = ""  # 원본 형식 보존

    email: Optional[str] = None
    email_confidence: float = 0.0

    # 추가 PII (필요시)
    birth_date: Optional[str] = None
    address: Optional[str] = None

    # 마스킹된 텍스트 (LLM용)
    masked_text: str = ""
    masking_map: Dict[str, str] = field(default_factory=dict)
    # {"[NAME_1]": "김철수", "[PHONE_1]": "010-1234-5678"}

    # 추출 시각
    extracted_at: Optional[datetime] = None
```

**PII 추출 우선순위**:
1. **이름**: 파일명 → 텍스트 상단 200자 → 정규식 패턴
2. **전화번호**: 정규식 `01[0-9][-\s]?\d{3,4}[-\s]?\d{4}`
3. **이메일**: 정규식 `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`

**마스킹 프로세스**:
```python
def mask_pii_for_llm(self, text: str) -> str:
    """LLM 전송 전 PII 마스킹"""
    masked = text

    if self.name:
        masked = masked.replace(self.name, "[NAME]")
        self.masking_map["[NAME]"] = self.name

    if self.phone:
        masked = masked.replace(self.phone, "[PHONE]")
        self.masking_map["[PHONE]"] = self.phone

    if self.email:
        masked = masked.replace(self.email, "[EMAIL]")
        self.masking_map["[EMAIL]"] = self.email

    self.masked_text = masked
    return masked
```

---

### 3.4 Stage Results Layer (단계별 결과 레이어)

**역할**: 각 에이전트의 처리 결과 저장

```python
@dataclass
class StageResult:
    """단일 스테이지 결과"""
    stage_name: str
    agent_name: str
    status: str  # "pending", "running", "completed", "failed", "skipped"

    # 결과 데이터
    output: Dict[str, Any] = field(default_factory=dict)

    # 실행 정보
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: int = 0

    # LLM 사용 정보
    llm_provider: Optional[str] = None  # "openai", "gemini", "claude"
    llm_model: Optional[str] = None
    token_usage: Dict[str, int] = field(default_factory=dict)

    # 에러 정보
    error: Optional[str] = None
    error_code: Optional[str] = None
    retry_count: int = 0


@dataclass
class StageResults:
    """모든 스테이지 결과 컬렉션"""
    results: Dict[str, StageResult] = field(default_factory=dict)
    # {"parsing": StageResult, "pii_extraction": StageResult, ...}

    execution_order: List[str] = field(default_factory=list)
    current_stage: Optional[str] = None
```

**스테이지 정의**:
| 스테이지 | 에이전트 | 설명 |
|---------|---------|------|
| `parsing` | Parser | 파일 → 텍스트 변환 |
| `pii_extraction` | PIIExtractor | 정규식으로 PII 추출 |
| `identity_check` | IdentityChecker | 기존 후보자 중복 확인 |
| `analysis` | AnalystAgent | LLM 기반 이력서 분석 |
| `validation` | ValidationAgent | 교차 검증 및 환각 탐지 |
| `privacy` | PrivacyAgent | 민감정보 최종 검토 |
| `embedding` | EmbeddingService | 벡터 임베딩 생성 |
| `save` | DataSaver | DB 저장 |

---

### 3.5 Evidence Store Layer (증거 저장 레이어)

**역할**: LLM이 왜 특정 값을 선택했는지 추적

```python
@dataclass
class Evidence:
    """단일 증거"""
    field_name: str  # "exp_years", "skills", "current_company"
    value: Any

    # 증거 출처
    source_text: str  # 원본 텍스트에서 발췌
    source_location: str  # "경력 섹션 3번째 줄"

    # LLM 추론 근거
    llm_reasoning: str  # LLM이 설명한 추론 과정
    llm_provider: str

    # 신뢰도
    confidence: float  # 0.0 ~ 1.0
    confidence_factors: List[str] = field(default_factory=list)
    # ["파일명과 일치", "다수 LLM 동의", "원본 텍스트에서 확인"]

    # 교차 검증
    cross_validated: bool = False
    validators: List[str] = field(default_factory=list)
    # ["regex", "gemini", "gpt4"]

    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class EvidenceStore:
    """증거 저장소"""
    evidences: Dict[str, List[Evidence]] = field(default_factory=dict)
    # {"exp_years": [Evidence1, Evidence2], "skills": [...]}

    MAX_EVIDENCES_PER_FIELD: int = 10

    def add_evidence(self, evidence: Evidence):
        """증거 추가 (최대 개수 제한)"""
        field = evidence.field_name
        if field not in self.evidences:
            self.evidences[field] = []

        if len(self.evidences[field]) < self.MAX_EVIDENCES_PER_FIELD:
            self.evidences[field].append(evidence)

    def get_best_evidence(self, field_name: str) -> Optional[Evidence]:
        """가장 신뢰도 높은 증거 반환"""
        if field_name not in self.evidences:
            return None
        return max(self.evidences[field_name], key=lambda e: e.confidence)
```

---

### 3.6 Decision Store Layer (결정 저장 레이어)

**역할**: 에이전트 제안 → 최종 결정 패턴 관리

```python
@dataclass
class Proposal:
    """에이전트 제안"""
    id: str
    agent_name: str
    field_name: str
    proposed_value: Any
    confidence: float
    reasoning: str
    evidence_ids: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class Decision:
    """최종 결정"""
    id: str
    field_name: str
    final_value: Any
    final_confidence: float

    # 결정 근거
    decided_by: str  # "orchestrator", "majority_vote", "highest_confidence"
    decision_method: str

    # 관련 제안들
    proposals: List[Proposal] = field(default_factory=list)

    # 충돌 해결
    had_conflict: bool = False
    conflict_resolution: Optional[str] = None

    timestamp: datetime = field(default_factory=datetime.now)


class DecisionManager:
    """결정 관리자"""

    # 권한 계층
    AUTHORITY_LEVELS = {
        "orchestrator": 100,
        "analyst_agent": 80,
        "validation_agent": 70,
        "regex_extractor": 60,
        "fallback": 10
    }

    def __init__(self):
        self.proposals: Dict[str, List[Proposal]] = {}
        self.decisions: Dict[str, Decision] = {}
        self.conflict_count: int = 0

    def add_proposal(self, proposal: Proposal):
        """제안 추가"""
        field = proposal.field_name
        if field not in self.proposals:
            self.proposals[field] = []
        self.proposals[field].append(proposal)

    def make_decision(self, field_name: str) -> Decision:
        """최종 결정 수행"""
        proposals = self.proposals.get(field_name, [])

        if not proposals:
            return self._create_empty_decision(field_name)

        # 충돌 감지
        unique_values = set(p.proposed_value for p in proposals)
        had_conflict = len(unique_values) > 1

        if had_conflict:
            self.conflict_count += 1
            return self._resolve_conflict(field_name, proposals)

        # 충돌 없음 - 가장 높은 신뢰도 선택
        best = max(proposals, key=lambda p: p.confidence)
        return Decision(
            id=f"decision_{field_name}_{datetime.now().timestamp()}",
            field_name=field_name,
            final_value=best.proposed_value,
            final_confidence=best.confidence,
            decided_by=best.agent_name,
            decision_method="highest_confidence",
            proposals=proposals,
            had_conflict=False
        )

    def _resolve_conflict(self, field_name: str, proposals: List[Proposal]) -> Decision:
        """충돌 해결"""
        # 1. 권한 레벨이 높은 에이전트 우선
        proposals_with_authority = [
            (p, self.AUTHORITY_LEVELS.get(p.agent_name, 0))
            for p in proposals
        ]

        # 권한 레벨이 같으면 신뢰도로
        sorted_proposals = sorted(
            proposals_with_authority,
            key=lambda x: (x[1], x[0].confidence),
            reverse=True
        )

        winner = sorted_proposals[0][0]

        return Decision(
            id=f"decision_{field_name}_{datetime.now().timestamp()}",
            field_name=field_name,
            final_value=winner.proposed_value,
            final_confidence=winner.confidence * 0.9,  # 충돌로 인한 감점
            decided_by="conflict_resolver",
            decision_method="authority_then_confidence",
            proposals=proposals,
            had_conflict=True,
            conflict_resolution=f"Selected {winner.agent_name}'s proposal"
        )
```

---

### 3.7 Current Data Layer (현재 데이터 레이어)

**역할**: 파이프라인이 점진적으로 구축하는 최종 결과

```python
@dataclass
class CurrentData:
    """현재 확정된 데이터"""

    # 기본 정보 (PII Store에서 가져옴)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    # LLM 분석 결과
    exp_years: Optional[float] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None

    # 구조화된 데이터
    careers: List[Dict[str, Any]] = field(default_factory=list)
    educations: List[Dict[str, Any]] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)

    # 요약
    summary: Optional[str] = None
    strengths: List[str] = field(default_factory=list)

    # 신뢰도 점수 (0-100 정수)
    confidence_scores: Dict[str, int] = field(default_factory=dict)
    # {"name": 95, "exp_years": 78, "skills": 82}

    # 전체 신뢰도
    overall_confidence: int = 0

    # 임베딩
    embedding: Optional[List[float]] = None
    embedding_model: Optional[str] = None
```

**신뢰도 계산 공식**:
```python
def calculate_overall_confidence(self) -> int:
    """전체 신뢰도 계산"""
    weights = {
        "name": 0.15,
        "exp_years": 0.20,
        "careers": 0.25,
        "skills": 0.20,
        "educations": 0.10,
        "summary": 0.10
    }

    total = 0
    weight_sum = 0

    for field, weight in weights.items():
        if field in self.confidence_scores:
            total += self.confidence_scores[field] * weight
            weight_sum += weight

    if weight_sum > 0:
        self.overall_confidence = int(total / weight_sum)

    return self.overall_confidence
```

---

### 3.8 Message Bus Layer (메시지 버스 레이어)

**역할**: 에이전트 간 직접 통신 지원

```python
@dataclass
class AgentMessage:
    """에이전트 간 메시지"""
    id: str
    from_agent: str
    to_agent: str  # "*" for broadcast
    message_type: str  # "request", "response", "notification", "query"

    # 메시지 내용
    subject: str
    payload: Dict[str, Any] = field(default_factory=dict)

    # 추적
    correlation_id: Optional[str] = None  # 요청-응답 연결
    hop_count: int = 0  # 순환 방지

    # 상태
    status: str = "pending"  # "pending", "delivered", "processed", "failed"

    timestamp: datetime = field(default_factory=datetime.now)


class MessageBus:
    """에이전트 간 메시지 버스"""

    MAX_MESSAGES = 100
    MAX_HOPS = 10

    def __init__(self):
        self.messages: List[AgentMessage] = []
        self.subscriptions: Dict[str, List[str]] = {}  # agent -> [message_types]
        self.processed_ids: Set[str] = set()

    def send(self, message: AgentMessage) -> bool:
        """메시지 전송"""
        # 가드레일 체크
        if len(self.messages) >= self.MAX_MESSAGES:
            logger.warning("Message limit reached")
            return False

        if message.hop_count >= self.MAX_HOPS:
            logger.warning(f"Max hops reached for message {message.id}")
            return False

        # 중복 체크
        if message.id in self.processed_ids:
            return False

        self.messages.append(message)
        return True

    def get_messages_for(self, agent_name: str) -> List[AgentMessage]:
        """특정 에이전트의 메시지 조회"""
        return [
            m for m in self.messages
            if (m.to_agent == agent_name or m.to_agent == "*")
            and m.status == "pending"
        ]

    def reply(self, original: AgentMessage, response_payload: Dict[str, Any]) -> AgentMessage:
        """메시지에 응답"""
        reply = AgentMessage(
            id=f"msg_{datetime.now().timestamp()}",
            from_agent=original.to_agent,
            to_agent=original.from_agent,
            message_type="response",
            subject=f"RE: {original.subject}",
            payload=response_payload,
            correlation_id=original.id,
            hop_count=original.hop_count + 1
        )
        self.send(reply)
        return reply
```

**메시지 유형 예시**:
```python
# ValidationAgent가 AnalystAgent에게 검증 요청
message = AgentMessage(
    id="msg_001",
    from_agent="validation_agent",
    to_agent="analyst_agent",
    message_type="query",
    subject="경력 연수 검증 요청",
    payload={
        "field": "exp_years",
        "extracted_value": 5,
        "calculated_value": 7,
        "question": "경력 목록 기반 계산과 차이 발생. 재확인 필요"
    }
)
```

---

### 3.9 Hallucination Records Layer (환각 기록 레이어)

**역할**: LLM 환각 탐지 및 기록

```python
@dataclass
class HallucinationRecord:
    """환각 탐지 기록"""
    id: str
    field_name: str

    # 환각 내용
    hallucinated_value: Any
    correct_value: Optional[Any] = None

    # 탐지 정보
    detection_method: str  # "regex_mismatch", "cross_llm", "text_verification"
    detector_agent: str

    # 원본 대조
    original_text_snippet: str = ""
    text_contains_value: bool = False

    # LLM 정보
    llm_provider: str = ""
    llm_model: str = ""

    # 심각도
    severity: str = "medium"  # "low", "medium", "high", "critical"

    # 해결
    resolved: bool = False
    resolution: Optional[str] = None

    timestamp: datetime = field(default_factory=datetime.now)


class HallucinationDetector:
    """환각 탐지기"""

    def __init__(self, parsed_data: ParsedData, pii_store: PIIStore):
        self.parsed_data = parsed_data
        self.pii_store = pii_store
        self.records: List[HallucinationRecord] = []

    def verify_against_text(self, field_name: str, value: Any) -> HallucinationRecord:
        """원본 텍스트와 대조 검증"""
        text = self.parsed_data.raw_text

        # 값이 원본에 존재하는지 확인
        value_str = str(value)
        text_contains = value_str.lower() in text.lower()

        # 숫자의 경우 다양한 형식 체크
        if isinstance(value, (int, float)):
            patterns = [
                str(int(value)),
                f"{value}년",
                f"{value}years",
                f"{int(value)}년차"
            ]
            text_contains = any(p in text for p in patterns)

        if not text_contains:
            record = HallucinationRecord(
                id=f"halluc_{datetime.now().timestamp()}",
                field_name=field_name,
                hallucinated_value=value,
                detection_method="text_verification",
                detector_agent="hallucination_detector",
                original_text_snippet=text[:500],
                text_contains_value=False,
                severity="medium"
            )
            self.records.append(record)
            return record

        return None

    def cross_validate_llm_results(
        self,
        field_name: str,
        results: Dict[str, Any]  # {"gpt4": value1, "gemini": value2, "claude": value3}
    ) -> Optional[HallucinationRecord]:
        """다중 LLM 결과 교차 검증"""
        values = list(results.values())

        # 모든 값이 동일하면 OK
        if len(set(str(v) for v in values)) == 1:
            return None

        # 다수결
        from collections import Counter
        counter = Counter(str(v) for v in values)
        most_common = counter.most_common(1)[0]

        # 소수 의견을 환각으로 기록
        for provider, value in results.items():
            if str(value) != most_common[0]:
                record = HallucinationRecord(
                    id=f"halluc_{datetime.now().timestamp()}",
                    field_name=field_name,
                    hallucinated_value=value,
                    correct_value=most_common[0],
                    detection_method="cross_llm",
                    detector_agent="hallucination_detector",
                    llm_provider=provider,
                    severity="low" if most_common[1] >= 2 else "medium"
                )
                self.records.append(record)
                return record

        return None
```

---

### 3.10 Warnings Layer (경고 레이어)

**역할**: 파이프라인 경고 수집

```python
@dataclass
class Warning:
    """파이프라인 경고"""
    code: str  # "LOW_CONFIDENCE", "PII_DETECTED", "PARSING_ISSUE"
    message: str
    severity: str  # "info", "warning", "error"

    field_name: Optional[str] = None
    stage_name: Optional[str] = None

    # 사용자 표시 여부
    user_visible: bool = True

    timestamp: datetime = field(default_factory=datetime.now)


class WarningCollector:
    """경고 수집기"""

    WARNING_CODES = {
        "LOW_CONFIDENCE": "신뢰도가 낮습니다",
        "PII_DETECTED": "개인정보가 감지되었습니다",
        "PARSING_ISSUE": "파싱 중 문제가 발생했습니다",
        "LLM_DISAGREEMENT": "AI 모델 간 의견 차이가 있습니다",
        "MISSING_REQUIRED": "필수 정보가 누락되었습니다",
        "HALLUCINATION_DETECTED": "정보 검증에 실패했습니다"
    }

    def __init__(self):
        self.warnings: List[Warning] = []

    def add(self, code: str, message: str = None, **kwargs):
        """경고 추가"""
        warning = Warning(
            code=code,
            message=message or self.WARNING_CODES.get(code, code),
            **kwargs
        )
        self.warnings.append(warning)

    def get_user_visible(self) -> List[Warning]:
        """사용자에게 표시할 경고만 반환"""
        return [w for w in self.warnings if w.user_visible]
```

---

### 3.11 Metadata Layer (메타데이터 레이어)

**역할**: 파이프라인 실행 메타데이터

```python
@dataclass
class PipelineMetadata:
    """파이프라인 메타데이터"""

    # 식별자
    pipeline_id: str = ""
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None

    # 실행 정보
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str = "pending"  # "pending", "running", "completed", "failed"

    # 소스 정보
    organization_id: Optional[str] = None
    user_id: Optional[str] = None

    # 설정
    config: Dict[str, Any] = field(default_factory=dict)
    # {"llm_strategy": "parallel", "enable_3way": True}

    # 통계
    total_llm_calls: int = 0
    total_tokens_used: int = 0
    total_cost_usd: float = 0.0

    # 체크포인트 (재시도용)
    checkpoint: Optional[Dict[str, Any]] = None
    checkpoint_created_at: Optional[datetime] = None
    checkpoint_ttl_seconds: int = 120  # 2분

    # 버전
    pipeline_version: str = "1.0.0"
```

---

### 3.12 Audit Log Layer (감사 로그 레이어)

**역할**: 모든 변경 사항 추적

```python
@dataclass
class AuditEntry:
    """감사 로그 항목"""
    id: str
    action: str  # "create", "update", "delete", "decision"

    actor: str  # 에이전트 또는 시스템
    target: str  # 변경된 필드/객체

    old_value: Optional[Any] = None
    new_value: Optional[Any] = None

    reason: Optional[str] = None

    timestamp: datetime = field(default_factory=datetime.now)


class AuditLog:
    """감사 로그"""

    MAX_ENTRIES = 500

    def __init__(self):
        self.entries: List[AuditEntry] = []

    def log(self, action: str, actor: str, target: str, **kwargs):
        """감사 로그 추가"""
        if len(self.entries) >= self.MAX_ENTRIES:
            # 오래된 항목 제거
            self.entries = self.entries[-400:]

        entry = AuditEntry(
            id=f"audit_{datetime.now().timestamp()}",
            action=action,
            actor=actor,
            target=target,
            **kwargs
        )
        self.entries.append(entry)
```

---

### 3.13 Guardrails (가드레일)

**역할**: 파이프라인 안전 장치

```python
@dataclass
class PipelineGuardrails:
    """파이프라인 가드레일 설정"""

    # 메시지 제한
    max_messages: int = 100
    max_hops: int = 10

    # 충돌 제한
    max_conflicts: int = 5

    # 시간 제한
    stage_timeout_seconds: int = 120
    total_timeout_seconds: int = 600

    # LLM 제한
    max_llm_calls_per_stage: int = 5
    max_total_llm_calls: int = 20
    max_tokens_per_call: int = 4000

    # 재시도 제한
    max_retries_per_stage: int = 3

    # 메모리 제한
    max_evidence_per_field: int = 10
    max_audit_entries: int = 500


class GuardrailChecker:
    """가드레일 체크"""

    def __init__(self, guardrails: PipelineGuardrails):
        self.guardrails = guardrails
        self.violations: List[str] = []

    def check_message_limit(self, current_count: int) -> bool:
        if current_count >= self.guardrails.max_messages:
            self.violations.append("Message limit exceeded")
            return False
        return True

    def check_conflict_limit(self, conflict_count: int) -> bool:
        if conflict_count >= self.guardrails.max_conflicts:
            self.violations.append("Conflict limit exceeded")
            return False
        return True

    def check_timeout(self, started_at: datetime) -> bool:
        elapsed = (datetime.now() - started_at).total_seconds()
        if elapsed >= self.guardrails.total_timeout_seconds:
            self.violations.append("Total timeout exceeded")
            return False
        return True
```

---

## 4. 메인 PipelineContext 클래스

```python
@dataclass
class PipelineContext:
    """
    파이프라인 컨텍스트 - 모든 에이전트가 공유하는 중앙 정보 허브
    """

    # 레이어들
    raw_input: RawInput = field(default_factory=RawInput)
    parsed_data: ParsedData = field(default_factory=ParsedData)
    pii_store: PIIStore = field(default_factory=PIIStore)
    stage_results: StageResults = field(default_factory=StageResults)
    evidence_store: EvidenceStore = field(default_factory=EvidenceStore)
    decision_manager: DecisionManager = field(default_factory=DecisionManager)
    current_data: CurrentData = field(default_factory=CurrentData)
    message_bus: MessageBus = field(default_factory=MessageBus)
    hallucination_detector: HallucinationDetector = None  # 나중에 초기화
    warning_collector: WarningCollector = field(default_factory=WarningCollector)
    metadata: PipelineMetadata = field(default_factory=PipelineMetadata)
    audit_log: AuditLog = field(default_factory=AuditLog)
    guardrails: PipelineGuardrails = field(default_factory=PipelineGuardrails)

    def __post_init__(self):
        """초기화 후 처리"""
        self.metadata.pipeline_id = f"pipeline_{datetime.now().timestamp()}"
        self.metadata.started_at = datetime.now()
        self.metadata.status = "running"

    # === 주요 메서드 ===

    def set_raw_input(self, file_bytes: bytes, filename: str, **kwargs):
        """원본 입력 설정"""
        import os
        self.raw_input.file_bytes = file_bytes
        self.raw_input.filename = filename
        self.raw_input.file_extension = os.path.splitext(filename)[1].lower()
        self.raw_input.file_size = len(file_bytes)

        for key, value in kwargs.items():
            if hasattr(self.raw_input, key):
                setattr(self.raw_input, key, value)

        self.audit_log.log("create", "system", "raw_input",
                          new_value={"filename": filename, "size": len(file_bytes)})

    def set_parsed_text(self, raw_text: str, cleaned_text: str = None, **kwargs):
        """파싱된 텍스트 설정"""
        self.parsed_data.raw_text = raw_text
        self.parsed_data.cleaned_text = cleaned_text or raw_text
        self.parsed_data.text_length = len(raw_text)

        # HallucinationDetector 초기화
        self.hallucination_detector = HallucinationDetector(
            self.parsed_data, self.pii_store
        )

        self.audit_log.log("create", "parser", "parsed_data",
                          new_value={"text_length": len(raw_text)})

    def extract_pii(self):
        """정규식으로 PII 추출 (LLM 사용 안함)"""
        from apps.worker.agents.validation_agent import ValidationAgent

        validator = ValidationAgent()
        text = self.parsed_data.raw_text
        filename = self.raw_input.filename

        # 이름 추출
        name_result = validator._validate_name(None, text, filename)
        if name_result.get("valid"):
            self.pii_store.name = name_result["value"]
            self.pii_store.name_confidence = name_result.get("confidence_boost", 0) + 0.5
            self.pii_store.name_source = name_result.get("reason", "unknown")

        # 전화번호 추출
        phone_result = validator._validate_phone(None, text)
        if phone_result.get("valid"):
            self.pii_store.phone = phone_result["value"]
            self.pii_store.phone_confidence = phone_result.get("confidence_boost", 0) + 0.5

        # 이메일 추출
        email_result = validator._validate_email(None, text)
        if email_result.get("valid"):
            self.pii_store.email = email_result["value"]
            self.pii_store.email_confidence = email_result.get("confidence_boost", 0) + 0.5

        self.pii_store.extracted_at = datetime.now()

        # PII 마스킹된 텍스트 생성
        self.pii_store.mask_pii_for_llm(text)

        self.audit_log.log("create", "pii_extractor", "pii_store",
                          new_value={"name": bool(self.pii_store.name),
                                    "phone": bool(self.pii_store.phone),
                                    "email": bool(self.pii_store.email)})

    def get_text_for_llm(self) -> str:
        """LLM에 전송할 마스킹된 텍스트 반환"""
        if self.pii_store.masked_text:
            return self.pii_store.masked_text
        return self.parsed_data.cleaned_text

    def add_stage_result(self, stage_name: str, agent_name: str, output: Dict[str, Any], **kwargs):
        """스테이지 결과 추가"""
        result = StageResult(
            stage_name=stage_name,
            agent_name=agent_name,
            output=output,
            status="completed",
            completed_at=datetime.now(),
            **kwargs
        )
        self.stage_results.results[stage_name] = result
        self.stage_results.execution_order.append(stage_name)

        self.audit_log.log("create", agent_name, f"stage_result:{stage_name}",
                          new_value={"status": "completed"})

    def propose(self, agent_name: str, field_name: str, value: Any,
                confidence: float, reasoning: str, **kwargs):
        """에이전트가 값을 제안"""
        proposal = Proposal(
            id=f"proposal_{datetime.now().timestamp()}",
            agent_name=agent_name,
            field_name=field_name,
            proposed_value=value,
            confidence=confidence,
            reasoning=reasoning,
            **kwargs
        )
        self.decision_manager.add_proposal(proposal)

        self.audit_log.log("create", agent_name, f"proposal:{field_name}",
                          new_value={"value": value, "confidence": confidence})

    def decide(self, field_name: str) -> Decision:
        """필드에 대한 최종 결정"""
        decision = self.decision_manager.make_decision(field_name)

        # CurrentData에 반영
        if hasattr(self.current_data, field_name):
            setattr(self.current_data, field_name, decision.final_value)

            # 신뢰도 점수 (0-100)
            confidence_int = int(decision.final_confidence * 100)
            self.current_data.confidence_scores[field_name] = confidence_int

        self.audit_log.log("decision", "decision_manager", f"decision:{field_name}",
                          new_value={"value": decision.final_value,
                                    "confidence": decision.final_confidence,
                                    "method": decision.decision_method})

        return decision

    def verify_hallucination(self, field_name: str, value: Any) -> bool:
        """환각 검증"""
        if not self.hallucination_detector:
            return True

        record = self.hallucination_detector.verify_against_text(field_name, value)
        if record:
            self.warning_collector.add(
                "HALLUCINATION_DETECTED",
                f"'{field_name}' 필드의 값이 원본에서 확인되지 않습니다",
                field_name=field_name,
                severity="warning"
            )
            return False
        return True

    def send_message(self, from_agent: str, to_agent: str,
                     message_type: str, subject: str, payload: Dict[str, Any]) -> bool:
        """에이전트 간 메시지 전송"""
        message = AgentMessage(
            id=f"msg_{datetime.now().timestamp()}",
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=message_type,
            subject=subject,
            payload=payload
        )
        return self.message_bus.send(message)

    def create_checkpoint(self) -> Dict[str, Any]:
        """체크포인트 생성 (재시도용)"""
        checkpoint = {
            "pipeline_id": self.metadata.pipeline_id,
            "current_stage": self.stage_results.current_stage,
            "completed_stages": list(self.stage_results.execution_order),
            "current_data": asdict(self.current_data),
            "pii_store": {
                "name": self.pii_store.name,
                "phone": self.pii_store.phone,
                "email": self.pii_store.email
            },
            "created_at": datetime.now().isoformat()
        }
        self.metadata.checkpoint = checkpoint
        self.metadata.checkpoint_created_at = datetime.now()
        return checkpoint

    def restore_from_checkpoint(self, checkpoint: Dict[str, Any]) -> bool:
        """체크포인트에서 복원"""
        # TTL 체크
        created_at = datetime.fromisoformat(checkpoint["created_at"])
        elapsed = (datetime.now() - created_at).total_seconds()

        if elapsed > self.metadata.checkpoint_ttl_seconds:
            return False  # 체크포인트 만료

        # 복원
        self.metadata.pipeline_id = checkpoint["pipeline_id"]
        self.stage_results.current_stage = checkpoint["current_stage"]
        self.stage_results.execution_order = checkpoint["completed_stages"]

        # PII 복원
        pii = checkpoint.get("pii_store", {})
        self.pii_store.name = pii.get("name")
        self.pii_store.phone = pii.get("phone")
        self.pii_store.email = pii.get("email")

        return True

    def finalize(self) -> Dict[str, Any]:
        """파이프라인 완료 및 최종 결과 반환"""
        self.metadata.completed_at = datetime.now()
        self.metadata.status = "completed"

        # PII를 CurrentData에 병합
        self.current_data.name = self.pii_store.name
        self.current_data.phone = self.pii_store.phone
        self.current_data.email = self.pii_store.email

        # 전체 신뢰도 계산
        self.current_data.calculate_overall_confidence()

        # 최종 결과
        return {
            "candidate": asdict(self.current_data),
            "confidence": self.current_data.overall_confidence,
            "warnings": [asdict(w) for w in self.warning_collector.get_user_visible()],
            "metadata": {
                "pipeline_id": self.metadata.pipeline_id,
                "duration_ms": int((self.metadata.completed_at - self.metadata.started_at).total_seconds() * 1000),
                "llm_calls": self.metadata.total_llm_calls,
                "tokens_used": self.metadata.total_tokens_used
            }
        }

    def to_dict(self) -> Dict[str, Any]:
        """전체 컨텍스트를 딕셔너리로 변환"""
        return {
            "raw_input": asdict(self.raw_input),
            "parsed_data": asdict(self.parsed_data),
            "pii_store": asdict(self.pii_store),
            "stage_results": {k: asdict(v) for k, v in self.stage_results.results.items()},
            "evidence_store": {k: [asdict(e) for e in v] for k, v in self.evidence_store.evidences.items()},
            "current_data": asdict(self.current_data),
            "warnings": [asdict(w) for w in self.warning_collector.warnings],
            "metadata": asdict(self.metadata)
        }
```

---

## 5. 데이터 흐름

```
[파일 업로드]
     │
     ▼
┌─────────────────┐
│   RawInput      │  ← file_bytes, filename
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Parser        │  → parsed_data.raw_text
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PII Extractor  │  → pii_store (regex only, NO LLM)
│  (정규식 전용)    │  → pii_store.masked_text
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Identity Check  │  → stage_results["identity"]
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AnalystAgent   │  ← get_text_for_llm() (마스킹된 텍스트)
│  (GPT + Gemini) │  → propose() 여러 번 호출
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ValidationAgent  │  → verify_hallucination()
│  + Hallucination│  → 추가 propose() 또는 반박
│    Detector     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│DecisionManager  │  → decide() 각 필드별
│  (최종 결정)     │  → current_data 업데이트
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Embedding     │  → current_data.embedding
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   finalize()    │  → 최종 결과 + 신뢰도 점수
└─────────────────┘
```

---

## 6. 사용 예시

```python
# 파이프라인 시작
ctx = PipelineContext()

# 1. 원본 입력 설정
ctx.set_raw_input(file_bytes, "김철수_이력서.pdf")

# 2. 파싱
parsed_text = parse_pdf(file_bytes)
ctx.set_parsed_text(parsed_text)

# 3. PII 추출 (정규식 전용)
ctx.extract_pii()
# ctx.pii_store.name = "김철수"
# ctx.pii_store.phone = "010-1234-5678"

# 4. LLM 분석 (마스킹된 텍스트 사용)
masked_text = ctx.get_text_for_llm()
# "[NAME]님의 이력서입니다. 연락처: [PHONE]..."

# GPT 분석
gpt_result = analyze_with_gpt(masked_text)
ctx.propose("analyst_gpt", "exp_years", gpt_result["exp_years"],
            confidence=0.85, reasoning="경력 섹션에서 5년 경력 확인")

# Gemini 분석
gemini_result = analyze_with_gemini(masked_text)
ctx.propose("analyst_gemini", "exp_years", gemini_result["exp_years"],
            confidence=0.82, reasoning="경력 목록 분석 결과 5년")

# 5. 환각 검증
if not ctx.verify_hallucination("exp_years", 5):
    # 원본에서 확인 안됨 - 추가 검증 필요
    ctx.send_message("validation_agent", "analyst_agent", "query",
                     "경력 연수 재확인", {"field": "exp_years"})

# 6. 최종 결정
decision = ctx.decide("exp_years")
# decision.final_value = 5
# decision.final_confidence = 0.83

# 7. 완료
result = ctx.finalize()
# {
#   "candidate": {"name": "김철수", "exp_years": 5, ...},
#   "confidence": 85,
#   "warnings": [...],
#   "metadata": {...}
# }
```

---

## 7. 구현 우선순위

### Phase 1: 핵심 구조
1. `PipelineContext` 기본 클래스
2. `RawInput`, `ParsedData` 레이어
3. `PIIStore` + 정규식 추출
4. `CurrentData` 레이어

### Phase 2: 증거 시스템
5. `Evidence`, `EvidenceStore`
6. `Proposal`, `Decision`, `DecisionManager`
7. `HallucinationDetector`

### Phase 3: 통신 & 안전
8. `MessageBus`
9. `PipelineGuardrails`
10. `AuditLog`

### Phase 4: 통합
11. 기존 에이전트 리팩토링
12. Checkpoint 시스템
13. 사용자 피드백 학습 시스템

---

## 8. 참고 사항

### 8.1 메모리 관리
- `file_bytes`: 필요할 때만 로드 (lazy loading)
- `Evidence`: 필드당 최대 10개
- `AuditLog`: 최대 500개 (초과 시 오래된 항목 삭제)
- `Messages`: 최대 100개

### 8.2 에러 처리
- 각 스테이지는 독립적으로 실패할 수 있음
- 실패 시 해당 스테이지 결과는 `status: "failed"`
- 전체 파이프라인은 critical 스테이지 실패 시에만 중단

### 8.3 테스트 전략
- 각 레이어별 단위 테스트
- 에이전트 간 메시지 통합 테스트
- 환각 탐지 정확도 테스트
- 가드레일 한계 테스트

---

**문서 끝**
