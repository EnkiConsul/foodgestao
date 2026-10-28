CREATE OR REPLACE FUNCTION public.dp_ocorrencia_editar_registro(
  _ocorrencia_id uuid, _horario_real time, _marcacao_alvo public.dp_ocorrencia_marcacao,
  _observacao text, _horario_anterior time, _marcacao_anterior public.dp_ocorrencia_marcacao,
  _concluir boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; m public.dp_ocorrencia_marcacao;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
  IF _horario_real IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_HORARIO_OBRIGATORIO'; END IF;
  IF length(COALESCE(btrim(_observacao),'')) < 3 THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;
  IF o.tipo NOT IN ('esquecimento_marcacao','divergencia_jornada') THEN RAISE EXCEPTION 'OCORRENCIA_TIPO_SEM_AJUSTE'; END IF;
  IF o.horario_real IS DISTINCT FROM _horario_anterior OR o.marcacao_alvo IS DISTINCT FROM _marcacao_anterior THEN RAISE EXCEPTION 'OCORRENCIA_REGISTRO_DESATUALIZADO'; END IF;
  m := COALESCE(_marcacao_alvo, o.marcacao_alvo);
  IF o.tipo = 'esquecimento_marcacao' AND m IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_MARCACAO_OBRIGATORIA'; END IF;
  UPDATE public.dp_ocorrencias SET horario_real = _horario_real, marcacao_alvo = m,
    tratativa_ponto = CASE WHEN _concluir THEN true ELSE tratativa_ponto END,
    tratativa_status = CASE WHEN _concluir THEN 'concluida'::public.dp_ocorrencia_tratativa_status ELSE tratativa_status END,
    tratativa_decisao = CASE WHEN _concluir THEN 'confirmada' ELSE tratativa_decisao END,
    tratativa_observacao = CASE WHEN _concluir THEN btrim(_observacao) ELSE tratativa_observacao END,
    analise_status = CASE WHEN _concluir THEN 'analisada'::public.dp_ocorrencia_analise_status ELSE analise_status END,
    analisado_por = CASE WHEN _concluir THEN auth.uid() ELSE analisado_por END,
    analisado_em = CASE WHEN _concluir THEN now() ELSE analisado_em END,
    lancado_ponto_em = NULL, lancado_ponto_por = NULL
  WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos(company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, o.id, 'registro_retificado_gestor', 'registro',
    jsonb_build_object('horario_real',o.horario_real,'marcacao_alvo',o.marcacao_alvo)::text,
    jsonb_build_object('horario_real',_horario_real,'marcacao_alvo',m)::text,
    jsonb_build_object('observacao',btrim(_observacao),'decisao_anterior',o.tratativa_decisao,'concluiu_tratativa',_concluir),auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.dp_ocorrencia_editar_registro(uuid,time,public.dp_ocorrencia_marcacao,text,time,public.dp_ocorrencia_marcacao,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_editar_registro(uuid,time,public.dp_ocorrencia_marcacao,text,time,public.dp_ocorrencia_marcacao,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.dp_ocorrencia_editar_registro(uuid,time,public.dp_ocorrencia_marcacao,text,time,public.dp_ocorrencia_marcacao,boolean) IS 'Retificação auditada por gestor; preserva justificativa original e decisões quando edição não conclui a conferência; valida versão do fato sob lock.';
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_ajustar_horario(_ocorrencia_id uuid, _horario_real time, _observacao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  PERFORM public.dp_ocorrencia_editar_registro(_ocorrencia_id,_horario_real,o.marcacao_alvo,_observacao,o.horario_real,o.marcacao_alvo,true);
END; $$;
REVOKE ALL ON FUNCTION public.dp_ocorrencia_ajustar_horario(uuid,time,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_ajustar_horario(uuid,time,text) TO authenticated, service_role;