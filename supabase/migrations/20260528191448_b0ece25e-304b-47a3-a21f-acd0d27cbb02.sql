CREATE TABLE public.legal_acceptances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('privacy','terms','cookies')),
  document_version text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX idx_legal_acceptances_user ON public.legal_acceptances(user_id, document_type);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own legal acceptances"
ON public.legal_acceptances FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own legal acceptances"
ON public.legal_acceptances FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins view all legal acceptances"
ON public.legal_acceptances FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));