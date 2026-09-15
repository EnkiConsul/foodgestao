"""Helper de QA/E2E — chamadas às rotinas de QA (P0.3).

Desde a P0.3 as rotinas `_e2e_*` / `_test_*` e a guarda
`_assert_test_helper_allowed` vivem no schema **`qa`**, que NÃO é exposto pelo
PostgREST. Consequência: não existe mais RPC HTTP para elas — nem com chave de
serviço. A única execução possível é server-side, por conexão direta ao banco
(CI/manutenção), com o papel dono do schema.

Variáveis:
  SUPABASE_DB_URL (ou QA_DB_URL)  — obrigatória: URL de conexão direta
                                    (usada pelo CI; nunca no frontend)
  LOVABLE_BROWSER_SUPABASE_SESSION_JSON — sessão do navegador; fornece o
                                    `_user_id` alvo dos seeds

Não há fallback com token de usuário e nenhuma chave/senha em código.

Uso:
    from qa_admin import qa_rpc, session_user_id
    qa_rpc("_e2e_seed_adjust_balance",
           {"_account_name": name, "_user_id": session_user_id()})
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess

QA_SCHEMA = "qa"

# Rotinas que retornam conjunto de linhas (resultado = lista de objetos).
SET_RETURNING = {"_e2e_seed_delete_accounts", "_e2e_seed_foreign_accounts"}

# Rotinas sem retorno (resultado = None).
VOID_RETURNING = {
    "_e2e_cleanup_delete_accounts",
    "_e2e_cleanup_foreign_accounts",
    "_e2e_cleanup_adjust_balance",
}

MISSING_DB_URL_MESSAGE = (
    "QA bloqueado: defina SUPABASE_DB_URL (ou QA_DB_URL) no ambiente de "
    "teste/CI para executar as rotinas de QA. Desde a P0.3 elas vivem no schema "
    "`qa`, fora do PostgREST, e só rodam por conexão direta ao banco. Não há "
    "fallback com token de usuário; nunca coloque credenciais em código, docs "
    "ou no frontend."
)

MISSING_PSQL_MESSAGE = (
    "QA bloqueado: `psql` não está disponível neste ambiente; ele é necessário "
    "para executar as rotinas do schema `qa` por conexão direta."
)


def db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("QA_DB_URL")
    if not url:
        raise RuntimeError(MISSING_DB_URL_MESSAGE)
    return url


def has_db_url() -> bool:
    return bool(os.environ.get("SUPABASE_DB_URL") or os.environ.get("QA_DB_URL"))


def session_user_id() -> str:
    """`sub` do JWT da sessão injetada — alvo dos seeds de QA."""
    session = json.loads(os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"])
    token = session["access_token"]
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["sub"]


def _literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return "ARRAY[" + ", ".join(_literal(v) for v in value) + "]"
    return "'" + str(value).replace("'", "''") + "'"


def qa_rpc(name: str, payload: dict | None = None):
    """Executa uma rotina do schema `qa` por conexão direta (server-side)."""
    if not name.startswith(("_e2e_", "_test_")):
        raise ValueError("qa_rpc aceita somente rotinas _e2e_*/_test_*")
    url = db_url()
    if not shutil.which("psql"):
        raise RuntimeError(MISSING_PSQL_MESSAGE)

    args = ", ".join(
        f"{key} => {_literal(value)}" for key, value in (payload or {}).items()
    )
    call = f'{QA_SCHEMA}."{name}"({args})'
    if name in VOID_RETURNING:
        sql = f"select {call};"
    elif name in SET_RETURNING:
        sql = f"select coalesce(json_agg(t), '[]'::json)::text from {call} t;"
    else:
        sql = f"select coalesce(to_json({call}), 'null'::json)::text;"

    proc = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"qa_rpc {name} falhou: {proc.stderr.strip()}")
    if name in VOID_RETURNING:
        return None
    saida = proc.stdout.strip() or "null"
    try:
        return json.loads(saida)
    except json.JSONDecodeError:
        return saida
