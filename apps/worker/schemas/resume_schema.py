"""
Resume JSON Schema for Structured Outputs

이력서 분석 결과를 위한 JSON 스키마 정의
OpenAI Structured Outputs와 호환
"""

from typing import Dict, Any

# OpenAI Structured Outputs용 JSON 스키마
RESUME_JSON_SCHEMA: Dict[str, Any] = {
    "name": "resume_extraction",
    "description": "Extract structured information from a resume",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": ["string", "null"],
                "description": "후보자 이름 (라벨 없이 단독으로 표시된 한글 2~4글자 이름 추출)"
            },
            "birth_year": {
                "type": ["integer", "null"],
                "description": "출생 연도 (4자리)"
            },
            "gender": {
                "type": ["string", "null"],
                "enum": ["male", "female", None],
                "description": "성별"
            },
            "phone": {
                "type": ["string", "null"],
                "description": "휴대폰 번호 (010-XXXX-XXXX 형식)"
            },
            "email": {
                "type": ["string", "null"],
                "description": "이메일 주소"
            },
            "address": {
                "type": ["string", "null"],
                "description": "거주지 주소"
            },
            "location_city": {
                "type": ["string", "null"],
                "description": "거주 도시 (예: 서울, 부산)"
            },
            "exp_years": {
                "type": "number",
                "description": "총 경력 연수 (소수점 1자리)"
            },
            "last_company": {
                "type": ["string", "null"],
                "description": "최근 직장명"
            },
            "last_position": {
                "type": ["string", "null"],
                "description": "최근 직책/직급"
            },
            "careers": {
                "type": "array",
                "description": "경력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string", "description": "회사명"},
                        "position": {"type": ["string", "null"], "description": "직책/직급"},
                        "department": {"type": ["string", "null"], "description": "부서"},
                        "start_date": {"type": ["string", "null"], "description": "입사일"},
                        "end_date": {"type": ["string", "null"], "description": "퇴사일"},
                        "is_current": {"type": "boolean", "description": "현재 재직 여부"},
                        "description": {"type": ["string", "null"], "description": "업무 내용"}
                    },
                    "required": ["company", "is_current"],
                    "additionalProperties": False
                }
            },
            "skills": {
                "type": "array",
                "description": "기술 스택, 프레임워크, 도구, 자격증 목록",
                "items": {"type": "string"}
            },
            "education_level": {
                "type": ["string", "null"],
                "enum": ["high_school", "associate", "bachelor", "master", "doctor", None],
                "description": "최종 학력"
            },
            "education_school": {"type": ["string", "null"], "description": "최종 학교명"},
            "education_major": {"type": ["string", "null"], "description": "전공"},
            "educations": {
                "type": "array",
                "description": "학력 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "school": {"type": "string", "description": "학교명"},
                        "degree": {"type": ["string", "null"], "description": "학위"},
                        "major": {"type": ["string", "null"], "description": "전공"},
                        "graduation_year": {"type": ["integer", "null"], "description": "졸업 연도"},
                        "is_graduated": {"type": "boolean", "description": "졸업 여부"}
                    },
                    "required": ["school", "is_graduated"],
                    "additionalProperties": False
                }
            },
            "projects": {
                "type": "array",
                "description": "프로젝트 경험 목록",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "프로젝트명"},
                        "role": {"type": ["string", "null"], "description": "역할"},
                        "period": {"type": ["string", "null"], "description": "기간"},
                        "description": {"type": ["string", "null"], "description": "설명"},
                        "technologies": {"type": "array", "items": {"type": "string"}, "description": "사용 기술"}
                    },
                    "required": ["name"],
                    "additionalProperties": False
                }
            },
            "summary": {"type": ["string", "null"], "description": "후보자 요약 (300자 이내)"},
            "strengths": {"type": "array", "description": "강점 목록 (최대 5개)", "items": {"type": "string"}},
            "portfolio_url": {"type": ["string", "null"], "description": "포트폴리오 URL"},
            "github_url": {"type": ["string", "null"], "description": "GitHub URL"},
            "linkedin_url": {"type": ["string", "null"], "description": "LinkedIn URL"}
        },
        "required": ["name", "exp_years", "skills", "careers", "summary", "strengths"],
        "additionalProperties": False
    }
}

RESUME_SCHEMA_PROMPT = """
## 한국 이력서/경력기술서 추출 가이드

### 중요: 한국 이력서의 특성
한국 이력서는 필드 라벨 없이 정보가 나열되는 경우가 많습니다:
- 이름: "이름:" 라벨 없이 "김경민", "홍길동" 처럼 단독으로 표시됨
- 보통 문서 최상단이나 헤더에 이름이 위치
- 이름은 2~4글자의 한글 (성+이름) 또는 영문 이름
- 연락처, 이메일도 라벨 없이 나열되는 경우 많음

### 이름 추출 우선순위
1. 문서 최상단/헤더의 한글 이름 (2~4글자)
2. "성명", "이름", "Name" 라벨 옆의 값
3. 이메일 주소의 @ 앞부분에서 이름 추론
4. 파일명에서 이름 추출 (예: "김경민_이력서.pdf" → "김경민")

### 정보 추론 규칙
- 명시적 라벨이 없어도 문맥에서 정보를 추론하세요
- 전화번호: 010-XXXX-XXXX 패턴
- 이메일: xxx@xxx.xxx 패턴
- 경력: 회사명 + 기간 + 업무내용 조합으로 추론
- 학력: 학교명 + 전공 + 졸업연도 조합으로 추론

다음 JSON 스키마에 맞게 이력서 정보를 추출하세요.
반드시 유효한 JSON만 출력하세요. 코드 블록이나 설명 없이 JSON만 출력합니다.
"""
