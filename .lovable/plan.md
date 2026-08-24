# Convocações — Fase 3A.0: SCHEMA FINAL CORRIGIDO

Todas as 30 observações incorporadas. Nenhuma migration aplicada. Diagnóstico do banco não repetido.

## 1. Timezone

**Evidência solicitada, contra o backfill silencioso:** das 17 empresas, **11 têm `uf` NULL** e 6 são `GO`. Não há evidência de que todas operem em `America/Sao_Paulo` — portanto **nenhum default universal e nenhum backfill**.

```sql
ALTER TABLE public.companies   ADD COLUMN timezone text NULL;   -- sem default, sem backfill
ALTER TABLE public.dp_unidades ADD COLUMN timezone text NULL;   -- NULL = herda da empresa
```
Validação por **trigger** (não CHECK — depende de catálogo): valor precisa existir em `pg_timezone_names`; NULL é permitido.

```sql
dp_timezone_resolvido(_company_id uuid, _unidade_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY INVOKER   -- unidade → empresa → NULL
```
**Fail closed:** o RPC de publicação (3B) resolve o timezone **no backend** e, se o retorno for NULL, aborta com `RAISE EXCEPTION 'TIMEZONE_NAO_CONFIGURADO'`. O frontend nunca envia timezone. O legado não consome nada disso e continua funcionando.

## 2. Helpers de dia útil

```sql
CREATE FUNCTION public.dp_e_dia_util(_data date) RETURNS boolean
  LANGUAGE sql IMMUTABLE SECURITY INVOKER   -- sem SECURITY DEFINER: não acessa dados
AS $$ SELECT extract(isodow from _data) BETWEEN 1 AND 5 $$;

CREATE FUNCTION public.dp_adicionar_dias_uteis(_base timestamptz, _dias integer, _tz text)
  RETURNS timestamptz
  LANGUAGE plpgsql STABLE SECURITY INVOKER;  -- helper interno; não acessa tabelas
```
Regra V1: seg–sex úteis, sáb/dom não úteis, **sem feriados**. `dp_adicionar_dias_uteis` converte para hora local no `_tz`, **preserva o horário local**, avança dia a dia contando só dias úteis, reconverte com o offset do dia de destino. `sexta 16:30 + 1 = segunda 16:30`; `sexta 18:00 + 1 = segunda 18:00`; base em sáb/dom → começa na segunda. `_tz` vem sempre de `dp_timezone_resolvido` no backend, nunca do cliente.

Nota de limitação registrada no cabeçalho das migrations e em `src/lib/dp/dias-uteis.ts`:
> Na V1 de Convocações, o cálculo de dia útil considera apenas segunda a sexta-feira e não consulta feriados. Suporte a feriados nacionais, estaduais, municipais e exceções corporativas será implementado posteriormente como evolução transversal da plataforma.

## 3. Máquina de estados final (reconciliada)

**Enum `dp_convocacao_status` — estado operacional da oferta.** Legados mantidos: `pendente`, `aceita`, `recusada`, `cancelada`, `expirada` (`expirada` fica como legado inerte). Novos conceitos: `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`, `encerrada_operacionalmente`.

**`compareceu`/`ausente` NÃO entram no enum.** O resultado da prestação vive em coluna separada, fonte única:
```text
comparecimento text NULL CHECK (comparecimento IN ('compareceu','ausente'))   -- NULL = pendente
comparecimento_origem text NULL CHECK (comparecimento_origem IN ('ponto','manual'))
comparecimento_registrado_em timestamptz NULL · comparecimento_registrado_por uuid NULL
```
`status` responde "qual é o estado operacional?"; `comparecimento` responde "a pessoa compareceu?". Nunca definido pelo relógio: só por ponto ou confirmação manual.

**Classificação para Opção A** — estados que **ocupam** a pessoa/data: `pendente`, `aceita`, `encerrada_operacionalmente`. Não ocupam: `recusada`, `cancelada`, `expirada`, `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`.

**Enum ainda não é alterado.** Conforme item 27, os novos valores ficam em migration própria e isolada (M9), aplicada só depois de você validar esta máquina de estados — é a única alteração irreversível do pacote.

## 4. `dp_convocacao_grupos` (lote/campanha)

```text
id uuid PK D gen_random_uuid()
company_id     uuid NOT NULL  FK companies    ON DELETE RESTRICT
unidade_id     uuid NOT NULL  FK dp_unidades  ON DELETE RESTRICT   -- preserva histórico
competencia    text NOT NULL  CHECK (competencia ~ '^\d{4}-\d{2}$')  -- Convocação mensal
titulo         text NULL
modalidade     text NOT NULL  CHECK (modalidade IN ('individual','aberta'))
status         text NOT NULL D 'rascunho' CHECK (status IN ('rascunho','publicado','encerrado','cancelado'))
observacao     text NULL
publicado_em   timestamptz NULL · publicado_por uuid NULL
criado_por     uuid NULL · created_at/updated_at timestamptz NOT NULL D now()
INDEX (company_id, unidade_id, competencia) · (company_id, status)
```
**`modo_jornada` removido** — o modo de horário pertence à ocorrência.

## 5. `dp_convocacao_ocorrencias` (necessidade ≠ horário ofertado)

```text
id uuid PK
company_id  uuid NOT NULL FK companies      ON DELETE RESTRICT
grupo_id    uuid NOT NULL FK dp_convocacao_grupos ON DELETE RESTRICT
unidade_id  uuid NOT NULL FK dp_unidades    ON DELETE RESTRICT
cargo_id    uuid NOT NULL FK dp_cargos      ON DELETE RESTRICT
data        date NOT NULL

-- A) JANELA DA NECESSIDADE (qual período operacional precisa ser coberto)
necessidade_entrada  time NOT NULL
necessidade_saida    time NOT NULL
necessidade_termina_no_dia_seguinte boolean NOT NULL D false
turno_referencia_id  uuid NULL FK dp_turnos ON DELETE RESTRICT   -- opcional: de onde a janela veio

-- B) HORÁRIO OFERTADO (o que o trabalhador vê)
horario_modo text NOT NULL CHECK (horario_modo IN ('horario_unico','jornada_individual'))
entrada            time NULL
saida              time NULL
intervalo_minutos  integer NULL
termina_no_dia_seguinte boolean NULL
carga_prevista_horas numeric NULL
CHECK horario_coerente:
  (horario_modo = 'horario_unico'
     AND entrada IS NOT NULL AND saida IS NOT NULL
     AND intervalo_minutos IS NOT NULL AND termina_no_dia_seguinte IS NOT NULL
     AND carga_prevista_horas IS NOT NULL)
  OR
  (horario_modo = 'jornada_individual'
     AND entrada IS NULL AND saida IS NULL AND intervalo_minutos IS NULL
     AND termina_no_dia_seguinte IS NULL AND carga_prevista_horas IS NULL)

vagas integer NOT NULL D 1 CHECK (vagas > 0)
versao integer NOT NULL D 1
substitui_ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias(id) ON DELETE RESTRICT
antecedencia_dias integer NULL              -- calculada na publicação
fora_antecedencia boolean NOT NULL D false
confirmado_fora_prazo_por uuid NULL · confirmado_fora_prazo_em timestamptz NULL
justificativa_fora_prazo text NULL
condicoes_comuns jsonb NOT NULL D '{}'      -- condições apresentadas a todos os ofertados
status text NOT NULL D 'aberta' CHECK (status IN ('aberta','preenchida','encerrada','cancelada'))
publicada_em timestamptz NULL
criado_por uuid NULL · created_at/updated_at timestamptz NOT NULL D now()
```
**Unicidade da necessidade** (Garçom almoço **e** Garçom jantar no mesmo dia; duplicata exata rejeitada), agora sobre a **janela da necessidade** e a versão vigente:
```sql
CREATE UNIQUE INDEX uq_dp_conv_ocor_necessidade
  ON dp_convocacao_ocorrencias
     (company_id, unidade_id, data, cargo_id, necessidade_entrada, necessidade_saida)
  WHERE status <> 'cancelada' AND substitui_ocorrencia_id IS NULL;

CREATE UNIQUE INDEX uq_dp_conv_ocor_necessidade_versao
  ON dp_convocacao_ocorrencias
     (company_id, unidade_id, data, cargo_id, necessidade_entrada, necessidade_saida, versao)
  WHERE status <> 'cancelada';
```
Outros índices: `(grupo_id)`, `(company_id, data)`, `(cargo_id)`, `(substitui_ocorrencia_id)`.

## 6. Alterações em `dp_convocacoes` (todas nullable na 3A)

```text
ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias ON DELETE RESTRICT
-- SEM grupo_id: a relação é dp_convocacoes → ocorrencia_id → grupo_id (item 12)
disponibilizada_em timestamptz NULL · visualizada_em timestamptz NULL
inicio_previsto timestamptz NULL · fim_previsto timestamptz NULL
encerramento_operacional timestamptz NULL
timezone_snapshot text NULL
prazo_resposta_base timestamptz NULL
compatibilidade text NULL CHECK (compatibilidade IN ('integral','incompativel'))
remuneracao_snapshot jsonb NULL
origem text NULL CHECK (origem IN ('convocacao','substituicao','troca'))
substituida_por_id uuid NULL FK dp_convocacoes(id) ON DELETE SET NULL
substitui_convocacao_id uuid NULL FK dp_convocacoes(id) ON DELETE SET NULL
encerrada_em timestamptz NULL · encerramento_motivo text NULL
comparecimento text NULL CHECK (compareceu|ausente)
comparecimento_origem text NULL CHECK (ponto|manual)
comparecimento_registrado_em timestamptz NULL · comparecimento_registrado_por uuid NULL
```
Todas nullable durante toda a transição — o frontend legado (`useDpConvocacoes.tsx`) grava só as colunas antigas e segue funcionando. **`uq_dp_convocacoes_ativa` permanece intacto na 3A.** O índice final de cutover será reformulado sobre a máquina de estados desta seção 3 (ocupantes: `pendente`, `aceita`, `encerrada_operacionalmente`) e só entra no cutover, junto com a garantia backend da Opção A.

## 7. `dp_indisponibilidades`

```text
id uuid PK
company_id uuid NOT NULL FK companies ON DELETE RESTRICT
colaborador_id uuid NOT NULL FK dp_colaboradores ON DELETE RESTRICT
data date NOT NULL · motivo text NULL
origem text NOT NULL D 'colaborador' CHECK (colaborador|gestor|sistema)
criado_por uuid NULL · cancelada_em timestamptz NULL · cancelada_por uuid NULL
created_at/updated_at timestamptz NOT NULL D now()
UNIQUE INDEX (colaborador_id, data) WHERE cancelada_em IS NULL   -- global, sem unidade_id
trigger de consistência: company_id deve bater com a empresa do colaborador
```
RLS: admin/owner da empresa **SELECT**; colaborador **SELECT das próprias** (via `dp_colaborador_ativo_of`). **Sem self-write direto** — marcar/cancelar indisponibilidade exige atomicidade (encerrar ofertas pendentes + registrar evento) e será feito por RPC.

## 8. `dp_convocacao_descumprimentos` (corrigido)

`sem_resposta` **não** é descumprimento — é estado operacional da oferta.
```text
id uuid PK
company_id uuid NOT NULL FK companies ON DELETE RESTRICT
convocacao_id uuid NOT NULL FK dp_convocacoes ON DELETE RESTRICT
ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias ON DELETE RESTRICT
colaborador_id uuid NOT NULL FK dp_colaboradores ON DELETE RESTRICT
regime_snapshot public.dp_regime_trabalho NOT NULL
tipo text NOT NULL CHECK (tipo IN ('desistencia_apos_aceite','ausencia_no_dia'))
motivo_informado text NULL
analise text NOT NULL D 'pendente' CHECK (analise IN ('pendente','justificado','sem_justo_motivo'))
analisado_por uuid NULL · analisado_em timestamptz NULL · observacao_analise text NULL
base_remuneracao numeric NULL · percentual numeric NULL · valor_referencia numeric NULL
prazo_limite date NULL
created_at/updated_at timestamptz NOT NULL D now()
UNIQUE (convocacao_id, tipo)      -- idempotência
INDEX (company_id, colaborador_id, created_at DESC)
```
**Nenhum lançamento financeiro automático:** `base_remuneracao`, `percentual` e `valor_referencia` são informativos/de referência para decisão humana.

## 9. `dp_convocacao_eventos`

```text
id uuid PK
company_id uuid NOT NULL FK companies ON DELETE RESTRICT
grupo_id      uuid NULL FK dp_convocacao_grupos      ON DELETE RESTRICT
ocorrencia_id uuid NULL FK dp_convocacao_ocorrencias ON DELETE RESTRICT
convocacao_id uuid NULL FK dp_convocacoes            ON DELETE RESTRICT
tipo text NOT NULL · de_status text NULL · para_status text NULL
ator_user_id uuid NULL · ator_papel text NULL · payload jsonb NOT NULL D '{}'
created_at timestamptz NOT NULL D now()   -- append-only, sem updated_at
CHECK (grupo_id IS NOT NULL OR ocorrencia_id IS NOT NULL OR convocacao_id IS NOT NULL)
INDEX (company_id, created_at DESC) · (convocacao_id) · (ocorrencia_id) · (grupo_id)
```
Histórico nunca desaparece por CASCADE (item 16): todas as FKs de entidades históricas usam `RESTRICT`. Exclusão de unidade/cargo com Convocação registrada passa a exigir tratamento explícito (inativação), nunca apagamento silencioso.

## 10. `dp_convocacao_config` (modelo completo restaurado)

```text
id uuid PK
company_id uuid NOT NULL FK companies ON DELETE RESTRICT
unidade_id uuid NULL FK dp_unidades ON DELETE RESTRICT      -- NULL = padrão da empresa
antecedencia_minima_dias integer NOT NULL D 3
prazo_resposta_dias_uteis integer NOT NULL D 1
aprovacao_modo text NOT NULL D 'somente_excecoes'
  CHECK (aprovacao_modo IN ('sempre_gestor','somente_excecoes','automatica'))

-- Substituições permitidas por par de regimes
sub_intermitente_por_intermitente boolean NOT NULL D true
sub_intermitente_por_freelancer   boolean NOT NULL D true
sub_freelancer_por_intermitente   boolean NOT NULL D true
sub_freelancer_por_freelancer     boolean NOT NULL D true
sub_fixo_em_folga_dominical       boolean NOT NULL D false   -- troca com fixo em folga dominical

-- Reabertura e autonomia
reabre_vaga_em_desistencia boolean NOT NULL D true
reabre_vaga_em_recusa      boolean NOT NULL D true
reabre_vaga_em_sem_resposta boolean NOT NULL D true
autonomia_colaborador_desistir boolean NOT NULL D true
autonomia_prazo_desistencia_horas integer NULL
permite_oferta_aberta boolean NOT NULL D true
exige_justificativa_excecao boolean NOT NULL D true
preset text NULL CHECK (preset IN ('conservador','equilibrado','flexivel'))  -- rótulo, não regra
created_at/updated_at timestamptz NOT NULL D now()
UNIQUE (company_id, unidade_id) NULLS NOT DISTINCT   -- 1 padrão da empresa + 1 por unidade
trigger de integridade: unidade_id, quando presente, pertence a company_id
dp_convocacao_config_resolvida(company_id, unidade_id) → unidade, senão empresa, senão defaults
```
**`antecedencia_bloqueia` removido.** Menos de 3 dias **nunca bloqueia**: detectar → alertar → exigir confirmação → registrar exceção (`fora_antecedencia`, `confirmado_fora_prazo_*`, `justificativa_fora_prazo` + evento) → publicar. Não existe configuração capaz de transformar isso em hard block.

## 11. `dp_config_dp` e `dp_colaborador_config_trabalho`

```sql
ALTER TABLE public.dp_config_dp
  ADD COLUMN considerar_indisponibilidade_cobertura boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_colaborador_config_trabalho
  ADD COLUMN compoe_equipe_habitual boolean NOT NULL DEFAULT true;
```
**`comportamento_deficit_cobertura` removido.** Portal com déficit → **bloqueia**; Admin com déficit → **alerta + override auditado**. Isso permanece regra de negócio no backend, não parametrizável nesta V1. `idx_dp_cct_vigente` não é alterado.

## 12. Grants e RLS (RPC-only)

Para **todas** as tabelas novas:
```sql
GRANT SELECT ON public.<tabela> TO authenticated;   -- só onde a leitura é realmente necessária
GRANT ALL    ON public.<tabela> TO service_role;
-- SEM INSERT / UPDATE / DELETE para authenticated. SEM qualquer grant para anon.
```
Escrita futura exclusivamente por RPCs `SECURITY DEFINER`. Como o frontend ainda não usa essas tabelas na 3A, nada quebra.

| Tabela | SELECT `authenticated` | Escrita |
|---|---|---|
| `dp_convocacao_grupos` | admin/owner da empresa | RPC |
| `dp_convocacao_ocorrencias` | admin/owner da empresa (**sem** leitura genérica de colaborador — item 21) | RPC |
| `dp_convocacao_config` | admin/owner | RPC |
| `dp_indisponibilidades` | admin/owner + colaborador só as próprias | RPC |
| `dp_convocacao_descumprimentos` | admin/owner + colaborador só os próprios | RPC |
| `dp_convocacao_eventos` | admin/owner | apenas funções `SECURITY DEFINER` |

Leitura de ocorrência pelo trabalhador fica planejada para o futuro **através da própria oferta** (`dp_convocacoes` own → `ocorrencia_id`), sem ampliar leitura antecipadamente.

## 13. FKs e ON DELETE — resumo

`RESTRICT` em tudo que é histórico ou cadastral referenciado: `company_id`, `unidade_id`, `cargo_id`, `turno_referencia_id`, `grupo_id`, `ocorrencia_id`, `convocacao_id`, `colaborador_id`, `substitui_ocorrencia_id`. `SET NULL` apenas nos ponteiros laterais de substituição em `dp_convocacoes` (`substituida_por_id`, `substitui_convocacao_id`). **Nenhum CASCADE nas novas estruturas.** As FKs legadas de `dp_convocacoes` não são alteradas na 3A.

## 14. Migrations finais (3A.1, após sua autorização)

| # | Objetivo | Objetos | Risco | Compat. legado | Rollback |
|---|---|---|---|---|---|
| M1 | Timezone compatível | `companies.timezone` e `dp_unidades.timezone` (nullable, sem default/backfill) + trigger de validação + `dp_timezone_resolvido()` | Baixo | Total | DROP coluna/função |
| M2 | Dia útil V1 | `dp_e_dia_util(date)`, `dp_adicionar_dias_uteis(timestamptz,int,text)` — `SECURITY INVOKER` | Baixo | Total | DROP FUNCTION |
| M3 | Grupos | `dp_convocacao_grupos` + índices + RLS/grants | Baixo | Total | DROP TABLE |
| M4 | Ocorrências | `dp_convocacao_ocorrencias` + CHECKs + 2 índices de unicidade + RLS/grants | Baixo | Total | DROP TABLE |
| M5 | Colunas aditivas em `dp_convocacoes` | ~18 colunas nullable + FKs | Baixo | Total (nenhuma NOT NULL) | DROP coluna |
| M6 | Indisponibilidade, descumprimentos, eventos | 3 tabelas + índices + RLS/grants | Baixo | Total | DROP TABLE |
| M7 | Configurações | `dp_convocacao_config` + `dp_config_dp.considerar_indisponibilidade_cobertura` + `compoe_equipe_habitual` | Baixo | Total | DROP TABLE / DROP coluna |
| M8 | Funções base | `dp_regime_convocavel(regime)` (true p/ intermitente e freelancer), `dp_convocacao_config_resolvida`, triggers de integridade e `updated_at` | Baixo | Total (guard intocado) | DROP FUNCTION |
| **M9** | **Enum — única alteração irreversível, isolada** | novos valores de `dp_convocacao_status`: `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`, `encerrada_operacionalmente` (**sem `compareceu`/`ausente`**) | Baixo (0 linhas) | Total | Não reversível — valores ficam inertes |

M9 só é aplicada depois de você validar a máquina de estados da seção 3. Nenhuma migration altera `dp_convocacao_sync_escala`, `dp_convocacao_guard`, `uq_dp_convocacoes_ativa` ou `idx_dp_cct_vigente`.

## 15. Rollback

Enquanto as novas estruturas estiverem **sem dados**, `DROP` é rollback aceitável. **Após qualquer uso real, rollback deixa de ser DROP:** passa a ser desativação/inércia (parar de escrever, ocultar na UI, manter tabela e dados), preservando histórico. Condição registrada aqui e no cabeçalho de cada migration. M9 é irreversível por natureza (valores de enum permanecem, inertes).

## 16. Riscos remanescentes

- **P0** — nenhum: nada aplicado; os riscos P0/P1 apontados (grants de escrita direta, CASCADE em histórico, dupla fonte de comparecimento, descumprimento mal modelado, perda de regras de substituição) foram corrigidos neste schema.
- **P1** — timezone não configurado em nenhuma empresa: o fluxo novo **falha fechado** com `TIMEZONE_NAO_CONFIGURADO` até alguém configurar; a 3B precisará de uma tela mínima para isso (fora da 3A).
- **P2** — grants amplos herdados para `anon` em tabelas DP **existentes** (trilha separada); índice duplicado em `dp_convocacoes` (limpeza no cutover); ausência de feriados como limitação conhecida e documentada.

## 17. Aguardando

Validação deste schema final. **Nenhuma migration aplicada. PARADO.**

---

# Adendo final da Fase 3A.0 (correções 1–23)

## A. Integridade multiempresa — garantida no banco

Auditoria: `dp_unidades`, `dp_cargos`, `dp_turnos` têm apenas `PRIMARY KEY (id)`; `dp_colaboradores` tem `PK (id)` + `UNIQUE (company_id, cpf)`. Logo composite FK ainda não é possível sem chaves candidatas compostas.

Abordagem escolhida (mista, sem redundância):

1. **Chaves candidatas aditivas** (só `ADD CONSTRAINT ... UNIQUE`, nenhum dado alterado):
   - `dp_unidades UNIQUE (id, company_id)`
   - `dp_cargos UNIQUE (id, company_id)`
   - `dp_turnos UNIQUE (id, company_id)`
   - `dp_colaboradores UNIQUE (id, company_id)`
   - nas novas tabelas: `dp_convocacao_grupos UNIQUE (id, company_id)` e `dp_convocacao_ocorrencias UNIQUE (id, company_id, unidade_id, data)`
2. **Composite FKs** nas tabelas novas sempre que a consistência for expressável por colunas presentes (preferido a trigger).
3. **Trigger de integridade** apenas onde composite FK não cobre (comparações entre linhas, `company_id` derivado, escopo de turno).
4. Toda RPC futura **revalida autorização** e **deriva** `company_id` do servidor; nenhum `company_id` vindo do cliente é autoritativo.

### Consistência por tabela

| Tabela | Garantia | Mecanismo |
|---|---|---|
| `dp_convocacao_grupos` | `unidade_id` pertence a `company_id` | composite FK `(unidade_id, company_id) → dp_unidades (id, company_id)` |
| `dp_convocacao_ocorrencias` | grupo da mesma empresa **e** mesma unidade | composite FK `(grupo_id, company_id) → grupos (id, company_id)` + trigger `unidade_id = grupo.unidade_id` (regra estrita; nenhuma exceção permitida na V1) |
| `dp_convocacao_ocorrencias` | unidade e cargo pertencem à empresa | composite FKs para `dp_unidades (id, company_id)` e `dp_cargos (id, company_id)` |
| `dp_convocacao_ocorrencias` | `turno_referencia_id` utilizável na empresa/unidade | composite FK `(turno_referencia_id, company_id) → dp_turnos (id, company_id)` + trigger: se o turno tiver `unidade_id`, deve igualar `ocorrencia.unidade_id` |
| `dp_convocacoes` (com `ocorrencia_id`) | `company_id`, `unidade_id` e `data` iguais aos da ocorrência | composite FK `(ocorrencia_id, company_id, unidade_id, data) → ocorrencias (id, company_id, unidade_id, data)` — dispensa trigger |
| `dp_convocacoes` | colaborador pertence à empresa | composite FK `(colaborador_id, company_id) → dp_colaboradores (id, company_id)` (coluna nova; legado intocado) |
| `dp_indisponibilidades` | `company_id` = vínculo real do colaborador | `company_id` **derivado** por trigger `BEFORE INSERT/UPDATE` a partir de `dp_colaboradores.company_id`; valor divergente enviado é sobrescrito, não aceito |
| `dp_convocacao_descumprimentos` | convocação + ocorrência + colaborador + empresa no mesmo contexto | `company_id`, `ocorrencia_id` e `colaborador_id` **derivados da convocação** por trigger; composite FK `(convocacao_id, company_id)` |
| `dp_convocacao_eventos` | todas as referências no mesmo contexto | `company_id` **derivado da entidade principal** do evento (convocação > ocorrência > grupo, nessa ordem) por trigger; composite FKs `(grupo_id, company_id)`, `(ocorrencia_id, company_id)`, `(convocacao_id, company_id)`; trigger valida coerência grupo↔ocorrência↔convocação quando mais de uma referência é informada |

Um único trigger por tabela (`*_integridade`), sem duplicar o que a composite FK já garante.

## B. Estados definitivos

**Ocorrência** (`dp_convocacao_ocorrencia_status`): `rascunho`, `publicada`, `preenchida`, `encerrada_operacionalmente`, `apurada`, `revisada`, `cancelada`.
- `encerrada_operacionalmente` = passou a janela; **não** significa apuração.
- `apurada` = comparecimentos/ausências conferidos e descumprimentos analisados.
- `revisada` = versão superada por nova versão (`substitui_ocorrencia_id` na v2). Trigger: ao criar v2, a v1 vai obrigatoriamente para `revisada`; ocorrência `revisada` não conta como válida em cobertura nem aceita novas ofertas — nunca há duas versões válidas simultâneas.
- `preenchida` é derivada mas persistida na ocorrência (é ela que fecha a oferta), calculada por trigger a partir de vagas × ofertas ativas.

**Grupo** (`dp_convocacao_grupo_status`): `rascunho`, `publicado`, `encerrado`, `cancelado`.
- **Decisão intencional e documentada:** `parcialmente_preenchido` / `preenchido` **não são estados persistidos do grupo** — são métricas derivadas das ocorrências, calculadas em leitura. Evita estado redundante.

## C. `dp_convocacao_descumprimentos` — CHECKs

```
CHECK (percentual_referencia IS NULL OR regime_snapshot = 'intermitente')
CHECK (valor_referencia IS NULL OR analise = 'sem_justo_motivo')
CHECK (percentual_referencia IS NULL OR percentual_referencia >= 0)
CHECK (valor_referencia IS NULL OR valor_referencia >= 0)
CHECK (base_remuneracao IS NULL OR base_remuneracao >= 0)
```
Tipos: `desistencia_apos_aceite`, `ausencia_no_dia`. Referência de 50% apenas para **intermitente + sem justo motivo**; freelancer nunca recebe referência CLT. O registro é **apenas referência/análise**: nenhum desconto, folha, conta a receber ou lançamento financeiro é gerado.

## D. Configuração corrigida (`dp_convocacao_config`)

- **Removidos:** `reabre_vaga_em_recusa`, `reabre_vaga_em_sem_resposta` (em oferta aberta a vaga nunca foi ocupada — não há o que reabrir), `autonomia_prazo_desistencia_horas` (sem decisão de produto; registrar desistência nunca é bloqueado por antecedência).
- **Mantido:** `reabre_vaga_em_desistencia` (aceita → desistida sem substituto = vaga efetivamente descoberta).
- `sub_fixo_em_folga_dominical` significa apenas "a empresa permite este fluxo". O **consentimento do fixo é invariante**: não existe e não existirá configuração para desligá-lo.
- **Preset não é persistido nesta fase.** As regras booleanas/enums são a única fonte da verdade; nomes `controlado/moderado/autonomo/personalizado` ficam como rótulo de UX na Fase 4.

## E. Origem da oferta

`dp_convocacoes.origem_oferta`: **`convocacao` | `substituicao`** apenas. `troca` foi descartada — trocas entre fixos são domínio de `dp_trocas` e não geram oferta de convocação; transferência de vaga é `substituicao`.

## F. Contrato dos helpers de dia útil (V1, `SECURITY INVOKER`)

`dp_e_dia_util(_data date) → boolean`, `IMMUTABLE`: seg–sex = true; sáb/dom = false; feriados ignorados; `NULL` → `NULL`.

`dp_adicionar_dias_uteis(_base timestamptz, _dias int, _timezone text) → timestamptz`, `STABLE`:
- `_timezone` NULL/vazio → exceção `TIMEZONE_NAO_CONFIGURADO`; timezone inexistente → `TIMEZONE_INVALIDO` (validado contra `pg_timezone_names`).
- `_dias < 0` → exceção `DIAS_UTEIS_NEGATIVO` (V1 não retrocede).
- `_dias = 0` → retorna `_base` **inalterado**, mesmo em fim de semana (não normaliza).
- `_dias > 0` → avança dia a dia no calendário **local** do timezone, contando somente dias úteis, **preservando o horário local** (à prova de DST); retorna `timestamptz`.

## G. Migrations M1–M9 — onde cada integridade nasce

| # | Conteúdo (integridade destacada) |
|---|---|
| M1 | `companies.timezone`, `dp_unidades.timezone` (nullable, sem default/backfill), validação de timezone, `dp_timezone_resolvido()` (unidade → empresa → `TIMEZONE_NAO_CONFIGURADO`) |
| M2 | `dp_e_dia_util`, `dp_adicionar_dias_uteis` conforme contrato F |
| **M2b** | **Chaves candidatas aditivas:** `UNIQUE (id, company_id)` em `dp_unidades`, `dp_cargos`, `dp_turnos`, `dp_colaboradores` (pré-requisito das composite FKs) |
| M3 | `dp_convocacao_grupos` + `UNIQUE (id, company_id)` + **composite FK company × unidade** + RLS/grants RPC-only |
| M4 | `dp_convocacao_ocorrencias` + `UNIQUE (id, company_id, unidade_id, data)` + **composite FKs company × grupo, × unidade, × cargo, × turno** + trigger `ocorrencia_integridade` (unidade = unidade do grupo; unidade do turno; versionamento → v1 `revisada`) + CHECKs de janela/vagas |
| M5 | Colunas aditivas em `dp_convocacoes` + **composite FK ocorrência × (company, unidade, data)** e **company × colaborador** |
| M6 | `dp_indisponibilidades` (trigger deriva company do colaborador), `dp_convocacao_descumprimentos` (trigger deriva company/ocorrência/colaborador da convocação + CHECKs da seção C), `dp_convocacao_eventos` (trigger deriva company da entidade principal + coerência entre referências) |
| M7 | `dp_convocacao_config` (sem os campos removidos em D), `dp_config_dp.considerar_indisponibilidade_cobertura`, `compoe_equipe_habitual` |
| M8 | `dp_regime_convocavel`, `dp_convocacao_config_resolvida`, enums de status de grupo/ocorrência da seção B, triggers de `updated_at` |
| **M9** | Enum de oferta (isolada, irreversível): `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`, `encerrada_operacionalmente`. `compareceu`/`ausente` seguem fora do enum |

Nada em M1–M9 altera `dp_convocacao_sync_escala`, `dp_convocacao_guard`, `uq_dp_convocacoes_ativa` ou `idx_dp_cct_vigente`.

## H. Correção do risco P1 (escopo)

3A/3B = banco/backend; **Fase 4 = frontend**. A tela para configurar timezone é entregável da **Fase 4**, não da 3B. O escopo da 3B não muda.

**Nenhuma migration aplicada. PARADO — aguardando autorização da 3A.1.**

---

# Adendo técnico 2 — Fase 3A.0 (correções 1–11)

## Checklist das correções

1. **Chaves candidatas completas.** Acrescentadas: `dp_convocacao_ocorrencias UNIQUE (id, company_id)`, `dp_convocacao_ocorrencias UNIQUE (id, company_id, unidade_id, data)`, `dp_convocacoes UNIQUE (id, company_id)`, `dp_convocacao_grupos UNIQUE (id, company_id)`, e `UNIQUE (id, company_id)` em `dp_unidades`, `dp_cargos`, `dp_turnos`, `dp_colaboradores`. PKs `id` preservadas; as compostas existem só para viabilizar as composite FKs. Mapa FK → chave candidata destino:

| FK (origem) | Destino | Chave candidata |
|---|---|---|
| grupos `(unidade_id, company_id)` | `dp_unidades` | `UNIQUE (id, company_id)` |
| ocorrencias `(grupo_id, company_id)` | grupos | `UNIQUE (id, company_id)` |
| ocorrencias `(unidade_id, company_id)` | `dp_unidades` | `UNIQUE (id, company_id)` |
| ocorrencias `(cargo_id, company_id)` | `dp_cargos` | `UNIQUE (id, company_id)` |
| ocorrencias `(turno_referencia_id, company_id)` | `dp_turnos` | `UNIQUE (id, company_id)` |
| ocorrencias `(substitui_ocorrencia_id, company_id)` | ocorrencias | `UNIQUE (id, company_id)` |
| convocacoes `(ocorrencia_id, company_id, unidade_id, data)` | ocorrencias | `UNIQUE (id, company_id, unidade_id, data)` |
| convocacoes `(colaborador_id, company_id)` | `dp_colaboradores` | `UNIQUE (id, company_id)` |
| descumprimentos `(convocacao_id, company_id)` | convocacoes | `UNIQUE (id, company_id)` |
| eventos `(grupo_id, company_id)` / `(ocorrencia_id, company_id)` / `(convocacao_id, company_id)` | respectivas | `UNIQUE (id, company_id)` |
| indisponibilidades `(colaborador_id, company_id)` | `dp_colaboradores` | `UNIQUE (id, company_id)` |

Cada composite FK tem exatamente uma PK/UNIQUE compatível no destino.

2. **`ocorrencia_id` nullable sem furo de MATCH SIMPLE.** `dp_convocacoes` recebe `CHECK (ocorrencia_id IS NULL OR (unidade_id IS NOT NULL AND data IS NOT NULL))`, mantendo a FK `(ocorrencia_id, company_id, unidade_id, data)`. Legado (`ocorrencia_id IS NULL`) segue funcionando; fluxo novo exige contexto completo e coerente.

3. **Um único sucessor por ocorrência.** `CREATE UNIQUE INDEX ... ON dp_convocacao_ocorrencias (substitui_ocorrencia_id) WHERE substitui_ocorrencia_id IS NOT NULL`. A RPC futura de revisão faz, na mesma transação: `SELECT ... FOR UPDATE` da anterior → valida estado → marca `revisada` → cria sucessora.

4. **Identidade da janela inclui a virada.** `necessidade_termina_no_dia_seguinte` entra no índice de unicidade da necessidade (18:00→02:00 com virada ≠ sem virada).

5. **Versão vigente por status.** Unicidade da necessidade vigente usa `WHERE status NOT IN ('revisada','cancelada')` — nunca `substitui_ocorrencia_id IS NULL` (uma v2 legítima tem esse campo preenchido). Garante uma única versão operacionalmente vigente por necessidade.

6. **Sem trigger de contagem na 3A.** Removido o trigger que calculava `preenchida`. Na 3A só coluna/status, CHECKs e índices. Na 3B, `dp_convocacao_aceitar` faz lock da ocorrência → revalida → conta apenas ofertas que ocupam vaga (`aceita` e equivalentes ocupantes; `pendente` **não** ocupa) → aceita → marca `preenchida` se atingir as vagas, tudo na mesma transação.

7. **Descumprimento bilateral.** Nova coluna `parte_responsavel text CHECK (parte_responsavel IN ('colaborador','empregador'))`. Tipos: `desistencia_apos_aceite` e `ausencia_no_dia` → `colaborador`; `cancelamento_empregador_apos_aceite` → `empregador` (CHECK amarrando tipo × parte). Finalidade exclusiva: histórico, análise, auditoria e referência — **sem** multa, desconto, folha, contas a pagar/receber ou lançamento financeiro automático.

8. **Referência de 50% consistente.** Unidade única e documentada: `percentual_referencia numeric` em **pontos percentuais** (50 = 50%). `CHECK (percentual_referencia IS NULL OR (regime_snapshot = 'intermitente' AND analise = 'sem_justo_motivo' AND percentual_referencia = 50))`; freelancer sempre `NULL`. `valor_referencia` mantém `CHECK (valor_referencia IS NULL OR analise = 'sem_justo_motivo')`. Sem efeito financeiro automático.

9. **Sem novos enums para grupo/ocorrência.** Status de grupo e ocorrência ficam `text + CHECK` nas próprias tabelas (M3/M4), eliminando a dependência invertida com M8. Único enum alterado segue sendo `dp_convocacao_status`, isolado em M9.

## M1–M9 atualizadas

| # | Conteúdo |
|---|---|
| M1 | `companies.timezone`, `dp_unidades.timezone` (nullable, sem default/backfill), validação de timezone, `dp_timezone_resolvido()` |
| M2 | `dp_e_dia_util(date)`, `dp_adicionar_dias_uteis(timestamptz,int,text)` — `SECURITY INVOKER`, contrato do adendo 1 |
| M2b | Chaves candidatas aditivas: `UNIQUE (id, company_id)` em `dp_unidades`, `dp_cargos`, `dp_turnos`, `dp_colaboradores` |
| M3 | `dp_convocacao_grupos` (status `text + CHECK`), `UNIQUE (id, company_id)`, composite FK company × unidade, RLS/grants RPC-only |
| M4 | `dp_convocacao_ocorrencias` (status `text + CHECK`: `rascunho`, `publicada`, `preenchida`, `encerrada_operacionalmente`, `apurada`, `revisada`, `cancelada`); `UNIQUE (id, company_id)` e `UNIQUE (id, company_id, unidade_id, data)`; composite FKs company × grupo/unidade/cargo/turno/ocorrência-anterior; índice único da necessidade vigente incluindo `necessidade_termina_no_dia_seguinte` e `WHERE status NOT IN ('revisada','cancelada')`; índice único de sucessor (`substitui_ocorrencia_id`); trigger `ocorrencia_integridade` (unidade = unidade do grupo, unidade do turno) — **sem trigger de contagem de preenchimento**; RLS/grants |
| M5 | Colunas aditivas em `dp_convocacoes` (incl. `origem_oferta` = `convocacao`/`substituicao`), `UNIQUE (id, company_id)`, `CHECK (ocorrencia_id IS NULL OR (unidade_id IS NOT NULL AND data IS NOT NULL))`, composite FK `(ocorrencia_id, company_id, unidade_id, data)` e `(colaborador_id, company_id)` |
| M6 | `dp_indisponibilidades` (trigger deriva company do colaborador), `dp_convocacao_descumprimentos` (trigger deriva company/ocorrência/colaborador da convocação; `parte_responsavel`; tipos incl. `cancelamento_empregador_apos_aceite`; CHECKs de tipo × parte e financeiros do item 8), `dp_convocacao_eventos` (trigger deriva company da entidade principal + coerência entre referências); índices, RLS/grants |
| M7 | `dp_convocacao_config` (sem `reabre_vaga_em_recusa`, `reabre_vaga_em_sem_resposta`, `autonomia_prazo_desistencia_horas`; mantém `reabre_vaga_em_desistencia`; preset não persistido), `dp_config_dp.considerar_indisponibilidade_cobertura`, `compoe_equipe_habitual` |
| M8 | `dp_regime_convocavel`, `dp_convocacao_config_resolvida`, triggers de `updated_at` — **nenhum enum novo** |
| M9 | Enum `dp_convocacao_status` (isolada, irreversível): `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`, `encerrada_operacionalmente`; `compareceu`/`ausente` fora do enum |

Nada altera `dp_convocacao_sync_escala`, `dp_convocacao_guard`, `uq_dp_convocacoes_ativa` ou `idx_dp_cct_vigente`.

**Nenhuma migration aplicada. PARADO — aguardando autorização da 3A.1.**
