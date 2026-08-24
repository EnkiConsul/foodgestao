# Convocações — Fase 3B.2 · Diagnóstico (sem implementação)

**Veredito: `3B.2_BLOCKED` · `FASE_3B1_NAO_LIBERADA`**

Nenhuma migration, função, RPC ou arquivo funcional foi criado ou alterado nesta execução.

## A. Gate da 3B.1

Estado lido em `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md` (seção 2):

- "3B.1 coexistência segura + planejamento/configuração — 🟡 implementação concluída e evidências estáticas aprovadas; validação funcional/concorrente pendente por indisponibilidade de ambiente isolado e credencial executável adequada"
- "3B.2 publicação · 3B.3 · 3B.4 · 3B.5 — ⛔ bloqueadas"

Conclusão: 3B.2 **bloqueada**. Só diagnóstico.

## B. Estado real do schema (verificado no banco)

`dp_convocacao_grupos`: company_id, unidade_id (NOT NULL), competencia (CHECK `^\d{4}-(0[1-9]|1[0-2])$`), modalidade CHECK `individual|aberta`, status CHECK `rascunho|publicado|encerrado|cancelado`, publicado_em/publicado_por, `uq_dp_convocacao_grupos_id_company`, FK composta unidade+company.

`dp_convocacao_ocorrencias`: grupo_id, unidade_id, cargo_id, data, necessidade_entrada/saida/termina_no_dia_seguinte, turno_referencia_id, `horario_modo` CHECK `horario_unico|jornada_individual` com CHECK de coerência (horário preenchido só em horario_unico), vagas>0, versao, substitui_ocorrencia_id, `antecedencia_dias`, `fora_antecedencia`, `confirmado_fora_prazo_por/_em`, `justificativa_fora_prazo`, condicoes_comuns jsonb, status CHECK `rascunho|publicada|preenchida|encerrada_operacionalmente|apurada|revisada|cancelada`, publicada_em. FKs compostas cargo/grupo/unidade+company. Índices: grupo, cargo, (company,data).

`dp_convocacoes` (legado + novo): campos legados (data, entrada, saida, intervalo, carga, status enum, prazo_resposta, enviada_em, escala_item_id) **mais** os campos da fundação 3A: `ocorrencia_id`, `disponibilizada_em`, `visualizada_em`, `inicio_previsto`, `fim_previsto`, `encerramento_operacional`, `timezone_snapshot`, `prazo_resposta_base`, `compatibilidade`, `regime_snapshot`, `remuneracao_snapshot jsonb`, `origem_oferta`, substituições, encerramento, comparecimento. Enum `dp_convocacao_status` já contém os 11 estados previstos. Índices relevantes: (colaborador,data), (company,data), (ocorrencia), além do único parcial de oferta ativa da fundação.

`dp_convocacao_config`: escopo `UNIQUE NULLS NOT DISTINCT (company_id, unidade_id)`, antecedencia_minima_dias (default 3), prazo_resposta_dias_uteis (default 1), aprovacao_modo, exige_justificativa_excecao, permite_oferta_aberta, matriz de substituição.

`dp_convocacao_eventos`: append-only, company_id + grupo/ocorrencia/convocacao + tipo + de/para_status + ator_user_id + ator_papel + payload; CHECK de referência já aberto para `config_criada|config_atualizada`.

`dp_indisponibilidades`: colaborador_id + data + motivo + origem + cancelada_em (global, sem unidade — coerente com a regra V1).

## C. Funções reutilizáveis (todas confirmadas no catálogo)

- `dp_convocacao_exige_admin(_company_id uuid) → uuid` — DEFINER, EXECUTE só `service_role` (helper interno). Autorização.
- `dp_convocacao_log_evento(_company_id, _grupo_id, _ocorrencia_id, _tipo, _payload) → void` — DEFINER, só `service_role`. Resolve papel real (M13).
- `dp_convocacao_config_resolvida(_company_id, _unidade_id) → dp_convocacao_config` — INVOKER, `authenticated`.
- `dp_regime_convocavel(_regime dp_regime_trabalho)` — política central de regime.
- `dp_adicionar_dias_uteis(_base timestamptz, _dias int, _timezone text) → timestamptz` — INVOKER; seg–sex, sem feriados (V1).
- `dp_calc_carga_dia(entrada, saida, intervalo, vira_dia) → numeric`.
- RPCs 3B.1 (DEFINER, `authenticated`): `criar_grupo`, `atualizar_grupo`, `criar_ocorrencia`, `atualizar_ocorrencia`, `revisar_ocorrencia`, `salvar_config(... p_expected_updated_at)`.
- Triggers a preservar: `dp_convocacao_guard`, `dp_convocacao_sync_escala`, `dp_conv_ocor_integridade`, `dp_conv_evento_deriva`, `dp_convocacao_legacy_self_columns`.

Nenhum helper novo de timezone/dia útil deve ser criado.

## D. Público individual — **GAP CONFIRMADO (P0)**

`dp_convocacao_ocorrencias` **não possui** nenhuma coluna de trabalhador-alvo, e não existe tabela de público. Hoje o alvo só existiria em `condicoes_comuns`/frontend — inaceitável.

Opções a aprovar (não implementadas):

- **A. `colaborador_alvo_id` na ocorrência** + FK composta `(colaborador_alvo_id, company_id)`, CHECK `modalidade individual ⇒ NOT NULL e vagas = 1`. Simples, idempotente, suficiente para 1 alvo por necessidade; grupo mensal continua funcionando (uma ocorrência por data/cargo).
- **B. tabela `dp_convocacao_ocorrencia_publico`** (ocorrencia_id, colaborador_id, company_id, unique). Flexível para futura pré-seleção de vários alvos, mas adiciona superfície de RLS/grants e ainda exige regra "exatamente 1" para individual.

Recomendação para aprovação: **A** na 3B.2 (menor superfície, cobre a regra aprovada de 1 alvo), com B possível depois de forma aditiva.

## E. Público aberto

Origem real dos candidatos (derivada 100% no backend): `dp_colaboradores` filtrado por `company_id` do grupo, `ativo`, `unidade_id` = unidade do grupo, `regime` via `dp_regime_convocavel`, `cargo_id` = cargo da ocorrência; menos `dp_indisponibilidades` (colaborador+data, `cancelada_em IS NULL`); menos conflitos Option A (`dp_convocacoes` ativas + `dp_escala_itens` por colaborador/data); menos incompatíveis de jornada. Gap: não há tabela N:N trabalhador↔cargo nem trabalhador↔unidade — o vínculo é a coluna única em `dp_colaboradores` (limitação a registrar, não a resolver agora).

Regra determinística proposta para o mesmo elegível em duas necessidades do mesmo dia: processar ocorrências em ordem `(data, necessidade_entrada, cargo_id, id)`; a primeira ocorrência da ordem "consome" a elegibilidade do trabalhador no dia (Option A) e as demais o excluem com motivo `conflito_option_a`. Aberta com 0 elegíveis ou elegíveis < vagas: publicar a ocorrência e retornar diagnóstico com contagens (não falhar), exceto se `0 elegíveis` — proposta: falhar fechado `PUBLICATION_NO_ELIGIBLE` para não publicar necessidade sem qualquer oferta.

## F. Remuneração — **P1 BLOQUEANTE**

Fonte existente em `dp_colaboradores`: `forma_pagamento` (`mensalista|horista|diarista`), `valor_hora`, `valor_hora_manual`, `salario_base`; piso por cargo/unidade em `dp_cargo_salarios` (+ `src/lib/dp/cargoSalarios.ts`, `dp_folha_pendencias_remuneracao`).

- **Intermitente**: caminho autoritativo existe — `forma_pagamento = horista` + `valor_hora` (fallback piso do cargo na unidade). Unidade monetária: R$/hora.
- **Freelancer**: **não há campo de diária/cachê nem regra autoritativa**. Usar `valor_hora` do horista é uma decisão de produto ainda não aprovada.

Portanto `remuneracao_snapshot` para Freelancer é P1 BLOQUEANTE. Nada será criado sem aprovação.

## G. Jornada individual

Fonte vigente: `dp_colaborador_config_trabalho` (vigência início/fim, `turno_padrao_id`, carga semanal) + `dp_colaborador_config_dias`/`dp_colaborador_jornadas` e `dp_turnos`. Resolver no backend por vigência na data da ocorrência e derivar entrada/saída/intervalo, `carga_prevista_horas` via `dp_calc_carga_dia`. Gap: o resumo existente é TS (`useDpHorarioPrevisto`), sem função SQL única de jornada — a 3B.2 precisaria de um helper interno SQL (sem grant a `authenticated`).

## H. Timezone e dia útil

`dp_adicionar_dias_uteis(_base, _dias, _timezone)` (seg–sex, sem feriados). Timezone de origem a auditar em `dp_unidades`/`dp_config_dp` antes da implementação; ausente/ambíguo ⇒ fail closed. `timezone_snapshot` já existe na oferta.

## I. Option A e concorrência

Detecção: índice único parcial de oferta ativa em `dp_convocacoes` + `idx_dp_convocacoes_colab_data` + `dp_escala_itens_colab_data`. Proposta: helper interno único de conflito (usado depois pela 3B.3) + `pg_advisory_xact_lock(hashtextextended(company_id||colaborador_id||data))` em ordem determinística, nunca cross-company, autorização antes de qualquer lock, controle otimista do grupo por `p_expected_updated_at`.

## J–P. Publicação, RPC, migrations, riscos, testes, rollback

Fluxo transacional proposto: AUTH → `exige_admin` → lock grupo (`FOR UPDATE` + expected_updated_at) → revalidação de estado → lock ocorrências em ordem determinística → config resolvida → timezone → antecedência por ocorrência → público → elegibilidade → jornada → compatibilidade integral (`integral|incompativel`) → remuneração → snapshots → ofertas `pendente` → eventos → status (`publicado`/`publicada`) → COMMIT.

RPC conceitual: `dp_convocacao_publicar_grupo(p_grupo_id, p_expected_updated_at, p_confirmacoes jsonb)` — nunca recebe company_id, user_id, regime, jornada, remuneração, flags ou timestamps. Erros: `FORBIDDEN`, `CONCURRENT_MODIFICATION`, `INVALID_STATE`, `PUBLICATION_INVALID_SCHEDULE`, `PUBLICATION_REQUIRES_CONFIRMATION`, `PUBLICATION_NO_ELIGIBLE`, `PUBLICATION_INCONSISTENT`.

Migrations previstas (**apenas plano**): M14 = coluna/estrutura de público individual aprovada + helpers internos (conflito, jornada); M15 = RPC de publicação + grants (`REVOKE` de PUBLIC/anon; `GRANT EXECUTE` só à RPC de aplicação). Rollback: `DROP` somente dos objetos novos, sem tocar M1–M13, sem DELETE de dados.

Riscos: **P0** ausência de representação do trabalhador-alvo; **P1** fonte de remuneração de Freelancer; **P1** ausência de resolução SQL de jornada individual; **P1** origem do timezone a confirmar; **P2** vínculo único cargo/unidade em `dp_colaboradores`.

## Próximo passo obrigatório

1. Encerrar formalmente a 3B.1 (✅) com a bateria funcional/concorrente em ambiente isolado.
2. Aprovar as decisões D (opção A ou B) e F (remuneração de Freelancer).

Somente após (1) e (2) solicitarei autorização para implementar M14/M15.
