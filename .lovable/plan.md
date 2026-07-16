## Escopo confirmado

Auditoria **somente do front-end** do módulo DP contra `pakere1996/portalcolaborador@main`.
Ficam **fora**: schema Supabase, RLS, RPCs, edge functions, migrations e políticas — cobertos pela auditoria anterior em `/mnt/documents/auditoria-dp-360food.md`.

## Eixos auditados (versão front-only)

1. **Estrutura de telas e navegação** — rotas, hierarquia, menus/sidebars, breadcrumbs, redirects.
2. **Layout e componentes de UI** — grids, cards, tabelas, formulários, modais, drawers, tabs; componentes shadcn usados; estados (loading/empty/erro/sucesso); responsividade.
3. **Identidade visual** — paleta, tipografia, espaçamentos, bordas/sombras, tokens, logomarca.
4. **Regras de negócio *visíveis no front*** — validações de formulário, máquinas de estado renderizadas (badges, transições, botões condicionais), fluxos de UI (wizards, popouts, confirmações).
5. **Integrações client-side** — uso de TanStack Query (keys, invalidations), Supabase Realtime no cliente, toasts/alerts, tratamento de erro na UI.

## Metodologia (100% read-only)

### Fase 1 — Extração do front do repositório referência
- Baixar árvore de `src/` do repo via API do GitHub (`git/trees?recursive=1`).
- Priorizar: `src/pages/**`, `src/components/**`, `src/routes/**`, `src/hooks/**`, `src/lib/**`, `src/App.tsx`, `src/main.tsx`, `tailwind.config*`, `src/index.css`, `src/globals.css`, `AI_RULES.md`.
- Paralelizar leitura via `acp_subagent--explore` (1 subagente para páginas, 1 para componentes, 1 para tokens/design). Cada subagente devolve um resumo estruturado (rotas, props, estados, tokens) — não código bruto — para não estourar contexto.

### Fase 2 — Inventário do front local
- Ler em paralelo `src/pages/dp/**`, `src/components/dp/**`, `src/hooks/useDp*.tsx`, `src/App.tsx` (rotas DP), `src/index.css` (tokens `--dp-*`), `tailwind.config.ts`, `src/components/layout/sidebar-menus/DpMenu.tsx` e `PortalMenu.tsx`.
- Extrair: mapa de rotas DP, árvore de componentes por página, tokens de cor, estados renderizados.

### Fase 3 — Matriz por eixo
Para cada tela do referência, uma linha por item verificável:
`# | Eixo | Item da doc | Status | Arquivo(s) local | Arquivo(s) ref | Evidência`
Status = ✅ / ⚠️ / ❌ / ➕ / ❓.
Meta: **80–120 linhas** cobrindo os 5 eixos (front-only).

### Fase 4 — Detalhamento e severidade
Para cada ⚠️/❌: seção "doc diz X → implementamos Y → impacto Z → severidade S".
Severidade calibrada por: quebra funcional > desvio visual grave > desvio visual leve > cosmético.

### Fase 5 — Plano de correção
Lista ordenada por severidade, com arquivo afetado e risco de regressão. **Sem executar nada.**

## Entrega

- Arquivo `/mnt/documents/auditoria-dp-frontend.md` com o relatório completo (A/B/C/D exatamente no formato pedido).
- Resposta no chat com: sumário executivo (A), matriz consolidada por eixo (contagens ✅/⚠️/❌), top 10 desvios detalhados, plano de correção priorizado. Matriz completa fica no arquivo pela dimensão.

## Ferramentas usadas (read-only)

- `acp_subagent--explore` — extrair páginas/componentes/tokens do repo referência em paralelo.
- `code--fetch_website` + `curl raw.githubusercontent.com` — baixar árvore e arquivos individuais.
- `code--view` + `rg` — inspeção do código local.
- **Nada de** `code--write`, `code--line_replace`, `mv`, `rm`, `supabase--migration`.

## Restrições

- Rotas/componentes existentes localmente que **não constam** na referência viram ➕ FORA DE ESCOPO (não são erro).
- Onde a "documentação" do referência é ambígua (por ser código, não texto), interpreto o **código-fonte** como spec e registro a ambiguidade em nota.
- Se as Ondas 5–8 fecharam um gap identificado na auditoria anterior, o novo status reflete o estado atual — não o histórico.

## Aceite

- [ ] Todos os 5 eixos auditados
- [ ] Cada tela do referência com uma linha na matriz
- [ ] Nenhum arquivo alterado
- [ ] Desvios com severidade + evidência (arquivo:linha dos dois lados)
- [ ] Plano de correção aguardando aprovação
