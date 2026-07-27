# Plano Final — Motor de Jornadas, Escalas e Folgas (DP 360°FOOD)

Consolida a auditoria realizada e todas as decisões tomadas na conversa: periodicidade de folga dominical configurável com default por setor, **sem upload obrigatório de CCT**, blindagem jurídica por alerta + checkbox de ciência + auditoria imutável.

## Diagnóstico (o que foi confirmado no código e no banco)

- O DP **não tem motor de jornadas nem de escalas**. O que existe é auto-marcação de folgas de fim de semana portada de um cliente específico — o próprio arquivo declara: "porta do Pakere para 360°FOOD" (`src/lib/dp/folga-rules.ts:1`).
- A regra central é fixa em SQL: **1 folga de fim de semana por mês** (`dp_folgas_validar_self`, `IF v_mensais >= 1 THEN RAISE EXCEPTION`). Nenhuma tabela parametriza esse número.
- **Não existe** tabela de jornada, escala, carga horária, horário de entrada/saída, intervalo, ponto ou banco de horas.
- A alternância sábado/domingo, descrita como regra do negócio, **nunca foi implementada**.
- `data_nascimento` serve **apenas** para aniversário (`dp_gerar_prioridades_aniversario`). **Zero validação etária.**
- `dp_folha_gerar_lancamentos` calcula por salário-base e **nunca consulta `dp_folgas`**.
- Não há histórico de alteração de regra — só `updated_at`.
- Configurável hoje: bloqueio de datas (`dp_bloqueio_regras`, `dp_datas_bloqueadas`), limite de folgas por dia (`dp_dia_config`), prioridade de aniversariantes, dia fixo semanal (`folga_fixa_semana`).

**Risco jurídico da regra atual:** 1 domingo/mês (≈4 semanas) é menos protetivo que o padrão de comércio (3 semanas) e que a regra quinzenal feminina do Art. 386 CLT. O DSR é direito irrenunciável — a escolha do colaborador não afasta a autuação.

**Bug crítico ativo** (confirmado em `pg_trigger`): `dp_folgas` tem **duas** triggers BEFORE INSERT concorrentes, `dp_folgas_validar` e `trg_dp_folgas_validar_self`. Consequências: (a) data liberada pelo admin continua bloqueada, porque `dp_validar_folga_insert` filtra só `liberada_por_solicitacao IS NULL` e ignora a coluna `liberada`; (b) o teto de 1 folga/mês é aplicado também ao sorteio e ao admin, pois `dp_folgas_validar_self` não discrimina `NEW.origem`.

## Matriz de gap por escala

| Escala | Hoje | Correto | Status | Risco |
|---|---|---|---|---|
| 6x1 | inexistente | DSR 24h/sem; domingo 1x/3 sem. (comércio) | Não existe | **Alto** |
| 5x2 | inexistente | DSR + 2º dia por contrato/CCT | Não existe | Médio |
| 5x1 / 4x2 | inexistente | ciclo tensiona o DSR a cada 7 dias | Não existe | **Alto** |
| 12x36 | inexistente | Art. 59-A: DSR embutido | Não existe | Médio |
| Intermitente | inexistente | Art. 452-A | Não existe | Médio |
| Mulher (comércio) | inexistente | Art. 386: domingo quinzenal | Não existe | **Alto** |
| Menor de 18 | inexistente | CF 7º XXXIII, CLT 403/404/405/411-413 | Não existe | **Alto** |

## Fase 0 — Bugfix (isolado, antes de qualquer outra codificação)

Uma única trigger BEFORE INSERT em `dp_folgas`, com função unificada que:
1. respeita `liberada` **e** `liberada_por_solicitacao` em `dp_datas_bloqueadas`;
2. aplica o teto mensal **somente** à auto-marcação do colaborador (`origem` = solicitação/autoatendimento), liberando sorteio e admin;
3. lê o teto de `dp_config_dp` em vez da constante fixa.

Testes unitários cobrindo os três caminhos antes de seguir.

## Fase 1 — Base flexível

**`dp_config_dp`** (uma linha por empresa):
- `periodicidade_domingo` (semanas) — **default 3** para segmento alimentação/comércio, **7** para os demais
- `periodicidade_domingo_mulher` (semanas, default 2) — exibido só quando há colaboradoras cadastradas
- `folgas_fds_por_mes` (default 1) — extrai a constante hoje fixa no SQL
- `politica_sabado` (trabalha / folga / alterna / especifica)
- `politica_feriado` (compensa / dobro)
- `regra_dsr` (clt / cct / propria)
- `exige_validacao_menor` (default true)

Backfill: toda empresa existente recebe uma linha com `folgas_fds_por_mes = 1`. Comportamento atual 100% preservado; nenhum registro de `dp_folgas` é tocado.

**`dp_jornadas`** (modelos de turno por empresa): `nome`, `tipo_escala` (6x1 / 5x2 / 5x1 / 4x2 / 12x36 / intermitente / personalizada), `carga_horaria_diaria`, `carga_horaria_semanal`, `turno`, `horario_entrada`, `horario_saida`, `intervalo_inicio`, `intervalo_fim`, `permite_intervalo_fracionado`, `dias_trabalho[]`, `dias_folga[]`, `ativo`.
Ajuste ao food service: a jornada é um **modelo reutilizável de turno** (abertura, almoço, jantar, fechamento), nunca um horário único por empresa.

**`dp_colaborador_jornadas`**: vínculo com vigência (`inicio`/`fim`), preservando histórico, com overrides individuais de horário, intervalo e dia fixo de folga (ex.: "fulano folga sempre na terça, mesmo em 6x1").

**`dp_regras_historico`** (auditoria imutável): `company_id`, `usuario_id`, `tabela`, `registro_id`, `valor_antigo` (jsonb), `valor_novo` (jsonb), `justificativa` (opcional), `ciencia_confirmada` (bool), `created_at`. RLS permite apenas INSERT e SELECT — sem UPDATE nem DELETE.

**Validação de menores** (trigger SQL + bloqueio na UI, a partir de `data_nascimento`):
- turno cruzando 22h–5h para < 18 anos → bloqueio
- < 16 anos sem flag `aprendiz` → bloqueio
- cargo insalubre/perigoso para < 18 anos → bloqueio
- intervalo reduzido/fracionado desabilitado para < 18, mesmo com a opção ligada na empresa
- carga máxima 6h/dia (aprendiz sem fundamental) ou 8h/dia (com fundamental)
- hora extra/prorrogação para menor exige confirmação explícita, gravada em `dp_regras_historico`

Colunas novas: `dp_cargos.insalubre_periculoso`, `dp_colaboradores.aprendiz`.

Todas as tabelas novas seguem o padrão do projeto: `company_id`, GRANTs explícitos, RLS multi-tenant, `updated_at` com trigger.

## Fase 2 — Configurações, alerta de ciência e cobertura

**Tela `/dp/configuracoes/jornadas`** — periodicidade de domingo (livre: semanas, meses ou "nunca"), periodicidade feminina, política de sábado, feriados, teto de folgas de fim de semana. Tooltip: *"configurações abaixo do padrão legal exigem confirmação de ciência"*.

**Modal de ciência — dispara só quando menos protetivo:**

> A periodicidade configurada (X semanas) é inferior ao padrão legal de Y semanas para o setor desta empresa. A legislação (Lei 10.101/2000 e Art. 386 CLT) exige folgas dominicais mais frequentes. Deseja continuar?

Checkbox obrigatório — *"Declaro que estou ciente da legislação e assumo a responsabilidade por esta configuração"* — mais botão "Confirmar mesmo assim" e justificativa opcional. **Nenhum anexo é exigido e o salvamento nunca é travado por falta de documento.** Configuração mais protetiva (ex.: 2 semanas) salva direto, sem alerta. Grava `ciencia_confirmada = TRUE` com usuário, timestamp e JSON antes/depois.

**Tela `/dp/cadastros/jornadas`** — CRUD dos modelos + aba "Jornada e vínculo" no cadastro do colaborador, com histórico de vigências e overrides.

**`dp_cobertura_minima`** — (unidade, cargo, dia_semana, turno, mínimo). Hoje `dp_unidade_cargos` só associa cargo↔unidade, sem quantidade.

**Relatório de conformidade** — domingos trabalhados vs. folgados por colaborador no mês, em vermelho quem está fora da periodicidade configurada, coluna própria para a regra quinzenal feminina, exportável em CSV no padrão do DP.

## Fase 3 — Automação

Gerador de escala: jornada vigente → precedência **override individual > acordo/CCT > setor > empresa > CLT** → excluir feriados, férias (`dp_ferias_gozos`), afastamentos e bloqueios (reaproveita `dp_regra_bloqueia_data`) → validar cobertura mínima → sugestão → validador de conformidade (DSR 24h, periodicidade de domingos, regra do menor, intervalos) → aprovação do gestor → publicação → auditoria. Alertas antes de publicar. Dashboard de conformidade para o RH.

## Fase 4 — Inteligência (médio prazo)

Simulação what-if antes de publicar e escala assistida por IA (Lovable AI/Gemini) usando vendas previstas, histórico de movimento, feriados e eventos, buscando cobertura mínima com o menor número de horas extras.

## Fora de escopo (recomendação)

**Ponto eletrônico e banco de horas** não existem no sistema (`possui_folha_ponto` é só um flag documental) e as folgas não afetam a folha. REP-P exige conformidade com a Portaria MTP 671/2021 (AFD, espelho, guarda) — recomendo projeto separado ou integração com provedor externo. O descolamento folgas↔folha fica documentado como gap conhecido.

## Duas notas jurídicas

1. A **Portaria 417/1966 está revogada** (Portaria MTP 671/2021). A referência de "1 domingo a cada 7 semanas" será documentada como jurisprudência/prática consolidada, não como norma vigente — o default de 7 semanas permanece como definido.
2. O Art. 386 (quinzenal para mulheres) será tratado como **alerta destacado**, não bloqueio, respeitando a autonomia do gestor.

## Sequência de entrega

Fase 0 (bugfix + testes) → migration da Fase 1 → UI da Fase 1 → Fase 2 → Fase 3 → Fase 4. Cada fase entrega a migration SQL concreta antes do frontend correspondente.
