
## Abordagem em 5 linhas (validar antes de codar)

1. **Rollup recursivo no banco**: uma RPC `chart_accounts_report(_company_id, _from, _to, _regime, _cost_center_ids)` faz `WITH RECURSIVE` na árvore de `chart_accounts` do usuário/contexto, agrega `transactions` pela conta contábil das `categories` vinculadas (via `categories.chart_account_id`), e devolve cada nó com `saldo_proprio`, `debitos`, `creditos` e `saldo_consolidado` (soma dos filhos) já calculado — o front só renderiza.
2. **Regime caixa vs. competência**: mesma RPC, com `CASE _regime WHEN 'caixa' THEN payment_date WHEN 'competencia' THEN COALESCE(due_date, transaction_date) END BETWEEN _from AND _to` e valor `= amount_paid` (caixa) ou `amount` (competência).
3. **Natureza / sinal DRE derivados do código raiz** (1..9) — nada hardcoded de nome; sinal e agrupamento vêm de uma tabela auxiliar `chart_accounts_root_meta(root_code, nature, dre_sign, in_dre, in_balance)` (9 linhas fixas, editáveis, não são nomes de conta). Grupo 9 tem `in_dre=false`.
4. **Reatividade**: hook `useRealtimeSync({ tables: ['chart_accounts','transactions','categories','category_companies'] })` (já existe no projeto) invalida `['contabeis-report', ...]` no React Query → refetch da RPC → árvore recalcula. Skeleton nas linhas em loading, sem optimistic para saldos.
5. **Filtros na URL + drill-down**: `<ReportFilters/>` grava querystring; clique em folha abre `<GeneralLedgerDrawer/>` com o razão (mesma RPC filtrada por `account_id`).

## Gaps do schema atual que preciso confirmar

O prompt assume tabelas `chart_of_accounts` + `journal_entries` com colunas (`nature`, `dre_sign`, `unit_id`, `cash_date`, etc.) que **não existem** hoje. O que existe:

- `chart_accounts` (sem `nature`, sem `dre_sign` — infiro pelo `code` raiz 1..9; `allow_transactions` = analítica).
- `transactions` com `transaction_date`, `due_date`, `payment_date`, `amount_paid`, `cost_center_id`, `company_id`. **Não há `unit_id`/multi-loja**.
- Vínculo com conta contábil é indireto: `transactions.category_id → categories.chart_account_id → chart_accounts.id`. Transações sem `category_id` ou com categoria sem `chart_account_id` ficarão em "**Sem conta contábil**" no relatório.

**Proposta**: NÃO criar `chart_of_accounts`/`journal_entries` novos (quebraria todo o app). Reusar o schema atual e:

- Criar `chart_accounts_root_meta` (seed com os 9 grupos: nature, dre_sign, in_dre, in_balance) — o único ponto "fixo", editável em migration.
- Criar a RPC `chart_accounts_report` e `chart_accounts_ledger` (razão).
- Trigger em `chart_accounts` para bloquear `is_active=false` só se tiver filhos ativos; DELETE já é `ON DELETE RESTRICT` no FK de categorias — ok. Se categoria referenciar, retornamos erro amigável no front oferecendo "inativar" ou "migrar categorias".
- Ignorar `unit_id/loja` (fora de escopo — não existe no app). Manter só `cost_center_id`.

## Escopo desta entrega (fase 1)

### Backend
- **Migration**:
  - `chart_accounts_root_meta(root_code text PK, nature text, dre_sign smallint, in_dre bool, in_balance bool, label text, sort_order int)` + seed dos 9 grupos (1..9). RLS: leitura para `authenticated`.
  - RPC `public.chart_accounts_report(_context context_type, _company_id uuid, _from date, _to date, _regime text default 'competencia', _cost_center_ids uuid[] default null, _include_zero bool default false)` → retorna `TABLE(id uuid, parent_id uuid, code text, name text, level int, is_analytic bool, is_active bool, root_code text, nature text, dre_sign smallint, debitos numeric, creditos numeric, saldo_proprio numeric, saldo_consolidado numeric, has_movement bool)`. `SECURITY DEFINER`, checa `is_company_member` no PJ.
  - RPC `public.chart_accounts_ledger(_context, _company_id, _account_id, _from, _to, _regime)` → extrato + saldo acumulado.
  - RPC `public.chart_accounts_balancete(...)` (saldo anterior + débitos + créditos + saldo final).

### Frontend — `src/pages/relatorios/Contabeis.tsx` com Tabs
- `<ReportFilters/>`: período (presets + custom), regime (caixa/competência), centro de custo multi-select, nível (sintético/analítico), incluir sem movimento. Estado persistido em querystring.
- `<DreReport/>`: árvore recursiva filtrada por `in_dre=true` e `root_code ≠ '9'`. Linhas calculadas (Receita Líquida, Lucro Bruto, EBITDA, Resultado Líquido) derivadas em memória a partir dos totais por `nature`. Colunas: Valor, %AV, %AH (vs. período anterior — 2ª chamada da RPC).
- `<TrialBalance/>` (Balancete): saldo anterior/débito/crédito/saldo atual, alerta se Σdébitos≠Σcréditos.
- `<BalanceSheet/>`: árvore filtrada por `in_balance=true`; alerta se Ativo≠Passivo+PL.
- `<GeneralLedgerDrawer/>`: razão de uma conta (drill-down).
- `<PendingClassificationPanel/>`: transações sem `category_id` ou cuja categoria não tem `chart_account_id`, + contas raiz `9`.
- `<AccountTreeTable/>` genérico: expand/collapse, sticky total, parênteses contábeis para negativos, badge "inativa", formatação pt-BR, cores semânticas.

### Reatividade + performance
- `useRealtimeSync({ tables: ['chart_accounts','transactions','categories'], invalidateKeyPrefixes: ['contabeis-'] })`.
- Toast discreto "Relatório recalculado" no invalidate.
- Query keys: `['contabeis-report', context, companyId, filtros]`, `staleTime: 30s`.
- Índices já existentes em `transactions(company_id, transaction_date)` cobrem o filtro; adiciono índice parcial em `categories(chart_account_id)` se ainda não existir.

### Exportação
- PDF via `jspdf` + `jspdf-autotable` (já usados no projeto, verificar) — cabeçalho com empresa, filtros aplicados, tabela hierárquica.
- CSV UTF-8 BOM + `;` (padrão do projeto).
- Log em `audit_logs` (`action='report_export'`, metadata com relatório + período).

### Fora do escopo desta fase
- Multi-loja/`unit_id` (não existe no schema).
- Gráficos avançados de composição (barras/donut/linha) — fase 2 depois de validar as tabelas.
- Perfis "Contador somente leitura" — reaproveita RBAC atual (`useCompanyPermissions`).

## Ordem de implementação
1. Migration (`chart_accounts_root_meta` + 3 RPCs).
2. `useContabeisReport` + `<AccountTreeTable/>` + `<DreReport/>` na página `/relatorios/contabeis`.
3. Balancete, Balanço, Razão, Pendências (mesma tabela base).
4. Filtros na URL + exports.
5. Realtime + toast + testes dos critérios de aceite (soma pai=filhos, grupo 9 fora da DRE, caixa vs competência).

**Confirma esta abordagem (especialmente: reusar `chart_accounts`/`categories`/`transactions` sem criar `journal_entries` novo, derivar natureza do código raiz 1..9, e deixar multi-loja fora)?**
