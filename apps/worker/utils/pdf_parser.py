"""
PDF 파일 파서

pdfplumber를 사용한 텍스트 추출 + OCR 지원:
- 일반 PDF: pdfplumber로 텍스트 추출
- 스캔 PDF: pytesseract OCR로 텍스트 추출
"""

import io
import logging
from typing import Optional
from dataclasses import dataclass

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from pdf2image import convert_from_bytes
except ImportError:
    convert_from_bytes = None

try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None

logger = logging.getLogger(__name__)


@dataclass
class PDFParseResult:
    success: bool
    text: str
    method: str  # "pdfplumber", "ocr", "hybrid"
    page_count: int
    is_encrypted: bool = False
    error_message: Optional[str] = None


class PDFParser:
    """PDF 파일 파서 (pdfplumber + OCR)"""

    # 최소 유효 텍스트 길이 (페이지당)
    MIN_TEXT_PER_PAGE = 50

    # OCR 언어 설정
    OCR_LANG = "kor+eng"

    def __init__(self):
        self._check_dependencies()

    def _check_dependencies(self):
        """의존성 체크"""
        if pdfplumber is None:
            logger.warning("pdfplumber not installed - PDF parsing will be limited")

    def parse(self, file_bytes: bytes) -> PDFParseResult:
        """
        PDF 파일 파싱

        1. pdfplumber로 텍스트 추출 시도
        2. 텍스트가 부족하면 OCR 시도
        """
        if pdfplumber is None:
            return PDFParseResult(
                success=False,
                text="",
                method="none",
                page_count=0,
                error_message="pdfplumber not installed"
            )

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                page_count = len(pdf.pages)
                texts = []
                ocr_pages = []  # OCR이 필요한 페이지 인덱스

                # 1차: pdfplumber로 텍스트 추출
                for i, page in enumerate(pdf.pages):
                    try:
                        text = page.extract_text() or ""
                        texts.append(text)

                        # 텍스트가 너무 짧으면 OCR 후보로 마킹
                        if len(text.strip()) < self.MIN_TEXT_PER_PAGE:
                            ocr_pages.append(i)

                    except Exception as e:
                        logger.warning(f"Failed to extract text from page {i+1}: {e}")
                        texts.append("")
                        ocr_pages.append(i)

                combined_text = '\n\n'.join(texts)

                # 2차: OCR 필요 여부 확인
                if ocr_pages and len(combined_text.strip()) < self.MIN_TEXT_PER_PAGE * page_count * 0.3:
                    # 전체 텍스트가 예상보다 30% 미만이면 OCR 시도
                    logger.info(f"Attempting OCR for {len(ocr_pages)} pages with insufficient text")

                    ocr_result = self._perform_ocr(file_bytes, ocr_pages)

                    if ocr_result:
                        # OCR 결과와 기존 텍스트 병합
                        for i, ocr_text in ocr_result.items():
                            if len(ocr_text.strip()) > len(texts[i].strip()):
                                texts[i] = ocr_text

                        combined_text = '\n\n'.join(texts)

                        return PDFParseResult(
                            success=True,
                            text=combined_text,
                            method="hybrid" if any(texts) else "ocr",
                            page_count=page_count
                        )

                # 최종 결과 반환
                if len(combined_text.strip()) > 0:
                    return PDFParseResult(
                        success=True,
                        text=combined_text,
                        method="pdfplumber",
                        page_count=page_count
                    )
                else:
                    return PDFParseResult(
                        success=False,
                        text="",
                        method="none",
                        page_count=page_count,
                        error_message="PDF에서 텍스트를 추출할 수 없습니다. 스캔 이미지일 수 있습니다."
                    )

        except Exception as e:
            # 암호화된 PDF인 경우
            if "encrypted" in str(e).lower() or "password" in str(e).lower():
                return PDFParseResult(
                    success=False,
                    text="",
                    method="none",
                    page_count=0,
                    is_encrypted=True,
                    error_message="PDF_ENCRYPTED: 암호화된 PDF 파일입니다. 암호를 해제한 후 다시 업로드해주세요."
                )

            logger.error(f"PDF parsing failed: {e}")
            return PDFParseResult(
                success=False,
                text="",
                method="none",
                page_count=0,
                error_message=f"PDF_PARSE_ERROR: {str(e)}"
            )

    def _perform_ocr(self, file_bytes: bytes, page_indices: list[int]) -> dict[int, str]:
        """
        OCR 수행

        Args:
            file_bytes: PDF 바이트
            page_indices: OCR을 수행할 페이지 인덱스 목록

        Returns:
            {페이지 인덱스: 추출된 텍스트} 딕셔너리
        """
        if convert_from_bytes is None or pytesseract is None:
            logger.warning("OCR dependencies not installed (pdf2image, pytesseract)")
            return {}

        try:
            # PDF를 이미지로 변환
            images = convert_from_bytes(
                file_bytes,
                dpi=300,  # 고해상도
                first_page=min(page_indices) + 1 if page_indices else 1,
                last_page=max(page_indices) + 1 if page_indices else None
            )

            results = {}
            offset = min(page_indices) if page_indices else 0

            for i, page_idx in enumerate(page_indices):
                if i < len(images):
                    try:
                        # OCR 수행
                        text = pytesseract.image_to_string(
                            images[i],
                            lang=self.OCR_LANG,
                            config='--psm 1'  # 자동 페이지 세그멘테이션
                        )
                        results[page_idx] = text
                        logger.debug(f"OCR completed for page {page_idx + 1}: {len(text)} chars")

                    except Exception as e:
                        logger.warning(f"OCR failed for page {page_idx + 1}: {e}")
                        results[page_idx] = ""

            return results

        except Exception as e:
            logger.error(f"OCR process failed: {e}")
            return {}

    def is_encrypted(self, file_bytes: bytes) -> bool:
        """PDF 암호화 여부 체크"""
        if pdfplumber is None:
            return False

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                # 페이지 접근 시도
                _ = len(pdf.pages)
                return False
        except Exception:
            return True

    def get_page_count(self, file_bytes: bytes) -> int:
        """PDF 페이지 수 반환"""
        if pdfplumber is None:
            return 0

        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return len(pdf.pages)
        except Exception:
            return 0
