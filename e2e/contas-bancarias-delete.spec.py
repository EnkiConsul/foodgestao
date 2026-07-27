"""
E2E — Fluxo de exclusão de contas bancárias em /contas-bancarias.

Cobre, do clique em "Excluir" até a mensagem final, dois cenários:
  1. Conta SEM lançamentos  → diálogo mostra "excluída definitivamente"
                             → toast "Conta excluída"
                             → card desaparece da tela
  2. Conta COM lançamentos  → diálogo mostra "arquivada"
                             → toast "Conta arquivada"
                             → card desaparece da tela

Pré-requisitos (fornecidos pelo sandbox Lovable):
  - Vite servindo em http://localhost:8080
  - LOVABLE_BROWSER_AUTH_STATUS=injected + LOVABLE_BROWSER_SUPABASE_*
  - psql configurado (PGHOST/PGUSER/etc.) para seed/cleanup

Uso local:
  python3 e2e/contas-bancarias-delete.spec.py
"""

import asyncio
import base64
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/contas-delete/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8080"

# Marcadores estáveis para localizar as contas semeadas.
ACC_EMPTY_NAME = f"E2E-Vazia-{uuid.uuid4().hex[:8]}"
ACC_HISTORY_NAME = f"E2E-Historico-{uuid.uuid4().hex[:8]}"
ACC_EMPTY_ID = str(uuid.uuid4())
ACC_HISTORY_ID = str(uuid.uuid4())
TX_ID = str(uuid.uuid4())


def _user_id_from_session() -> str:
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not session:
        raise RuntimeError("LOVABLE_BROWSER_SUPABASE_SESSION_JSON ausente")
    data = json.loads(session)
    user_id = (data.get("user") or {}).get("id")
    if not user_id:
        token = data.get("access_token", "")
        payload = token.split(".")[1] if token.count(".") == 2 else ""
        padded = payload + "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded)) if padded else {}
        user_id = claims.get("sub")
    if not user_id:
        raise RuntimeError("Não foi possível extrair user.id da sessão")
    return user_id


def _psql(sql: str, allow_fail: bool = False) -> None:
    """Executa SQL via psql sem ecoar o conteúdo (evita expor o user_id)."""
    result = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        if not allow_fail:
            raise RuntimeError("psql falhou")


def seed(user_id: str) -> None:
    _psql(
        f"""
        INSERT INTO public.accounts
          (id, user_id, name, account_type, context, initial_balance, current_balance, is_active)
        VALUES
          ('{ACC_EMPTY_ID}',   '{user_id}', '{ACC_EMPTY_NAME}',   'corrente', 'pf', 0, 0, true),
          ('{ACC_HISTORY_ID}', '{user_id}', '{ACC_HISTORY_NAME}', 'corrente', 'pf', 0, 0, true);

        INSERT INTO public.transactions
          (id, user_id, account_id, context, transaction_type,
           description, amount, transaction_date, status)
        VALUES
          ('{TX_ID}', '{user_id}', '{ACC_HISTORY_ID}', 'pf', 'receita',
           'e2e seed', 10, current_date, 'confirmado');
        """
    )


def cleanup() -> None:
    # Ordem defensiva: transação → contas (hard delete pode falhar se restou tx).
    _psql(f"DELETE FROM public.transactions WHERE id = '{TX_ID}';", allow_fail=True)
    _psql(f"DELETE FROM public.accounts WHERE id = '{ACC_EMPTY_ID}';",   allow_fail=True)
    _psql(f"DELETE FROM public.accounts WHERE id = '{ACC_HISTORY_ID}';", allow_fail=True)


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
    # Força contexto Pessoal (PF) — nossas contas semeadas são context='pf'.
    await page.evaluate(
        "window.localStorage.setItem('app-company-context', JSON.stringify({contextType:'pf', selectedCompanyId:null}))"
    )


async def run_delete_flow(page, account_name: str, expected_dialog: str, expected_toast: str, screenshot_prefix: str):
    print(f"\n▶ Cenário: {screenshot_prefix} ({account_name})")

    # Localiza o card pelo nome único da conta.
    card = page.locator(f'text="{account_name}"').first
    await expect(card).to_be_visible(timeout=15_000)
    await page.screenshot(path=str(SCREENSHOTS / f"{screenshot_prefix}_1_lista.png"))

    # Clica no botão "Excluir conta" DENTRO do card correspondente.
    # O botão fica no mesmo Card do texto do nome.
    scope = card.locator("xpath=ancestor::*[self::div][.//button[@aria-label='Excluir conta']][1]")
    await scope.locator('button[aria-label="Excluir conta"]').click()

    dialog = page.get_by_role("alertdialog")
    await expect(dialog).to_be_visible()

    description = dialog.get_by_test_id("delete-account-description")
    # Espera a mensagem final (não pode ser "Verificando…").
    await expect(description).to_contain_text(expected_dialog, timeout=15_000)
    await expect(description).not_to_contain_text("Verificando", timeout=5_000)
    await page.screenshot(path=str(SCREENSHOTS / f"{screenshot_prefix}_2_dialogo.png"))

    await dialog.get_by_role("button", name="Excluir").click()

    # Toast do Sonner (aparece com role=status).
    toast = page.get_by_text(expected_toast, exact=False).first
    await expect(toast).to_be_visible(timeout=10_000)
    await page.screenshot(path=str(SCREENSHOTS / f"{screenshot_prefix}_3_toast.png"))

    # Card removido da lista.
    await expect(page.locator(f'text="{account_name}"')).to_have_count(0, timeout=10_000)
    print(f"   ✔ diálogo: '{expected_dialog}' | toast: '{expected_toast}' | card removido")


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("Sessão Lovable ausente — não é possível rodar o e2e autenticado.")
        return 2

    user_id = _user_id_from_session()
    seed(user_id)
    print(f"Seed OK — 2 contas criadas (1 com transação).")

    exit_code = 0
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()

            await restore_session(ctx, page)
            await page.goto(f"{BASE_URL}/contas-bancarias", wait_until="networkidle")
            await page.screenshot(path=str(SCREENSHOTS / "0_pagina_carregada.png"))

            # Garante o contexto Pessoal (as contas semeadas são PF).
            pf_switch = page.get_by_role("button", name="Pessoal").first
            if await pf_switch.count():
                try:
                    await pf_switch.click(timeout=2_000)
                except Exception:
                    pass
                await page.wait_for_load_state("networkidle")

            # Cenário 1 — SEM lançamentos → hard delete.
            await run_delete_flow(
                page,
                account_name=ACC_EMPTY_NAME,
                expected_dialog="excluída definitivamente",
                expected_toast="Conta excluída",
                screenshot_prefix="hard",
            )

            # Cenário 2 — COM lançamentos → soft delete (arquivamento).
            await run_delete_flow(
                page,
                account_name=ACC_HISTORY_NAME,
                expected_dialog="arquivada",
                expected_toast="Conta arquivada",
                screenshot_prefix="soft",
            )

            await browser.close()
        print("\n✅ E2E: fluxo de exclusão validou hard + soft delete de ponta a ponta.")
    except Exception as exc:
        exit_code = 1
        print(f"\n❌ E2E falhou: {exc}")
    finally:
        cleanup()
        print("Cleanup OK.")
    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
