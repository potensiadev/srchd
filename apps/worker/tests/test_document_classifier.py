"""
DocumentClassifier 단위 테스트
"""

import pytest
from agents.document_classifier import DocumentClassifier
from schemas.phase1_types import DocumentKind, NonResumeType


class TestDocumentClassifierRuleBased:
    """Rule-based 분류 테스트"""

    @pytest.fixture
    def classifier(self):
        return DocumentClassifier(llm_manager=None)

    def test_standard_korean_resume(self, classifier):
        """표준 한글 이력서 분류"""
        text = """
        이 력 서

        성명: 홍길동
        연락처: 010-1234-5678
        이메일: hong@example.com

        경력사항
        - (주)테스트회사 / 개발팀장 / 2020.01 ~ 현재
        - (주)이전회사 / 시니어 개발자 / 2017.03 ~ 2019.12

        학력
        - 서울대학교 컴퓨터공학과 졸업 (2017)

        보유기술
        - Python, TypeScript, PostgreSQL
        """
        result = classifier._classify_by_rules(text, "홍길동_이력서.pdf")

        assert result.document_kind == DocumentKind.RESUME
        assert result.confidence >= 0.7
        assert len(result.signals) >= 5
        assert result.llm_used is False

    def test_english_resume(self, classifier):
        """영문 이력서 분류"""
        text = """
        RESUME

        John Doe
        Email: john.doe@example.com
        Phone: 010-9876-5432

        WORK EXPERIENCE
        Senior Developer at Tech Corp (2020 - Present)
        - Led development of microservices architecture

        EDUCATION
        BS in Computer Science, Seoul National University

        SKILLS
        Python, JavaScript, AWS, Docker
        """
        result = classifier._classify_by_rules(text, "john_doe_resume.pdf")

        assert result.document_kind == DocumentKind.RESUME
        assert result.confidence >= 0.7
        assert "resume_en:resume" in result.signals or "filename:resume" in result.signals

    def test_job_description(self, classifier):
        """채용공고 분류"""
        text = """
        [채용공고]

        (주)테크회사에서 시니어 개발자를 모집합니다.

        지원자격
        - 경력 5년 이상
        - Python, TypeScript 능숙자

        우대사항
        - 대규모 트래픽 경험
        - 리더십 경험

        근무조건
        - 서울 강남구
        - 연봉 협의
        """
        result = classifier._classify_by_rules(text, "시니어개발자_채용공고.pdf")

        assert result.document_kind == DocumentKind.NON_RESUME
        assert result.non_resume_type == NonResumeType.JOB_DESCRIPTION
        assert result.confidence >= 0.6

    def test_certificate(self, classifier):
        """자격증/수료증 분류 - UNCERTAIN (LLM fallback 필요)"""
        text = """
        수 료 증

        홍길동 귀하

        위 사람은 본 교육과정을 성실히 이수하였기에
        이 증서를 수여합니다.

        교육명: AWS Solutions Architect
        수료일: 2024년 1월 15일

        한국IT교육원장
        """
        result = classifier._classify_by_rules(text, "AWS_수료증.pdf")

        # 자격증/수료증은 이력서 신호가 부족하여 UNCERTAIN으로 분류됨
        # LLM fallback에서 최종 분류
        assert result.document_kind in [DocumentKind.UNCERTAIN, DocumentKind.NON_RESUME]

    def test_company_profile(self, classifier):
        """회사소개서 분류"""
        text = """
        회사소개

        About Us

        (주)테크컴퍼니는 2010년 설립된 IT 기업입니다.

        사업영역
        - 클라우드 솔루션
        - AI/ML 서비스

        비전
        기술로 세상을 바꾸는 회사

        Our Services
        - Cloud Migration
        - Data Analytics
        """
        result = classifier._classify_by_rules(text, "회사소개서_2024.pdf")

        assert result.document_kind == DocumentKind.NON_RESUME
        assert result.non_resume_type == NonResumeType.COMPANY_PROFILE

    def test_ambiguous_document(self, classifier):
        """모호한 문서 분류"""
        text = """
        프로젝트 보고서

        1. 개요
        본 프로젝트는 ...

        2. 기술 스택
        Python, React, PostgreSQL

        3. 결과
        성공적으로 완료됨
        """
        result = classifier._classify_by_rules(text, "project_report.pdf")

        # 모호한 문서는 UNCERTAIN 또는 낮은 confidence
        assert result.confidence < 0.7 or result.document_kind == DocumentKind.UNCERTAIN

    def test_minimal_resume(self, classifier):
        """최소 정보만 있는 이력서"""
        text = """
        김철수
        010-1111-2222
        kim@email.com

        경력: 개발자 3년
        """
        result = classifier._classify_by_rules(text, "김철수.pdf")

        # 연락처 패턴이 있으므로 이력서로 판단될 가능성 높음
        assert result.document_kind in [DocumentKind.RESUME, DocumentKind.UNCERTAIN]

    def test_filename_hint_resume(self, classifier):
        """파일명에 이력서 힌트가 있는 경우"""
        text = "간단한 텍스트"
        result = classifier._classify_by_rules(text, "홍길동_이력서_2024.pdf")

        # 파일명 힌트로 점수 증가
        assert "filename:이력서" in result.signals

    def test_filename_hint_jd(self, classifier):
        """파일명에 채용공고 힌트가 있는 경우"""
        text = "간단한 텍스트"
        result = classifier._classify_by_rules(text, "시니어개발자_JD.pdf")

        # 파일명 힌트로 점수 감소
        assert any("filename_non_resume" in s for s in result.signals)


class TestDocumentClassifierIntegration:
    """통합 테스트 (LLM 없이)"""

    @pytest.fixture
    def classifier(self):
        return DocumentClassifier(llm_manager=None)

    @pytest.mark.asyncio
    async def test_classify_resume_async(self, classifier):
        """비동기 분류 테스트 (이력서)"""
        text = """
        이력서
        홍길동
        010-1234-5678
        hong@example.com

        경력: 5년
        학력: 서울대학교
        기술: Python, JavaScript
        """
        result = await classifier.classify(
            text=text,
            filename="홍길동_이력서.pdf",
            confidence_threshold=0.7
        )

        assert result.document_kind == DocumentKind.RESUME
        assert result.processing_time_ms >= 0

    @pytest.mark.asyncio
    async def test_classify_non_resume_async(self, classifier):
        """비동기 분류 테스트 (비이력서)"""
        text = """
        [채용공고] 개발자 모집

        지원자격: 경력 3년 이상
        우대사항: AWS 경험
        """
        result = await classifier.classify(
            text=text,
            filename="채용공고.pdf",
            confidence_threshold=0.7
        )

        assert result.document_kind == DocumentKind.NON_RESUME

    @pytest.mark.asyncio
    async def test_classify_uncertain_without_llm(self, classifier):
        """LLM 없이 불확실한 문서 분류"""
        text = "모호한 내용만 있는 문서입니다."
        result = await classifier.classify(
            text=text,
            filename="unknown.pdf",
            confidence_threshold=0.9  # 높은 임계값
        )

        # LLM 없으면 UNCERTAIN으로 처리
        assert result.document_kind == DocumentKind.UNCERTAIN
        assert result.llm_used is False
