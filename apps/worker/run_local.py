"""
Local development runner for RAI Worker
Loads .env.local before starting uvicorn
"""
import os
import sys
from pathlib import Path

# 프로젝트 루트의 .env.local 로드
env_path = Path(__file__).parent.parent.parent / '.env.local'
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path, override=True)
    print(f"Loaded env from: {env_path}")

# NEXT_PUBLIC_* 변수 매핑
if not os.getenv('SUPABASE_URL') and os.getenv('NEXT_PUBLIC_SUPABASE_URL'):
    os.environ['SUPABASE_URL'] = os.getenv('NEXT_PUBLIC_SUPABASE_URL')

# 환경변수 확인
print(f"SUPABASE_URL: {'SET' if os.getenv('SUPABASE_URL') else 'NOT SET'}")
print(f"OPENAI_API_KEY: {'SET' if os.getenv('OPENAI_API_KEY') else 'NOT SET'}")
print(f"GEMINI_API_KEY: {'SET' if os.getenv('GEMINI_API_KEY') else 'NOT SET'}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
