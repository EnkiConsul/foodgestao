
CREATE TABLE public.dp_pendencias_config (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  alerta_solicitacao_dias int NOT NULL DEFAULT 3,
  alerta_troca_dias int NOT NULL DEFAULT 3,
  alerta_contracheque_dia_mes int NOT NULL DEFAULT 10,
  alerta_adiantamento_offset int NOT NULL DEFAULT 5,
  alerta_folha_ponto_dia_mes int NOT NULL DEFAULT 10,
  alerta_negociacao_dias int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_pendencias_config TO authenticated;
GRANT ALL ON public.dp_pendencias_config TO service_role;

ALTER TABLE public.dp_pendencias_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pendencias config"
  ON public.dp_pendencias_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = dp_pendencias_config.company_id
        AND cm.user_id = auth.uid()
    )
    OR public.is_company_admin_or_owner(auth.uid(), company_id)
  );

CREATE POLICY "Admins can insert pendencias config"
  ON public.dp_pendencias_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Admins can update pendencias config"
  ON public.dp_pendencias_config FOR UPDATE
  TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "Admins can delete pendencias config"
  ON public.dp_pendencias_config FOR DELETE
  TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER trg_dp_pendencias_config_updated_at
  BEFORE UPDATE ON public.dp_pendencias_config
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
