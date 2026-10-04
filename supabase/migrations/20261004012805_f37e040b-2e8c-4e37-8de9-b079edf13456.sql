CREATE TABLE public.dp_assinatura_modelos (
  user_id uuid PRIMARY KEY,
  imagem text NOT NULL CHECK (imagem LIKE 'data:image/png;base64,%' AND length(imagem) <= 400000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_assinatura_modelos TO authenticated;
GRANT ALL ON public.dp_assinatura_modelos TO service_role;
ALTER TABLE public.dp_assinatura_modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cada pessoa gerencia sua assinatura" ON public.dp_assinatura_modelos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_dp_assinatura_modelos_updated BEFORE UPDATE ON public.dp_assinatura_modelos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();