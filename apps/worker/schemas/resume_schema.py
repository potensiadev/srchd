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
                        "end_date": {"type": "string", "description": "퇴사일 (YYYY-MM), 현재 재직중이면 null"},
                        "is_current": {"type": "boolean", "description": "현재 재직 여부"},
                        "description": {"type": "string", "description": "업무 내용"}
                    },
                    "required": ["company", "position"]
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
# 이 스키마는 단일 LLM 호출에서 모든 정보를 추출할 때 사용됩니다.
# Issue #11-14: 상세한 필드 정의로 데이터 품질 향상
# ─────────────────────────────────────────────────────────────────────────────
RESUME_JSON_SCHEMA: Dict[str, Any] = {
    "name": "resume_extraction",
    "description": "Extract ALL structured information from a Korean resume (이력서/경력기술서)",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            # 기본 정보 - Issue #14: birth_year 필수 추출
            "name": {"type": "string", "description": "후보자 이름 (문서 상단이나 파일명에서 추출)"},
            "birth_year": {"type": "integer", "description": "출생 연도 (4자리, 예: 1985). 나이가 있으면 역산. 주민번호 앞자리에서도 추출 가능"},
            "gender": {"type": "string", "description": "성별 (male/female)"},
            "phone": {"type": "string", "description": "휴대폰 번호 (010-0000-0000 형식)"},
            "email": {"type": "string", "description": "이메일 주소"},
            "address": {"type": "string", "description": "거주지 주소"},
            "location_city": {"type": "string", "description": "거주 도시 (서울, 경기 등)"},
            
            # 경력 정보 - Issue #11: 상세 필드 정의
            "exp_years": {"type": "number", "description": "총 경력 연수. 첫 입사일부터 현재까지 계산."},
            "last_company": {"type": "string", "description": "가장 최근(현재) 직장명"},
            "last_position": {"type": "string", "description": "가장 최근(현재) 직책/직급"},
            "careers": {
                "type": "array",
                "description": "경력 목록 (최신순 정렬). 각 경력에 필수 필드: company, position, department, start_date, end_date, is_current, description",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string", "description": "회사명 (정확한 법인명)"},
                        "position": {"type": "string", "description": "직책/직급 (예: PM, 과장, 팀장)"},
                        "department": {"type": "string", "description": "부서명"},
                        "start_date": {"type": "string", "description": "입사일 YYYY-MM 형식 (예: 2023-11)"},
                        "end_date": {"type": "string", "description": "퇴사일 YYYY-MM 형식. 현재 재직중이면 null"},
                        "is_current": {"type": "boolean", "description": "현재 재직 여부 (true/false)"},
                        "description": {"type": "string", "description": "담당 업무 및 성과 상세 설명"}
                    },
                    "required": ["company", "position", "start_date"]
                }
            },
            
            # 스킬
            "skills": {"type": "array", "description": "기술 스택, 도구, 언어 목록", "items": {"type": "string"}},
            
            # 학력
            "education_level": {"type": "string", "description": "최종 학력 (대졸, 석사, 박사 등)"},
            "education_school": {"type": "string", "description": "최종 학교명"},
            "education_major": {"type": "string", "description": "전공"},
            "educations": {
                "type": "array", 
                "description": "학력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "school": {"type": "string"},
                        "degree": {"type": "string"},
                        "major": {"type": "string"},
                        "graduation_year": {"type": "integer"}
                    }
                }
            },
            
            # 프로젝트
            "projects": {
                "type": "array", 
                "description": "프로젝트 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                        "period": {"type": "string"},
                        "description": {"type": "string"},
                        "technologies": {"type": "array", "items": {"type": "string"}}
                    }
                }
            },
            
            # AI 생성 - Issue #12: summary 필수 생성
            "summary": {
                "type": "string", 
                "description": "후보자 요약문 (300자 내외). 핵심 경력, 전문 분야, 강점을 한 문단으로 요약. 반드시 생성할 것!"
            },
            "strengths": {
                "type": "array", 
                "description": "주요 강점 3~5가지 (예: '10년 이상의 PM 경력', 'B2B SaaS 도메인 전문가')",
                "items": {"type": "string"}
            },
            
            # URL
            "portfolio_url": {"type": "string", "description": "포트폴리오 URL"},
            "github_url": {"type": "string", "description": "GitHub URL"},
            "linkedin_url": {"type": "string", "description": "LinkedIn URL"}
        },
        "required": ["name"],  # 최소 필수 필드만 - 나머지는 선택적 추출
        "additionalProperties": True
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Common Prompt - 상세한 추출 가이드
# ─────────────────────────────────────────────────────────────────────────────
RESUME_SCHEMA_PROMPT = """
## 한국 이력서/경력기술서 추출 가이드

### 중요: 한국 이력서의 특성
- 이름: "이름:" 라벨 없이 "김경민" 처럼 단독으로 표시됨 (문서 상단/헤더)
- 파일명에서 이름 추론 가능 (예: "김경민_이력서.pdf")
- 경력: 최신순으로 정렬되어 있을 수 있음
- 날짜: YYYY.MM 또는 YYYY-MM 형식 준수

### 필수 추출 필드
1. **name**: 이름 - 반드시 추출
2. **birth_year**: 출생연도 - 나이, 주민번호 앞자리에서 추론 가능
3. **careers**: 경력 목록 - 각 경력에 company, position, department, start_date, end_date, is_current, description 포함
4. **summary**: 후보자 요약문 - 300자 내외로 핵심 경력과 강점을 요약하여 생성
5. **strengths**: 강점 목록 - 3~5개의 핵심 강점

### 경력 데이터 형식 (Issue #11 해결)
각 경력 항목은 다음 형식을 따라야 합니다:
```json
{
  "company": "회사명",
  "position": "직책",
  "department": "부서명",
  "start_date": "YYYY-MM",
  "end_date": "YYYY-MM 또는 null (현재 재직)",
  "is_current": true/false,
  "description": "업무 내용 상세"
}
```

### 추출 원칙
- 명시적 라벨이 없어도 문맥을 통해 추론하세요.
- 정보가 없으면 해당 필드를 생략하세요 (null 대신 생략).
- **summary와 strengths는 반드시 생성하세요!**
- 반드시 JSON 포맷을 준수하세요.
"""
