"""
HWP 파일 파서 - Fallback 전략 포함

1차: 직접 파싱 (olefile)
2차: LibreOffice 변환 (HWP -> PDF)
3차: 한컴 API (옵션) 또는 수동 입력 유도
"""

import io
import os
import tempfile
import zipfile
import struct
import zlib
import logging
from typing import Tuple, Optional
from enum import Enum
from dataclasses import dataclass

from utils.subprocess_utils import run_libreoffice_convert, LIBREOFFICE_TIMEOUT

try:
    import olefile
except ImportError:
    olefile = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

logger = logging.getLogger(__name__)


class ParseMethod(str, Enum):
    DIRECT = "direct"           # 직접 파싱 성공
    LIBREOFFICE = "libreoffice" # LibreOffice 변환 후 파싱
    HANCOM_API = "hancom_api"   # 한컴 API 사용 (유료)
    FAILED = "failed"           # 모든 방법 실패


@dataclass
class HWPParseResult:
    text: str
    method: ParseMethod
    page_count: int
    is_encrypted: bool = False
    error_message: Optional[str] = None


class HWPParser:
    """HWP/HWPX 파일 파서 (Fallback 전략 포함)"""

    # 최소 유효 텍스트 길이 (이하면 파싱 실패로 간주)
    MIN_TEXT_LENGTH = 100

    def __init__(self, hancom_api_key: Optional[str] = None):
        self.hancom_api_key = hancom_api_key

    def parse(self, file_bytes: bytes, filename: str = "document.hwp") -> HWPParseResult:
        """
        HWP 파일 파싱 (Fallback 전략 적용)

        Returns:
            HWPParseResult 객체
        """
        # 암호화 체크
        is_encrypted = self.is_encrypted(file_bytes)
        if is_encrypted:
            return HWPParseResult(
                text="",
                method=ParseMethod.FAILED,
                page_count=0,
                is_encrypted=True,
                error_message="DRM_PROTECTED: 암호화된 HWP 파일입니다."
            )

        # 파일 타입 감지
        is_hwpx = file_bytes[:4] == b'PK\x03\x04'

        # ─────────────────────────────────────────────────
        # 1차 시도: 직접 파싱
        # ─────────────────────────────────────────────────
        try:
            if is_hwpx:
                text, page_count = self._parse_hwpx_direct(file_bytes)
            else:
                text, page_count = self._parse_hwp_direct(file_bytes)

            if text and len(text.strip()) >= self.MIN_TEXT_LENGTH:
                logger.info(f"HWP parsed successfully via direct method: {len(text)} chars")
                return HWPParseResult(
                    text=text,
                    method=ParseMethod.DIRECT,
                    page_count=page_count,
                )

            logger.warning(f"Direct parsing returned insufficient text: {len(text.strip())} chars")

        except Exception as e:
            logger.warning(f"Direct parsing failed: {str(e)}")

        # ─────────────────────────────────────────────────
        # 2차 시도: LibreOffice 변환 (HWP -> PDF -> Text)
        # ─────────────────────────────────────────────────
        try:
            text, page_count = self._parse_via_libreoffice(file_bytes, filename)

            if text and len(text.strip()) >= self.MIN_TEXT_LENGTH:
                logger.info(f"HWP parsed successfully via LibreOffice: {len(text)} chars")
                return HWPParseResult(
                    text=text,
                    method=ParseMethod.LIBREOFFICE,
                    page_count=page_count,
                )

            logger.warning(f"LibreOffice conversion returned insufficient text: {len(text.strip())} chars")

        except Exception as e:
            logger.warning(f"LibreOffice conversion failed: {str(e)}")

        # ─────────────────────────────────────────────────
        # 3차 시도: 한컴 API (유료, 옵션)
        # ─────────────────────────────────────────────────
        if self.hancom_api_key:
            try:
                text, page_count = self._parse_via_hancom_api(file_bytes)

                if text and len(text.strip()) >= self.MIN_TEXT_LENGTH:
                    logger.info(f"HWP parsed successfully via Hancom API: {len(text)} chars")
                    return HWPParseResult(
                        text=text,
                        method=ParseMethod.HANCOM_API,
                        page_count=page_count,
                    )

            except Exception as e:
                logger.warning(f"Hancom API failed: {str(e)}")

        # ─────────────────────────────────────────────────
        # 모든 방법 실패
        # ─────────────────────────────────────────────────
        return HWPParseResult(
            text="",
            method=ParseMethod.FAILED,
            page_count=0,
            is_encrypted=False,
            error_message="HWP_PARSE_FAILED: 파일을 읽을 수 없습니다. PDF로 변환 후 다시 업로드해주세요."
        )

    def _parse_hwpx_direct(self, file_bytes: bytes) -> Tuple[str, int]:
        """HWPX 직접 파싱"""
        if BeautifulSoup is None:
            raise ImportError("BeautifulSoup is required for HWPX parsing")

        texts = []
        page_count = 0

        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            section_files = sorted([
                f for f in zf.namelist()
                if f.startswith('Contents/section') and f.endswith('.xml')
            ])

            page_count = len(section_files) or 1

            for section_file in section_files:
                with zf.open(section_file) as f:
                    soup = BeautifulSoup(f.read(), 'xml')
                    for text_elem in soup.find_all('hp:t'):
                        if text_elem.string:
                            texts.append(text_elem.string)

        return '\n'.join(texts), page_count

    def _parse_hwp_direct(self, file_bytes: bytes) -> Tuple[str, int]:
        """HWP (OLE) 직접 파싱"""
        if olefile is None:
            raise ImportError("olefile is required for HWP parsing")

        texts = []
        page_count = 1

        ole = olefile.OleFileIO(io.BytesIO(file_bytes))

        try:
            if ole.exists('BodyText'):
                body_streams = [
                    entry for entry in ole.listdir()
                    if entry[0] == 'BodyText'
                ]

                for stream_path in body_streams:
                    stream_name = '/'.join(stream_path)
                    try:
                        data = ole.openstream(stream_name).read()
                        text = self._decompress_hwp_body(data)
                        if text:
                            texts.append(text)
                    except Exception as e:
                        logger.debug(f"Failed to read stream {stream_name}: {e}")
                        continue

            # 페이지 수 추정
            if ole.exists('DocInfo'):
                # DocInfo에서 페이지 정보를 읽을 수 있지만, 복잡하므로 섹션 수로 추정
                page_count = max(1, len(texts))

        finally:
            ole.close()

        return '\n'.join(texts), page_count

    def _decompress_hwp_body(self, data: bytes) -> str:
        """HWP 본문 압축 해제 및 텍스트 추출"""
        try:
            # zlib 압축 해제 시도
            decompressed = zlib.decompress(data, -15)
        except zlib.error:
            # 압축되지 않은 데이터
            decompressed = data

        # 유니코드 텍스트 추출
        text_parts = []
        i = 0

        while i < len(decompressed) - 1:
            # HWP는 UTF-16LE로 텍스트 저장
            try:
                char_code = struct.unpack('<H', decompressed[i:i+2])[0]

                # 제어 문자 건너뛰기
                if char_code < 32 and char_code not in [9, 10, 13]:  # 탭, 개행 허용
                    i += 2
                    continue

                # 특수 제어 코드 처리
                if char_code == 0:
                    i += 2
                    continue
                elif char_code == 1:  # 필드 시작
                    i += 2
                    continue
                elif char_code == 2:  # 섹션 정의
                    i += 2
                    continue
                elif char_code == 10 or char_code == 13:  # 개행
                    text_parts.append('\n')
                    i += 2
                    continue
                elif char_code == 9:  # 탭
                    text_parts.append('\t')
                    i += 2
                    continue
                elif 32 <= char_code < 0xD800 or 0xE000 <= char_code < 0xFFFF:
                    # 일반 유니코드 문자
                    text_parts.append(chr(char_code))
                    i += 2
                else:
                    i += 2

            except struct.error:
                i += 1

        return ''.join(text_parts)

    def _parse_via_libreoffice(self, file_bytes: bytes, filename: str) -> Tuple[str, int]:
        """
        LibreOffice로 HWP -> PDF 변환 후 텍스트 추출

        Requirements:
        - LibreOffice 설치 필요
        - pdfplumber 라이브러리 필요

        강화된 타임아웃 및 프로세스 관리 적용
        """
        if pdfplumber is None:
            raise ImportError("pdfplumber is required for PDF text extraction")

        with tempfile.TemporaryDirectory() as temp_dir:
            # HWP 파일 저장
            hwp_path = os.path.join(temp_dir, filename)
            with open(hwp_path, 'wb') as f:
                f.write(file_bytes)

            # LibreOffice로 PDF 변환 (강화된 타임아웃)
            result = run_libreoffice_convert(
                input_path=hwp_path,
                output_dir=temp_dir,
                output_format="pdf",
                timeout=LIBREOFFICE_TIMEOUT
            )

            if not result.success:
                if result.timed_out:
                    raise Exception(f"LibreOffice conversion timed out after {LIBREOFFICE_TIMEOUT}s")
                raise Exception(f"LibreOffice conversion failed: {result.error_message}")

            # 변환된 PDF 찾기
            pdf_filename = os.path.splitext(filename)[0] + '.pdf'
            pdf_path = os.path.join(temp_dir, pdf_filename)

            if not os.path.exists(pdf_path):
                raise Exception("PDF conversion failed - output file not found")

            # PDF에서 텍스트 추출
            with pdfplumber.open(pdf_path) as pdf:
                texts = []
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    texts.append(text)

                return '\n'.join(texts), len(pdf.pages)

    def _parse_via_hancom_api(self, file_bytes: bytes) -> Tuple[str, int]:
        """
        한컴 API를 사용한 HWP 파싱 (유료)

        Note: 실제 한컴 API 연동 시 구현 필요
        """
        # TODO: 한컴 API 연동 구현
        raise NotImplementedError("Hancom API integration not implemented")

    def is_encrypted(self, file_bytes: bytes) -> bool:
        """암호화 여부 체크"""
        if file_bytes[:4] == b'PK\x03\x04':
            # HWPX
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                    return 'Contents/' not in str(zf.namelist())
            except Exception:
                return True

        elif file_bytes[:4] == b'\xD0\xCF\x11\xE0':
            # HWP (OLE)
            if olefile is None:
                return False

            try:
                ole = olefile.OleFileIO(io.BytesIO(file_bytes))
                if ole.exists('FileHeader'):
                    header = ole.openstream('FileHeader').read()
                    if len(header) > 39:
                        flags = struct.unpack('<I', header[36:40])[0]
                        ole.close()
                        return (flags & 0x02) != 0  # 비트 1이 암호화 플래그
                ole.close()
            except Exception:
                return True

        return False

    @staticmethod
    def get_parse_method_display(method: ParseMethod) -> str:
        """파싱 방법 표시용 문자열"""
        return {
            ParseMethod.DIRECT: "직접 파싱",
            ParseMethod.LIBREOFFICE: "PDF 변환",
            ParseMethod.HANCOM_API: "한컴 API",
            ParseMethod.FAILED: "파싱 실패"
        }.get(method, "알 수 없음")
