"""Shared E2E target validation, including direct execution of Python specs."""
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
subprocess.run(["node", str(root / "scripts" / "e2e-preflight.mjs")], check=True, cwd=root)
BASE_URL = os.environ["E2E_BASE_URL"].rstrip("/")
PROJECT_REF = os.environ["TEST_EXPECTED_PROJECT_REF"]
SUPABASE_URL = os.environ["TEST_SUPABASE_URL"]
ANON_KEY = os.environ["TEST_SUPABASE_ANON_KEY"]
