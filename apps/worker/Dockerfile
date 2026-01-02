# RAI Worker Dockerfile
# Python FastAPI + LibreOffice + Tesseract OCR

FROM python:3.11-slim

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    # LibreOffice (HWP → PDF 변환)
    libreoffice \
    # 한글 폰트 (fonts-nanum-coding은 fonts-nanum에 포함됨)
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
    # 이미지 처리 (libgl1-mesa-glx → libgl1)
    libgl1 \
    libglib2.0-0 \
    # curl for healthcheck
    curl \
    && rm -rf /var/lib/apt/lists/*

# Playwright 브라우저 설치 (포트폴리오 썸네일용)
RUN pip install playwright && playwright install chromium --with-deps

# 작업 디렉토리
WORKDIR /app

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 복사
COPY . .

# 환경 변수
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# 포트 노출
EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 실행
CMD ["python", "main.py"]
