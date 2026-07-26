-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.dp_ferias_periodo_status AS ENUM ('em_aquisicao','disponivel','parcial','concluido','vencido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_ferias_gozo_status AS ENUM ('planejado','aprovado','em_gozo','concluido','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TABELA: PERÍODOS AQUISITIVOS ============
CREATE TABLE public.dp_ferias_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  inicio_aquisitivo date NOT NULL,
  fim_aquisitivo date NOT NULL,
  limite_concessivo date NOT NULL,
  dias_direito smallint NOT NULL DEFAULT 30,
  dias_gozados smallint NOT NULL DEFAULT 0,
  dias_vendidos smallint NOT NULL DEFAULT 0,
  dias_saldo smallint GENERATED ALWAYS AS (dias_direito - dias_gozados - dias_vendidos) STORED,
  status public.dp_ferias_periodo_status NOT NULL DEFAULT 'em_aquisicao',
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ferias_periodos_datas_chk CHECK (fim_aquisitivo > inicio_aquisitivo AND limite_concessivo > fim_aquisitivo),
  CONSTRAINT dp_ferias_periodos_dias_chk CHECK (dias_direito BETWEEN 0 AND 30 AND dias_gozados >= 0 AND dias_vendidos >= 0),
  CONSTRAINT dp_ferias_periodos_unq UNIQUE (colaborador_id, inicio_aquisitivo)
);

CREATE INDEX dp_ferias_periodos_company_idx ON public.dp_ferias_periodos (company_id, colaborador_id);
CREATE INDEX dp_ferias_periodos_limite_idx ON public.dp_ferias_periodos (company_id, limite_concessivo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ferias_periodos TO authenticated;
GRANT ALL ON public.dp_ferias_periodos TO service_role;
ALTER TABLE public.dp_ferias_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_ferias_periodos_admin_write ON public.dp_ferias_periodos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_ferias_periodos_self_read ON public.dp_ferias_periodos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of(auth.uid())
  );

-- ============ TABELA: GOZOS ============
CREATE TABLE public.dp_ferias_gozos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  periodo_id uuid NOT NULL REFERENCES public.dp_ferias_periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias smallint GENERATED ALWAYS AS ((data_fim - data_inicio) + 1) STORED,
  dias_abono smallint NOT NULL DEFAULT 0,
  adiantar_13 boolean NOT NULL DEFAULT false,
  aviso_em date,
  status public.dp_ferias_gozo_status NOT NULL DEFAULT 'planejado',
  observacao text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ferias_gozos_datas_chk CHECK (data_fim >= data_inicio),
  CONSTRAINT dp_ferias_gozos_abono_chk CHECK (dias_abono BETWEEN 0 AND 10)
);

CREATE INDEX dp_ferias_gozos_periodo_idx ON public.dp_ferias_gozos (periodo_id);
CREATE INDEX dp_ferias_gozos_company_idx ON public.dp_ferias_gozos (company_id, data_inicio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ferias_gozos TO authenticated;
GRANT ALL ON public.dp_ferias_gozos TO service_role;
ALTER TABLE public.dp_ferias_gozos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_ferias_gozos_admin_write ON public.dp_ferias_gozos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_ferias_gozos_self_read ON public.dp_ferias_gozos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.dp_colaborador_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of(auth.uid())
  );

-- ============ UPDATED_AT ============
CREATE TRIGGER trg_dp_ferias_periodos_updated
  BEFORE UPDATE ON public.dp_ferias_periodos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE TRIGGER trg_dp_ferias_gozos_updated
  BEFORE UPDATE ON public.dp_ferias_gozos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ============ RECÁLCULO DE SALDO ============
CREATE OR REPLACE FUNCTION public.dp_ferias_recalc_periodo(_periodo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gozados int;
  v_vendidos int;
  v_rec record;
  v_status public.dp_ferias_periodo_status;
BEGIN
  SELECT COALESCE(SUM(dias), 0), COALESCE(SUM(dias_abono), 0)
    INTO v_gozados, v_vendidos
  FROM public.dp_ferias_gozos
  WHERE periodo_id = _periodo_id AND status <> 'cancelado';

  UPDATE public.dp_ferias_periodos
     SET dias_gozados = LEAST(v_gozados, 30),
         dias_vendidos = LEAST(v_vendidos, 30)
   WHERE id = _periodo_id
  RETURNING * INTO v_rec;

  IF v_rec.id IS NULL THEN RETURN; END IF;

  IF v_rec.dias_saldo <= 0 THEN
    v_status := 'concluido';
  ELSIF CURRENT_DATE > v_rec.limite_concessivo THEN
    v_status := 'vencido';
  ELSIF v_rec.dias_gozados > 0 OR v_rec.dias_vendidos > 0 THEN
    v_status := 'parcial';
  ELSIF CURRENT_DATE > v_rec.fim_aquisitivo THEN
    v_status := 'disponivel';
  ELSE
    v_status := 'em_aquisicao';
  END IF;

  UPDATE public.dp_ferias_periodos SET status = v_status WHERE id = _periodo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.dp_ferias_recalc_periodo(OLD.periodo_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.dp_ferias_recalc_periodo(NEW.periodo_id);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_dp_ferias_gozo_after
  AFTER INSERT OR UPDATE OR DELETE ON public.dp_ferias_gozos
  FOR EACH ROW EXECUTE FUNCTION public.dp_ferias_gozo_after();

-- ============ VALIDAÇÃO DO GOZO ============
CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo record;
  v_usados int;
  v_novos int;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = NEW.periodo_id;
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Período aquisitivo não encontrado.';
  END IF;
  IF v_periodo.company_id <> NEW.company_id OR v_periodo.colaborador_id <> NEW.colaborador_id THEN
    RAISE EXCEPTION 'Período aquisitivo não pertence a este colaborador/empresa.';
  END IF;

  IF NEW.status <> 'cancelado' THEN
    SELECT COALESCE(SUM(dias + dias_abono), 0) INTO v_usados
    FROM public.dp_ferias_gozos
    WHERE periodo_id = NEW.periodo_id
      AND status <> 'cancelado'
      AND id <> NEW.id;

    v_novos := ((NEW.data_fim - NEW.data_inicio) + 1) + NEW.dias_abono;

    IF v_usados + v_novos > v_periodo.dias_direito THEN
      RAISE EXCEPTION 'Saldo insuficiente: o período possui % dias de direito e já há % dias utilizados.',
        v_periodo.dias_direito, v_usados;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_ferias_gozo_validar
  BEFORE INSERT OR UPDATE ON public.dp_ferias_gozos
  FOR EACH ROW EXECUTE FUNCTION public.dp_ferias_gozo_validar();

-- ============ GERAÇÃO DE PERÍODOS ============
CREATE OR REPLACE FUNCTION public.dp_ferias_gerar_periodos(_colaborador_id uuid)
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
  SELECT id, company_id, data_admissao, data_desligamento
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_col.company_id) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  IF v_col.data_admissao IS NULL THEN
    RAISE EXCEPTION 'Colaborador sem data de admissão.';
  END IF;

  v_inicio := v_col.data_admissao;

  WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    v_limite := (v_fim + INTERVAL '1 year')::date;

    INSERT INTO public.dp_ferias_periodos (
      company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, criado_por
    ) VALUES (
      v_col.company_id, v_col.id, v_inicio, v_fim, v_limite, auth.uid()
    )
    ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;

    IF FOUND THEN v_criados := v_criados + 1; END IF;

    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  -- Atualiza status de todos os períodos do colaborador
  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.colaborador_id = _colaborador_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_gerar_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.dp_ferias_recalc_periodo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_recalc_periodo(uuid) TO service_role;