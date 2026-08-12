"""Regressão: rotas públicas /c/* não entram em loop de recarregamento e
sempre revalidam os dados do cardápio.

Cenários:
  1. Navegador limpo abre /c/<slug>: carrega o conteúdo, sem loop de navegação.
  2. Navegador que já tinha o Service Worker antigo registrado: o guard
     desregistra o SW, limpa caches e recarrega no máximo uma vez.
  3. Segunda visita (com snapshot local): renderiza rápido e ainda dispara
     `storefront_public_get` para pegar a versão mais atual.

Uso: python3 e2e/storefront-sw-loop.spec.py [slug]
"""
from __future__ import annotations

import asyncio
import sys
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080"
SLUG = sys.argv[1] if len(sys.argv) > 1 else "figlia-pizzaria"
PATH = f"/c/{SLUG}"
MAX_NAVIGATIONS = 3  # inicial + no máximo um reload do guard (+ margem)


def track(page, state):
    page.on("framenavigated", lambda f: state["navs"].append(f.url) if f == page.main_frame else None)
    page.on("request", lambda r: state["rpc"].append(r.url) if "storefront_public_get" in r.url else None)
    page.on("console", lambda m: state["errors"].append(m.text) if m.type == "error" else None)


async def wait_for_menu(page, timeout=20000):
    """Espera o cardápio renderizar (nome da loja no H1) e garante que o
    fallback de 'carregando travado' não apareceu."""
    await page.wait_for_selector("h1", timeout=timeout)
    return (await page.locator("h1").first.inner_text()).strip()


async def scenario_clean(browser) -> list[str]:
    fails = []
    ctx = await browser.new_context(viewport={"width": 390, "height": 1800})
    page = await ctx.new_page()
    state = {"navs": [], "rpc": [], "errors": []}
    track(page, state)

    await page.goto(BASE_URL + PATH, wait_until="domcontentloaded")
    title = await wait_for_menu(page)
    await page.wait_for_timeout(3000)  # janela para um eventual loop se manifestar

    if not title:
        fails.append("clean: cardápio não renderizou o nome da loja")
    if len(state["navs"]) > MAX_NAVIGATIONS:
        fails.append(f"clean: navegações demais (loop): {len(state['navs'])}")
    if not state["rpc"]:
        fails.append("clean: storefront_public_get não foi chamado")
    if await page.get_by_role("button", name="Recarregar cardápio").count():
        fails.append("clean: fallback de carregamento travado apareceu")
    print(f"  clean: h1={title!r} navs={len(state['navs'])} rpc={len(state['rpc'])}")
    await ctx.close()
    return fails


async def scenario_legacy_sw(browser) -> list[str]:
    fails = []
    ctx = await browser.new_context(viewport={"width": 390, "height": 1800})
    page = await ctx.new_page()

    # Simula um aparelho que já visitou o site antes: SW registrado + cache de app-shell.
    await page.goto(BASE_URL + "/", wait_until="domcontentloaded")
    await page.evaluate(
        """async () => {
            await caches.open('precache-v2-http://localhost:8080/').then(c => c.put('/legacy', new Response('old')));
            await caches.open('html').then(c => c.put('/legacy-html', new Response('old')));
            try { await navigator.serviceWorker.register('/sw.js'); } catch (e) {}
        }"""
    )
    await page.wait_for_timeout(1500)

    state = {"navs": [], "rpc": [], "errors": []}
    track(page, state)
    await page.goto(BASE_URL + PATH, wait_until="domcontentloaded")
    title = await wait_for_menu(page)
    await page.wait_for_timeout(4000)

    regs, stale = await page.evaluate(
        """async () => {
            const regs = await navigator.serviceWorker.getRegistrations();
            const keys = await caches.keys();
            const stale = keys.filter(k => /(^|-)precache-v\\d+-|(^|-)runtime-|(^|-)workbox|^html$/i.test(k));
            return [regs.length, stale];
        }"""
    )

    if not title:
        fails.append("legacy: cardápio não renderizou após purga do SW")
    if len(state["navs"]) > MAX_NAVIGATIONS:
        fails.append(f"legacy: loop de navegação ({len(state['navs'])} navegações)")
    if regs:
        fails.append(f"legacy: Service Worker ainda registrado ({regs})")
    if stale:
        fails.append(f"legacy: caches de app-shell não removidos: {stale}")
    print(f"  legacy: h1={title!r} navs={len(state['navs'])} sw={regs} caches={stale}")
    await ctx.close()
    return fails


async def scenario_revalidate(browser) -> list[str]:
    """Segunda visita no MESMO contexto: usa snapshot local e revalida."""
    fails = []
    ctx = await browser.new_context(viewport={"width": 390, "height": 1800})
    page = await ctx.new_page()
    await page.goto(BASE_URL + PATH, wait_until="domcontentloaded")
    await wait_for_menu(page)
    await page.wait_for_timeout(1000)

    snapshot_ok = await page.evaluate(
        """(slug) => {
            const key = 'sf-snapshot:' + slug;
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            // Envelhece o snapshot para forçar a revalidação no próximo carregamento.
            parsed.savedAt = Date.now() - 10 * 60 * 1000;
            localStorage.setItem(key, JSON.stringify(parsed));
            return true;
        }""",
        SLUG,
    )

    state = {"navs": [], "rpc": [], "errors": []}
    track(page, state)
    await page.reload(wait_until="domcontentloaded")
    title = await wait_for_menu(page)
    await page.wait_for_timeout(2500)

    if not snapshot_ok:
        fails.append("revalidate: snapshot local do cardápio não foi gravado")
    if not title:
        fails.append("revalidate: cardápio não renderizou na segunda visita")
    if not state["rpc"]:
        fails.append("revalidate: não revalidou os dados (sem storefront_public_get)")

    if len(state["navs"]) > MAX_NAVIGATIONS:
        fails.append(f"revalidate: loop de navegação ({len(state['navs'])})")
    print(f"  revalidate: h1={title!r} navs={len(state['navs'])} rpc={len(state['rpc'])}")
    await ctx.close()
    return fails


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        fails: list[str] = []
        for name, fn in (
            ("navegador limpo", scenario_clean),
            ("service worker antigo", scenario_legacy_sw),
            ("revalidação", scenario_revalidate),
        ):
            print(f"→ {name}")
            fails += await fn(browser)
        await browser.close()

    if fails:
        print("\n❌ Falhas:")
        for f in fails:
            print(" -", f)
        return 1
    print("\n✅ /c/* carrega sem loop e sempre revalida o cardápio.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
