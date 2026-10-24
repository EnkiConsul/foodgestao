CREATE OR REPLACE FUNCTION public.dp_desligamento_extrato_sincronizar(p_id uuid,p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.dp_desligamento_processos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'aviso_em_curso' THEN RAISE EXCEPTION 'Aviso não está em andamento'; END IF;
 IF NOT public.is_company_admin_or_owner((p->>'ator')::uuid,v.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF (p->>'versao')::integer IS DISTINCT FROM v.versao THEN RAISE EXCEPTION 'Aviso alterado: confira novamente'; END IF;
 IF p->'extrato_aviso'->'folgas_compensatorias' IS DISTINCT FROM v.folgas_compensatorias THEN RAISE EXCEPTION 'Compensação mudou: recalcule o aviso'; END IF;
 PERFORM private.dp_aviso_ocorrencias(p_id,p);
 UPDATE public.dp_ocorrencias o SET subtipo='banco_horas_aviso',desligamento_processo_id=v.id,justificativa_inicial='Folga compensatória de banco de horas no aviso prévio. Abonar no sistema externo de ponto; sem impacto em assiduidade ou férias.' FROM public.dp_folgas f WHERE o.folga_id=f.id AND f.desligamento_processo_id=v.id AND o.estado<>'cancelada';
 INSERT INTO public.dp_desligamento_eventos(processo_id,company_id,tipo,idempotency_key,versao_processo,depois,ator) VALUES(v.id,v.company_id,'extrato_sincronizado','extrato:'||v.versao::text||':'||md5((p->'extrato_aviso')::text),v.versao,jsonb_build_object('extrato_aviso',p->'extrato_aviso'),(p->>'ator')::uuid) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_extrato_sincronizar(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_extrato_sincronizar(uuid,jsonb) TO service_role;