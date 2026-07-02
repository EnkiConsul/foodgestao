
-- Add import_hash for idempotent statement imports
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_hash_uidx
  ON public.transactions (user_id, account_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- import_rules: user-defined mapping from description patterns to categories/contacts
CREATE TABLE IF NOT EXISTS public.import_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context context_type NOT NULL DEFAULT 'pf',
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  transaction_type transaction_type,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rules TO authenticated;
GRANT ALL ON public.import_rules TO service_role;

ALTER TABLE public.import_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import rules"
  ON public.import_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_import_rules_updated
  BEFORE UPDATE ON public.import_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS import_rules_user_idx ON public.import_rules (user_id, context, company_id);
