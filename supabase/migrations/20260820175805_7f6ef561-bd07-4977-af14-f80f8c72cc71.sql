CREATE TABLE public.app_hidden_screens (
  singleton boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  routes text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_hidden_screens_singleton_chk CHECK (singleton)
);

GRANT SELECT ON public.app_hidden_screens TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_hidden_screens TO authenticated;
GRANT ALL ON public.app_hidden_screens TO service_role;

ALTER TABLE public.app_hidden_screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ler a config de telas ocultas"
  ON public.app_hidden_screens FOR SELECT
  USING (true);

CREATE POLICY "Super admin cria a config de telas ocultas"
  ON public.app_hidden_screens FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin atualiza a config de telas ocultas"
  ON public.app_hidden_screens FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.app_hidden_screens (singleton, enabled, routes)
VALUES (true, true, '{}')
ON CONFLICT (singleton) DO NOTHING;