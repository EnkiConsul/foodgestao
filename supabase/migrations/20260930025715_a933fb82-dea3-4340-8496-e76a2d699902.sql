-- 1) Portal: dias de trabalho excepcional (folga semanal cedida em troca) da equipe da unidade
CREATE OR REPLACE FUNCTION public.dp_portal_trabalho_excepcional(_de date, _ate date)
RETURNS TABLE(colaborador_id uuid, data date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid;
BEGIN
  IF _de IS NULL OR _ate IS NULL OR _ate < _de THEN RETURN; END IF;
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade
    FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.colaborador_id, e.data
    FROM public.dp_dia_trabalho_excepcional e
    JOIN public.dp_colaboradores c ON c.id = e.colaborador_id
   WHERE e.company_id = v_company
     AND e.data BETWEEN _de AND _ate
     AND (v_unidade IS NULL OR c.unidade_id = v_unidade);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_trabalho_excepcional(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_portal_trabalho_excepcional(date, date) TO authenticated;

-- 2) Atribuição de folga pelo gestor com triagem explícita
CREATE OR REPLACE FUNCTION public.dp_folga_atribuir_admin_v2(
  p_colaborador uuid,
  p_data date,
  p_modo text,
  p_folga_substituir_id uuid DEFAULT NULL,
  p_data_trabalho date DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade uuid;
  v_res jsonb;
  v_sub uuid[] := NULL;
  v_fixos smallint[];
  v_obs text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_modo, '') NOT IN ('extra', 'substituir_fds', 'troca_semanal') THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o tipo da folga (extra, substituir_fds ou troca_semanal).'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade
    FROM public.dp_colaboradores c
   WHERE c.id = p_colaborador AND c.ativo = true AND c.deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_modo = 'substituir_fds' THEN
    IF p_folga_substituir_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a folga que será substituída.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.id = p_folga_substituir_id
         AND f.colaborador_id = p_colaborador
         AND f.company_id = v_company
         AND f.status <> 'cancelada'
    ) THEN
      RAISE EXCEPTION 'NOT_FOUND: a folga informada não está ativa para este colaborador.'
        USING ERRCODE = '22023';
    END IF;
    v_sub := ARRAY[p_folga_substituir_id];
    v_obs := btrim(concat_ws(' ', 'Substituição da folga de fim de semana.', NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  ELSIF p_modo = 'troca_semanal' THEN
    IF p_data_trabalho IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe o dia de folga semanal que será trabalhado.'
        USING ERRCODE = '22023';
    END IF;
    v_fixos := public.dp_dias_fixos_folga(p_colaborador, p_data_trabalho);
    IF NOT (EXTRACT(DOW FROM p_data_trabalho)::smallint = ANY(COALESCE(v_fixos, '{}'::smallint[]))) THEN
      RAISE EXCEPTION 'INVALID_INPUT: o dia informado não é folga semanal fixa deste colaborador.'
        USING ERRCODE = '22023';
    END IF;
    v_obs := btrim(concat_ws(' ',
      'Troca da folga semanal de ' || to_char(p_data_trabalho, 'DD/MM/YYYY') || '.',
      NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  ELSE
    v_obs := btrim(concat_ws(' ', 'Folga extra.', NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  END IF;

  v_res := public.dp_folga_criar_admin(
    p_colaborador_id => p_colaborador,
    p_data => p_data,
    p_tipo => 'normal',
    p_extra => (p_modo = 'extra'),
    p_observacao => v_obs,
    p_confirmar_deficit => false,
    p_substituir_ids => v_sub);

  IF COALESCE((v_res->>'ok')::boolean, false) = false THEN
    RETURN v_res;
  END IF;

  IF p_modo = 'substituir_fds' THEN
    INSERT INTO public.dp_folgas_canceladas(
      company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    SELECT v_company, p_colaborador, f.id, f.data,
           'Substituída pela folga de ' || to_char(p_data, 'DD/MM/YYYY') || '.',
           'admin_substituicao', v_uid
      FROM public.dp_folgas f
     WHERE f.id = p_folga_substituir_id;
  ELSIF p_modo = 'troca_semanal' THEN
    INSERT INTO public.dp_dia_trabalho_excepcional(
      company_id, colaborador_id, data, origem, criado_por)
    VALUES (v_company, p_colaborador, p_data_trabalho, 'troca_semanal_admin', v_uid)
    ON CONFLICT (colaborador_id, data) DO UPDATE
      SET origem = 'troca_semanal_admin', updated_at = now();
  END IF;

  PERFORM public.insert_audit_log(
    'folga_atribuida_admin_triagem', 'dp_folgas', (v_res->>'folga_id'),
    jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador,
                       'data', p_data, 'modo', p_modo,
                       'folga_substituida', p_folga_substituir_id,
                       'data_trabalho', p_data_trabalho));

  RETURN v_res || jsonb_build_object('modo', p_modo);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_atribuir_admin_v2(uuid, date, text, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_atribuir_admin_v2(uuid, date, text, uuid, date, text) TO authenticated;