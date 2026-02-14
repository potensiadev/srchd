"""
Projects Extractor - 프로젝트 경험 추출

projects, portfolio_url, github_url 추출
"""

import logging
import re
from typing import Dict, Any, List, Optional, Set

from .base_extractor import BaseExtractor, ExtractionResult

logger = logging.getLogger(__name__)


class ProjectsExtractor(BaseExtractor):
    """
    프로젝트 정보 추출기

    추출 필드:
    - projects[]: 프로젝트 목록
    - portfolio_url: 포트폴리오 URL
    - github_url: GitHub URL
    - linkedin_url: LinkedIn URL
    """

    EXTRACTOR_TYPE = "projects"

    # URL 패턴
    URL_PATTERNS = {
        "github": r"(?:https?://)?(?:www\.)?github\.com/[\w\-]+(?:/[\w\-\.]+)?",
        "gitlab": r"(?:https?://)?(?:www\.)?gitlab\.com/[\w\-]+(?:/[\w\-\.]+)?",
        "linkedin": r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-]+/?",
        "portfolio": r"(?:https?://)?(?:www\.)?[\w\-]+\.(?:com|io|dev|co\.kr|me)/[\w\-/]*",
    }

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        프로젝트 데이터 후처리

        - 프로젝트 정리
        - URL 추출/검증
        - 중복 제거
        """
        processed = self._remove_evidence_fields(data)

        # projects 정리
        if "projects" in processed and isinstance(processed["projects"], list):
            processed["projects"] = self._clean_projects(processed["projects"])

        # URL 정규화
        for url_field in ["portfolio_url", "github_url", "linkedin_url"]:
            if url_field in processed and processed[url_field]:
                processed[url_field] = self._normalize_url(processed[url_field])

        return processed

    def _clean_projects(self, projects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """프로젝트 목록 정리"""
        cleaned = []
        seen_names: Set[str] = set()

        for project in projects:
            if not isinstance(project, dict):
                continue

            name = project.get("name", "").strip()
            if not name:
                continue

            # 중복 확인 (이름 기준)
            name_key = name.lower()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)

            cleaned_project = {
                "name": name,
            }

            # 선택 필드 추가
            if project.get("role"):
                cleaned_project["role"] = project["role"].strip()

            if project.get("company"):
                cleaned_project["company"] = project["company"].strip()

            if project.get("period"):
                cleaned_project["period"] = project["period"].strip()

            if project.get("description"):
                cleaned_project["description"] = project["description"].strip()

            # 성과 목록
            if project.get("achievements") and isinstance(project["achievements"], list):
                cleaned_project["achievements"] = [
                    a.strip() for a in project["achievements"] if a and isinstance(a, str)
                ]

            # 기술 스택
            if project.get("technologies") and isinstance(project["technologies"], list):
                cleaned_project["technologies"] = [
                    t.strip() for t in project["technologies"] if t and isinstance(t, str)
                ]

            # Evidence 필드 유지
            for key in project:
                if key.endswith("_evidence"):
                    cleaned_project[key] = project[key]

            cleaned.append(cleaned_project)

        return cleaned

    def _normalize_url(self, url: str) -> str:
        """URL 정규화"""
        if not url:
            return ""

        url = url.strip()

        # 프로토콜 추가
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        return url

    def extract_urls_from_text(self, text: str) -> Dict[str, str]:
        """
        텍스트에서 URL 직접 추출 (정규식 기반)
        """
        urls = {}

        for url_type, pattern in self.URL_PATTERNS.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # 첫 번째 매칭 사용
                url = self._normalize_url(matches[0])
                if url_type == "github":
                    urls["github_url"] = url
                elif url_type == "linkedin":
                    urls["linkedin_url"] = url
                elif url_type in ["portfolio", "gitlab"]:
                    if "portfolio_url" not in urls:
                        urls["portfolio_url"] = url

        return urls

    def _build_system_prompt(self) -> str:
        """프로젝트 추출용 시스템 프롬프트"""
        return f"""You are an expert resume analyst specializing in Korean resumes.
Your task is to extract project information from resumes.

{self.prompt}

⭐ CRITICAL: Extract ALL Projects from the ENTIRE Document

You MUST extract projects from ALL companies mentioned in the resume, not just the first few.
Do NOT stop early. Read through the ENTIRE document from start to end.

Korean resumes often list projects under different section names:
- "프로젝트", "주요 프로젝트", "Projects"
- "경력 상세", "업무 상세", "주요 업무", "담당 업무"
- "수행 과제", "성과", "실적", "주요 성과"
- "프로젝트 경험", "업무 경험"

Even if the section header is NOT "프로젝트", extract as a project if:
1. Has a specific initiative/task name
2. Has quantitative achievements (numbers, percentages)
3. Lists technologies/tools used
4. Has problem-solution structure
5. Shows a time period
6. Mentions team size or collaboration

Example:
```
경력 상세
OX퀴즈 리텐션 및 상품 가입 전환 엔진 기획 (전북은행) 2025.09 - 2025.10
배경: 포인트 월렛 출시 이후...
성과: OX퀴즈는 런칭 23일 만에...
```
→ This should be extracted as a PROJECT with:
  - name: "OX퀴즈 리텐션 및 상품 가입 전환 엔진 기획"
  - company: "전북은행"
  - period: "2025.09 - 2025.10"
  - achievements: ["런칭 23일 만에..."]

⚠️ MANDATORY RULES:
- Extract ALL projects from EVERY company in the resume
- Do NOT limit the number of projects - extract as many as exist
- Do NOT truncate or skip projects from later sections of the document
- Include projects from ALL career periods (past and present)
- Respond in JSON format only
- Include evidence fields for verification
"""

    def _build_user_prompt(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """프로젝트 추출용 사용자 프롬프트"""
        prompt_parts = []

        if filename:
            prompt_parts.append(f"Filename: {filename}")

        if additional_context:
            context_str = "\n".join(
                f"- {k}: {v}" for k, v in additional_context.items()
            )
            prompt_parts.append(f"Additional Context:\n{context_str}")

        prompt_parts.append(f"""Resume Text:
{text}

⚠️ IMPORTANT: Read the ENTIRE text above and extract ALL projects from EVERY company.

EXTRACT:
1. ALL projects from the ENTIRE document (from ANY section, not just "프로젝트" sections)
   - Include projects from ALL companies mentioned (첫 회사부터 마지막 회사까지 모두)
   - Do NOT stop after the first few projects
   - Do NOT skip projects from later parts of the document
2. Portfolio URLs (personal websites, project demos)
3. GitHub/GitLab URLs
4. LinkedIn URL

For each project, include:
- name (required)
- role
- company (if applicable)
- period
- description
- achievements (list of quantitative results)
- technologies (list of tools/tech used)
- name_evidence (original text excerpt)""")

        return "\n\n".join(prompt_parts)


# 싱글톤 인스턴스
_instance: Optional[ProjectsExtractor] = None


def get_projects_extractor() -> ProjectsExtractor:
    """ProjectsExtractor 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = ProjectsExtractor()
    return _instance
