"""
Career Extractor - 경력 정보 추출

careers, exp_years, current_company, current_position 추출

개선 사항 (2026-02-15):
- 섹션 기반 텍스트 선택: 경력 관련 섹션 우선 추출
- 긴 문서 지원: max_text_length 12000자로 확대
- 경력 통합: 같은 회사의 여러 프로젝트를 하나의 경력으로 병합
"""

import logging
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from .base_extractor import BaseExtractor, ExtractionResult
from context.rule_validator import RuleValidator

logger = logging.getLogger(__name__)

# 경력 관련 섹션 키워드 (한국어 이력서)
CAREER_SECTION_KEYWORDS = [
    "경력사항", "경력 사항",
    "경력", "Career", "Work Experience",
    "직장 경력", "업무 경력",
    "재직 이력", "근무 이력",
]


class CareerExtractor(BaseExtractor):
    """
    경력 정보 추출기

    추출 필드:
    - exp_years: 총 경력 연수
    - current_company: 현재 재직 회사
    - current_position: 현재 직책
    - careers[]: 경력 목록
    """

    EXTRACTOR_TYPE = "career"

    def __init__(self):
        super().__init__()
        self.rule_validator = RuleValidator()

    def _postprocess(
        self,
        data: Dict[str, Any],
        confidence_map: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        경력 데이터 후처리

        - 날짜 형식 정규화
        - 회사명 정규화
        - 회사별 경력 통합 (경력기술서 대응)
        - 경력 연수 계산/검증
        - 현재 재직 회사 추출
        - last_company/last_position 파생 (DB 스키마 호환)
        """
        processed = self._remove_evidence_fields(data)

        # careers 정규화
        if "careers" in processed and isinstance(processed["careers"], list):
            normalized_careers, warnings = self.rule_validator.validate_careers(
                processed["careers"]
            )
            processed["careers"] = normalized_careers
            for warning in warnings:
                logger.debug(f"[CareerExtractor] {warning}")

            # 회사별 경력 통합 (경력기술서에서 프로젝트 단위로 분리된 경력 처리)
            consolidated_careers = self._consolidate_careers_by_company(normalized_careers)
            logger.info(
                f"[CareerExtractor] 경력 통합: {len(normalized_careers)}개 → {len(consolidated_careers)}개"
            )

            # 최신순 정렬
            processed["careers"] = self._sort_careers_by_date(consolidated_careers)

            # 현재 재직 회사 추출
            current = self._extract_current_career(processed["careers"])
            if current:
                company = current.get("company")
                position = current.get("position")

                if "current_company" not in processed:
                    processed["current_company"] = company
                if "current_position" not in processed:
                    processed["current_position"] = position
                # last_company/last_position도 함께 설정 (DB 스키마 호환)
                processed["last_company"] = company
                processed["last_position"] = position

            # 경력 연수 계산/검증 (통합된 careers 사용)
            calculated_exp = self._calculate_exp_years(processed["careers"])
            if "exp_years" in processed:
                llm_exp = processed["exp_years"]
                if abs(llm_exp - calculated_exp) > 2:
                    logger.warning(
                        f"[CareerExtractor] 경력 연수 불일치: "
                        f"LLM={llm_exp}, 계산={calculated_exp}"
                    )
                    # 계산값 우선 (더 정확)
                    processed["exp_years"] = calculated_exp
            else:
                processed["exp_years"] = calculated_exp

        # exp_years 검증
        if "exp_years" in processed:
            result = self.rule_validator.validate_and_normalize("exp_years", processed["exp_years"])
            processed["exp_years"] = result.normalized_value

        # current_company 검증 및 last_company 동기화
        if "current_company" in processed:
            result = self.rule_validator.validate_and_normalize("company", processed["current_company"])
            processed["current_company"] = result.normalized_value
            # last_company도 동일하게 정규화
            processed["last_company"] = result.normalized_value

        # current_position과 last_position 동기화
        if "current_position" in processed and processed["current_position"]:
            processed["last_position"] = processed["current_position"]

        return processed

    def _consolidate_careers_by_company(
        self,
        careers: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        같은 회사의 여러 경력을 하나로 통합

        경력기술서에서 같은 회사의 여러 프로젝트가 개별 경력으로 추출되는 경우 처리
        - 같은 회사명이면 하나의 경력으로 통합
        - start_date: 가장 빠른 시작일
        - end_date: 가장 늦은 종료일 (현재 재직 중이면 None)
        - is_current: 하나라도 현재 재직 중이면 True
        - description: 모든 프로젝트 설명 통합
        """
        if not careers:
            return []

        # 회사별 그룹화
        company_groups: Dict[str, List[Dict[str, Any]]] = {}
        for career in careers:
            company = career.get("company", "").strip()
            if not company:
                continue

            # 회사명 정규화 (소문자 변환 + 공백 제거로 키 생성)
            company_key = self._normalize_company_key(company)

            if company_key not in company_groups:
                company_groups[company_key] = []
            company_groups[company_key].append(career)

        # 회사별 통합
        consolidated = []
        for company_key, group in company_groups.items():
            if len(group) == 1:
                # 단일 경력이면 그대로 사용
                consolidated.append(group[0])
            else:
                # 여러 경력 통합
                merged = self._merge_career_group(group)
                consolidated.append(merged)

        return consolidated

    def _normalize_company_key(self, company: str) -> str:
        """회사명 정규화하여 비교용 키 생성"""
        # 소문자 변환
        key = company.lower()
        # 공백, 괄호 등 제거
        key = re.sub(r'[\s\(\)\[\]㈜주식회사(주)]+', '', key)
        # 한국어/영어 접미사 제거
        key = re.sub(r'(corporation|corp|inc|ltd|llc|주식회사|㈜|co\.)$', '', key)
        return key.strip()

    def _merge_career_group(self, careers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """같은 회사의 여러 경력을 하나로 병합"""
        # 가장 최근 경력을 기준으로 사용
        sorted_careers = self._sort_careers_by_date(careers)
        base = sorted_careers[0].copy()

        # 모든 기간 수집
        all_starts = []
        all_ends = []
        has_current = False
        all_descriptions = []

        for career in careers:
            start = career.get("start_date")
            end = career.get("end_date")

            if start:
                all_starts.append(start)
            if end:
                all_ends.append(end)
            if career.get("is_current"):
                has_current = True

            # 프로젝트 설명 수집
            desc = career.get("description", "")
            if desc and desc not in all_descriptions:
                all_descriptions.append(desc)

        # 가장 빠른 시작일
        if all_starts:
            base["start_date"] = min(all_starts)

        # 가장 늦은 종료일 (현재 재직 중이면 None)
        if has_current:
            base["end_date"] = None
            base["is_current"] = True
        elif all_ends:
            base["end_date"] = max(all_ends)
            base["is_current"] = False

        # description 통합 (선택적)
        if len(all_descriptions) > 1:
            base["description"] = " | ".join(all_descriptions[:3])  # 최대 3개만

        # 통합된 프로젝트 수 기록
        base["_merged_count"] = len(careers)

        logger.debug(
            f"[CareerExtractor] 경력 병합: {base.get('company')} - "
            f"{len(careers)}개 프로젝트 → 1개 경력 "
            f"({base.get('start_date')} ~ {base.get('end_date') or '현재'})"
        )

        return base

    def _sort_careers_by_date(self, careers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """경력을 최신순으로 정렬"""
        def get_sort_key(career: Dict[str, Any]) -> str:
            # is_current가 True면 가장 최신
            if career.get("is_current"):
                return "9999-99"
            # end_date가 있으면 그것으로, 없으면 start_date
            end_date = career.get("end_date") or career.get("start_date") or "0000-00"
            return end_date

        return sorted(careers, key=get_sort_key, reverse=True)

    def _extract_current_career(self, careers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """현재 재직 중인 경력 추출"""
        for career in careers:
            if career.get("is_current"):
                return career

        # is_current가 없으면 end_date가 없는 것 찾기
        for career in careers:
            if career.get("end_date") is None and career.get("start_date"):
                return career

        # 가장 최근 경력 반환
        if careers:
            return careers[0]

        return None

    def _calculate_exp_years(self, careers: List[Dict[str, Any]]) -> float:
        """
        경력 목록에서 총 경력 연수 계산

        - 겹치는 기간은 한 번만 계산
        - 현재 재직 중이면 오늘까지 계산
        """
        if not careers:
            return 0.0

        # 기간 목록 수집
        periods: List[Tuple[str, str]] = []
        today = datetime.now().strftime("%Y-%m")

        for career in careers:
            start = career.get("start_date")
            if not start:
                continue

            end = career.get("end_date")
            if not end or career.get("is_current"):
                end = today

            periods.append((start, end))

        if not periods:
            return 0.0

        # 기간 병합 (겹치는 기간 처리)
        merged_periods = self._merge_periods(periods)

        # 총 개월 수 계산
        total_months = 0
        for start, end in merged_periods:
            months = self._calculate_months(start, end)
            total_months += months

        # 연수로 변환 (소수점 첫째자리)
        return round(total_months / 12, 1)

    def _merge_periods(
        self,
        periods: List[Tuple[str, str]]
    ) -> List[Tuple[str, str]]:
        """겹치는 기간 병합"""
        if not periods:
            return []

        # 시작일 기준 정렬
        sorted_periods = sorted(periods, key=lambda x: x[0])
        merged = [sorted_periods[0]]

        for start, end in sorted_periods[1:]:
            last_start, last_end = merged[-1]

            # 겹치거나 연속되면 병합
            if start <= last_end:
                merged[-1] = (last_start, max(last_end, end))
            else:
                merged.append((start, end))

        return merged

    def _calculate_months(self, start: str, end: str) -> int:
        """두 날짜 사이의 개월 수 계산"""
        try:
            start_parts = start.split("-")
            end_parts = end.split("-")

            start_year = int(start_parts[0])
            start_month = int(start_parts[1]) if len(start_parts) > 1 else 1

            end_year = int(end_parts[0])
            end_month = int(end_parts[1]) if len(end_parts) > 1 else 12

            months = (end_year - start_year) * 12 + (end_month - start_month) + 1
            return max(0, months)

        except (ValueError, IndexError):
            return 0

    def _preprocess_text(self, text: str) -> str:
        """
        경력 추출용 텍스트 전처리 (오버라이드)

        전략:
        1. 경력 관련 섹션 우선 포함
        2. 문서 앞부분(인적사항) + 경력 섹션 결합
        3. 모든 경력 정보를 최대한 포함
        """
        if not text:
            return ""

        text_length = len(text)

        # 짧은 문서는 그대로 반환
        if text_length <= self.max_text_length:
            return text.strip()

        logger.info(f"[CareerExtractor] 긴 문서 감지: {text_length}자, 섹션 기반 추출 시작")

        # 경력 섹션 시작점 찾기
        section_start = self._find_career_section_start(text)

        if section_start is not None and section_start > 0:
            # 앞부분 (인적사항 등) 보존 - 경력 요약이 앞에 있을 수 있음
            prefix_length = min(3000, section_start)
            prefix = text[:prefix_length]

            # 경력 섹션부터 추출
            career_section = text[section_start:]

            # 병합
            combined = prefix + "\n\n" + career_section

            if len(combined) <= self.max_text_length:
                logger.info(
                    f"[CareerExtractor] 섹션 기반 추출 완료: "
                    f"prefix={prefix_length}자, section={len(career_section)}자"
                )
                return combined.strip()
            else:
                # 경력 섹션이 너무 긴 경우
                available = self.max_text_length - prefix_length - 50
                truncated = prefix + "\n\n" + career_section[:available]
                logger.info(
                    f"[CareerExtractor] 섹션 기반 추출 (일부 잘림): "
                    f"prefix={prefix_length}자, section={available}자"
                )
                return truncated.strip()

        # 섹션을 찾지 못한 경우 기본 동작
        logger.warning(f"[CareerExtractor] 경력 섹션 미발견, 앞에서 {self.max_text_length}자 사용")
        return text[:self.max_text_length].strip()

    def _find_career_section_start(self, text: str) -> Optional[int]:
        """경력 관련 섹션의 시작 위치 찾기"""
        earliest_position = None

        for keyword in CAREER_SECTION_KEYWORDS:
            idx = text.lower().find(keyword.lower())
            if idx != -1:
                # 문서 시작 부분에서 찾으면 사용
                if earliest_position is None or idx < earliest_position:
                    earliest_position = idx

        return earliest_position

    def _build_user_prompt(
        self,
        text: str,
        filename: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """경력 추출용 사용자 프롬프트"""
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

IMPORTANT INSTRUCTIONS:
1. Extract ALL career entries, not just the most recent ones
2. For each career entry, include:
   - company: Company name (exact as written)
   - position: Job title/position
   - department: Department (if available)
   - start_date: Start date in YYYY-MM format
   - end_date: End date in YYYY-MM format (null if current)
   - is_current: true if currently employed there
   - description: 담당 업무 상세 내용 (주요 역할, 성과, 기술 스택 포함)
3. Include evidence fields (*_evidence) with original text excerpts from the RESUME TEXT ONLY
   - CRITICAL: Evidence MUST come from the resume text body, NOT from the filename
   - Do NOT use filename patterns like "[NAME]_Product Manager_경력기술서" as evidence
   - Evidence should be actual sentences or phrases from the document content
4. Calculate exp_years as total years of experience
5. If this is a "경력기술서" (career description), consolidate multiple projects at the same company into one career entry""")

        return "\n\n".join(prompt_parts)


# 싱글톤 인스턴스
_instance: Optional[CareerExtractor] = None


def get_career_extractor() -> CareerExtractor:
    """CareerExtractor 인스턴스 반환"""
    global _instance
    if _instance is None:
        _instance = CareerExtractor()
    return _instance
