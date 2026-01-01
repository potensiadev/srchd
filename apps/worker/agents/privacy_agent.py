"""
Privacy Agent - PII Masking & Data Protection

개인정보 보호를 위한 마스킹 처리
- 전화번호, 이메일, 주민번호 등 민감 정보 마스킹
- AES-256-GCM 암호화 지원 (금융권 수준 보안)
"""

import re
import os
import hashlib
import base64
import logging
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# AES-256-GCM 상수
AES_KEY_SIZE = 32  # 256 bits
NONCE_SIZE = 12    # 96 bits (GCM 권장)
SALT_SIZE = 16     # 128 bits
PBKDF2_ITERATIONS = 100000


class PIIType(str, Enum):
    """개인정보 유형"""
    PHONE = "phone"
    EMAIL = "email"
    SSN = "ssn"  # 주민등록번호
    ACCOUNT = "account"  # 계좌번호
    CARD = "card"  # 카드번호
    ADDRESS = "address"  # 상세 주소
    PASSPORT = "passport"  # 여권번호


@dataclass
class PIIMatch:
    """PII 매칭 결과"""
    pii_type: PIIType
    original: str
    masked: str
    start: int
    end: int
    encrypted: Optional[str] = None


@dataclass
class PrivacyResult:
    """개인정보 처리 결과"""
    success: bool
    masked_data: Dict[str, Any]
    pii_found: List[PIIMatch] = field(default_factory=list)
    encrypted_store: Dict[str, str] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "masked_data": self.masked_data,
            "pii_count": len(self.pii_found),
            "pii_types": list(set(p.pii_type.value for p in self.pii_found)),
            "warnings": self.warnings
        }


class PrivacyAgent:
    """
    개인정보 보호 에이전트

    Features:
    - PII 자동 감지 및 마스킹
    - 한국 개인정보 패턴 지원 (전화번호, 주민번호 등)
    - AES-256 암호화 저장 옵션
    - 복호화 키 관리
    """

    # 한국 전화번호 패턴
    PHONE_PATTERNS = [
        r'010[-.\s]?\d{4}[-.\s]?\d{4}',  # 휴대폰
        r'01[1-9][-.\s]?\d{3,4}[-.\s]?\d{4}',  # 기타 휴대폰
        r'0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}',  # 지역번호
        r'\+82[-.\s]?10[-.\s]?\d{4}[-.\s]?\d{4}',  # 국제번호
    ]

    # 이메일 패턴
    EMAIL_PATTERN = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

    # 주민등록번호 패턴
    SSN_PATTERNS = [
        r'\d{6}[-.\s]?[1-4]\d{6}',  # 전체
        r'\d{2}[0-1]\d[0-3]\d[-.\s]?[1-4]\d{6}',  # 생년월일 검증
    ]

    # 계좌번호 패턴 (간단한 버전)
    ACCOUNT_PATTERNS = [
        r'\d{3,4}[-.\s]?\d{2,4}[-.\s]?\d{4,6}',  # 일반 계좌
        r'\d{10,14}',  # 연속 숫자 (컨텍스트 필요)
    ]

    # 카드번호 패턴
    CARD_PATTERNS = [
        r'\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}',  # 16자리
    ]

    # 여권번호 패턴
    PASSPORT_PATTERN = r'[A-Z]{1,2}\d{7,8}'

    def __init__(self, encryption_key: Optional[str] = None):
        """
        Args:
            encryption_key: AES 암호화 마스터 키 (64자 hex 또는 32바이트)
                          없으면 settings에서 가져옴
        """
        self.master_key = encryption_key or settings.ENCRYPTION_KEY
        self._validate_master_key()

    def _validate_master_key(self) -> None:
        """마스터 키 유효성 검증"""
        if not self.master_key:
            logger.warning("No encryption key configured - encryption disabled")
            return

        # 64자 hex 문자열 → 32바이트
        if len(self.master_key) == 64:
            try:
                bytes.fromhex(self.master_key)
            except ValueError:
                raise ValueError("ENCRYPTION_KEY must be 64 hex characters")
        elif len(self.master_key) != 32:
            raise ValueError("ENCRYPTION_KEY must be 64 hex chars or 32 bytes")

    def _derive_key(self, salt: bytes) -> bytes:
        """
        PBKDF2로 데이터별 암호화 키 유도

        Args:
            salt: 랜덤 salt (각 암호화마다 다름)

        Returns:
            32바이트 AES-256 키
        """
        if not self.master_key:
            raise ValueError("Encryption key not configured")

        # 마스터 키를 바이트로 변환
        if len(self.master_key) == 64:
            master_bytes = bytes.fromhex(self.master_key)
        else:
            master_bytes = self.master_key.encode()

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=AES_KEY_SIZE,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return kdf.derive(master_bytes)

    def process(
        self,
        data: Dict[str, Any],
        mask_fields: Optional[List[str]] = None,
        encrypt_fields: Optional[List[str]] = None
    ) -> PrivacyResult:
        """
        데이터 개인정보 처리

        Args:
            data: 처리할 데이터 (이력서 분석 결과)
            mask_fields: 마스킹할 필드 목록 (기본: phone, email, address)
            encrypt_fields: 암호화할 필드 목록

        Returns:
            PrivacyResult with masked data
        """
        # 기본 마스킹 필드
        if mask_fields is None:
            mask_fields = ["phone", "email", "address"]

        # 기본 암호화 필드
        if encrypt_fields is None:
            encrypt_fields = ["phone", "email"]

        try:
            masked_data = data.copy()
            pii_found = []
            encrypted_store = {}
            warnings = []

            # 1. 지정된 필드 마스킹
            for field_name in mask_fields:
                if field_name in masked_data and masked_data[field_name]:
                    original_value = str(masked_data[field_name])
                    masked_value, matches = self._mask_field(field_name, original_value)
                    masked_data[field_name] = masked_value
                    pii_found.extend(matches)

                    # 암호화 저장 (AES-256-GCM)
                    if field_name in encrypt_fields and self.can_encrypt():
                        encrypted = self.encrypt(original_value)
                        if encrypted:
                            encrypted_store[field_name] = encrypted

            # 2. 텍스트 필드 스캔 (summary, careers 등)
            text_fields = ["summary"]
            for field_name in text_fields:
                if field_name in masked_data and masked_data[field_name]:
                    original_text = str(masked_data[field_name])
                    scanned_text, scan_matches = self._scan_and_mask_text(original_text)
                    if scan_matches:
                        masked_data[field_name] = scanned_text
                        pii_found.extend(scan_matches)
                        warnings.append(f"'{field_name}' 필드에서 PII 감지됨")

            # 3. careers 내 description 스캔
            if "careers" in masked_data and isinstance(masked_data["careers"], list):
                for i, career in enumerate(masked_data["careers"]):
                    if isinstance(career, dict) and career.get("description"):
                        desc = career["description"]
                        scanned_desc, desc_matches = self._scan_and_mask_text(desc)
                        if desc_matches:
                            masked_data["careers"][i]["description"] = scanned_desc
                            pii_found.extend(desc_matches)

            # 4. projects 내 description 스캔
            if "projects" in masked_data and isinstance(masked_data["projects"], list):
                for i, project in enumerate(masked_data["projects"]):
                    if isinstance(project, dict) and project.get("description"):
                        desc = project["description"]
                        scanned_desc, desc_matches = self._scan_and_mask_text(desc)
                        if desc_matches:
                            masked_data["projects"][i]["description"] = scanned_desc
                            pii_found.extend(desc_matches)

            return PrivacyResult(
                success=True,
                masked_data=masked_data,
                pii_found=pii_found,
                encrypted_store=encrypted_store,
                warnings=warnings
            )

        except Exception as e:
            logger.error(f"Privacy processing failed: {e}")
            return PrivacyResult(
                success=False,
                masked_data=data,
                warnings=[str(e)]
            )

    def _mask_field(
        self,
        field_name: str,
        value: str
    ) -> Tuple[str, List[PIIMatch]]:
        """필드별 마스킹"""
        matches = []

        if field_name == "phone":
            masked, match = self._mask_phone(value)
            if match:
                matches.append(match)
            return masked, matches

        elif field_name == "email":
            masked, match = self._mask_email(value)
            if match:
                matches.append(match)
            return masked, matches

        elif field_name == "address":
            # 주소는 일부만 마스킹 (시/구까지 유지)
            masked, match = self._mask_address(value)
            if match:
                matches.append(match)
            return masked, matches

        return value, matches

    def _mask_phone(self, phone: str) -> Tuple[str, Optional[PIIMatch]]:
        """전화번호 마스킹: 010-1234-5678 -> 010-****-5678"""
        if not phone:
            return phone, None

        # 숫자만 추출
        digits = re.sub(r'[^\d]', '', phone)

        if len(digits) >= 10:
            # 가운데 4자리 마스킹
            if len(digits) == 11:  # 휴대폰
                masked = f"{digits[:3]}-****-{digits[7:]}"
            elif len(digits) == 10:  # 서울
                masked = f"{digits[:2]}-****-{digits[6:]}"
            else:
                masked = f"{digits[:3]}-****-{digits[-4:]}"

            return masked, PIIMatch(
                pii_type=PIIType.PHONE,
                original=phone,
                masked=masked,
                start=0,
                end=len(phone)
            )

        return phone, None

    def _mask_email(self, email: str) -> Tuple[str, Optional[PIIMatch]]:
        """이메일 마스킹: user@example.com -> us**@example.com"""
        if not email or '@' not in email:
            return email, None

        local, domain = email.split('@', 1)

        if len(local) <= 2:
            masked_local = local[0] + '*'
        else:
            masked_local = local[:2] + '*' * (len(local) - 2)

        masked = f"{masked_local}@{domain}"

        return masked, PIIMatch(
            pii_type=PIIType.EMAIL,
            original=email,
            masked=masked,
            start=0,
            end=len(email)
        )

    def _mask_address(self, address: str) -> Tuple[str, Optional[PIIMatch]]:
        """주소 마스킹: 상세 주소 부분 마스킹"""
        if not address:
            return address, None

        # 한국 주소 패턴: 시/도, 구/군, 동/읍/면, 상세주소
        # 시/구까지는 유지, 나머지 마스킹

        # 간단한 구현: 공백으로 분리 후 앞 2-3개만 유지
        parts = address.split()

        if len(parts) <= 2:
            return address, None

        # 앞 2개 유지, 나머지 마스킹
        visible_parts = parts[:2]
        masked_parts = ['*' * len(p) for p in parts[2:]]
        masked = ' '.join(visible_parts + masked_parts)

        return masked, PIIMatch(
            pii_type=PIIType.ADDRESS,
            original=address,
            masked=masked,
            start=0,
            end=len(address)
        )

    def _scan_and_mask_text(self, text: str) -> Tuple[str, List[PIIMatch]]:
        """텍스트에서 PII 스캔 및 마스킹"""
        matches = []
        masked_text = text

        # 1. 주민등록번호 스캔
        for pattern in self.SSN_PATTERNS:
            for match in re.finditer(pattern, masked_text):
                original = match.group()
                # 앞 6자리만 남기고 마스킹
                masked = original[:6] + '-*******'
                masked_text = masked_text.replace(original, masked)
                matches.append(PIIMatch(
                    pii_type=PIIType.SSN,
                    original=original,
                    masked=masked,
                    start=match.start(),
                    end=match.end()
                ))

        # 2. 전화번호 스캔
        for pattern in self.PHONE_PATTERNS:
            for match in re.finditer(pattern, masked_text):
                original = match.group()
                masked_value, _ = self._mask_phone(original)
                masked_text = masked_text.replace(original, masked_value)
                matches.append(PIIMatch(
                    pii_type=PIIType.PHONE,
                    original=original,
                    masked=masked_value,
                    start=match.start(),
                    end=match.end()
                ))

        # 3. 이메일 스캔
        for match in re.finditer(self.EMAIL_PATTERN, masked_text):
            original = match.group()
            masked_value, _ = self._mask_email(original)
            masked_text = masked_text.replace(original, masked_value)
            matches.append(PIIMatch(
                pii_type=PIIType.EMAIL,
                original=original,
                masked=masked_value,
                start=match.start(),
                end=match.end()
            ))

        # 4. 카드번호 스캔
        for pattern in self.CARD_PATTERNS:
            for match in re.finditer(pattern, masked_text):
                original = match.group()
                # 앞 4자리, 뒤 4자리만 유지
                digits = re.sub(r'[^\d]', '', original)
                if len(digits) == 16:
                    masked = f"{digits[:4]}-****-****-{digits[-4:]}"
                    masked_text = masked_text.replace(original, masked)
                    matches.append(PIIMatch(
                        pii_type=PIIType.CARD,
                        original=original,
                        masked=masked,
                        start=match.start(),
                        end=match.end()
                    ))

        return masked_text, matches

    def encrypt(self, value: str) -> Optional[str]:
        """
        AES-256-GCM 암호화

        Format: base64(salt + nonce + ciphertext + tag)
        - salt: 16 bytes (PBKDF2용)
        - nonce: 12 bytes (GCM IV)
        - ciphertext: variable
        - tag: 16 bytes (GCM auth tag, 자동 포함)

        Returns:
            Base64 인코딩된 암호문 또는 None
        """
        if not self.master_key or not value:
            return None

        try:
            # 랜덤 salt와 nonce 생성
            salt = os.urandom(SALT_SIZE)
            nonce = os.urandom(NONCE_SIZE)

            # salt로부터 키 유도
            key = self._derive_key(salt)

            # AES-256-GCM 암호화
            aesgcm = AESGCM(key)
            ciphertext = aesgcm.encrypt(nonce, value.encode('utf-8'), None)

            # salt + nonce + ciphertext(tag 포함) 결합
            encrypted_data = salt + nonce + ciphertext

            # Base64 인코딩
            return base64.b64encode(encrypted_data).decode('utf-8')

        except Exception as e:
            logger.error(f"AES-256-GCM encryption failed: {e}")
            return None

    def decrypt(self, encrypted_value: str) -> Optional[str]:
        """
        AES-256-GCM 복호화

        Args:
            encrypted_value: Base64 인코딩된 암호문 (encrypt 메서드 출력)

        Returns:
            복호화된 원문 또는 None
        """
        if not self.master_key or not encrypted_value:
            return None

        try:
            # Base64 디코딩
            encrypted_data = base64.b64decode(encrypted_value.encode('utf-8'))

            # salt, nonce, ciphertext 분리
            if len(encrypted_data) < SALT_SIZE + NONCE_SIZE + 16:  # 최소 tag 크기
                logger.error("Encrypted data too short")
                return None

            salt = encrypted_data[:SALT_SIZE]
            nonce = encrypted_data[SALT_SIZE:SALT_SIZE + NONCE_SIZE]
            ciphertext = encrypted_data[SALT_SIZE + NONCE_SIZE:]

            # salt로부터 키 유도
            key = self._derive_key(salt)

            # AES-256-GCM 복호화
            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            return plaintext.decode('utf-8')

        except Exception as e:
            logger.error(f"AES-256-GCM decryption failed: {e}")
            return None

    def can_encrypt(self) -> bool:
        """암호화 가능 여부 확인"""
        return bool(self.master_key)

    def hash_for_dedup(self, value: str) -> str:
        """중복 체크용 해시 생성"""
        normalized = re.sub(r'\s+', '', value.lower())
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]


# 싱글톤 인스턴스
_privacy_agent: Optional[PrivacyAgent] = None


def get_privacy_agent() -> PrivacyAgent:
    """Privacy Agent 싱글톤 인스턴스 반환"""
    global _privacy_agent
    if _privacy_agent is None:
        _privacy_agent = PrivacyAgent()
    return _privacy_agent
