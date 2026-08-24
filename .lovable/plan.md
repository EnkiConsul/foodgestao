# Convocações — Fase 2: Resumo final consolidado

**Fase 1 não foi implementada** — era diagnóstico. Nenhuma linha de código, migration, RLS, tabela ou tela foi criada ou alterada em nenhum momento deste projeto de Convocações. O único arquivo escrito foi o documento de plano.

Este documento incorpora as 25 correções do seu retorno e substitui a versão anterior da Fase 2.

## 1. Decisão de versão: Opção A

- Um colaborador tem **no máximo uma convocação/alocação ativa por data**.
- **Não haverá consolidação** de dois períodos do mesmo dia em um único `dp_escala_itens`. Jornadas descontínuas (11:00–15:00 + 18:00–23:00) não serão representadas como 11:00–23:00.
- `dp_escala_itens` **não é alterada** por este projeto: nem a UNIQUE (escala, colaborador, data), nem sua semântica de um período por dia.
- Evolução futura registrada e fora da Fase 3: **múltiplos segmentos de jornada no mesmo dia** em Jornada/Escala. Só depois disso Convocações poderá usar múltiplas alocações diárias sem perda de informação. Limite de versão, não impossibilidade do produto.

## 2. Modelo final de dados

```text
dp_convocacao_grupos ──1:N── dp_convocacao_ocorrencias ──1:N── dp_convocacoes
                                        │                          │
                                        │                          ├── dp_escala_itens (alocação)
                                        │                          └── dp_convocacao_descumprimentos
                                        └── dp_convocacao_eventos (timeline, com company_id)

dp_indisponibilidades (colaborador × data, global)
dp_convocacao_config  (empresa, unidade opcional)
```

**`dp_convocacao_grupos`** — `id`, `company_id`, `unidade_id`, `competencia` (`YYYY-MM`), `titulo`, `modalidade` (`individual|aberta`), `status`, `criada_por`, `publicada_em/_por`, `cancelada_em/_por`, `motivo_cancelamento`, timestamps. Índices `(company_id, competencia)`, `(company_id, status)`.

**`dp_convocacao_ocorrencias`** — representa uma **necessidade real**: `data` + `cargo_id` + **janela de necessidade**. Campos: `id`, `grupo_id` (CASCADE), `company_id`, `unidade_id`, `data`, `cargo_id`, `turno_id`, `necessidade_entrada`, `necessidade_saida`, `necessidade_termina_no_dia_seguinte`, `vagas`, `horario_modo` (`jornada_individual|horario_unico`), `entrada`, `saida`, `intervalo_minutos`, `termina_no_dia_seguinte`, `carga_prevista_horas`, `inicio_previsto` timestamptz, `antecedencia_dias`, `fora_antecedencia`, `confirmado_fora_prazo_por/_em`, `condicoes_comuns` jsonb, `status`, `versao`, `substitui_ocorrencia_id`, `publicada_em`, timestamps.
- A janela de necessidade é **obrigatória**: vem do `turno_id` quando informado, senão de `necessidade_entrada/saida` explícitas. CHECK garante que uma das duas fontes existe. Uma ocorrência "12/09 · Garçom · 4 vagas" sem período não é aceita — precisa ser "12/09 · Garçom · Jantar (18:00–02:00) · 4 vagas".
- `entrada/saida/intervalo/carga` só são preenchidos quando `horario_modo='horario_unico'` (CHECK). Em `jornada_individual` ficam nulos na ocorrência.
- **Unicidade com `turno_id` nulo**: PostgreSQL do projeto é **17.6**, então a migration usará `UNIQUE NULLS NOT DISTINCT (grupo_id, data, cargo_id, turno_id, versao)`, que trata NULL como valor comparável e impede a duplicata que a UNIQUE clássica deixaria passar. Decisão documentada na própria migration.
- Índices `(company_id, data)`, `(unidade_id, data)`, `(status, inicio_previsto)`.

**`dp_convocacoes`** (tabela atual, evoluída) — novos campos: `ocorrencia_id` (FK, NOT NULL), `disponibilizada_em`, `visualizada_em`, `encerramento_operacional`, `remuneracao_snapshot` jsonb (**fonte autoritativa** das condições financeiras apresentadas à pessoa), `substituida_por_id`, `substitui_convocacao_id`, `origem` (`convocacao|substituicao`), `compatibilidade` (ver seção 5). Índices `(ocorrencia_id, status)`, `(status, prazo_resposta)`, `(status, encerramento_operacional)` + os atuais.

**`dp_indisponibilidades`** — `id`, `company_id`, `colaborador_id` (CASCADE), `data`, `motivo`, `criado_por`, timestamps. **Sem `unidade_id`**: a indisponibilidade do dia é **global** para o trabalhador. `UNIQUE (colaborador_id, data)`; `company_id` derivado do colaborador pelo backend, com consistência garantida por trigger. Índices `(company_id, data)`, `(colaborador_id, data)`.

**`dp_convocacao_config`** — `company_id`, `unidade_id` (nullable = padrão da empresa), `antecedencia_dias` (3), `prazo_resposta_uteis` (1), matriz de troca (`int_int`, `int_free`, `free_int`, `free_free`, `fixo_dominical`), `aprovacao_modo`, `reabertura_automatica`, `preset`. `UNIQUE (company_id, unidade_id)` + índice único parcial para `unidade_id IS NULL`. Resolução unidade > empresa.

**`dp_convocacao_descumprimentos`** — `id` (PK), `company_id` (derivado da convocação/ocorrência por trigger, nunca do cliente), `convocacao_id` (FK), `ocorrencia_id` (FK), `colaborador_id` (FK), `tipo` (`desistencia_apos_aceite|ausencia_no_dia`), `motivo_informado`, `analise` (`pendente|justificado|sem_justo_motivo`), `analisado_por/_em`, `observacao_analise`, `base_remuneracao`, `percentual`, `valor_referencia`, `prazo_limite`, `created_at`, `updated_at`.
- CHECK: valor de referência só com `analise='sem_justo_motivo'`; percentual só para regime intermitente.
- **Idempotência**: `UNIQUE (convocacao_id, tipo)` — retry da mesma RPC não duplica o mesmo descumprimento lógico.
- Índices `(company_id, created_at desc)`, `(company_id, analise)`, `(colaborador_id)`.

**`dp_convocacao_eventos`** — `id` (PK), **`company_id` NOT NULL derivado pelo backend**, `grupo_id`, `ocorrencia_id`, `convocacao_id` (FKs, nullable conforme o escopo do evento), `tipo`, `payload` jsonb sanitizado, `ator`, `criado_em`. Append-only. Índices `(company_id, criado_em desc)`, `(convocacao_id)`, `(ocorrencia_id)`, `(grupo_id)`.

**Equipe habitual** — `compoe_equipe_habitual` bool default true em `dp_colaborador_config_trabalho`. `idx_dp_cct_vigente` não é alterada na Fase 3.

## 3. Estados definitivos

**Grupo**: `rascunho → publicado → (parcialmente_preenchido | preenchido) → encerrado | cancelado`.

**Ocorrência**: `rascunho → publicada → (aguardando | preenchida) → encerrada_operacionalmente → apurada | cancelada | revisada`.

**Oferta (`dp_convocacoes`)**:
`pendente → aceita | recusada | sem_resposta | encerrada_sem_vaga | encerrada_inicio_ocorrencia | cancelada | substituida | desistida`
e, a partir de `aceita`: `→ desistida` | `→ substituida` | `→ encerrada_operacionalmente → compareceu | ausente`.

Ocupação de vaga:

| Ocupa vaga | Não ocupa |
|---|---|
| `aceita` | `pendente`, `recusada`, `sem_resposta`, `encerrada_sem_vaga`, `cancelada`, `substituida`, **`desistida`** |
| `encerrada_operacionalmente`, `compareceu`, `ausente` (histórico da alocação consumada) | — |

**Estado de desistência (item 11)** — nome adotado: **`desistida`**.
```text
aceita → trabalhador informa que não comparecerá → tentativa de substituição
  ├─ substituição concluída  → oferta vira `substituida` (substituto entra em `aceita`)
  └─ sem substituição        → oferta vira `desistida` (NÃO ocupa vaga)
                              + descumprimento `desistencia_apos_aceite` = pendente
                              + vaga volta a contar como aberta e pode ser reaberta
```
`desistida` ≠ `substituida`: na primeira a vaga fica descoberta; na segunda foi transferida.

**Descumprimento não define ocupação (item 12)** — o estado da oferta responde "ainda ocupa a vaga?"; o descumprimento responde "o que aconteceu depois do aceite e há algo a analisar?". Uma análise trabalhista pendente **nunca** impede a operação de reabrir a vaga.

**Falta no dia (item 13)** — quem faltou sem avisar permaneceu `aceita` até o início da jornada. Após a ocorrência, a alocação vai para `encerrada_operacionalmente` e recebe classificação `ausente`, com descumprimento `ausencia_no_dia`. O histórico **preserva** que houve aceite — nunca se reescreve que a pessoa não aceitou.

**"Realizada" não vem do relógio (item 14)** — o job só marca **encerramento operacional** (a oportunidade começou/terminou). Comparecimento é conceito separado: vem do **Ponto**, quando houver, ou de **confirmação administrativa**. A ocorrência só chega a `apurada` quando todas as alocações têm desfecho (`compareceu`/`ausente`). O cron nunca inventa presença.

**Indisponibilidade**: `ativa → removida` (apenas para datas futuras).
**Descumprimento**: `pendente → justificado | sem_justo_motivo`.

## 4. Unicidade da oferta (item 4)

Regra funcional preservada: **máximo uma convocação ativa por colaborador/data**. Índice parcial:
```text
UNIQUE (colaborador_id, data) WHERE status IN ('pendente','aceita')
```
Estados que não ocupam a oportunidade (`recusada`, `sem_resposta`, `encerrada_sem_vaga`, `cancelada`, `substituida`, `desistida`) **não bloqueiam** uma nova oferta para a mesma data. Estados pós-operacionais (`encerrada_operacionalmente`, `compareceu`, `ausente`) também não bloqueiam. A Fase 3 apresenta a definição exata do índice (com a lista final de estados) **antes** de aplicar.

## 5. Snapshot individual e compatibilidade jornada × necessidade

**`horario_unico`** — a RPC de publicação copia entrada/saída/intervalo/carga da ocorrência para cada oferta.

**`jornada_individual`** — a RPC de publicação resolve, **por trabalhador**:
```text
ocorrência → horario_modo=jornada_individual → trabalhador
  → configuração de trabalho vigente (dp_colaborador_config_trabalho / dp_colaborador_config_dias)
  → dia da semana / turno aplicável
  → horário individual (entrada, saída, intervalo, carga)
  → snapshot gravado em dp_convocacoes
```
O snapshot individual **nunca** é copiado da ocorrência nesse modo. Depois de `disponibilizada_em`, é **imutável**.

**Regra de compatibilidade (item 9)** — a oferta compara o horário individual com a janela da necessidade e recebe:

| Classificação | Critério | Efeito na vaga |
|---|---|---|
| `integral` | cobre a janela inteira da necessidade (tolerância configurável, padrão 0 min) | ocupa 1 vaga cheia |
| `parcial` | interseção ≥ 60% da janela, mas não integral | ocupa a vaga **marcada como parcial**: o painel mostra "4/4 — 1 parcial" e o déficit permanece visível |
| `incompativel` | interseção < 60% da janela | **não pode ser ofertada**; se a jornada individual resolver assim, a pessoa é excluída do público e o gestor é avisado |

Cálculo com virada de meia-noite tratada (janela e jornada normalizadas em minutos absolutos a partir da data da ocorrência). A cobertura **nunca** declara vaga automaticamente coberta quando o horário ofertado não atende à necessidade — `4/4` só aparece limpo quando as quatro alocações são `integral`.

**Remuneração (item 22)** — a ocorrência guarda apenas `condicoes_comuns` (regra/condição comum da oportunidade, quando houver); a **oferta individual** é a fonte histórica autoritativa (`remuneracao_snapshot`). Não existem dois snapshots completos independentes.

## 6. Integridade ocorrência × oferta (itens 5–7)

O trigger de `dp_convocacoes` **não sobrescreve cegamente o horário**:
- Deriva/valida sempre: `company_id`, `unidade_id`, `data`, `cargo`, `turno_id`, `ocorrencia_id`, `encerramento_operacional` e demais atributos estruturais, a partir da ocorrência.
- Horário: em `horario_unico`, deriva da ocorrência; em `jornada_individual`, **aceita o snapshot calculado pela RPC de publicação** e apenas valida coerência (carga > 0 e compatibilidade classificada).
- Após `disponibilizada_em`, estruturais e snapshot são **imutáveis** (exceção no trigger). Mudança material só por nova `versao` de ocorrência.

## 7. Fluxo de escala e reabertura

- Aceite → `dp_convocacao_sync_escala` (chamada pela RPC, não como efeito implícito) cria **um** item de escala `origem='convocacao'` para a data — sempre um único período, coerente com a Opção A.
- `recusada`, `cancelada`, `substituida`, `desistida` → item recalculado/removido conforme a alocação ativa da data; a substituição transfere o item para o substituto na mesma transação.
- **Reabertura**: a vaga volta a contar como aberta quando a oferta sai de `aceita` para `desistida`/`substituida` sem substituto/`cancelada`. O admin reabre a vaga (ou a configuração reabre automaticamente); histórico preservado; novas ofertas para os elegíveis. Ofertas antigas nunca são reescritas.
- Operação, Horário Previsto, Ponto, VA/VT e folha continuam lendo `dp_escala_itens` — nenhum consumidor muda.

## 8. Cobertura e override de folga (item 23)

`dp_cobertura_disponivel(company, unidade, data, cargo, turno/janela)`:
```text
minimo      = dp_cobertura_minima (unidade/cargo/dow/turno, vigência, mais exigente prevalece)
disponiveis = fixos previstos + intermitentes/freelancers com equipe habitual aplicável
            + alocações de convocação classificadas `integral` (parciais contadas à parte)
            - folgas concedidas - férias - ausências - indisponibilidades (se a regra estiver ligada)
```
`dp_folgas_validar_unificado` ganha uma etapa **ao final**, preservando todas as validações atuais: com mínimo aplicável e `disponiveis - 1 < minimo`, **bloqueia** quando `origem='solicitacao'` e **alerta** quando o lançamento é do admin. Sem mínimo cadastrado ou regra desligada → comportamento idêntico ao atual.

**Override do admin** é uma RPC única que, na mesma transação: **revalida a cobertura** no banco, **registra a decisão** (usuário, horário, cobertura esperada e resultante, justificativa) e **cria/aprova a folga**. O frontend só exibe prévia; a cobertura pode mudar entre passos, então nada é decidido no cliente. Indisponibilidade nunca é negada por déficit e nunca revoga folga concedida.

## 9. Job e precedência determinística (item 15)

`dp_convocacao_processar_prazos` (pg_cron, extensão já instalada), idempotente, a cada 10 minutos, com precedência **pelo evento que ocorreu primeiro**, não pelo minuto em que o cron rodou:
```text
se prazo_resposta < inicio_previsto e prazo venceu  → sem_resposta
se inicio_previsto < prazo_resposta e já iniciou    → encerrada_inicio_ocorrencia
ocorrência com vagas cheias                        → pendentes viram encerrada_sem_vaga
após o fim da janela                               → alocações vão a encerrada_operacionalmente
                                                     (nunca a "realizada"/"compareceu")
```
Reprocessar o mesmo intervalo produz exatamente o mesmo resultado.

## 10. Segurança, grants e SECURITY DEFINER (itens 16–18)

**RPC-only, sem escrita direta.** Para `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacoes`, `dp_convocacao_descumprimentos`, `dp_convocacao_config`, `dp_convocacao_eventos` e `dp_indisponibilidades`:
```text
authenticated → GRANT SELECT (limitado pela RLS)
authenticated → REVOKE INSERT, UPDATE, DELETE
authenticated → GRANT EXECUTE apenas nas RPCs autorizadas
service_role  → GRANT ALL
anon          → nenhum privilégio
```
A policy atual `dp_convocacoes_respond_self` (UPDATE direto) é **removida** na mesma migration que entrega a RPC de resposta — as duas estratégias não coexistem. `dp_convocacao_eventos` não recebe UPDATE/DELETE por ninguém além do service_role.

**RLS**: leitura de admin/membro por `is_company_member`/`is_company_admin_or_owner`; leitura do trabalhador restrita às próprias ofertas/indisponibilidades via `dp_colaborador_ativo_of(auth.uid())`.

**Toda função SECURITY DEFINER nova**: `SET search_path` seguro, objetos qualificados, validação de `auth.uid()`, empresa, papel, entidade e estado; **nunca** confia no `company_id` do cliente (derivado da entidade); `REVOKE EXECUTE FROM PUBLIC` e `FROM anon`, concedendo apenas aos papéis necessários; funções internas não expostas. Menor privilégio em todos os casos.

Sem DELETE de convocação publicada — apenas cancelamento/arquivamento. DELETE físico só de grupo em rascunho.

## 11. Limites da Fase 3

Somente banco e backend: enums, tabelas novas, colunas, índices (incluindo o parcial de unicidade e o `NULLS NOT DISTINCT`), CHECKs, triggers de derivação/imutabilidade, função central de regime convocável (liberando **freelancer**, hoje bloqueado pelo `dp_convocacao_guard`), motor de compatibilidade jornada × necessidade, funções de cobertura, RPCs (publicar, aceitar, recusar, cancelar, revisar, reabrir vaga, substituir, desistir, registrar/classificar descumprimento, marcar/remover indisponibilidade, override de folga, processar prazos), RLS, grants/revokes, job pg_cron e testes (concorrência de vaga, desistência liberando vaga, substituição sem dupla ocupação, precedência do job, multiempresa, regressão de Folgas/Operação).

**Fora da Fase 3**: qualquer alteração em `dp_escala_itens`, consolidação de períodos, múltiplos segmentos de jornada, telas (Fase 4) e testes ponta a ponta (Fase 5).

---

Nada foi criado ou alterado: **sem migration, sem código, sem banco, sem RLS**. PARADO aqui, aguardando sua aprovação da Fase 2 para autorizar a Fase 3.
