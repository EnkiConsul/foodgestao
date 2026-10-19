DO $patch$
DECLARE src text; updated text;
BEGIN
 SELECT pg_get_functiondef('private.dp_folga_ocupa_vaga(uuid,date)'::regprocedure) INTO src;
 updated:=replace(src,'EXISTS (SELECT 1 FROM public.dp_folgas f', 'EXISTS (
 SELECT 1 FROM public.dp_colaboradores c
 LEFT JOIN LATERAL (
 SELECT ct.* FROM public.dp_colaborador_config_trabalho ct WHERE ct.colaborador_id=c.id AND ct.company_id=c.company_id
 AND ct.vigencia_inicio<=_data AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim>=_data)
 ORDER BY ct.vigencia_inicio DESC,ct.id LIMIT 1
 ) cfg ON true
 WHERE c.id=_colab AND c.ativo=true AND c.deleted_at IS NULL
 AND CASE WHEN cfg.id IS NOT NULL THEN NOT coalesce(cfg.folga_variavel,false) AND (
 cfg.folga_fixa_dow=extract(dow from _data)::integer OR EXISTS (
 SELECT 1 FROM public.dp_colaborador_config_dias d WHERE d.config_id=cfg.id AND d.dow=extract(dow from _data)::integer AND d.trabalha=false))
 ELSE c.folga_fixa_semana=extract(dow from _data)::integer END
 ) OR EXISTS (SELECT 1 FROM public.dp_folgas f');
 IF updated=src THEN RAISE EXCEPTION 'Definição de ocupação inesperada: atualização interrompida.'; END IF;
 EXECUTE updated;
END;
$patch$;