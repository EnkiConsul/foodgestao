# Pessoas 360°: folha de ponto de intermitente, férias a agendar e histórico de adiantamento

## Frente 1 — Intermitente sem dias trabalhados (caso Wanderson)

Verificado: Wanderson é intermitente, desligado em 01/08/2026, e em agosto/2026 não tem nenhum dia de escala, nenhuma convocação e nenhuma marcação de ponto. Mesmo assim o sistema cobra folha de ponto, porque hoje só olha se a unidade tem relógio e se o cadastro está marcado com folha de ponto.

- Para intermitentes, folha de ponto e contracheque deixam de ser cobrados como falta nas competências sem nenhum registro de trabalho (dia de escala publicada, convocação aceita ou marcação de ponto).
- No lugar da falta, entra uma pendência do tipo **alerta**: "Confirmar se houve trabalho em agosto/2026" — porque o gestor pode ter convocado por fora do sistema. O alerta não conta como documento faltando e traz duas respostas: "Não trabalhou" (encerra o alerta) ou "Trabalhou" (passa a cobrar folha de ponto e contracheque da competência).
- A resposta do gestor fica registrada com autor e data, e o alerta desaparece das listas depois de respondido.
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

## Frente 4 — Adiantamento salarial por solicitações datadas (caso Rosângela)

Hoje o cadastro só tem uma chave liga/desliga, sem data nem histórico. Rosângela está com a opção desligada, então a importação de julho acusou documento sem opção habilitada — mesmo tendo havido solicitação naquela competência.

- A chave liga/desliga sai do cadastro. No lugar entra um registro de solicitações: **tipo** (ativar ou cancelar) + **data da solicitação**.
- O sistema não guarda mais um "ligado/desligado" fixo: para cada competência ele lê a última solicitação válida até ali e conclui se o adiantamento estava ativo ou não.
- Regra do efeito, comparando a data da solicitação com o dia de pagamento do adiantamento da unidade:
  - data anterior ao dia do pagamento → vale já na competência da própria data;
  - data igual ou posterior ao dia do pagamento → vale a partir da competência seguinte.
- A tela mostra a conclusão antes de salvar: "Solicitado em 18/07/2026, depois do pagamento (dia 15): passa a valer em agosto/2026". O mesmo texto vale para cancelamento.
- Data retroativa só o gestor pode informar, para reconstruir o histórico. No portal do colaborador só é aceita a data de hoje ou futura.
- Histórico na ficha: tipo, data da solicitação, competência em que passou a valer, origem (gestor ou portal), quem registrou e observação, com a situação atual calculada a partir dele.
- A cobrança de adiantamento passa a olhar esse histórico: só gera pendência nas competências em que a opção estava ativa; competências inativas não geram pendência nem acusam documento indevido — e documentos já importados de competências ativas param de aparecer como inconsistentes.
- O colaborador pode registrar a solicitação de ativar ou cancelar pelo próprio portal, quando a unidade oferece adiantamento; gera apenas notificação de ciência ao gestor, sem etapa de aprovação.
- Continuam valendo as regras já existentes: admissão depois do dia do adiantamento e desligamento antes desse dia não geram pendência; sócio, PJ e intermitente ficam fora.

## Frente 5 — Ignorar (com justificativa) ou adiar pendências de documentos

Hoje só existe "adiar" na tela inicial, guardado como preferência do próprio usuário, sem justificativa e sem opção de ignorar.

- Cada pendência de documento ganha as ações "Adiar" (7/15/30 dias) e "Ignorar", com justificativa obrigatória no caso de ignorar.
- A decisão passa a ser da empresa, não do usuário: quem registrou, quando, o motivo e até quando ficam guardados e visíveis para os demais gestores.
- Ignorada e adiada saem das listas por padrão, com um botão para exibi-las e para reverter a decisão.
- A mesma decisão vale nos três lugares: pendências do Início, lista completa de pendências e conferência na tela de importar documentos.
- Ação e justificativa ficam registradas na auditoria.

## Detalhes técnicos


- `src/lib/dp/pendencias-documentos.ts`: `ElegibilidadeOpts` ganha `temDiasNaCompetencia?: boolean | null` (`null` = indefinido → gera alerta em vez de falta) e `optanteNaCompetencia?: boolean` derivado do histórico; novo tipo de pendência `intermitente_confirmar_trabalho` que não entra nas contagens de documento faltando.
- `src/lib/dp/bulk-coverage.ts`: `CoverageArgs` recebe `comDiasTrabalhados?: Set<string>`, `semDiasConfirmado?: Set<string>` e `optantesNaCompetencia?: Set<string>`; intermitente sem confirmação sai dos esperados e vira aviso.
- Novo hook `src/hooks/useDpDiasTrabalhados.tsx`: por empresa/competência, conjunto de `colaborador_id` com registro em `dp_escala_itens`, `dp_pontos` ou convocação aceita — consultado só para intermitentes. Migração de tabela `dp_intermitente_competencia_confirmacoes` (`company_id`, `colaborador_id`, `competencia`, `trabalhou` boolean, `respondido_por`, timestamps) com GRANTs e RLS por empresa.
- Migração: tabela `dp_adiantamento_opcoes` (`company_id`, `colaborador_id`, `decisao` ativar/cancelar, `data_solicitacao`, `origem` gestor/portal, `competencia_efeito`, `vigencia_inicio`, `vigencia_fim`, `observacao`, `criado_por`) com GRANTs, RLS por empresa e política que permite ao próprio colaborador inserir seu pedido; trigger de `updated_at` e trigger que encerra a vigência anterior; backfill do `optante_adiantamento` atual. Helper novo `src/lib/dp/adiantamento-opcao.ts` com `competenciaEfeito(dataSolicitacao, diaPagamento)` e `optanteNaCompetencia(historico, competencia)`; hook `useDpAdiantamentoOpcoes.tsx`; UI no `ColaboradorFormDialog.tsx`/ficha e no portal (`src/pages/dp/portal/`), com notificação ao gestor via `dp_notificacoes`.
- Férias: `src/hooks/useDpPendencias.tsx` passa a buscar períodos com saldo e `fim_aquisitivo <= hoje` (sem filtro de `limite_concessivo`), classificando em a agendar / prazo próximo / vencida via helper novo em `src/lib/dp/ferias-direito.ts`; excluir quem tem gozo agendado, sócio e `controle_externo`.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: remover a consulta de `dp_ferias_periodos`/`dp_ferias_gozos` e o bloco de férias, ajustando as contagens do resumo.
- Migração: tabela `dp_pendencias_decisoes` (`company_id`, `pendencia_id` texto, `tipo`, `colaborador_id`, `competencia`, `acao` ignorar/adiar, `justificativa`, `adiada_ate`, `criado_por`, timestamps) com GRANTs, RLS por empresa e índice único por empresa+`pendencia_id`. Novo hook `useDpPendenciasDecisoes.tsx`; `filtrarAbertas` em `src/lib/dp/pendencias.ts` passa a considerar as decisões da empresa (mantendo o adiamento pessoal existente); ações reaproveitando `AdiarPopover` em `PendenciasCard.tsx`, `DpCadastroPendenciasLista.tsx` e `DocConsistenciaPanel.tsx`, com `MotivoDialog` para a justificativa; registro via `src/lib/audit.ts`.
- Testes em `src/lib/dp/__tests__`: Wanderson (agosto/2026 sem registros → alerta, sem falta; respondido "trabalhou" → volta a exigir folha), intermitente com dia trabalhado, classificação de férias (Rosângela/Alessandra/Sara como "a agendar"), `competenciaEfeito` antes/depois do dia de pagamento, elegibilidade de adiantamento por competência e filtro de pendências ignoradas/adiadas.
