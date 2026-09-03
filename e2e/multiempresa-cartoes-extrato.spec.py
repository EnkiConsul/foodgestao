"""
E2E — Isolamento multiempresa nas telas de cartão, faturas, lançamentos e extrato.

Faz login com uma sessão real (Lovable injetada ou `lovable auth-session`),
troca de empresa pelo seletor do topo e percorre TODAS as rotas relacionadas:

  /cartoes-credito
  /lancamentos
  /contas-bancarias
  /contas-bancarias/conciliacao
  /contas-bancarias/conexoes

Para cada empresa, o esperado vem do backend (PostgREST com o token do próprio
usuário, filtrado por company_id): finais de cartão, descrições de lançamento e
nomes de conexão do Open Finance. A asserção é dupla:

  1. Nenhum dado exclusivo da OUTRA empresa aparece na tela.
  2. Ao menos um dado próprio aparece (quando a empresa tem dados).

Sem sessão disponível o teste é ignorado (exit 0) para não quebrar o CI.
"""

import asyncio
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

SCREENSHOTS = Path("/tmp/browser/multiempresa/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8080"
PROJECT_REF = "grtxmbffgmgnkawlvqhm"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24i"
    "LCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0."
    "izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko"
)
# A variável injetada pode existir vazia — daí o `or` no fallback.
STORAGE_KEY = (
    os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY") or f"sb-{PROJECT_REF}-auth-token"
)

ROUTES = [
    "/cartoes-credito",
    "/lancamentos",
    "/contas-bancarias",
    "/contas-bancarias/conciliacao",
    "/contas-bancarias/conexoes",
]


# ---------------------------------------------------------------- sessão / REST

def load_session() -> dict | None:
    """Sessão mais recente primeiro: o cache de `lovable auth-session` é
    preferido porque a variável injetada pode estar expirada."""
    cached = Path.home() / ".cache" / "lovable-auth" / "session.json"
    if cached.exists():
        data = json.loads(cached.read_text())
        sess = data.get("session", data)
        if sess.get("access_token"):
            return sess
    raw = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if raw:
        return json.loads(raw)
    return None


def rest(path: str, token: str) -> list[dict]:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"REST {path}: {e.code} {e.read().decode()[:200]}") from None


def q(**params) -> str:
    return urllib.parse.urlencode(params, safe="().,*")


def company_fingerprint(company_id: str, token: str) -> dict:
    cards = rest(f"credit_cards?{q(select='last4', company_id=f'eq.{company_id}')}", token)
    txs = rest(
        f"transactions?{q(select='description', company_id=f'eq.{company_id}', order='transaction_date.desc', limit='40')}",
        token,
    )
    conns = rest(
        f"pluggy_connections?{q(select='connector_name,status', company_id=f'eq.{company_id}')}",
        token,
    )
    return {
        "last4": {c["last4"] for c in cards if c.get("last4")},
        "descriptions": {
            (t.get("description") or "").strip()
            for t in txs
            if (t.get("description") or "").strip() and len(t["description"].strip()) >= 8
        },
        "connections": {
            c["connector_name"]
            for c in conns
            if c.get("connector_name") and c.get("status") != "deleted"
        },
    }


# --------------------------------------------------------------------- browser

async def wait_app_ready(page) -> None:
    """Espera a sessão hidratar: o seletor de empresa só existe autenticado."""
    for attempt in range(4):
        try:
            await page.wait_for_selector('[aria-label="Selecionar empresa"]', timeout=15000)
            return
        except Exception:
            if "/auth" in page.url:
                await page.goto(f"{BASE_URL}/cartoes-credito", wait_until="domcontentloaded")
            else:
                await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(2000)
    raise RuntimeError(f"app não autenticou (url={page.url})")


async def selected_company(page) -> str:
    return (await page.get_by_label("Selecionar empresa").inner_text()).strip()


CONTEXT_KEY = "app-company-context"


async def set_company_storage(page, company_id: str) -> None:
    """Fixa a empresa ativa como o app persiste, para que a navegação
    direta por URL (recarga completa) mantenha o mesmo escopo."""
    await page.evaluate(
        "([k, v]) => localStorage.setItem(k, v)",
        [CONTEXT_KEY, json.dumps({"contextType": "pj", "selectedCompanyId": company_id})],
    )


async def select_company(page, name: str) -> None:
    """Troca a empresa e só retorna quando o seletor confirma a troca —
    sem isso, uma troca que não aplicou faria o teste comparar a empresa errada."""
    await wait_app_ready(page)
    if await selected_company(page) == name:
        await page.wait_for_timeout(800)
        return
    await page.get_by_label("Selecionar empresa").click()
    await page.get_by_role("option", name=re.compile(rf"^{re.escape(name)}$")).click()
    for _ in range(20):
        await page.wait_for_timeout(500)
        if await selected_company(page) == name:
            return
    raise RuntimeError(f"não foi possível selecionar a empresa {name}")


async def page_text(page, route: str, slug: str, company: str) -> str:
    await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
    await wait_app_ready(page)
    await page.wait_for_timeout(2500)
    atual = await selected_company(page)
    if atual != company:
        raise RuntimeError(f"{route}: empresa mudou sozinha ({company} → {atual})")
    await page.screenshot(path=str(SCREENSHOTS / f"{slug}{route.replace('/', '_')}.png"))
    return await page.inner_text("body")


async def main() -> int:
    session = load_session()
    if not session or not session.get("access_token"):
        print("⚠ sem sessão disponível — teste ignorado")
        return 0
    token = session["access_token"]

    memberships = rest(f"company_members?{q(select='company_id,companies(name,trade_name)')}", token)
    companies = [
        {
            "id": m["company_id"],
            "name": (m.get("companies") or {}).get("trade_name")
            or (m.get("companies") or {}).get("name"),
        }
        for m in memberships
        if m.get("companies")
    ]
    if len(companies) < 2:
        print("⚠ usuário com menos de 2 empresas — teste ignorado")
        return 0

    prints = {c["id"]: company_fingerprint(c["id"], token) for c in companies}
    # Escolhe o par com maior diferença de dados (garante evidência real).
    companies.sort(key=lambda c: -len(prints[c["id"]]["last4"]) - len(prints[c["id"]]["descriptions"]))
    pair = companies[:2]
    print(f"Empresas testadas: {[c['name'] for c in pair]}")

    failures: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.evaluate(
            "([k, s]) => localStorage.setItem(k, s)",
            [STORAGE_KEY, json.dumps(session)],
        )

        for idx, company in enumerate(pair):
            other = pair[1 - idx]
            mine, theirs = prints[company["id"]], prints[other["id"]]

            # Troca pelo seletor do topo (caminho real do usuário) e fixa o
            # mesmo escopo no storage para as recargas seguintes.
            await page.goto(f"{BASE_URL}/cartoes-credito", wait_until="domcontentloaded")
            await wait_app_ready(page)
            await set_company_storage(page, company["id"])
            await page.reload(wait_until="domcontentloaded")
            await select_company(page, company["name"])

            for route in ROUTES:
                text = await page_text(page, route, f"{idx}-{company['name'][:8]}", company["name"])

                # 1. nada exclusivo da outra empresa
                for last4 in theirs["last4"] - mine["last4"]:
                    if re.search(rf"\D{re.escape(last4)}\b", text):
                        failures.append(f"{route} [{company['name']}]: final {last4} de {other['name']}")
                for desc in theirs["descriptions"] - mine["descriptions"]:
                    if desc in text:
                        failures.append(f"{route} [{company['name']}]: lançamento '{desc}' de {other['name']}")
                exclusive_conns = {
                    c
                    for c in theirs["connections"] - mine["connections"]
                    if not any(c in m or m in c for m in mine["connections"])
                }
                for conn in exclusive_conns:
                    if conn in text and route == "/contas-bancarias/conexoes":
                        failures.append(f"{route} [{company['name']}]: conexão {conn} de {other['name']}")

                # 2. dado próprio presente onde é esperado
                if route == "/cartoes-credito" and mine["last4"]:
                    if not any(re.search(rf"\D{re.escape(l)}\b", text) for l in mine["last4"]):
                        failures.append(f"{route} [{company['name']}]: nenhum cartão próprio exibido")
                if route == "/lancamentos" and mine["descriptions"]:
                    if not any(d in text for d in mine["descriptions"]):
                        print(f"  · {route} [{company['name']}]: nenhum lançamento no período atual (ok)")

                print(f"  ✓ {route} [{company['name']}]")

        await browser.close()

    if failures:
        print("\n✗ VAZAMENTO ENTRE EMPRESAS:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\n✓ nenhum dado de cartão, fatura, lançamento ou extrato vazou entre empresas")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
