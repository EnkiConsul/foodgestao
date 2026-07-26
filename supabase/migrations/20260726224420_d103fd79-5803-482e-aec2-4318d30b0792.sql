DO $$ BEGIN
  CREATE TYPE public.dp_beneficio_tipo AS ENUM ('vale_transporte','vale_alimentacao','vale_refeicao','plano_saude','plano_odontologico','seguro_vida','auxilio_creche','auxilio_combustivel','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.dp_beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo public.dp_beneficio_tipo NOT NULL DEFAULT 'outro',
  valor_padrao numeric NOT NULL DEFAULT 0,
  desconto_percentual numeric NOT NULL DEFAULT 0,
  folha_tipo public.dp_folha_tipo,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_beneficios TO authenticated;
GRANT ALL ON public.dp_beneficios TO service_role;
ALTER TABLE public.dp_beneficios ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_beneficios_admin_write ON public.dp_beneficios FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_beneficios_colab_read ON public.dp_beneficios FOR SELECT TO authenticated
  USING (public.dp_colaborador_of(auth.uid()) IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.dp_colaboradores c
                     WHERE c.id = public.dp_colaborador_of(auth.uid())
                       AND c.company_id = dp_beneficios.company_id));

CREATE TABLE public.dp_colaborador_beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  beneficio_id uuid NOT NULL REFERENCES public.dp_beneficios(id) ON DELETE CASCADE,
  valor numeric NOT NULL DEFAULT 0,
  desconto_valor numeric NOT NULL DEFAULT 0,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, beneficio_id, data_inicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_beneficios TO authenticated;
GRANT ALL ON public.dp_colaborador_beneficios TO service_role;
ALTER TABLE public.dp_colaborador_beneficios ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_colaborador_beneficios_admin_write ON public.dp_colaborador_beneficios FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_colaborador_beneficios_self_read ON public.dp_colaborador_beneficios FOR SELECT TO authenticated
  USING (public.dp_colaborador_of(auth.uid()) IS NOT NULL
         AND colaborador_id = public.dp_colaborador_of(auth.uid()));

CREATE INDEX idx_dp_beneficios_company ON public.dp_beneficios(company_id);
CREATE INDEX idx_dp_colab_beneficios_company ON public.dp_colaborador_beneficios(company_id);
CREATE INDEX idx_dp_colab_beneficios_colab ON public.dp_colaborador_beneficios(colaborador_id);

CREATE TRIGGER dp_beneficios_set_updated_at BEFORE UPDATE ON public.dp_beneficios
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
CREATE TRIGGER dp_colaborador_beneficios_set_updated_at BEFORE UPDATE ON public.dp_colaborador_beneficios
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE OR REPLACE FUNCTION public.dp_beneficios_gerar_lancamentos(_periodo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_ref date;
  v_count integer := 0;
  r record;
BEGIN
  SELECT company_id, make_date(ano, mes, 1) INTO v_company, v_ref
  FROM public.dp_folha_periodos WHERE id = _periodo_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Período de folha não encontrado';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR r IN
    SELECT cb.colaborador_id, b.folha_tipo,
           sum(cb.valor) AS bruto,
           sum(cb.desconto_valor) AS desconto
    FROM public.dp_colaborador_beneficios cb
    JOIN public.dp_beneficios b ON b.id = cb.beneficio_id
    WHERE cb.company_id = v_company
      AND cb.ativo AND b.ativo
      AND b.folha_tipo IS NOT NULL
      AND cb.data_inicio <= (v_ref + interval '1 month - 1 day')::date
      AND (cb.data_fim IS NULL OR cb.data_fim >= v_ref)
    GROUP BY cb.colaborador_id, b.folha_tipo
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.dp_folha_lancamentos l
      WHERE l.periodo_id = _periodo_id
        AND l.colaborador_id = r.colaborador_id
        AND l.tipo = r.folha_tipo
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, descontos, valor_liquido, observacoes)
    VALUES (
      v_company, _periodo_id, r.colaborador_id, r.folha_tipo,
      r.bruto,
      CASE WHEN coalesce(r.desconto,0) > 0
        THEN jsonb_build_array(jsonb_build_object('descricao','Desconto benefício','valor', r.desconto))
        ELSE '[]'::jsonb END,
      r.bruto - coalesce(r.desconto,0),
      'Gerado automaticamente a partir dos benefícios'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_beneficios_gerar_lancamentos(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dp_beneficios_gerar_lancamentos(uuid) TO authenticated;