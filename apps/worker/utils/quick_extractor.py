"""
Quick Extractor - 정규식 기반 빠른 기본 정보 추출 (AI 없이)

Progressive Data Loading Phase 1에서 사용
파싱 완료 직후 1초 이내에 기본 정보를 추출하여 UI에 표시
"""

import re
from typing import Optional, TypedDict


class QuickExtractResult(TypedDict):
    """빠른 추출 결과 타입"""
    name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    last_company: Optional[str]
    last_position: Optional[str]


def extract_quick_info(text: str) -> QuickExtractResult:
    """
    정규식 기반 빠른 기본 정보 추출 (AI 없이)

    Args:
        text: 파싱된 이력서 텍스트

    Returns:
        QuickExtractResult: 추출된 기본 정보
            - name: 이름 (한글 2-4자)
            - phone: 전화번호 (010-XXXX-XXXX 형식)
            - email: 이메일 주소
            - last_company: 최근 회사명
            - last_position: 최근 직책
    """
    result: QuickExtractResult = {
        "name": None,
        "phone": None,
        "email": None,
        "last_company": None,
        "last_position": None,
    }

    if not text or not text.strip():
        return result

    # 텍스트 정규화 (연속 공백 제거)
    normalized_text = re.sub(r'\s+', ' ', text)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. 이름 추출
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    name_patterns = [
        # "이름: 홍길동" 또는 "이름 : 홍길동"
        r'이름\s*[:：]\s*([가-힣]{2,4})',
        # "성명: 홍길동"
        r'성명\s*[:：]\s*([가-힣]{2,4})',
        # "성 명 : 홍길동" (띄어쓰기 포함)
        r'성\s*명\s*[:：]\s*([가-힣]{2,4})',
        # "Name: 홍길동"
        r'[Nn]ame\s*[:：]\s*([가-힣]{2,4})',
        # 문서 시작 부분의 한글 이름 (첫 줄)
        r'^([가-힣]{2,4})\s*$',
        # "홍길동 이력서" 패턴
        r'^([가-힣]{2,4})\s*이력서',
        # 줄 시작에 홀로 있는 한글 이름
        r'(?:^|\n)\s*([가-힣]{2,4})\s*(?:\n|$)',
    ]

    for pattern in name_patterns:
        match = re.search(pattern, text, re.MULTILINE)
        if match:
            candidate_name = match.group(1).strip()
            # 일반적인 단어 제외 (이력서, 경력서 등)
            excluded_words = {'이력서', '경력서', '자기소개', '소개서', '지원서', '포트폴리오'}
            if candidate_name not in excluded_words and len(candidate_name) >= 2:
                result["name"] = candidate_name
                break

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. 전화번호 추출
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    phone_patterns = [
        # 010-1234-5678 형식
        r'(01[0-9])[-.\s]?(\d{3,4})[-.\s]?(\d{4})',
        # 010.1234.5678 형식
        r'(01[0-9])[.](\d{3,4})[.](\d{4})',
        # 01012345678 형식 (붙여쓰기)
        r'(01[0-9])(\d{3,4})(\d{4})',
    ]

    for pattern in phone_patterns:
        match = re.search(pattern, normalized_text)
        if match:
            # 표준 형식으로 정규화
            result["phone"] = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
            break

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3. 이메일 추출
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_match = re.search(email_pattern, text)
    if email_match:
        result["email"] = email_match.group().lower()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 4. 최근 회사 추출
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    company_patterns = [
        # "현재 삼성전자" 또는 "재직 중 LG전자"
        r'(?:현재|재직\s*중?|근무\s*중?)\s*[:\-]?\s*([가-힣A-Za-z0-9]+(?:주식회사|㈜|\(주\)|전자|그룹|코리아|테크|소프트)?)',
        # "주식회사 OOO" 또는 "㈜OOO"
        r'(?:주식회사|㈜)\s*([가-힣A-Za-z0-9]+)',
        # "OOO(주)" 또는 "OOO 주식회사"
        r'([가-힣A-Za-z0-9]+)\s*(?:\(주\)|주식회사)',
        # "OOO 입사" 패턴
        r'([가-힣A-Za-z0-9]{2,}(?:전자|그룹|은행|증권|보험|카드)?)\s*입사',
        # 경력 섹션에서 회사명 추출
        r'(?:경력|경험|이력)\s*[:\-]?\s*\n?\s*([가-힣A-Za-z0-9]+(?:전자|그룹|테크|소프트|코리아)?)',
    ]

    for pattern in company_patterns:
        match = re.search(pattern, normalized_text)
        if match:
            company = match.group(1).strip()
            # 너무 짧거나 일반적인 단어 제외
            excluded_companies = {'회사', '기업', '경력', '경험', '이력', '재직', '근무', '현재'}
            if len(company) >= 2 and company not in excluded_companies:
                result["last_company"] = company
                break

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 5. 최근 직책 추출
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    position_patterns = [
        # "직책: 과장" 또는 "직급: 선임"
        r'(?:직책|직급|포지션)\s*[:：]\s*([가-힣A-Za-z]+(?:개발자|엔지니어|디자이너|매니저|과장|대리|사원|팀장|부장|이사)?)',
        # "시니어 개발자" 또는 "Senior Developer"
        r'((?:시니어|주니어|수석|선임|책임)\s*(?:개발자|엔지니어|디자이너|기획자|매니저))',
        r'([Ss]enior|[Jj]unior|[Ll]ead)\s*(?:[A-Za-z]+\s*)?(?:[Dd]eveloper|[Ee]ngineer|[Dd]esigner|[Mm]anager)',
        # 직급 키워드
        r'((?:팀장|파트장|과장|대리|사원|주임|선임|책임|수석|부장|이사|상무|전무|CEO|CTO|VP))',
        # "백엔드 개발자" 등
        r'((?:백엔드|프론트엔드|풀스택|모바일|웹|앱|데이터|ML|AI)\s*(?:개발자|엔지니어))',
    ]

    for pattern in position_patterns:
        match = re.search(pattern, normalized_text, re.IGNORECASE)
        if match:
            position = match.group(1).strip()
            if len(position) >= 2:
                result["last_position"] = position
                break

    return result


def mask_phone(phone: str) -> str:
    """
    전화번호 마스킹 (010-****-5678)

    Args:
        phone: 원본 전화번호

    Returns:
        마스킹된 전화번호
    """
    if not phone:
        return ""

    # 숫자만 추출
    digits = re.sub(r'\D', '', phone)
    if len(digits) < 10:
        return phone

    # 010-****-5678 형식으로 마스킹
    return f"{digits[:3]}-****-{digits[-4:]}"


def mask_email(email: str) -> str:
    """
    이메일 마스킹 (ho***@gmail.com)

    Args:
        email: 원본 이메일

    Returns:
        마스킹된 이메일
    """
    if not email or '@' not in email:
        return ""

    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '*'
    else:
        masked_local = local[:2] + '*' * (len(local) - 2)

    return f"{masked_local}@{domain}"
