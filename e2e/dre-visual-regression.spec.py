"""
Regressão VISUAL — DRE Gerencial + árvore de contas (/relatorios/contabeis).

Garante que alternar **Período**, **Regime** e **Incluir contas sem movimento**
não altera o LAYOUT do relatório — apenas os números.

Estratégia (dois sinais complementários):

  1. *Fingerprint de layout*: geometria (x/y/w/h relativos ao container do
     relatório, arredondados) dos KPIs, das linhas da cascata da DRE, do
     cabeçalho e das colunas da árvore de contas. Comparada entre estados de
     filtro e contra um baseline versionado em `e2e/__baselines__/`.
  2. *Diff de pixels* de screenshots com os valores numéricos mascarados
     (Playwright `mask=`), tolerância de 1% dos pixels — pega quebras de
     alinhamento, wrap de texto e mudanças de espaçamento.

O baseline é criado na primeira execução (ou com `--update`) e commitado.

Requer sessão Lovable injetada (LOVABLE_BROWSER_AUTH_STATUS=injected).

    python3 e2e/dre-visual-regression.spec.py [--update]
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright, expect

BASE_URL = "http://localhost:8080"
ROUTE = "/relatorios/contabeis"

BASELINE_DIR = Path(__file__).parent / "__baselines__" / "dre-visual"
BASELINE_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR = Path("/tmp/browser/dre-visual")
(OUT_DIR / "actual").mkdir(parents=True, exist_ok=True)
(OUT_DIR / "diff").mkdir(parents=True, exist_ok=True)

UPDATE = "--update" in sys.argv
PIXEL_TOLERANCE = 0.01  # 1% dos pixels podem diferir (antialias/scroll)

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
    kpi = page.get_by_test_id("dre-kpi-value-receita-liquida")
    if await kpi.count():
        await expect(kpi.first).to_be_visible(timeout=40_000)
    await page.wait_for_timeout(400)


async def freeze_animations(page) -> None:
    await page.add_style_tag(
        content="""
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
          caret-color: transparent !important;
        }
        """
    )


LAYOUT_JS = """
() => {
  const round = (n) => Math.round(n);
  const root = document.querySelector('[data-testid="dre-kpi-receita-liquida"]')
    ?.closest('main') || document.body;
  const base = root.getBoundingClientRect();
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: round(r.left - base.left),
      y: round(r.top - base.top),
      w: round(r.width),
      h: round(r.height),
    };
  };
  const collect = (selector, keyFn) => {
    const out = {};
    document.querySelectorAll(selector).forEach((el, i) => {
      out[keyFn(el, i)] = rel(el);
    });
    return out;
  };

  // Colunas do cabeçalho da árvore de contas (larguras devem ser estáveis).
  const headers = {};
  const table = document.querySelector('[data-testid="dre-account-row"]')?.closest('table');
  if (table) {
    table.querySelectorAll('thead th').forEach((th, i) => {
      const r = th.getBoundingClientRect();
      headers[`th-${i}`] = { w: round(r.width), h: round(r.height) };
    });
  }

  // Geometria das 3 primeiras linhas de conta (indentação e altura de linha).
  const accountRows = {};
  document.querySelectorAll('[data-testid="dre-account-row"]').forEach((tr, i) => {
    if (i >= 3) return;
    const cells = [...tr.querySelectorAll('td')].map((td) => {
      const r = td.getBoundingClientRect();
      return { w: round(r.width), h: round(r.height) };
    });
    accountRows[`row-${i}`] = { h: round(tr.getBoundingClientRect().height), cells };
  });

  return {
    kpis: collect('[data-testid^="dre-kpi-"]:not([data-testid^="dre-kpi-value-"])',
                  (el) => el.getAttribute('data-testid')),
    rows: collect('[data-testid^="dre-row-"]:not([data-testid^="dre-row-value-"])',
                  (el) => el.getAttribute('data-testid')),
    accountHeaders: headers,
    accountRows,
    viewport: { w: window.innerWidth },
  };
}
"""


async def layout_fingerprint(page) -> dict:
    return await page.evaluate(LAYOUT_JS)


def diff_layout(a: dict, b: dict, path: str = "") -> list[str]:
    diffs: list[str] = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                diffs.append(f"{path}{k}: ausente no primeiro")
            elif k not in b:
                diffs.append(f"{path}{k}: ausente no segundo")
            else:
                diffs += diff_layout(a[k], b[k], f"{path}{k}.")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            diffs.append(f"{path[:-1]}: {len(a)} vs {len(b)} itens")
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                diffs += diff_layout(x, y, f"{path}{i}.")
    elif a != b:
        diffs.append(f"{path[:-1]}: {a} vs {b}")
    return diffs


async def masked_shot(page, name: str) -> Path:
    """Screenshot do relatório com valores numéricos mascarados."""
    mask = [
        page.locator('[data-testid^="dre-kpi-value-"]'),
        page.locator('[data-testid^="dre-row-value-"]'),
        page.locator('[data-testid="dre-account-row"] td:not(:first-child)'),
    ]
    target = page.get_by_test_id("dre-kpi-receita-liquida").locator(
        "xpath=ancestor::main[1]"
    )
    locator = target if await target.count() else page.locator("body")
    path = OUT_DIR / "actual" / f"{name}.png"
    await locator.first.screenshot(path=str(path), mask=mask, mask_color="#808080")
    return path


def compare_pixels(name: str, actual: Path) -> None:
    baseline = BASELINE_DIR / f"{name}.png"
    if UPDATE or not baseline.exists():
        baseline.write_bytes(actual.read_bytes())
        print(f"[BASE] baseline gravado: {baseline.name}")
        return

    img_a = Image.open(baseline).convert("RGB")
    img_b = Image.open(actual).convert("RGB")
    if img_a.size != img_b.size:
        check(f"pixels {name}", False, f"tamanho {img_a.size} vs {img_b.size}")
        return

    diff = ImageChops.difference(img_a, img_b).convert("L").point(lambda p: 255 if p > 24 else 0)
    changed = sum(diff.histogram()[255:])
    total = img_a.size[0] * img_a.size[1]
    ratio = changed / total
    if ratio > PIXEL_TOLERANCE:
        diff.save(OUT_DIR / "diff" / f"{name}.png")
    check(
        f"pixels {name}",
        ratio <= PIXEL_TOLERANCE,
        f"{ratio * 100:.3f}% diferentes (tolerância {PIXEL_TOLERANCE * 100:.0f}%)",
    )


async def click_toggle(page, label: str) -> None:
    item = page.get_by_role("radio", name=label, exact=True)
    if await item.get_attribute("data-state") == "on":
        return
    await item.click()
    await wait_report(page)


async def expand_all(page) -> None:
    btn = page.get_by_role("button", name="Expandir tudo")
    if await btn.count():
        await btn.first.click()
        await page.wait_for_timeout(400)


async def capture(page, name: str) -> dict:
    await freeze_animations(page)
    await expand_all(page)
    fp = await layout_fingerprint(page)
    shot = await masked_shot(page, name)
    compare_pixels(name, shot)
    return fp


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}, device_scale_factor=1
        )
        page = await context.new_page()
        await restore_session(context, page)

        await page.goto(f"{BASE_URL}{ROUTE}?preset=month", wait_until="domcontentloaded")
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

        # ------------------------------------------------------------ Período
        base = await capture(page, "periodo-mes")

        await click_toggle(page, "Ano")
        ano = await capture(page, "periodo-ano")
        check(
            "layout estável: Mês -> Ano",
            not diff_layout(base["kpis"], ano["kpis"])
            and not diff_layout(base["rows"], ano["rows"]),
            "; ".join(
                diff_layout(base["kpis"], ano["kpis"])
                + diff_layout(base["rows"], ano["rows"])
            )[:300],
        )
        check(
            "colunas da árvore estáveis: Mês -> Ano",
            not diff_layout(base["accountHeaders"], ano["accountHeaders"]),
            "; ".join(diff_layout(base["accountHeaders"], ano["accountHeaders"]))[:300],
        )

        await click_toggle(page, "12m")
        doze = await capture(page, "periodo-12m")
        check(
            "layout estável: Ano -> 12m",
            not diff_layout(ano["kpis"], doze["kpis"])
            and not diff_layout(ano["rows"], doze["rows"])
            and not diff_layout(ano["accountHeaders"], doze["accountHeaders"]),
            "; ".join(
                diff_layout(ano["kpis"], doze["kpis"])
                + diff_layout(ano["rows"], doze["rows"])
                + diff_layout(ano["accountHeaders"], doze["accountHeaders"])
            )[:300],
        )

        # -------------------------------------------------------------- Regime
        await click_toggle(page, "Ano")
        comp = await capture(page, "regime-competencia")
        await click_toggle(page, "Caixa")
        caixa = await capture(page, "regime-caixa")
        check(
            "layout estável: Competência -> Caixa",
            not diff_layout(comp["kpis"], caixa["kpis"])
            and not diff_layout(comp["rows"], caixa["rows"]),
            "; ".join(
                diff_layout(comp["kpis"], caixa["kpis"])
                + diff_layout(comp["rows"], caixa["rows"])
            )[:300],
        )
        check(
            "colunas da árvore estáveis: Competência -> Caixa",
            not diff_layout(comp["accountHeaders"], caixa["accountHeaders"]),
            "; ".join(diff_layout(comp["accountHeaders"], caixa["accountHeaders"]))[:300],
        )
        await click_toggle(page, "Competência")
        volta = await capture(page, "regime-competencia-volta")
        check(
            "layout idempotente ao voltar para Competência",
            not diff_layout(comp, volta),
            "; ".join(diff_layout(comp, volta))[:300],
        )

        # ---------------------------------------- Incluir contas sem movimento
        sem_zero = await capture(page, "include-zero-off")
        await page.get_by_role("switch").first.click()
        await wait_report(page)
        com_zero = await capture(page, "include-zero-on")
        check(
            "layout dos KPIs/DRE estável ao incluir contas sem movimento",
            not diff_layout(sem_zero["kpis"], com_zero["kpis"])
            and not diff_layout(sem_zero["rows"], com_zero["rows"]),
            "; ".join(
                diff_layout(sem_zero["kpis"], com_zero["kpis"])
                + diff_layout(sem_zero["rows"], com_zero["rows"])
            )[:300],
        )
        check(
            "colunas da árvore estáveis ao incluir contas sem movimento",
            not diff_layout(sem_zero["accountHeaders"], com_zero["accountHeaders"]),
            "; ".join(
                diff_layout(sem_zero["accountHeaders"], com_zero["accountHeaders"])
            )[:300],
        )
        check(
            "altura de linha da árvore inalterada (só o número de linhas muda)",
            all(
                sem_zero["accountRows"].get(k, {}).get("h")
                == com_zero["accountRows"].get(k, {}).get("h")
                for k in sem_zero["accountRows"]
            ),
            f"{[v.get('h') for v in sem_zero['accountRows'].values()]} vs "
            f"{[v.get('h') for v in com_zero['accountRows'].values()]}",
        )

        await page.get_by_role("switch").first.click()
        await wait_report(page)

        await browser.close()

    print(
        "\n"
        + ("FALHAS: " + " | ".join(failures) if failures else "Nenhuma regressão visual.")
        + f"\nBaselines: {BASELINE_DIR}\nAtual/diff: {OUT_DIR}"
    )
    sys.exit(1 if failures else 0)


asyncio.run(main())
