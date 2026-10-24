CREATE OR REPLACE FUNCTION public.dp_preadmissao_correcao_gestor(p_preadmissao_id uuid, p_ator uuid, p_acao text, p_motivo text, p_versao integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pa record; convite record; resultado jsonb; prazo timestamptz; evento_nome text;
BEGIN
  IF p_ator IS NULL OR p_versao IS NULL OR p_versao < 1 OR p_acao NOT IN ('solicitar','retomar') OR p_acao IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','entrada_invalida');
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 OR length(p_motivo) > 1000 THEN
    RETURN jsonb_build_object('ok',false,'motivo','motivo_invalido');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text,0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id=p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL OR pa.removido_em IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'motivo','nao_encontrada'); END IF;
  IF pa.versao <> p_versao THEN RETURN jsonb_build_object('ok',false,'motivo','versao_alterada','status',pa.status); END IF;
  IF p_acao='solicitar' THEN
    IF pa.status NOT IN ('aguardando_revisao','aguardando_nova_versao','em_preenchimento') THEN
      RETURN jsonb_build_object('ok',false,'motivo','status_inesperado','status',pa.status);
    END IF;
    SELECT * INTO convite FROM public.dp_preadmissao_convites
      WHERE preadmissao_id=pa.id AND company_id=pa.company_id AND revoked_at IS NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF convite.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','convite_revogado'); END IF;
    prazo := greatest(convite.expires_at,now()+interval '7 days');
    resultado := public.dp_preadmissao_transicionar_versionado(pa.id,ARRAY[pa.status],'correcao_solicitada',
      jsonb_build_object('correcao_motivo',btrim(p_motivo),'revisado_em',true,'revisado_por',p_ator),p_versao);
    IF NOT coalesce((resultado->>'ok')::boolean,false) THEN RETURN resultado; END IF;
    UPDATE public.dp_preadmissao_convites SET expires_at=prazo,updated_at=now() WHERE id=convite.id;
    evento_nome := 'correcao_solicitada';
  ELSE
    IF pa.status NOT IN ('correcao_solicitada','aguardando_nova_versao') THEN
      RETURN jsonb_build_object('ok',false,'motivo','status_inesperado','status',pa.status);
    END IF;
    resultado := public.dp_preadmissao_transicionar_versionado(pa.id,ARRAY[pa.status],'aguardando_revisao',
      jsonb_build_object('correcao_motivo',null,'revisado_em',true,'revisado_por',p_ator),p_versao);
    IF NOT coalesce((resultado->>'ok')::boolean,false) THEN RETURN resultado; END IF;
    evento_nome := 'conferencia_retomada_gestor';
  END IF;
  INSERT INTO public.dp_preadmissao_eventos(preadmissao_id,company_id,evento,detalhe,actor_user_id)
    VALUES(pa.id,pa.company_id,evento_nome,jsonb_build_object('motivo',btrim(p_motivo),
      'correcao_anterior',pa.correcao_motivo,'status_anterior',pa.status,'versao_anterior',pa.versao,
      'versao',resultado->'versao','expires_at',prazo),p_ator);
  RETURN resultado || jsonb_build_object('expires_at',prazo);
END;
$$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_correcao_gestor(uuid,uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_correcao_gestor(uuid,uuid,text,text,integer) TO service_role;
COMMENT ON FUNCTION public.dp_preadmissao_correcao_gestor(uuid,uuid,text,text,integer) IS 'Service-only: authorized manager edge validates company access; correction/retake, version and audit are atomic; invite token never changes; retake does not approve or effectivate.';