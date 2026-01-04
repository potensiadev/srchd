"""
URL Extractor - 텍스트에서 URL 추출

LLM 없이 정규식으로 GitHub, LinkedIn, Portfolio URL 추출
"""

import re
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


@dataclass
class ExtractedUrls:
    """추출된 URL 결과"""
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    other_urls: List[str] = None

    def __post_init__(self):
        if self.other_urls is None:
            self.other_urls = []

    def to_dict(self) -> Dict[str, Optional[str]]:
        return {
            "github_url": self.github_url,
            "linkedin_url": self.linkedin_url,
            "portfolio_url": self.portfolio_url,
        }


class URLExtractor:
    """
    텍스트에서 URL 추출기

    LLM 없이 정규식으로 정확한 URL 추출:
    - GitHub: github.com 포함 URL
    - LinkedIn: linkedin.com 포함 URL
    - Portfolio: 기타 개인 도메인 (추정)
    """

    # URL 매칭 정규식 (http/https)
    URL_PATTERN = re.compile(
        r'https?://[^\s<>"\')\]}\u3000\uff0c\u3001\uff1b\uff1a\u300d\u300c\u3011\u3010]+',
        re.IGNORECASE
    )

    # GitHub URL 패턴
    GITHUB_PATTERNS = [
        re.compile(r'https?://(?:www\.)?github\.com/[a-zA-Z0-9_-]+/?', re.IGNORECASE),
        re.compile(r'https?://(?:www\.)?github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+/?', re.IGNORECASE),
    ]

    # LinkedIn URL 패턴
    LINKEDIN_PATTERNS = [
        re.compile(r'https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_-]+/?', re.IGNORECASE),
        re.compile(r'https?://(?:www\.)?linkedin\.com/pub/[a-zA-Z0-9_-]+/?', re.IGNORECASE),
        re.compile(r'https?://(?:kr\.)?linkedin\.com/in/[a-zA-Z0-9_-]+/?', re.IGNORECASE),
    ]

    # 포트폴리오로 간주할 도메인 패턴
    PORTFOLIO_DOMAINS = [
        'notion.so', 'notion.site',
        'behance.net',
        'dribbble.com',
        'figma.com',
        'medium.com',
        'velog.io',
        'tistory.com',
        'brunch.co.kr',
        'portfolio', 'resume', 'cv',
        '.me', '.io', '.dev', '.design',
    ]

    # 제외할 도메인 (일반적인 서비스)
    EXCLUDED_DOMAINS = [
        'google.com', 'naver.com', 'daum.net', 'kakao.com',
        'youtube.com', 'youtu.be',
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
        'apple.com', 'microsoft.com', 'amazon.com',
        'stackoverflow.com', 'npmjs.com', 'pypi.org',
        'wikipedia.org', 'namu.wiki',
    ]

    def extract(self, text: str) -> ExtractedUrls:
        """
        텍스트에서 URL 추출

        Args:
            text: 이력서 텍스트

        Returns:
            ExtractedUrls with github_url, linkedin_url, portfolio_url
        """
        if not text:
            return ExtractedUrls()

        # 모든 URL 추출
        all_urls = self._find_all_urls(text)

        if not all_urls:
            return ExtractedUrls()

        github_url = None
        linkedin_url = None
        portfolio_url = None
        other_urls = []

        for url in all_urls:
            url = self._clean_url(url)
            if not url:
                continue

            # GitHub URL 확인
            if not github_url and self._is_github_url(url):
                github_url = url
                logger.debug(f"GitHub URL found: {url}")
                continue

            # LinkedIn URL 확인
            if not linkedin_url and self._is_linkedin_url(url):
                linkedin_url = url
                logger.debug(f"LinkedIn URL found: {url}")
                continue

            # Portfolio URL 확인
            if not portfolio_url and self._is_portfolio_url(url):
                portfolio_url = url
                logger.debug(f"Portfolio URL found: {url}")
                continue

            # 기타 URL
            if not self._is_excluded_domain(url):
                other_urls.append(url)

        # Portfolio URL이 없으면 other_urls 중 첫 번째를 사용
        if not portfolio_url and other_urls:
            portfolio_url = other_urls[0]
            other_urls = other_urls[1:]

        result = ExtractedUrls(
            github_url=github_url,
            linkedin_url=linkedin_url,
            portfolio_url=portfolio_url,
            other_urls=other_urls
        )

        logger.info(
            f"URL extraction: github={bool(github_url)}, "
            f"linkedin={bool(linkedin_url)}, portfolio={bool(portfolio_url)}"
        )

        return result

    def _find_all_urls(self, text: str) -> List[str]:
        """텍스트에서 모든 URL 찾기"""
        urls = self.URL_PATTERN.findall(text)
        # 중복 제거 및 순서 유지
        seen = set()
        unique_urls = []
        for url in urls:
            if url not in seen:
                seen.add(url)
                unique_urls.append(url)
        return unique_urls

    def _clean_url(self, url: str) -> Optional[str]:
        """URL 정리 (후행 구두점 제거)"""
        if not url:
            return None

        # 후행 구두점 제거
        url = url.rstrip('.,;:!?)>\'"')

        # 괄호 균형 맞추기
        open_count = url.count('(')
        close_count = url.count(')')
        if close_count > open_count:
            url = url.rstrip(')')

        # 유효한 URL인지 확인
        try:
            parsed = urlparse(url)
            if not parsed.netloc:
                return None
            return url
        except Exception:
            return None

    def _is_github_url(self, url: str) -> bool:
        """GitHub URL 여부 확인"""
        url_lower = url.lower()

        # github.com이 포함되어야 함
        if 'github.com' not in url_lower:
            return False

        # gist 제외 (코드 스니펫)
        if 'gist.github.com' in url_lower:
            return False

        # 패턴 매칭
        for pattern in self.GITHUB_PATTERNS:
            if pattern.match(url):
                return True

        # 기본 github.com 포함 여부
        return 'github.com/' in url_lower

    def _is_linkedin_url(self, url: str) -> bool:
        """LinkedIn URL 여부 확인"""
        url_lower = url.lower()

        # linkedin.com이 포함되어야 함
        if 'linkedin.com' not in url_lower:
            return False

        # 프로필 페이지인지 확인
        for pattern in self.LINKEDIN_PATTERNS:
            if pattern.match(url):
                return True

        # /in/ 또는 /pub/ 경로 확인
        return '/in/' in url_lower or '/pub/' in url_lower

    def _is_portfolio_url(self, url: str) -> bool:
        """포트폴리오 URL 여부 확인"""
        url_lower = url.lower()

        # 제외 도메인 체크
        if self._is_excluded_domain(url):
            return False

        # 포트폴리오 도메인 패턴 확인
        for domain in self.PORTFOLIO_DOMAINS:
            if domain in url_lower:
                return True

        return False

    def _is_excluded_domain(self, url: str) -> bool:
        """제외할 도메인 여부 확인"""
        url_lower = url.lower()

        for domain in self.EXCLUDED_DOMAINS:
            if domain in url_lower:
                return True

        return False


# 싱글톤 인스턴스
_url_extractor: Optional[URLExtractor] = None


def get_url_extractor() -> URLExtractor:
    """URL Extractor 싱글톤 인스턴스 반환"""
    global _url_extractor
    if _url_extractor is None:
        _url_extractor = URLExtractor()
    return _url_extractor


def extract_urls_from_text(text: str) -> ExtractedUrls:
    """편의 함수: 텍스트에서 URL 추출"""
    return get_url_extractor().extract(text)
