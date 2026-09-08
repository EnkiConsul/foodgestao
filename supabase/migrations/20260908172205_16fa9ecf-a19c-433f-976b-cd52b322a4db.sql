CREATE OR REPLACE FUNCTION public.dp_pessoa_avulsa_definir_setor_dia(
  p_avulsa_id uuid,
  p_acao text,
  p_setor_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acao text := upper(coalesce(p_acao, ''));
  v_motivo text := NULLIF(btrim(coalesce(p_motivo, '')), '');
  v_reg record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_avulsa_id IS NULL OR v_acao NOT IN ('USAR_PADRAO', 'DEFINIR_SETOR') THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a pessoa e a ação.' USING ERRCODE = '22023';
  END IF;
  IF v_acao = 'DEFINIR_SETOR' AND p_setor_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o setor.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reg FROM public.dp_pessoas_avulsas WHERE id = p_avulsa_id;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: registro do dia inexistente.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_uid, v_reg.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem alterar o setor do dia.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_avulsa_id::text || '|setor_dia', 0));

  UPDATE public.dp_pessoas_avulsas
     SET setor_id = CASE WHEN v_acao = 'DEFINIR_SETOR' THEN p_setor_id ELSE NULL END,
         observacao = CASE
           WHEN v_motivo IS NULL THEN observacao
           ELSE btrim(coalesce(observacao || ' · ', '') || v_motivo)
         END,
         updated_at = now()
   WHERE id = p_avulsa_id;

  RETURN jsonb_build_object(
    'id', p_avulsa_id,
    'setor_id', CASE WHEN v_acao = 'DEFINIR_SETOR' THEN p_setor_id ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_operacao_alerta_dispensar(
  p_company uuid,
  p_unidade uuid,
  p_data date,
  p_previsto integer DEFAULT NULL,
  p_padrao integer DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_obs text := NULLIF(btrim(coalesce(p_observacao, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe empresa e data.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, p_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem resolver o alerta.'
      USING ERRCODE = '42501';
  END IF;
  IF p_unidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = p_unidade AND u.company_id = p_company
  ) THEN
    RAISE EXCEPTION 'UNIDADE_INVALIDA: unidade de outra empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_company::text || '|' || coalesce(p_unidade::text, '-') || '|' || p_data::text, 0));

  SELECT d.id INTO v_id
    FROM public.dp_operacao_alertas_dispensas d
   WHERE d.company_id = p_company
     AND d.data = p_data
     AND d.unidade_id IS NOT DISTINCT FROM p_unidade
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_operacao_alertas_dispensas
      (company_id, unidade_id, data, previsto_snapshot, padrao_snapshot, observacao, dispensado_por)
    VALUES (p_company, p_unidade, p_data, p_previsto, p_padrao, v_obs, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_operacao_alertas_dispensas
       SET previsto_snapshot = COALESCE(p_previsto, previsto_snapshot),
           padrao_snapshot = COALESCE(p_padrao, padrao_snapshot),
           observacao = COALESCE(v_obs, observacao),
           dispensado_por = v_uid
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'data', p_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_operacao_alerta_reverter(
  p_company uuid,
  p_unidade uuid,
  p_data date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_removidos integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe empresa e data.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, p_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem reabrir o alerta.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_company::text || '|' || coalesce(p_unidade::text, '-') || '|' || p_data::text, 0));

  WITH del AS (
    DELETE FROM public.dp_operacao_alertas_dispensas d
     WHERE d.company_id = p_company
       AND d.data = p_data
       AND d.unidade_id IS NOT DISTINCT FROM p_unidade
    RETURNING 1
  )
  SELECT count(*) INTO v_removidos FROM del;

  RETURN jsonb_build_object('removidos', v_removidos, 'data', p_data);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_pessoa_avulsa_definir_setor_dia(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_pessoa_avulsa_definir_setor_dia(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_pessoa_avulsa_definir_setor_dia(uuid, text, uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dp_operacao_alerta_dispensar(uuid, uuid, date, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_operacao_alerta_dispensar(uuid, uuid, date, integer, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_operacao_alerta_dispensar(uuid, uuid, date, integer, integer, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dp_operacao_alerta_reverter(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_operacao_alerta_reverter(uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_operacao_alerta_reverter(uuid, uuid, date)
  TO authenticated, service_role;