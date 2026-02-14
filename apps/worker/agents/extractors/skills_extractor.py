"""
Skills Extractor - 기술 스택 및 자격증 추출

skills, certifications, languages 추출
"""

import logging
import re
from typing import Dict, Any, List, Optional, Set

from .base_extractor import BaseExtractor, ExtractionResult
from context.rule_validator import RuleValidator

logger = logging.getLogger(__name__)


class SkillsExtractor(BaseExtractor):
    """
    스킬 정보 추출기

    추출 필드:
    - skills: 기술 스택 목록
    - primary_skills: 핵심 스킬 (상위 5개)
    - certifications: 자격증 목록
    - languages: 외국어 능력
    """

    EXTRACTOR_TYPE = "skills"

    # 스킬 정규화 매핑 (소문자 → 정규화된 이름)
    SKILL_NORMALIZATION = {
        "javascript": "JavaScript",
        "js": "JavaScript",
        "typescript": "TypeScript",
        "ts": "TypeScript",
        "python": "Python",
        "py": "Python",
        "java": "Java",
        "kotlin": "Kotlin",
        "swift": "Swift",
        "objective-c": "Objective-C",
        "c++": "C++",
        "cpp": "C++",
        "c#": "C#",
        "csharp": "C#",
        "golang": "Go",
        "go": "Go",
        "rust": "Rust",
        "ruby": "Ruby",
        "php": "PHP",
        "scala": "Scala",
        "react": "React",
        "reactjs": "React",
        "react.js": "React",
        "vue": "Vue.js",
        "vuejs": "Vue.js",
        "vue.js": "Vue.js",
        "angular": "Angular",
        "angularjs": "Angular",
        "svelte": "Svelte",
        "next.js": "Next.js",
        "nextjs": "Next.js",
        "nuxt": "Nuxt.js",
        "nuxt.js": "Nuxt.js",
        "node": "Node.js",
        "nodejs": "Node.js",
        "node.js": "Node.js",
        "express": "Express.js",
        "expressjs": "Express.js",
        "nestjs": "NestJS",
        "nest.js": "NestJS",
        "django": "Django",
        "flask": "Flask",
        "fastapi": "FastAPI",
        "spring": "Spring",
        "spring boot": "Spring Boot",
        "springboot": "Spring Boot",
        "rails": "Ruby on Rails",
        "ruby on rails": "Ruby on Rails",
        "ror": "Ruby on Rails",
        "laravel": "Laravel",
        "aws": "AWS",
        "amazon web services": "AWS",
        "gcp": "GCP",
        "google cloud": "GCP",
        "google cloud platform": "GCP",
        "azure": "Azure",
        "microsoft azure": "Azure",
        "docker": "Docker",
        "kubernetes": "Kubernetes",
        "k8s": "Kubernetes",
        "terraform": "Terraform",
        "ansible": "Ansible",
        "jenkins": "Jenkins",
        "github actions": "GitHub Actions",
        "gitlab ci": "GitLab CI/CD",
        "circleci": "CircleCI",
        "mysql": "MySQL",
        "postgresql": "PostgreSQL",
        "postgres": "PostgreSQL",
        "mongodb": "MongoDB",
        "mongo": "MongoDB",
        "redis": "Redis",
        "elasticsearch": "Elasticsearch",
        "es": "Elasticsearch",
        "graphql": "GraphQL",
        "rest api": "REST API",
        "restful": "REST API",
        "git": "Git",
        "github": "GitHub",
        "gitlab": "GitLab",
        "bitbucket": "Bitbucket",
        "jira": "Jira",
        "confluence": "Confluence",
        "figma": "Figma",
        "sketch": "Sketch",
        "adobe xd": "Adobe XD",
        "photoshop": "Photoshop",
        "illustrator": "Illustrator",
        "sql": "SQL",
        "html": "HTML",
        "css": "CSS",
        "sass": "Sass",
        "scss": "Sass",
        "less": "Less",
        "tailwind": "Tailwind CSS",
        "tailwindcss": "Tailwind CSS",
        "bootstrap": "Bootstrap",
        "material ui": "Material-UI",
        "mui": "Material-UI",
        "machine learning": "Machine Learning",
        "ml": "Machine Learning",
        "deep learning": "Deep Learning",
        "dl": "Deep Learning",
        "tensorflow": "TensorFlow",
        "pytorch": "PyTorch",
        "keras": "Keras",
        "scikit-learn": "scikit-learn",
        "sklearn": "scikit-learn",
        "pandas": "pandas",
        "numpy": "NumPy",
    }

    # 제외할 일반적인 단어
    EXCLUDE_WORDS: Set[str] = {
        "등", "외", "기타", "그외", "및", "또는", "포함", "가능",
        "개발", "경험", "사용", "활용", "능력", "역량",
        "상", "중", "하", "level", "experience", "knowledge"
    }

    def __init__(self):
        super().__init__()
        self.rule_validator = RuleValidator()

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        스킬 데이터 후처리

        - 스킬 정규화
        - 중복 제거
        - 핵심 스킬 추출
        """
        processed = self._remove_evidence_fields(data)

        # skills 정규화
        if "skills" in processed and isinstance(processed["skills"], list):
            normalized_skills = self._normalize_skills(processed["skills"])
            processed["skills"] = normalized_skills

            # primary_skills가 없으면 상위 5개 추출
            if "primary_skills" not in processed:
                processed["primary_skills"] = normalized_skills[:5]

        # primary_skills 정규화
        if "primary_skills" in processed and isinstance(processed["primary_skills"], list):
            processed["primary_skills"] = self._normalize_skills(processed["primary_skills"])[:5]

        # certifications 처리
        if "certifications" in processed and isinstance(processed["certifications"], list):
            processed["certifications"] = self._clean_certifications(processed["certifications"])

        return processed

    def _normalize_skills(self, skills: List[str]) -> List[str]:
        """
        스킬 목록 정규화

        - 대소문자 통일
        - 중복 제거
        - 일반적인 단어 제외
        """
        normalized = []
        seen: Set[str] = set()

        for skill in skills:
            if not skill or not isinstance(skill, str):
                continue

            skill = skill.strip()

            # 빈 문자열이나 너무 짧은 것 제외
            if len(skill) < 2:
                continue

            # 제외 단어 확인
            if skill.lower() in self.EXCLUDE_WORDS:
                continue

            # 정규화
            lower_skill = skill.lower()
            if lower_skill in self.SKILL_NORMALIZATION:
                skill = self.SKILL_NORMALIZATION[lower_skill]

            # 중복 확인 (대소문자 무시)
            if skill.lower() in seen:
                continue

            seen.add(skill.lower())
            normalized.append(skill)

        return normalized

    def _clean_certifications(
        self,
        certifications: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """자격증 목록 정리"""
        cleaned = []
        seen_names: Set[str] = set()

        for cert in certifications:
            if not isinstance(cert, dict):
                continue

            name = cert.get("name", "").strip()
            if not name:
                continue

            # 중복 확인
            if name.lower() in seen_names:
                continue

            seen_names.add(name.lower())
            cleaned.append({
                "name": name,
                "issuer": cert.get("issuer", ""),
                "date": cert.get("date", "")
            })

        return cleaned

    def extract_skills_from_text(self, text: str) -> List[str]:
        """
        텍스트에서 직접 스킬 추출 (정규식 기반)

        LLM 호출 없이 빠르게 스킬 추출할 때 사용
        """
        skills = []

        # 스킬 관련 섹션 찾기
        skill_sections = re.findall(
            r"(?:기술|스킬|skill|tech|역량)[^:]*[:：]([^\n]{10,500})",
            text,
            re.IGNORECASE
        )

        for section in skill_sections:
            # 구분자로 분리
            parts = re.split(r"[,，/|•·\s]+", section)
            for part in parts:
                part = part.strip()
                if 2 <= len(part) <= 30:
                    skills.append(part)

        # 알려진 스킬 패턴 매칭
        for skill_pattern in self.SKILL_NORMALIZATION.keys():
            pattern = re.compile(rf"\b{re.escape(skill_pattern)}\b", re.IGNORECASE)
            if pattern.search(text):
                skills.append(self.SKILL_NORMALIZATION[skill_pattern])

        return self._normalize_skills(skills)


# 싱글톤 인스턴스
_instance: Optional[SkillsExtractor] = None


def get_skills_extractor() -> SkillsExtractor:
    """SkillsExtractor 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = SkillsExtractor()
    return _instance
