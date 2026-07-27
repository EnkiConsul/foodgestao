"""Regressão: garante que `delete_account` consegue realizar hard delete
após o conserto do trigger `prevent_hard_delete_account_with_history`.

Roda no browser autenticado do sandbox e invoca a RPC de teste
`_test_delete_account_hard_regression`, que:
  1) cria uma conta vazia + um cartão + fatura apontando p/ OUTRA conta
     (cenário que o trigger quebrado bloqueava por causa da coluna errada)
     e valida que delete_account retorna 'hard' e remove a linha;
  2) aponta o cartão para uma 3ª conta e valida que o trigger volta a
     barrar (check_violation) quando a conta É a conta de pagamento.
"""
from __future__ import annotations
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080"
SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co"
ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJp"
    "YXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko"
)


async def main() -> int:
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not session_json:
        print("❌ Sem sessão Supabase injetada (LOVABLE_BROWSER_AUTH_STATUS != injected).")
        return 2
    access_token = json.loads(session_json)["access_token"]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="domcontentloaded")

        result = await page.evaluate(
            """async ({url, anon, token}) => {
                const r = await fetch(`${url}/rest/v1/rpc/_test_delete_account_hard_regression`, {
                    method: 'POST',
                    headers: {
                        apikey: anon,
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: '{}',
                });
                return { status: r.status, body: await r.text() };
            }""",
            {"url": SUPABASE_URL, "anon": ANON, "token": access_token},
        )
        await browser.close()

    print("status:", result["status"])
    print("body  :", result["body"])
    if result["status"] != 200:
        print("❌ RPC retornou status inesperado.")
        return 1

    payload = json.loads(result["body"])
    if payload.get("ok") is True \
            and payload.get("hard_delete_result") == "hard" \
            and payload.get("guard_triggered") is True:
        print("✅ Regressão OK: hard delete permitido e trigger continua barrando conta ligada a cartão.")
        return 0
    print("❌ Regressão falhou:", payload)
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
