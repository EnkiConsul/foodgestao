# Corrigir contador de folgas marcadas no calendário do colaborador

## Problema
No calendário mobile do portal (`/dp/meu/calendario`), o texto do topo diz "Você tem 1 folga em domingo neste mês e 0 já marcada(s)", mesmo com a folga de outubro da Hanna já marcada no dia 31/10.

## Causa confirmada
- `resumoDomingos` em `src/pages/dp/portal/DpMeuCalendario.tsx` conta apenas folgas em dias com `getDay() === 0` (domingo).
- A folga de outubro da Hanna caiu em **sábado, 31/10/2026** (origem `auto_fechamento_periodo`).
- A regra da unidade é Acordo Coletivo (CCT) com dias de descanso negociados `[0, 6]` (sábado e domingo) — então sábado é dia elegível, mas o contador ignora.

## O que será feito
1. **Contagem correta** em `DpMeuCalendario.tsx`: o resumo passa a contar folgas marcadas em qualquer dia elegível da regra da unidade (`diasElegiveis` de `useDpRegrasColaborador`), não só domingos.
2. **Rótulo adequado à regra**: quando a unidade aceita sábado e domingo (CCT), o texto fala em "folga de fim de semana" em vez de "folga em domingo"; quando só domingo é elegível, mantém o texto atual.
3. **Estado preenchido reconhecido**: com a folga de 31/10 contada, o calendário exibe que a cota do mês já está marcada (ex.: "Sua folga de fim de semana deste mês já está marcada"), em vez de pedir para marcar.

## Validação
- Typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`) e build.
- Playwright como Hanna (viewport 360×900) em `/dp/meu/calendario` em outubro: confirmar que o contador mostra 1 folga marcada e o rótulo correto.

## Fora de escopo
- Nada é publicado; só ambiente de teste.
- Não altera regras de negócio, banco de dados nem a folga já agendada da Hanna.
