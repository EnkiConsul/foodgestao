# Distribuição automática de folgas: revisão antes de criar

## O que está errado hoje

Confirmei no banco (setembro/2026, unidade Pakerê Garavelo, 7 pessoas ativas):

- Só a Rosângela (05/09) tem folga **efetivada**. As folgas da Sara (12/09), Rosângela (06/09), Hanna (19/09) e Cristiane (20/09) existem apenas como **pedido aprovado** — aparecem no calendário, mas a contagem da distribuição não olha para elas. Daí "6 pessoas sem folga".
- O pedido da Sara de 13/09 está **cancelado**, mas o calendário exibe os pedidos sem filtrar status, então o nome dela continua aparecendo no dia 13.

## O que vou fazer

1. **Contagem correta**: pedido de folga aprovado passa a valer como folga já marcada, tanto na tela de confirmação quanto na distribuição — ninguém recebe folga em duplicidade.
2. **Calendário limpo**: pedidos cancelados e recusados deixam de aparecer como folga no calendário (continuam na lista de solicitações e no histórico).
3. **Confirmação com lista editável**: ao clicar em "Distribuir folgas automaticamente", em vez de só um número, aparece a lista de quem está sem folga com o dia que o sistema escolheu. Para cada linha o gestor pode:
   - trocar a data (apenas dias de descanso do mês, com aviso quando o dia estiver no limite ou bloqueado);
   - remover a pessoa da geração.
   O botão cria exatamente as folgas que ficaram na lista.
4. **Quando não há nada a fazer**: se todo mundo já tem folga no mês, o diálogo mostra "Todas as folgas deste mês já estão marcadas" e não oferece o botão de criar.

## Detalhes técnicos

- Migration nova (a partir da última existente):
  - helper de "já tem folga na competência" passa a considerar `dp_folgas` (status ≠ cancelada) **e** `dp_solicitacoes` com `tipo = 'folga'` e `status = 'aprovada'` com `data_alvo` no mês e dia de descanso aplicável; usado por `dp_folga_autoatribuicao_previa` e `dp_folga_autoatribuir_competencia`.
  - nova RPC `dp_folga_autoatribuicao_plano(_company, _unidade, _competencia)` (STABLE, dry-run) que roda a mesma escolha de dia (dias vazios → menor ocupação → últimos dias do mês, respeitando limites por dia/cargo e pares que não folgam juntas) e retorna `{ itens: [{ colaborador_id, nome, data_sugerida, excede_limite, motivo }], dias, folgas_exigidas }`.
  - nova RPC `dp_folga_autoatribuir_aplicar(_company, _unidade, _competencia, _itens jsonb)` que insere apenas os itens recebidos, valida cada data contra dias permitidos/bloqueios/limites, marca origem `auto_fechamento_periodo`, registra a execução em `dp_folga_autoatribuicao_execucoes` com `manual = true`/`executada_por` e é idempotente (quem já tem folga é ignorado).
  - `GRANT EXECUTE` das duas novas RPCs apenas para `authenticated` e `service_role`; ambas exigem `private.is_company_admin_or_owner`.
- `src/hooks/useDpFolgasQueries.tsx`: filtro `status NOT IN ('cancelada','rejeitada')` na query de `dp_solicitacoes` do calendário.
- `src/lib/dp/folga-autoatribuicao.ts`: tipos e parsers do plano e do resultado, mais helper de dias válidos do mês para o seletor de data (sem `as any`).
- `src/pages/dp/DpFolgas.tsx`: diálogo reescrito com a tabela editável, estado vazio e invalidação das queries do calendário/excedentes.
- Testes: unitários dos novos helpers (plano, edição de data, remoção, estado vazio) e teste de banco cobrindo pedido aprovado contando como folga, aplicação parcial e recusa para não administrador. Typecheck, lint e vitest reais.
