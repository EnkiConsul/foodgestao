ALTER TABLE public.pluggy_accounts
  ADD COLUMN IF NOT EXISTS linked_credit_card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_review_status text,
  ADD COLUMN IF NOT EXISTS credit_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_review_by uuid;

ALTER TABLE public.pluggy_accounts
  DROP CONSTRAINT IF EXISTS pluggy_accounts_credit_review_status_check;

ALTER TABLE public.pluggy_accounts
  ADD CONSTRAINT pluggy_accounts_credit_review_status_check
  CHECK (credit_review_status IS NULL OR credit_review_status IN ('pending','linked','ignored'));

CREATE INDEX IF NOT EXISTS pluggy_accounts_credit_review_idx
  ON public.pluggy_accounts (company_id, credit_review_status);