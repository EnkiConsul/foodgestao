"""
Acessibilidade — painel da DRE Gerencial (/relatorios/contabeis) com axe-core.

Roda o axe (WCAG 2.0/2.1 A + AA) no painel real, em três estados de filtro, e
falha em qualquer violação **critical/serious**. Também faz checagens dirigidas
para os erros mais comuns:

  * contraste de cor (`color-contrast`);
  * botões/ícones sem nome acessível (`button-name`, `link-name`);
  * inputs e switches sem label (`label`, `aria-*`, `form-field-multiple-labels`);
  * ids ARIA duplicados em listas (`duplicate-id-aria`);
  * landmark `<main>` único e hierarquia de headings;
  * tabelas de dados com cabeçalhos válidos (`th-has-data-cells`, `scope-attr-valid`).

Requer sessão Lovable injetada (LOVABLE_BROWSER_AUTH_STATUS=injected).

    python3 e2e/dre-acessibilidade.spec.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:8080"
ROUTE = "/relatorios/contabeis"

AXE_PATH = Path("node_modules/axe-core/axe.min.js")
OUT_DIR = Path("/tmp/browser/dre-a11y")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Regras exigidas explicitamente (as "comuns"): qualquer violação falha,
# independentemente do impacto reportado pelo axe.
STRICT_RULES = {
    "color-contrast",
    "button-name",
    "link-name",
    "label",
    "form-field-multiple-labels",
    "aria-input-field-name",
    "aria-toggle-field-name",
    "select-name",
    "input-button-name",
    "duplicate-id-aria",
    "image-alt",
    "landmark-one-main",
    "heading-order",
    "th-has-data-cells",
    "scope-attr-valid",
    "aria-required-attr",
    "aria-valid-attr-value",
}

BLOCKING_IMPACTS = {"critical", "serious"}

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
    await page.wait_for_timeout(400)


async def run_axe(page, label: str) -> dict:
    await page.add_script_tag(path=str(AXE_PATH))
    result = await page.evaluate(
        """async () => {
          const res = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
            resultTypes: ['violations'],
          });
          return {
            violations: res.violations.map(v => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.slice(0, 5).map(n => ({
                target: n.target.join(' '),
                summary: (n.failureSummary || '').split('\\n').slice(0, 3).join(' | '),
              })),
              count: v.nodes.length,
            })),
          };
        }"""
    )
    (OUT_DIR / f"axe-{label}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def report(label: str, result: dict) -> None:
    violations = result["violations"]
    if violations:
        print(f"       axe/{label}: {len(violations)} regra(s) com violação")
        for v in violations:
            print(f"         - {v['id']} [{v['impact']}] x{v['count']}: {v['help']}")
            for n in v["nodes"][:3]:
                print(f"             {n['target']}")
                if n["summary"]:
                    print(f"             {n['summary'][:180]}")

    blocking = [v for v in violations if v["impact"] in BLOCKING_IMPACTS]
    check(
        f"{label}: sem violações critical/serious",
        not blocking,
        ", ".join(f"{v['id']}({v['impact']},x{v['count']})" for v in blocking),
    )

    strict = [v for v in violations if v["id"] in STRICT_RULES]
    check(
        f"{label}: regras comuns (contraste, labels, nomes, landmarks)",
        not strict,
        ", ".join(f"{v['id']} x{v['count']}" for v in strict),
    )


async def click_toggle(page, name: str) -> None:
    item = page.get_by_role("radio", name=name, exact=True)
    if await item.count() and await item.get_attribute("data-state") != "on":
        await item.click()
        await wait_report(page)


async def main() -> None:
    if not AXE_PATH.exists():
        print(f"axe-core não encontrado em {AXE_PATH}. Rode `bun add -d axe-core`.")
        sys.exit(2)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await restore_session(context, page)

        await page.goto(f"{BASE_URL}{ROUTE}?preset=year", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="DRE Gerencial")).to_be_visible(
            timeout=40_000
        )
        await wait_report(page)
        banner = page.get_by_role("button", name="Aceitar todos")
        if await banner.count():
            await banner.first.click()
            await page.wait_for_timeout(300)

        if await page.get_by_text("Selecione uma empresa no seletor").count():
            print("Nenhuma empresa selecionada no contexto — abortando.")
            sys.exit(2)

        # 1. Painel carregado (KPIs + cascata da DRE)
        report("painel-inicial", await run_axe(page, "painel-inicial"))

        # 2. Regime Caixa (rótulos e badges alternativos)
        await click_toggle(page, "Caixa")
        report("regime-caixa", await run_axe(page, "regime-caixa"))
        await click_toggle(page, "Competência")

        # 3. Árvore de contas expandida com contas sem movimento (muitas linhas,
        #    ids repetidos e cabeçalhos de tabela sob estresse)
        switch = page.get_by_role("switch")
        if await switch.count():
            await switch.first.click()
            await wait_report(page)
        expand = page.get_by_role("button", name="Expandir tudo")
        if await expand.count():
            await expand.first.click()
            await page.wait_for_timeout(500)
        rows = await page.get_by_test_id("dre-account-row").count()
        print(f"       árvore expandida: {rows} linhas de conta")
        report("arvore-expandida", await run_axe(page, "arvore-expandida"))

        # --------------------------- checagens dirigidas (independentes do axe)
        no_name = await page.evaluate(
            """() => {
              const named = (el) =>
                (el.textContent || '').trim() ||
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                (el.getAttribute('aria-labelledby') &&
                  document.getElementById(el.getAttribute('aria-labelledby')));
              return [...document.querySelectorAll('button, a[href], [role="switch"], [role="radio"]')]
                .filter((el) => el.offsetParent !== null && !named(el))
                .map((el) => el.outerHTML.slice(0, 120));
            }"""
        )
        check(
            "todo controle visível tem nome acessível",
            not no_name,
            "; ".join(no_name[:3]),
        )

        unlabeled_inputs = await page.evaluate(
            """() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
                 .filter((el) => el.offsetParent !== null)
                 .filter((el) => !(
                   el.getAttribute('aria-label') ||
                   el.getAttribute('aria-labelledby') ||
                   (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
                   el.closest('label') ||
                   el.getAttribute('placeholder')
                 ))
                 .map((el) => el.outerHTML.slice(0, 120))"""
        )
        check("todo input visível tem label", not unlabeled_inputs, "; ".join(unlabeled_inputs[:3]))

        mains = await page.locator("main").count()
        check("exatamente um landmark <main>", mains == 1, f"{mains} encontrados")

        lang = await page.get_by_role("document").get_attribute("lang") if False else await page.evaluate(
            "() => document.documentElement.lang"
        )
        check("<html lang> definido", bool(lang), repr(lang))

        dup_ids = await page.evaluate(
            """() => {
              const seen = new Map();
              document.querySelectorAll('[id]').forEach((el) => {
                seen.set(el.id, (seen.get(el.id) || 0) + 1);
              });
              return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
            }"""
        )
        check("sem ids duplicados no DOM", not dup_ids, "; ".join(dup_ids[:5]))

        await page.screenshot(path=str(OUT_DIR / "painel.png"))
        await browser.close()

    print(
        "\n"
        + ("FALHAS: " + " | ".join(failures) if failures else "Nenhuma violação de acessibilidade.")
        + f"\nRelatórios axe: {OUT_DIR}"
    )
    sys.exit(1 if failures else 0)


asyncio.run(main())
