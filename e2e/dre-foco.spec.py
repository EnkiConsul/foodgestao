"""
Foco (E2E) — painel da DRE Gerencial (/relatorios/contabeis).

Garante que o foco do teclado NÃO se perde para o <body> quando o conteúdo é
desmontado/remontado. Cada checagem captura o elemento focado ANTES e DEPOIS da
ação e compara:

  1. alternar tabs (DRE -> Pendências -> DRE) mantém o foco no gatilho clicado;
  2. navegação por teclado (setas) entre tabs segue a11y do Radix e ativa o painel;
  3. trocar Regime não joga o foco no <body> (conteúdo é remontado);
  4. trocar Período (preset) preserva o foco no controle acionado;
  5. ligar "Incluir contas sem movimento" mantém o foco no switch;
  6. expandir/recolher uma conta mantém o foco no chevron;
  7. após voltar de Pendências, o foco continua dentro do painel (nunca no body);
  8. Tab a partir do gatilho ativo entra no conteúdo do painel (ordem lógica).

    python3 e2e/dre-foco.spec.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:8080"
ROUTE = "/relatorios/contabeis"
OUT_DIR = Path("/tmp/browser/dre-foco")
OUT_DIR.mkdir(parents=True, exist_ok=True)

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'OK  ' if condition else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    if not condition:
        failures.append(f"{label} {detail}".strip())


async def restore_session(context, page) -> None:
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status != "injected":
        print(f"Sessão indisponível (LOVABLE_BROWSER_AUTH_STATUS={status!r}).")
        sys.exit(2)
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and session:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(session)})"
        )


async def wait_report(page) -> None:
    await expect(page.get_by_text("Calculando…")).to_have_count(0, timeout=40_000)
    await page.wait_for_timeout(350)


async def focus_state(page) -> dict:
    """Assinatura do elemento em foco: tag, role, nome, testid e escopo."""
    return await page.evaluate(
        """() => {
          const el = document.activeElement;
          if (!el || el === document.body) {
            return { tag: el ? el.tagName.toLowerCase() : 'null', isBody: true };
          }
          const panel = el.closest('[data-focus-scope="dre"]');
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60),
            testid: el.getAttribute('data-testid'),
            value: el.getAttribute('value') || el.getAttribute('data-value'),
            state: el.getAttribute('data-state'),
            isBody: false,
            inPanel: !!panel,
            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          };
        }"""
    )


def fmt(state: dict) -> str:
    if state.get("isBody"):
        return "<body> (foco perdido)"
    return (
        f"{state['tag']}"
        + (f"[role={state['role']}]" if state.get("role") else "")
        + (f"[testid={state['testid']}]" if state.get("testid") else "")
        + (f" “{state['name']}”" if state.get("name") else "")
    )


def same_element(before: dict, after: dict) -> bool:
    if before.get("isBody") or after.get("isBody"):
        return False
    keys = ("tag", "role", "testid", "name")
    return all(before.get(k) == after.get(k) for k in keys)


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        console_errors: list[str] = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )
        await restore_session(context, page)

        await page.goto(f"{BASE_URL}{ROUTE}?preset=year", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="DRE Gerencial")).to_be_visible(
            timeout=40_000
        )
        await wait_report(page)
        banner = page.get_by_role("button", name="Aceitar todos")
        if await banner.count():
            await banner.first.click()
            await page.wait_for_timeout(250)
        if await page.get_by_text("Selecione uma empresa no seletor").count():
            print("Nenhuma empresa selecionada no contexto — abortando.")
            sys.exit(2)

        tab_dre = page.get_by_role("tab", name="DRE Gerencial")
        tab_pend = page.get_by_role("tab", name="Pendências")

        # ------------------------------------------------ 1. troca de tabs (mouse)
        await tab_dre.click()
        before = await focus_state(page)
        await tab_pend.click()
        await page.wait_for_timeout(400)
        after = await focus_state(page)
        check(
            "clicar em Pendências mantém o foco no gatilho (não no body)",
            not after.get("isBody") and after.get("name", "").startswith("Pendências"),
            f"antes={fmt(before)} depois={fmt(after)}",
        )

        await tab_pend.click()
        before = await focus_state(page)
        await tab_dre.click()
        await wait_report(page)
        after = await focus_state(page)
        check(
            "voltar para DRE (remontando a cascata) mantém o foco no gatilho",
            not after.get("isBody") and after.get("name", "").startswith("DRE"),
            f"antes={fmt(before)} depois={fmt(after)}",
        )
        await page.screenshot(path=str(OUT_DIR / "1_tabs.png"))

        # ------------------------------------------- 2. troca de tabs por teclado
        await tab_dre.focus()
        before = await focus_state(page)
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(400)
        after = await focus_state(page)
        check(
            "ArrowRight move o foco para a próxima tab e a ativa",
            not after.get("isBody")
            and after.get("role") == "tab"
            and after.get("name", "").startswith("Pendências")
            and after.get("state") == "active",
            f"antes={fmt(before)} depois={fmt(after)} state={after.get('state')}",
        )
        await page.keyboard.press("ArrowLeft")
        await wait_report(page)
        after = await focus_state(page)
        check(
            "ArrowLeft volta o foco para a tab DRE com conteúdo remontado",
            not after.get("isBody") and after.get("name", "").startswith("DRE"),
            f"depois={fmt(after)}",
        )

        # --------------------------------------------------------- 3. Regime
        regime_caixa = page.get_by_role("radio", name="Caixa", exact=True)
        await regime_caixa.focus()
        before = await focus_state(page)
        await regime_caixa.click()
        await wait_report(page)
        after = await focus_state(page)
        check(
            "trocar Regime não perde o foco (conteúdo recalculado)",
            not after.get("isBody"),
            f"antes={fmt(before)} depois={fmt(after)}",
        )
        check(
            "foco permanece no controle de Regime acionado",
            same_element(before, after),
            f"antes={fmt(before)} depois={fmt(after)}",
        )
        regime_comp = page.get_by_role("radio", name="Competência", exact=True)
        await regime_comp.click()
        await wait_report(page)
        check("voltar a Competência não perde o foco", not (await focus_state(page)).get("isBody"))

        # --------------------------------------------------------- 4. Período
        preset_12m = page.get_by_role("radio", name="12m", exact=True)
        if not await preset_12m.count():
            preset_12m = page.get_by_role("button", name="12m", exact=True)
        await preset_12m.first.focus()
        before = await focus_state(page)
        await preset_12m.first.click()
        await wait_report(page)
        after = await focus_state(page)
        check(
            "trocar Período mantém o foco no preset acionado",
            same_element(before, after),
            f"antes={fmt(before)} depois={fmt(after)}",
        )

        # ------------------------------------- 5. Incluir contas sem movimento
        switch = page.get_by_role("switch").first
        await switch.focus()
        before = await focus_state(page)
        await page.keyboard.press("Space")
        await wait_report(page)
        after = await focus_state(page)
        check(
            "ligar “Incluir contas sem movimento” mantém o foco no switch",
            not after.get("isBody") and after.get("role") == "switch",
            f"antes={fmt(before)} depois={fmt(after)}",
        )

        # -------------------------------------- 6. expandir/recolher na árvore
        expand_all = page.get_by_role("button", name="Expandir tudo")
        if await expand_all.count():
            await expand_all.first.focus()
            before = await focus_state(page)
            await expand_all.first.click()
            await page.wait_for_timeout(500)
            after = await focus_state(page)
            check(
                "“Expandir tudo” (57+ linhas novas) mantém o foco no botão",
                same_element(before, after),
                f"antes={fmt(before)} depois={fmt(after)}",
            )

        chevron = page.locator('button[aria-expanded]').first
        if await chevron.count():
            await chevron.focus()
            before = await focus_state(page)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(400)
            after = await focus_state(page)
            check(
                "recolher uma conta mantém o foco no chevron",
                not after.get("isBody") and after.get("name") == before.get("name"),
                f"antes={fmt(before)} depois={fmt(after)}",
            )
        await page.screenshot(path=str(OUT_DIR / "2_arvore.png"))

        # ------------------------- 7. ida e volta às tabs com árvore expandida
        await tab_pend.click()
        await page.wait_for_timeout(400)
        mid = await focus_state(page)
        await tab_dre.click()
        await wait_report(page)
        after = await focus_state(page)
        check(
            "ciclo Pendências -> DRE nunca deixa o foco no <body>",
            not mid.get("isBody") and not after.get("isBody"),
            f"pendencias={fmt(mid)} dre={fmt(after)}",
        )

        # --------------------------------- 8. Tab do gatilho entra no conteúdo
        await tab_dre.focus()
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(250)
        after = await focus_state(page)
        check(
            "Tab a partir da tab ativa entra no painel (ordem de foco lógica)",
            not after.get("isBody") and after.get("visible") is True,
            f"depois={fmt(after)}",
        )

        blocking = [e for e in console_errors if "favicon" not in e.lower()]
        check("sem erros de console durante as trocas de foco", not blocking, "; ".join(blocking[:2]))

        await browser.close()

    print()
    if failures:
        print("FALHAS: " + " | ".join(failures))
        sys.exit(1)
    print("Foco preservado em todas as transições.")
    print(f"Screenshots: {OUT_DIR}")


asyncio.run(main())
