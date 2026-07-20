# Fase 9.2 — Cartão de Crédito como entidade própria (versão endurecida)

## Diagnóstico
Hoje `credit_cards.account_id` é NOT NULL e cada cartão exige uma linha em `accounts` (`account_type='cartao_credito'`), porque `transactions.account_id` é NOT NULL e a trigger `tg_transactions_assign_cc_invoice` identifica compras pelo `accounts.account_type`. Isso obriga o usuário a criar uma "conta bancária" que existe só por razões técnicas.

## Nova arquitetura
Todo `transaction` passa a ter uma origem: **conta bancária OU cartão de crédito**, nunca ambos.

```
transactions.account_id       NULL-able
transactions.credit_card_id   nova coluna, FK -> credit_cards
CHECK: (account_id IS NULL) <> (credit_card_id IS NULL)
credit_cards.account_id       removido
```

- Compras no cartão → `credit_card_id=X, account_id=NULL`.
- Pagamento da fatura → `account_id=<conta bancária>, is_invoice_payment=true, credit_card_invoice_id=<fatura>`.

---

## Migração SQL (única, transacional)

Ordem, tudo em uma migração:

1. `ALTER TABLE transactions ADD COLUMN credit_card_id uuid REFERENCES credit_cards(id) ON DELETE RESTRICT`.
2. **Backfill**:
   ```sql
   UPDATE transactions t
   SET credit_card_id = c.id, account_id = NULL
   FROM credit_cards c
   WHERE t.account_id = c.account_id
     AND t.is_invoice_payment = false;
   ```
3. `ALTER TABLE transactions ALTER COLUMN account_id DROP NOT NULL`.
4. `ALTER TABLE transactions ADD CONSTRAINT transactions_source_xor CHECK ((account_id IS NULL) <> (credit_card_id IS NULL))`.
5. Reescrever `assign_transaction_to_invoice(uuid)` e `tg_transactions_assign_cc_invoice` para usar `NEW.credit_card_id` (nunca mais consultar `accounts.account_type`). Ajustar o `OF ...` do trigger para incluir `credit_card_id` e remover `account_id`.
6. **RLS**: adicionar policies paralelas em `transactions` que autorizam via `credit_card_id`:
   ```sql
   CREATE POLICY "select via credit card" ON transactions
     FOR SELECT USING (
       credit_card_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM credit_cards c
         WHERE c.id = transactions.credit_card_id
           AND (c.user_id = auth.uid()
                OR (c.context='pj' AND c.company_id IN (SELECT company_id FROM company_members WHERE user_id=auth.uid())))
       )
     );
   ```
   Mesma lógica para `INSERT` (`WITH CHECK`), `UPDATE`, `DELETE`.
7. **Só depois de tudo acima** — `DELETE FROM accounts WHERE account_type='cartao_credito'` e `ALTER TABLE credit_cards DROP COLUMN account_id`.
8. Enum `account_type`: **manter** o valor `cartao_credito` (não removo — evita quebra de tipos gerados). O `AccountFormDialog` deixa de expô-lo no seletor.

Guardas dentro da migração:
- Antes do passo 7, `ASSERT` que não sobrou nenhuma `transactions.account_id` apontando para conta de cartão:
  ```sql
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.account_type='cartao_credito'
    ) THEN
      RAISE EXCEPTION 'Backfill incompleto: transações ainda apontam para conta-cartão';
    END IF;
  END $$;
  ```

## Mitigação concreta dos riscos apontados

### 1. Regressão em relatórios (JOIN accounts perde linhas de cartão)
- Criar **view `public.transaction_sources`** que unifica a origem para todos os consumidores:
  ```sql
  CREATE OR REPLACE VIEW public.transaction_sources AS
  SELECT t.id AS transaction_id,
         COALESCE(a.id, c.id) AS source_id,
         CASE WHEN a.id IS NOT NULL THEN 'account' ELSE 'credit_card' END AS source_kind,
         COALESCE(a.name, TRIM(COALESCE(c.brand,'') || ' ••••' || COALESCE(c.last4,'----'))) AS source_name,
         COALESCE(a.color, '#EB6119') AS source_color,
         COALESCE(a.bank_slug, LOWER(c.issuer)) AS source_slug
  FROM transactions t
  LEFT JOIN accounts a       ON a.id = t.account_id
  LEFT JOIN credit_cards c   ON c.id = t.credit_card_id;
  ```
  `GRANT SELECT` para `authenticated`. Views herdam RLS das tabelas base.
- No frontend, criar helper `getTransactionSourceLabel(tx, accounts, cards)` em `src/lib/transactions/source.ts`, usado por `Lancamentos`, `FluxoCaixa`, `Relatorios`, `ImportStatementDialog`.
- Auditar os arquivos listados no plano anterior e substituir `JOIN accounts` por leitura via helper/view. Onde a consulta hoje é `.select('*, accounts(name)')`, passar a `.select('*, accounts(name), credit_cards(brand,last4,issuer)')` e resolver pelo helper.

### 2. RLS — usuário precisa ver compras de cartão
- Adicionar as 4 policies paralelas listadas no passo 6 acima. **Não** remover as policies antigas baseadas em `account_id` — elas continuam válidas para lançamentos de conta.
- Teste de verificação (executado após migração):
  1. Autenticar como usuário dono de um cartão.
  2. `SELECT count(*) FROM transactions WHERE credit_card_id = <card>` → deve retornar >0.
  3. Autenticar como outro usuário → deve retornar 0.
  Marco como UNVERIFIED se não conseguir executar sessão autenticada.

### 3. Migração irreversível
- **Snapshot antes de rodar** via `pg_dump` gerenciado (usuário aciona "Export data" no Cloud → Advanced settings) — instrução incluída no aviso da migração.
- **Rollback script empacotado** como comentário no fim da migração:
  ```sql
  -- ROLLBACK MANUAL (não executar automaticamente):
  -- 1. ALTER TABLE credit_cards ADD COLUMN account_id uuid REFERENCES accounts(id);
  -- 2. Recriar contas 'cartao_credito' (nome derivado do cartão), popular credit_cards.account_id.
  -- 3. UPDATE transactions t SET account_id = c.account_id, credit_card_id = NULL
  --      FROM credit_cards c WHERE t.credit_card_id = c.id;
  -- 4. Restaurar triggers antigas; DROP CHECK transactions_source_xor; ALTER COLUMN account_id SET NOT NULL.
  ```
- Passo 7 (DELETE das contas + DROP COLUMN) fica atrás da guarda `ASSERT` do passo anterior; se algo estiver inconsistente, a migração aborta antes de destruir dados.

### 4. Enum `account_type`
- **Manter** o valor `cartao_credito` no enum — evita `ALTER TYPE ... RENAME` e o refactor de tipos gerados.
- Onde o app hoje oferece o tipo:
  - `AccountFormDialog.tsx`: remover `"cartao_credito"` da lista de opções renderizadas (mantém no tipo TS).
  - `ContasBancarias.tsx`: filtrar `account_type !== 'cartao_credito'` na listagem.
- Adicionar comentário SQL no enum:
  ```sql
  COMMENT ON TYPE public.account_type IS
    'Valor "cartao_credito" está deprecated: cartões vivem em public.credit_cards. Mantido apenas por compatibilidade histórica.';
  ```

## Ordem de execução
1. Migração única com passos 1–8 acima.
2. Após aprovação, regenerar types.
3. Ajustar código:
   - `CreditCardFormDialog.tsx` — remover seletor de conta e criação da carteira.
   - `TransactionFormDialog.tsx` + `useTransactionFormLookups.ts` — buscar `credit_cards` e gravar em `credit_card_id`; contas bancárias gravam em `account_id`.
   - `PayInvoiceDialog.tsx` — inalterado (usa `account_id` do banco pagador).
   - `AccountFormDialog.tsx` / `ContasBancarias.tsx` — ocultar `cartao_credito`.
   - `Lancamentos.tsx`, `FluxoCaixa.tsx`, `Relatorios.tsx`, `ImportStatementDialog.tsx`, `Dashboard.tsx` — usar helper `getTransactionSourceLabel`.
4. `bunx tsgo --noEmit` limpo.
5. Verificação manual: criar cartão → lançar compra (sem criar conta) → fechar fatura → pagar fatura → conferir saldos e relatório.

## Fora de escopo
- Conciliação bancária Pluggy de cartões — próxima fase.
- Remoção física do valor `cartao_credito` do enum.
