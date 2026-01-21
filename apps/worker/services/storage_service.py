"""
Storage Service - Supabase 클라이언트 싱글톤

PRD: Epic 1 (FR-1.2)
- 매 호출마다 create_client() 대신 싱글톤 재사용
- 연결 실패 시 클라이언트 재생성 fallback
"""

import logging
from typing import Optional
from functools import lru_cache

from supabase import create_client, Client

from config import get_settings

logger = logging.getLogger(__name__)

# 싱글톤 클라이언트 (모듈 레벨)
_supabase_client: Optional[Client] = None


def get_supabase_client(force_new: bool = False) -> Client:
    """
    Supabase 클라이언트 싱글톤 반환
    
    Args:
        force_new: True면 기존 클라이언트 무시하고 새로 생성
        
    Returns:
        Supabase Client 인스턴스
    """
    global _supabase_client
    
    if force_new or _supabase_client is None:
        settings = get_settings()
        
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        logger.info("[StorageService] Supabase client initialized")
    
    return _supabase_client


def reset_supabase_client():
    """
    클라이언트 초기화 (연결 실패 시 재생성용)
    """
    global _supabase_client
    _supabase_client = None
    logger.info("[StorageService] Supabase client reset")


def download_from_storage(file_path: str, bucket: str = "resumes") -> bytes:
    """
    Storage에서 파일 다운로드 (싱글톤 클라이언트 사용)
    
    Args:
        file_path: 파일 경로
        bucket: 버킷명 (기본: resumes)
        
    Returns:
        파일 바이트
        
    Raises:
        Exception: 다운로드 실패 시
    """
    client = get_supabase_client()
    
    try:
        response = client.storage.from_(bucket).download(file_path)
        return response
    except Exception as e:
        # 연결 문제일 수 있으므로 클라이언트 리셋 후 재시도
        logger.warning(f"[StorageService] Download failed, resetting client: {e}")
        reset_supabase_client()
        
        # 한 번 더 시도
        client = get_supabase_client()
        return client.storage.from_(bucket).download(file_path)
