CREATE OR REPLACE FUNCTION public.dp_portal_minhas_ocorrencias(_inicio date, _fim date, _offset integer DEFAULT 0, _limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE _colab uuid; _rows jsonb; _total bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PORTAL_SEM_SESSAO'; END IF;
  _colab := public.dp_colaborador_of(auth.uid());
  IF _colab IS NULL THEN RAISE EXCEPTION 'PORTAL_SEM_VINCULO'; END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _fim < _inicio OR _fim - _inicio > 366 OR _offset < 0 OR _limite < 1 OR _limite > 100 THEN RAISE EXCEPTION 'PORTAL_PERIODO_INVALIDO'; END IF;
  SELECT count(*) INTO _total FROM public.dp_ocorrencias o WHERE o.colaborador_id = _colab AND o.data_operacional BETWEEN _inicio AND _fim;
  SELECT coalesce(jsonb_agg(r.row ORDER BY r.data_operacional DESC, r.id DESC), '[]'::jsonb) INTO _rows FROM (
    SELECT o.id, o.data_operacional, jsonb_build_object(
      'id',o.id,'data_operacional',o.data_operacional,'tipo',o.tipo,'estado',o.estado,'origem',o.origem,
      'subtipo',o.subtipo,'folga_id',o.folga_id,'troca_id',o.troca_id,'minutos',o.minutos,
      'horario_estimado',o.horario_estimado,'horario_real',o.horario_real,'marcacao_alvo',o.marcacao_alvo,
      'justificativa_colaborador',CASE WHEN o.origem = 'colaborador' THEN o.justificativa_inicial ELSE NULL END,
      'analise_status',o.analise_status,'analisado_em',o.analisado_em,
      'impacta_assiduidade',o.impacta_assiduidade,'assiduidade_risco',o.assiduidade_risco,
      'assiduidade_decidido_em',o.assiduidade_decidido_em,'tratativa_status',o.tratativa_status
    ) AS row FROM public.dp_ocorrencias o WHERE o.colaborador_id = _colab AND o.data_operacional BETWEEN _inicio AND _fim
    ORDER BY o.data_operacional DESC, o.id DESC LIMIT _limite OFFSET _offset
  ) r;
  RETURN jsonb_build_object('itens',_rows,'total',_total);
END $fn$;
REVOKE ALL ON FUNCTION public.dp_portal_minhas_ocorrencias(date,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_minhas_ocorrencias(date,date,integer,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.dp_portal_minhas_ocorrencias(date,date,integer,integer) IS 'Own occurrence history: session-scoped, explicit public fields, paginated; no internal notes or medical files.';