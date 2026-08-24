# Convocações — Fase 3A.1: execução da fundação aditiva

A 3A.0 está aprovada e encerrada. Este plano existe apenas para liberar a execução (estou em modo de planejamento; aprovar aqui libera a aplicação das migrations).

Escopo: aplicar M1 → M2 → M2b → M3 → M4 → M5 → M6 → M7 → M8 → M9, **uma por vez**, validando e evidenciando cada etapa. Sem 3B, sem cutover, sem frontend/Portal.

## Ordem de execução

| # | Conteúdo | Validação após aplicar |
|---|---|---|
| M1 | `companies.timezone`, `dp_unidades.timezone` (nullable, sem default/backfill), trigger de validação contra `pg_timezone_names`, `dp_timezone_resolvido` (unidade → empresa → NULL) | colunas/função existem; resolução em 3 cenários; nenhum fallback silencioso |
| M2 | `dp_e_dia_util(date)`, `dp_adicionar_dias_uteis(timestamptz,int,text)` | seg+1→ter, sex+1→seg, sáb+1→seg, dom+1→seg, +0 → original, dias negativos → erro, tz inválido/NULL → erro |
| M2b | `UNIQUE (id, company_id)` em `dp_unidades`, `dp_cargos`, `dp_turnos`, `dp_colaboradores` | consulta prévia de evidência (contagem, `company_id` nulo/duplicidade) antes de aplicar |
| M3 | `dp_convocacao_grupos` (status text+CHECK, `competencia ^\d{4}-(0[1-9]\|1[0-2])$`), `UNIQUE (id, company_id)`, composite FK company × unidade, RLS + grants RPC-only | teste negativo grupo A + unidade B |
| M4 | `dp_convocacao_ocorrencias` + CHECKs básicos (`vagas > 0`, `versao >= 1`, `antecedencia_dias >= 0`, `intervalo_minutos >= 0`, `carga_prevista_horas > 0`), unicidade da necessidade vigente (com flag de virada, `status NOT IN ('revisada','cancelada')`), índice único de sucessor, composite FKs, trigger de integridade | testes negativos cargo/turno de outra empresa; versionamento |
| M5 | Colunas aditivas em `dp_convocacoes` incl. **`regime_snapshot public.dp_regime_trabalho NULL`**, `origem_oferta`, `comparecimento*`, `UNIQUE (id, company_id)`, `CHECK (ocorrencia_id IS NULL OR (unidade_id IS NOT NULL AND data IS NOT NULL))`, composite FKs | legado continua inserindo; teste negativo oferta A + colaborador B |
| M6 | `dp_indisponibilidades`, `dp_convocacao_descumprimentos` (`parte_responsavel`, `cancelamento_empregador_apos_aceite`, `base_remuneracao`/`percentual_referencia`/`valor_referencia` + CHECK dos 50%), `dp_convocacao_eventos` (append-only) + triggers que derivam `company_id` | testes negativos evento A × ocorrência B, descumprimento A × convocação B |
| M7 | `dp_convocacao_config` (`antecedencia_minima_dias >= 0`, `prazo_resposta_dias_uteis > 0` default 1; sem bloqueio por antecedência, sem prazo de desistência, sem reabertura por recusa/sem resposta), `dp_config_dp.considerar_indisponibilidade_cobertura`, `compoe_equipe_habitual` | resolução unidade → empresa → defaults |
| M8 | `dp_regime_convocavel(regime)` (true só p/ intermitente e freelancer), `dp_convocacao_config_resolvida`, triggers `updated_at` e **alteração cirúrgica de `dp_convocacao_guard`**: troca da comparação literal por `dp_regime_convocavel(regime)`, preservando todas as outras validações (definição atual salva + diff lógico apresentado) | `dp_regime_convocavel('freelancer') = true`; guard não rejeita freelancer; demais regimes seguem bloqueados |
| M9 | Enum `dp_convocacao_status`: `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `desistida`, `substituida`, `encerrada_operacionalmente` (sem `compareceu`/`ausente`) | irreversível: valores de enum não voltam por rollback normal |

## Invariantes registradas (documentação, sem código nesta fase)

Substituto sempre consente; fixo em folga dominical sempre consente; `aprovacao_modo = automatica` automatiza apenas a aprovação gerencial, nunca o consentimento das pessoas. `regime_snapshot` do descumprimento deriva da oferta (`dp_convocacoes.regime_snapshot`), nunca do cadastro atual — ausente em oferta nova = **fail closed**.

## Depois das migrations

Regenerar `src/integrations/supabase/types.ts` (sem edição manual); atualizar apenas constantes aditivas em `src/lib/dp/convocacoes.ts` e helper de dia útil se necessário; rodar typecheck, lint, build e testes. Deno check não aplicável (nenhuma Edge Function alterada).

Se qualquer migration falhar: **PARO e diagnostico**, sem migration de conserto improvisada.

Entrega final no formato do item 28 e depois **PARO**, sem iniciar a 3B.
