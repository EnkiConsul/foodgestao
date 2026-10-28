CREATE OR REPLACE FUNCTION public.dp_ocorrencia_ajustar_horario(
  _ocorrencia_id uuid,
  _horario_real time,
  _observacao text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF _horario_real IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_HORARIO_OBRIGATORIO'; END IF;
  IF COALESCE(btrim(_observacao),'') = '' THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_member(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;
  IF o.tipo NOT IN ('esquecimento_marcacao','divergencia_jornada') THEN RAISE EXCEPTION 'OCORRENCIA_TIPO_SEM_AJUSTE'; END IF;

  UPDATE public.dp_ocorrencias SET
    horario_real = _horario_real,
    tratativa_ponto = true,
    tratativa_status = 'concluida'::public.dp_ocorrencia_tratativa_status,
    tratativa_decisao = 'confirmada',
    tratativa_observacao = btrim(_observacao),
    lancado_ponto_em = NULL,
    lancado_ponto_por = NULL
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'horario_ajustado_gestor', 'horario_real',
          o.horario_real::text, _horario_real::text,
          jsonb_build_object('observacao', btrim(_observacao), 'decisao_anterior', o.tratativa_decisao), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.dp_ocorrencia_ajustar_horario(uuid, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_ajustar_horario(uuid, time, text) TO authenticated;