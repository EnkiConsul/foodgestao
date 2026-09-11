# Arrastar para cima/baixo para atualizar a tela (pull-to-refresh)

## O que muda para o usuário

- No celular, ao arrastar a tela para baixo no topo da página, aparece um indicador girando e a tela atual **recarrega os dados** (pendências, escalas, férias, lançamentos etc.) sem precisar sair e voltar da tela.
- Vale para todas as telas do app no mobile: Financeiro, Pessoas 360°, Portal do Colaborador e Conta.
- O gesto de arrastar da borda esquerda/direita continua igual (voltar / menu Mais).

## Como será feito

- O projeto já tem o componente `PullToRefresh` (`src/components/mobile/PullToRefresh.tsx`), hoje sem uso. Ele será ativado envolvendo o conteúdo principal nos shells das telas.
- Ao disparar o gesto, o app invalida as consultas em cache (React Query) da tela atual — os dados são buscados de novo no servidor sem recarregar a página.
- O gesto só arma quando a tela está rolada até o topo, para não brigar com a rolagem normal.

## Detalhes técnicos

- Envolver o `<Outlet />` em `src/components/dp/DpShell.tsx` e no shell financeiro/conta com `PullToRefresh`.
- `onRefresh` chama `queryClient.invalidateQueries()` do `QueryClientProvider` (refetch das queries ativas da rota visível).
- Manter o indicador existente (seta que gira → spinner).
- Teste simples do comportamento de decisão (só dispara no topo, respeita threshold) se houver lógica extraída; caso contrário, validação visual via Playwright no viewport mobile.
- Sem mudanças no banco de dados.
