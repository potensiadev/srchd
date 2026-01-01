"""
Visual Agent - Image Processing & Portfolio Capture

이미지 처리 및 포트폴리오 캡처:
- OpenCV를 활용한 얼굴 감지 및 블러링 (개인정보 보호)
- Playwright를 활용한 포트폴리오 URL 썸네일 캡처
"""

import io
import os
import asyncio
import logging
import tempfile
from typing import Optional, Tuple, List
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

try:
    from PIL import Image
except ImportError:
    Image = None

logger = logging.getLogger(__name__)

# OpenCV 얼굴 감지 캐스케이드 파일 경로
CASCADE_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml' if cv2 else None


class BlurMethod(str, Enum):
    """얼굴 블러 방법"""
    GAUSSIAN = "gaussian"
    PIXELATE = "pixelate"
    BLACK = "black"


@dataclass
class FaceDetectionResult:
    """얼굴 감지 결과"""
    faces_found: int
    processed_image: Optional[bytes]  # 블러 처리된 이미지
    face_locations: List[Tuple[int, int, int, int]]  # (x, y, w, h)
    original_size: Tuple[int, int]  # (width, height)
    error: Optional[str] = None


@dataclass
class ThumbnailResult:
    """포트폴리오 썸네일 결과"""
    success: bool
    thumbnail: Optional[bytes]  # PNG 이미지 바이트
    url: str
    width: int = 0
    height: int = 0
    error: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


class VisualAgent:
    """
    Visual Agent - 이미지 처리 및 포트폴리오 캡처

    Features:
    - OpenCV 기반 얼굴 감지 및 블러/모자이크 처리
    - Playwright 기반 웹페이지 스크린샷 캡처
    - 이미지 리사이즈 및 최적화
    """

    # 기본 설정
    DEFAULT_BLUR_METHOD = BlurMethod.PIXELATE
    DEFAULT_THUMBNAIL_WIDTH = 1280
    DEFAULT_THUMBNAIL_HEIGHT = 800
    THUMBNAIL_QUALITY = 85  # JPEG 품질

    # 얼굴 감지 설정
    FACE_SCALE_FACTOR = 1.1
    FACE_MIN_NEIGHBORS = 5
    FACE_MIN_SIZE = (30, 30)

    # 타임아웃 설정
    PAGE_LOAD_TIMEOUT = 30000  # ms
    SCREENSHOT_TIMEOUT = 10000  # ms

    def __init__(self):
        """Visual Agent 초기화"""
        self._face_cascade = None
        self._playwright = None
        self._browser = None

    def _get_face_cascade(self):
        """얼굴 감지 캐스케이드 로드 (lazy loading)"""
        if self._face_cascade is None and cv2 is not None:
            if CASCADE_PATH and os.path.exists(CASCADE_PATH):
                self._face_cascade = cv2.CascadeClassifier(CASCADE_PATH)
            else:
                logger.warning("OpenCV face cascade file not found")
        return self._face_cascade

    def detect_and_blur_faces(
        self,
        image_bytes: bytes,
        blur_method: BlurMethod = DEFAULT_BLUR_METHOD,
        blur_strength: int = 30,
    ) -> FaceDetectionResult:
        """
        이미지에서 얼굴 감지 및 블러 처리

        Args:
            image_bytes: 원본 이미지 바이트
            blur_method: 블러 방법 (gaussian, pixelate, black)
            blur_strength: 블러 강도

        Returns:
            FaceDetectionResult
        """
        if cv2 is None:
            return FaceDetectionResult(
                faces_found=0,
                processed_image=None,
                face_locations=[],
                original_size=(0, 0),
                error="OpenCV not installed"
            )

        try:
            # 이미지 디코딩
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return FaceDetectionResult(
                    faces_found=0,
                    processed_image=None,
                    face_locations=[],
                    original_size=(0, 0),
                    error="Failed to decode image"
                )

            height, width = img.shape[:2]

            # 그레이스케일 변환
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # 얼굴 감지
            cascade = self._get_face_cascade()
            if cascade is None:
                return FaceDetectionResult(
                    faces_found=0,
                    processed_image=image_bytes,
                    face_locations=[],
                    original_size=(width, height),
                    error="Face cascade not loaded"
                )

            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=self.FACE_SCALE_FACTOR,
                minNeighbors=self.FACE_MIN_NEIGHBORS,
                minSize=self.FACE_MIN_SIZE,
            )

            face_locations = []

            # 얼굴 블러 처리
            for (x, y, w, h) in faces:
                face_locations.append((x, y, w, h))

                # 얼굴 영역 확대 (여유 공간 추가)
                padding = int(w * 0.2)
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(width, x + w + padding)
                y2 = min(height, y + h + padding)

                face_region = img[y1:y2, x1:x2]

                if blur_method == BlurMethod.GAUSSIAN:
                    # 가우시안 블러
                    blurred = cv2.GaussianBlur(
                        face_region,
                        (blur_strength | 1, blur_strength | 1),  # 홀수로 만듦
                        0
                    )
                elif blur_method == BlurMethod.PIXELATE:
                    # 픽셀화 (모자이크)
                    temp = cv2.resize(
                        face_region,
                        (max(1, (x2 - x1) // blur_strength), max(1, (y2 - y1) // blur_strength)),
                        interpolation=cv2.INTER_LINEAR
                    )
                    blurred = cv2.resize(
                        temp,
                        (x2 - x1, y2 - y1),
                        interpolation=cv2.INTER_NEAREST
                    )
                else:  # BLACK
                    # 검은색으로 채우기
                    blurred = np.zeros_like(face_region)

                img[y1:y2, x1:x2] = blurred

            # 이미지 인코딩
            _, encoded = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            processed_bytes = encoded.tobytes()

            return FaceDetectionResult(
                faces_found=len(faces),
                processed_image=processed_bytes,
                face_locations=face_locations,
                original_size=(width, height)
            )

        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            return FaceDetectionResult(
                faces_found=0,
                processed_image=None,
                face_locations=[],
                original_size=(0, 0),
                error=str(e)
            )

    async def capture_portfolio_thumbnail(
        self,
        url: str,
        width: int = DEFAULT_THUMBNAIL_WIDTH,
        height: int = DEFAULT_THUMBNAIL_HEIGHT,
    ) -> ThumbnailResult:
        """
        포트폴리오 URL 스크린샷 캡처

        Args:
            url: 캡처할 URL
            width: 뷰포트 너비
            height: 뷰포트 높이

        Returns:
            ThumbnailResult
        """
        warnings = []

        # URL 검증
        if not url or not url.startswith(('http://', 'https://')):
            return ThumbnailResult(
                success=False,
                thumbnail=None,
                url=url,
                error="Invalid URL: must start with http:// or https://"
            )

        try:
            from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
        except ImportError:
            return ThumbnailResult(
                success=False,
                thumbnail=None,
                url=url,
                error="Playwright not installed"
            )

        browser = None
        try:
            async with async_playwright() as p:
                # Chromium 브라우저 실행
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                    ]
                )

                # 컨텍스트 생성
                context = await browser.new_context(
                    viewport={'width': width, 'height': height},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                )

                page = await context.new_page()

                try:
                    # 페이지 로드
                    await page.goto(
                        url,
                        timeout=self.PAGE_LOAD_TIMEOUT,
                        wait_until='networkidle'
                    )
                except PlaywrightTimeout:
                    # 타임아웃되면 현재 상태로 캡처
                    warnings.append("Page load timed out, capturing current state")

                # 짧은 대기 (렌더링 완료)
                await asyncio.sleep(1)

                # 스크린샷 캡처
                screenshot = await page.screenshot(
                    type='png',
                    timeout=self.SCREENSHOT_TIMEOUT,
                    full_page=False
                )

                await context.close()
                await browser.close()

                return ThumbnailResult(
                    success=True,
                    thumbnail=screenshot,
                    url=url,
                    width=width,
                    height=height,
                    warnings=warnings
                )

        except Exception as e:
            logger.error(f"Portfolio capture failed: {e}")
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass

            return ThumbnailResult(
                success=False,
                thumbnail=None,
                url=url,
                error=str(e),
                warnings=warnings
            )

    def capture_portfolio_thumbnail_sync(
        self,
        url: str,
        width: int = DEFAULT_THUMBNAIL_WIDTH,
        height: int = DEFAULT_THUMBNAIL_HEIGHT,
    ) -> ThumbnailResult:
        """
        포트폴리오 URL 스크린샷 캡처 (동기 버전)
        """
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(
            self.capture_portfolio_thumbnail(url, width, height)
        )

    def resize_image(
        self,
        image_bytes: bytes,
        max_width: int = 800,
        max_height: int = 600,
        quality: int = 85,
    ) -> Optional[bytes]:
        """
        이미지 리사이즈 및 최적화

        Args:
            image_bytes: 원본 이미지 바이트
            max_width: 최대 너비
            max_height: 최대 높이
            quality: JPEG 품질 (1-100)

        Returns:
            리사이즈된 이미지 바이트 또는 None
        """
        if Image is None:
            logger.warning("PIL not installed")
            return None

        try:
            img = Image.open(io.BytesIO(image_bytes))

            # RGBA면 RGB로 변환
            if img.mode == 'RGBA':
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # 비율 유지하면서 리사이즈
            img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

            # JPEG으로 저장
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            return output.getvalue()

        except Exception as e:
            logger.error(f"Image resize failed: {e}")
            return None

    def extract_profile_photo(
        self,
        image_bytes: bytes,
        blur_face: bool = True,
    ) -> Optional[bytes]:
        """
        프로필 사진 추출 및 처리

        이력서 이미지에서 프로필 사진 영역 추출 후
        선택적으로 얼굴 블러 처리

        Args:
            image_bytes: 원본 이미지 바이트
            blur_face: 얼굴 블러 처리 여부

        Returns:
            처리된 프로필 사진 또는 None
        """
        if cv2 is None:
            return None

        try:
            # 이미지 디코딩
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return None

            # 얼굴 감지
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            cascade = self._get_face_cascade()

            if cascade is None:
                return None

            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(50, 50)
            )

            if len(faces) == 0:
                return None

            # 가장 큰 얼굴 선택 (프로필 사진일 확률 높음)
            largest_face = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = largest_face

            # 얼굴 주변 영역 확장 (상반신 포함)
            padding_top = int(h * 0.5)
            padding_bottom = int(h * 1.0)
            padding_side = int(w * 0.5)

            height, width = img.shape[:2]
            x1 = max(0, x - padding_side)
            y1 = max(0, y - padding_top)
            x2 = min(width, x + w + padding_side)
            y2 = min(height, y + h + padding_bottom)

            # 프로필 영역 추출
            profile_region = img[y1:y2, x1:x2].copy()

            if blur_face:
                # 추출된 영역에서 얼굴 다시 감지 후 블러
                gray_region = cv2.cvtColor(profile_region, cv2.COLOR_BGR2GRAY)
                region_faces = cascade.detectMultiScale(
                    gray_region,
                    scaleFactor=1.1,
                    minNeighbors=3,
                    minSize=(30, 30)
                )

                for (fx, fy, fw, fh) in region_faces:
                    # 픽셀화 블러
                    face_area = profile_region[fy:fy+fh, fx:fx+fw]
                    temp = cv2.resize(face_area, (8, 8), interpolation=cv2.INTER_LINEAR)
                    blurred = cv2.resize(temp, (fw, fh), interpolation=cv2.INTER_NEAREST)
                    profile_region[fy:fy+fh, fx:fx+fw] = blurred

            # 인코딩
            _, encoded = cv2.imencode('.jpg', profile_region, [cv2.IMWRITE_JPEG_QUALITY, 90])
            return encoded.tobytes()

        except Exception as e:
            logger.error(f"Profile photo extraction failed: {e}")
            return None


# 싱글톤 인스턴스
_visual_agent: Optional[VisualAgent] = None


def get_visual_agent() -> VisualAgent:
    """Visual Agent 싱글톤 인스턴스 반환"""
    global _visual_agent
    if _visual_agent is None:
        _visual_agent = VisualAgent()
    return _visual_agent
