## Objetivo

Reconstruir o cadastro de Jornadas como uma experiência mobile-first de 4 etapas, com horário por dia da semana em tabela própria, intervalo em minutos e carga calculada automaticamente.

## Banco de dados

Nova tabela `dp_jornada_horarios` (com GRANTs + RLS espelhando `dp_jornadas`):

| campo | tipo |
|---|---|
| `id` | uuid PK |
| `company_id` | uuid (isolamento multiempresa) |
| `jornada_id` | uuid → `dp_jornadas` (on delete cascade) |
| `dia_semana` | smallint 0–6 (0 = domingo) |
| `entrada`, `saida` | time |
| `intervalo_minutos` | int default 60 |
| `termina_no_dia_seguinte` | boolean default false |
| `carga_horas` | numeric (gerada pelo trigger) |
| `ativo` | boolean default true |
| `created_at`, `updated_at` | timestamptz |

- Único por (`jornada_id`, `dia_semana`).
- Trigger de validação: entrada e saída obrigatórias, entrada ≠ saída, intervalo menor que a duração, carga positiva, dia presente em `dias_trabalho`. **Sem** regra "saída > entrada" — a virada de meia-noite usa `termina_no_dia_seguinte`.
- Trigger recalcula `carga_horas` e atualiza `carga_horaria_semanal` da jornada pai.
- `dp_jornadas` ganha `descricao text`; `carga_horaria_diaria/semanal` viram somente leitura (calculadas).
- **Migração de dados**: para cada jornada existente, gera um registro por dia em `dias_trabalho` com o horário atual e intervalo derivado de `intervalo_inicio/fim` (padrão 60 min). Colunas antigas permanecem como legado, sem uso na UI.
- Validação de menor passa a ser dia a dia (nenhum dia pode terminar após 22:00) na função existente.

## Domínio e testes

`src/lib/dp/jornada-utils.ts`: `calcularCargaDia()`, `calcularCargaSemanal()`, `resumoJornada()` (agrupa dias contíguos: "Seg–Sex 08:00–17:00 · Sáb 08:00–14:00 · Dom folga"), `duplicarHorario()`, `horarioDaData()`, `LIMITE_SEMANAL = 44`.
Testes em `src/lib/dp/__tests__/jornada-utils.test.ts` cobrindo virada de meia-noite, intervalos, agrupamento e limite semanal.

## Componentes novos

- `src/components/dp/JornadaTemplates.tsx` — cartões grandes de modelo: 6x1 Manhã, 6x1 Tarde, 6x1 Noite, 5x2 Administrativo, 12x36, Delivery, Personalizada (com os horários especificados; Noite marca `termina_no_dia_seguinte`).
- `src/components/dp/JornadaCard.tsx` — card de um dia: checkbox do dia, entrada, saída, seletor rápido de intervalo (15/30/45/60/90/120/Outro), carga calculada e menu `⋮` com "Duplicar horários → Todos os dias / Dias úteis / Fim de semana / Selecionar dias". Dia desmarcado mostra apenas "Folga".
- `src/components/dp/HorariosSemanaEditor.tsx` — pilha de cards + barra fixa no topo com carga semanal e selo "Dentro do limite legal" / "Acima de 44 horas". Novo dia marcado herda o horário do primeiro dia já configurado.

## Fluxo de 4 etapas

`DpCadastroJornadas.tsx` passa a abrir um fluxo em passos (dialog full-screen no mobile, modal no desktop):
1. Escolha do modelo → preenche tudo.
2. Informações: nome, descrição, tipo, turno, ativa.
3. Semana de trabalho (editor de cards) — tela principal.
4. Botão grande "Salvar jornada" + Cancelar.

Salvamento em transação lógica: upsert da jornada + substituição dos horários do dia.

## Lista de jornadas

Cards reescritos: nome, `44h semanais`, resumo por faixa de dias, turno e status. Sem campos técnicos (escala crua, dias em números, intervalo início/fim).

## Cadastro do colaborador

`ColaboradorJornadaDialog.tsx`: removidos os overrides de entrada/saída/intervalo. Restam jornada, folga fixa semanal e observações, com nota de que horários diferentes exigem nova jornada. Overrides existentes são preservados nas observações pela migração.

## Mobile

Sem tabelas nem grids largos: uma coluna, campos com altura ≥ 44px, botões grandes, tipografia legível, tokens semânticos do design system (laranja/marinho 360°FOOD).

## Modelos padrão

Semeados como opções no seletor de modelo (não como registros na tabela), evitando poluir a lista de jornadas de cada empresa.
