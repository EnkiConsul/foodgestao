# Gestão de Cartão de Crédito — Plano de Implementação

Baseado no documento técnico fornecido. Reaproveita `accounts`, `installments.ts`, `transactions` e o motor de regime caixa/competência já existentes.

## Princípio norteador
- **Compra no cartão** → despesa por **competência** (data da compra, categoria da compra).
- **Pagamento da fatura** → saída de **caixa** (data do vencimento, conta corrente). Nunca conta como despesa nova.
- **Juros do rotativo** → lançamento próprio em *Despesas Financeiras*, nunca somado à compra original.
- Cartão é **passivo**, não é conta bancária: fica fora do saldo consolidado de caixa.

## Fase 1 — Schema + lógica pura de ciclo (1 semana)
**Migration**
- `credit_cards` (1:1 com `accounts`): `brand`, `last4`, `credit_limit`, `closing_day`, `due_day`, `default_payment_account_id`, `autopay`, `interest_rate_monthly`, `minimum_payment_percent`, `is_corporate`, `employee_id`, `cost_center_id`, `monthly_spend_policy`.
- Enum `invoice_cycle_status` (`aberta|fechada|paga|parcial|atrasada`).
- `credit_card_invoices` com `UNIQUE (credit_card_id, reference_month)`, totais materializados (compras, parcelas, juros, tarifas, créditos, `previous_balance`, `paid_amount`, `minimum_amount`), `provider_invoice_id` para idempotência.
- `transactions.credit_card_invoice_id` + `is_invoice_payment boolean`.
- GRANTs + RLS via `private.is_company_member` / `member_can_edit` (padrão já auditado por `security-lint`).
- Função `private.resolve_cycle_date(year, month, day)` com `LEAST(day, days_in_month)`.

**`src/lib/credit-card/cycle.ts` + testes** — lógica pura:
- Resolução closing/due com meses de 28/30/31.
- Alocação compra → fatura (caso `due_day <= closing_day` → vence no mês seguinte).
- Casos de borda: fevereiro com dia 31, virada de ano, compra no próprio dia do fechamento.

## Fase 2 — Alocação automática (1 semana)
- RPC `assign_transaction_to_invoice(_transaction_id)` (SECURITY DEFINER, `REVOKE FROM anon`) fazendo UPSERT da fatura e recalculando totais.
- Trigger `AFTER INSERT OR UPDATE OF transaction_date, amount, account_id` em `transactions` quando `account_type='cartao_credito'`.
- Parcelamento continua usando `installments.ts` sem mudança — cada filha cai na fatura correspondente à sua `transaction_date`. Âncora `parent` permanece como registro de competência.

## Fase 3 — Fechamento automático (1 semana)
- Edge function `close-credit-card-invoices` (verify_jwt=false + `CLOSE_INVOICES_SECRET`, no padrão de `expire-trials`).
- Cron diário via `pg_cron` + `pg_net`.
- Materializa totais, muda status para `fechada`, calcula `minimum_amount`, cria conta a pagar (`is_invoice_payment=true`, `due_date=invoice.due_date`, conta = `default_payment_account_id`), abre próxima fatura, enfileira notificação via `process-email-queue`.

## Fase 4 — Pagamento e rotativo (1 semana)
- Pagamento total → fatura `paga`, transação quitada.
- Pagamento parcial ≥ mínimo → `parcial`, saldo vira `previous_balance` da próxima; gera lançamento de juros em *Despesas Financeiras*.
- Pagamento < mínimo → `atrasada`, gera juros + multa + IOF, cada um em rubrica própria.

## Fase 5 — Caixa × competência (1 semana, mais crítica)
- `src/lib/transactions/balance.ts`: `signedEffect` e `computePeriodTotals` recebem parâmetro de regime.
  - Caixa: compra no cartão neutra; pagamento da fatura afeta.
  - Competência: compra afeta; pagamento neutro.
- Excluir `account_type='cartao_credito'` do saldo consolidado; bloco separado "Cartões — a pagar".
- Projeção do fluxo de caixa inclui faturas fechadas + estimativa da aberta.
- **Teste de regressão obrigatório**: DRE por competência não muda ao pagar fatura.

## Fase 6 — Frontend (2 semanas)
- `/cartoes`: cards com limite, disponível, barra de comprometimento, fechamento/vencimento.
- `/cartoes/:id`: timeline de faturas + detalhe (lançamentos agrupados por categoria, parcelas `3/12`, botões *Pagar total / parcial*).
- Widget "Faturas a vencer" no Dashboard; faturas distintas na projeção de fluxo de caixa.
- Reaproveita `TransactionFormDialog` (só adiciona seleção de cartão) e `ImportStatementDialog`.

## Fase 7 — Open Finance (1 semana)
- Estender `pluggy-sync-connection`: `account.type='CREDIT'` cria `accounts` + `credit_cards` automaticamente.
- Ler `creditData`: `creditLimit`, `availableCreditLimit`, `balanceCloseDate`, `balanceDueDate`, `minimumPayment`.
- Transações de cartão alocadas via trigger; `provider_invoice_id` garante idempotência.

## Fase 8 — Tools do agente IA (3 dias)
- `plin_ia_credit_cards`, `plin_ia_invoice_current`, `plin_ia_invoice_upcoming`, `plin_ia_installments_future` — RPCs read-only no padrão já estabelecido.

## Cálculo de limite disponível
```
disponível = credit_limit
           − Σ faturas fechadas/parciais/atrasadas não quitadas
           − Σ compras da fatura aberta
           − Σ parcelas futuras já contratadas
```

## Critérios de aceite
- Compra 12x distribui uma parcela por fatura, centavos residuais na última.
- DRE por competência estável ao pagar fatura.
- Saldo consolidado de caixa não inclui limite de cartão.
- Fluxo de caixa projetado inclui faturas fechadas na data de vencimento.
- Limite disponível desconta parcelas futuras.
- Juros em *Despesas Financeiras*, não na categoria da compra.
- Fatura de fevereiro com fechamento dia 31 fecha em 28/29.
- `typecheck:strict` e `security-lint` verdes; cobertura em `src/lib/credit-card/**`.

## Riscos mitigados
- Dupla contagem → flag `is_invoice_payment` + teste de regressão DRE.
- Datas de ciclo em meses irregulares → `resolve_cycle_date` + testes de borda.
- `due_day < closing_day` → caso explícito nos testes.
- Cartão inflando caixa → excluído do consolidado.
- Import duplicado → `provider_invoice_id` + `import_hash` existente.
- Retroatividade em `closing_day` → bloquear edição com faturas fechadas.

## Ordem se houver corte de escopo
1. Fases 1–3 (cartão utilizável)
2. Fase 5 (**não cortar** — números errados são pior que ausência da feature)
3. Fase 4
4. Fases 6–8

## Proposta de execução
Começar pela **Fase 1** de forma completa: migration + `src/lib/credit-card/cycle.ts` com bateria de testes cobrindo todos os casos de borda de calendário. É a fundação testável de todo o resto e não afeta nada em produção. Confirmar antes de gerar a migration.
