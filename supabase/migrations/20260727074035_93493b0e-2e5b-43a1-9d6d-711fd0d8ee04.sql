ALTER TABLE public.open_finance_accounts
  ADD COLUMN IF NOT EXISTS owner_name              text,
  ADD COLUMN IF NOT EXISTS tax_number              text,
  ADD COLUMN IF NOT EXISTS transfer_number         text,
  ADD COLUMN IF NOT EXISTS credit_brand            text,
  ADD COLUMN IF NOT EXISTS credit_level            text,
  ADD COLUMN IF NOT EXISTS credit_limit            numeric(18,2),
  ADD COLUMN IF NOT EXISTS available_credit_limit  numeric(18,2),
  ADD COLUMN IF NOT EXISTS balance_close_date      date,
  ADD COLUMN IF NOT EXISTS balance_due_date        date,
  ADD COLUMN IF NOT EXISTS removed_at              timestamptz;

CREATE INDEX IF NOT EXISTS idx_of_accounts_active
  ON public.open_finance_accounts (connection_id)
  WHERE removed_at IS NULL;