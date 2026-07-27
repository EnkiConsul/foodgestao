"""
E2E — Fluxo de exclusão de contas bancárias em /contas-bancarias.

Valida, do clique em "Excluir" até a mensagem final, dois cenários reais:
  1. Conta SEM lançamentos  → diálogo "excluída definitivamente" → toast "Conta excluída"
  2. Conta COM lançamentos  → diálogo "arquivada"                → toast "Conta arquivada"

Seed/cleanup usam as RPCs `_e2e_seed_delete_accounts` /
`_e2e_cleanup_delete_accounts`, invocadas via PostgREST com o token do
próprio usuário autenticado (Lovable session injetada).
"""

import asyncio
import base64
import json
import os
import sys
import urllib.request
import uuid
from pathlib import Path

from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/contas-delete/screenshots")
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
ACC_EMPTY_NAME   = f"E2E-Vazia-{RUN_ID}"
ACC_HISTORY_NAME = f"E2E-Historico-{RUN_ID}"


def _access_token() -> str:
    session = json.loads(os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"])
    tok = session.get("access_token")
    if not tok:
        raise RuntimeError("access_token ausente")
    return tok


def _rpc(name: str, payload: dict) -> dict | list:
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
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode() or "null"
            return json.loads(body)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"RPC {name} falhou: {e.code} {e.read().decode()[:200]}") from None


def seed() -> None:
    _rpc("_e2e_seed_delete_accounts", {
        "_empty_name": ACC_EMPTY_NAME,
        "_history_name": ACC_HISTORY_NAME,
    })


def cleanup() -> None:
    try:
        _rpc("_e2e_cleanup_delete_accounts", {"_names": [ACC_EMPTY_NAME, ACC_HISTORY_NAME]})
    except Exception as e:
        print(f"⚠ cleanup: {e}")


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
        f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
    )
    # Força o contexto Pessoal — contas semeadas são context='pf'.
    await page.evaluate(
        "window.localStorage.setItem('app-company-context', "
        "JSON.stringify({contextType:'pf', selectedCompanyId:null}))"
    )


async def run_delete_flow(page, account_name, expected_dialog, expected_toast, prefix):
    print(f"\n▶ Cenário {prefix}: {account_name}")

    card_text = page.locator(f'text="{account_name}"').first
    await expect(card_text).to_be_visible(timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / f"{prefix}_1_lista.png"))

    # Botão "Excluir conta" dentro do Card que contém o nome.
    card_root = card_text.locator(
        "xpath=ancestor::*[.//button[@aria-label='Excluir conta']][1]"
    )
    await card_root.locator('button[aria-label="Excluir conta"]').click()

    dialog = page.get_by_role("alertdialog")
    await expect(dialog).to_be_visible()
    description = dialog.get_by_test_id("delete-account-description")
    await expect(description).to_contain_text(expected_dialog, timeout=15_000)
    await expect(description).not_to_contain_text("Verificando")
    await page.screenshot(path=str(SCREENSHOTS / f"{prefix}_2_dialogo.png"))

    await dialog.get_by_role("button", name="Excluir").click()

    toast = page.get_by_text(expected_toast, exact=False).first
    await expect(toast).to_be_visible(timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / f"{prefix}_3_toast.png"))

    await expect(page.locator(f'text="{account_name}"')).to_have_count(0, timeout=10_000)
    print(f"   ✔ diálogo: '{expected_dialog}' | toast: '{expected_toast}' | card removido")


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("Sessão Lovable ausente.")
        return 2

    seed()
    print(f"Seed OK — contas '{ACC_EMPTY_NAME}' e '{ACC_HISTORY_NAME}' criadas.")

    exit_code = 0
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            await restore_session(ctx, page)
            await page.goto(f"{BASE_URL}/contas-bancarias", wait_until="networkidle")
            await page.screenshot(path=str(SCREENSHOTS / "0_pagina.png"))

            await run_delete_flow(
                page, ACC_EMPTY_NAME,
                expected_dialog="excluída definitivamente",
                expected_toast="Conta excluída",
                prefix="hard",
            )
            await run_delete_flow(
                page, ACC_HISTORY_NAME,
                expected_dialog="arquivada",
                expected_toast="Conta arquivada",
                prefix="soft",
            )
            await browser.close()
        print("\n✅ E2E OK — hard delete e arquivamento validados pela UI.")
    except Exception as exc:
        exit_code = 1
        print(f"\n❌ E2E falhou: {exc}")
    finally:
        cleanup()
        print("Cleanup executado.")
    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
