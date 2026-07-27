CREATE TABLE public.dp_ponto_fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  minutos_trabalhados integer NOT NULL DEFAULT 0,
  minutos_previstos integer NOT NULL DEFAULT 0,
  saldo_minutos integer NOT NULL DEFAULT 0,
  saldo_anterior_minutos integer NOT NULL DEFAULT 0,
  saldo_acumulado_minutos integer NOT NULL DEFAULT 0,
  faltas integer NOT NULL DEFAULT 0,
  atraso_minutos integer NOT NULL DEFAULT 0,
  observacao text,
  fechado_por uuid,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ponto_fechamentos_competencia_fmt CHECK (competencia ~ '^\d{4}-\d{2}$'),
  CONSTRAINT dp_ponto_fechamentos_unico UNIQUE (colaborador_id, competencia)
);

CREATE INDEX idx_dp_ponto_fechamentos_comp ON public.dp_ponto_fechamentos (company_id, competencia);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ponto_fechamentos TO authenticated;
GRANT ALL ON public.dp_ponto_fechamentos TO service_role;

ALTER TABLE public.dp_ponto_fechamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_ponto_fechamentos_admin_all" ON public.dp_ponto_fechamentos
  FOR ALL TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_ponto_fechamentos_colab_select" ON public.dp_ponto_fechamentos
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_of(auth.uid()));

CREATE TRIGGER trg_dp_ponto_fechamentos_updated_at
  BEFORE UPDATE ON public.dp_ponto_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE OR REPLACE FUNCTION public.dp_ponto_competencia_fechada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_pontos;
BEGIN
  v_row := COALESCE(NEW, OLD);
  IF EXISTS (
    SELECT 1 FROM public.dp_ponto_fechamentos f
    WHERE f.colaborador_id = v_row.colaborador_id
      AND f.competencia = to_char(v_row.data, 'YYYY-MM')
  ) THEN
    RAISE EXCEPTION 'Competência % já fechada para este colaborador. Reabra o fechamento para alterar marcações.', to_char(v_row.data, 'YYYY-MM');
  END IF;
  RETURN v_row;
END;
$$;

CREATE TRIGGER trg_dp_pontos_competencia_fechada
  BEFORE INSERT OR UPDATE OR DELETE ON public.dp_pontos
  FOR EACH ROW EXECUTE FUNCTION public.dp_ponto_competencia_fechada();