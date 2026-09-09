# Pessoas 360°: folha de ponto de intermitente, férias a agendar e histórico de adiantamento

## Frente 1 — Intermitente sem dias trabalhados (caso Wanderson)

Verificado: Wanderson é intermitente, desligado em 01/08/2026, e em agosto/2026 não tem nenhum dia de escala, nenhuma convocação e nenhuma marcação de ponto. Mesmo assim o sistema cobra folha de ponto, porque hoje só olha se a unidade tem relógio e se o cadastro está marcado com folha de ponto.

- Para intermitentes, folha de ponto e contracheque passam a ser cobrados só nas competências com trabalho: dia de escala publicada, convocação aceita ou marcação de ponto no mês.
- Sem nenhum desses registros no mês, não aparece pendência nem alerta de falta — no Início, na Conferência de Documentos e na conferência do lote importado.
- A rescisão continua sendo cobrada na competência do desligamento.
- CLT, temporário e aprendiz seguem como hoje.

## Frente 2 — Férias: o que está acontecendo com Rosângela, Alessandra e Sara

Consultado no sistema:

- Rosângela: admissão 22/05/2025, período 22/05/2025–21/05/2026 fechado, 30 dias de saldo, prazo para conceder até 21/05/2027.
- Alessandra: admissão 28/02/2025, período fechado em 27/02/2026, 30 dias, prazo até 27/02/2027.
- Sara: admissão 23/05/2025, período fechado em 22/05/2026, 30 dias, prazo até 22/05/2027.

Ou seja: as três já **adquiriram** o direito, mas o prazo legal para conceder só vence em 2027 — por isso não entram como "vencidas". Hoje o sistema só avisa nos 60 dias antes desse prazo, então elas ficam invisíveis por quase um ano.

O que muda:

- A pendência de férias passa a nascer assim que o período aquisitivo se completa e ninguém agendou, com três situações claras:
  - "Férias a agendar" — direito adquirido, prazo ainda longe (caso das três).
  - "Prazo próximo" — dentro da janela de alerta configurada.
  - "Férias vencidas" — prazo legal estourado.
- Ordenação por prazo, da mais antiga para a mais recente, como nas demais pendências.
- Quem já tem férias agendadas/em gozo, sócios e quem tem controle externo continuam fora.

## Frente 3 — Férias saem da tela de importar documentos

- O bloco "Férias Vencidas Sem Agendamento" deixa de aparecer na tela de importar documentos; o assunto fica só na tela de Férias e nas pendências do Início.

## Frente 4 — Histórico da opção de adiantamento salarial (caso Rosângela)

Hoje o cadastro só tem uma chave liga/desliga ("Opta por Adiantamento Salarial"), sem data nem histórico. Rosângela está com a opção desligada, então a importação de julho acusou documento sem opção habilitada — mesmo tendo havido solicitação naquela competência.

- Novo histórico da opção no cadastro do colaborador: cada registro com data da solicitação, decisão (aceite ou recusa), início e fim da vigência e observação.
- Ao ligar ou desligar a chave, o sistema pede a data da solicitação e grava o registro; o histórico fica visível na ficha, com possibilidade de lançar períodos passados.
- A cobrança de adiantamento passa a olhar o histórico: só gera pendência nas competências em que a opção estava ativa; competências com a opção desligada não geram pendência e não acusam documento indevido.
- Documento já importado de competência com opção ativa deixa de ser marcado como inconsistente e continua visível no portal do colaborador.
- Continuam valendo as regras já existentes: admissão depois do dia do adiantamento e desligamento antes desse dia não geram pendência; sócio, PJ e intermitente ficam fora.

## Frente 5 — Ignorar (com justificativa) ou adiar pendências de documentos

Hoje só existe "adiar" na tela inicial, guardado como preferência do próprio usuário, sem justificativa e sem opção de ignorar.

- Cada pendência de documento ganha as ações "Adiar" (7/15/30 dias) e "Ignorar", com justificativa obrigatória no caso de ignorar.
- A decisão passa a ser da empresa, não do usuário: quem registrou, quando, o motivo e até quando ficam guardados e visíveis para os demais gestores.
- Ignorada e adiada saem das listas por padrão, com um botão para exibi-las e para reverter a decisão.
- A mesma decisão vale nos três lugares: pendências do Início, lista completa de pendências e conferência na tela de importar documentos.
- Ação e justificativa ficam registradas na auditoria.

## Detalhes técnicos


- `src/lib/dp/pendencias-documentos.ts`: `ElegibilidadeOpts` ganha `temDiasNaCompetencia?: boolean` (intermitente sem dias → `ponto` e `contracheque` = false) e `optanteNaCompetencia?: boolean` consultado no histórico em vez do booleano do cadastro.
- `src/lib/dp/bulk-coverage.ts`: `CoverageArgs` recebe `comDiasTrabalhados?: Set<string>` e `optantesNaCompetencia?: Set<string>`; `computeCoverage` filtra os esperados por eles.
- Novo hook `src/hooks/useDpDiasTrabalhados.tsx`: por empresa/competência, conjunto de `colaborador_id` com registro em `dp_escala_itens`, `dp_pontos` ou convocação aceita no intervalo — consultado só para intermitentes.
- Migração: tabela `dp_adiantamento_opcoes` (`company_id`, `colaborador_id`, `decisao` aceite/recusa, `data_solicitacao`, `vigencia_inicio`, `vigencia_fim`, `observacao`) com GRANTs, RLS por empresa, trigger de `updated_at` e trigger que encerra a vigência anterior ao inserir nova; backfill do estado atual de `optante_adiantamento` como registro aberto. Novo hook `useDpAdiantamentoOpcoes.tsx` e bloco de histórico em `ColaboradorFormDialog.tsx`/`ColaboradorFichaDialog.tsx`.
- Férias: `src/hooks/useDpPendencias.tsx` passa a buscar períodos com saldo e `fim_aquisitivo <= hoje` (sem filtro de `limite_concessivo`), classificando em a agendar / prazo próximo / vencida via helper novo em `src/lib/dp/ferias-direito.ts`; excluir quem tem gozo agendado, sócio e `controle_externo`.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: remover a consulta de `dp_ferias_periodos`/`dp_ferias_gozos` e o bloco de férias, ajustando as contagens do resumo.
- Testes em `src/lib/dp/__tests__`: Wanderson (agosto/2026 sem dias → sem ponto, com rescisão), intermitente com um dia voltando a exigir folha, classificação de férias (Rosângela/Alessandra/Sara como "a agendar", período com limite estourado como "vencida") e elegibilidade de adiantamento por competência conforme o histórico.
