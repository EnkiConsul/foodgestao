ALTER TABLE public.pluggy_accounts
  ADD COLUMN IF NOT EXISTS statement_gap_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS statement_gap_from date,
  ADD COLUMN IF NOT EXISTS statement_gap_to date,
  ADD COLUMN IF NOT EXISTS statement_gap_checked_at timestamptz;

COMMENT ON COLUMN public.pluggy_accounts.statement_gap_amount IS
  'Diferenca (R$) entre o saldo informado pelo banco e o saldo reconstruido pelos lancamentos importados. NULL = extrato conferido e completo.';
COMMENT ON COLUMN public.pluggy_accounts.statement_gap_from IS 'Inicio da janela em que falta extrato.';
COMMENT ON COLUMN public.pluggy_accounts.statement_gap_to IS 'Fim da janela em que falta extrato.';
COMMENT ON COLUMN public.pluggy_accounts.statement_gap_checked_at IS 'Momento da ultima conferencia de completude do extrato.';