## Objetivo
Publicar as correções de SEO aplicadas (sitemap.xml, llms.txt, JSON-LD, OG por rota, H1 em /auth) e validar os metadados em produção.

## Passos

1. **Pré-flight de publish**
   - Rodar `security--get_scan_results` para confirmar que não há findings críticos pendentes que bloqueiem o publish.
   - Confirmar que `index.html` tem title, description, canonical, OG e JSON-LD coerentes (já feito no turno anterior).

2. **Publicar em produção**
   - Chamar `preview_ui--publish` com `website_info_status="already_relevant"` e um `website_info_summary` descrevendo title, description, OG, JSON-LD, sitemap e robots verificados.
   - Aguardar ~1min para a propagação em `https://gestorplin.com`.

3. **Validação pós-publish via Lighthouse (headless Chrome)**
   - Executar Lighthouse CLI em sandbox contra `https://gestorplin.com` focado nas categorias `seo` e `best-practices` (mobile, depois desktop).
   - Salvar relatório JSON em `/tmp/lighthouse/` e extrair:
     - Score SEO (alvo ≥ 95)
     - Auditorias: `document-title`, `meta-description`, `canonical`, `http-status-code`, `robots-txt`, `hreflang`, `is-crawlable`, `structured-data`, `viewport`.
   - Validar manualmente via `curl`:
     - `https://gestorplin.com/sitemap.xml` → 200 + XML válido
     - `https://gestorplin.com/robots.txt` → contém `Sitemap:`
     - `https://gestorplin.com/llms.txt` → 200
     - `<head>` da home contém JSON-LD `Organization` + `WebSite`.

4. **Validação de OG por rota (crawlers sem JS)**
   - Lembrar o usuário que `<Helmet>` só atualiza `<head>` no client; previews sociais de `/auth` e `/privacidade` mostrarão os tags estáticos do `index.html`. Documentar isso como limitação conhecida (SPA sem SSR).

5. **Reportar resultados**
   - Resumo com: score Lighthouse SEO, lista de auditorias com pass/fail, URLs validadas (sitemap/robots/llms), próximos passos opcionais (ex: Search Console, submeter sitemap).
   - Marcar como `fixed` no `seo_chat--update_findings` quaisquer findings ainda pendentes que o Lighthouse confirmar resolvidos.

## Observações técnicas
- Lighthouse será executado em sandbox com `npx lighthouse <url> --only-categories=seo,best-practices --output=json --chrome-flags="--headless --no-sandbox"`.
- Não haverá mudança de código a menos que o Lighthouse aponte um novo problema; nesse caso, retorno com um plano de correção antes de aplicar.
