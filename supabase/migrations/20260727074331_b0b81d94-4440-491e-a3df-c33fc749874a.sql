ALTER TABLE public.open_finance_accounts
  ADD COLUMN IF NOT EXISTS sync_cursor_date date,
  ADD COLUMN IF NOT EXISTS sync_cursor_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_sync_completed_at timestamptz;