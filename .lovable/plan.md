# Convocações — Fase 2: Arquitetura alvo e UX (nada implementado)

Fase 1 aprovada. Este documento fecha as decisões estruturais para que a Fase 3 implemente banco/backend sem ambiguidade.

## 0. Divergência que precisa da sua decisão (evidência concreta)

Sua preferência é a **Opção B** no índice `uq_dp_convocacoes_ativa` (mais de uma oportunidade no mesmo dia, sem conflito de horário). A auditoria encontrou um impedimento estrutural fora de Convocações:

`dp_escala_itens` tem **UNIQUE (escala_id, colaborador_id, data)** (`dp_escala_itens_escala_id_colaborador_id_data_key`). Logo, dois aceites da mesma pessoa no mesmo dia (almoço + jantar) **não podem** gerar dois itens de escala. Como Escala é a fonte de Operação, Horário Previsto, Ponto e VA/VT, mudar essa unicidade é uma alteração de alto alcance.

Caminho recomendado (Opção B viável sem tocar na unicidade da escala):
- Trocar `uq_dp_convocacoes_ativa` por `UNIQUE (colaborador_id, ocorrencia_id)` + validação backend de conflito real de horário (considerando virada de meia-noite e intervalo mínimo entre jornadas).
- Na escala, **consolidar** os aceites do mesmo dia em **um único item**: primeira alocação cria o item; a segunda estende o item consolidado (menor entrada, maior saída, soma de carga) e ambos os registros de `dp_convocacoes` apontam para o mesmo `escala_item_id`. Cancelar/substituir recalcula o item a partir das alocações ativas do dia.
- Alternativa se você preferir simplicidade: manter Opção A (uma oportunidade ativa por pessoa/dia), zero mudança em escala, mas sem almoço+jantar no mesmo dia.

Decisão necessária: **B com consolidação de item** (recomendado) ou **A**. O restante deste desenho está escrito para B com consolidação, e o ponto está isolado para trocar sem redesenho.

## 1. Entidades

```text
dp_convocacao_grupos ──1:N── dp_convocacao_ocorrencias ──1:N── dp_convocacoes
                                        │                          │
                                        │                          ├── dp_escala_itens (alocação)
                                        │                          └── dp_convocacao_descumprimentos
                                        └── dp_convocacao_eventos (timeline, também por grupo/oferta)

dp_indisponibilidades (colaborador × data)
dp_convocacao_config  (empresa, unidade opcional)
```

### 1.1 `dp_convocacao_grupos`
`id`, `company_id` (FK companies), `unidade_id` (FK dp_unidades), `competencia` text `YYYY-MM`, `titulo`, `modalidade` enum `individual|aberta`, `status` enum, `criada_por`, `publicada_em`, `publicada_por`, `cancelada_em`, `cancelado_por`, `motivo_cancelamento`, `created_at`, `updated_at`.
CHECK: `competencia ~ '^\d{4}-\d{2}$'`. Índices: `(company_id, competencia)`, `(company_id, status)`.

### 1.2 `dp_convocacao_ocorrencias`
`id`, `grupo_id` (FK ON DELETE CASCADE), `company_id`, `unidade_id`, `data` date, `cargo_id` (FK dp_cargos), `turno_id` (FK dp_turnos, nullable), `vagas` int, `horario_modo` enum `jornada_individual|horario_unico`, `entrada` time, `saida` time, `intervalo_minutos` int, `termina_no_dia_seguinte` bool, `carga_prevista_horas` numeric, `inicio_previsto` timestamptz (derivado: `data + entrada` no fuso da empresa), `antecedencia_dias` int, `fora_antecedencia` bool, `confirmado_fora_prazo_por` uuid, `confirmado_fora_prazo_em` timestamptz, `remuneracao_snapshot` jsonb, `status` enum, `versao` int default 1, `substitui_ocorrencia_id` (self FK, nullable), `publicada_em`, `created_at`, `updated_at`.
CHECKs: `vagas >= 1`; `horario_modo='horario_unico' → entrada IS NOT NULL AND saida IS NOT NULL`; `carga_prevista_horas > 0` quando horário único.
UNIQUE: `(grupo_id, data, cargo_id, turno_id, versao)`.
Índices: `(company_id, data)`, `(unidade_id, data)`, `(status, inicio_previsto)` (para o job).

### 1.3 `dp_convocacoes` (tabela atual, evoluída — oferta individual)
Mantém: `id, company_id, colaborador_id, unidade_id, turno_id, data, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, status, prazo_resposta, enviada_em, respondida_em, motivo_recusa, observacao, criada_por, escala_item_id, created_at, updated_at`.
Novos: `ocorrencia_id` (FK, NOT NULL após backfill; vazio hoje → sem backfill real), `disponibilizada_em`, `visualizada_em`, `encerramento_operacional` timestamptz (= `inicio_previsto` da ocorrência), `remuneracao_snapshot` jsonb, `substituida_por_id` (self FK), `substitui_convocacao_id` (self FK), `origem` enum `convocacao|substituicao`, `analise_pendente` bool.
Campos duplicados da ocorrência (`data, unidade_id, turno_id, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, encerramento_operacional`) são **derivados no backend** (seção 6).
UNIQUE: `(colaborador_id, ocorrencia_id)`; substitui o atual `uq_dp_convocacoes_ativa` (ver seção 0).
Índices atuais preservados: `(company_id, data)`, `(colaborador_id, data)`, `escala_item_id`; novos `(ocorrencia_id, status)`, `(status, prazo_resposta)`, `(status, encerramento_operacional)`.

### 1.4 `dp_indisponibilidades`
`id`, `company_id`, `colaborador_id` (FK CASCADE), `data` date, `unidade_id` (nullable), `motivo` text, `criado_por`, `created_at`, `updated_at`.
UNIQUE `(colaborador_id, data)`. CHECK `data >= created_at::date` não é confiável — a validação de data passada fica na RPC/trigger comparando com `CURRENT_DATE`. Índices `(company_id, data)`, `(colaborador_id, data)`.

### 1.5 `dp_convocacao_config`
`id`, `company_id`, `unidade_id` (nullable = padrão da empresa), `antecedencia_dias` int default 3, `prazo_resposta_uteis` int default 1, `troca_int_int` bool, `troca_int_free` bool, `troca_free_int` bool, `troca_free_free` bool, `troca_fixo_dominical` bool, `aprovacao_modo` enum `sempre_gestor|somente_excecoes|automatica`, `reabertura_automatica` bool, `preset` enum `controlado|moderado|autonomo|personalizado`, timestamps. UNIQUE `(company_id, unidade_id)` com índice único parcial para `unidade_id IS NULL`. Resolução unidade > empresa, no mesmo padrão de `dp_config_resolvida`.

### 1.6 `dp_convocacao_descumprimentos`
`id`, `company_id`, `convocacao_id` (FK), `ocorrencia_id` (FK), `colaborador_id`, `tipo` enum `desistencia_apos_aceite|ausencia_no_dia`, `motivo_informado` text, `analise` enum `pendente|justificado|sem_justo_motivo`, `analisado_por`, `analisado_em`, `observacao_analise`, `base_remuneracao` numeric, `percentual` numeric, `valor_referencia` numeric, `prazo_limite` date, timestamps. CHECK: `valor_referencia` só preenchido quando `analise='sem_justo_motivo'`. Regra: `percentual`/`valor_referencia` apenas para regime intermitente; freelancer registra sem multa. **Nenhum efeito financeiro automático.**

### 1.7 `dp_convocacao_eventos`
`id`, `company_id`, `grupo_id`, `ocorrencia_id`, `convocacao_id`, `tipo` text, `payload` jsonb (sanitizado), `ator` uuid, `criado_em`. Append-only (sem UPDATE/DELETE por policy). Índice `(company_id, criado_em desc)`, `(convocacao_id)`.

### 1.8 Equipe habitual
Coluna `compoe_equipe_habitual` bool default true em `dp_colaborador_config_trabalho`. Restrição atual `idx_dp_cct_vigente UNIQUE (colaborador_id) WHERE vigencia_fim IS NULL` impede duas unidades abertas. Plano: **Fase 3 não altera a constraint**; entrega o campo funcionando para a config vigente única (cobre 100% do cenário atual: 12/12 colaboradores com uma config). A evolução para `UNIQUE (colaborador_id, unidade_id) WHERE vigencia_fim IS NULL` fica como item isolado da Fase 3b, com migration dedicada, inventário de consumidores (`useDpColaboradorConfigTrabalho`, `config-trabalho.ts`, `escala-mes.ts`, `operacao-panorama.ts`) e rollback próprio.

## 2. Máquina de estados

Grupo: `rascunho → publicado → (parcialmente_preenchido | preenchido) → realizado | cancelado`. Terminais: `realizado`, `cancelado`.
Ocorrência: `rascunho → publicada → (aguardando | preenchida) → encerrada | realizada | cancelada | revisada`. Terminais: `realizada`, `cancelada`, `revisada`, `encerrada`.
Oferta (`dp_convocacoes`): `pendente → aceita | recusada | sem_resposta | encerrada_sem_vaga | encerrada_inicio_ocorrencia | cancelada | substituida`.

**Ocupa vaga:** somente `aceita`. **Terminais:** `recusada`, `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `cancelada`, `substituida`.
Substituição: oferta original vai para `substituida` (libera a vaga) na mesma transação em que a nova oferta entra em `aceita` — invariante de ocupação única.
Indisponibilidade: `ativa → removida` (delete lógico só para futuro).
Descumprimento: `pendente → justificado | sem_justo_motivo`.

Matriz resumida (entidade | estado | ação | próximo | quem | validações):

| Entidade | De | Ação | Para | Quem | Validações |
|---|---|---|---|---|---|
| Grupo | rascunho | publicar | publicado | admin | ≥1 ocorrência; confirmação de antecedência quando aplicável |
| Grupo | publicado | cancelar | cancelado | admin | cancela ocorrências e ofertas não aceitas; aceitas exigem motivo |
| Ocorrência | publicada | preencher | preenchida | sistema | aceites = vagas |
| Ocorrência | publicada | revisar (mudança material) | revisada | admin | cria nova versão; preserva histórico |
| Ocorrência | preenchida/aguardando | realizar | realizada | sistema/admin | após a data |
| Oferta | pendente | aceitar | aceita | trabalhador (dono) | prazo, encerramento, vaga livre, elegibilidade, sem conflito |
| Oferta | pendente | recusar | recusada | trabalhador | prazo/encerramento |
| Oferta | pendente | prazo vencido | sem_resposta | job | `now() > prazo_resposta` |
| Oferta | pendente | jornada começou | encerrada_inicio_ocorrencia | job | `now() >= encerramento_operacional` e prazo ainda vigente ou não |
| Oferta | pendente | vagas esgotadas | encerrada_sem_vaga | RPC de aceite/job | aceites = vagas |
| Oferta | aceita | substituir | substituida | RPC | substituto validado e alocado na mesma transação |
| Oferta | aceita | desistir | aceita + descumprimento pendente | trabalhador | tentativa de substituição oferecida antes |
| Indisponibilidade | — | marcar | ativa | trabalhador/admin | data futura; convocação aceita bloqueia (direciona substituição) |
| Descumprimento | pendente | classificar | justificado / sem_justo_motivo | admin | valor de referência só no intermitente sem justo motivo |

## 3. Fluxos

Individual: grupo (modalidade individual) → uma ocorrência por data com `vagas=1` → uma oferta por pessoa/data → aceite gera alocação.
Aberta: ocorrência com N vagas → ofertas para todo o público elegível → primeiros N aceites ocupam; demais viram `encerrada_sem_vaga`.
Mensal: um grupo, várias ocorrências independentes (vagas, horário, status e antecedência próprios); antecedência avaliada por ocorrência; a confirmação do gestor marca a exceção só nas datas afetadas.

Horário: `jornada_individual` resolve, para cada destinatário, `config-trabalho.ts`/`dp_colaborador_config_dias` do dia; `horario_unico` aplica o horário da ocorrência a todos. Em ambos os casos a oferta grava o snapshot apresentado, e alterar a convocação nunca altera a jornada cadastral.

Antecedência: `antecedencia_dias = data - hoje` (dias corridos, fuso da empresa) calculada **no backend** na publicação; `fora_antecedencia = antecedencia_dias < config.antecedencia_dias`; alerta + confirmação consciente; nunca bloqueia; grava `confirmado_fora_prazo_por/_em`.

Prazos: `prazo_resposta = disponibilizada_em + 1 dia útil` (referência, nunca encurtado por urgência) e `encerramento_operacional = inicio_previsto` da ocorrência. Se a jornada começa antes do prazo, a oferta encerra por `encerrada_inicio_ocorrencia` — nunca por `sem_resposta`.

Preenchimento total: a RPC de aceite, ao ocupar a última vaga, materializa as ofertas `pendente` restantes como `encerrada_sem_vaga` na mesma transação; o job faz varredura de segurança. Novo aceite falha atomicamente de qualquer forma, porque a checagem é `count(aceitas) < vagas` sob lock.

Reabertura: admin reabre vaga; ofertas anteriores permanecem no histórico; novas ofertas são geradas para os elegíveis.

## 4. Aceite concorrente

```text
BEGIN
  SELECT ... FROM dp_convocacao_ocorrencias WHERE id=? FOR UPDATE        -- serializa
  valida: oferta pertence ao usuário; status pendente; now() <= prazo;
          now() < encerramento_operacional; ocorrência publicada
  revalida elegibilidade: ativo, unidade, cargo, sem indisponibilidade,
          sem férias/folga conflitante, sem conflito de horário no dia
  SELECT count(*) FROM dp_convocacoes WHERE ocorrencia_id=? AND status='aceita'
  se count < vagas → status='aceita'; sincroniza escala (item consolidado do dia)
  senão            → status='encerrada_sem_vaga'; retorna vagas_preenchidas
  se count+1 = vagas → encerra as pendentes restantes
  grava evento
COMMIT
```
Idempotente: reexecutar sobre oferta já `aceita` retorna o mesmo resultado sem efeito colateral. Fail closed em qualquer validação.

## 5. Integração com Escala

`dp_convocacao_sync_escala` deixa de ser trigger implícito e passa a ser função chamada pelas RPCs (aceite, cancelamento, substituição), com a lógica atual preservada e a consolidação por dia descrita na seção 0. Recusa/cancelamento/substituição recalculam o item a partir das alocações ativas; sem alocação ativa, o item de origem `convocacao` é removido. Operação, Horário Previsto, Ponto, VA/VT e folha continuam lendo `dp_escala_itens` — nenhum consumidor muda.

## 6. Integridade ocorrência × oferta

Estratégia combinada, sem confiar no frontend: (a) a RPC de publicação/geração de ofertas **deriva** todos os campos duplicados da ocorrência — o cliente não os envia; (b) trigger `BEFORE INSERT/UPDATE` em `dp_convocacoes` reescreve `company_id, unidade_id, data, turno_id, horário, carga, encerramento_operacional` a partir da ocorrência; (c) esses campos são imutáveis após `disponibilizada_em` (trigger levanta exceção); (d) mudança material só via nova versão de ocorrência. Assim `ocorrência = 12/09` e `oferta = 13/09` é impossível.

## 7. Cobertura, Folgas e indisponibilidade

Função autoritativa `dp_cobertura_disponivel(company, unidade, data, cargo, turno)`:
```text
minimo      = dp_cobertura_minima (unidade/cargo/dow/turno, vigência, mais exigente prevalece)
disponiveis = fixos previstos (jornada/escala)
            + intermitentes/freelancers com compoe_equipe_habitual E unidade E dia/turno aplicável
            - folgas concedidas - férias - ausências
            - indisponibilidades (se dp_config_dp.considerar_indisponibilidade_cobertura)
```
`dp_folgas_validar_unificado` ganha uma etapa **ao final** (todas as validações atuais preservadas): se existe mínimo aplicável e `disponiveis - 1 < minimo`, então bloqueia quando `origem='solicitacao'` (mensagem: "Não há cobertura suficiente para liberar outra folga nesta data.") e apenas alerta quando o lançamento é do admin. O override do admin passa por RPC que grava usuário, timestamp, cobertura esperada, cobertura resultante e a confirmação. Sem mínimo cadastrado ou com a regra desligada → comportamento atual idêntico. Indisponibilidade nunca é negada por déficit e nunca revoga folga concedida; o déficit aparece como "Garçom 5/6 — falta 1" em Operação, na análise de Folgas e como vaga sugerida na criação da Convocação. Frontend só faz prévia; a decisão é do banco.

## 8. Matriz de RPCs

| RPC | Quem chama | Autenticação | Autorização | Atomicidade | Idempotência | Locks |
|---|---|---|---|---|---|---|
| `dp_convocacao_grupo_salvar` | admin | auth.uid() | `is_company_admin_or_owner(uid, company alvo)` | 1 tx | por `grupo_id` | row do grupo |
| `dp_convocacao_publicar` | admin | auth.uid() | admin da empresa do grupo | 1 tx (ocorrências + ofertas + eventos) | reexecução não duplica ofertas (UNIQUE colaborador+ocorrência) | grupo + ocorrências |
| `dp_convocacao_aceitar` | trabalhador | auth.uid() | oferta pertence ao colaborador do uid | 1 tx | sim | ocorrência FOR UPDATE |
| `dp_convocacao_recusar` | trabalhador | auth.uid() | idem | 1 tx | sim | oferta |
| `dp_convocacao_cancelar` | admin | auth.uid() | admin | 1 tx | sim | grupo/ocorrência |
| `dp_convocacao_revisar_ocorrencia` | admin | auth.uid() | admin | 1 tx | por versão | ocorrência |
| `dp_convocacao_reabrir_vaga` | admin | auth.uid() | admin | 1 tx | sim | ocorrência |
| `dp_convocacao_substituir` | trabalhador/admin | auth.uid() | solicitante ou destinatário ou admin; matriz de `dp_convocacao_config` | 1 tx (libera titular + aloca substituto + escala + eventos) | sim | ocorrência + duas ofertas |
| `dp_indisponibilidade_marcar` / `_remover` | trabalhador/admin | auth.uid() | próprio colaborador ou admin | 1 tx | sim | linha |
| `dp_folga_override_cobertura` | admin | auth.uid() | admin | 1 tx | por folga | folga |
| `dp_convocacao_classificar_descumprimento` | admin | auth.uid() | admin | 1 tx | sim | linha |
| `dp_convocacao_processar_prazos` (job) | cron/service_role | — | interno | lote em tx curtas | sim | ofertas selecionadas |

Multiempresa (terminologia corrigida): operações administrativas recebem a empresa alvo (ou uma entidade dela) como **contexto**, e o backend valida `auth.uid()` + vínculo + papel antes de autorizar — nunca confia no `company_id` recebido. Operações do trabalhador derivam empresa/colaborador da própria oferta/ocorrência + `dp_colaborador_ativo_of(auth.uid())`, minimizando parâmetros do cliente.

## 9. RLS, grants, auditoria e job

- Todas as tabelas novas: RLS habilitada; leitura de admin/membro por `is_company_member`/`is_company_admin_or_owner`; leitura do trabalhador restrita às próprias ofertas/indisponibilidades via `dp_colaborador_ativo_of`; **escrita só por RPC** (sem policy de UPDATE direto). A policy atual `dp_convocacoes_respond_self` é removida em favor da RPC.
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` conforme as policies (sem `anon`), `GRANT ALL ... TO service_role`.
- `dp_convocacao_eventos`: sem policy de UPDATE/DELETE; grava-se pelas RPCs (SECURITY DEFINER).
- Sem DELETE de convocação publicada: apenas cancelamento/arquivamento. DELETE físico só de grupo em rascunho.
- Job server-side com **pg_cron** (extensão já instalada no projeto): a cada 10 minutos, função idempotente marca `sem_resposta` (prazo vencido) e `encerrada_inicio_ocorrencia` (jornada iniciada), encerra pendentes de ocorrência cheia e fecha ocorrências/grupos realizados. Leituras nunca dependem do frontend para derivar estado; a UI só exibe o que está materializado.

## 10. UX

Fluxo administrativo preservado: Nova Convocação → Unidade → Mês → Cargos → Calendário de cobertura → Detalhe dos confirmados → Selecionar datas → Vagas por cargo/data → Individual ou Aberta → Pessoas/público → Jornada → Revisão → Publicação.

Desktop (calendário do mês, célula por dia):
```text
SÁB 12                        Garçom      3 / 6   faltam 3
                              Cumim       2 / 2   ok
                              Aux.Coz.    4       (sem mínimo)
                              + 2 aguardando · 1 indisponível
```
Clique no dia → painel com agrupamento por cargo e, por pessoa: nome, modalidade (Fixo/Intermitente/Freelancer), horário, origem (Escala/Convocação/Substituição) e situação. "Aguardando" em bloco separado, nunca somado a confirmados.

Mobile: mesmo fluxo em etapas de tela cheia; calendário em lista vertical por dia (cards com cargo, `3/6`, faltas); detalhe do dia em sheet; seleção de datas por toque com contador fixo no rodapé ("4 dias selecionados"); vagas por data em cards com stepper.

Portal (desktop e mobile): Minhas Convocações com abas Pendentes/Próximas/Realizadas, card com unidade, cargo, data, horário, prazo e ações Recusar/Aceitar; calendário único do colaborador ganha "Não estarei disponível" para intermitente/freelancer, com o dia marcado como "Indisponível"; convocação aceita na data oferece "Manter" ou "Solicitar substituição"; desistência sempre oferece antes a busca de substituto e, para intermitente, exibe o alerta da referência de 50%.

Convocações (tela principal): abas Próximas, Aguardando, Confirmadas, Realizadas, Histórico, Regras + botão Nova Convocação. Selo discreto "⚠ Enviada com antecedência inferior a 3 dias" nas ocorrências marcadas.

## 11. Migração e rollback

Fase 3 (banco/backend): enums novos; `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_config`, `dp_indisponibilidades`, `dp_convocacao_descumprimentos`, `dp_convocacao_eventos`; colunas novas em `dp_convocacoes` (+ troca do índice único), coluna em `dp_colaborador_config_trabalho`, colunas de regra em `dp_config_dp`; função central de regime convocável substituindo a comparação literal no `dp_convocacao_guard`; funções de cobertura; RPCs; RLS/grants; job pg_cron. Sem backfill: `dp_convocacoes` = 0 linhas e `dp_escala_itens origem='convocacao'` = 0 linhas (confirmado no banco desta auditoria).

Rollback por etapa: tabelas novas são dropáveis sem afetar o legado; colunas novas são aditivas (default seguro) e podem ser mantidas inertes; o índice único antigo é recriável a partir da definição registrada; o guard volta por `CREATE OR REPLACE`; o job é desagendável. Nenhuma coluna/tabela existente é removida.

## 12. Riscos

- **P0**: aceite sem lock (overbooking); dupla ocupação em substituição; guard bloqueando freelancer; autorização multiempresa nas RPCs (validar vínculo + papel, nunca confiar no `company_id` recebido); remoção da policy de UPDATE direto junto com a entrada da RPC (senão sobra caminho inseguro).
- **P1**: consolidação de item de escala por dia (Opção B) — precisa de teste de regressão em Operação/Ponto/VA/VT; nova etapa de cobertura em `dp_folgas_validar_unificado` podendo bloquear folga que hoje passa; `idx_dp_cct_vigente` limitando equipe habitual multiunidade; divergência ocorrência × oferta se algum caminho de escrita escapar do trigger.
- **P2**: carga do job e do calendário mensal com muitos cargos; duas telas de configuração (Folgas e Convocações); calendário do Portal lendo duas fontes.

## 13. O que a Fase 3 implementa

Somente banco e backend: enums, tabelas, colunas, índices, CHECKs, funções de regime e cobertura, RPCs de publicação/aceite/recusa/cancelamento/substituição/reabertura/indisponibilidade/override/descumprimento, RLS, grants, job pg_cron e testes (concorrência de vaga, substituição sem dupla ocupação, multiempresa, regressão de Folgas). Nenhuma tela nesta fase.

## 14. Decisão pendente antes da Fase 3

Apenas a da seção 0: **Opção B com consolidação do item de escala** (recomendada) ou **Opção A**.

PARADO ao final da Fase 2. Nada foi implementado em código, banco, migrations, RLS ou frontend. Aguardo sua aprovação.
