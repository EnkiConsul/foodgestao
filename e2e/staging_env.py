"""Destinos permitidos para testes: homologação explícita, sem fallback."""
import base64
import json
import os
from urllib.parse import unquote, urlsplit

PROJECT_REF = "utjhzpdbqzajrhnzcher"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"


def public_config():
    if os.environ.get("TEST_SUPABASE_URL") != SUPABASE_URL:
        raise RuntimeError("E2E bloqueado: TEST_SUPABASE_URL precisa apontar para homologação.")
    key = os.environ.get("TEST_SUPABASE_ANON_KEY", "")
    if key.startswith("eyJ"):
        try:
            payload = key.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except (ValueError, IndexError):
            raise RuntimeError("E2E bloqueado: chave pública inválida.") from None
        if claims.get("role") != "anon" or claims.get("ref") != PROJECT_REF:
            raise RuntimeError("E2E bloqueado: chave de outro projeto ou privilegiada.")
    elif not key.startswith("sb_publishable_") or len(key) < 40:
        raise RuntimeError("E2E bloqueado: chave pública ausente ou inválida.")
    return PROJECT_REF, SUPABASE_URL, key


def assert_staging_db(url):
    parts = urlsplit(url)
    host = parts.hostname or ""
    user = unquote(parts.username or "")
    direct = host == f"db.{PROJECT_REF}.supabase.co"
    pool = host.endswith(".pooler.supabase.com") and user == f"postgres.{PROJECT_REF}"
    if parts.scheme not in ("postgres", "postgresql") or not (direct or pool) or parts.query or parts.fragment:
        raise RuntimeError("QA bloqueado: conexão deve identificar exclusivamente o banco de homologação, sem parâmetros de sobrescrita.")
    return url
