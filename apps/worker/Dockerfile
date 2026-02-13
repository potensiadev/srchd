# =====================================================
# RAI Worker Dockerfile
# Python FastAPI + LibreOffice + Tesseract OCR
# Multi-stage build for optimized production image
# =====================================================

# ─────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# 빌드 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 설치 (wheel 빌드)
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements.txt


# ─────────────────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────────────────
FROM python:3.11-slim AS production

# 보안: non-root 사용자 생성
RUN groupadd -r rai && useradd -r -g rai rai

# 시스템 패키지 설치 (최소화)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # LibreOffice (HWP → PDF 변환)
    libreoffice-writer-nogui \
    libreoffice-calc-nogui \
    # 한글 폰트
    fonts-nanum \
    fonts-nanum-extra \
    # PDF 처리
    poppler-utils \
    # OCR
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    # antiword (DOC 파싱)
    antiword \
    # 이미지 처리
    libgl1 \
    libglib2.0-0 \
    # curl for healthcheck
    curl \
    # cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/*

# 작업 디렉토리
WORKDIR /app

# Builder에서 wheel 복사 및 설치
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/* \
    && rm -rf /wheels

# Playwright 브라우저 설치 (포트폴리오 썸네일용)
RUN pip install --no-cache-dir playwright \
    && playwright install chromium --with-deps \
    && rm -rf /root/.cache

# 소스 복사
COPY --chown=rai:rai . .

# 불필요한 파일 제거
RUN rm -rf \
    .git \
    .gitignore \
    __pycache__ \
    *.pyc \
    .env \
    .env.* \
    tests/ \
    venv/ \
    *.md \
    Makefile \
    docker-compose*.yml

# 환경 변수
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1

# 포트 노출
EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# non-root 사용자로 전환
USER rai

# 실행
CMD ["python", "main.py"]
