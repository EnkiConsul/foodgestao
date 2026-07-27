DO $$ BEGIN
  CREATE TYPE public.dp_escala_status AS ENUM ('rascunho','publicada','arquivada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_escala_item_tipo AS ENUM ('trabalho','folga','ferias','afastamento','feriado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_escala_item_origem AS ENUM ('gerado','manual','troca');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.dp_escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  status public.dp_escala_status NOT NULL DEFAULT 'rascunho',
  observacoes text,
  publicada_em timestamptz,
  publicada_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_escalas_uniq
  ON public.dp_escalas (company_id, competencia, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.dp_escala_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  escala_id uuid NOT NULL REFERENCES public.dp_escalas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo public.dp_escala_item_tipo NOT NULL DEFAULT 'trabalho',
  turno_id uuid REFERENCES public.dp_turnos(id) ON DELETE SET NULL,
  entrada time,
  saida time,
  intervalo_minutos integer NOT NULL DEFAULT 0,
  termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  carga_prevista_horas numeric(5,2) NOT NULL DEFAULT 0,
  origem public.dp_escala_item_origem NOT NULL DEFAULT 'gerado',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escala_id, colaborador_id, data)
);

CREATE INDEX IF NOT EXISTS dp_escala_itens_colab_data ON public.dp_escala_itens (company_id, colaborador_id, data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_escalas TO authenticated;
GRANT ALL ON public.dp_escalas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_escala_itens TO authenticated;
GRANT ALL ON public.dp_escala_itens TO service_role;

ALTER TABLE public.dp_escalas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_escala_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_escalas_read_member" ON public.dp_escalas FOR SELECT
  TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_escalas_admin_write" ON public.dp_escalas
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_escala_itens_read_member" ON public.dp_escala_itens FOR SELECT
  TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_escala_itens_read_self" ON public.dp_escala_itens FOR SELECT
  TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  );

CREATE POLICY "dp_escala_itens_admin_write" ON public.dp_escala_itens
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_escalas_upd BEFORE UPDATE ON public.dp_escalas
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
CREATE TRIGGER dp_escala_itens_upd BEFORE UPDATE ON public.dp_escala_itens
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();