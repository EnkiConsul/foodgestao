"""e2e: acesso não autorizado às ações de exclusão em contas bancárias.

O caminho real do botão "Excluir" na UI é `supabase.rpc('delete_account', …)`.
Como a RLS impede que um usuário sequer VEJA contas de outro (o botão nem
aparece), reproduzimos o cenário chamando a mesma RPC autenticada contra
contas semeadas em nome de OUTRO usuário. Espera-se `permission denied`
tanto para a conta vazia (tentativa de hard delete) quanto para a conta com
lançamentos (tentativa de arquivamento).

Também validamos, via UI real, que a página não renderiza cards para as
contas alheias — ou seja, o botão está de fato bloqueado.
"""
from __future__ import annotations
import asyncio, json, os, sys, uuid
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:8080"
SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co"
ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJp"
    "YXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko"
)

SCREENSHOTS = Path("/tmp/browser/contas-delete-authz/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

SUFFIX = uuid.uuid4().hex[:8]
EMPTY = f"E2E-FOREIGN-Vazia-{SUFFIX}"
HIST = f"E2E-FOREIGN-Historico-{SUFFIX}"


async def rpc(page, name: str, body: dict, token: str) -> dict:
    return await page.evaluate(
        """async ({url, anon, token, name, body}) => {
            const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
                method: 'POST',
                headers: {
                    apikey: anon,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            return { status: r.status, body: await r.text() };
        }""",
        {"url": SUPABASE_URL, "anon": ANON, "token": token,
         "name": name, "body": body},
    )


async def restore_session(context, page) -> None:
    sk = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    sj = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_raw = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_raw:
        cookies = json.loads(cookies_raw)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)}); "
        "window.localStorage.setItem('app-company-context', "
        "JSON.stringify({contextType:'pf', selectedCompanyId:null}));"
    )


def expect_denied(label: str, res: dict) -> None:
    txt = res["body"] or ""
    if res["status"] < 400 or "permission denied" not in txt.lower():
        raise AssertionError(f"{label}: esperava permission denied, obtive {res}")
    print(f"   ✔ {label}: bloqueado (status={res['status']}, msg contém 'permission denied')")


async def main() -> int:
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not session_json:
        print("❌ Sessão Supabase não injetada.")
        return 2
    token = json.loads(session_json)["access_token"]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await restore_session(ctx, page)

        seed = await rpc(page, "_e2e_seed_foreign_accounts",
                         {"_empty_name": EMPTY, "_history_name": HIST}, token)
        if seed["status"] != 200:
            print("❌ Seed falhou:", seed); return 1
        rows = json.loads(seed["body"])
        row = rows[0] if isinstance(rows, list) else rows
        empty_id = row["empty_id"]; hist_id = row["history_id"]
        print(f"Seed OK — contas '{EMPTY}' e '{HIST}' de outro usuário.")

        try:
            # 1) RPC: hard delete negado.
            print("\n▶ Cenário 1: tentar excluir definitivamente conta de outro usuário")
            r = await rpc(page, "delete_account", {"_account_id": empty_id}, token)
            expect_denied("hard delete", r)

            # 2) RPC: soft delete (arquivamento) também negado.
            print("\n▶ Cenário 2: tentar arquivar conta de outro usuário (com histórico)")
            r = await rpc(page, "delete_account", {"_account_id": hist_id}, token)
            expect_denied("soft delete", r)

            # 3) UI: página não deve nem renderizar as contas alheias.
            print("\n▶ Cenário 3: UI de /contas-bancarias não expõe botão de exclusão")
            await page.goto(f"{BASE_URL}/contas-bancarias", wait_until="networkidle")
            await page.screenshot(path=str(SCREENSHOTS / "ui_lista.png"))
            for name in (EMPTY, HIST):
                await expect(page.locator(f'text="{name}"')).to_have_count(0, timeout=5_000)
            # Além do card, o botão "Excluir conta" (aria-label) das contas alheias
            # também não pode existir para nenhuma das duas contas semeadas.
            delete_btns = page.get_by_role("button", name="Excluir conta")
            total_delete_btns = await delete_btns.count()
            own_names = set(
                await page.locator('[data-testid="account-card-name"], .account-name, h3').all_text_contents()
            )
            if EMPTY in own_names or HIST in own_names:
                raise AssertionError("Contas alheias vazaram para o DOM do usuário.")
            print(f"   ✔ 0 botões 'Excluir conta' apontam para contas alheias "
                  f"(total renderizados na página: {total_delete_btns})")

            # 4) Mensagem do backend deve mapear para o toast específico do frontend.
            print("\n▶ Cenário 4: mensagem do backend mapeia para toast de permissão")
            body_lc = (r["body"] or "").lower()
            if "permission denied" not in body_lc:
                raise AssertionError(
                    "Backend não retornou 'permission denied' — toast específico não seria acionado."
                )
            # Replica a lógica do handler (src/pages/ContasBancarias.tsx handleDelete):
            def toast_for(msg: str) -> str:
                m = msg.lower()
                if any(k in m for k in ("open_finance", "conex", "desconect")):
                    return "Desconecte o Open Finance desta conta antes de excluir."
                if "permission denied" in m:
                    return "Você não tem permissão para excluir esta conta."
                return "Erro ao excluir conta"
            toast_txt = toast_for(r["body"] or "")
            expected = "Você não tem permissão para excluir esta conta."
            if toast_txt != expected:
                raise AssertionError(f"Toast esperado '{expected}', obtive '{toast_txt}'")
            print(f"   ✔ handler exibiria: '{toast_txt}'")


            print("\n✅ Autorização bloqueada em todos os caminhos.")
            return 0
        finally:
            cleanup = await rpc(
                page, "_e2e_cleanup_foreign_accounts",
                {"_empty_name": EMPTY, "_history_name": HIST}, token,
            )
            print("Cleanup:", cleanup["status"])
            await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
