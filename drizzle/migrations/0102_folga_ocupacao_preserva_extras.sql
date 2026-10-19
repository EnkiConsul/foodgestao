CREATE OR REPLACE FUNCTION private.dp_folga_ocupa_vaga(_colab uuid,_data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT (
  EXISTS (
   SELECT 1 FROM public.dp_colaboradores c
   LEFT JOIN LATERAL (
    SELECT ct.* FROM public.dp_colaborador_config_trabalho ct
    WHERE ct.colaborador_id=c.id AND ct.company_id=c.company_id
     AND ct.vigencia_inicio<=_data AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim>=_data)
    ORDER BY ct.vigencia_inicio DESC,ct.id LIMIT 1
   ) cfg ON true
   WHERE c.id=_colab AND c.ativo=true AND c.deleted_at IS NULL
    AND CASE WHEN cfg.id IS NOT NULL THEN NOT coalesce(cfg.folga_variavel,false) AND (
     cfg.folga_fixa_dow=extract(dow from _data)::integer OR EXISTS (
      SELECT 1 FROM public.dp_colaborador_config_dias d WHERE d.config_id=cfg.id
       AND d.dow=extract(dow from _data)::integer AND d.trabalha=false))
    ELSE c.folga_fixa_semana=extract(dow from _data)::integer END
  )
  OR EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=_colab AND f.data=_data AND f.status<>'cancelada' AND f.extra=false AND f.tipo NOT IN ('ferias','licenca'))
  OR (EXISTS (SELECT 1 FROM public.dp_solicitacoes s WHERE s.colaborador_id=_colab AND s.tipo='folga' AND s.data_alvo=_data AND s.status='aprovada')
   AND NOT EXISTS (SELECT 1 FROM public.dp_folgas f2 WHERE f2.colaborador_id=_colab AND f2.data=_data AND f2.status<>'cancelada' AND f2.extra=true))
 )
 AND NOT (extract(dow from _data)::integer=0 AND 0::smallint=ANY(coalesce(public.dp_dias_fixos_folga(_colab,_data),'{}'::smallint[])));
$$;
REVOKE ALL ON FUNCTION private.dp_folga_ocupa_vaga(uuid,date) FROM PUBLIC,anon;
