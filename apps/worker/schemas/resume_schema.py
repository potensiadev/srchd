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
            "strengths": {"type": "array", "description": "주요 강점 3~5가지", "items": {"type": "string"}},
            "match_reason": {"type": "string", "description": "이 후보자가 채용 시장에서 매력적인 이유 (Aha Moment용 핵심 소구점)"}
        },
        "required": ["summary", "strengths", "match_reason"],
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
            
            # 프로젝트 - IMPORTANT: 다양한 헤더에서 추출 (경력 상세, 주요 업무, 수행 과제 등)
            "projects": {
                "type": "array", 
                "description": "프로젝트 목록. IMPORTANT: '프로젝트' 헤더뿐만 아니라 '경력 상세', '주요 업무', '담당 업무', '수행 과제', '성과' 등의 섹션에서도 프로젝트를 추출하세요. 정량적 성과(숫자, %), 사용 기술, 문제-해결 구조가 있으면 프로젝트로 분류하세요.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "프로젝트/이니셔티브 이름"},
                        "role": {"type": "string", "description": "역할 (PM, 기획자, 개발자 등)"},
                        "period": {"type": "string", "description": "기간 (YYYY.MM - YYYY.MM)"},
                        "description": {"type": "string", "description": "프로젝트 설명 및 성과"},
                        "technologies": {"type": "array", "items": {"type": "string"}, "description": "사용 기술"},
                        "company": {"type": "string", "description": "프로젝트 수행 회사 (해당 경력에서 추론)"}
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
            "match_reason": {
                "type": "string",
                "description": "이 후보자가 왜 매력적인지 한 문장으로 설명 (예: '대규모 트래픽 처리 경험이 풍부한 시니어 백엔드 엔지니어입니다.')"
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
6. **match_reason**: 핵심 소구점 - 후보자가 왜 채용 시장에서 매력적인지 1문장으로 요약

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

### ⭐ 프로젝트 추출 특별 지침 (CRITICAL)

**한국 이력서에서 프로젝트 정보는 다양한 섹션명 아래에 있을 수 있습니다:**
- "프로젝트", "주요 프로젝트", "Projects"
- "경력 상세", "업무 상세", "주요 업무", "담당 업무"
- "수행 과제", "성과", "실적", "주요 성과"
- "프로젝트 경험", "업무 경험"

**섹션 헤더가 '프로젝트'가 아니어도, 다음 특성이 있으면 projects 배열에 추출하세요:**
1. **구체적인 이니셔티브/과제 이름** (예: "OX퀴즈 리텐션 엔진 기획")
2. **정량적 성과** (예: "23일만에 20만원 달성", "97% 절감", "DAU 30% 증가")
3. **사용 기술/도구** (예: "Kubernetes", "Python", "Notion API")
4. **문제-해결 구조** (배경 → 문제 정의 → 역할 → 성과)
5. **기간 명시** (예: "2025.01 - 2025.04")
6. **팀 규모/협업 정보** (예: "개발 1, 디자인 1")

**예시:**
```
경력 상세
OX퀴즈 리텐션 및 상품 가입 전환 엔진 기획 (전북은행) 2025.09 - 2025.10
배경: 포인트 월렛 출시 이후 플랫폼의 핵심 과제는...
성과: OX퀴즈는 런칭 23일 만에 단 20만 원의 포인트 비용이...
```
→ 이 내용은 '경력 상세' 아래에 있지만, **projects 배열에 추출해야 합니다.**

"""

# ─────────────────────────────────────────────────────────────────────────────
# T4-1: Strict Schema Support
# ─────────────────────────────────────────────────────────────────────────────

# Critical fields that should use strict validation
STRICT_CRITICAL_FIELDS = ["name", "phone", "email", "careers"]


def get_strict_schema(base_schema: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Generate strict version of the resume schema.

    OpenAI Structured Outputs requires:
    - "strict": True
    - "additionalProperties": False
    - All properties must have explicit types

    Note: Use with caution - strict mode may reject valid resumes
    with unusual formats.
    """
    import copy
    schema = copy.deepcopy(base_schema or RESUME_JSON_SCHEMA)

    strict_schema = {
        **schema,
        "strict": True,
        "schema": {
            **schema["schema"],
            "additionalProperties": False,
            "properties": _make_properties_nullable(schema["schema"]["properties"]),
            "required": STRICT_CRITICAL_FIELDS,
        }
    }

    return strict_schema


def _make_properties_nullable(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Make all properties accept null values for strict mode."""
    import copy
    result = {}
    for key, prop in properties.items():
        prop_copy = copy.deepcopy(prop)
        prop_type = prop_copy.get("type")

        if prop_type == "array":
            result[key] = {**prop_copy, "type": ["array", "null"]}
        elif prop_type == "object":
            result[key] = {**prop_copy, "type": ["object", "null"]}
        elif prop_type in ("string", "number", "integer", "boolean"):
            result[key] = {**prop_copy, "type": [prop_type, "null"]}
        else:
            result[key] = prop_copy
    return result


# ─────────────────────────────────────────────────────────────────────────────
# T4-2: Chain-of-Thought (CoT) Prompting
# ─────────────────────────────────────────────────────────────────────────────

COT_EXTRACTION_PROMPT = """
## Chain-of-Thought 이력서 분석 가이드

당신은 한국 이력서 분석 전문가입니다. 아래 단계를 순차적으로 수행하세요.

### Step 1: 문서 구조 파악 (Document Structure)
먼저 문서의 전체 구조를 파악하세요:
- 어떤 섹션들이 있는가? (기본정보, 경력, 학력, 스킬, 프로젝트 등)
- 각 섹션의 시작과 끝은 어디인가?
- 특이한 형식이나 레이아웃이 있는가?

### Step 2: 기본 정보 추출 (Profile Extraction)
이름, 연락처 등 기본 정보를 추출하세요:
- 문서 상단/헤더에서 이름 찾기
- 파일명에서 이름 힌트 확인
- 연락처 (전화번호, 이메일) 패턴 매칭
- 나이/출생년도 추론 (주민번호 앞자리, 나이 표기 등)

### Step 3: 경력 추출 (Career Extraction)
경력 정보를 시간순으로 정리하세요:
- 각 경력의 회사명, 직책, 기간 명확히 구분
- 날짜 형식 통일 (YYYY-MM)
- 현재 재직 여부 판단
- 업무 내용 요약

### Step 4: 교육 및 스킬 (Education & Skills)
학력과 기술 스택을 추출하세요:
- 최종 학력, 전공 확인
- 명시된 기술/도구 목록화
- 자격증/인증 포함

### Step 5: 프로젝트 추출 (Project Extraction)
**중요**: "프로젝트" 섹션뿐만 아니라 "경력 상세", "주요 업무", "성과" 등에서도 프로젝트를 추출하세요.
다음 특성이 있으면 프로젝트로 분류:
- 구체적인 과제/이니셔티브 이름
- 정량적 성과 (숫자, %)
- 사용 기술 명시
- 기간 정보

### Step 6: 요약 및 강점 생성 (Summary Generation)
추출한 정보를 바탕으로:
- 300자 내외 후보자 요약문 작성
- 3-5개 핵심 강점 도출
- 왜 이 후보자가 매력적인지 한 문장으로 표현

### 추출 원칙
- 확실하지 않은 정보는 생략 (추측 금지)
- 원문에 없는 내용 생성 금지 (할루시네이션 방지)
- 날짜 형식 통일 (YYYY-MM)
- JSON 형식 엄격 준수

이제 위 단계를 따라 이력서를 분석하세요.
"""

# ─────────────────────────────────────────────────────────────────────────────
# T4-2: Few-Shot Examples
# ─────────────────────────────────────────────────────────────────────────────

FEW_SHOT_EXAMPLE_INPUT = """
김철수
서울특별시 강남구
010-1234-5678 | chulsu@email.com
1990년생

[경력]
ABC 주식회사 | PM | 2020.03 - 현재
- 신규 서비스 기획 및 런칭 (DAU 50만 달성)
- 개발팀 5명 리드

XYZ 스타트업 | 기획자 | 2018.01 - 2020.02
- B2B SaaS 제품 기획
- 고객사 20개 온보딩

[학력]
서울대학교 | 컴퓨터공학 | 2018년 졸업
"""

FEW_SHOT_EXAMPLE_OUTPUT = {
    "name": "김철수",
    "birth_year": 1990,
    "phone": "010-1234-5678",
    "email": "chulsu@email.com",
    "address": "서울특별시 강남구",
    "location_city": "서울",
    "exp_years": 6.0,
    "last_company": "ABC 주식회사",
    "last_position": "PM",
    "careers": [
        {
            "company": "ABC 주식회사",
            "position": "PM",
            "start_date": "2020-03",
            "end_date": None,
            "is_current": True,
            "description": "신규 서비스 기획 및 런칭 (DAU 50만 달성), 개발팀 5명 리드"
        },
        {
            "company": "XYZ 스타트업",
            "position": "기획자",
            "start_date": "2018-01",
            "end_date": "2020-02",
            "is_current": False,
            "description": "B2B SaaS 제품 기획, 고객사 20개 온보딩"
        }
    ],
    "education_level": "대졸",
    "education_school": "서울대학교",
    "education_major": "컴퓨터공학",
    "skills": ["PM", "서비스 기획", "B2B SaaS"],
    "summary": "6년차 PM으로 ABC 주식회사에서 DAU 50만을 달성한 신규 서비스를 런칭한 경험이 있습니다.",
    "strengths": ["6년차 PM 경력", "DAU 50만 서비스 런칭", "B2B SaaS 전문성"],
    "match_reason": "대규모 서비스 런칭과 B2B 경험을 모두 갖춘 시니어 PM입니다."
}


def get_few_shot_prompt() -> str:
    """Generate few-shot examples prompt."""
    import json
    return f"""
### 추출 예시

**입력 이력서:**
```
{FEW_SHOT_EXAMPLE_INPUT.strip()}
```

**추출 결과:**
```json
{json.dumps(FEW_SHOT_EXAMPLE_OUTPUT, ensure_ascii=False, indent=2)}
```
"""


def get_enhanced_prompt(use_cot: bool = False, use_few_shot: bool = False) -> str:
    """
    Get enhanced prompt with optional CoT and few-shot examples.

    Args:
        use_cot: Include Chain-of-Thought reasoning steps
        use_few_shot: Include few-shot examples

    Returns:
        Enhanced system prompt
    """
    prompt_parts = []

    if use_cot:
        prompt_parts.append(COT_EXTRACTION_PROMPT)
    else:
        prompt_parts.append(RESUME_SCHEMA_PROMPT)

    if use_few_shot:
        prompt_parts.append(get_few_shot_prompt())

    return "\n".join(prompt_parts)
