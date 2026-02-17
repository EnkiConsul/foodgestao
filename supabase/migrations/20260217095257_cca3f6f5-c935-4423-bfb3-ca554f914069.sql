
-- Adicionar colunas na tabela transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_status bill_status;

-- Migrar dados de bills para transactions
INSERT INTO transactions (
  user_id, description, amount, transaction_type, transaction_date,
  account_id, category_id, contact_id, notes, payment_method_id,
  context, company_id, status,
  due_date, amount_paid, payment_date, bill_status
)
SELECT
  user_id, description, amount, bill_type, due_date,
  COALESCE(account_id, (SELECT id FROM accounts WHERE accounts.user_id = bills.user_id LIMIT 1)),
  category_id, contact_id, notes, payment_method_id,
  context, company_id,
  (CASE WHEN status = 'pago' THEN 'confirmado' ELSE 'pendente' END)::transaction_status,
  due_date, amount_paid, payment_date, status
FROM bills;
