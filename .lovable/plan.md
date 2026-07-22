## Diagnóstico

O dia **08/08/2026** aparece "disponível" porque a página que você está vendo — `/dp/folgas/calendario` (**Calendário Geral** → `src/pages/dp/DpFolgas.tsx`) — **não** consulta `dp_bloqueio_regras` nem `dp_datas_bloqueadas`. Ela mostra apenas folgas confirmadas/pendentes e ignora o motor de bloqueios.

O motor de regras que corrigimos na última etapa está aplicado apenas em `/dp/calendario` (`DpAdminCalendario.tsx`). Nele, o dia 08/08 aparece corretamente bloqueado (regra "Bloqueio Pós-Pagamento (FDS após dia 5)" + registro manual em `dp_datas_bloqueadas` com `liberada:false`).

Confirmado via banco:
- Regra ativa `pos_pagamento` com `meses:[1..12]` → expande 08/08/2026 (sábado após dia 5).
- Registro em `dp_datas_bloqueadas` para 2026-08-08, `liberada = false`.
- Nenhuma requisição a `dp_datas_bloqueadas`/`dp_bloqueio_regras` na sessão atual — a página não busca esses dados.

## O que fazer

Integrar o mesmo motor de bloqueios ao Calendário Geral, mantendo a UI atual:

1. Em `src/pages/dp/DpFolgas.tsx`, adicionar duas queries paralelas (padrão idêntico ao `DpAdminCalendario`):
   - `dp_bloqueio_regras` (ativas) + `dp_bloqueio_regra_unidades`.
   - `dp_datas_bloqueadas` no intervalo visível.
2. Construir um `Map<iso, { reason, auto }>` mesclando:
   - Bloqueios manuais não liberados (`liberada = false` **e** `liberada_por_solicitacao IS NULL`).
   - Regras expandidas via `buildBloqueiosDeRegras`, respeitando o filtro de unidade já existente na página (quando houver; senão `null` = visão global).
   - Manual tem precedência sobre regra; datas com `liberada = true` são removidas do mapa.
3. Na renderização de cada célula:
   - Se `iso` estiver no mapa → aplicar estilo `blocked` (fundo `bg-destructive/15`, borda `border-destructive/40`), badge "Bloqueado", esconder chip de ocupação, `title`/tooltip com o motivo.
   - Ordem de precedência: `past` > `blocked` > estados existentes (folga, pendente, disponível).
4. Atualizar a legenda "Bloqueado" para refletir bloqueios manuais **e** de regra (texto/cor já existem).
5. Se o dia bloqueado for clicado, manter o `DpCalendarDayDialog` atual, apenas exibindo o motivo do bloqueio no topo (sem ação de "Liberar" — essa fica restrita ao `/dp/calendario` do admin, para não duplicar fluxo).

## Verificação

- Abrir `/dp/folgas/calendario` em agosto/2026 → 08/08 e 09/08 aparecem com fundo vermelho e badge "Bloqueado".
- Hover mostra o motivo (regra Pós-Pagamento ou motivo manual).
- Dias liberados manualmente pelo admin (`liberada=true`) voltam a aparecer disponíveis.
- Paridade visual com `/dp/calendario`.

## Arquivos

- `src/pages/dp/DpFolgas.tsx` (única alteração).
- Reuso: `src/lib/dp/bloqueio-rules.ts` (sem mudanças).
