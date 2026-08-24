# Convocações — Fase 3A.0 (revisada): diagnóstico e desenho final, sem infraestrutura de feriados

Nada executado: sem migration, banco, RLS, trigger, código ou frontend. Evidências abaixo lidas do ambiente real do projeto.

**Decisão de escopo aplicada:** dia útil = segunda a sexta. Sábado e domingo sempre não úteis. Feriados nacionais/estaduais/municipais, pontos facultativos, fechamentos da empresa, código IBGE, cadastro/carga de feriados, API externa, módulo corporativo de calendário e configuração de sábado útil estão **fora da 3A** — removidos do plano.

## 1. Diagnóstico reconfirmado

**Contagens reais:** `dp_convocacoes` **0**; `dp_escala_itens` **0** (0 com `origem='convocacao'`); colaboradores `intermitente`+`freelancer` **4**; `companies` 17; `dp_unidades` 5; `dp_colaborador_config_trabalho` 12; `dp_config_dp` 19 (17 empresa + 2 unidade); `dp_datas_bloqueadas` 31.

**`dp_convocacoes` (21 colunas)**
```text
id uuid PK D=gen_random_uuid()   company_id uuid NOT NULL
unidade_id uuid NULL             colaborador_id uuid NOT NULL
turno_id uuid NULL               escala_item_id uuid NULL
data date NOT NULL               entrada time NOT NULL   saida time NOT NULL
intervalo_minutos int NOT NULL D=0
termina_no_dia_seguinte bool NOT NULL D=false
carga_prevista_horas numeric NOT NULL D=0
status dp_convocacao_status NOT NULL D='pendente'
prazo_resposta timestamptz NULL  enviada_em timestamptz NOT NULL D=now()
respondida_em timestamptz NULL   motivo_recusa text NULL
observacao text NULL             criada_por uuid NULL
created_at / updated_at timestamptz NOT NULL D=now()
```
FKs: `company_id → companies CASCADE`; `colaborador_id → dp_colaboradores CASCADE`; `unidade_id → dp_unidades SET NULL`; `turno_id → dp_turnos SET NULL`; `escala_item_id → dp_escala_itens SET NULL`. **Nenhum CHECK.**

Enum `dp_convocacao_status`: `pendente, aceita, recusada, cancelada, expirada`.

Índices: PK; `idx_dp_convocacoes_colab (colaborador_id,data)`; `idx_dp_convocacoes_colab_data` (**duplicado**); `idx_dp_convocacoes_company_data`; `..._escala_item_id`; `..._turno_id`; `..._unidade_id`; + `uq_dp_convocacoes_ativa` (seção 8).

Triggers: `trg_dp_convocacao_guard` (BEFORE INSERT OR UPDATE), `trg_dp_convocacao_sync_escala` (BEFORE UPDATE), `trg_dp_convocacoes_updated_at`.

**Demais objetos auditados** — `dp_escala_itens` (UNIQUE `(escala_id, colaborador_id, data)`, enum origem `gerado,manual,troca,convocacao`); `dp_colaborador_config_trabalho` (UNIQUE parcial `idx_dp_cct_vigente (colaborador_id) WHERE vigencia_fim IS NULL`); `dp_colaborador_config_dias` (dow, trabalha, turno_id, entrada/saida/intervalo); `dp_config_dp` (46 col., `unidade_id` nullable + helper `dp_config_resolvida(_company_id,_unidade_id)` — padrão de resolução já pronto); `dp_cobertura_minima` (company/unidade/cargo/turno + `ativo`); `dp_folgas` (UNIQUE parcial ativa por company+colaborador+data) e `dp_folgas_validar_unificado()`; `dp_datas_bloqueadas` (UNIQUE `(company_id, unidade_id, data) NULLS NOT DISTINCT`); `dp_unidades`, `dp_cargos`, `dp_turnos`, `companies`, `company_members`; helpers `private.is_company_member`, `private.is_company_admin_or_owner`, `dp_colaborador_ativo_of`, `dp_colaborador_of`, `dp_calc_carga_dia`, `dp_calc_data_regra`.

**RLS (padrão de 3 camadas confirmado)** — `dp_convocacoes`: `dp_convocacoes_admin_all` (ALL, admin/owner), `dp_convocacoes_read_self` (SELECT via `dp_colaborador_ativo_of`), `dp_convocacoes_respond_self` (UPDATE `pendente` → `aceita|recusada`). `dp_escala_itens`, `dp_colaborador_config_trabalho` e `dp_datas_bloqueadas` seguem admin-write / member-read / self-read.

## 2. Divergências

- **D1 (P1) — não existe timezone no DP.** Banco em `TimeZone = UTC`. Timezone só em `profiles.timezone` (preferência de exibição) e `ped_units.timezone` (módulo Pedidos, FK `ped_units`). Nada reaproveitável.
- **D2 (P2) — grants amplos herdados.** `dp_convocacoes`, `dp_escala_itens`, `dp_config_dp`, `dp_datas_bloqueadas` têm grants completos para `anon` (proteção hoje é 100% RLS). As tabelas novas **não** repetem isso.
- **D3 (P2)** — `idx_dp_convocacoes_colab` e `idx_dp_convocacoes_colab_data` idênticos (limpeza no cutover, não na 3A).

Nenhuma divergência conceitual com a Fase 2 aprovada.

## 3. Calendário de feriados: fora de escopo

Auditoria confirmou que não existe fonte reutilizável (`dp_config_dp.politica_feriado` é política de tratamento; `dp_datas_bloqueadas` é bloqueio de folgas/férias; `ped_unit_hour_exceptions` é horário de loja do módulo Pedidos). Conforme sua decisão, **nada será criado**: sem `calendario_feriados`, sem `dp_calendario_excecoes`, sem IBGE, sem `sabado_dia_util`.

**Limitação registrada na documentação técnica (texto que irá para `src/lib/dp/dias-uteis.ts` e para o cabeçalho das migrations):**

> Na V1 de Convocações, o cálculo de dia útil considera apenas segunda a sexta-feira e não consulta feriados. Suporte a feriados nacionais, estaduais, municipais e exceções corporativas será implementado posteriormente como evolução transversal da plataforma.

## 4. Timezone (mínimo necessário)

```text
companies.timezone    text NOT NULL DEFAULT 'America/Sao_Paulo'
dp_unidades.timezone  text NULL      -- NULL = herda da empresa
dp_timezone(_company_id uuid, _unidade_id uuid) RETURNS text   -- unidade → empresa → 'America/Sao_Paulo'
```
Validação do valor por trigger leve (o texto precisa ser um timezone reconhecido pelo Postgres). Conversão canônica, sempre no servidor:
```text
timestamptz := (data::timestamp + hora_local) AT TIME ZONE dp_timezone(company_id, unidade_id)
```
Aplicada a `inicio_previsto`, `fim_previsto` (com virada de meia-noite: `data + 1` quando `termina_no_dia_seguinte`), `prazo_resposta` e encerramento operacional. Sem UTC assumido, sem timezone de navegador, sem `America/Sao_Paulo` hardcoded fora do fallback declarado. **Nada além disso** — sem expansão para calendário corporativo.

## 5. Funções de dia útil (V1 simplificada)

```sql
dp_e_dia_util(_data date) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  -- extract(isodow from _data) BETWEEN 1 AND 5   → seg..sex true; sáb/dom false

dp_adicionar_dias_uteis(_base timestamptz, _dias integer, _tz text DEFAULT 'America/Sao_Paulo')
  RETURNS timestamptz
  LANGUAGE plpgsql STABLE
```
Comportamento de `dp_adicionar_dias_uteis`:
1. Converte `_base` para hora local no `_tz` recebido — **o horário local é preservado** (16:30 continua 16:30).
2. Avança um dia por vez, contando só dias com `dp_e_dia_util = true`, até completar `_dias`.
3. Reconverte para `timestamptz` usando o offset **do dia de destino**.
4. `sexta 16:30 + 1 dia útil = segunda 16:30` (nunca sábado 16:30). `sexta 18:00 + 1 = segunda 18:00`.
5. Se `_base` cair em sábado ou domingo, a contagem começa na segunda seguinte.

Sem `company_id`/`unidade_id` na assinatura: sem feriados, a regra não depende de empresa nem de unidade. O timezone entra como parâmetro, resolvido pelo chamador via `dp_timezone(...)`. Ambas `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` para `authenticated` e `service_role`.

## 6. Prazo de referência e encerramento operacional

- `prazo_resposta := dp_adicionar_dias_uteis(publicado_em, config.prazo_resposta_dias_uteis, dp_timezone(...))` — padrão 1 dia útil. Nunca convertido para 24 horas.
- **Encerramento operacional é independente:** se `inicio_previsto < prazo_resposta`, a oferta encerra no início da ocorrência, com `status = 'encerrada_inicio_ocorrencia'` e `encerrada_em = inicio_previsto`. **Nunca `sem_resposta`** enquanto o prazo de referência não vencer. `sem_resposta` só quando `now() > prazo_resposta` e a oferta ainda estava pendente.

## 7. Schema final das novas tabelas

Padrão comum: `id uuid PK D=gen_random_uuid()`, `company_id uuid NOT NULL FK companies ON DELETE CASCADE`, `created_at/updated_at timestamptz NOT NULL D=now()` + trigger `dp_set_updated_at`. RLS habilitada em todas. Grants: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `ALL` para `service_role`; **nunca `anon`**.

**`dp_convocacao_grupos`** — lote/campanha.
```text
unidade_id uuid NOT NULL FK dp_unidades ON DELETE CASCADE
titulo text NULL · observacao text NULL
modo_oferta text NOT NULL CHECK (individual|aberta)
modo_jornada text NOT NULL CHECK (turno|jornada_individual|janela)
status text NOT NULL D 'rascunho' CHECK (rascunho|publicado|encerrado|cancelado)
publicado_em timestamptz NULL · publicado_por uuid NULL · criado_por uuid NULL
INDEX (company_id, unidade_id, status)
RLS: admin/owner ALL; membro SELECT
```

**`dp_convocacao_ocorrencias`** — necessidade real (data + cargo + janela).
```text
grupo_id uuid NOT NULL FK dp_convocacao_grupos ON DELETE CASCADE
unidade_id uuid NOT NULL FK dp_unidades ON DELETE CASCADE
cargo_id uuid NOT NULL FK dp_cargos ON DELETE RESTRICT
data date NOT NULL
turno_id uuid NULL FK dp_turnos ON DELETE RESTRICT
entrada time NULL · saida time NULL
termina_no_dia_seguinte boolean NOT NULL D false · intervalo_minutos int NOT NULL D 0
vagas int NOT NULL D 1 CHECK (vagas > 0)
status text NOT NULL D 'aberta' CHECK (aberta|preenchida|encerrada|cancelada)
CHECK periodo_definido:
  (turno_id IS NOT NULL AND entrada IS NULL AND saida IS NULL)
  OR (turno_id IS NULL AND entrada IS NOT NULL AND saida IS NOT NULL)
INDEX (company_id, data) · (grupo_id) · (cargo_id)
RLS: admin/owner ALL; membro SELECT; colaborador elegível SELECT das publicadas (via grupo publicado)
```
Índices parciais que permitem "Garçom almoço" **e** "Garçom jantar" no mesmo dia, sem duplicar a mesma necessidade:
```sql
CREATE UNIQUE INDEX uq_dp_conv_ocor_turno
  ON dp_convocacao_ocorrencias (company_id, unidade_id, data, cargo_id, turno_id)
  WHERE turno_id IS NOT NULL AND status <> 'cancelada';

CREATE UNIQUE INDEX uq_dp_conv_ocor_janela
  ON dp_convocacao_ocorrencias (company_id, unidade_id, data, cargo_id, entrada, saida)
  WHERE turno_id IS NULL AND status <> 'cancelada';
```

**`dp_convocacao_config`** — configuração própria do módulo.
```text
unidade_id uuid NULL FK dp_unidades ON DELETE CASCADE   -- NULL = padrão da empresa
antecedencia_minima_dias int NOT NULL D 3
antecedencia_bloqueia boolean NOT NULL D false          -- alerta, não bloqueia
prazo_resposta_dias_uteis int NOT NULL D 1
exige_justificativa_excecao boolean NOT NULL D true
permite_oferta_aberta boolean NOT NULL D true
reabre_vaga_em_desistencia boolean NOT NULL D true
UNIQUE (company_id, unidade_id) NULLS NOT DISTINCT   -- 1 padrão de empresa + 1 por unidade
integridade company_id × unidade_id garantida por trigger BEFORE INSERT/UPDATE
resolução: dp_convocacao_config_resolvida(company_id, unidade_id) → unidade, senão empresa, senão defaults
```

**`dp_indisponibilidades`** — global por dia, sem `unidade_id` funcional.
```text
colaborador_id uuid NOT NULL FK dp_colaboradores ON DELETE CASCADE
data date NOT NULL · motivo text NULL
origem text NOT NULL D 'colaborador' CHECK (colaborador|gestor|sistema)
criado_por uuid NULL · cancelada_em timestamptz NULL
UNIQUE INDEX (colaborador_id, data) WHERE cancelada_em IS NULL
company_id NOT NULL (redundante, validado por trigger contra o colaborador → consistência multiempresa)
RLS: admin/owner da company ALL; colaborador ALL sobre as próprias (via dp_colaborador_ativo_of)
```

**`dp_convocacao_descumprimentos`**
```text
convocacao_id uuid NOT NULL FK dp_convocacoes ON DELETE CASCADE
colaborador_id uuid NOT NULL FK dp_colaboradores ON DELETE CASCADE
tipo text NOT NULL CHECK (desistencia|ausencia|sem_resposta)
data_referencia date NOT NULL · observacao text NULL · registrado_por uuid NULL
INDEX (company_id, colaborador_id, data_referencia)
RLS: admin/owner ALL; colaborador SELECT das próprias
```

**`dp_convocacao_eventos`** — trilha append-only.
```text
convocacao_id uuid NULL FK dp_convocacoes ON DELETE CASCADE
grupo_id uuid NULL FK dp_convocacao_grupos ON DELETE CASCADE
tipo text NOT NULL · de_status text NULL · para_status text NULL
ator_user_id uuid NULL · ator_papel text NULL · payload jsonb NOT NULL D '{}'
created_at timestamptz NOT NULL D now()     -- sem updated_at
INDEX (company_id, created_at DESC) · (convocacao_id)
RLS: admin/owner SELECT; INSERT só via funções SECURITY DEFINER (sem policy de INSERT para authenticated)
```

## 8. Alterações aditivas em tabelas existentes

**`dp_convocacoes`** — todas nullable, nenhuma quebra o frontend legado:
```text
ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias ON DELETE SET NULL   -- NULLABLE na 3A
grupo_id uuid NULL FK dp_convocacao_grupos ON DELETE SET NULL             -- NULLABLE na 3A
inicio_previsto timestamptz NULL · fim_previsto timestamptz NULL
timezone_snapshot text NULL
compatibilidade text NULL CHECK (integral|incompativel)
prazo_resposta_base timestamptz NULL
encerrada_em timestamptz NULL · encerramento_motivo text NULL
comparecimento text NULL CHECK (compareceu|ausente)        -- nunca definido pelo relógio
comparecimento_origem text NULL CHECK (ponto|manual)
```
Permanecem nullable durante toda a transição: `ocorrencia_id`, `grupo_id`, `inicio_previsto`, `fim_previsto`, `timezone_snapshot`, `compatibilidade`, `prazo_resposta_base`. O frontend legado (`useDpConvocacoes.tsx`) grava apenas colunas antigas e continua funcionando.

Novos valores do enum `dp_convocacao_status` (aditivo, tabela vazia): `desistida`, `substituida`, `encerrada_inicio_ocorrencia`, `sem_resposta`, `compareceu`, `ausente`.

**`dp_colaborador_config_trabalho`**
```sql
ADD COLUMN compoe_equipe_habitual boolean NOT NULL DEFAULT true;
```
`idx_dp_cct_vigente` **não é alterado**.

**`dp_config_dp`** — somente as duas aprovadas de folga/cobertura (nada de Convocações aqui, e **sem** `sabado_dia_util`):
```sql
considerar_indisponibilidade_cobertura boolean NOT NULL DEFAULT true
comportamento_deficit_cobertura text NOT NULL DEFAULT 'alerta' CHECK ('alerta','bloqueia')
```

**`companies` / `dp_unidades`** — colunas `timezone` da seção 4.

## 9. Índice legado

Definição atual exata:
```sql
CREATE UNIQUE INDEX uq_dp_convocacoes_ativa ON public.dp_convocacoes
  USING btree (colaborador_id, data)
  WHERE (status = ANY (ARRAY['pendente'::dp_convocacao_status, 'aceita'::dp_convocacao_status]));
```
**A 3A NÃO substitui nem remove este índice.** Índice final, apenas no cutover (Opção A, incluindo estados históricos ocupantes):
```sql
CREATE UNIQUE INDEX uq_dp_convocacoes_ocupante ON public.dp_convocacoes (colaborador_id, data)
  WHERE status IN ('pendente','aceita','compareceu','ausente');
-- desistida, recusada, cancelada, expirada, sem_resposta, substituida NÃO ocupam vaga
```

## 10. Trigger de Escala

`dp_convocacao_sync_escala()` — `BEFORE UPDATE`, `SECURITY DEFINER`, `search_path=public`. Trata dois casos:
- **`* → aceita`**: resolve/cria `dp_escalas` da competência `YYYY-MM` (company + unidade via `IS NOT DISTINCT FROM`), procura item por `(escala_id, colaborador_id, data)`, insere ou atualiza com `tipo='trabalho'`, `origem='convocacao'` e os horários da convocação, grava `NEW.escala_item_id`.
- **`aceita → recusada|cancelada|expirada`** com `escala_item_id` preenchido: `DELETE` do item `WHERE origem='convocacao'` e zera `escala_item_id`.

Dependências: `dp_escalas`, `dp_escala_itens`, enums `dp_escala_item_tipo`/`dp_escala_item_origem`.

**Confirmado: a 3A não remove, não substitui e não altera o trigger.** Ele segue como único mecanismo oficial de sincronização durante todo o período legado.

## 11. Guard de regime

Hoje `dp_convocacao_guard()` compara literalmente e **bloqueia freelancer**:
```sql
IF v_regime IS DISTINCT FROM 'intermitente' THEN RAISE EXCEPTION ... END IF;
```
Função central proposta:
```sql
dp_regime_convocavel(_regime public.dp_regime_trabalho) RETURNS boolean
  LANGUAGE sql IMMUTABLE   -- true para 'intermitente' e 'freelancer'
GRANT EXECUTE TO authenticated, service_role;
```
Fonte única da verdade. Consumidores planejados: `dp_convocacao_guard`, RPC de publicação, RPC de elegibilidade/cobertura, telas de candidatos, testes. **Na 3A a função é apenas criada**; a substituição dentro do guard entra na 3A.1 como alteração isolada e reversível.

## 12. Migrations planejadas (3A.1, após sua autorização)

| # | Objetivo | Objetos | Risco | Compat. legado | Rollback |
|---|---|---|---|---|---|
| M1 | Timezone mínimo | `companies.timezone`, `dp_unidades.timezone`, `dp_timezone()` + validação | Baixo | Total | DROP coluna/função |
| M2 | Dia útil V1 | `dp_e_dia_util(date)`, `dp_adicionar_dias_uteis(timestamptz,int,text)` | Baixo | Total (nada consome ainda) | DROP FUNCTION |
| M3 | Enum + base de Convocações | novos valores de `dp_convocacao_status`, `dp_convocacao_grupos`, `dp_convocacao_ocorrencias` + índices parciais | Baixo (0 linhas) | Total | DROP TABLE (valores de enum ficam inertes) |
| M4 | Colunas aditivas em `dp_convocacoes` | 11 colunas nullable + 2 FKs | Baixo | Total — nenhuma NOT NULL | DROP coluna |
| M5 | Indisponibilidade, eventos, descumprimentos | 3 tabelas + índices | Baixo | Total | DROP TABLE |
| M6 | Configurações | `dp_convocacao_config` + 2 colunas em `dp_config_dp` + `compoe_equipe_habitual` | Baixo | Total | DROP TABLE / DROP coluna |
| M7 | Funções base | `dp_regime_convocavel`, `dp_convocacao_config_resolvida`, triggers de integridade das novas tabelas | Baixo | Total (guard intocado) | DROP FUNCTION |
| M8 | RLS e grants | policies das tabelas novas; sem grant para `anon` | Baixo | Total | DROP POLICY |

Nenhuma migration toca trigger existente, `uq_dp_convocacoes_ativa` ou `idx_dp_cct_vigente`.

## 13. Arquivos que serão alterados na 3A.1

- `supabase/migrations/` — os 8 arquivos acima.
- `src/integrations/supabase/types.ts` — regenerado após as migrations.
- `src/lib/dp/dias-uteis.ts` **(novo)** — espelho de leitura da regra seg–sex + a nota de limitação da seção 3; o cálculo autoritativo é do banco.
- `src/lib/dp/convocacoes.ts` — apenas tipos/constantes aditivos; funções existentes intactas.
- `src/lib/dp/__tests__/dias-uteis.test.ts` (novo) e `convocacoes.test.ts` (casos novos).
- **Não serão tocados na 3A:** `DpConvocacoes.tsx`, `DpMinhasConvocacoes.tsx`, `useDpConvocacoes.tsx`, `operacao-panorama.ts`, `horario-previsto.ts`, `escala-mes.ts`, `va-calculo.ts`, `dpNavigation.tsx`.

## 14. Testes planejados

**Legado (regressão antes e depois de cada migration):** criação pela tela atual; aceite pelo Portal; recusa; expiração pelo guard; sincronização com Escala (cria item, atualiza, remove ao recusar/cancelar).

**Schema novo:** isolamento multiempresa em todas as tabelas novas; CHECK de período da ocorrência (turno XOR janela; ocorrência sem período rejeitada); os dois índices parciais permitindo Garçom-almoço + Garçom-jantar e rejeitando duplicata exata; unicidade e natureza global da indisponibilidade; `dp_regime_convocavel` aceitando intermitente e freelancer e recusando clt/pj/mei/estagio/temporario.

**Dia útil e timezone:** `dp_e_dia_util` seg–sex true, sáb/dom false; `sexta 16:30 + 1 = segunda 16:30`; `sexta 18:00 + 1 = segunda 18:00`; base no sábado/domingo → segunda; `+0` dias útil devolve a base; conversão local→timestamptz por unidade com herança da empresa e fallback; virada de meia-noite (18:00–02:00 com `fim_previsto` no dia seguinte); encerramento operacional antes do prazo não gera `sem_resposta`.

**Segurança:** RLS de cada tabela nova (membro lê, admin escreve, colaborador só o próprio); ausência de grant para `anon`; funções SECURITY DEFINER com `search_path` fixo; empresa A tentando ler/escrever dados da empresa B em cada policy nova.

## 15. Rollback

Tudo aditivo: `DROP TABLE` / `DROP COLUMN` / `DROP FUNCTION` / `DROP POLICY` na ordem inversa restaura o estado atual. Única irreversibilidade técnica: valores adicionados ao enum `dp_convocacao_status` não podem ser removidos — ficam inertes, tabela vazia. Nenhum dado existente é migrado, transformado ou apagado.

## 16. Riscos

- **P0** — nenhum (tudo aditivo, tabelas-alvo vazias, trigger e índices legados intocados).
- **P1** — D1: timezone precisa existir antes de qualquer materialização de `inicio_previsto`/`prazo_resposta` (resolvido em M1). Limitação de feriados assumida e documentada, por decisão de escopo.
- **P2** — D2 grants amplos para `anon` em tabelas DP existentes (trilha separada); D3 índice duplicado (cutover).

## 17. Decisões que ainda precisam de aprovação

1. **Timezone**: `companies.timezone` (default `America/Sao_Paulo`, NOT NULL) + `dp_unidades.timezone` nullable herdando da empresa — aprova?
2. **Assinatura sem company/unidade** em `dp_e_dia_util(date)` e `dp_adicionar_dias_uteis(timestamptz, int, tz)`, com o timezone passado pelo chamador — aprova?
3. **Ordem das 8 migrations** da seção 12 — aprova como está?

---

**PARADO AQUI.** Nenhuma migration aplicada. Aguardo autorização explícita para a 3A.1.
