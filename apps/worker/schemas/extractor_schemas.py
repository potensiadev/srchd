"""
Extractor Schemas - 필드별 Extractor용 JSON 스키마

각 Extractor가 LLM에 요청할 때 사용하는 JSON 스키마입니다.
Evidence span 필드가 모든 주요 값에 포함되어 있습니다.
"""

from typing import Dict, Any


# ─────────────────────────────────────────────────────────────────────────────
# 1. Profile Extractor Schema
# ─────────────────────────────────────────────────────────────────────────────
PROFILE_EXTRACTOR_SCHEMA: Dict[str, Any] = {
    "name": "profile_extraction",
    "description": "Extract candidate's personal profile information with evidence",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "후보자 이름"
            },
            "name_evidence": {
                "type": "string",
                "description": "이름이 나온 원문 발췌"
            },
            "birth_year": {
                "type": "integer",
                "description": "출생 연도 (4자리)"
            },
            "birth_year_evidence": {
                "type": "string",
                "description": "출생연도 관련 원문 발췌 (나이, 주민번호 앞자리 등)"
            },
            "gender": {
                "type": "string",
                "enum": ["male", "female"],
                "description": "성별"
            },
            "phone": {
                "type": "string",
                "description": "휴대폰 번호"
            },
            "phone_evidence": {
                "type": "string",
                "description": "전화번호 원문 발췌"
            },
            "email": {
                "type": "string",
                "description": "이메일 주소"
            },
            "email_evidence": {
                "type": "string",
                "description": "이메일 원문 발췌"
            },
            "address": {
                "type": "string",
                "description": "거주지 주소"
            },
            "location_city": {
                "type": "string",
                "description": "거주 도시 (서울, 경기 등)"
            }
        },
        "required": ["name"],
        "additionalProperties": True
    }
}

PROFILE_EXTRACTOR_PROMPT = """## Profile Extractor

후보자의 기본 프로필 정보를 추출합니다.

### 추출 대상
- name: 이름 (필수)
- birth_year: 출생 연도 (나이가 있으면 역산)
- gender: 성별 (male/female)
- phone: 휴대폰 번호
- email: 이메일 주소
- address: 주소
- location_city: 거주 도시

### Evidence 규칙
각 필드에 대해 `{field}_evidence` 형식으로 원문 발췌를 함께 제공하세요.
예: name_evidence: "홍길동 (1985년생)"

### 한국 이력서 특성
- 이름은 문서 상단에 단독으로 표시됨
- 파일명에서 이름 추론 가능
- 나이/생년월일/주민번호 앞자리에서 birth_year 추출

### 출력 원칙
- 근거가 불충분하면 해당 필드는 생략
- evidence는 가능한 짧고 직접적인 원문 발췌 사용
"""

# ─────────────────────────────────────────────────────────────────────────────
# 2. Career Extractor Schema
# ─────────────────────────────────────────────────────────────────────────────
CAREER_EXTRACTOR_SCHEMA: Dict[str, Any] = {
    "name": "career_extraction",
    "description": "Extract candidate's work experience with evidence",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "exp_years": {
                "type": "number",
                "description": "총 경력 연수"
            },
            "exp_years_evidence": {
                "type": "string",
                "description": "경력 연수 계산 근거"
            },
            "current_company": {
                "type": "string",
                "description": "현재 재직 회사명"
            },
            "current_company_evidence": {
                "type": "string",
                "description": "현재 회사 원문 발췌"
            },
            "current_position": {
                "type": "string",
                "description": "현재 직책"
            },
            "current_position_evidence": {
                "type": "string",
                "description": "현재 직책 원문 발췌"
            },
            "careers": {
                "type": "array",
                "description": "경력 목록 (최신순)",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {
                            "type": "string",
                            "description": "회사명"
                        },
                        "company_evidence": {
                            "type": "string",
                            "description": "회사명 원문 발췌"
                        },
                        "position": {
                            "type": "string",
                            "description": "직책/직급"
                        },
                        "position_evidence": {
                            "type": "string",
                            "description": "직책 원문 발췌"
                        },
                        "department": {
                            "type": "string",
                            "description": "부서명"
                        },
                        "start_date": {
                            "type": "string",
                            "description": "입사일 (YYYY-MM)"
                        },
                        "start_date_evidence": {
                            "type": "string",
                            "description": "입사일 원문 발췌"
                        },
                        "end_date": {
                            "type": "string",
                            "description": "퇴사일 (YYYY-MM), 재직중이면 null"
                        },
                        "end_date_evidence": {
                            "type": "string",
                            "description": "퇴사일 원문 발췌"
                        },
                        "is_current": {
                            "type": "boolean",
                            "description": "현재 재직 여부"
                        },
                        "description": {
                            "type": "string",
                            "description": "담당 업무 상세"
                        }
                    },
                    "required": ["company", "position"]
                }
            }
        },
        "required": ["careers"],
        "additionalProperties": True
    }
}

CAREER_EXTRACTOR_PROMPT = """## Career Extractor

후보자의 경력 정보를 추출합니다.

### 추출 대상
- exp_years: 총 경력 연수 (첫 입사일~현재)
- current_company: 현재 재직 회사
- current_position: 현재 직책
- careers[]: 경력 목록

### 경력 항목 필수 필드
- company: 회사명
- position: 직책
- start_date: 입사일 (YYYY-MM)
- end_date: 퇴사일 (YYYY-MM) 또는 null
- is_current: 현재 재직 여부

### Evidence 규칙
각 필드에 `{field}_evidence`로 원문 발췌 제공:
- company_evidence: "삼성전자 (2020.03 ~ 현재)"
- start_date_evidence: "2020.03"

### 날짜 형식
- YYYY-MM 형식으로 정규화
- "현재", "재직중" → is_current: true, end_date: null

### 출력 원칙
- 겹치는 기간/모호한 항목은 텍스트 근거 기반으로 보수적으로 추출
- 추측 대신 생략
"""


# ─────────────────────────────────────────────────────────────────────────────
# 3. Education Extractor Schema
# ─────────────────────────────────────────────────────────────────────────────
EDUCATION_EXTRACTOR_SCHEMA: Dict[str, Any] = {
    "name": "education_extraction",
    "description": "Extract candidate's education information with evidence",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "education_level": {
                "type": "string",
                "description": "최종 학력 (박사/석사/학사/전문학사/고졸)"
            },
            "education_level_evidence": {
                "type": "string",
                "description": "최종 학력 원문 발췌"
            },
            "education_school": {
                "type": "string",
                "description": "최종 학교명"
            },
            "education_school_evidence": {
                "type": "string",
                "description": "최종 학교 원문 발췌"
            },
            "education_major": {
                "type": "string",
                "description": "최종 전공"
            },
            "educations": {
                "type": "array",
                "description": "학력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "school": {
                            "type": "string",
                            "description": "학교명"
                        },
                        "school_evidence": {
                            "type": "string",
                            "description": "학교명 원문 발췌"
                        },
                        "degree": {
                            "type": "string",
                            "description": "학위 (박사/석사/학사 등)"
                        },
                        "degree_evidence": {
                            "type": "string",
                            "description": "학위 원문 발췌"
                        },
                        "major": {
                            "type": "string",
                            "description": "전공"
                        },
                        "graduation_year": {
                            "type": "integer",
                            "description": "졸업 연도"
                        },
                        "graduation_year_evidence": {
                            "type": "string",
                            "description": "졸업 연도 원문 발췌"
                        },
                        "is_graduated": {
                            "type": "boolean",
                            "description": "졸업 여부"
                        }
                    },
                    "required": ["school"]
                }
            }
        },
        "required": [],
        "additionalProperties": True
    }
}

EDUCATION_EXTRACTOR_PROMPT = """## Education Extractor

후보자의 학력 정보를 추출합니다.

### 추출 대상
- education_level: 최종 학력
- education_school: 최종 학교명
- education_major: 최종 전공
- educations[]: 학력 목록

### 학력 항목 필드
- school: 학교명
- degree: 학위 (박사/석사/학사/전문학사 등)
- major: 전공
- graduation_year: 졸업 연도
- is_graduated: 졸업 여부

### 학위 정규화
- PhD, 박사학위 → 박사
- Master, 석사학위 → 석사
- Bachelor, 학사학위 → 학사
- 전문학사, Associate → 전문학사

### Evidence 규칙
`{field}_evidence`로 원문 발췌 제공

### 출력 원칙
- 학위/졸업 여부가 불명확하면 단정하지 말고 생략
"""


# ─────────────────────────────────────────────────────────────────────────────
# 4. Skills Extractor Schema
# ─────────────────────────────────────────────────────────────────────────────
SKILLS_EXTRACTOR_SCHEMA: Dict[str, Any] = {
    "name": "skills_extraction",
    "description": "Extract candidate's skills and certifications with evidence",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "description": "기술 스택 목록 (최대 20개)",
                "items": {"type": "string"}
            },
            "skills_evidence": {
                "type": "string",
                "description": "스킬 목록이 나온 원문 발췌"
            },
            "primary_skills": {
                "type": "array",
                "description": "핵심 스킬 (상위 5개)",
                "items": {"type": "string"}
            },
            "certifications": {
                "type": "array",
                "description": "자격증 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "자격증명"
                        },
                        "issuer": {
                            "type": "string",
                            "description": "발급 기관"
                        },
                        "date": {
                            "type": "string",
                            "description": "취득일"
                        }
                    },
                    "required": ["name"]
                }
            },
            "languages": {
                "type": "array",
                "description": "외국어 능력",
                "items": {
                    "type": "object",
                    "properties": {
                        "language": {"type": "string"},
                        "level": {"type": "string"},
                        "score": {"type": "string"}
                    }
                }
            }
        },
        "required": [],
        "additionalProperties": True
    }
}

SKILLS_EXTRACTOR_PROMPT = """## Skills Extractor

후보자의 기술 스택, 자격증, 언어 능력을 추출합니다.

### 추출 대상
- skills: 기술 스택 목록 (최대 20개)
- primary_skills: 핵심 스킬 (상위 5개)
- certifications: 자격증 목록
- languages: 외국어 능력

### 스킬 추출 가이드
- 프로그래밍 언어: Python, Java, JavaScript 등
- 프레임워크: React, Spring, Django 등
- 도구: Git, Docker, AWS 등
- 도메인: Machine Learning, Data Analysis 등

### Evidence 규칙
skills_evidence에 스킬 관련 원문 섹션 발췌

### 출력 원칙
- 일반 역량(커뮤니케이션 등)보다 기술/도구 중심으로 추출
- 중복/유사 표기는 정규화하여 통합
"""


# ─────────────────────────────────────────────────────────────────────────────
# 5. Projects Extractor Schema
# ─────────────────────────────────────────────────────────────────────────────
PROJECTS_EXTRACTOR_SCHEMA: Dict[str, Any] = {
    "name": "projects_extraction",
    "description": "Extract candidate's project experience",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "projects": {
                "type": "array",
                "description": "프로젝트 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "프로젝트명"
                        },
                        "name_evidence": {
                            "type": "string",
                            "description": "프로젝트명 원문 발췌"
                        },
                        "role": {
                            "type": "string",
                            "description": "역할"
                        },
                        "company": {
                            "type": "string",
                            "description": "수행 회사"
                        },
                        "period": {
                            "type": "string",
                            "description": "기간"
                        },
                        "description": {
                            "type": "string",
                            "description": "프로젝트 설명"
                        },
                        "achievements": {
                            "type": "array",
                            "description": "성과 목록",
                            "items": {"type": "string"}
                        },
                        "technologies": {
                            "type": "array",
                            "description": "사용 기술",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["name"]
                }
            },
            "portfolio_url": {
                "type": "string",
                "description": "포트폴리오 URL"
            },
            "github_url": {
                "type": "string",
                "description": "GitHub URL"
            },
            "linkedin_url": {
                "type": "string",
                "description": "LinkedIn URL"
            }
        },
        "required": [],
        "additionalProperties": True
    }
}

PROJECTS_EXTRACTOR_PROMPT = """## Projects Extractor

후보자의 프로젝트 경험을 추출합니다.

### 추출 대상
- projects[]: 프로젝트 목록
- portfolio_url, github_url, linkedin_url

### 프로젝트 항목 필드
- name: 프로젝트명
- role: 역할 (PM, 개발자, 기획자 등)
- company: 수행 회사
- period: 기간
- description: 설명
- achievements: 성과 목록
- technologies: 사용 기술

### ⭐ 프로젝트 추출 특별 지침

다양한 섹션에서 프로젝트 추출:
- "프로젝트", "주요 프로젝트"
- "경력 상세", "업무 상세", "주요 업무"
- "수행 과제", "성과", "실적"

다음 특성이 있으면 프로젝트로 분류:
1. 구체적인 이니셔티브/과제 이름
2. 정량적 성과 (숫자, %)
3. 사용 기술/도구
4. 문제-해결 구조
5. 기간 명시

### Evidence 규칙
name_evidence로 프로젝트명 원문 발췌

### 출력 원칙
- 단순 업무 나열은 제외하고, 과제 단위(목표/성과/기술) 중심으로 추출
"""


# ─────────────────────────────────────────────────────────────────────────────
# 6. Summary Generator Schema
# ─────────────────────────────────────────────────────────────────────────────
SUMMARY_GENERATOR_SCHEMA: Dict[str, Any] = {
    "name": "summary_generation",
    "description": "Generate candidate summary and analysis",
    "strict": False,
    "schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "후보자 요약 (300자 이내)"
            },
            "strengths": {
                "type": "array",
                "description": "주요 강점 (3~5개)",
                "items": {"type": "string"}
            },
            "match_reason": {
                "type": "string",
                "description": "핵심 소구점 (채용 시장에서 매력적인 이유)"
            },
            "key_achievements": {
                "type": "array",
                "description": "핵심 성과 (최대 3개)",
                "items": {"type": "string"}
            },
            "career_trajectory": {
                "type": "string",
                "description": "커리어 방향성 (성장 패턴)"
            }
        },
        "required": ["summary", "strengths", "match_reason"],
        "additionalProperties": True
    }
}

SUMMARY_GENERATOR_PROMPT = """## Summary Generator

후보자의 요약 및 분석을 생성합니다.

### 생성 대상 (필수)
- summary: 후보자 요약 (300자 이내)
- strengths: 주요 강점 (3~5개)
- match_reason: 핵심 소구점

### 생성 대상 (선택)
- key_achievements: 핵심 성과
- career_trajectory: 커리어 방향성

### Summary 작성 가이드
- 핵심 경력, 전문 분야, 강점을 한 문단으로 요약
- 구체적인 수치나 성과 포함
- 채용 담당자 관점에서 매력적으로 작성

### Strengths 작성 가이드
- 구체적이고 차별화된 강점
- 예: "10년 이상의 B2B SaaS PM 경력"
- 예: "대규모 트래픽 처리 경험 (MAU 100만+)"

### Match Reason 작성 가이드
- 후보자가 왜 채용 시장에서 매력적인지 1문장
- Aha Moment를 줄 수 있는 핵심 소구점
- 요약/강점/소구점은 반드시 추출된 이력 사실과 정량 성과에 기반
"""


# ─────────────────────────────────────────────────────────────────────────────
# Extractor Registry
# ─────────────────────────────────────────────────────────────────────────────
EXTRACTOR_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "profile": {
        "schema": PROFILE_EXTRACTOR_SCHEMA,
        "prompt": PROFILE_EXTRACTOR_PROMPT,
        "max_text_length": 2000,
        "preferred_model": "gpt-4o-mini",  # 간단한 필드
    },
    "career": {
        "schema": CAREER_EXTRACTOR_SCHEMA,
        "prompt": CAREER_EXTRACTOR_PROMPT,
        "max_text_length": 6000,
        "preferred_model": "gpt-4o",  # 복잡한 필드
    },
    "education": {
        "schema": EDUCATION_EXTRACTOR_SCHEMA,
        "prompt": EDUCATION_EXTRACTOR_PROMPT,
        "max_text_length": 2000,
        "preferred_model": "gpt-4o",
    },
    "skills": {
        "schema": SKILLS_EXTRACTOR_SCHEMA,
        "prompt": SKILLS_EXTRACTOR_PROMPT,
        "max_text_length": 3000,
        "preferred_model": "gpt-4o-mini",  # 간단한 필드
    },
    "projects": {
        "schema": PROJECTS_EXTRACTOR_SCHEMA,
        "prompt": PROJECTS_EXTRACTOR_PROMPT,
        "max_text_length": 4000,
        "preferred_model": "gpt-4o",  # 복잡한 필드
    },
    "summary": {
        "schema": SUMMARY_GENERATOR_SCHEMA,
        "prompt": SUMMARY_GENERATOR_PROMPT,
        "max_text_length": 6000,  # 전체 문맥 필요
        "preferred_model": "gpt-4o",  # 품질 우선
    },
}


def get_extractor_schema(extractor_type: str) -> Dict[str, Any]:
    """Extractor 스키마 조회"""
    if extractor_type not in EXTRACTOR_SCHEMAS:
        raise ValueError(f"Unknown extractor type: {extractor_type}")
    return EXTRACTOR_SCHEMAS[extractor_type]["schema"]


def get_extractor_prompt(extractor_type: str) -> str:
    """Extractor 프롬프트 조회"""
    if extractor_type not in EXTRACTOR_SCHEMAS:
        raise ValueError(f"Unknown extractor type: {extractor_type}")
    return EXTRACTOR_SCHEMAS[extractor_type]["prompt"]


def get_max_text_length(extractor_type: str) -> int:
    """Extractor별 최대 텍스트 길이 조회"""
    if extractor_type not in EXTRACTOR_SCHEMAS:
        return 4000  # 기본값
    return EXTRACTOR_SCHEMAS[extractor_type]["max_text_length"]


def get_preferred_model(extractor_type: str) -> str:
    """Extractor별 선호 모델 조회"""
    if extractor_type not in EXTRACTOR_SCHEMAS:
        return "gpt-4o"  # 기본값
    return EXTRACTOR_SCHEMAS[extractor_type]["preferred_model"]
