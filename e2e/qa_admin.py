"""Helper de QA/E2E — chamadas às rotinas `_e2e_*` / `_test_*` (P0.2-C).

Desde a P0.2-C essas rotinas só podem ser executadas por `service_role`
(execução server-side). Nenhum usuário logado — nem super admin — consegue
chamá-las. Este helper roda apenas em Node/Python de teste (nunca no bundle
do app) e lê a chave de serviço de variável de ambiente.

Variáveis:
  SUPABASE_URL                (opcional; default = projeto do ambiente)
  SUPABASE_SERVICE_ROLE_KEY   (ou QA_SERVICE_ROLE_KEY) — obrigatória

Uso:
    from qa_admin import qa_rpc, session_user_id
    qa_rpc("_e2e_seed_adjust_balance",
           {"_account_name": name, "_user_id": session_user_id()})
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

DEFAULT_SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co"

MISSING_KEY_MESSAGE = (
    "QA bloqueado: defina SUPABASE_SERVICE_ROLE_KEY (ou QA_SERVICE_ROLE_KEY) no "
    "ambiente de teste/CI para executar as rotinas _e2e_*/_test_*. Desde a "
    "P0.2-C essas rotinas exigem service_role e NÃO podem ser chamadas com "
    "token de usuário. Nunca coloque a chave em código, docs ou no frontend."
)


def supabase_url() -> str:
    return os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL


def service_role_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "QA_SERVICE_ROLE_KEY"
    )
    if not key:
        raise RuntimeError(MISSING_KEY_MESSAGE)
    return key


def has_service_role_key() -> bool:
    return bool(
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("QA_SERVICE_ROLE_KEY")
    )


def session_user_id() -> str:
    """`sub` do JWT da sessão injetada — alvo dos seeds de QA."""
    session = json.loads(os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"])
    token = session["access_token"]
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["sub"]


def qa_rpc(name: str, payload: dict | None = None):
    """Executa uma rotina de QA com a chave de serviço (server-side apenas)."""
    if not name.startswith(("_e2e_", "_test_")):
        raise ValueError("qa_rpc aceita somente rotinas _e2e_*/_test_*")
    key = service_role_key()
    req = urllib.request.Request(
        f"{supabase_url()}/rest/v1/rpc/{name}",
        data=json.dumps(payload or {}).encode(),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode() or "null"
            return json.loads(body)
    except urllib.error.HTTPError as err:  # mensagem legível no log do E2E
        detail = err.read().decode()
        raise RuntimeError(f"qa_rpc {name} falhou ({err.code}): {detail}") from err
