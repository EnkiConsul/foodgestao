# Convocações — Fase 2: versão final para aprovação

Todas as 12 correções obrigatórias do item 24 estão incorporadas. Nada foi implementado: sem migration, tabela, coluna, índice, RPC, trigger, cron ou RLS.

## 1. Compatibilidade jornada × necessidade (itens 1–4)

Threshold de 60% **removido**. Não existe estado `parcial` na V1.

```text
classificacao = integral      → horário do trabalhador cobre INTEGRALMENTE a janela de necessidade
classificacao = incompativel  → qualquer outro caso
```
- Só `integral` é elegível para publicação e para aceite naquela ocorrência. `incompativel` não recebe oferta e não pode aceitar.
- Cobrir integralmente = `inicio_previsto_individual <= necessidade_inicio` **e** `fim_previsto_individual >= necessidade_fim`, comparados em timestamptz (seção 5). Tolerância padrão 0; se a empresa quiser folga de minutos, é parâmetro em `dp_convocacao_config`, nunca percentual.
- `horario_modo='jornada_individual'`: quem tem jornada habitual que não cobre a necessidade **não recebe a oferta**. A RPC de publicação retorna esses casos como diagnóstico ("a jornada habitual não cobre todo o horário necessário"), para a Fase 4 oferecer ao gestor: outra pessoa, alterar o horário, usar `horario_unico`, ou criar outra ocorrência representando outra necessidade.
- Interseção/percentual pode ser calculado e devolvido **apenas como diagnóstico** (`diagnostico_interseccao_minutos`), sem determinar ou ocupar vaga.
- Consequência: `4/4` nunca aparece com déficit real — ocorrência só chega a `preenchida` com N aceites `integral`.

## 2. Unicidade da necessidade (itens 5–6)

A Opção A limita a **pessoa**, não a empresa. Duas necessidades do mesmo cargo no mesmo dia (almoço e jantar) **devem** ser possíveis. Dois índices parciais complementares:

```text
-- ocorrência baseada em turno
UNIQUE (grupo_id, data, cargo_id, turno_id, versao)   WHERE turno_id IS NOT NULL

-- ocorrência baseada em janela explícita
UNIQUE (grupo_id, data, cargo_id, necessidade_entrada, necessidade_saida,
        necessidade_termina_no_dia_seguinte, versao)   WHERE turno_id IS NULL
```
Nenhuma UNIQUE global com `turno_id` nullable. `NULLS NOT DISTINCT` é descartado justamente porque bloquearia almoço + jantar.

CHECK: `turno_id IS NOT NULL` **ou** (`necessidade_entrada` e `necessidade_saida` preenchidas). Uma ocorrência sem período operacional não é aceita.

## 3. Opção A depois da alocação consumada (itens 7–8)

O índice parcial sozinho é insuficiente. Duas camadas:

**Camada 1 — índice parcial (barreira de concorrência)**
```text
UNIQUE (colaborador_id, data)
WHERE status IN ('pendente','aceita','encerrada_operacionalmente','compareceu','ausente')
```
Estados que **bloqueiam** nova convocação na data: `aceita`, `encerrada_operacionalmente`, `compareceu`, `ausente` (a alocação existiu e segue associada ao dia) — e `pendente`, que já ocupa a oportunidade.
Estados que **liberam** a data: `recusada`, `sem_resposta`, `encerrada_sem_vaga`, `cancelada` antes da prestação, `substituida`, `desistida` quando a alocação foi efetivamente removida.

**Camada 2 — validação autoritativa na RPC (regra de produto)**
A RPC de aceite (e a de publicação, ao montar o público) verifica, sob o lock da ocorrência:
- ausência de convocação da pessoa naquela data em estado bloqueante;
- **ausência de `dp_escala_itens` incompatível** para aquele colaborador/data (independente da origem) — se já existe alocação viva no dia, o aceite falha com mensagem clara.
Nunca se depende só do índice.

## 4. Modelo de dados final (deltas)

**`dp_convocacao_ocorrencias`** — `id`, `grupo_id` (CASCADE), `company_id`, `unidade_id`, `data`, `cargo_id`, `turno_id`, `necessidade_entrada`, `necessidade_saida`, `necessidade_termina_no_dia_seguinte`, `necessidade_inicio` / `necessidade_fim` timestamptz (derivados), `vagas`, `horario_modo`, `entrada`/`saida`/`intervalo_minutos`/`carga_prevista_horas` (só em `horario_unico`), `antecedencia_dias`, `fora_antecedencia`, `confirmado_fora_prazo_por/_em`, `condicoes_comuns` jsonb, `status`, `versao`, `substitui_ocorrencia_id`, `publicada_em`, timestamps. Índices: os dois parciais acima, `(company_id, data)`, `(unidade_id, data)`, `(status, necessidade_inicio)`.

**`dp_convocacoes`** — além dos campos atuais: `ocorrencia_id` (**nullable na 3A**, ver seção 8), `disponibilizada_em`, `visualizada_em`, **`inicio_previsto` timestamptz**, **`fim_previsto` timestamptz**, `encerramento_operacional` timestamptz (= `inicio_previsto` da própria oferta), `classificacao` (`integral|incompativel`), `diagnostico_interseccao_minutos`, `remuneracao_snapshot` jsonb (**fonte autoritativa** das condições apresentadas), `substituida_por_id`, `substitui_convocacao_id`, `origem` (`convocacao|substituicao`). Índices `(ocorrencia_id, status)`, `(status, prazo_resposta)`, `(status, encerramento_operacional)`, `(status, fim_previsto)`.

**`dp_indisponibilidades`** — `id`, `company_id` (derivado), `colaborador_id`, `data`, `motivo`, `criado_por`, timestamps. Sem `unidade_id` (indisponibilidade é global no dia). `UNIQUE (colaborador_id, data)`.

**`dp_convocacao_descumprimentos`** — `id`, `company_id` (derivado), `convocacao_id`, `ocorrencia_id`, `colaborador_id`, **`regime_snapshot`** (derivado da oferta no momento do evento), `tipo` (`desistencia_apos_aceite|ausencia_no_dia`), `motivo_informado`, `analise` (`pendente|justificado|sem_justo_motivo`), `analisado_por/_em`, `observacao_analise`, `base_remuneracao`, `percentual`, `valor_referencia`, `prazo_limite`, timestamps.
CHECKs **sem consulta externa** (item 15): `percentual IS NULL OR regime_snapshot = 'intermitente'`; `valor_referencia IS NULL OR analise = 'sem_justo_motivo'`. O regime histórico usado na decisão fica preservado mesmo que o cadastro mude depois. `UNIQUE (convocacao_id, tipo)` para idempotência em retries.

**`dp_convocacao_eventos`** — `id`, `company_id` NOT NULL (derivado pelo backend), `grupo_id`, `ocorrencia_id`, `convocacao_id`, `tipo`, `payload` jsonb, `ator`, `criado_em`. Append-only. Índices `(company_id, criado_em desc)`, `(convocacao_id)`, `(ocorrencia_id)`, `(grupo_id)`.

**`dp_convocacao_grupos`** e **`dp_convocacao_config`** conforme a versão anterior (config com resolução unidade > empresa). `compoe_equipe_habitual` em `dp_colaborador_config_trabalho`, sem alterar `idx_dp_cct_vigente`.

## 5. Horário materializado e timezone (itens 9–11)

Cada oferta materializa `inicio_previsto` e `fim_previsto` em **timestamptz**, derivados do snapshot individual (não da ocorrência), com virada de meia-noite resolvida no cálculo. São a base de: elegibilidade integral, aceite, encerramento operacional, job, Ponto e auditoria. No exemplo "necessidade 18:00–02:00, João 17:30–02:00", o job usa o horário de João.

`encerramento_operacional = inicio_previsto` da própria oferta.

**Timezone**: a conversão `data + hora → timestamptz` usa o fuso aplicável da empresa/unidade resolvido no backend (função única e explícita, definida na 3A). Nunca UTC implícito nem fuso do navegador. O backend é a autoridade; o frontend só exibe.

## 6. Estados definitivos

**Oferta**: `pendente → aceita | recusada | sem_resposta | encerrada_sem_vaga | encerrada_inicio_ocorrencia | cancelada | substituida | desistida`; de `aceita` também `→ encerrada_operacionalmente → compareceu | ausente`.

| Ocupa vaga | Bloqueia nova convocação na data | Libera a data |
|---|---|---|
| `aceita` | `pendente`, `aceita`, `encerrada_operacionalmente`, `compareceu`, `ausente` | `recusada`, `sem_resposta`, `encerrada_sem_vaga`, `cancelada`, `substituida`, `desistida` |

- **`desistida`** (não ocupante): usada quando não houve substituto; libera a vaga e abre descumprimento `desistencia_apos_aceite` pendente.
- **`substituida`** (item 14): a vaga **permanece ocupada** pelo substituto (`aceita`). Substituição **não reabre vaga**.
- **Reabertura só quando a vaga ficou realmente descoberta**: `desistida` sem substituto, ou cancelamento/liberação que retira a alocação sem colocar outra pessoa.
- **Falta no dia**: permanece `aceita` até o início, depois `encerrada_operacionalmente` + `ausente` + descumprimento `ausencia_no_dia`. O histórico nunca é reescrito.
- **"Realizada" não vem do relógio**: o job só marca encerramento operacional; `compareceu`/`ausente` vêm do Ponto ou de confirmação administrativa.

**Ocorrência**: `rascunho → publicada → (aguardando | preenchida) → encerrada_operacionalmente → apurada | cancelada | revisada`.
**Grupo**: `rascunho → publicado → (parcialmente_preenchido | preenchido) → encerrado | cancelado`.

## 7. RPCs afetadas

| RPC | Ajuste desta versão |
|---|---|
| `dp_convocacao_publicar` | resolve jornada individual por trabalhador, calcula `inicio/fim_previsto`, classifica `integral|incompativel`, **oferta só a `integral`**, devolve incompatíveis como diagnóstico |
| `dp_convocacao_aceitar` | lock da ocorrência + revalidação em tempo real de prazo/encerramento (item 12) + regra da Opção A nas duas camadas + checagem de `dp_escala_itens` do dia |
| `dp_convocacao_recusar` | mesma revalidação de prazo/encerramento em tempo real |
| `dp_convocacao_substituir` | libera titular (`substituida`) e aloca substituto (`aceita`) na mesma transação; **não reabre vaga**; substituto precisa ser `integral` |
| `dp_convocacao_desistir` | sem substituto → `desistida` + descumprimento pendente (com `regime_snapshot`) + alocação removida + vaga reabrível |
| `dp_indisponibilidade_marcar` | **atômica** (item 13): sem convocação ativa → registra; com **pendente** → registra + encerra/recusa a oferta + atualiza disponibilidade da ocorrência + eventos, na mesma transação; com **aceita** → não registra e retorna `CONVOCACAO_ACEITA_REQUER_SUBSTITUICAO` para o Portal abrir o fluxo de substituição |
| `dp_convocacao_reabrir_vaga` | só habilitada quando a vaga está descoberta de fato |
| `dp_convocacao_classificar_descumprimento` | valida `regime_snapshot`; sem efeito financeiro automático |
| `dp_folga_override_cobertura` | revalida cobertura + registra decisão + cria/aprova folga na mesma transação |
| `dp_convocacao_processar_prazos` | precedência aprovada (item 12): quem venceu primeiro decide — `prazo_resposta < inicio_previsto` → `sem_resposta`; `inicio_previsto < prazo_resposta` → `encerrada_inicio_ocorrencia`; usa o horário **individual**; idempotente |

**Regra de tempo real (item 12)**: a RPC recusa aceite/recusa quando `now() >= encerramento_operacional` ou `now() > prazo_resposta`, independentemente do estado materializado. O cron de 10 minutos nunca cria janela extra: tentativa às 18:03 com encerramento 18:00 falha mesmo com a linha ainda `pendente`.

## 8. Rollout seguro: 3A → 3B → cutover (itens 16–20, 22)

**3A — fundação aditiva (não quebra nada)**
- Cria tabelas novas, enums, funções de fuso/compatibilidade/cobertura, `dp_convocacao_config`, `dp_indisponibilidades`, eventos, descumprimentos, índices das tabelas novas.
- Em `dp_convocacoes`: colunas novas **todas nullable** (`ocorrencia_id` **nullable**), sem novos NOT NULL, sem troca do índice único legado.
- **Mantém** `dp_convocacoes_respond_self`, os grants atuais e o trigger `dp_convocacao_sync_escala` como estão — a tela e o Portal atuais continuam funcionando.
- Libera **freelancer** no guard de regime (correção aditiva, não quebra nada).

**3B — backend completo e testes (ainda sem quebrar o legado)**
- Todas as RPCs, locks, validações, job pg_cron, RLS das tabelas novas, testes (concorrência de vaga, desistência liberando vaga, substituição sem dupla ocupação nem reabertura indevida, Opção A após alocação consumada, precedência do job, aceite fora de janela, multiempresa, regressão de Folgas/Operação).
- As RPCs chamam a sincronização de escala **explicitamente**. Para evitar efeito duplicado (item 19): o trigger atual de `dp_convocacao_sync_escala` é inventariado e as RPCs marcam a transação (flag de sessão/contexto) para que o trigger **não** execute quando a RPC já sincronizou; o teste "exatamente uma sincronização por mudança" faz parte da 3B.

**Cutover — junto com a Fase 4 (frontend + Portal novos publicados)**
Migration única de endurecimento, aplicada só depois das telas novas no ar:
- `ocorrencia_id` → NOT NULL;
- troca do índice único de `dp_convocacoes` pelo parcial da seção 3;
- remoção de `dp_convocacoes_respond_self`;
- `REVOKE INSERT, UPDATE, DELETE` de `authenticated` nas tabelas de Convocações (RPC-only), mantendo `SELECT` sob RLS e `EXECUTE` só nas RPCs autorizadas; `service_role` com `ALL`; `anon` sem nada; `REVOKE EXECUTE FROM PUBLIC/anon` em toda função SECURITY DEFINER (com `SET search_path` seguro e validação de uid/empresa/papel/entidade/estado);
- **remoção definitiva do trigger** de sincronização, deixando só a chamada pelas RPCs.

Rollback: 3A e 3B são dropáveis/inertes sem afetar o legado; a migration de cutover tem reversão explícita (recriar policy, grants, trigger e índice antigo a partir das definições registradas). Zero registros em `dp_convocacoes` reduz risco de backfill, **não** de regressão funcional — por isso o legado só cai no cutover.

## 9. Lacuna a resolver antes da 3B: "1 dia útil" (item 21)

Auditoria feita agora: **não existe calendário de feriados no sistema**. `dp_config_dp` tem só `politica_feriado` (política de tratamento), `dp_datas_bloqueadas` é bloqueio de folgas (com `motivo` livre, não catálogo de feriados) e os motores (`escala-mes.ts`, `apuracao.ts`) recebem `feriados?: string[]` **opcional** que hoje nenhum consumidor popula a partir do banco. Não há fonte confiável de feriados aplicáveis.

Decisão proposta para a V1, sem criar um segundo calendário: `prazo_resposta = disponibilizada_em + prazo_resposta_horas` (default 24h), com opção de **pular domingos** por configuração — parametrizado em `dp_convocacao_config`, e o campo `prazo_resposta_uteis` só entra em uso quando existir um calendário de feriados de verdade. Criar o catálogo de feriados fica como item próprio, fora deste projeto; quando existir, a função de prazo passa a consumi-lo sem mudar o contrato.

## 10. Cobertura e Folgas (mantidos)

`dp_cobertura_disponivel` conta como cobertura apenas alocações `integral`; `dp_cobertura_minima` é a fonte única da necessidade. `dp_folgas_validar_unificado` ganha etapa final: bloqueia no Portal (`origem='solicitacao'`) e alerta no admin; sem mínimo cadastrado, comportamento idêntico ao atual. Override do admin só por RPC transacional. Indisponibilidade nunca é negada por déficit nem revoga folga concedida.

## 11. Riscos restantes

- **P0**: transição do trigger de sincronização (janela em que RPC e trigger coexistem — mitigada pela flag de transação e pelo teste de sincronização única); aceite fora de janela se a RPC não revalidar tempo real; grants legados vivos até o cutover (aceito conscientemente para não quebrar o Portal).
- **P1**: exigir cobertura integral reduz o público elegível em jornada individual (esperado, mas muda a experiência do gestor até a Fase 4 dar as alternativas); nova etapa de cobertura em Folgas pode bloquear folga hoje aceita; ausência de calendário de feriados torna o prazo em horas, não em dias úteis.
- **P2**: dois índices parciais de ocorrência exigem cuidado ao revisar versões; custo do calendário mensal; duas telas de configuração (Folgas e Convocações).

## 12. Fora desta versão

Múltiplos segmentos de jornada no mesmo dia (e, por consequência, mais de uma convocação por pessoa/dia); qualquer alteração em `dp_escala_itens`; estado `parcial` de cobertura; catálogo de feriados; telas (Fase 4) e testes ponta a ponta (Fase 5).

---

Nada foi criado ou alterado. PARADO aqui, aguardando sua aprovação da Fase 2 para autorizar a Fase 3.
