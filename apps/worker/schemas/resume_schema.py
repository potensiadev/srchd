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
            # 기본 정보
            "name": {
                "type": ["string", "null"],
                "description": "후보자 이름"
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

            # 경력 정보
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
                        "start_date": {"type": ["string", "null"], "description": "입사일 (YYYY-MM 또는 YYYY)"},
                        "end_date": {"type": ["string", "null"], "description": "퇴사일 (YYYY-MM 또는 YYYY, 재직중이면 null)"},
                        "is_current": {"type": "boolean", "description": "현재 재직 여부"},
                        "description": {"type": ["string", "null"], "description": "업무 내용"}
                    },
                    "required": ["company", "is_current"],
                    "additionalProperties": False
                }
            },

            # 스킬 및 자격
            "skills": {
                "type": "array",
                "description": "기술 스택, 프레임워크, 도구, 자격증 목록",
                "items": {"type": "string"}
            },

            # 학력
            "education_level": {
                "type": ["string", "null"],
                "enum": ["high_school", "associate", "bachelor", "master", "doctor", None],
                "description": "최종 학력"
            },
            "education_school": {
                "type": ["string", "null"],
                "description": "최종 학교명"
            },
            "education_major": {
                "type": ["string", "null"],
                "description": "전공"
            },
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

            # 프로젝트
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
                        "technologies": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "사용 기술"
                        }
                    },
                    "required": ["name"],
                    "additionalProperties": False
                }
            },

            # AI 생성 요약
            "summary": {
                "type": ["string", "null"],
                "description": "후보자 요약 (300자 이내)"
            },
            "strengths": {
                "type": "array",
                "description": "강점 목록 (최대 5개)",
                "items": {"type": "string"}
            },

            # 기타
            "portfolio_url": {
                "type": ["string", "null"],
                "description": "포트폴리오 URL"
            },
            "github_url": {
                "type": ["string", "null"],
                "description": "GitHub URL"
            },
            "linkedin_url": {
                "type": ["string", "null"],
                "description": "LinkedIn URL"
            }
        },
        "required": [
            "name", "exp_years", "skills", "careers", "summary", "strengths"
        ],
        "additionalProperties": False
    }
}


# 간단한 스키마 (Gemini/Claude용 프롬프트 가이드)
RESUME_SCHEMA_PROMPT = """
다음 JSON 스키마에 맞게 이력서 정보를 추출하세요:

{
  "name": "string | null - 후보자 이름",
  "birth_year": "number | null - 출생 연도 (4자리)",
  "gender": "male | female | null",
  "phone": "string | null - 휴대폰 번호",
  "email": "string | null - 이메일",
  "address": "string | null - 주소",
  "location_city": "string | null - 거주 도시",
  "exp_years": "number - 총 경력 연수",
  "last_company": "string | null - 최근 직장명",
  "last_position": "string | null - 최근 직책",
  "careers": [
    {
      "company": "string - 회사명",
      "position": "string | null - 직책",
      "department": "string | null - 부서",
      "start_date": "string | null - 입사일 (YYYY-MM)",
      "end_date": "string | null - 퇴사일",
      "is_current": "boolean - 현재 재직 여부",
      "description": "string | null - 업무 내용"
    }
  ],
  "skills": ["string - 기술/자격증 목록"],
  "education_level": "high_school | associate | bachelor | master | doctor | null",
  "education_school": "string | null - 최종 학교명",
  "education_major": "string | null - 전공",
  "educations": [
    {
      "school": "string - 학교명",
      "degree": "string | null - 학위",
      "major": "string | null - 전공",
      "graduation_year": "number | null",
      "is_graduated": "boolean"
    }
  ],
  "projects": [
    {
      "name": "string - 프로젝트명",
      "role": "string | null",
      "period": "string | null",
      "description": "string | null",
      "technologies": ["string"]
    }
  ],
  "summary": "string | null - 후보자 요약 (300자 이내)",
  "strengths": ["string - 강점 목록 (최대 5개)"],
  "portfolio_url": "string | null",
  "github_url": "string | null",
  "linkedin_url": "string | null"
}

반드시 유효한 JSON만 출력하세요. 코드 블록이나 설명 없이 JSON만 출력합니다.
"""
