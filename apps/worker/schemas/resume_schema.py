"""
Resume JSON Schemas for Structured Outputs

Multi-Agent Architecture:
- Profile Schema: Basic info (ProfileAgent)
- Career Schema: Work experience (CareerAgent)
- Spec Schema: Education, Skills, Projects (SpecAgent)
- Summary Schema: Analysis & Summary (SummaryAgent)
"""

from typing import Dict, Any

# ─────────────────────────────────────────────────────────────────────────────
# 1. Profile Schema (Basic Info)
# ─────────────────────────────────────────────────────────────────────────────
PROFILE_SCHEMA: Dict[str, Any] = {
    "name": "profile_extraction",
    "description": "Extract candidate's personal profile information",
    "strict": False,  # Allow nullable fields
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "후보자 이름"},
            "birth_year": {"type": "integer", "description": "출생 연도 (4자리)"},
            "gender": {"type": "string", "description": "성별 (male/female)"},
            "phone": {"type": "string", "description": "휴대폰 번호"},
            "email": {"type": "string", "description": "이메일 주소"},
            "address": {"type": "string", "description": "거주지 주소"},
            "location_city": {"type": "string", "description": "거주 도시"},
        },
        "required": ["name"],  # Only name is required
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Career Schema (Work Experience)
# ─────────────────────────────────────────────────────────────────────────────
CAREER_SCHEMA: Dict[str, Any] = {
    "name": "career_extraction",
    "description": "Extract candidate's work experience and career history",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "exp_years": {"type": "number", "description": "총 경력 연수"},
            "last_company": {"type": "string", "description": "최근 직장명"},
            "last_position": {"type": "string", "description": "최근 직책"},
            "careers": {
                "type": "array",
                "description": "경력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string", "description": "회사명"},
                        "position": {"type": "string", "description": "직책"},
                        "department": {"type": "string", "description": "부서"},
                        "start_date": {"type": "string", "description": "입사일 (YYYY-MM)"},
                        "end_date": {"type": "string", "description": "퇴사일 (YYYY-MM)"},
                        "is_current": {"type": "boolean", "description": "현재 재직 여부"},
                        "description": {"type": "string", "description": "업무 내용"}
                    },
                    "required": ["company"]
                }
            }
        },
        "required": ["careers"],
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. Spec Schema (Education, Skills, Projects)
# ─────────────────────────────────────────────────────────────────────────────
SPEC_SCHEMA: Dict[str, Any] = {
    "name": "spec_extraction",
    "description": "Extract candidate's education, skills, and projects",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "education_level": {"type": "string", "description": "최종 학력"},
            "education_school": {"type": "string", "description": "최종 학교명"},
            "education_major": {"type": "string", "description": "전공"},
            "educations": {
                "type": "array",
                "description": "학력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "school": {"type": "string", "description": "학교명"},
                        "degree": {"type": "string", "description": "학위"},
                        "major": {"type": "string", "description": "전공"},
                        "graduation_year": {"type": "integer", "description": "졸업 연도"},
                        "is_graduated": {"type": "boolean", "description": "졸업 여부"}
                    },
                    "required": ["school"]
                }
            },
            "skills": {"type": "array", "description": "기술 스택 목록", "items": {"type": "string"}},
            "projects": {
                "type": "array",
                "description": "프로젝트 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "프로젝트명"},
                        "role": {"type": "string", "description": "역할"},
                        "period": {"type": "string", "description": "기간"},
                        "description": {"type": "string", "description": "설명"},
                        "technologies": {"type": "array", "items": {"type": "string"}, "description": "사용 기술"}
                    },
                    "required": ["name"]
                }
            },
            "portfolio_url": {"type": "string", "description": "포트폴리오 URL"},
            "github_url": {"type": "string", "description": "GitHub URL"},
            "linkedin_url": {"type": "string", "description": "LinkedIn URL"}
        },
        "required": [],
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. Summary Schema
# ─────────────────────────────────────────────────────────────────────────────
SUMMARY_SCHEMA: Dict[str, Any] = {
    "name": "summary_generation",
    "description": "Generate summary and analysis of the candidate",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "후보자 요약 (300자 이내)"},
            "strengths": {"type": "array", "description": "주요 강점 3~5가지", "items": {"type": "string"}}
        },
        "required": ["summary", "strengths"],
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Legacy: Combined Schema (for backward compatibility)
# ─────────────────────────────────────────────────────────────────────────────
RESUME_JSON_SCHEMA: Dict[str, Any] = {
    "name": "resume_extraction",
    "description": "Extract structured information from a resume",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "후보자 이름"},
            "birth_year": {"type": "integer", "description": "출생 연도 (4자리)"},
            "gender": {"type": "string", "description": "성별 (male/female)"},
            "phone": {"type": "string", "description": "휴대폰 번호"},
            "email": {"type": "string", "description": "이메일 주소"},
            "address": {"type": "string", "description": "거주지 주소"},
            "location_city": {"type": "string", "description": "거주 도시"},
            "exp_years": {"type": "number", "description": "총 경력 연수"},
            "last_company": {"type": "string", "description": "최근 직장명"},
            "last_position": {"type": "string", "description": "최근 직책"},
            "careers": {"type": "array", "description": "경력 목록", "items": {"type": "object"}},
            "skills": {"type": "array", "description": "기술 스택 목록", "items": {"type": "string"}},
            "education_level": {"type": "string", "description": "최종 학력"},
            "education_school": {"type": "string", "description": "최종 학교명"},
            "education_major": {"type": "string", "description": "전공"},
            "educations": {"type": "array", "description": "학력 목록", "items": {"type": "object"}},
            "projects": {"type": "array", "description": "프로젝트 목록", "items": {"type": "object"}},
            "summary": {"type": "string", "description": "후보자 요약 (300자 이내)"},
            "strengths": {"type": "array", "description": "강점 목록", "items": {"type": "string"}},
            "portfolio_url": {"type": "string", "description": "포트폴리오 URL"},
            "github_url": {"type": "string", "description": "GitHub URL"},
            "linkedin_url": {"type": "string", "description": "LinkedIn URL"}
        },
        "required": ["name"],
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Common Prompt
# ─────────────────────────────────────────────────────────────────────────────
RESUME_SCHEMA_PROMPT = """
## 한국 이력서/경력기술서 추출 가이드

### 중요: 한국 이력서의 특성
- 이름: "이름:" 라벨 없이 "김경민" 처럼 단독으로 표시됨 (문서 상단/헤더)
- 파일명에서 이름 추론 가능 (예: "김경민_이력서.pdf")
- 경력: 최신순으로 정렬되어 있을 수 있음
- 날짜: YYYY.MM 또는 YYYY-MM 형식 준수

### 추출 원칙
- 명시적 라벨이 없어도 문맥을 통해 추론하세요.
- 정보가 없으면 해당 필드를 생략하세요 (null 대신 생략).
- 반드시 JSON 포맷을 준수하세요.
"""
