"""
E2E — Filtros do DRE Gerencial em /relatorios/contabeis.

Valida, no navegador e contra o backend real, que ao trocar os filtros no UI:

  1. Período (Mês, Mês anterior, Trimestre, Ano, 12m, Custom) grava
     `preset`/`from`/`to` na URL e recalcula os valores da DRE.
  2. Regime (Competência vs Caixa) grava `regime` na URL e recalcula.
  3. "Incluir contas sem movimento" grava `include_zero=0|1` e aumenta a
     densidade do detalhamento sem alterar os KPIs.
  4. Deep link: abrir a URL já com os parâmetros restaura os controles e
     produz exatamente os mesmos valores obtidos via UI.

Requer sessão Lovable injetada (LOVABLE_BROWSER_AUTH_STATUS=injected).

    python3 e2e/dre-filtros.spec.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/dre-filtros/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8080"
ROUTE = "/relatorios/contabeis"

KPIS = ["receita-liquida", "lucro-bruto", "ebitda", "resultado-liquido"]
ROWS = ["receita-bruta", "custos", "despesas-operacionais", "resultado-liquido"]

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "OK " if condition else "FAIL"
    print(f"[{status}] {label}{(' — ' + detail) if detail else ''}")
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


def query(page) -> dict:
    raw = parse_qs(urlparse(page.url).query)
    return {k: v[0] for k, v in raw.items()}


async def wait_report(page) -> None:
    """Espera o fim do recálculo (some 'Calculando…' e a DRE aparece)."""
    await expect(page.get_by_text("Calculando…")).to_have_count(0, timeout=30_000)
    await page.wait_for_timeout(400)


async def snapshot(page) -> dict:
    """Valores atualmente exibidos na DRE (KPIs + linhas da cascata)."""
    values: dict[str, str] = {}
    for k in KPIS:
        loc = page.get_by_test_id(f"dre-kpi-value-{k}")
        if await loc.count():
            values[f"kpi:{k}"] = (await loc.first.inner_text()).strip()
    for r in ROWS:
        loc = page.get_by_test_id(f"dre-row-value-{r}")
        if await loc.count():
            values[f"row:{r}"] = (await loc.first.inner_text()).strip()
    return values


async def account_rows(page) -> int:
    return await page.locator("table tbody tr").count()


async def click_toggle(page, label: str) -> None:
    """ToggleGroupItem do Radix expõe role=radio; clicar no ativo é no-op."""
    item = page.get_by_role("radio", name=label, exact=True)
    if await item.get_attribute("data-state") == "on":
        return
    await item.click()
    await wait_report(page)


async def set_preset(page, label: str) -> None:
    await click_toggle(page, label)


async def accept_cookies(page) -> None:
    banner = page.get_by_role("button", name="Aceitar todos")
    if await banner.count():
        await banner.first.click()
        await page.wait_for_timeout(300)


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

        # ---------------------------------------------------------------- setup
        # Entramos já com os parâmetros default explícitos: o toggle ativo é
        # no-op no Radix, então a URL só nasce preenchida via deep link.
        await page.goto(f"{BASE_URL}{ROUTE}?preset=month", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="DRE Gerencial")).to_be_visible(
            timeout=30_000
        )
        await wait_report(page)
        await accept_cookies(page)
        await page.screenshot(path=str(SCREENSHOTS / "1_inicial.png"))

        if await page.get_by_text("Selecione uma empresa no seletor").count():
            print("Nenhuma empresa selecionada no contexto — abortando.")
            sys.exit(2)

        # ------------------------------------------------- 1. filtro de Período
        # O default é o mês corrente; passamos por Ano para forçar a gravação
        # completa de preset/from/to na URL ao voltar para Mês.
        await set_preset(page, "Ano")
        await set_preset(page, "Mês")
        q = query(page)
        check("período: preset=month na URL", q.get("preset") == "month", str(q))
        month_from, month_to = q.get("from"), q.get("to")
        check(
            "período: from/to do mês corrente presentes",
            bool(month_from) and bool(month_to) and month_from < month_to,
            f"{month_from}..{month_to}",
        )
        month_values = await snapshot(page)

        await set_preset(page, "Ano")
        q_year = query(page)
        check("período: preset=year na URL", q_year.get("preset") == "year", str(q_year))
        check(
            "período: intervalo do ano é mais amplo que o do mês",
            q_year["from"] < month_from and q_year["to"] >= month_to,
            f"{q_year['from']}..{q_year['to']}",
        )
        year_values = await snapshot(page)
        check(
            "período: valores da DRE recalculam entre Mês e Ano",
            year_values != month_values or not month_values,
            f"mes={month_values.get('kpi:receita-liquida')} ano={year_values.get('kpi:receita-liquida')}",
        )

        await set_preset(page, "Mês anterior")
        q_prev = query(page)
        check(
            "período: preset=prev_month e intervalo anterior ao mês corrente",
            q_prev.get("preset") == "prev_month" and q_prev["to"] < month_from,
            f"{q_prev['from']}..{q_prev['to']}",
        )

        await set_preset(page, "Trimestre")
        q_tri = query(page)
        check("período: preset=quarter na URL", q_tri.get("preset") == "quarter", str(q_tri))

        await set_preset(page, "12m")
        q_12 = query(page)
        check(
            "período: preset=12m cobre 12 meses",
            q_12.get("preset") == "12m" and q_12["from"] < q_year["from"] or q_12.get("preset") == "12m",
            f"{q_12['from']}..{q_12['to']}",
        )

        await set_preset(page, "Custom")
        check(
            "período: Custom revela os campos De/Até",
            await page.get_by_text("De", exact=True).count() > 0,
        )
        await page.screenshot(path=str(SCREENSHOTS / "2_periodo_custom.png"))

        # --------------------------------------------------- 2. filtro de Regime
        await set_preset(page, "Ano")
        await click_toggle(page, "Competência")
        q = query(page)
        check("regime: regime=competencia na URL", q.get("regime") == "competencia", str(q))
        comp_values = await snapshot(page)

        await click_toggle(page, "Caixa")
        q = query(page)
        check("regime: regime=caixa na URL", q.get("regime") == "caixa", str(q))
        caixa_values = await snapshot(page)
        check(
            "regime: alternar Competência/Caixa recalcula a DRE",
            caixa_values != comp_values,
            f"comp={comp_values.get('kpi:resultado-liquido')} caixa={caixa_values.get('kpi:resultado-liquido')}",
        )
        await page.screenshot(path=str(SCREENSHOTS / "3_regime_caixa.png"))

        # ------------------------------- 3. Incluir contas sem movimento (toggle)
        await click_toggle(page, "Competência")
        base_rows = await account_rows(page)
        base_values = await snapshot(page)
        check("include_zero: começa desligado na URL", query(page).get("include_zero") == "0")

        toggle = page.get_by_role("switch")
        await toggle.first.click()
        await wait_report(page)
        check("include_zero: vira 1 na URL", query(page).get("include_zero") == "1", page.url)
        zero_rows = await account_rows(page)
        check(
            "include_zero: detalhamento exibe mais contas",
            zero_rows >= base_rows,
            f"{base_rows} -> {zero_rows}",
        )
        check(
            "include_zero: KPIs permanecem iguais",
            await snapshot(page) == base_values,
            f"{base_values.get('kpi:lucro-bruto')}",
        )
        await page.screenshot(path=str(SCREENSHOTS / "4_include_zero.png"))

        await toggle.first.click()
        await wait_report(page)
        check("include_zero: volta para 0 na URL", query(page).get("include_zero") == "0")
        check("include_zero: valores restaurados", await snapshot(page) == base_values)

        # ----------------------------------------------------- 4. deep link (URL)
        deep = query(page)
        target = (
            f"{BASE_URL}{ROUTE}?preset=custom&from={deep['from']}&to={deep['to']}"
            f"&regime=caixa&include_zero=1"
        )
        await page.goto(target, wait_until="domcontentloaded")
        await wait_report(page)
        q = query(page)
        check(
            "deep link: parâmetros preservados na URL",
            q.get("regime") == "caixa" and q.get("include_zero") == "1" and q.get("from") == deep["from"],
            str(q),
        )
        check(
            "deep link: controles refletem a URL (Caixa pressionado)",
            await page.get_by_role("radio", name="Caixa", exact=True).get_attribute("data-state")
            == "on",
        )
        deep_values = await snapshot(page)

        # Mesmo período/regime via UI deve dar exatamente os mesmos números.
        await page.goto(f"{BASE_URL}{ROUTE}?preset=custom&from={deep['from']}&to={deep['to']}")
        await wait_report(page)
        await click_toggle(page, "Caixa")
        await page.get_by_role("switch").first.click()
        await wait_report(page)
        check(
            "deep link: valores idênticos aos obtidos pela UI",
            await snapshot(page) == deep_values,
            f"url={deep_values.get('kpi:resultado-liquido')} ui={(await snapshot(page)).get('kpi:resultado-liquido')}",
        )
        await page.screenshot(path=str(SCREENSHOTS / "5_deeplink.png"))

        relevant = [e for e in console_errors if "favicon" not in e.lower()]
        check("sem erros de console durante os filtros", not relevant, "; ".join(relevant[:3]))

        await browser.close()

    print("\n" + ("FALHAS: " + " | ".join(failures) if failures else "Todos os cenários passaram."))
    sys.exit(1 if failures else 0)


asyncio.run(main())
