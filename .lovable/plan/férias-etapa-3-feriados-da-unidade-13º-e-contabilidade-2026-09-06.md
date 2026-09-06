# Férias — Etapa 3: feriados da unidade, 13º e contabilidade

Continuação do roteiro de Férias. Etapas 1 (direito, faltas e alertas) e 2 (solicitação, aprovação, cancelamento e aviso) já estão no ar. Nenhum valor de pagamento é calculado ou exibido em nenhum ponto.

## 1. Feriados por unidade

- Nova aba **Feriados** no cadastro da Unidade, ao lado de Dados, Setores, Funcionamento e Sindicato. Cada unidade tem o seu calendário; nunca cruza empresa nem unidade.
- Três formas de cadastrar:
  - **Data específica** (ex.: 20/11/2027, só naquele ano);
  - **Data fixa todo ano** (ex.: 25/12);
  - **Data relativa** (ex.: primeiro domingo de outubro; também "último domingo" do mês).
- Cada feriado tem nome, tipo, liga/desliga e observação opcional.
- Visão por ano ("Feriados 2027") com todos os dias já resolvidos, inclusive os das regras relativas, ordenados por data.
- Atalho para incluir de uma vez os feriados nacionais fixos, para a unidade não começar vazia; o gestor ajusta depois.
- Feriado e período bloqueado para férias seguem separados: um é data legal, o outro é decisão da empresa.

## 2. Início de férias na véspera

- Com o calendário da unidade disponível, programar férias com início nos dois dias que antecedem feriado ou descanso semanal passa a ser recusado, com explicação simples na tela.

## 3. Adiantamento da 1ª parcela do 13º

- Nas Regras de Férias, escolha do padrão da empresa: **não oferecer**, **conforme a regra legal** ou **em qualquer época conforme política interna**, com o aviso de que a contabilidade valida e processa.
- Exceção por unidade, quando a unidade tiver política diferente.
- Quando não estiver disponível, o campo simplesmente não aparece no pedido do colaborador.

## 4. Fluxo para a contabilidade

- Cada férias aprovada passa por: **aprovada → a informar → informada**.
- Botão **Informar à contabilidade** gera o resumo (pessoa, CPF mascarado, unidade, período aquisitivo, datas, dias, abono, adiantamento do 13º, observação) para copiar ou baixar, e registra quem informou e quando.
- Nova aba/painel com a fila do que falta informar, com filtro por unidade e mês.
- Sem valores, sem integração externa.

## Detalhes técnicos

- Migração:
  - `dp_unidade_feriados` (`company_id`, `unidade_id`, `nome`, `tipo` CHECK `especifica|anual|relativa`, `data`, `dia`, `mes`, `ordinal` smallint (1..5 e -1 para último), `dia_semana` smallint, `ativo`, `observacao`, timestamps + trigger de `updated_at`), com GRANTs (`authenticated`, `service_role`), RLS e políticas via `private.is_company_member` / `is_company_admin_or_owner`; trigger de coerência por tipo (fail closed, `FERIADO_CAMPOS_INVALIDOS`) e de unidade pertencente à empresa.
  - `dp_config_dp`: `ferias_adiantamento_13` já existe no nível empresa; passa a aceitar linha por `unidade_id` (override), lido pela `dp_ferias_config`.
  - `dp_ferias_gozos`: usar `contabilidade_status` (`aprovada|a_informar|informada`) já existente + `informado_em`/`informado_por`.
  - Funções: `dp_feriados_resolver(_unidade_id, _inicio, _fim)` (STABLE, expande anual e relativa em datas), `dp_ferias_marcar_informado(_gozo_id)`, e `dp_ferias_validar_programacao` passa a checar véspera de feriado/DSR com o novo código `FERIAS_INICIO_VESPERA`.
- Frontend:
  - `src/lib/dp/feriados.ts` — helpers puros: resolver data relativa (n-ésimo/último dia da semana do mês), ordenação, rótulos de tipo, lista de feriados nacionais fixos; testes em `src/lib/dp/__tests__/feriados.test.ts`.
  - `src/hooks/useDpFeriados.tsx` — CRUD + resolução por ano via RPC.
  - `src/components/dp/unidades/UnidadeFeriadosPanel.tsx` + diálogo de cadastro; aba nova em `DpUnidades.tsx`.
  - `src/components/dp/ferias/FeriasContabilidadePanel.tsx` e `FeriasResumoContabilidadeDialog.tsx`; aba em `DpFeriasHub.tsx`.
  - `FeriasConfigCard` ganha o adiantamento do 13º por unidade; `ferias-direito.ts` recebe o texto de `FERIAS_INICIO_VESPERA`.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/lib/dp`.
