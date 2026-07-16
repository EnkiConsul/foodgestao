
CREATE TABLE IF NOT EXISTS public.dp_user_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  favoritos jsonb NOT NULL DEFAULT '[]'::jsonb,
  pendencias_adiadas jsonb NOT NULL DEFAULT '{}'::jsonb,
  avisos_confirmados jsonb NOT NULL DEFAULT '[]'::jsonb,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_user_prefs TO authenticated;
GRANT ALL ON public.dp_user_prefs TO service_role;

ALTER TABLE public.dp_user_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_user_prefs self"
  ON public.dp_user_prefs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_dp_user_prefs_updated
  BEFORE UPDATE ON public.dp_user_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
