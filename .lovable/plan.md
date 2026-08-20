# Turnos: mostrar os colaboradores vinculados a cada turno

Hoje o card do turno mostra apenas contagens ("Em uso: 5") e um detalhamento por origem. Falta saber **quem** está nesse turno.

## O que muda na tela

No popover de uso de cada turno, além das contagens por origem, passa a aparecer a lista de colaboradores vinculados:

- Nome do colaborador, cargo e unidade.
- Como está vinculado: `turno padrão` (configuração de trabalho), `dias fixos` (configuração por dia da semana) ou `escala` (itens de escala publicada/rascunho do mês atual em diante).
- Lista com rolagem quando houver muitos; mostra até 50 e indica "+N colaboradores" acima disso.
- Clique no nome abre a ficha do colaborador (mesma navegação já usada em outras telas do DP).
- Estado vazio: "Nenhum colaborador vinculado a este turno."

O selo do card passa a resumir também as pessoas: "Em uso · 4 colaboradores" quando houver vínculo de pessoas; permanece "Em uso: N" quando o uso vem só de cobertura mínima/grade/convocação.

A lista é carregada só quando o popover do turno é aberto, para não pesar a tela.

## Regras

- Só colaboradores ativos da empresa/unidade em escopo aparecem como vínculo "atual"; desligados aparecem no fim com marca "desligado" apenas quando o vínculo é de escala.
- Nada muda nas regras de exclusão: quem tem colaborador vinculado continua bloqueado para excluir (usar "Desativar").

## Detalhes técnicos

- Nova função no banco `dp_turno_colaboradores(p_turno_id uuid)` (SECURITY DEFINER, `private.is_company_member` na empresa do turno), retornando `colaborador_id, nome, cargo_nome, unidade_nome, origem, ativo`, com `origem` derivada de:
  - `dp_colaborador_config_trabalho.turno_padrao_id`
  - `dp_colaborador_config_dias.turno_id`
  - `dp_escala_itens.turno_id` (via `dp_escalas`, a partir do mês corrente), distinto por colaborador.
- Hook `useDpTurnoColaboradores(turnoId, enabled)` em `src/hooks/useDpTurnoColaboradores.tsx`, habilitado apenas quando o popover está aberto.
- `src/components/dp/TurnoCard.tsx`: popover ganha a seção "Colaboradores vinculados" com skeleton de carregamento; rótulo do selo passa a considerar `colaboradores_padrao + config_dias`.
- `src/lib/dp/turno-uso.ts`: helper de rótulo do selo com contagem de pessoas + rótulos de origem, com testes em `src/lib/dp/__tests__/turno-uso.test.ts`.
