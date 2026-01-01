"""
Router Agent - 파일 타입 감지 및 유효성 검사

규칙 기반으로 동작하며 LLM 비용 없음:
- Magic Number로 파일 포맷 감지 (HWP/HWPX/DOC/DOCX/PDF)
- DRM/암호화 여부 체크
- 페이지 수 검증 (50페이지 제한)
"""

import io
import re
import struct
import zipfile
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List

try:
    import olefile
except ImportError:
    olefile = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


class FileType(str, Enum):
    """지원하는 파일 타입"""
    HWP = "hwp"
    HWPX = "hwpx"
    DOC = "doc"
    DOCX = "docx"
    PDF = "pdf"
    UNKNOWN = "unknown"


@dataclass
class RouterResult:
    """Router Agent 분석 결과"""
    file_type: Optional[FileType]
    is_encrypted: bool = False
    is_rejected: bool = False
    reject_reason: Optional[str] = None
    page_count: int = 0
    file_size_mb: float = 0.0
    warnings: List[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.is_rejected and self.file_type is not None


class RouterAgent:
    """
    Router Agent - 파일 분류 및 검증

    처리 시간: ~0.1초
    비용: 0원 (규칙 기반)
    """

    # 파일 크기 제한 (MB)
    MAX_FILE_SIZE_MB = 50

    # 페이지 수 제한
    MAX_PAGE_COUNT = 50

    # Magic Numbers (파일 시그니처)
    MAGIC_NUMBERS = {
        b'\xD0\xCF\x11\xE0': 'ole',      # OLE (HWP, DOC)
        b'PK\x03\x04': 'zip',             # ZIP (HWPX, DOCX)
        b'%PDF': 'pdf',                    # PDF
    }

    def analyze(self, file_bytes: bytes, filename: str = "") -> RouterResult:
        """
        파일 분석 및 라우팅 결정

        Args:
            file_bytes: 파일 바이트
            filename: 파일명 (확장자 힌트용)

        Returns:
            RouterResult: 분석 결과
        """
        warnings = []

        # 1. 파일 크기 체크
        file_size_mb = len(file_bytes) / (1024 * 1024)
        if file_size_mb > self.MAX_FILE_SIZE_MB:
            return RouterResult(
                file_type=None,
                is_rejected=True,
                reject_reason=f"FILE_TOO_LARGE: 파일 크기가 {self.MAX_FILE_SIZE_MB}MB를 초과합니다. ({file_size_mb:.1f}MB)",
                file_size_mb=file_size_mb
            )

        # 2. 파일 타입 감지 (Magic Number)
        file_type = self._detect_file_type(file_bytes, filename)

        if file_type == FileType.UNKNOWN:
            return RouterResult(
                file_type=FileType.UNKNOWN,
                is_rejected=True,
                reject_reason="UNSUPPORTED_FORMAT: 지원하지 않는 파일 형식입니다. (HWP, HWPX, DOC, DOCX, PDF만 지원)",
                file_size_mb=file_size_mb
            )

        # 3. 암호화/DRM 체크
        is_encrypted = self._check_encryption(file_bytes, file_type)

        if is_encrypted:
            return RouterResult(
                file_type=file_type,
                is_encrypted=True,
                is_rejected=True,
                reject_reason="DRM_PROTECTED: 암호화된 파일입니다. 암호를 해제한 후 다시 업로드해주세요.",
                file_size_mb=file_size_mb
            )

        # 4. 페이지 수 체크
        page_count = self._estimate_page_count(file_bytes, file_type)

        if page_count > self.MAX_PAGE_COUNT:
            return RouterResult(
                file_type=file_type,
                is_rejected=True,
                reject_reason=f"TOO_MANY_PAGES: 페이지 수가 {self.MAX_PAGE_COUNT}페이지를 초과합니다. ({page_count}페이지)",
                page_count=page_count,
                file_size_mb=file_size_mb
            )

        # 5. 경고 메시지 생성
        if page_count > 30:
            warnings.append(f"페이지 수가 많습니다 ({page_count}페이지). 처리 시간이 오래 걸릴 수 있습니다.")

        if file_size_mb > 10:
            warnings.append(f"파일 크기가 큽니다 ({file_size_mb:.1f}MB). 처리 시간이 오래 걸릴 수 있습니다.")

        return RouterResult(
            file_type=file_type,
            is_encrypted=False,
            is_rejected=False,
            page_count=page_count,
            file_size_mb=file_size_mb,
            warnings=warnings
        )

    def _detect_file_type(self, file_bytes: bytes, filename: str) -> FileType:
        """Magic Number와 확장자로 파일 타입 감지"""

        # Magic Number 확인
        magic_type = None
        for magic, ftype in self.MAGIC_NUMBERS.items():
            if file_bytes[:len(magic)] == magic:
                magic_type = ftype
                break

        # 확장자 힌트
        ext = filename.lower().split('.')[-1] if '.' in filename else ''

        # OLE 파일 (HWP 또는 DOC)
        if magic_type == 'ole':
            if ext == 'hwp':
                return FileType.HWP
            elif ext == 'doc':
                return FileType.DOC
            else:
                # 내용으로 구분
                return self._detect_ole_type(file_bytes)

        # ZIP 파일 (HWPX 또는 DOCX)
        elif magic_type == 'zip':
            if ext == 'hwpx':
                return FileType.HWPX
            elif ext == 'docx':
                return FileType.DOCX
            else:
                # 내용으로 구분
                return self._detect_zip_type(file_bytes)

        # PDF 파일
        elif magic_type == 'pdf':
            return FileType.PDF

        # 확장자로만 판단 (Magic Number 없는 경우)
        ext_map = {
            'hwp': FileType.HWP,
            'hwpx': FileType.HWPX,
            'doc': FileType.DOC,
            'docx': FileType.DOCX,
            'pdf': FileType.PDF,
        }

        return ext_map.get(ext, FileType.UNKNOWN)

    def _detect_ole_type(self, file_bytes: bytes) -> FileType:
        """OLE 파일이 HWP인지 DOC인지 구분"""
        if olefile is None:
            # olefile이 없으면 기본적으로 HWP로 가정
            return FileType.HWP

        try:
            ole = olefile.OleFileIO(io.BytesIO(file_bytes))

            # HWP는 FileHeader 스트림을 가짐
            if ole.exists('FileHeader'):
                ole.close()
                return FileType.HWP

            # DOC는 WordDocument 스트림을 가짐
            if ole.exists('WordDocument'):
                ole.close()
                return FileType.DOC

            ole.close()
            return FileType.UNKNOWN

        except Exception:
            return FileType.UNKNOWN

    def _detect_zip_type(self, file_bytes: bytes) -> FileType:
        """ZIP 파일이 HWPX인지 DOCX인지 구분"""
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                namelist = zf.namelist()

                # HWPX는 Contents/ 폴더를 가짐
                if any(f.startswith('Contents/') for f in namelist):
                    return FileType.HWPX

                # DOCX는 word/ 폴더를 가짐
                if any(f.startswith('word/') for f in namelist):
                    return FileType.DOCX

                return FileType.UNKNOWN

        except Exception:
            return FileType.UNKNOWN

    def _check_encryption(self, file_bytes: bytes, file_type: FileType) -> bool:
        """암호화/DRM 여부 체크"""

        if file_type == FileType.HWP:
            return self._check_hwp_encryption(file_bytes)
        elif file_type == FileType.HWPX:
            return self._check_hwpx_encryption(file_bytes)
        elif file_type == FileType.PDF:
            return self._check_pdf_encryption(file_bytes)
        elif file_type == FileType.DOC:
            return self._check_doc_encryption(file_bytes)
        elif file_type == FileType.DOCX:
            return self._check_docx_encryption(file_bytes)

        return False

    def _check_hwp_encryption(self, file_bytes: bytes) -> bool:
        """HWP 암호화 체크"""
        if olefile is None:
            return False

        try:
            ole = olefile.OleFileIO(io.BytesIO(file_bytes))

            if ole.exists('FileHeader'):
                header = ole.openstream('FileHeader').read()
                if len(header) > 39:
                    # 암호화 플래그 체크 (offset 36-40)
                    flags = struct.unpack('<I', header[36:40])[0]
                    ole.close()
                    return (flags & 0x02) != 0  # 비트 1이 암호화 플래그

            ole.close()
            return False

        except Exception:
            return True  # 읽기 실패 시 암호화로 간주

    def _check_hwpx_encryption(self, file_bytes: bytes) -> bool:
        """HWPX 암호화 체크"""
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                # Contents 폴더가 없으면 암호화된 것으로 간주
                return not any(f.startswith('Contents/') for f in zf.namelist())
        except Exception:
            return True

    def _check_pdf_encryption(self, file_bytes: bytes) -> bool:
        """PDF 암호화 체크"""
        if pdfplumber is None:
            return False

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                # pdfplumber는 암호화된 PDF를 열 수 없음
                _ = len(pdf.pages)
                return False
        except Exception:
            # 암호화된 경우 예외 발생
            return True

    def _check_doc_encryption(self, file_bytes: bytes) -> bool:
        """DOC 암호화 체크"""
        if olefile is None:
            return False

        try:
            ole = olefile.OleFileIO(io.BytesIO(file_bytes))

            # EncryptedPackage 스트림이 있으면 암호화
            if ole.exists('EncryptedPackage'):
                ole.close()
                return True

            ole.close()
            return False

        except Exception:
            return True

    def _check_docx_encryption(self, file_bytes: bytes) -> bool:
        """DOCX 암호화 체크"""
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                # word/document.xml이 없으면 암호화된 것으로 간주
                return 'word/document.xml' not in zf.namelist()
        except Exception:
            return True

    def _estimate_page_count(self, file_bytes: bytes, file_type: FileType) -> int:
        """페이지 수 추정"""

        if file_type == FileType.PDF:
            return self._count_pdf_pages(file_bytes)
        elif file_type == FileType.HWPX:
            return self._count_hwpx_pages(file_bytes)
        elif file_type == FileType.HWP:
            return self._count_hwp_pages(file_bytes)
        elif file_type == FileType.DOCX:
            return self._count_docx_pages(file_bytes)
        elif file_type == FileType.DOC:
            return self._count_doc_pages(file_bytes)

        return 1

    def _count_pdf_pages(self, file_bytes: bytes) -> int:
        """PDF 페이지 수 카운트"""
        if pdfplumber is None:
            return 1

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return len(pdf.pages)
        except Exception:
            return 1

    def _count_hwpx_pages(self, file_bytes: bytes) -> int:
        """HWPX 페이지 수 카운트"""
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                section_files = [
                    f for f in zf.namelist()
                    if f.startswith('Contents/section') and f.endswith('.xml')
                ]
                return max(1, len(section_files))
        except Exception:
            return 1

    def _count_hwp_pages(self, file_bytes: bytes) -> int:
        """
        HWP 페이지 수 카운트

        HWP의 DocInfo 스트림에서 페이지 수 정보를 읽거나,
        BodyText 섹션 수를 기반으로 추정
        """
        if olefile is None:
            # olefile 없으면 보수적으로 추정 (5KB/페이지)
            return max(1, len(file_bytes) // (5 * 1024))

        try:
            ole = olefile.OleFileIO(io.BytesIO(file_bytes))

            # 방법 1: BodyText 섹션 수로 추정
            body_sections = [
                entry for entry in ole.listdir()
                if len(entry) >= 2 and entry[0] == 'BodyText'
            ]

            if body_sections:
                # 섹션당 평균 1-2페이지로 추정
                # 작은 섹션은 1페이지, 큰 섹션은 여러 페이지
                total_pages = 0
                for section_path in body_sections:
                    try:
                        stream_name = '/'.join(section_path)
                        data = ole.openstream(stream_name).read()
                        # 섹션 크기로 페이지 수 추정 (압축 해제 후 약 3KB/페이지)
                        section_pages = max(1, len(data) // (3 * 1024))
                        total_pages += section_pages
                    except Exception:
                        total_pages += 1

                ole.close()
                return max(1, total_pages)

            # 방법 2: 파일 전체 크기로 추정 (5KB/페이지, 보수적)
            ole.close()
            return max(1, len(file_bytes) // (5 * 1024))

        except Exception:
            # 파싱 실패 시 보수적 추정
            return max(1, len(file_bytes) // (5 * 1024))

    def _count_docx_pages(self, file_bytes: bytes) -> int:
        """
        DOCX 페이지 수 카운트

        docProps/app.xml에서 Pages 속성을 읽거나,
        document.xml 크기로 추정
        """
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                # 방법 1: docProps/app.xml에서 Pages 읽기
                if 'docProps/app.xml' in zf.namelist():
                    try:
                        app_xml = zf.read('docProps/app.xml').decode('utf-8')
                        # <Pages>N</Pages> 패턴 찾기
                        match = re.search(r'<Pages>(\d+)</Pages>', app_xml)
                        if match:
                            pages = int(match.group(1))
                            if pages > 0:
                                return pages
                    except Exception:
                        pass

                # 방법 2: document.xml 크기로 추정 (10KB/페이지)
                if 'word/document.xml' in zf.namelist():
                    doc_size = zf.getinfo('word/document.xml').file_size
                    return max(1, doc_size // (10 * 1024))

                return 1

        except Exception:
            # 파싱 실패 시 보수적 추정
            return max(1, len(file_bytes) // (15 * 1024))

    def _count_doc_pages(self, file_bytes: bytes) -> int:
        """
        DOC 페이지 수 카운트

        OLE 스트림에서 문서 속성 또는 크기로 추정
        """
        if olefile is None:
            return max(1, len(file_bytes) // (10 * 1024))

        try:
            ole = olefile.OleFileIO(io.BytesIO(file_bytes))

            # 방법 1: SummaryInformation에서 페이지 수 읽기
            if ole.exists('\x05SummaryInformation'):
                try:
                    props = ole.getproperties('\x05SummaryInformation')
                    # 페이지 수는 Property ID 14
                    if props and 14 in props:
                        pages = props[14]
                        if isinstance(pages, int) and pages > 0:
                            ole.close()
                            return pages
                except Exception:
                    pass

            # 방법 2: WordDocument 스트림 크기로 추정
            if ole.exists('WordDocument'):
                try:
                    doc_stream = ole.openstream('WordDocument')
                    doc_size = len(doc_stream.read())
                    ole.close()
                    # DOC는 약 8KB/페이지
                    return max(1, doc_size // (8 * 1024))
                except Exception:
                    pass

            ole.close()
            return max(1, len(file_bytes) // (10 * 1024))

        except Exception:
            return max(1, len(file_bytes) // (10 * 1024))
