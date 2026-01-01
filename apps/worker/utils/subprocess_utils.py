"""
Subprocess 유틸리티 - 타임아웃 및 프로세스 관리

LibreOffice, antiword 등 외부 프로세스 실행 시
안전한 타임아웃 처리 및 좀비 프로세스 방지
"""

import os
import sys
import signal
import subprocess
import logging
from typing import List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# 기본 타임아웃 설정
DEFAULT_TIMEOUT = 60  # 60초
LIBREOFFICE_TIMEOUT = 120  # LibreOffice는 더 오래 걸릴 수 있음
KILL_GRACE_PERIOD = 5  # SIGTERM 후 SIGKILL까지 대기


@dataclass
class SubprocessResult:
    """서브프로세스 실행 결과"""
    success: bool
    stdout: str
    stderr: str
    return_code: Optional[int]
    timed_out: bool
    error_message: Optional[str] = None


def run_with_timeout(
    cmd: List[str],
    timeout: int = DEFAULT_TIMEOUT,
    cwd: Optional[str] = None,
    env: Optional[dict] = None,
    retry_count: int = 0,
) -> SubprocessResult:
    """
    타임아웃과 안전한 프로세스 종료를 지원하는 서브프로세스 실행

    Args:
        cmd: 실행할 명령어 리스트
        timeout: 타임아웃 (초)
        cwd: 작업 디렉토리
        env: 환경 변수
        retry_count: 실패 시 재시도 횟수

    Returns:
        SubprocessResult
    """
    attempt = 0
    last_error = None

    while attempt <= retry_count:
        if attempt > 0:
            logger.info(f"Retrying command (attempt {attempt + 1}/{retry_count + 1}): {cmd[0]}")

        try:
            result = _run_single_attempt(cmd, timeout, cwd, env)
            if result.success:
                return result
            last_error = result.error_message

        except Exception as e:
            last_error = str(e)
            logger.warning(f"Subprocess attempt {attempt + 1} failed: {e}")

        attempt += 1

    return SubprocessResult(
        success=False,
        stdout="",
        stderr="",
        return_code=None,
        timed_out=False,
        error_message=last_error or "All retry attempts failed"
    )


def _run_single_attempt(
    cmd: List[str],
    timeout: int,
    cwd: Optional[str],
    env: Optional[dict],
) -> SubprocessResult:
    """단일 실행 시도"""
    process = None

    try:
        # Windows vs Unix 처리
        if sys.platform == 'win32':
            # Windows: CREATE_NEW_PROCESS_GROUP
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                env=env,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
            )
        else:
            # Unix: start_new_session=True (새 프로세스 그룹)
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                env=env,
                start_new_session=True
            )

        stdout, stderr = process.communicate(timeout=timeout)

        return SubprocessResult(
            success=process.returncode == 0,
            stdout=stdout.decode('utf-8', errors='replace'),
            stderr=stderr.decode('utf-8', errors='replace'),
            return_code=process.returncode,
            timed_out=False,
            error_message=None if process.returncode == 0 else f"Process exited with code {process.returncode}"
        )

    except subprocess.TimeoutExpired:
        logger.warning(f"Process timed out after {timeout}s: {cmd[0]}")
        _kill_process_tree(process)

        return SubprocessResult(
            success=False,
            stdout="",
            stderr="",
            return_code=None,
            timed_out=True,
            error_message=f"Process timed out after {timeout} seconds"
        )

    except FileNotFoundError:
        return SubprocessResult(
            success=False,
            stdout="",
            stderr="",
            return_code=None,
            timed_out=False,
            error_message=f"Command not found: {cmd[0]}"
        )

    except Exception as e:
        if process:
            _kill_process_tree(process)

        return SubprocessResult(
            success=False,
            stdout="",
            stderr="",
            return_code=None,
            timed_out=False,
            error_message=str(e)
        )


def _kill_process_tree(process: subprocess.Popen) -> None:
    """
    프로세스와 모든 자식 프로세스 종료

    LibreOffice는 여러 자식 프로세스를 생성하므로 전체 트리 종료 필요
    """
    if process is None:
        return

    pid = process.pid

    try:
        if sys.platform == 'win32':
            # Windows: taskkill /T (트리 전체 종료)
            subprocess.run(
                ['taskkill', '/F', '/T', '/PID', str(pid)],
                capture_output=True,
                timeout=KILL_GRACE_PERIOD
            )
        else:
            # Unix: 프로세스 그룹 전체에 SIGTERM
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGTERM)
            except (ProcessLookupError, OSError):
                # 프로세스가 이미 종료됨
                pass

            # 종료 대기
            try:
                process.wait(timeout=KILL_GRACE_PERIOD)
            except subprocess.TimeoutExpired:
                # SIGKILL 전송
                try:
                    os.killpg(pgid, signal.SIGKILL)
                except (ProcessLookupError, OSError):
                    pass

        logger.debug(f"Killed process tree for PID {pid}")

    except Exception as e:
        logger.warning(f"Failed to kill process tree (PID {pid}): {e}")

    # 최종 정리
    try:
        process.kill()
        process.wait(timeout=1)
    except Exception:
        pass


def run_libreoffice_convert(
    input_path: str,
    output_dir: str,
    output_format: str = "pdf",
    timeout: int = LIBREOFFICE_TIMEOUT,
) -> SubprocessResult:
    """
    LibreOffice 변환 실행 (강화된 타임아웃)

    Args:
        input_path: 입력 파일 경로
        output_dir: 출력 디렉토리
        output_format: 출력 형식 (pdf, docx 등)
        timeout: 타임아웃 (초)

    Returns:
        SubprocessResult
    """
    # soffice 경로 탐지
    soffice_cmd = _find_soffice()
    if not soffice_cmd:
        return SubprocessResult(
            success=False,
            stdout="",
            stderr="",
            return_code=None,
            timed_out=False,
            error_message="LibreOffice not installed (soffice not found)"
        )

    cmd = [
        soffice_cmd,
        '--headless',
        '--norestore',
        '--nofirststartwizard',
        '--convert-to', output_format,
        '--outdir', output_dir,
        input_path
    ]

    # LibreOffice는 환경 변수로 프로필 충돌 방지
    env = os.environ.copy()
    env['HOME'] = output_dir  # 임시 프로필 디렉토리
    if sys.platform != 'win32':
        env['TMPDIR'] = output_dir

    return run_with_timeout(cmd, timeout=timeout, env=env, retry_count=1)


def _find_soffice() -> Optional[str]:
    """시스템에서 soffice 실행 파일 찾기"""
    if sys.platform == 'win32':
        # Windows 일반 설치 경로
        candidates = [
            r'C:\Program Files\LibreOffice\program\soffice.exe',
            r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
        ]
        for path in candidates:
            if os.path.exists(path):
                return path

        # PATH에서 찾기
        try:
            result = subprocess.run(
                ['where', 'soffice'],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                return result.stdout.decode().strip().split('\n')[0]
        except Exception:
            pass

        return None

    else:
        # Unix: which 사용
        try:
            result = subprocess.run(
                ['which', 'soffice'],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                return result.stdout.decode().strip()
        except Exception:
            pass

        # 일반적인 경로 확인
        candidates = [
            '/usr/bin/soffice',
            '/usr/local/bin/soffice',
            '/opt/libreoffice/program/soffice',
        ]
        for path in candidates:
            if os.path.exists(path):
                return path

        return None


def run_antiword(
    input_path: str,
    timeout: int = 30,
) -> SubprocessResult:
    """
    antiword 실행 (DOC 텍스트 추출)

    Args:
        input_path: 입력 파일 경로
        timeout: 타임아웃 (초)

    Returns:
        SubprocessResult
    """
    cmd = ['antiword', '-m', 'UTF-8', input_path]
    return run_with_timeout(cmd, timeout=timeout)
