# Tela Folgas com abas

Unificar tudo que envolve folgas em uma única tela chamada **Folgas**, seguindo o mesmo padrão de abas já usado em Cargos e Salários.

## Estrutura final

Rota principal: `/dp/folgas` — título "Folgas", com 4 abas:

1. **Calendário** — o calendário de folgas atual (conteúdo de hoje em `/dp/folgas/calendario`).
2. **Regras** — regras de folgas e, na mesma aba, o bloco de Datas Bloqueadas (duas seções na mesma tela: primeiro as regras/jornada, depois a lista de datas bloqueadas com seus botões de cadastro/exclusão).
3. **Solicitações** — a tela atual de solicitações de folga.
4. **Trocas** — a tela atual de trocas.

Nenhuma funcionalidade é removida: cada tela vira o conteúdo de uma aba, mantendo filtros, diálogos e permissões.

## Menu

No grupo **Rotina** o menu passa a ter um único item **Folgas** (`/dp/folgas`), substituindo os itens hoje separados: Calendário Geral, Solicitações, Trocas, Datas Bloqueadas e Regras de Folgas. Painel da Operação, Convocações, Férias e Conformidade DSR seguem como estão.

## Detalhes técnicos

- `src/pages/dp/DpFolgasHub.tsx` é substituído por uma casca com `DpPage` + `DpPageHeader` + `DpTabsBar`, controlada por query param `?aba=calendario|regras|solicitacoes|trocas` (mesmo padrão de `DpCargos.tsx`), com `calendario` como padrão.
- Os corpos de `DpFolgas.tsx`, `cadastros/DpConfiguracoesJornada.tsx`, `DpBloqueios.tsx` e `DpTrocas.tsx` são extraídos para painéis (`src/components/dp/folgas/*Panel.tsx`) sem cabeçalho/`Helmet` próprio, renderizados dentro das abas. `DpSolicitacoes.tsx` entra como painel na aba Solicitações mantendo seu uso atual.
- Cada aba monta seu painel sob demanda (lazy), preservando o comportamento de carregamento atual.
- Redirecionamentos em `src/App.tsx` para não quebrar links e favoritos salvos:
  - `/dp/folgas/calendario` → `/dp/folgas?aba=calendario`
  - `/dp/folgas/configuracoes/regras` e `/dp/cadastros/regras-jornada` → `/dp/folgas?aba=regras`
  - `/dp/bloqueios` → `/dp/folgas?aba=regras`
  - `/dp/solicitacoes` → `/dp/folgas?aba=solicitacoes`
  - `/dp/trocas` → `/dp/folgas?aba=trocas`
- `src/config/dpNavigation.tsx`: item único "Folgas", `matchPrefixes` do grupo Rotina ajustados e atalhos/favoritos antigos remapeados para a nova rota. O portal do colaborador (`/dp/meu/*`) não muda.
