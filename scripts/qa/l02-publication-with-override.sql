-- Manual synthetic homologation only. Verify target before setting
-- aveto.test_project_ref = 'utjhzpdbqzajrhnzcher'. No production execution.
BEGIN;
DO $target$ BEGIN
 IF current_setting('aveto.test_project_ref',true) IS DISTINCT FROM 'utjhzpdbqzajrhnzcher' THEN RAISE EXCEPTION 'Explicit synthetic target required'; END IF;
END $target$;
DO $seed$
DECLARE c uuid; u uuid; unit uuid; cargo uuid; emp uuid; grp uuid; occ uuid;
BEGIN
 SELECT id INTO STRICT c FROM public.companies WHERE name='HOMOLOGAÇÃO L01 Empresa 2';
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-a@example.invalid';
 IF EXISTS(SELECT 1 FROM public.company_members WHERE company_id=c AND user_id=u) THEN RAISE EXCEPTION 'fixture not isolated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.dp_unidades(company_id,nome) VALUES(c,'L02 FLUXO FICTICIO') RETURNING id INTO unit;
 INSERT INTO public.dp_cargos(company_id,nome) VALUES(c,'L02 FLUXO FICTICIO') RETURNING id INTO cargo;
 INSERT INTO public.dp_colaboradores(company_id,nome,unidade_id,cargo_id,regime,forma_pagamento,valor_hora) VALUES(c,'L02 FLUXO FICTICIO',unit,cargo,'intermitente','horista',37) RETURNING id INTO emp;
 INSERT INTO public.dp_folgas(company_id,colaborador_id,data) VALUES(c,emp,(current_date+33));
 INSERT INTO public.dp_convocacao_grupos(company_id,unidade_id,competencia,modalidade) VALUES(c,unit,to_char(current_date+32,'YYYY-MM'),'aberta') RETURNING id INTO grp;
 INSERT INTO public.dp_convocacao_ocorrencias(company_id,grupo_id,unidade_id,cargo_id,data,necessidade_entrada,necessidade_saida,horario_modo,entrada,saida,intervalo_minutos,termina_no_dia_seguinte,carga_prevista_horas)
 VALUES(c,grp,unit,cargo,(current_date+32),'09:00','17:00','horario_unico','09:00','17:00',0,false,8) RETURNING id INTO occ;
 INSERT INTO public.dp_convocacao_destinatarios(company_id,grupo_id,colaborador_id,ocorrencia_id,entrada,saida,intervalo_minutos)
 VALUES(c,grp,emp,occ,'09:00','17:00',0);
 PERFORM set_config('l02.emp',emp::text,true); PERFORM set_config('l02.grp',grp::text,true); PERFORM set_config('l02.occ',occ::text,true);
END $seed$;
DO $worker$ DECLARE u uuid; BEGIN
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-b@example.invalid';
 IF EXISTS(SELECT 1 FROM public.dp_colaboradores WHERE user_id=u) THEN RAISE EXCEPTION 'worker fixture occupied'; END IF;
 DELETE FROM public.company_members WHERE user_id=u;
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE email='l01-d@example.invalid'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
 UPDATE public.dp_colaboradores SET user_id=u WHERE id=current_setting('l02.emp')::uuid;
 PERFORM set_config('l02.worker',u::text,true);
 PERFORM set_config('l02.version',(SELECT updated_at::text FROM public.dp_convocacao_grupos WHERE id=current_setting('l02.grp')::uuid),true);
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE email='l01-a@example.invalid'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
END $worker$;

SET LOCAL ROLE authenticated;
DO $foreign$ BEGIN
 BEGIN PERFORM public.dp_convocacao_publicar_grupo(current_setting('l02.grp')::uuid,current_setting('l02.version')::timestamptz,'[]'::jsonb); RAISE EXCEPTION 'foreign publication permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
RESET ROLE;
DO $owner$ DECLARE u uuid; BEGIN
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-d@example.invalid';
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
END $owner$;
SET LOCAL ROLE authenticated;
DO $publish$ DECLARE v jsonb; BEGIN
 v:=public.dp_convocacao_publicar_grupo(current_setting('l02.grp')::uuid,current_setting('l02.version')::timestamptz,'[]'::jsonb);
 IF v->>'status' IS DISTINCT FROM 'publicado' OR (v->>'ofertas')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'publication failed: %',v; END IF;
 v:=public.dp_convocacao_publicar_grupo(current_setting('l02.grp')::uuid,current_setting('l02.version')::timestamptz,'[]'::jsonb);
 IF (v->>'idempotente')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'publication repeat not idempotent: %',v; END IF;
END $publish$;
RESET ROLE;
DO $offer$ DECLARE v record; BEGIN
 SELECT * INTO STRICT v FROM public.dp_convocacoes WHERE ocorrencia_id=current_setting('l02.occ')::uuid;
 IF v.regime_snapshot::text IS DISTINCT FROM 'intermitente' OR v.compatibilidade IS DISTINCT FROM 'integral' OR v.status::text <> 'pendente' OR (v.remuneracao_snapshot->>'valor_previsto')::numeric IS DISTINCT FROM 296 THEN RAISE EXCEPTION 'offer snapshot incorrect'; END IF;
 PERFORM set_config('l02.offer',v.id::text,true);
END $offer$;

SET LOCAL ROLE authenticated;
DO $notworker$ BEGIN
 BEGIN PERFORM public.dp_convocacao_responder_oferta(current_setting('l02.offer')::uuid,true,NULL::text,NULL::time,NULL::time,NULL::boolean,NULL::text,NULL::text); RAISE EXCEPTION 'owner accepted worker offer'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $notworker$;
RESET ROLE;
DO $worker_identity$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('l02.worker'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('l02.worker'),'role','authenticated')::text,true);
END $worker_identity$;
SET LOCAL ROLE authenticated;
DO $accept$ DECLARE v jsonb; BEGIN
 v:=public.dp_convocacao_responder_oferta(current_setting('l02.offer')::uuid,true,NULL::text,NULL::time,NULL::time,NULL::boolean,NULL::text,NULL::text);
 IF v->>'status' IS DISTINCT FROM 'aceita' OR (v->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'accept failed: %',v; END IF;
 v:=public.dp_convocacao_responder_oferta(current_setting('l02.offer')::uuid,true,NULL::text,NULL::time,NULL::time,NULL::boolean,NULL::text,NULL::text);
 IF (v->>'idempotente')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'accept repeat not idempotent: %',v; END IF;
END $accept$;
RESET ROLE;
DO $final$ BEGIN
 IF (SELECT count(*) FROM public.dp_convocacoes WHERE ocorrencia_id=current_setting('l02.occ')::uuid) <> 1 THEN RAISE EXCEPTION 'duplicate offer'; END IF;
 IF (SELECT status FROM public.dp_convocacao_ocorrencias WHERE id=current_setting('l02.occ')::uuid) <> 'preenchida' THEN RAISE EXCEPTION 'occurrence not filled'; END IF;
END $final$;
SELECT 'foreign publication denied; own publication and repeat passed; salary snapshot preserved; non-worker acceptance denied; worker acceptance and repeat passed; one offer and filled occurrence' result;
ROLLBACK;
