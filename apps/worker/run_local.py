"""
Local development runner for RAI Worker
Loads .env or .env.local before starting uvicorn
"""
import os
import sys
from pathlib import Path

# 프로젝트 루트 찾기
project_root = Path(__file__).parent.parent.parent

# .env.local 또는 .env 로드 (우선순위: .env.local > .env)
from dotenv import load_dotenv

env_local = project_root / '.env.local'
env_file = project_root / '.env'

if env_local.exists():
    load_dotenv(env_local, override=True)
    print(f"Loaded env from: {env_local}")
elif env_file.exists():
    load_dotenv(env_file, override=True)
    print(f"Loaded env from: {env_file}")
else:
    print(f"WARNING: No .env file found in {project_root}")

# 환경변수명 매핑 (Next.js -> Worker)
env_mappings = {
    'SUPABASE_URL': 'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_ANON_KEY': 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'WORKER_URL': 'WORKER_API_URL',
}

for worker_var, alt_var in env_mappings.items():
    if not os.getenv(worker_var) and os.getenv(alt_var):
        os.environ[worker_var] = os.getenv(alt_var)

# 환경변수 확인
print("\n=== Worker Environment Check ===")
required_vars = [
    ('SUPABASE_URL', True),
    ('SUPABASE_SERVICE_ROLE_KEY', True),
    ('OPENAI_API_KEY', True),
    ('GEMINI_API_KEY', False),  # Optional - Gemini
    ('ANTHROPIC_API_KEY', False),  # Optional
    ('ENCRYPTION_KEY', True),
]

missing_required = []
for var, required in required_vars:
    value = os.getenv(var)
    status = 'SET' if value else 'NOT SET'
    marker = '✓' if value else ('✗' if required else '○')
    print(f"  {marker} {var}: {status}")
    if required and not value:
        missing_required.append(var)

if missing_required:
    print(f"\n⚠️  Missing required env vars: {', '.join(missing_required)}")
    print("   Please check your .env or .env.local file")
else:
    print("\n✓ All required env vars are set!")
print("================================\n")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
