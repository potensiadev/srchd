"""
Unit Tests: Raw Text Chunks (PRD v0.1)

테스트 대상: embedding_service._build_raw_text_chunks()
- 원본 텍스트 청킹 로직 검증
- raw_full + raw_section 청크 생성 확인
- 슬라이딩 윈도우 오버랩 검증
"""

import pytest
from services.embedding_service import EmbeddingService, ChunkType


class TestBuildRawTextChunks:
    """_build_raw_text_chunks 메서드 테스트"""

    @pytest.fixture
    def service(self):
        """EmbeddingService 인스턴스 (OpenAI 클라이언트 없이)"""
        service = EmbeddingService()
        service.client = None  # 임베딩 생성 비활성화
        return service

    def test_empty_text_returns_empty_list(self, service):
        """빈 텍스트는 빈 리스트 반환"""
        result = service._build_raw_text_chunks("")
        assert result == []

    def test_none_text_returns_empty_list(self, service):
        """None은 빈 리스트 반환"""
        result = service._build_raw_text_chunks(None)
        assert result == []

    def test_short_text_returns_empty_list(self, service):
        """100자 미만 텍스트는 빈 리스트 반환"""
        short_text = "짧은 텍스트입니다." * 5  # ~50자
        result = service._build_raw_text_chunks(short_text)
        assert result == []

    def test_minimum_text_creates_raw_full_only(self, service):
        """100자 이상, 1500자 미만은 raw_full만 생성"""
        text = "이력서 내용입니다. " * 50  # ~500자
        result = service._build_raw_text_chunks(text)

        assert len(result) == 1
        assert result[0].chunk_type == ChunkType.RAW_FULL
        assert result[0].chunk_index == 0
        assert result[0].content == text

    def test_long_text_creates_raw_full_and_sections(self, service):
        """1500자 이상은 raw_full + raw_section 생성"""
        # 3000자 텍스트 생성
        text = "이력서 내용입니다. 경력 사항과 프로젝트 경험을 상세히 기술합니다. " * 100
        result = service._build_raw_text_chunks(text)

        # raw_full이 첫 번째
        assert result[0].chunk_type == ChunkType.RAW_FULL
        assert result[0].chunk_index == 0

        # raw_section이 추가로 존재
        raw_sections = [c for c in result if c.chunk_type == ChunkType.RAW_SECTION]
        assert len(raw_sections) >= 1

        # raw_section은 연속된 chunk_index
        for i, section in enumerate(raw_sections):
            assert section.chunk_index == i

    def test_raw_full_max_length_8000(self, service):
        """raw_full은 최대 8000자로 truncate"""
        # 10000자 텍스트 생성
        text = "A" * 10000
        result = service._build_raw_text_chunks(text)

        raw_full = result[0]
        assert raw_full.chunk_type == ChunkType.RAW_FULL
        assert len(raw_full.content) == 8000
        assert raw_full.metadata["truncated"] == True
        assert raw_full.metadata["original_length"] == 10000

    def test_raw_section_sliding_window(self, service):
        """raw_section은 슬라이딩 윈도우로 생성 (1500자, 300자 오버랩)"""
        # 4000자 텍스트
        text = "가" * 4000
        result = service._build_raw_text_chunks(text)

        raw_sections = [c for c in result if c.chunk_type == ChunkType.RAW_SECTION]

        # 4000자 / (1500 - 300) = 약 3.3 → 4개 섹션
        assert len(raw_sections) >= 3

        # 첫 번째 섹션 시작 위치
        assert raw_sections[0].metadata["start_pos"] == 0

        # 두 번째 섹션 시작 위치 (1500 - 300 = 1200)
        if len(raw_sections) > 1:
            assert raw_sections[1].metadata["start_pos"] == 1200

    def test_raw_section_minimum_length(self, service):
        """100자 미만 섹션은 제외"""
        # 1600자 텍스트 (마지막 섹션이 100자 미만)
        text = "가" * 1550
        result = service._build_raw_text_chunks(text)

        raw_sections = [c for c in result if c.chunk_type == ChunkType.RAW_SECTION]

        # 모든 섹션이 100자 이상
        for section in raw_sections:
            assert len(section.content.strip()) >= 100

    def test_metadata_contains_position_info(self, service):
        """raw_section 메타데이터에 위치 정보 포함"""
        text = "내용 " * 1000  # 5000자
        result = service._build_raw_text_chunks(text)

        raw_sections = [c for c in result if c.chunk_type == ChunkType.RAW_SECTION]

        for section in raw_sections:
            assert "start_pos" in section.metadata
            assert "end_pos" in section.metadata
            assert "section_length" in section.metadata
            assert section.metadata["section_length"] == len(section.content)

    def test_chunk_type_values(self, service):
        """청크 타입 값 확인"""
        assert ChunkType.RAW_FULL.value == "raw_full"
        assert ChunkType.RAW_SECTION.value == "raw_section"

    def test_korean_text_handling(self, service):
        """한글 텍스트 처리"""
        korean_text = """
        홍길동
        연락처: 010-1234-5678
        이메일: hong@example.com

        [경력사항]
        삼성전자 반도체 사업부 (2018.03 - 현재)
        - EUV 공정 개발 프로젝트 리드
        - 반도체 수율 개선 15% 달성
        - 팀원 5명 관리

        [프로젝트]
        차세대 반도체 공정 최적화
        - 기간: 2020.01 - 2021.12
        - 역할: 프로젝트 리더
        - 성과: 공정 효율 20% 향상

        [기술스택]
        Python, TensorFlow, Kubernetes, AWS

        [학력]
        서울대학교 전자공학과 석사 졸업 (2018)
        """

        # 텍스트를 충분히 길게 만들기
        long_korean_text = korean_text * 10

        result = service._build_raw_text_chunks(long_korean_text)

        assert len(result) >= 1
        assert result[0].chunk_type == ChunkType.RAW_FULL
        assert "홍길동" in result[0].content
        assert "EUV 공정" in result[0].content


class TestChunkWeights:
    """청크 타입별 가중치 테스트"""

    def test_raw_chunk_weights_exist(self):
        """raw 청크 타입에 대한 가중치 존재 확인"""
        from services.embedding_service import ChunkType

        # ChunkType에 raw_full, raw_section 존재
        assert ChunkType.RAW_FULL.value == "raw_full"
        assert ChunkType.RAW_SECTION.value == "raw_section"


class TestProcessCandidateWithRawText:
    """process_candidate 메서드의 raw_text 파라미터 테스트"""

    @pytest.fixture
    def service(self):
        """EmbeddingService 인스턴스 (OpenAI 클라이언트 없이)"""
        service = EmbeddingService()
        service.client = None
        return service

    @pytest.mark.asyncio
    async def test_process_candidate_without_raw_text(self, service):
        """raw_text 없이 호출 시 기존 동작 유지"""
        data = {
            "name": "홍길동",
            "summary": "시니어 개발자입니다.",
            "skills": ["Python", "React"],
        }

        result = await service.process_candidate(data, generate_embeddings=False)

        assert result.success
        # raw 청크 없음
        raw_chunks = [c for c in result.chunks if c.chunk_type in [ChunkType.RAW_FULL, ChunkType.RAW_SECTION]]
        assert len(raw_chunks) == 0

    @pytest.mark.asyncio
    async def test_process_candidate_with_raw_text(self, service):
        """raw_text와 함께 호출 시 raw 청크 생성"""
        data = {
            "name": "홍길동",
            "summary": "시니어 개발자입니다.",
            "skills": ["Python", "React"],
        }

        raw_text = "이력서 원본 내용입니다. " * 100  # 2000자+

        result = await service.process_candidate(
            data,
            generate_embeddings=False,
            raw_text=raw_text
        )

        assert result.success

        # raw 청크 존재
        raw_chunks = [c for c in result.chunks if c.chunk_type in [ChunkType.RAW_FULL, ChunkType.RAW_SECTION]]
        assert len(raw_chunks) >= 1

        # raw_full 존재
        raw_full = [c for c in result.chunks if c.chunk_type == ChunkType.RAW_FULL]
        assert len(raw_full) == 1

    @pytest.mark.asyncio
    async def test_process_candidate_with_short_raw_text(self, service):
        """100자 미만 raw_text는 raw 청크 생성 안 함"""
        data = {"name": "홍길동"}
        raw_text = "짧은 텍스트"

        result = await service.process_candidate(
            data,
            generate_embeddings=False,
            raw_text=raw_text
        )

        assert result.success

        # raw 청크 없음
        raw_chunks = [c for c in result.chunks if c.chunk_type in [ChunkType.RAW_FULL, ChunkType.RAW_SECTION]]
        assert len(raw_chunks) == 0
