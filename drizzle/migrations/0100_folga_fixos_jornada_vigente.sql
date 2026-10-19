CREATE OR REPLACE FUNCTION private.dp_folga_fixos_dia(_company uuid, _unidade uuid, _data date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT count(*)::integer FROM public.dp_colaboradores c
 LEFT JOIN LATERAL (
  SELECT ct.* FROM public.dp_colaborador_config_trabalho ct
  WHERE ct.colaborador_id=c.id AND ct.company_id=c.company_id
   AND ct.vigencia_inicio<=_data AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim>=_data)
  ORDER BY ct.vigencia_inicio DESC,ct.id LIMIT 1
 ) cfg ON true
 WHERE c.company_id=_company AND c.ativo=true AND c.deleted_at IS NULL
  AND coalesce(cfg.unidade_id,c.unidade_id)=_unidade
  AND CASE WHEN cfg.id IS NOT NULL THEN
   NOT coalesce(cfg.folga_variavel,false) AND (
    cfg.folga_fixa_dow=extract(dow from _data)::integer OR EXISTS (
     SELECT 1 FROM public.dp_colaborador_config_dias d WHERE d.config_id=cfg.id
      AND d.dow=extract(dow from _data)::integer AND d.trabalha=false))
   ELSE c.folga_fixa_semana=extract(dow from _data)::integer END;
$$;
REVOKE ALL ON FUNCTION private.dp_folga_fixos_dia(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_fixos_dia(uuid,uuid,date) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_folga_fixos_periodo(p_company uuid,p_unidade uuid,p_inicio date,p_fim date)
RETURNS TABLE(data date,dow integer,quantidade integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF p_company IS NULL OR p_unidade IS NULL OR p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>62 THEN
  RAISE EXCEPTION 'INVALID_INPUT: informe uma unidade e um período de até 63 dias.';
 END IF;
 IF NOT public.dp_folga_escopo_empresa_ok(p_company) OR NOT EXISTS (SELECT 1 FROM public.dp_unidades u WHERE u.id=p_unidade AND u.company_id=p_company) THEN
  RAISE EXCEPTION 'FORBIDDEN: unidade fora do seu escopo.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT d::date,extract(dow from d)::integer,private.dp_folga_fixos_dia(p_company,p_unidade,d::date)
 FROM generate_series(p_inicio::timestamp,p_fim::timestamp,interval '1 day') d;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_folga_fixos_periodo(uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_fixos_periodo(uuid,uuid,date,date) TO authenticated,service_role;

DO $patch$
DECLARE src text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.dp_folga_limite_dia(uuid,uuid,uuid,date,uuid,uuid)'::regprocedure) INTO src;
 updated := replace(src,'v_reserva_ativa boolean := false;','v_reserva_ativa boolean := false; v_fixos integer := 0; v_maximo integer;');
 updated := replace(updated,'v_wd := EXTRACT(DOW FROM p_data)::int;','v_wd := EXTRACT(DOW FROM p_data)::int; v_fixos := CASE WHEN p_unidade IS NOT NULL THEN private.dp_folga_fixos_dia(p_company,p_unidade,p_data) ELSE 0 END;');
 updated := replace(updated,'v_regras := v_regras || jsonb_build_object(', 'v_maximo := CASE WHEN rec.tipo = ''quantidade'' AND NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id=rec.id) THEN GREATEST(rec.maximo,v_fixos) ELSE rec.maximo END; v_regras := v_regras || jsonb_build_object(');
 updated := replace(updated,'''limite'', rec.maximo','''limite'', v_maximo');
 updated := replace(updated,'GREATEST(rec.maximo - v_em_folga, 0)','GREATEST(v_maximo - v_em_folga, 0)');
 updated := replace(updated,'v_em_folga >= rec.maximo','v_em_folga >= v_maximo');
 updated := replace(updated,'IF v_wd BETWEEN 1 AND 5 AND p_unidade IS NOT NULL THEN','IF p_unidade IS NOT NULL THEN');
 updated := replace(updated,'AND c.ativo = true AND c.deleted_at IS NULL AND c.folga_fixa_semana = v_wd;','AND c.ativo = true AND c.deleted_at IS NULL AND c.folga_fixa_semana = v_wd; v_limite := v_fixos;');
 IF updated=src OR position('v_limite := v_fixos' in updated)=0 OR position('v_maximo := CASE' in updated)=0 THEN RAISE EXCEPTION 'Definição de limite inesperada: atualização interrompida.'; END IF;
 EXECUTE updated;
END;
$patch$;