-- Fase 1 — Folgas de quem folga fim de semana.
-- 1) Dias fixos de descanso derivados da configuração de trabalho.
CREATE OR REPLACE FUNCTION public.dp_dias_fixos_folga(_colaborador uuid, _data date DEFAULT CURRENT_DATE)
RETURNS smallint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(dow ORDER BY dow), '{}'::smallint[])
  FROM (
    SELECT DISTINCT dow FROM (
      SELECT d.dow::smallint AS dow
        FROM public.dp_colaborador_config_trabalho ct
        JOIN public.dp_colaborador_config_dias d ON d.config_id = ct.id
       WHERE ct.colaborador_id = _colaborador
         AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= _data)
         AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= _data)
         AND COALESCE(d.trabalha, false) = false
      UNION
      SELECT c.folga_fixa_semana::smallint
        FROM public.dp_colaboradores c
       WHERE c.id = _colaborador AND c.folga_fixa_semana IS NOT NULL
    ) u
    WHERE dow BETWEEN 0 AND 6
  ) z;
$$;

REVOKE ALL ON FUNCTION public.dp_dias_fixos_folga(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_dias_fixos_folga(uuid, date) TO service_role;

-- Wrapper do portal: só os dias do próprio colaborador autenticado.
CREATE OR REPLACE FUNCTION public.dp_meus_dias_fixos_folga(_data date DEFAULT CURRENT_DATE)
RETURNS smallint[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN '{}'::smallint[]; END IF;
  RETURN public.dp_dias_fixos_folga(v_colab, COALESCE(_data, CURRENT_DATE));
END;
$$;

REVOKE ALL ON FUNCTION public.dp_meus_dias_fixos_folga(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_meus_dias_fixos_folga(date) TO authenticated, service_role;

-- 2) Dia de trabalho excepcional (a pessoa trabalha num dia que normalmente é folga fixa).
CREATE TABLE IF NOT EXISTS public.dp_dia_trabalho_excepcional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data date NOT NULL,
  origem text NOT NULL DEFAULT 'troca_fds',
  solicitacao_id uuid REFERENCES public.dp_solicitacoes(id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, data)
);

CREATE INDEX IF NOT EXISTS dp_dia_trabalho_excepcional_dia_idx
  ON public.dp_dia_trabalho_excepcional (company_id, data);

GRANT SELECT ON public.dp_dia_trabalho_excepcional TO authenticated;
GRANT ALL ON public.dp_dia_trabalho_excepcional TO service_role;

ALTER TABLE public.dp_dia_trabalho_excepcional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_dia_trab_exc_admin_all ON public.dp_dia_trabalho_excepcional;
CREATE POLICY dp_dia_trab_exc_admin_all
  ON public.dp_dia_trabalho_excepcional
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

DROP POLICY IF EXISTS dp_dia_trab_exc_self_read ON public.dp_dia_trabalho_excepcional;
CREATE POLICY dp_dia_trab_exc_self_read
  ON public.dp_dia_trabalho_excepcional
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_of(auth.uid()));

DROP TRIGGER IF EXISTS trg_dp_dia_trab_exc_upd ON public.dp_dia_trabalho_excepcional;
CREATE TRIGGER trg_dp_dia_trab_exc_upd
  BEFORE UPDATE ON public.dp_dia_trabalho_excepcional
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 3) Pedido de troca da folga fixa do fim de semana por um dia de meio de semana.
CREATE OR REPLACE FUNCTION public.dp_folga_troca_fds_solicitar(
  p_data_folga date,
  p_data_trabalho date,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_setor uuid;
  v_fixos smallint[];
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_lim jsonb;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data_folga IS NULL OR p_data_trabalho IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe os dois dias da troca.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'TROCA_MOTIVO_OBRIGATORIO: escreva o motivo da troca.' USING ERRCODE = '22023';
  END IF;
  IF p_data_folga = p_data_trabalho THEN
    RAISE EXCEPTION 'TROCA_DIAS_IGUAIS: escolha dois dias diferentes.' USING ERRCODE = '22023';
  END IF;
  IF p_data_folga < CURRENT_DATE OR p_data_trabalho < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
      USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  v_fixos := public.dp_dias_fixos_folga(v_colab, p_data_trabalho);
  IF array_length(v_fixos, 1) IS NULL THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_FIXA: seu cadastro não tem folga fixa na semana.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (extract(dow from p_data_trabalho)::smallint = ANY (v_fixos)) THEN
    RAISE EXCEPTION 'TROCA_DIA_TRABALHO_INVALIDO: o dia oferecido precisa ser um dia de folga fixa sua.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF extract(dow from p_data_folga)::smallint = ANY (public.dp_dias_fixos_folga(v_colab, p_data_folga)) THEN
    RAISE EXCEPTION 'TROCA_DIA_FOLGA_INVALIDO: esse dia já é folga fixa sua.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_folga::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|troca_fds|' || p_data_folga::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
       AND s.status = 'pendente'
       AND (s.data_alvo = p_data_folga OR s.data_fim = p_data_trabalho)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para estes dias.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab AND f.data = p_data_folga
       AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'TROCA_JA_TEM_FOLGA: você já tem folga registrada nesse dia.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_folga, v_colab, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data_folga, p_data_trabalho, v_motivo, 'pendente')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'limite', v_lim);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_troca_fds_solicitar(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_troca_fds_solicitar(date, date, text) TO authenticated, service_role;
-- Aprovação da troca: cria a folga do meio de semana e marca o dia do fim de
-- semana como trabalho excepcional, na mesma transação.
CREATE OR REPLACE FUNCTION public.dp_solicitacao_responder(p_id uuid, p_status dp_solicitacao_status, p_resposta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_unidade uuid;
  v_cargo uuid;
  v_setor uuid;
  v_lim jsonb;
  v_troca boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação e a decisão.' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('aprovada'::public.dp_solicitacao_status, 'recusada'::public.dp_solicitacao_status) THEN
    RAISE EXCEPTION 'INVALID_INPUT: decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: solicitação não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_row.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pendente'::public.dp_solicitacao_status THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta solicitação já foi respondida.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'aprovada'::public.dp_solicitacao_status
     AND v_row.tipo = 'folga'::public.dp_solicitacao_tipo
     AND v_row.data_alvo IS NOT NULL THEN
    SELECT c.unidade_id, c.cargo_id, c.setor_id INTO v_unidade, v_cargo, v_setor
      FROM public.dp_colaboradores c WHERE c.id = v_row.colaborador_id;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_row.company_id::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || v_row.data_alvo::text, 0));

    v_lim := public.dp_folga_limite_dia(
      v_row.company_id, v_unidade, v_cargo, v_row.data_alvo, v_row.colaborador_id, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Troca da folga fixa do fim de semana: o pedido guarda o dia oferecido em data_fim.
    v_troca := v_row.data_fim IS NOT NULL
           AND v_row.data_fim <> v_row.data_alvo
           AND extract(dow from v_row.data_fim)::smallint = ANY (
                 public.dp_dias_fixos_folga(v_row.colaborador_id, v_row.data_fim));

    IF v_troca THEN
      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'troca'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, v_uid,
              'Troca da folga do fim de semana de ' || to_char(v_row.data_fim, 'DD/MM/YYYY'))
      ON CONFLICT DO NOTHING;

      INSERT INTO public.dp_dia_trabalho_excepcional(
        company_id, colaborador_id, data, origem, solicitacao_id, criado_por)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_fim,
              'troca_fds', v_row.id, v_uid)
      ON CONFLICT (colaborador_id, data) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.dp_solicitacoes
     SET status = p_status,
         respondido_por = v_uid,
         respondido_em = now(),
         resposta_admin = NULLIF(btrim(COALESCE(p_resposta, '')), ''),
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id, 'status', p_status,
                            'limite', v_lim, 'troca_fds', v_troca);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_solicitacao_responder(uuid, dp_solicitacao_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_responder(uuid, dp_solicitacao_status, text) TO authenticated, service_role;
