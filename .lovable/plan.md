# Convocações — Fase 3A.0: Diagnóstico pré-migration e desenho final

Nada foi executado: sem migration, sem alteração de banco, RLS, trigger, código ou frontend. Tudo abaixo é evidência lida do ambiente real do projeto (banco de produção do Cloud) e desenho proposto.

## 1. Diagnóstico reconfirmado

**Volume atual (contagens reais)**
- `dp_convocacoes`: **0 registros**
- `dp_escala_itens`: **0 registros** (e 0 com `origem = 'convocacao'`)
- Colaboradores com regime `intermitente` ou `freelancer`: **4**
- `companies`: 17 · `dp_unidades`: 5 · `dp_datas_bloqueadas`: 31 · `dp_colaborador_config_trabalho`: 12 · `dp_config_dp`: 19 linhas (17 de empresa + 2 de unidade)

**`dp_convocacoes` (21 colunas)**
```text
id uuid PK D=gen_random_uuid()      company_id uuid NOT NULL
unidade_id uuid NULL                colaborador_id uuid NOT NULL
turno_id uuid NULL                  escala_item_id uuid NULL
data date NOT NULL                  entrada time NOT NULL
saida time NOT NULL                 intervalo_minutos int NOT NULL D=0
termina_no_dia_seguinte bool NOT NULL D=false
carga_prevista_horas numeric NOT NULL D=0
status dp_convocacao_status NOT NULL D='pendente'
prazo_resposta timestamptz NULL     enviada_em timestamptz NOT NULL D=now()
respondida_em timestamptz NULL      motivo_recusa text NULL
observacao text NULL                criada_por uuid NULL
created_at / updated_at timestamptz NOT NULL D=now()
```
FKs: `company_id → companies ON DELETE CASCADE`; `colaborador_id → dp_colaboradores ON DELETE CASCADE`; `unidade_id → dp_unidades ON DELETE SET NULL`; `turno_id → dp_turnos ON DELETE SET NULL`; `escala_item_id → dp_escala_itens ON DELETE SET NULL`. **Nenhum CHECK.**

Enum `dp_convocacao_status`: `pendente, aceita, recusada, cancelada, expirada` (5 valores — sem `desistida`, `substituida`, `encerrada_inicio_ocorrencia`, `compareceu`, `ausente`).

Índices: PK; `idx_dp_convocacoes_colab (colaborador_id,data)`; `idx_dp_convocacoes_colab_data` (**duplicado do anterior**); `idx_dp_convocacoes_company_data`; `idx_dp_convocacoes_escala_item_id`; `idx_dp_convocacoes_turno_id`; `idx_dp_convocacoes_unidade_id`; e o índice legado da seção 13.

Triggers: `trg_dp_convocacao_guard` (BEFORE INSERT OR UPDATE), `trg_dp_convocacao_sync_escala` (BEFORE UPDATE), `trg_dp_convocacoes_updated_at`.

**Demais objetos auditados** — `dp_escala_itens` (16 col., UNIQUE `(escala_id, colaborador_id, data)`, enum origem `gerado,manual,troca,convocacao`), `dp_colaborador_config_trabalho` (13 col., UNIQUE parcial `idx_dp_cct_vigente (colaborador_id) WHERE vigencia_fim IS NULL`), `dp_colaborador_config_dias` (dow, trabalha, turno_id, entrada/saida/intervalo), `dp_config_dp` (46 col., já com `unidade_id` nullable para resolução unidade→empresa e helper `dp_config_resolvida(_company_id,_unidade_id)`), `dp_cobertura_minima` (company/unidade/cargo/turno + `ativo`), `dp_folgas` (UNIQUE parcial ativa por company+colaborador+data), `dp_folgas_validar_unificado()`, `dp_datas_bloqueadas` (UNIQUE `(company_id, unidade_id, data) NULLS NOT DISTINCT`), `dp_unidades`, `dp_cargos`, `dp_turnos`, `companies`, `company_members` + helpers `private.is_company_member`, `private.is_company_admin_or_owner`, `dp_colaborador_ativo_of`, `dp_colaborador_of`, `dp_calc_carga_dia`, `dp_calc_data_regra`.

**RLS/policies (padrão confirmado, 3 camadas)** — em `dp_convocacoes`: `dp_convocacoes_admin_all` (ALL, admin/owner), `dp_convocacoes_read_self` (SELECT via `dp_colaborador_ativo_of`), `dp_convocacoes_respond_self` (UPDATE de `pendente` para `aceita|recusada`). `dp_escala_itens`, `dp_colaborador_config_trabalho` e `dp_datas_bloqueadas` seguem o mesmo padrão admin-write / member-read / self-read.

## 2. Divergências encontradas

Nada que invalide a Fase 2, mas três pontos precisam de decisão sua:

- **D1 (P1) — `dp_unidades` não tem localidade confiável.** Só existem `cidade text` e `uf text`, ambos nullable, **sem CEP e sem código IBGE**. Dos 5 registros: 3 estão com `uf` NULL e a grafia de cidade é inconsistente (`Goiânia`, `Goiania`, `GOIANIA`). Feriado municipal/estadual por unidade **não é resolvível hoje** por localidade.
- **D2 (P1) — não existe timezone em nenhuma tabela do DP.** O banco roda em `TimeZone = UTC`. Timezone só existe em `profiles.timezone` (preferência do usuário) e `ped_units.timezone` (`America/Sao_Paulo`, exclusivo do módulo Pedidos, FK para `ped_units` — não reaproveitável pelo DP).
- **D3 (P2) — grants amplos herdados.** `dp_convocacoes`, `dp_escala_itens`, `dp_config_dp` e `dp_datas_bloqueadas` têm grants completos para `anon` (proteção hoje é 100% RLS). As tabelas novas **não** repetirão isso.

Divergência menor já registrada: `idx_dp_convocacoes_colab` e `idx_dp_convocacoes_colab_data` são idênticos (limpeza no cutover, não na 3A).

## 3. Calendário corporativo — auditoria e proposta

**Não existe fonte reutilizável.** Busca no schema e no código por feriado/calendário/dia útil retornou apenas: `dp_config_dp.politica_feriado` (enum `compensa|dobro` — política de tratamento, não fonte de datas), `dp_datas_bloqueadas` (bloqueio de **folgas/férias**, com `regra_id` e `liberada` — semântica diferente, não pode ser sobrecarregada) e `ped_unit_hour_exceptions` (exceção de horário de loja do módulo Pedidos, FK `ped_units`). Nenhum cálculo de dia útil existe no TypeScript.

**Proposta — duas tabelas, não uma.** Separar "o que é feriado no país/UF/município" de "quem é afetado" resolve duplicidade e precedência sem ambiguidade:

```text
public.calendario_feriados            -- catálogo compartilhado, sem company_id
  id uuid PK
  data date NOT NULL
  abrangencia text NOT NULL CHECK (nacional|estadual|municipal)
  uf char(2) NULL            -- obrigatório se estadual/municipal
  municipio_ibge text NULL   -- obrigatório se municipal
  nome text NOT NULL
  facultativo boolean NOT NULL D=false
  fonte text NOT NULL D='manual'
  created_at / updated_at
  CHECK coerência abrangência × uf × municipio_ibge
  UNIQUE (data, abrangencia, coalesce(uf,''), coalesce(municipio_ibge,''))
  RLS: SELECT para authenticated (catálogo público interno); escrita só service_role/super_admin

public.dp_calendario_excecoes         -- decisões da empresa
  id uuid PK
  company_id uuid NOT NULL FK companies ON DELETE CASCADE
  unidade_id uuid NULL FK dp_unidades ON DELETE CASCADE
  data date NOT NULL
  efeito text NOT NULL CHECK (nao_util | util)   -- 'util' permite derrubar um feriado do catálogo
  tipo text NOT NULL CHECK (fechamento|ponto_facultativo|feriado_local|excecao_operacional)
  descricao text NULL
  created_by uuid NULL
  created_at / updated_at
  UNIQUE (company_id, unidade_id, data) NULLS NOT DISTINCT   -- mesmo padrão de dp_datas_bloqueadas
  RLS: leitura por membro; escrita por admin/owner
```

**Abrangência e precedência (seção 5)** — resolução determinística, do mais específico para o mais genérico, primeiro match vence:
```text
1. dp_calendario_excecoes  (company_id, unidade_id = X, data)   -- exceção da unidade
2. dp_calendario_excecoes  (company_id, unidade_id IS NULL, data) -- exceção da empresa
3. calendario_feriados     municipal (uf + municipio_ibge da unidade)
4. calendario_feriados     estadual  (uf da unidade)
5. calendario_feriados     nacional
6. regra de fim de semana  (domingo sempre; sábado conforme seção 9)
7. caso contrário → dia útil
```
Registro da unidade e da empresa no mesmo dia **nunca é ambíguo**: o da unidade vence sempre. `UNIQUE ... NULLS NOT DISTINCT` impede duas linhas de empresa (ou duas da mesma unidade) no mesmo dia. Quando `unidade_id` é NULL na chamada da função, os níveis 1, 3 e 4 são pulados e valem apenas empresa + nacional + fim de semana.

**Sem API externa (seção 10):** a decisão lê exclusivamente essas duas tabelas locais. Uma futura carga externa apenas faz INSERT em `calendario_feriados` — publicar, calcular prazo, aceitar e recusar nunca dependem de rede.

**Localidade (seção 6):** o calendário **não** duplica cidade/UF; ele lê da unidade. Mas isso exige resolver D1: proposta é adicionar `uf char(2)` normalizado e `municipio_ibge text` em `dp_unidades` (fonte: seleção assistida no cadastro de Unidades; o app já tem cache de CNPJ e campos de endereço na empresa). Sem IBGE preenchido, o nível 3 é pulado e o sistema opera com estadual/nacional — degradação explícita, nunca silenciosa: a tela de Unidades mostrará pendência de localidade.

## 4. Timezone

Estado real: `TimeZone = UTC` no banco; DP sem nenhuma coluna de timezone; `profiles.timezone` é preferência de exibição do usuário (não pode governar prazo legal); `ped_units.timezone` pertence a Pedidos.

**Solução mínima recomendada:** timezone é atributo do **local de trabalho**, com fallback de empresa.
```text
companies.timezone     text NOT NULL D 'America/Sao_Paulo'
dp_unidades.timezone   text NULL   -- NULL = herda da empresa
função: dp_timezone(company_id, unidade_id) → text   (unidade → empresa → 'America/Sao_Paulo')
CHECK de validade: now() AT TIME ZONE valor não pode falhar (validação por trigger/CHECK com função IMMUTABLE-safe)
```
Conversão canônica, sempre no servidor:
```text
timestamptz := (data::timestamp + hora_local) AT TIME ZONE dp_timezone(company_id, unidade_id)
```
Aplicada a: início/fim previstos da oferta, prazo de resposta, encerramento operacional e janela de indisponibilidade. Nada de UTC assumido, timezone de navegador ou `America/Sao_Paulo` hardcoded fora do fallback declarado.

## 5. Funções de dia útil

```sql
dp_e_dia_util(_company_id uuid, _unidade_id uuid, _data date) RETURNS boolean
dp_adicionar_dias_uteis(_company_id uuid, _unidade_id uuid, _base timestamptz, _dias integer) RETURNS timestamptz
dp_proximo_dia_util(_company_id uuid, _unidade_id uuid, _data date) RETURNS date
dp_timezone(_company_id uuid, _unidade_id uuid) RETURNS text
```
Todas `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` para `authenticated` e `service_role` (leitura de calendário não vaza dado sensível; ainda assim as funções filtram por `company_id` recebido).

Comportamento de `dp_adicionar_dias_uteis`:
1. Converte `_base` para hora local via `dp_timezone` → preserva **o horário local** (16:40 continua 16:40 no dia resultante).
2. Avança dia a dia, contando apenas dias com `dp_e_dia_util = true`, até completar `_dias`.
3. Reconverte para `timestamptz` com o offset **do dia de destino** — ou seja, virada de DST fica correta por construção (o Brasil não tem DST hoje; a fórmula não depende disso).
4. `_unidade_id IS NULL` → usa só empresa + nacional + fim de semana (seção 3).
5. Se `_base` cair em dia não útil, a contagem começa no próximo dia útil.

Fim de semana: domingo sempre não útil; sábado conforme seção 9.

## 6. Sábado útil

Não existe hoje regra corporativa reutilizável — `dp_config_dp.politica_sabado` (`alterna`, etc.) é regra de **escala/DSR**, não de expediente administrativo, e sobrecarregá-la misturaria domínios.

Decisão proposta: a configuração de calendário fica em `companies.timezone` + **`dp_config_dp.sabado_dia_util boolean NOT NULL DEFAULT false`** — `dp_config_dp` já é a configuração corporativa do DP com resolução unidade→empresa pronta (`dp_config_resolvida`), portanto serve outros módulos (Ponto, Férias, Documentos) e **não** fica dentro de `dp_convocacao_config`.

## 7. Schema final das novas tabelas

Padrão comum a todas: `id uuid PK D=gen_random_uuid()`, `company_id uuid NOT NULL FK companies ON DELETE CASCADE`, `created_at/updated_at timestamptz NOT NULL D=now()` + trigger `dp_set_updated_at`. Grants: `SELECT, INSERT, UPDATE, DELETE` para `authenticated` e `ALL` para `service_role`; **nunca `anon`**. RLS habilitada em todas.

**`dp_convocacao_grupos`** — o lote/campanha de convocação.
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

**`dp_convocacao_ocorrencias`** — a necessidade real (data + cargo + janela).
```text
grupo_id uuid NOT NULL FK dp_convocacao_grupos ON DELETE CASCADE
unidade_id uuid NOT NULL FK dp_unidades ON DELETE CASCADE
cargo_id uuid NOT NULL FK dp_cargos ON DELETE RESTRICT
data date NOT NULL
turno_id uuid NULL FK dp_turnos ON DELETE RESTRICT
entrada time NULL · saida time NULL · termina_no_dia_seguinte boolean NOT NULL D false
intervalo_minutos int NOT NULL D 0
vagas int NOT NULL D 1 CHECK (vagas > 0)
status text NOT NULL D 'aberta' CHECK (aberta|preenchida|encerrada|cancelada)
CHECK periodo_definido:
  (turno_id IS NOT NULL AND entrada IS NULL AND saida IS NULL)
  OR (turno_id IS NULL AND entrada IS NOT NULL AND saida IS NOT NULL)
INDEX (company_id, data) · (grupo_id) · (cargo_id)
RLS: admin/owner ALL; membro SELECT; colaborador elegível SELECT das publicadas (via grupo publicado)
```
Índices parciais de unicidade (seção 20) — garantem "Garçom almoço" **e** "Garçom jantar" no mesmo dia, sem duplicar a mesma necessidade:
```sql
CREATE UNIQUE INDEX uq_dp_conv_ocor_turno
  ON dp_convocacao_ocorrencias (company_id, unidade_id, data, cargo_id, turno_id)
  WHERE turno_id IS NOT NULL AND status <> 'cancelada';

CREATE UNIQUE INDEX uq_dp_conv_ocor_janela
  ON dp_convocacao_ocorrencias (company_id, unidade_id, data, cargo_id, entrada, saida)
  WHERE turno_id IS NULL AND status <> 'cancelada';
```

**`dp_convocacao_config`** — configuração própria de Convocações (seção 18).
```text
unidade_id uuid NULL FK dp_unidades ON DELETE CASCADE   -- NULL = padrão da empresa
antecedencia_minima_dias int NOT NULL D 3
antecedencia_bloqueia boolean NOT NULL D false          -- alerta, não bloqueia
prazo_resposta_dias_uteis int NOT NULL D 1
exige_justificativa_excecao boolean NOT NULL D true
permite_oferta_aberta boolean NOT NULL D true
reabre_vaga_em_desistencia boolean NOT NULL D true
UNIQUE (company_id, unidade_id) NULLS NOT DISTINCT      -- 1 padrão de empresa + 1 por unidade
CHECK: unidade pertence à empresa (garantido por trigger de integridade company_id × unidade_id)
Resolução: dp_convocacao_config_resolvida(company_id, unidade_id) → unidade, senão empresa, senão defaults
```

**`dp_indisponibilidades`** — global por dia (seção 19).
```text
colaborador_id uuid NOT NULL FK dp_colaboradores ON DELETE CASCADE
data date NOT NULL
motivo text NULL · origem text NOT NULL D 'colaborador' CHECK (colaborador|gestor|sistema)
criado_por uuid NULL · cancelada_em timestamptz NULL
UNIQUE (colaborador_id, data) WHERE cancelada_em IS NULL   -- índice parcial; global, sem unidade_id
RLS: admin/owner da company ALL; colaborador ALL sobre as próprias (via dp_colaborador_ativo_of)
Multiempresa: company_id redundante mas NOT NULL, validado por trigger contra o colaborador
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

**`dp_convocacao_eventos`** — trilha imutável.
```text
convocacao_id uuid NULL FK dp_convocacoes ON DELETE CASCADE
grupo_id uuid NULL FK dp_convocacao_grupos ON DELETE CASCADE
tipo text NOT NULL          -- criada, publicada, aceita, recusada, desistida, cancelada, encerrada...
de_status text NULL · para_status text NULL
ator_user_id uuid NULL · ator_papel text NULL
payload jsonb NOT NULL D '{}'
created_at timestamptz NOT NULL D now()     -- sem updated_at: append-only
INDEX (company_id, created_at DESC) · (convocacao_id)
RLS: admin/owner SELECT; INSERT apenas via funções SECURITY DEFINER (sem policy de INSERT para authenticated)
```

## 8. Alterações aditivas em `dp_convocacoes` (seção 12)

Todas **nullable**, todas com default seguro, nenhuma quebra o frontend legado:
```text
ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias ON DELETE SET NULL   -- NULLABLE na 3A
grupo_id uuid NULL FK dp_convocacao_grupos ON DELETE SET NULL             -- NULLABLE na 3A
inicio_previsto timestamptz NULL      -- materializado do snapshot individual
fim_previsto timestamptz NULL
timezone_snapshot text NULL
compatibilidade text NULL CHECK (integral|incompativel)
prazo_resposta_base timestamptz NULL  -- de onde o prazo de 1 dia útil foi contado
encerrada_em timestamptz NULL · encerramento_motivo text NULL
comparecimento text NULL CHECK (compareceu|ausente)   -- nunca definido pelo relógio
comparecimento_origem text NULL CHECK (ponto|manual)
```
Também permanecem nullable durante a transição, além de `ocorrencia_id`: `grupo_id`, `inicio_previsto`, `fim_previsto`, `timezone_snapshot`, `compatibilidade` e `prazo_resposta_base` — o frontend legado grava só as colunas antigas. Novos valores do enum `dp_convocacao_status` (`desistida`, `substituida`, `encerrada_inicio_ocorrencia`, `sem_resposta`) são **adicionados** ao enum (ADD VALUE é aditivo e não afeta linhas existentes — e a tabela está vazia).

## 9. Índice legado (seção 13)

Definição atual exata:
```sql
CREATE UNIQUE INDEX uq_dp_convocacoes_ativa ON public.dp_convocacoes
  USING btree (colaborador_id, data)
  WHERE (status = ANY (ARRAY['pendente'::dp_convocacao_status, 'aceita'::dp_convocacao_status]));
```
**Confirmado: a 3A NÃO substitui nem remove este índice.** Ele permanece intacto durante toda a parte aditiva.

Índice final, aplicado **apenas no cutover** (Opção A — uma alocação ativa por colaborador/data, incluindo estados históricos ocupantes):
```sql
CREATE UNIQUE INDEX uq_dp_convocacoes_ocupante ON public.dp_convocacoes (colaborador_id, data)
  WHERE status IN ('pendente','aceita','compareceu','ausente');
-- desistida, recusada, cancelada, expirada, sem_resposta, substituida NÃO ocupam vaga
```

## 10. Trigger de Escala (seção 14)

`dp_convocacao_sync_escala()` — `BEFORE UPDATE`, `SECURITY DEFINER`, `search_path=public`. Trata exatamente dois casos:
- **`* → aceita`**: resolve/cria `dp_escalas` da competência `YYYY-MM` (company + unidade, `IS NOT DISTINCT FROM`), procura item por `(escala_id, colaborador_id, data)`, insere ou atualiza com `tipo='trabalho'`, `origem='convocacao'` e os horários da convocação, e grava `NEW.escala_item_id`.
- **`aceita → recusada|cancelada|expirada`** com `escala_item_id` preenchido: `DELETE` do item `WHERE origem='convocacao'` e zera `escala_item_id`.

Dependências: `dp_escalas`, `dp_escala_itens`, enums `dp_escala_item_tipo`/`dp_escala_item_origem`. **Confirmado: a 3A não remove, não substitui e não altera este trigger.** Ele segue como o único mecanismo oficial de sincronização durante todo o período legado.

## 11. Guard de regime (seção 15)

Hoje, `dp_convocacao_guard()` faz comparação literal e **bloqueia freelancer**:
```sql
IF v_regime IS DISTINCT FROM 'intermitente' THEN RAISE EXCEPTION ... END IF;
```
Além disso valida prazo no UPDATE para `aceita|recusada`.

Função central proposta:
```sql
dp_regime_convocavel(_regime public.dp_regime_trabalho) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  -- true para 'intermitente' e 'freelancer'; false para os demais
GRANT EXECUTE TO authenticated, service_role;
```
Comportamento: fonte única da verdade sobre quem pode ser convocado; o guard passa a chamá-la em vez da comparação literal. Consumidores planejados: `dp_convocacao_guard`, RPC de publicação, RPC de elegibilidade/cobertura, telas de seleção de candidatos e testes. **Na 3A a função é apenas criada** (aditiva); a troca dentro do guard entra na 3A.1 como alteração isolada e reversível.

## 12. Equipe habitual (seção 16)

```sql
ALTER TABLE public.dp_colaborador_config_trabalho
  ADD COLUMN compoe_equipe_habitual boolean NOT NULL DEFAULT true;
```
Confirmado: default `true`, conforme aprovado. **`idx_dp_cct_vigente` não é alterado.**

## 13. Configurações de folgas em `dp_config_dp` (seção 17)

Somente as duas aprovadas, ambas de domínio de folga/cobertura — nada de Convocações aqui:
```sql
considerar_indisponibilidade_cobertura boolean NOT NULL DEFAULT true
comportamento_deficit_cobertura text NOT NULL DEFAULT 'alerta' CHECK ('alerta','bloqueia')
```
Mais `sabado_dia_util boolean NOT NULL DEFAULT false` (seção 6), que é calendário corporativo e não Convocações.

## 14. Migrations planejadas (seção 21)

| # | Objetivo | Objetos | Risco | Compat. legado | Rollback |
|---|---|---|---|---|---|
| M1 | Timezone corporativo | `companies.timezone`, `dp_unidades.timezone`, `dp_timezone()` | Baixo | Total (colunas com default/nullable) | DROP coluna + função |
| M2 | Calendário corporativo | `calendario_feriados`, `dp_calendario_excecoes` + RLS/grants | Baixo | Total (tabelas novas) | DROP TABLE |
| M3 | Funções de dia útil | `dp_e_dia_util`, `dp_proximo_dia_util`, `dp_adicionar_dias_uteis` | Baixo | Total (nada as consome ainda) | DROP FUNCTION |
| M4 | Localidade da unidade + sábado útil | `dp_unidades.uf` normalizada, `municipio_ibge`, `dp_config_dp.sabado_dia_util` | Médio (dados existentes inconsistentes — só adiciona, não normaliza à força) | Total | DROP coluna |
| M5 | Enum + estrutura base de Convocações | novos valores de `dp_convocacao_status`, `dp_convocacao_grupos`, `dp_convocacao_ocorrencias` + índices parciais | Baixo (0 linhas) | Total | DROP TABLE (valores de enum permanecem, inertes) |
| M6 | Colunas aditivas em `dp_convocacoes` | 11 colunas nullable + FKs | Baixo | Total — nenhuma NOT NULL | DROP coluna |
| M7 | Indisponibilidade, eventos, descumprimentos | 3 tabelas + índices + RLS | Baixo | Total | DROP TABLE |
| M8 | Configurações | `dp_convocacao_config` + `dp_config_dp` (2 colunas de folga) | Baixo | Total | DROP TABLE / DROP coluna |
| M9 | Funções base | `dp_regime_convocavel`, `dp_convocacao_config_resolvida`, triggers de integridade das tabelas novas | Baixo | Total (guard **não** alterado) | DROP FUNCTION |
| M10 | RLS e grants finais | policies das tabelas novas + revogação de `anon` nelas | Baixo | Total | DROP POLICY |

Cada migration é pequena, ordenada, revisável e reversível. Nenhuma toca em trigger existente, `uq_dp_convocacoes_ativa` ou `idx_dp_cct_vigente`.

## 15. Arquivos que serão alterados na 3A (seção 22)

- `supabase/migrations/` — os 10 arquivos acima (nenhum outro).
- `src/integrations/supabase/types.ts` — regenerado automaticamente após as migrations.
- `src/lib/dp/calendario.ts` **(novo)** — apenas tipos e helpers de leitura; **zero cálculo de dia útil no frontend**.
- `src/lib/dp/convocacoes.ts` — apenas novos tipos/constantes aditivos; funções existentes intactas.
- `src/lib/dp/__tests__/calendario.test.ts` e `convocacoes.test.ts` — novos testes.
- **Não serão tocados na 3A:** `DpConvocacoes.tsx`, `DpMinhasConvocacoes.tsx`, `useDpConvocacoes.tsx`, `operacao-panorama.ts`, `horario-previsto.ts`, `escala-mes.ts`, `va-calculo.ts`, `dpNavigation.tsx`.

## 16. Testes planejados (seção 23)

**Legado (regressão obrigatória, antes e depois de cada migration):** criação de convocação pela tela atual; aceite pelo Portal; recusa; expiração de prazo pelo guard; sincronização com Escala (criação do item, atualização e remoção ao recusar/cancelar).

**Schema novo:** isolamento multiempresa (A não vê B) em todas as tabelas novas; CHECK de período da ocorrência (turno XOR janela; ocorrência sem período rejeitada); os dois índices parciais permitindo Garçom-almoço + Garçom-jantar e rejeitando duplicata exata; unicidade da indisponibilidade e sua natureza global; `dp_regime_convocavel` aceitando freelancer e intermitente e recusando CLT/PJ/MEI/estágio/temporário; dia útil (sexta + 1 dia útil = segunda; véspera de feriado; feriado municipal com e sem IBGE; sábado útil ligado/desligado; precedência unidade > empresa > municipal > estadual > nacional); timezone (conversão local→timestamptz por unidade, herança da empresa, fallback); virada de meia-noite (turno 18:00–02:00 com `fim_previsto` no dia seguinte).

**Segurança:** RLS de cada tabela nova (membro lê, admin escreve, colaborador só o próprio); ausência de grant para `anon`; funções SECURITY DEFINER com `search_path` fixo e sem vazamento cross-company; empresa A tentando ler/escrever dados da empresa B via cada policy nova.

## 17. Rollback

Toda a 3A é aditiva: `DROP TABLE` / `DROP COLUMN` / `DROP FUNCTION` / `DROP POLICY` na ordem inversa restaura exatamente o estado atual. Única irreversibilidade técnica: valores adicionados ao enum `dp_convocacao_status` não podem ser removidos — mas ficam inertes e nenhuma linha os usa (tabela vazia). Nenhum dado existente é migrado, transformado ou apagado.

## 18. Riscos

- **P0** — nenhum identificado nesta subetapa (tudo aditivo, tabelas-alvo vazias, trigger e índice legados intocados).
- **P1** — D1 localidade da unidade (feriado municipal indisponível até haver IBGE) e D2 ausência de timezone (precisa ser criada antes de qualquer cálculo de prazo). Ambas bloqueiam a correção do prazo de 1 dia útil e precisam da sua decisão.
- **P2** — D3 grants amplos para `anon` em tabelas DP existentes (limpeza recomendada em trilha separada) e índice duplicado em `dp_convocacoes` (limpeza no cutover).

## 19. Decisões que precisam da sua aprovação antes da 3A.1

1. **Calendário em duas tabelas** (`calendario_feriados` catálogo + `dp_calendario_excecoes` decisões da empresa) em vez da tabela única `dp_calendario_dias_nao_uteis` — aprova?
2. **Timezone**: `companies.timezone` (default `America/Sao_Paulo`) + `dp_unidades.timezone` nullable herdando da empresa — aprova?
3. **Localidade**: adicionar `municipio_ibge` e normalizar `uf` em `dp_unidades`, com feriado municipal degradando explicitamente enquanto não preenchido — aprova?
4. **Sábado útil** em `dp_config_dp.sabado_dia_util` (corporativo, reutilizável), não em `dp_convocacao_config` — aprova?
5. **Carga inicial de feriados nacionais**: quem popula `calendario_feriados` na primeira vez — carga manual pelo admin, seed nacional fixo por migration, ou job externo posterior?

---

**PARADO AQUI.** Nenhuma migration aplicada. Aguardo sua autorização explícita para a 3A.1.
