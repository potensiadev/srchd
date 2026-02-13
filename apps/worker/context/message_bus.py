"""
Message Bus - 에이전트 간 직접 통신 지원

에이전트들이 서로 메시지를 주고받을 수 있습니다.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Set, Callable
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """메시지 유형"""
    REQUEST = "request"      # 요청
    RESPONSE = "response"    # 응답
    NOTIFICATION = "notification"  # 알림
    QUERY = "query"          # 질의
    BROADCAST = "broadcast"  # 전체 브로드캐스트


@dataclass
class AgentMessage:
    """
    에이전트 간 메시지

    에이전트가 다른 에이전트에게 보내는 메시지입니다.
    """
    from_agent: str
    to_agent: str  # "*" for broadcast
    message_type: str  # MessageType value
    subject: str

    # 메시지 내용
    payload: Dict[str, Any] = field(default_factory=dict)

    # 추적
    correlation_id: Optional[str] = None  # 요청-응답 연결
    hop_count: int = 0  # 순환 방지

    # 상태
    status: str = "pending"  # "pending", "delivered", "processed", "failed"

    # 메타데이터
    message_id: str = ""
    timestamp: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if not self.message_id:
            self.message_id = f"msg_{datetime.now().timestamp()}"

    def is_broadcast(self) -> bool:
        """브로드캐스트 메시지인지 확인"""
        return self.to_agent == "*"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message_id": self.message_id,
            "from_agent": self.from_agent,
            "to_agent": self.to_agent,
            "message_type": self.message_type,
            "subject": self.subject,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
            "hop_count": self.hop_count,
            "status": self.status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class MessageBus:
    """
    에이전트 간 메시지 버스

    에이전트들이 메시지를 주고받을 수 있는 중앙 허브입니다.
    """

    MAX_MESSAGES = 100
    MAX_HOPS = 10

    def __init__(self, max_messages: int = None, max_hops: int = None):
        self.max_messages = max_messages or self.MAX_MESSAGES
        self.max_hops = max_hops or self.MAX_HOPS

        self.messages: List[AgentMessage] = []
        self.processed_ids: Set[str] = set()

        # 메시지 핸들러 (에이전트 이름 -> 콜백 함수)
        self.handlers: Dict[str, Callable[[AgentMessage], Optional[Dict[str, Any]]]] = {}

        # 통계
        self.total_sent: int = 0
        self.total_processed: int = 0
        self.total_failed: int = 0

    def register_handler(self, agent_name: str, handler: Callable[[AgentMessage], Optional[Dict[str, Any]]]):
        """
        메시지 핸들러 등록

        에이전트가 메시지를 받을 때 호출될 콜백을 등록합니다.
        """
        self.handlers[agent_name] = handler
        logger.debug(f"[MessageBus] 핸들러 등록: {agent_name}")

    def send(self, message: AgentMessage) -> bool:
        """
        메시지 전송

        메시지를 버스에 추가하고, 핸들러가 등록되어 있으면 바로 처리합니다.
        """
        # 가드레일 체크
        if len(self.messages) >= self.max_messages:
            logger.warning(f"[MessageBus] 메시지 한도 초과 ({self.max_messages})")
            return False

        if message.hop_count >= self.max_hops:
            logger.warning(f"[MessageBus] 최대 hop 도달: {message.message_id}")
            return False

        # 중복 체크
        if message.message_id in self.processed_ids:
            logger.debug(f"[MessageBus] 중복 메시지 무시: {message.message_id}")
            return False

        self.messages.append(message)
        self.total_sent += 1

        logger.debug(f"[MessageBus] 메시지 전송: {message.from_agent} -> {message.to_agent}: {message.subject}")

        # 핸들러가 있으면 바로 처리
        if message.to_agent in self.handlers:
            self._process_message(message)
        elif message.is_broadcast():
            self._process_broadcast(message)

        return True

    def send_request(
        self,
        from_agent: str,
        to_agent: str,
        subject: str,
        payload: Dict[str, Any] = None
    ) -> AgentMessage:
        """요청 메시지 전송 (간편 메서드)"""
        message = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=MessageType.REQUEST.value,
            subject=subject,
            payload=payload or {}
        )
        self.send(message)
        return message

    def send_query(
        self,
        from_agent: str,
        to_agent: str,
        subject: str,
        payload: Dict[str, Any] = None
    ) -> AgentMessage:
        """질의 메시지 전송"""
        message = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type=MessageType.QUERY.value,
            subject=subject,
            payload=payload or {}
        )
        self.send(message)
        return message

    def broadcast(
        self,
        from_agent: str,
        subject: str,
        payload: Dict[str, Any] = None
    ) -> AgentMessage:
        """브로드캐스트 메시지 전송"""
        message = AgentMessage(
            from_agent=from_agent,
            to_agent="*",
            message_type=MessageType.BROADCAST.value,
            subject=subject,
            payload=payload or {}
        )
        self.send(message)
        return message

    def reply(
        self,
        original: AgentMessage,
        response_payload: Dict[str, Any]
    ) -> AgentMessage:
        """메시지에 응답"""
        reply = AgentMessage(
            from_agent=original.to_agent,
            to_agent=original.from_agent,
            message_type=MessageType.RESPONSE.value,
            subject=f"RE: {original.subject}",
            payload=response_payload,
            correlation_id=original.message_id,
            hop_count=original.hop_count + 1
        )
        self.send(reply)
        return reply

    def _process_message(self, message: AgentMessage):
        """메시지 처리"""
        if message.to_agent not in self.handlers:
            return

        try:
            handler = self.handlers[message.to_agent]
            result = handler(message)

            message.status = "processed"
            self.processed_ids.add(message.message_id)
            self.total_processed += 1

            # 핸들러가 응답을 반환하면 자동 응답
            if result and message.message_type in [MessageType.REQUEST.value, MessageType.QUERY.value]:
                self.reply(message, result)

        except Exception as e:
            message.status = "failed"
            self.total_failed += 1
            logger.error(f"[MessageBus] 메시지 처리 실패: {message.message_id}, {e}")

    def _process_broadcast(self, message: AgentMessage):
        """브로드캐스트 메시지 처리"""
        for agent_name, handler in self.handlers.items():
            if agent_name != message.from_agent:
                try:
                    handler(message)
                except Exception as e:
                    logger.error(f"[MessageBus] 브로드캐스트 처리 실패: {agent_name}, {e}")

        message.status = "processed"
        self.processed_ids.add(message.message_id)
        self.total_processed += 1

    def get_messages_for(self, agent_name: str) -> List[AgentMessage]:
        """특정 에이전트의 대기 중인 메시지 조회"""
        return [
            m for m in self.messages
            if (m.to_agent == agent_name or m.to_agent == "*")
            and m.status == "pending"
            and m.from_agent != agent_name
        ]

    def get_response(self, request_id: str) -> Optional[AgentMessage]:
        """요청에 대한 응답 조회"""
        for m in self.messages:
            if m.correlation_id == request_id and m.message_type == MessageType.RESPONSE.value:
                return m
        return None

    def get_conversation(self, correlation_id: str) -> List[AgentMessage]:
        """특정 대화의 모든 메시지 조회"""
        result = []
        for m in self.messages:
            if m.message_id == correlation_id or m.correlation_id == correlation_id:
                result.append(m)
        return sorted(result, key=lambda m: m.timestamp)

    def mark_processed(self, message_id: str):
        """메시지를 처리됨으로 표시"""
        for m in self.messages:
            if m.message_id == message_id:
                m.status = "processed"
                self.processed_ids.add(message_id)
                break

    def get_stats(self) -> Dict[str, Any]:
        """통계 조회"""
        return {
            "total_messages": len(self.messages),
            "total_sent": self.total_sent,
            "total_processed": self.total_processed,
            "total_failed": self.total_failed,
            "pending": len([m for m in self.messages if m.status == "pending"]),
            "max_messages": self.max_messages,
            "max_hops": self.max_hops
        }

    def clear_processed(self):
        """처리된 메시지 정리"""
        self.messages = [m for m in self.messages if m.status == "pending"]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "messages": [m.to_dict() for m in self.messages],
            "stats": self.get_stats()
        }
