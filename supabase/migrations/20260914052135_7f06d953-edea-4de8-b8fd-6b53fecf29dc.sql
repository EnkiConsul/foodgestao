CREATE TABLE public.dp_portal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('activation', 'reset')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.dp_portal_access_tokens TO service_role;

ALTER TABLE public.dp_portal_access_tokens ENABLE ROW LEVEL SECURITY;

-- Fail closed: nenhum cliente (anon/authenticated) lê ou grava tokens.
CREATE POLICY "dp_portal_tokens_no_client" ON public.dp_portal_access_tokens
FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

CREATE INDEX dp_portal_tokens_pendentes_idx
  ON public.dp_portal_access_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;
CREATE INDEX dp_portal_tokens_colab_idx
  ON public.dp_portal_access_tokens (colaborador_id, created_at DESC);

CREATE TRIGGER dp_portal_tokens_updated_at
BEFORE UPDATE ON public.dp_portal_access_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();