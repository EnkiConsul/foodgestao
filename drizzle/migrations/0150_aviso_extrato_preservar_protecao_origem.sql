DO $$ DECLARE f text; BEGIN
 f:=pg_get_functiondef('public.dp_desligamento_extrato_sincronizar(uuid,jsonb)'::regprocedure);
 f:=replace(f,'UPDATE public.dp_ocorrencias o SET subtipo=''banco_horas_aviso'',desligamento_processo_id=v.id,justificativa_inicial=''Folga compensatória de banco de horas no aviso prévio. Abonar no sistema externo de ponto; sem impacto em assiduidade ou férias.'' FROM public.dp_folgas f WHERE o.folga_id=f.id AND f.desligamento_processo_id=v.id AND o.estado<>''cancelada'';', 'UPDATE public.dp_folgas SET observacao=observacao WHERE desligamento_processo_id=v.id AND status<>''cancelada'';');
 EXECUTE f;
END $$;