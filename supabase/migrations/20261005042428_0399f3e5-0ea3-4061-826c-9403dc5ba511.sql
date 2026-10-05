CREATE OR REPLACE FUNCTION public.dp_troca_assinar(p_id uuid, p_assinatura text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_colab uuid;
  t public.dp_trocas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  IF p_assinatura IS NULL OR left(p_assinatura, 22) <> 'data:image/png;base64,'
     OR length(p_assinatura) > 400000 OR substr(p_assinatura, 23) !~ '^[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'assinatura_invalida';
  END IF;
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RAISE EXCEPTION 'sem_acesso_portal'; END IF;
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'troca_nao_encontrada'; END IF;
  IF t.status IN ('cancelada','expirada','recusada') THEN RAISE EXCEPTION 'troca_nao_pendente'; END IF;
  IF t.solicitante_id = v_colab THEN
    IF t.solicitante_assinatura IS NULL THEN
      UPDATE public.dp_trocas SET solicitante_assinatura = p_assinatura, solicitante_assinado_em = now() WHERE id = p_id;
    END IF;
  ELSIF t.destino_id = v_colab THEN
    IF t.status NOT IN ('pendente_colega','aprovada','pendente_gestor') AND t.destino_assinatura IS NULL THEN RAISE EXCEPTION 'troca_nao_pendente'; END IF;
    IF t.destino_assinatura IS NULL THEN
      UPDATE public.dp_trocas SET destino_assinatura = p_assinatura, destino_assinado_em = now() WHERE id = p_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'troca_de_outro_colaborador';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;