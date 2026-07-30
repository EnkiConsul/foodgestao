## Objetivo

Trocar o modelo canônico dos tipos de movimentação de `receita / despesa / transferencia / parcelado` para **`entrada / saida / transferencia / parcelamento`**, no banco e em todo o código, sem perder dados nem alterar saldos.

Decisões aprovadas:
- Renomear os valores do enum no banco (não é só visual).
- `parcelado` → `parcelamento`.
- Status financeiros permanecem como estão ("A pagar", "A receber", "Pago").

## O que NÃO muda (importante)

O texto "receita"/"despesa" também aparece em domínios diferentes que **não** fazem parte desta padronização e serão preservados:
- `categories.category_subtype` (receita, saida, custo, despesa, imposto, investimento) — classificação contábil de categoria.
- `chart_accounts_root_meta.nature` (receita, despesa_operacional, despesa_financeira…) — natureza contábil do plano de contas e do DRE.
- Rubricas e despesas do módulo DP/Folha, que apenas geram lançamentos.

Ou seja: renomeamos somente o enum `transaction_type` e tudo que o consome.

## Etapa 1 — Banco de dados (uma migração)

1. `ALTER TYPE public.transaction_type RENAME VALUE 'receita' TO 'entrada'`, `'despesa' TO 'saida'`, `'parcelado' TO 'parcelamento'`. Isso preserva 100% das linhas existentes, sem UPDATE em dados (nenhum risco de duplicidade ou drift de saldo).
2. Ajustar o `DEFAULT` da coluna `categories.transaction_type` (hoje `'despesa'`) para `'saida'`.
3. Recriar as funções/triggers que comparam com os textos antigos. Levantamento já feito — 16 objetos relevantes ao enum:
   `apply_tx_balance`, `recompute_account_balance`, `get_balance_before`, `adjust_account_balance`, `report_balance_drift`, `auto_promote_open_finance_raw`, `promote_open_finance_transactions`, `pluggy_confirm_staging`, `categorize_transactions_batch`, `pay_credit_card_invoice`, `recalc_credit_card_invoice_totals`, `dp_folha_gerar_despesa`, `dp_folha_desfazer_despesa`, `plin_ia_summary`, `plin_ia_cashflow`, `chart_accounts_report` / `chart_accounts_ledger` / `chart_accounts_pending_classification` / `dre_*` (nestas últimas, trocar só as comparações com `transaction_type`, mantendo `nature`).
   As funções de teste (`_test_balance_engine`, `_test_delete_account_authz`, `_e2e_*`) também são atualizadas.
4. Trocar o CHECK `categorization_rules_transaction_type_check` para aceitar `('entrada','saida')`.
5. Revisar `import_rules.transaction_type` e `category_templates.transaction_type` (mesmo enum, renomeiam automaticamente).

Após a migração, os tipos TypeScript do backend são regerados automaticamente.

## Etapa 2 — Frontend e libs

Substituição dos literais e tipos em todos os arquivos já mapeados (33), com destaque:
- Núcleo financeiro: `src/lib/transactions/balance.ts`, `src/lib/transaction-sign.ts`, `src/lib/transactions/installments.ts`, `src/hooks/useCashFlowProjection.tsx`.
- Telas: `Lancamentos.tsx`, `FluxoCaixa.tsx`, `Dashboard.tsx`, `Orcamento.tsx`, `Categorias.tsx`, `ConciliacaoPluggy.tsx`, `Faturas`/cartões.
- Componentes: `lancamentos/*` (types, Row, Card, SummaryCards, Sidebar), `transactions/TransactionFormDialog.tsx`, `transactions/ImportStatementDialog.tsx`, `categories/CategoryFormDialog.tsx`, `bills/PaymentDialog.tsx`, `budgets/BudgetFormDialog.tsx`, `layout/NotificationsBell.tsx`.
- Importação de extrato: `src/lib/statement-import/*` (parser Nubank, suggest, types).
- Validações Zod em `src/lib/validations.ts` (`transactionSchema`, `categorySchema` — este último mantém o subtipo intacto).
- Edge functions que montam contexto de IA: `supabase/functions/_shared/plin-ia-context.ts`, `ai-financial-agent`, `of-ai-suggest`.

## Etapa 3 — Rótulos visuais

Fonte única de rótulo/estilo por tipo (estendendo `src/lib/categories/display.ts` ou um novo `src/lib/transactions/labels.ts`):
- `entrada` → "Entrada" (verde), `saida` → "Saída" (vermelho), `transferencia` → "Transferência" (neutro), `parcelamento` → "Parcelamento".
- Telas passam a consumir esse helper em vez de strings soltas, eliminando "Crédito/Débito/Receita/Despesa" da interface de lançamentos.
- Nomes de menu ("Contas à Pagar/Receber") e status ("Pago", "A vencer") ficam como estão, conforme decidido.

## Etapa 4 — Testes e verificação

- Atualizar os testes existentes: `balance.test.ts`, `installments.test.ts`, `nubankParser.test.ts`, `suggest.test.ts`, `categoryDisplay.test.ts`, `CategoryTypeBadge.test.tsx`, RLS/tenancy tests.
- Rodar a suíte de testes e o typecheck estrito (`tsconfig.strict.json`).
- Conferência de saldos antes/depois: comparar `accounts.current_balance` e a saída de `report_balance_drift` antes e depois da migração — devem ser idênticos.
- Verificação em navegador nas telas de Lançamentos, Fluxo de Caixa, Conciliação e Cartões.

## Detalhes técnicos

- `ALTER TYPE ... RENAME VALUE` é transacional e não reescreve tabelas; índices (ex.: `idx_categories_user_type`) continuam válidos.
- Como não haverá camada de compatibilidade, as edge functions que gravam `transaction_type` (Pluggy, IA, folha) são atualizadas na mesma entrega para evitar erro de valor inválido do enum.
- Nenhuma alteração em nomes de colunas, portanto não há impacto em RLS, grants ou realtime.
