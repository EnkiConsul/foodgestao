-- 1) Helper interno de leitura por empresa
CREATE OR REPLACE FUNCTION private.dp_pode_ler_empresa(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _company_id IS NOT NULL AND (
    auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'super_admin')
    OR private.is_company_member(auth.uid(), _company_id)
    OR private.is_dp_colaborador_of_company(auth.uid(), _company_id)
  );
$$;

REVOKE ALL ON FUNCTION private.dp_pode_ler_empresa(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Rotinas estritamente internas: somente o sistema executa
REVOKE ALL ON FUNCTION public.dp_calc_data_regra(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_calc_data_regra(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.dp_dias_descanso_validos(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_dias_descanso_validos(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.dp_ferias_recalc_periodo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_recalc_periodo(uuid) TO service_role;

-- 3) Consultas de configuração: somente quem tem acesso à empresa
CREATE OR REPLACE FUNCTION public.dp_config_resolvida(_company_id uuid, _unidade_id uuid DEFAULT NULL::uuid)
RETURNS dp_config_dp
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.*
  FROM public.dp_config_dp c
  WHERE c.company_id = _company_id
    AND private.dp_pode_ler_empresa(_company_id)
    AND (c.unidade_id = _unidade_id OR c.unidade_id IS NULL)
  ORDER BY (c.unidade_id IS NOT NULL) DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.dp_ferias_config(_company_id uuid, _unidade_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(aviso_antecedencia_dias smallint, adiantamento_13 text, fracionamento_max smallint, fracao_min_dias smallint, fracao_maior_dias smallint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(u.ferias_aviso_antecedencia_dias, e.ferias_aviso_antecedencia_dias, 60::smallint),
         COALESCE(u.ferias_adiantamento_13, e.ferias_adiantamento_13, 'legal'),
         COALESCE(u.ferias_fracionamento_max, e.ferias_fracionamento_max, 3::smallint),
         COALESCE(u.ferias_fracao_min_dias, e.ferias_fracao_min_dias, 5::smallint),
         COALESCE(u.ferias_fracao_maior_dias, e.ferias_fracao_maior_dias, 14::smallint)
  FROM (SELECT 1) x
  LEFT JOIN public.dp_config_dp e
    ON e.company_id = _company_id AND e.unidade_id IS NULL
  LEFT JOIN public.dp_config_dp u
    ON u.company_id = _company_id AND _unidade_id IS NOT NULL AND u.unidade_id = _unidade_id
  WHERE private.dp_pode_ler_empresa(_company_id)
$function$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_config(_company_id uuid)
RETURNS TABLE(prazo_retroativo_dias smallint, cobertura_aprovacao text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.ocorrencia_prazo_retroativo_dias, 3::smallint),
         COALESCE(c.ocorrencia_cobertura_aprovacao, 'sempre')
  FROM public.dp_config_dp c
  WHERE c.company_id = _company_id AND c.unidade_id IS NULL
    AND private.dp_pode_ler_empresa(_company_id)
  UNION ALL
  SELECT 3::smallint, 'sempre'
  WHERE private.dp_pode_ler_empresa(_company_id)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.dp_folgas_janela_efetiva(_company uuid, _unidade uuid DEFAULT NULL::uuid, _data_ref date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg record;
  v_tz text;
  v_hoje date;
  v_abre date;
  v_fecha date;
  v_comp date;
  v_estado text;
BEGIN
  IF _company IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa obrigatória.' USING ERRCODE = '22023';
  END IF;

  IF NOT private.dp_pode_ler_empresa(_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem acesso à empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT folga_janela_ativa, folga_janela_abre_dia, folga_janela_fecha_dia,
         folga_autoatribuir, folgas_fds_por_mes
    INTO v_cfg
    FROM public.dp_config_dp
   WHERE company_id = _company
     AND (unidade_id IS NULL OR unidade_id = _unidade)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  v_tz := public.dp_convocacao_timezone(_company, _unidade);
  v_hoje := COALESCE(_data_ref, (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date);

  v_comp := (date_trunc('month', v_hoje) + interval '1 month')::date;
  v_abre := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_abre_dia, 10) - 1);
  v_fecha := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_fecha_dia, 20) - 1);

  v_estado := CASE
    WHEN v_hoje < v_abre THEN 'antes'
    WHEN v_hoje > v_fecha THEN 'encerrada'
    ELSE 'aberta'
  END;

  RETURN jsonb_build_object(
    'ativa', COALESCE(v_cfg.folga_janela_ativa, false),
    'autoatribuir', COALESCE(v_cfg.folga_autoatribuir, true),
    'abre_dia', COALESCE(v_cfg.folga_janela_abre_dia, 10),
    'fecha_dia', COALESCE(v_cfg.folga_janela_fecha_dia, 20),
    'hoje', v_hoje,
    'abre_em', v_abre,
    'fecha_em', v_fecha,
    'competencia', v_comp,
    'folgas_exigidas', COALESCE(v_cfg.folgas_fds_por_mes, 1),
    'estado', v_estado);
END;
$function$;
