"""
E2E — Fluxo de ajuste de saldo em /contas-bancarias.

Cobre, do clique em "Ajustar saldo" ao toast final, o happy path do motor:
  1. Abre o dialog, digita saldo alvo + justificativa e confirma
  2. Valida o toast de sucesso e o novo saldo refletido no card

Seed/cleanup via RPCs helpers `_e2e_seed_adjust_balance` /
`_e2e_cleanup_adjust_balance`.
"""

import asyncio
import json
import os
import urllib.request
import uuid
from pathlib import Path

from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/adjust-balance/screenshots")
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

RUN_ID = uuid.uuid4().hex[:8]
ACC_NAME = f"E2E-Ajuste-{RUN_ID}"


def _access_token() -> str:
    session = json.loads(os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"])
    return session["access_token"]


def _rpc(name: str, payload: dict):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {_access_token()}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode() or "null"
        return json.loads(body)


async def restore_session(context, page) -> None:
    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_raw = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_raw:
        cookies = json.loads(cookies_raw)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)});"
        "window.localStorage.setItem('app-company-context',"
        " JSON.stringify({contextType:'pf', selectedCompanyId:null}));"
    )


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("Sessão Lovable ausente.")
        return 2

    _rpc("_e2e_seed_adjust_balance", {"_account_name": ACC_NAME})
    print(f"Seed OK — conta '{ACC_NAME}' com saldo R$ 100,00.")

    exit_code = 0
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await restore_session(ctx, page)
            await page.goto(f"{BASE_URL}/contas-bancarias", wait_until="networkidle")
            await page.screenshot(path=str(SCREENSHOTS / "0_lista.png"))

            card_text = page.locator(f'text="{ACC_NAME}"').first
            await expect(card_text).to_be_visible(timeout=15_000)

            card_root = card_text.locator(
                "xpath=ancestor::*[.//button[@aria-label='Ajustar saldo']][1]"
            )
            await card_root.locator('button[aria-label="Ajustar saldo"]').click()

            dialog = page.get_by_role("dialog").filter(has_text="Ajustar saldo")
            await expect(dialog).to_be_visible()
            await page.screenshot(path=str(SCREENSHOTS / "1_dialog.png"))

            confirm = dialog.get_by_role("button", name="Confirmar ajuste")
            await expect(confirm).to_be_disabled()

            # Digita saldo alvo: 250,00 (250 * 100 = 25000 raw)
            await dialog.locator('input[placeholder="0,00"]').fill("25000")
            # Justificativa
            await dialog.locator("textarea").fill("Divergência com extrato — E2E")
            await page.screenshot(path=str(SCREENSHOTS / "2_preenchido.png"))

            await expect(confirm).to_be_enabled()
            await confirm.click()

            toast = page.get_by_text("Saldo ajustado com sucesso", exact=False).first
            await expect(toast).to_be_visible(timeout=10_000)
            await page.screenshot(path=str(SCREENSHOTS / "3_toast.png"))

            # Saldo do card deve refletir o novo valor (250,00)
            new_card_root = page.locator(f'text="{ACC_NAME}"').first.locator(
                "xpath=ancestor::*[.//button[@aria-label='Ajustar saldo']][1]"
            )
            await expect(new_card_root).to_contain_text("250,00", timeout=10_000)
            await page.screenshot(path=str(SCREENSHOTS / "4_novo_saldo.png"))

            await browser.close()
        print("\n✅ E2E OK — ajuste de saldo aplicado e refletido no card.")
    except Exception as exc:
        exit_code = 1
        print(f"\n❌ E2E falhou: {exc}")
    finally:
        try:
            _rpc("_e2e_cleanup_adjust_balance", {"_account_name": ACC_NAME})
            print("Cleanup executado.")
        except Exception as e:
            print(f"⚠ cleanup: {e}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
