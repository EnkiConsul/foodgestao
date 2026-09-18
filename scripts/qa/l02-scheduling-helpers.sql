-- Manual synthetic homologation only; verify the connection before setting
-- aveto.test_project_ref = 'utjhzpdbqzajrhnzcher'. Never run in production.
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
 INSERT INTO public.dp_unidades(company_id,nome) VALUES(c,'L02 AGENDA FICTICIA') RETURNING id INTO unit;
 INSERT INTO public.dp_cargos(company_id,nome) VALUES(c,'L02 AGENDA FICTICIA') RETURNING id INTO cargo;
 INSERT INTO public.dp_colaboradores(company_id,nome,unidade_id,cargo_id,regime,forma_pagamento,valor_hora) VALUES(c,'L02 AGENDA FICTICIA',unit,cargo,'intermitente','horista',37) RETURNING id INTO emp;
 INSERT INTO public.dp_folgas(company_id,colaborador_id,data) VALUES(c,emp,'2026-10-21');
 INSERT INTO public.dp_convocacao_grupos(company_id,unidade_id,competencia,modalidade) VALUES(c,unit,'2026-10','aberta') RETURNING id INTO grp;
 INSERT INTO public.dp_convocacao_ocorrencias(company_id,grupo_id,unidade_id,cargo_id,data,necessidade_entrada,necessidade_saida,horario_modo,entrada,saida,intervalo_minutos,termina_no_dia_seguinte,carga_prevista_horas)
 VALUES(c,grp,unit,cargo,'2026-10-20','09:00','17:00','horario_unico','09:00','17:00',0,false,8) RETURNING id INTO occ;
 INSERT INTO public.dp_convocacao_destinatarios(company_id,grupo_id,colaborador_id,ocorrencia_id,entrada,saida,intervalo_minutos)
 VALUES(c,grp,emp,occ,'09:00','17:00',0);
 PERFORM set_config('l02.emp',emp::text,true); PERFORM set_config('l02.grp',grp::text,true); PERFORM set_config('l02.occ',occ::text,true);
END $seed$;

SET LOCAL ROLE authenticated;
DO $denied$ BEGIN
 BEGIN PERFORM * FROM public.dp_ferias_periodo_conflitos(current_setting('l02.emp')::uuid,'2026-10-21','2026-10-21'); RAISE EXCEPTION 'conflicts still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.dp_convocacao_avaliar_candidato(current_setting('l02.emp')::uuid,current_setting('l02.occ')::uuid,NULL,true); RAISE EXCEPTION 'candidate still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.dp_convocacao_horario_efetivo(current_setting('l02.occ')::uuid,current_setting('l02.emp')::uuid,'{"apto":true}'::jsonb); RAISE EXCEPTION 'schedule still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
DO $foreign_group$ BEGIN
 BEGIN PERFORM public.dp_convocacao_pre_avaliar_grupo(current_setting('l02.grp')::uuid); RAISE EXCEPTION 'foreign group allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_group$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $denied$ BEGIN
 BEGIN PERFORM * FROM public.dp_ferias_periodo_conflitos(current_setting('l02.emp')::uuid,'2026-10-21','2026-10-21'); RAISE EXCEPTION 'conflicts still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.dp_convocacao_avaliar_candidato(current_setting('l02.emp')::uuid,current_setting('l02.occ')::uuid,NULL,true); RAISE EXCEPTION 'candidate still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.dp_convocacao_horario_efetivo(current_setting('l02.occ')::uuid,current_setting('l02.emp')::uuid,'{"apto":true}'::jsonb); RAISE EXCEPTION 'schedule still exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
DO $own_identity$ DECLARE u uuid; BEGIN
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-d@example.invalid';
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
END $own_identity$;
SET LOCAL ROLE authenticated;
DO $own_group$ DECLARE v jsonb; BEGIN
 v:=public.dp_convocacao_pre_avaliar_grupo(current_setting('l02.grp')::uuid);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'linhas') x WHERE x->>'colaborador_id'=current_setting('l02.emp') AND (x->>'apto')::boolean AND x->>'entrada'='09:00:00' AND x->>'saida'='17:00:00') THEN RAISE EXCEPTION 'authorized nested evaluation broken: %',v; END IF;
END $own_group$;
RESET ROLE;
INSERT INTO public.auth_user_security_state(user_id,access_blocked) VALUES(current_setting('request.jwt.claim.sub')::uuid,true) ON CONFLICT(user_id) DO UPDATE SET access_blocked=true;
SET LOCAL ROLE authenticated;
DO $blocked_group$ BEGIN
 BEGIN PERFORM public.dp_convocacao_pre_avaliar_grupo(current_setting('l02.grp')::uuid); RAISE EXCEPTION 'blocked owner allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $blocked_group$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $service$ DECLARE v jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dp_ferias_periodo_conflitos(current_setting('l02.emp')::uuid,'2026-10-21','2026-10-21') WHERE origem='folga') THEN RAISE EXCEPTION 'service conflicts broken'; END IF;
 v:=public.dp_convocacao_avaliar_candidato(current_setting('l02.emp')::uuid,current_setting('l02.occ')::uuid,NULL,true);
 IF (v#>>'{remuneracao,valor_previsto}')::numeric IS DISTINCT FROM 296 THEN RAISE EXCEPTION 'service candidate broken: %',v; END IF;
 v:=public.dp_convocacao_horario_efetivo(current_setting('l02.occ')::uuid,current_setting('l02.emp')::uuid,'{"apto":true}'::jsonb);
 IF (v#>>'{remuneracao_snapshot,valor_previsto}')::numeric IS DISTINCT FROM 296 THEN RAISE EXCEPTION 'service schedule broken: %',v; END IF;
END $service$;
RESET ROLE;
SELECT 'three direct helpers denied for authenticated/anon; foreign and blocked group access denied; own group nested evaluation passed; service conflicts and remuneration preserved' result;
ROLLBACK;
