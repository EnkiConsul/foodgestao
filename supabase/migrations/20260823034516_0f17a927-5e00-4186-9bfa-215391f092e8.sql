CREATE TABLE public.dp_operacao_alertas_dispensas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  data date NOT NULL,
  previsto_snapshot integer NOT NULL,
  padrao_snapshot integer NOT NULL,
  observacao text,
  dispensado_por uuid,
  dispensado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dp_operacao_alertas_dispensas_chave
  ON public.dp_operacao_alertas_dispensas (company_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_operacao_alertas_dispensas TO authenticated;
GRANT ALL ON public.dp_operacao_alertas_dispensas TO service_role;

ALTER TABLE public.dp_operacao_alertas_dispensas ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_operacao_dispensas_read_member
  ON public.dp_operacao_alertas_dispensas FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY dp_operacao_dispensas_admin_write
  ON public.dp_operacao_alertas_dispensas FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));