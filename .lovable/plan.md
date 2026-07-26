## 1. Anexo 1 — "Data bloqueada" mostrando "Liberado manualmente"

O card do dia mistura dois estados: o cabeçalho vermelho continua dizendo *DATA BLOQUEADA* mesmo quando existe um override de liberação, e o motivo exibido é justamente "Liberado manualmente pelo administrador".

Ajuste: derivar um único estado efetivo do dia (`bloqueada` | `liberada-por-override` | `livre`) e renderizar um bloco coerente:

- Liberada por override: card verde, título **DATA LIBERADA**, texto "Liberada manualmente — a regra de bloqueio segue ativa nos demais dias", badge com escopo (unidade/global) e botão **Bloquear novamente**.
- Bloqueada: card vermelho atual, com o motivo real da regra e botão **Liberar Data**.

## 2. Anexo 2 — Preview do contracheque fica "processando" para sempre

Ao abrir o olho de um documento já aprovado, a tela de revisão em lote é reaberta e entra no estado de polling de OCR, que nunca finaliza porque o lote já foi encerrado.

Ajuste: o ícone de olho em documentos já aprovados deve abrir apenas o visualizador do arquivo (`DocumentPreview`), sem passar pelo fluxo de revisão em lote. Adicionalmente, o painel de revisão só entra em estado de processamento quando o lote está com status ativo — lotes concluídos renderizam o resultado direto, com timeout/fallback caso o progresso não avance.

## 3. Anexo 3 — Rolagem lateral no Financeiro + header diferente do DP

Overflow: as barras de filtro do Dashboard (período e status) são pílulas em linha que estouram a largura no mobile.

- Tornar as barras de filtro roláveis apenas dentro do próprio container (scroll horizontal contido, sem barra visível), e o `main` com `overflow-x-hidden`.
- Reduzir padding/tamanho das pílulas no mobile.

Header: hoje `AppHeader` (financeiro, `h-12`) e `DpHeader` (`h-14`, fundo branco translúcido, botão Hub sempre visível, favoritos) divergem.

Sugestão: unificar em um único componente de header de app com a mesma altura, mesmo espaçamento e mesma ordem de elementos — `trigger da sidebar · atalho Hub · seletor de contexto · espaço · ações do módulo (privacidade/favorito) · sino`. Cada módulo apenas injeta suas ações específicas. Assim as duas telas ficam visualmente idênticas.

## 4. Anexos 4 e 5 — Cards grandes demais no mobile

- KPIs do Dashboard: reduzir de `min-h-[130px]`/`p-5` para uma variante compacta no mobile (`p-3.5`, altura livre, valor em `text-xl`, rótulo `text-[10px]`), mantendo o tamanho atual a partir de `md`.
- Mesma compactação nos 4 cards do Calendário Geral do DP (Folgas marcadas / Vagas / Dias lotados / Capacidade), que hoje ocupam quase uma tela inteira.
- Opcional (recomendado): no mobile, agrupar os 4 KPIs numa faixa de 2 colunas mais densa, ganhando cerca de 30% de altura de tela.

## 5. Gestos de swipe

Proposta de comportamento (mobile apenas):

- Arrastar da borda **esquerda para a direita** → abre o menu lateral completo (hoje esse gesto faz "voltar").
- Arrastar da borda **direita para a esquerda** → navega para o `/hub`.
- Bloqueios: ignorar quando houver dialog/sheet aberto, ao arrastar sobre listas/carrosséis horizontais, e exigir gesto iniciado na borda (24px) com deslocamento mínimo.

Observação: isso substitui o "voltar por swipe" atual. Para não perder navegação, mantenho o botão de voltar nas telas internas. Uma alternativa é manter "voltar" na borda esquerda e abrir o menu com swipe iniciado **fora** da borda — mas isso costuma disparar sem querer; recomendo a primeira opção.

### Detalhes técnicos

- `DpCalendarDayDialog` / `DataRow`: estado efetivo do dia calculado por `src/lib/dp/bloqueio-rules.ts`, reaproveitando a mutação `rebloquear` já existente.
- `BulkReviewInline` / `BulkImportPanel`: separar "visualizar documento aprovado" de "revisar lote"; encerrar polling quando `status !== 'processing'`.
- `Dashboard.tsx`: containers de filtro com `overflow-x-auto` + `no-scrollbar`; KPI grid com classes responsivas.
- Novo `AppHeaderBase` compartilhado por `AppHeader` e `DpHeader`.
- `useEdgeSwipeBack` renomeado/reescrito como `useEdgeGestures`, integrando com o contexto da sidebar (`useSidebar().setOpenMobile`) e `navigate('/hub')`.
