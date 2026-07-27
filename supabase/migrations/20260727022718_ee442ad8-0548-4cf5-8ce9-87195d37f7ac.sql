
CREATE TABLE public.dp_ferias_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  turno public.dp_turno,
  max_simultaneos smallint NOT NULL DEFAULT 1 CHECK (max_simultaneos >= 0),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ferias_regras TO authenticated;
GRANT ALL ON public.dp_ferias_regras TO service_role;
ALTER TABLE public.dp_ferias_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_ferias_regras_admin_all" ON public.dp_ferias_regras
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TABLE public.dp_ferias_bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  recorrente_anual boolean NOT NULL DEFAULT false,
  permite_excecao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ferias_bloqueios TO authenticated;
GRANT ALL ON public.dp_ferias_bloqueios TO service_role;
ALTER TABLE public.dp_ferias_bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_ferias_bloqueios_admin_all" ON public.dp_ferias_bloqueios
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_ferias_regras_updated_at BEFORE UPDATE ON public.dp_ferias_regras
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
CREATE TRIGGER dp_ferias_bloqueios_updated_at BEFORE UPDATE ON public.dp_ferias_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE INDEX idx_dp_ferias_regras_company ON public.dp_ferias_regras(company_id) WHERE ativo;
CREATE INDEX idx_dp_ferias_bloqueios_company ON public.dp_ferias_bloqueios(company_id) WHERE ativo;

-- Validação de bloqueios e limite de simultâneos
CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_validar_regras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_bloq record;
  v_regra record;
  v_conc int;
BEGIN
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  SELECT id, unidade_id, cargo_id, turno INTO v_col
  FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  -- Períodos bloqueados
  SELECT * INTO v_bloq
  FROM public.dp_ferias_bloqueios b
  WHERE b.company_id = NEW.company_id
    AND b.ativo
    AND NOT b.permite_excecao
    AND (b.unidade_id IS NULL OR b.unidade_id = v_col.unidade_id)
    AND (
      (NOT b.recorrente_anual AND daterange(b.data_inicio, b.data_fim, '[]') && daterange(NEW.data_inicio, NEW.data_fim, '[]'))
      OR (
        b.recorrente_anual AND EXISTS (
          SELECT 1 FROM generate_series(
            EXTRACT(YEAR FROM NEW.data_inicio)::int - 1,
            EXTRACT(YEAR FROM NEW.data_fim)::int
          ) AS y
          WHERE daterange(
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int),
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int)
                    + (b.data_fim - b.data_inicio),
                  '[]'
                ) && daterange(NEW.data_inicio, NEW.data_fim, '[]')
        )
      )
    )
  LIMIT 1;

  IF v_bloq.id IS NOT NULL THEN
    RAISE EXCEPTION 'Período bloqueado para férias: %', v_bloq.nome;
  END IF;

  -- Limite de simultâneos (regra mais específica primeiro)
  SELECT * INTO v_regra
  FROM public.dp_ferias_regras r
  WHERE r.company_id = NEW.company_id
    AND r.ativo
    AND (r.unidade_id IS NULL OR r.unidade_id = v_col.unidade_id)
    AND (r.cargo_id IS NULL OR r.cargo_id = v_col.cargo_id)
    AND (r.turno IS NULL OR r.turno = v_col.turno)
  ORDER BY (r.cargo_id IS NOT NULL)::int + (r.unidade_id IS NOT NULL)::int + (r.turno IS NOT NULL)::int DESC
  LIMIT 1;

  IF v_regra.id IS NOT NULL THEN
    SELECT COUNT(DISTINCT g.colaborador_id) INTO v_conc
    FROM public.dp_ferias_gozos g
    JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
    WHERE g.company_id = NEW.company_id
      AND g.id <> NEW.id
      AND g.status <> 'cancelado'
      AND g.colaborador_id <> NEW.colaborador_id
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(NEW.data_inicio, NEW.data_fim, '[]')
      AND (v_regra.unidade_id IS NULL OR c.unidade_id = v_regra.unidade_id)
      AND (v_regra.cargo_id IS NULL OR c.cargo_id = v_regra.cargo_id)
      AND (v_regra.turno IS NULL OR c.turno = v_regra.turno);

    IF v_conc + 1 > v_regra.max_simultaneos THEN
      RAISE EXCEPTION 'Limite de % colaborador(es) simultaneamente em férias já atingido neste período.', v_regra.max_simultaneos;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_ferias_gozo_validar_regras_trg
  BEFORE INSERT OR UPDATE ON public.dp_ferias_gozos
  FOR EACH ROW EXECUTE FUNCTION public.dp_ferias_gozo_validar_regras();
