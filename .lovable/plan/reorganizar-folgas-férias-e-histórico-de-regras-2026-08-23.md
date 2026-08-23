# Reorganizar Folgas, Férias e Histórico de Regras

## 1. Conformidade DSR vira aba de Folgas

- A tela `/dp/conformidade-dsr` passa a ser a 5ª aba da tela **Folgas**, com o rótulo **Conformidade** (`/dp/folgas?aba=conformidade`).
- A rota antiga continua funcionando como redirecionamento, para não quebrar favoritos e links internos.
- O item "Conformidade DSR" sai do menu Rotina (a tela é alcançada dentro de Folgas).
- A tela é renderizada em modo embutido (sem título próprio, sem largura limitada), como as demais abas.

## 2. Regras de Férias saem de Folgas e vão para Férias

- A seção de regras de férias (limite de férias simultâneas + períodos bloqueados de férias) sai da aba **Regras** de Folgas.
- A tela **Férias** ganha abas:
  - **Períodos** (conteúdo atual da tela de férias, aba padrão);
  - **Regras** (a seção de regras de férias e períodos bloqueados que estava em Folgas).
- URL: `/dp/ferias?aba=periodos|regras`. `/dp/ferias` continua abrindo Períodos.
- A aba Regras de Folgas mantém apenas: regras de folgas/DSR e Datas Bloqueadas (folgas).

## 3. Histórico de alterações recolhível e detalhado

- O bloco "Histórico de alterações" vai para o **final** da aba Regras de Folgas (depois de Datas Bloqueadas).
- Passa a ser **recolhido por padrão**, expansível por clique, mostrando a quantidade de alterações e a data da última.
- Cada registro passa a detalhar o que mudou de fato:
  - data/hora, autor da alteração e escopo (empresa ou unidade);
  - lista campo a campo com rótulo legível e `valor anterior → valor novo`, apenas dos campos que realmente mudaram;
  - selo de "Ciência confirmada" e a justificativa, quando houver;
  - cada registro também é expansível quando tiver muitos campos alterados.

## Detalhes técnicos

- `src/pages/dp/DpFolgasHub.tsx`: adicionar aba `conformidade` carregando `DpConformidadeDsr` em `DpEmbeddedProvider`; remover `FeriasRegrasSection` do fluxo de Regras; mover histórico para o fim.
- `src/pages/dp/DpConformidadeDsr.tsx`: suportar `useDpEmbedded` (suprimir `Helmet`/`DpPageHeader`).
- Novo `src/pages/dp/DpFeriasHub.tsx` com `Tabs` + `DpTabsBar`; `DpFerias.tsx` adaptado a modo embutido; `FeriasRegrasSection` usada na aba Regras.
- `src/App.tsx`: `/dp/ferias` → `DpFeriasHub`; `/dp/conformidade-dsr` → `Navigate` para `/dp/folgas?aba=conformidade`.
- `src/config/dpNavigation.tsx`: remover item Conformidade DSR; manter prefixos de match.
- Novo componente `src/components/dp/regras/RegrasHistoricoPanel.tsx` (Collapsible do shadcn) que consome `historico` de `useDpConfigDp` e faz o diff de `valor_antigo`/`valor_novo` com um mapa de rótulos dos campos de `dp_config_dp` (novo helper de labels em `src/lib/dp/regras-labels.ts`, com formatação de booleanos, enums e números).
- Nome de quem alterou: resolver `usuario_id` via `profiles`; sem perfil, exibir "Usuário do sistema".
- Sem mudanças de schema; nenhum dado de férias/folgas é migrado.
