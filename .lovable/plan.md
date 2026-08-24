# Convocações — Fase 2: Arquitetura alvo e UX (nada implementado)

Fase 1 aprovada. Este documento fecha as decisões estruturais para que a Fase 3 implemente banco/backend sem ambiguidade.

## 0. Decisão pendente (evidência concreta)

Sua preferência é permitir **mais de uma oportunidade no mesmo dia** (almoço + jantar), sem conflito de horário. A auditoria encontrou um impedimento fora de Convocações:

`dp_escala_itens` tem **UNIQUE (escala_id, colaborador_id, data)**. Logo, dois aceites da mesma pessoa no mesmo dia **não podem** gerar dois itens de escala. Como Escala é a fonte de Operação, Horário Previsto, Ponto e VA/VT, mudar essa unicidade é alteração de alto alcance.

Caminho recomendado (**Opção B com consolidação**, sem tocar na unicidade):
- Unicidade da oferta passa a ser `UNIQUE (colaborador_id, ocorrencia_id)` + validação backend de conflito real de horário (virada de meia-noite e intervalo mínimo entre jornadas).
- Na escala, os aceites do mesmo dia são **consolidados em um único item**: o primeiro cria, o segundo estende (menor entrada, maior saída, soma de carga); as duas ofertas apontam para o mesmo `escala_item_id`. Cancelar/substituir recalcula o item a partir das alocações ativas do dia.
- Alternativa mais simples: **Opção A** — uma oportunidade ativa por pessoa/dia, zero mudança em escala, sem almoço+jantar no mesmo dia.

O desenho abaixo assume **B com consolidação**; o ponto está isolado para trocar por A sem redesenho.

## 1. Entidades

```text
dp_convocacao_grupos ──1:N── dp_convocacao_ocorrencias ──1:N── dp_convocacoes
                                        │                          │
                                        │                          ├── dp_escala_itens (alocação)
                                        │                          └── dp_convocacao_descumprimentos
                                        └── dp_convocacao_eventos (timeline)

dp_indisponibilidades (colaborador × data)
dp_convocacao_config  (empresa, unidade opcional)
```

### 1.1 `dp_convocacao_grupos`
`id`, `company_id`, `unidade_id`, `competencia` (`YYYY-MM`), `titulo`, `modalidade` enum `individual|aberta`, `status`, `criada_por`, `publicada_em/_por`, `cancelada_em/_por`, `motivo_cancelamento`, timestamps. CHECK de formato da competência. Índices `(company_id, competencia)`, `(company_id, status)`.

### 1.2 `dp_convocacao_ocorrencias`
`id`, `grupo_id` (CASCADE), `company_id`, `unidade_id`, `data`, `cargo_id`, `turno_id` (nullable), `vagas`, `horario_modo` enum `jornada_individual|horario_unico`, `entrada`, `saida`, `intervalo_minutos`, `termina_no_dia_seguinte`, `carga_prevista_horas`, `inicio_previsto` timestamptz, `antecedencia_dias`, `fora_antecedencia`, `confirmado_fora_prazo_por/_em`, `remuneracao_snapshot` jsonb, `status`, `versao`, `substitui_ocorrencia_id`, `publicada_em`, timestamps.
CHECKs: `vagas >= 1`; horário único exige entrada/saída e carga > 0. UNIQUE `(grupo_id, data, cargo_id, turno_id, versao)`. Índices `(company_id, data)`, `(unidade_id, data)`, `(status, inicio_previsto)`.

### 1.3 `dp_convocacoes` (tabela atual, evoluída — oferta individual)
Novos campos: `ocorrencia_id`, `disponibilizada_em`, `visualizada_em`, `encerramento_operacional`, `remuneracao_snapshot`, `substituida_por_id`, `substitui_convocacao_id`, `origem` enum `convocacao|substituicao`, `analise_pendente`.
Campos espelhados da ocorrência são **derivados no backend** (seção 6). UNIQUE `(colaborador_id, ocorrencia_id)` substitui `uq_dp_convocacoes_ativa`. Novos índices `(ocorrencia_id, status)`, `(status, prazo_resposta)`, `(status, encerramento_operacional)`.

### 1.4 `dp_indisponibilidades`
`id`, `company_id`, `colaborador_id` (CASCADE), `data`, `unidade_id` (nullable), `motivo`, `criado_por`, timestamps. UNIQUE `(colaborador_id, data)`. Data passada é barrada na RPC (comparação com `CURRENT_DATE`), não por CHECK.

### 1.5 `dp_convocacao_config`
`company_id`, `unidade_id` (nullable = padrão da empresa), `antecedencia_dias` (3), `prazo_resposta_uteis` (1), matriz de troca (`int_int`, `int_free`, `free_int`, `free_free`, `fixo_dominical`), `aprovacao_modo` enum `sempre_gestor|somente_excecoes|automatica`, `reabertura_automatica`, `preset` enum `controlado|moderado|autonomo|personalizado`. UNIQUE `(company_id, unidade_id)` + índice único parcial para `unidade_id IS NULL`. Resolução unidade > empresa, no padrão de `dp_config_resolvida`.

### 1.6 `dp_convocacao_descumprimentos`
`convocacao_id`, `ocorrencia_id`, `colaborador_id`, `tipo` enum `desistencia_apos_aceite|ausencia_no_dia`, `motivo_informado`, `analise` enum `pendente|justificado|sem_justo_motivo`, `analisado_por/_em`, `observacao_analise`, `base_remuneracao`, `percentual`, `valor_referencia`, `prazo_limite`. Valor de referência só quando `sem_justo_motivo` **e** regime intermitente; freelancer registra sem multa. **Nenhum efeito financeiro automático.**

### 1.7 `dp_convocacao_eventos`
`grupo_id`, `ocorrencia_id`, `convocacao_id`, `tipo`, `payload` jsonb sanitizado, `ator`, `criado_em`. Append-only (sem policy de UPDATE/DELETE).

### 1.8 Equipe habitual
Coluna `compoe_equipe_habitual` bool default true em `dp_colaborador_config_trabalho`. A constraint `idx_dp_cct_vigente UNIQUE (colaborador_id) WHERE vigencia_fim IS NULL` **não é alterada na Fase 3** — cobre o cenário atual (12 configs, uma por colaborador). Multiunidade fica como Fase 3b, com migration dedicada e inventário de consumidores (`useDpColaboradorConfigTrabalho`, `config-trabalho.ts`, `escala-mes.ts`, `operacao-panorama.ts`).

## 2. Máquina de estados

Grupo: `rascunho → publicado → (parcialmente_preenchido | preenchido) → realizado | cancelado`.
Ocorrência: `rascunho → publicada → (aguardando | preenchida) → encerrada | realizada | cancelada | revisada`.
Oferta: `pendente → aceita | recusada | sem_resposta | encerrada_sem_vaga | encerrada_inicio_ocorrencia | cancelada | substituida`.

**Somente `aceita` ocupa vaga.** Na substituição, a oferta original vai para `substituida` e a nova entra em `aceita` na **mesma transação** — invariante de ocupação única.

| Entidade | De | Ação | Para | Quem | Validações |
|---|---|---|---|---|---|
| Grupo | rascunho | publicar | publicado | admin | ≥1 ocorrência; confirmação de antecedência quando aplicável |
| Grupo | publicado | cancelar | cancelado | admin | cancela ofertas não aceitas; aceitas exigem motivo |
| Ocorrência | publicada | preencher | preenchida | sistema | aceites = vagas |
| Ocorrência | publicada | revisar (mudança material) | revisada | admin | cria nova versão, preserva histórico |
| Ocorrência | preenchida/aguardando | realizar | realizada | sistema/admin | após a data |
| Oferta | pendente | aceitar | aceita | dono | prazo, encerramento, vaga livre, elegibilidade, sem conflito |
| Oferta | pendente | recusar | recusada | dono | prazo/encerramento |
| Oferta | pendente | prazo vencido | sem_resposta | job | `now() > prazo_resposta` |
| Oferta | pendente | jornada iniciada | encerrada_inicio_ocorrencia | job | `now() >= encerramento_operacional` |
| Oferta | pendente | vagas esgotadas | encerrada_sem_vaga | RPC/job | aceites = vagas |
| Oferta | aceita | substituir | substituida | RPC | substituto validado e alocado na mesma tx |
| Oferta | aceita | desistir | aceita + descumprimento pendente | dono | substituição oferecida antes |
| Indisponibilidade | — | marcar/remover | ativa/removida | dono ou admin | data futura; oferta aceita direciona substituição |
| Descumprimento | pendente | classificar | justificado / sem_justo_motivo | admin | valor só no intermitente sem justo motivo |

## 3. Fluxos

- **Individual**: grupo individual → uma ocorrência por data com `vagas=1` → uma oferta por pessoa.
- **Aberta**: ocorrência com N vagas → ofertas a todo o público elegível → primeiros N aceites ocupam; os demais viram `encerrada_sem_vaga`.
- **Mensal**: um grupo, várias ocorrências independentes (vagas, horário, status e antecedência próprios). A confirmação do gestor marca exceção só nas datas afetadas.
- **Horário**: `jornada_individual` resolve por destinatário via `config-trabalho.ts`/`dp_colaborador_config_dias`; `horario_unico` aplica o horário da ocorrência. A oferta grava snapshot do que foi apresentado; convocação nunca altera jornada cadastral.
- **Antecedência**: `antecedencia_dias = data - hoje` (dias corridos, fuso da empresa), calculada **no backend** na publicação; `fora_antecedencia` quando abaixo da configuração; alerta + confirmação consciente; nunca bloqueia.
- **Prazos**: `prazo_resposta = disponibilizada_em + 1 dia útil` (nunca encurtado pela urgência) e `encerramento_operacional = inicio_previsto`. Jornada antes do prazo → encerra por `encerrada_inicio_ocorrencia`.
- **Preenchimento total**: a RPC de aceite, ao ocupar a última vaga, materializa as pendentes como `encerrada_sem_vaga` na mesma transação; o job faz varredura de segurança.
- **Reabertura**: admin reabre vaga; histórico preservado; novas ofertas para os elegíveis.

## 4. Aceite concorrente

```text
BEGIN
  SELECT ... FROM dp_convocacao_ocorrencias WHERE id=? FOR UPDATE     -- serializa
  valida: oferta é do usuário; pendente; now() <= prazo;
          now() < encerramento_operacional; ocorrência publicada
  revalida elegibilidade: ativo, unidade, cargo, sem indisponibilidade,
          sem férias/folga conflitante, sem conflito de horário no dia
  count(aceitas) < vagas ? status='aceita' + sincroniza escala (item consolidado)
                         : status='encerrada_sem_vaga'
  se ocupou a última vaga -> encerra as pendentes restantes
  grava evento
COMMIT
```
Idempotente e fail closed: reexecutar sobre oferta já `aceita` retorna o mesmo resultado sem efeito colateral.

## 5. Integração com Escala

`dp_convocacao_sync_escala` deixa de ser efeito implícito e passa a ser função chamada pelas RPCs (aceite, cancelamento, substituição), preservando a lógica atual e aplicando a consolidação por dia da seção 0. Recusa/cancelamento/substituição recalculam o item a partir das alocações ativas; sem alocação ativa, o item de origem `convocacao` é removido. Operação, Horário Previsto, Ponto, VA/VT e folha continuam lendo `dp_escala_itens` — nenhum consumidor muda.

## 6. Integridade ocorrência × oferta

Sem confiar no frontend: (a) a RPC de publicação **deriva** todos os campos espelhados — o cliente não os envia; (b) trigger `BEFORE INSERT/UPDATE` em `dp_convocacoes` reescreve `company_id, unidade_id, data, turno_id, horário, carga, encerramento_operacional` a partir da ocorrência; (c) esses campos são imutáveis após `disponibilizada_em`; (d) mudança material só por nova versão de ocorrência. Ocorrência 12/09 com oferta 13/09 torna-se impossível.

## 7. Cobertura, Folgas e indisponibilidade

Função autoritativa `dp_cobertura_disponivel(company, unidade, data, cargo, turno)`:
```text
minimo      = dp_cobertura_minima (unidade/cargo/dow/turno, vigência, mais exigente prevalece)
disponiveis = fixos previstos (jornada/escala)
            + intermitentes/freelancers com compoe_equipe_habitual, unidade e dia/turno aplicáveis
            - folgas concedidas - férias - ausências
            - indisponibilidades (se a regra estiver ligada em dp_config_dp)
```
`dp_folgas_validar_unificado` ganha uma etapa **ao final**, preservando todas as validações atuais: se há mínimo aplicável e `disponiveis - 1 < minimo`, **bloqueia** quando `origem='solicitacao'` ("Não há cobertura suficiente para liberar outra folga nesta data.") e apenas **alerta** quando o lançamento é do admin. O override do admin passa por RPC que grava usuário, horário, cobertura esperada, cobertura resultante e a confirmação. Sem mínimo cadastrado ou regra desligada → comportamento atual idêntico. Indisponibilidade nunca é negada por déficit e nunca revoga folga concedida; o déficit aparece como "Garçom 5/6 — falta 1" em Operação, na análise de Folgas e como vaga sugerida na criação da Convocação. Frontend só faz prévia; a decisão é do banco.

## 8. Matriz de RPCs

| RPC | Quem chama | Autorização | Atomicidade | Idempotência | Locks |
|---|---|---|---|---|---|
| `dp_convocacao_grupo_salvar` | admin | `is_company_admin_or_owner(uid, empresa do grupo)` | 1 tx | por `grupo_id` | row do grupo |
| `dp_convocacao_publicar` | admin | admin da empresa do grupo | 1 tx (ocorrências + ofertas + eventos) | não duplica ofertas (UNIQUE) | grupo + ocorrências |
| `dp_convocacao_aceitar` | trabalhador | oferta pertence ao colaborador do uid | 1 tx | sim | ocorrência FOR UPDATE |
| `dp_convocacao_recusar` | trabalhador | idem | 1 tx | sim | oferta |
| `dp_convocacao_cancelar` | admin | admin | 1 tx | sim | grupo/ocorrência |
| `dp_convocacao_revisar_ocorrencia` | admin | admin | 1 tx | por versão | ocorrência |
| `dp_convocacao_reabrir_vaga` | admin | admin | 1 tx | sim | ocorrência |
| `dp_convocacao_substituir` | trabalhador/admin | solicitante, destinatário ou admin + matriz de troca | 1 tx (libera titular + aloca substituto + escala + eventos) | sim | ocorrência + duas ofertas |
| `dp_indisponibilidade_marcar` / `_remover` | trabalhador/admin | próprio colaborador ou admin | 1 tx | sim | linha |
| `dp_folga_override_cobertura` | admin | admin | 1 tx | por folga | folga |
| `dp_convocacao_classificar_descumprimento` | admin | admin | 1 tx | sim | linha |
| `dp_convocacao_processar_prazos` (job) | cron/service_role | interno | tx curtas em lote | sim | ofertas selecionadas |

Multiempresa: operações administrativas recebem a empresa alvo como **contexto**, e o backend valida `auth.uid()` + vínculo + papel antes de autorizar — nunca confia no `company_id` recebido. Operações do trabalhador derivam empresa/colaborador da própria oferta + `dp_colaborador_ativo_of(auth.uid())`.

## 9. RLS, grants, auditoria e job

- Tabelas novas com RLS habilitada: leitura de admin/membro por `is_company_member`/`is_company_admin_or_owner`; leitura do trabalhador restrita às próprias ofertas/indisponibilidades via `dp_colaborador_ativo_of`; **escrita só por RPC** (sem policy de UPDATE direto). A policy `dp_convocacoes_respond_self` é removida junto com a entrada da RPC de resposta.
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` conforme as policies (sem `anon`); `GRANT ALL ... TO service_role`.
- `dp_convocacao_eventos` sem UPDATE/DELETE; gravação pelas RPCs (SECURITY DEFINER).
- Sem DELETE de convocação publicada — apenas cancelamento/arquivamento. DELETE físico só de grupo em rascunho.
- Job com **pg_cron** (extensão já instalada): a cada 10 minutos, função idempotente marca `sem_resposta`, `encerrada_inicio_ocorrencia`, encerra pendentes de ocorrência cheia e fecha ocorrências/grupos realizados. A UI nunca deriva estado — só exibe o que está materializado.

## 10. UX

Fluxo administrativo: Nova Convocação → Unidade → Mês → Cargos → Calendário de cobertura → Detalhe dos confirmados → Selecionar datas → Vagas por cargo/data → Individual ou Aberta → Pessoas/público → Jornada → Revisão → Publicação.

Desktop (célula do dia no calendário):
```text
SÁB 12                        Garçom      3 / 6   faltam 3
                              Cumim       2 / 2   ok
                              Aux.Coz.    4       (sem mínimo)
                              + 2 aguardando · 1 indisponível
```
Clique no dia → painel por cargo e, por pessoa: nome, modalidade (Fixo/Intermitente/Freelancer), horário, origem (Escala/Convocação/Substituição) e situação. "Aguardando" em bloco separado, nunca somado a confirmados.

Mobile: mesmo fluxo em etapas de tela cheia; calendário em lista vertical por dia (cards com cargo, `3/6`, faltas); detalhe em sheet; seleção de datas por toque com contador fixo no rodapé; vagas por data em cards com stepper.

Portal: **Minhas Convocações** com abas Pendentes/Próximas/Realizadas — card com unidade, cargo, data, horário, prazo e ações Recusar/Aceitar. O calendário do colaborador ganha "Não estarei disponível" para intermitente/freelancer; em data com convocação aceita, oferece "Manter" ou "Solicitar substituição". Desistência sempre oferece antes a busca de substituto e, para intermitente, exibe o alerta da referência de 50%.

Tela principal de Convocações: abas Próximas, Aguardando, Confirmadas, Realizadas, Histórico, Regras + botão Nova Convocação. Selo discreto "⚠ Enviada com antecedência inferior a 3 dias" nas ocorrências marcadas.

## 11. Migração e rollback

Fase 3 (banco/backend): enums; tabelas `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_config`, `dp_indisponibilidades`, `dp_convocacao_descumprimentos`, `dp_convocacao_eventos`; colunas novas em `dp_convocacoes` (+ troca do índice único); coluna em `dp_colaborador_config_trabalho`; colunas de regra em `dp_config_dp`; função central de regime convocável substituindo a comparação literal do `dp_convocacao_guard`; funções de cobertura; RPCs; RLS/grants; job pg_cron. **Sem backfill** — `dp_convocacoes` e `dp_escala_itens origem='convocacao'` estão com 0 linhas.

Rollback por etapa: tabelas novas são dropáveis sem afetar o legado; colunas novas são aditivas e podem ficar inertes; o índice único antigo é recriável; o guard volta por `CREATE OR REPLACE`; o job é desagendável. Nada existente é removido.

## 12. Riscos

- **P0**: aceite sem lock (overbooking); dupla ocupação em substituição; guard bloqueando freelancer; autorização multiempresa nas RPCs; remoção da policy de UPDATE direto junto com a entrada da RPC.
- **P1**: consolidação do item de escala por dia — exige regressão em Operação/Ponto/VA/VT; nova etapa de cobertura em `dp_folgas_validar_unificado` podendo bloquear folga hoje aceita; `idx_dp_cct_vigente` limitando equipe habitual multiunidade; divergência ocorrência × oferta se algum caminho de escrita escapar do trigger.
- **P2**: carga do job e do calendário mensal com muitos cargos; duas telas de configuração (Folgas e Convocações); calendário do Portal lendo duas fontes.

## 13. O que a Fase 3 implementa

Somente banco e backend: enums, tabelas, colunas, índices, CHECKs, funções de regime e cobertura, RPCs (publicação, aceite, recusa, cancelamento, substituição, reabertura, indisponibilidade, override, descumprimento), RLS, grants, job pg_cron e testes (concorrência de vaga, substituição sem dupla ocupação, multiempresa, regressão de Folgas). Nenhuma tela nesta fase.

## 14. Decisão necessária antes da Fase 3

Apenas a da seção 0: **Opção B com consolidação do item de escala** (recomendada) ou **Opção A**.

PARADO ao final da Fase 2. Nada foi implementado em código, banco, migrations, RLS ou frontend.
