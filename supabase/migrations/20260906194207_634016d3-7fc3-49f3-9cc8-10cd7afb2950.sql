-- 1. Faltas no período aquisitivo
ALTER TABLE public.dp_ferias_periodos
  ADD COLUMN IF NOT EXISTS faltas_injustificadas smallint,
  ADD COLUMN IF NOT EXISTS faltas_informadas_em timestamptz,
  ADD COLUMN IF NOT EXISTS faltas_informadas_por uuid,
  ADD COLUMN IF NOT EXISTS faltas_confirmadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_faltas text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requer_revisao boolean NOT NULL DEFAULT false;

ALTER TABLE public.dp_ferias_periodos
  DROP CONSTRAINT IF EXISTS ck_dp_ferias_origem_faltas;
ALTER TABLE public.dp_ferias_periodos
  ADD CONSTRAINT ck_dp_ferias_origem_faltas CHECK (origem_faltas IN ('manual', 'ponto'));

ALTER TABLE public.dp_ferias_periodos
  DROP CONSTRAINT IF EXISTS ck_dp_ferias_faltas_nao_negativas;
ALTER TABLE public.dp_ferias_periodos
  ADD CONSTRAINT ck_dp_ferias_faltas_nao_negativas
  CHECK (faltas_injustificadas IS NULL OR faltas_injustificadas >= 0);

-- 2. Histórico de alterações das faltas
CREATE TABLE IF NOT EXISTS public.dp_ferias_faltas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  periodo_id uuid NOT NULL REFERENCES public.dp_ferias_periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL,
  valor_anterior smallint,
  valor_novo smallint NOT NULL,
  dias_direito_anterior smallint,
  dias_direito_novo smallint NOT NULL,
  motivo text,
  ator uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dp_ferias_faltas_historico TO authenticated;
GRANT ALL ON public.dp_ferias_faltas_historico TO service_role;

ALTER TABLE public.dp_ferias_faltas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ferias_faltas_hist_select" ON public.dp_ferias_faltas_historico;
CREATE POLICY "ferias_faltas_hist_select"
ON public.dp_ferias_faltas_historico
FOR SELECT TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  OR private.is_company_owner(auth.uid(), company_id)
);

CREATE INDEX IF NOT EXISTS dp_ferias_faltas_hist_periodo_idx
  ON public.dp_ferias_faltas_historico (periodo_id, created_at DESC);

-- 3. Faixas legais de faltas -> dias de direito
CREATE OR REPLACE FUNCTION public.dp_ferias_dias_direito(_faltas integer)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _faltas IS NULL THEN 30::smallint
    WHEN _faltas <= 5 THEN 30::smallint
    WHEN _faltas <= 14 THEN 24::smallint
    WHEN _faltas <= 23 THEN 18::smallint
    WHEN _faltas <= 32 THEN 12::smallint
    ELSE 0::smallint
  END
$$;

-- 4. Informar faltas do período (qualquer participante da empresa, auditado)
CREATE OR REPLACE FUNCTION public.dp_ferias_informar_faltas(
  _periodo_id uuid,
  _faltas integer,
  _motivo text DEFAULT NULL
)
RETURNS TABLE (
  periodo_id uuid,
  faltas_injustificadas smallint,
  dias_direito smallint,
  requer_revisao boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo record;
  v_direito smallint;
  v_revisao boolean;
  v_usados int;
BEGIN
  IF _faltas IS NULL OR _faltas < 0 THEN
    RAISE EXCEPTION 'FERIAS_FALTAS_INVALIDAS';
  END IF;

  SELECT * INTO v_periodo
  FROM public.dp_ferias_periodos
  WHERE id = _periodo_id
  FOR UPDATE;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  IF NOT (
    private.is_company_member(auth.uid(), v_periodo.company_id)
    OR private.is_company_owner(auth.uid(), v_periodo.company_id)
  ) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  IF v_periodo.faltas_injustificadas IS NOT NULL
     AND v_periodo.faltas_injustificadas <> _faltas
     AND COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_FALTAS_MOTIVO_OBRIGATORIO';
  END IF;

  v_direito := public.dp_ferias_dias_direito(_faltas);
  v_revisao := _faltas > 32;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id AND g.status <> 'cancelado';

  IF v_usados > v_direito THEN
    RAISE EXCEPTION 'FERIAS_FALTAS_CONFLITO_SALDO';
  END IF;

  INSERT INTO public.dp_ferias_faltas_historico (
    company_id, periodo_id, colaborador_id, valor_anterior, valor_novo,
    dias_direito_anterior, dias_direito_novo, motivo, ator
  ) VALUES (
    v_periodo.company_id, v_periodo.id, v_periodo.colaborador_id,
    v_periodo.faltas_injustificadas, _faltas::smallint,
    v_periodo.dias_direito, v_direito, NULLIF(btrim(_motivo), ''), auth.uid()
  );

  UPDATE public.dp_ferias_periodos p
  SET faltas_injustificadas = _faltas::smallint,
      faltas_informadas_em = now(),
      faltas_informadas_por = auth.uid(),
      faltas_confirmadas = true,
      origem_faltas = 'manual',
      requer_revisao = v_revisao,
      dias_direito = v_direito,
      updated_at = now()
  WHERE p.id = _periodo_id;

  PERFORM public.dp_ferias_recalc_periodo(_periodo_id);

  RETURN QUERY
  SELECT p.id, p.faltas_injustificadas, p.dias_direito, p.requer_revisao
  FROM public.dp_ferias_periodos p
  WHERE p.id = _periodo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_informar_faltas(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_informar_faltas(uuid, integer, text) TO authenticated;

-- 5. Manutenção automática e idempotente dos períodos aquisitivos da empresa
CREATE OR REPLACE FUNCTION public.dp_ferias_manter_periodos(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_inicio date;
  v_fim date;
  v_limite date;
  v_criados int := 0;
BEGIN
  IF NOT (
    private.is_company_member(auth.uid(), _company_id)
    OR private.is_company_owner(auth.uid(), _company_id)
  ) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  FOR v_col IN
    SELECT c.id, c.company_id, c.data_admissao, c.data_desligamento
    FROM public.dp_colaboradores c
    WHERE c.company_id = _company_id
      AND c.data_admissao IS NOT NULL
      AND c.regime IN ('clt', 'estagio', 'temporario', 'intermitente')
      AND COALESCE(c.vinculo_label, '') NOT ILIKE 'sócio%'
      AND COALESCE(c.vinculo_label, '') NOT ILIKE 'socio%'
  LOOP
    v_inicio := v_col.data_admissao;

    WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
      v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
      v_limite := (v_fim + INTERVAL '1 year')::date;

      INSERT INTO public.dp_ferias_periodos (
        company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo
      ) VALUES (
        v_col.company_id, v_col.id, v_inicio, v_fim, v_limite
      )
      ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;

      IF FOUND THEN v_criados := v_criados + 1; END IF;

      v_inicio := (v_inicio + INTERVAL '1 year')::date;
    END LOOP;
  END LOOP;

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.company_id = _company_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_manter_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_manter_periodos(uuid) TO authenticated;