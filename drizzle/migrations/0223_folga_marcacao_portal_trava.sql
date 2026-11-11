-- Trava da marcação de folga pelo portal (decisão da empresa/unidade).
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS folga_marcacao_portal boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.dp_config_dp.folga_marcacao_portal IS
  'true = colaborador marca, muda, remove, pede e troca folgas pelo portal; false = escala de folgas definida só pela administração (portal apenas consulta).';

CREATE OR REPLACE FUNCTION private.dp_folga_marcacao_portal_liberada(_company uuid, _unidade uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT c.folga_marcacao_portal FROM public.dp_config_dp c
     WHERE c.company_id = _company AND (c.unidade_id IS NULL OR c.unidade_id = _unidade)
     ORDER BY (c.unidade_id IS NOT NULL) DESC LIMIT 1
  ), true);
$$;

CREATE OR REPLACE FUNCTION private.dp_folga_portal_exigir_liberada()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT company_id, unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores WHERE id = v_colab;
  IF v_company IS NOT NULL AND NOT private.dp_folga_marcacao_portal_liberada(v_company, v_unidade) THEN
    RAISE EXCEPTION 'FOLGA_PORTAL_BLOQUEADA: a escala de folgas desta loja é definida pela administração.'
      USING ERRCODE = '42501';
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_folga_marcacao_portal_liberada(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_folga_portal_exigir_liberada() FROM PUBLIC, anon, authenticated;

-- Autoatendimento de folga do colaborador passa a respeitar a trava logo no início.
-- Reescreve só a primeira linha "BEGIN" de cada rotina (corpo atual preservado).
DO $mig$
DECLARE r record; v_def text; v_guard text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.oid IN (
         'public.dp_folga_marcar(date)'::regprocedure,
         'public.dp_folga_remarcar(date,date,text)'::regprocedure,
         'public.dp_folga_remarcar_solicitar(date,date,text)'::regprocedure,
         'public.dp_folga_remover(date)'::regprocedure,
         'public.dp_folga_solicitar(date,text,boolean)'::regprocedure,
         'public.dp_folga_troca_fds_solicitar(date,date,text)'::regprocedure,
         'public.dp_folga_substituir_pedido(uuid,text,date,date,text)'::regprocedure,
         'public.dp_troca_propor(uuid,date,date,text)'::regprocedure,
         'public.dp_solicitacao_criar(dp_solicitacao_tipo,date,date,text,text)'::regprocedure)
  LOOP
    v_def := pg_get_functiondef(r.oid);
    CONTINUE WHEN position('dp_folga_portal_exigir_liberada' IN v_def) > 0;
    v_guard := CASE WHEN r.proname = 'dp_solicitacao_criar'
      THEN E'BEGIN\n  IF p_tipo = ''folga''::public.dp_solicitacao_tipo THEN\n    PERFORM private.dp_folga_portal_exigir_liberada();\n  END IF;\n'
      ELSE E'BEGIN\n  PERFORM private.dp_folga_portal_exigir_liberada();\n' END;
    IF v_def !~ E'\\nBEGIN\\n' THEN
      RAISE EXCEPTION 'Rotina % sem BEGIN de topo', r.proname;
    END IF;
    v_def := regexp_replace(v_def, E'\\nBEGIN\\n', E'\n' || v_guard);
    EXECUTE v_def;
  END LOOP;

  -- Gravação das regras aceita a nova opção.
  v_def := pg_get_functiondef('public.dp_config_dp_salvar(uuid,uuid,jsonb,text,boolean)'::regprocedure);
  IF position('folga_marcacao_portal' IN v_def) = 0 THEN
    v_def := replace(v_def, '''folga_autoatribuir'',', '''folga_autoatribuir'',''folga_marcacao_portal'',');
    EXECUTE v_def;
  END IF;
END $mig$;

-- Janela efetiva informa a trava; portal travado = sem janela, lembretes nem distribuição automática.
CREATE OR REPLACE FUNCTION public.dp_folgas_janela_efetiva(_company uuid, _unidade uuid DEFAULT NULL::uuid, _data_ref date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg record; v_tz text; v_hoje date; v_abre date; v_fecha date; v_comp date; v_estado text;
  v_colab uuid; v_prioridade boolean := false; v_portal boolean;
BEGIN
  IF _company IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.dp_pode_ler_empresa(_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem acesso à empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT folga_janela_ativa, folga_janela_abre_dia, folga_janela_fecha_dia, folga_autoatribuir, folgas_fds_por_mes, folga_marcacao_portal
    INTO v_cfg FROM public.dp_config_dp
   WHERE company_id = _company AND (unidade_id IS NULL OR unidade_id = _unidade)
   ORDER BY (unidade_id IS NOT NULL) DESC LIMIT 1;
  v_portal := COALESCE(v_cfg.folga_marcacao_portal, true);

  v_tz := public.dp_convocacao_timezone(_company, _unidade);
  v_hoje := COALESCE(_data_ref, (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date);
  v_comp := (date_trunc('month', v_hoje) + interval '1 month')::date;
  v_abre := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_abre_dia, 10) - 1);
  v_fecha := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_fecha_dia, 20) - 1);

  IF auth.uid() IS NOT NULL THEN
    v_colab := public.dp_colaborador_ativo_of(auth.uid());
    IF v_colab IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.dp_colaboradores WHERE id = v_colab AND company_id = _company)
       AND private.dp_colab_tem_restricao_mes(v_colab, v_comp) THEN
      v_prioridade := true;
      IF v_abre > date_trunc('month', v_hoje)::date THEN v_abre := v_abre - 1; END IF;
    END IF;
  END IF;

  v_estado := CASE WHEN v_hoje < v_abre THEN 'antes' WHEN v_hoje > v_fecha THEN 'encerrada' ELSE 'aberta' END;

  RETURN jsonb_build_object(
    'ativa', COALESCE(v_cfg.folga_janela_ativa, false) AND v_portal,
    'autoatribuir', COALESCE(v_cfg.folga_autoatribuir, true) AND v_portal,
    'marcacao_portal', v_portal,
    'abre_dia', EXTRACT(DAY FROM v_abre)::int,
    'abre_dia_padrao', COALESCE(v_cfg.folga_janela_abre_dia, 10),
    'fecha_dia', COALESCE(v_cfg.folga_janela_fecha_dia, 20),
    'hoje', v_hoje, 'abre_em', v_abre, 'fecha_em', v_fecha, 'competencia', v_comp,
    'folgas_exigidas', COALESCE(v_cfg.folgas_fds_por_mes, 1),
    'prioridade', v_prioridade,
    'estado', v_estado);
END;
$function$;