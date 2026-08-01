"""
E2E de PERFORMANCE — DRE Gerencial em /relatorios/contabeis (navegador real).

Mede, no Chromium com backend real, e impõe orçamentos de tempo para:

  1. Carregamento inicial (cold): navegação -> DRE renderizada com valores.
  2. Carregamento via deep link (warm, cache HTTP/JS quente).
  3. Recálculo ao trocar o Regime (Competência <-> Caixa).
  4. Recálculo ao trocar o Período (Mês -> Ano -> 12m).
  5. Recálculo ao ligar "Incluir contas sem movimento" (volume alto de linhas).
  6. Expandir tudo no detalhamento (custo de render de muitas linhas).
  7. Navegação repetida (5x troca de regime) — média e p95 estáveis.

Também coleta métricas de navegação (TTFB, DOMContentLoaded, LCP quando
disponível) e falha se algum orçamento for excedido.

Requer sessão Lovable injetada (LOVABLE_BROWSER_AUTH_STATUS=injected).

    python3 e2e/dre-performance.spec.py
"""

import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/dre-performance/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8080"
ROUTE = "/relatorios/contabeis"

# Orçamentos em ms. Generosos por rodarem em dev (Vite, sem build de produção,
# sandbox compartilhado) — servem para pegar regressões de ordem de magnitude.
BUDGETS = {
    "load_cold": 20_000,
    "load_warm": 12_000,
    "regime_switch": 8_000,
    "periodo_switch": 8_000,
    "include_zero": 10_000,
    "expandir_tudo": 6_000,
    "regime_p95": 9_000,
}

failures: list[str] = []
timings: dict[str, float] = {}


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "OK  " if condition else "FAIL"
    print(f"[{status}] {label}{(' — ' + detail) if detail else ''}")
    if not condition:
        failures.append(f"{label} {detail}".strip())


def budget(name: str, elapsed_ms: float) -> None:
    limit = BUDGETS[name]
    timings[name] = elapsed_ms
    check(
        f"orçamento {name}",
        elapsed_ms <= limit,
        f"{elapsed_ms:.0f}ms (budget {limit}ms)",
    )


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
    """Espera o fim do recálculo: 'Calculando…' desaparece e há valor no KPI."""
    await expect(page.get_by_text("Calculando…")).to_have_count(0, timeout=40_000)
    kpi = page.get_by_test_id("dre-kpi-value-receita-liquida")
    if await kpi.count():
        await expect(kpi.first).to_be_visible(timeout=40_000)
        await expect(kpi.first).not_to_have_text("", timeout=40_000)


async def measure(page, name: str, action) -> float:
    start = time.perf_counter()
    await action()
    await wait_report(page)
    elapsed = (time.perf_counter() - start) * 1000
    budget(name, elapsed)
    return elapsed


async def nav_metrics(page) -> dict:
    return await page.evaluate(
        """() => {
          const n = performance.getEntriesByType('navigation')[0] || {};
          const lcp = performance.getEntriesByType('largest-contentful-paint');
          const paints = performance.getEntriesByType('paint');
          return {
            ttfb: n.responseStart ? Math.round(n.responseStart - n.startTime) : null,
            dcl: n.domContentLoadedEventEnd
              ? Math.round(n.domContentLoadedEventEnd - n.startTime) : null,
            fcp: paints.length
              ? Math.round(paints.find(p => p.name === 'first-contentful-paint')?.startTime ?? 0)
              : null,
            lcp: lcp.length ? Math.round(lcp[lcp.length - 1].startTime) : null,
          };
        }"""
    )


async def click_toggle(page, label: str) -> bool:
    item = page.get_by_role("radio", name=label, exact=True)
    if await item.get_attribute("data-state") == "on":
        return False
    await item.click()
    return True


async def accept_cookies(page) -> None:
    banner = page.get_by_role("button", name="Aceitar todos")
    if await banner.count():
        await banner.first.click()
        await page.wait_for_timeout(200)


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

        # ------------------------------------------- 1. carregamento inicial (cold)
        start = time.perf_counter()
        await page.goto(f"{BASE_URL}{ROUTE}?preset=month", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="DRE Gerencial")).to_be_visible(
            timeout=40_000
        )
        await wait_report(page)
        budget("load_cold", (time.perf_counter() - start) * 1000)
        await accept_cookies(page)
        await page.screenshot(path=str(SCREENSHOTS / "1_load_cold.png"))

        if await page.get_by_text("Selecione uma empresa no seletor").count():
            print("Nenhuma empresa selecionada no contexto — abortando.")
            sys.exit(2)

        m = await nav_metrics(page)
        print(f"       métricas cold: TTFB={m['ttfb']}ms DCL={m['dcl']}ms "
              f"FCP={m['fcp']}ms LCP={m['lcp']}ms")
        check(
            "métricas de navegação coletadas e finitas",
            m["dcl"] is not None and m["dcl"] >= 0,
            str(m),
        )

        # ------------------------------------------- 2. deep link (warm reload)
        start = time.perf_counter()
        await page.goto(
            f"{BASE_URL}{ROUTE}?preset=year&regime=competencia&include_zero=0",
            wait_until="domcontentloaded",
        )
        await wait_report(page)
        budget("load_warm", (time.perf_counter() - start) * 1000)

        # ------------------------------------------- 3. troca de Regime
        await measure(page, "regime_switch", lambda: click_toggle(page, "Caixa"))
        await page.screenshot(path=str(SCREENSHOTS / "2_regime_caixa.png"))
        await click_toggle(page, "Competência")
        await wait_report(page)

        # ------------------------------------------- 4. troca de Período
        async def periodo_seq():
            for label in ("Mês", "Ano", "12m"):
                await click_toggle(page, label)
                await wait_report(page)

        await measure(page, "periodo_switch", periodo_seq)

        # ------------------------------ 5. incluir contas sem movimento (volume)
        toggle = page.get_by_role("switch").first
        await measure(page, "include_zero", toggle.click)

        # ------------------------------------------- 6. expandir tudo (render)
        expand = page.get_by_role("button", name="Expandir tudo")
        start = time.perf_counter()
        await expand.click()
        await page.wait_for_function(
            "() => document.querySelectorAll('[data-testid=\"dre-account-row\"]').length > 0",
            timeout=20_000,
        )
        rows = await page.get_by_test_id("dre-account-row").count()
        budget("expandir_tudo", (time.perf_counter() - start) * 1000)
        print(f"       linhas de conta renderizadas: {rows}")
        check("expandir tudo renderiza o detalhamento", rows > 0, f"{rows} linhas")
        await page.screenshot(path=str(SCREENSHOTS / "3_expandido.png"))

        # ------------------------- 7. estabilidade: 5 trocas de regime seguidas
        await page.get_by_role("switch").first.click()  # volta include_zero=0
        await wait_report(page)
        samples: list[float] = []
        for i in range(5):
            label = "Caixa" if i % 2 == 0 else "Competência"
            t0 = time.perf_counter()
            await click_toggle(page, label)
            await wait_report(page)
            samples.append((time.perf_counter() - t0) * 1000)
        media = statistics.mean(samples)
        p95 = sorted(samples)[-1]
        print("       amostras regime: " + ", ".join(f"{s:.0f}ms" for s in samples))
        budget("regime_p95", p95)
        check(
            "recálculo de regime não degrada ao repetir",
            samples[-1] <= max(samples[0] * 3, BUDGETS["regime_switch"]),
            f"1ª={samples[0]:.0f}ms última={samples[-1]:.0f}ms média={media:.0f}ms",
        )

        ignore = ("favicon", "cannot be given refs", "download the react devtools")
        relevant = [e for e in console_errors if not any(i in e.lower() for i in ignore)]
        check("sem erros de console durante as medições", not relevant, "; ".join(relevant[:3]))

        await browser.close()

    print("\nResumo de tempos:")
    for k, v in timings.items():
        print(f"  {k:<16} {v:8.0f}ms  (budget {BUDGETS[k]}ms)")

    print("\n" + ("FALHAS: " + " | ".join(failures) if failures else "Todos os orçamentos respeitados."))
    sys.exit(1 if failures else 0)


asyncio.run(main())
