-- Synthetic homologation only; verify destination before setting aveto.test_project_ref.
BEGIN;
DO $target$ BEGIN
 IF current_setting('aveto.test_project_ref',true) IS DISTINCT FROM 'utjhzpdbqzajrhnzcher' THEN RAISE EXCEPTION 'Explicit synthetic target required'; END IF;
END $target$;
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM public.dp_unidades WHERE nome='L02 CONC REOFERTA 20260918') THEN RAISE EXCEPTION 'fixture exists'; END IF; END $guard$;
DO $seed$
DECLARE c uuid; u uuid; unit uuid; cargo uuid; emp uuid; grp uuid; occ uuid;
BEGIN
 SELECT id INTO STRICT c FROM public.companies WHERE name='HOMOLOGAÇÃO L01 Empresa 2';
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-a@example.invalid';
 IF EXISTS(SELECT 1 FROM public.company_members WHERE company_id=c AND user_id=u) THEN RAISE EXCEPTION 'fixture not isolated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.dp_unidades(company_id,nome) VALUES(c,'L02 CONC REOFERTA 20260918') RETURNING id INTO unit;
 INSERT INTO public.dp_cargos(company_id,nome) VALUES(c,'L02 CONC REOFERTA 20260918') RETURNING id INTO cargo;
 INSERT INTO public.dp_colaboradores(company_id,nome,unidade_id,cargo_id,regime,forma_pagamento,valor_hora) VALUES(c,'L02 CONC REOFERTA 20260918',unit,cargo,'intermitente','horista',37) RETURNING id INTO emp;
 INSERT INTO public.dp_folgas(company_id,colaborador_id,data) VALUES(c,emp,(current_date+33));
 INSERT INTO public.dp_convocacao_grupos(company_id,unidade_id,competencia,modalidade) VALUES(c,unit,to_char(current_date+32,'YYYY-MM'),'aberta') RETURNING id INTO grp;
 INSERT INTO public.dp_convocacao_ocorrencias(company_id,grupo_id,unidade_id,cargo_id,data,necessidade_entrada,necessidade_saida,horario_modo,entrada,saida,intervalo_minutos,termina_no_dia_seguinte,carga_prevista_horas)
 VALUES(c,grp,unit,cargo,(current_date+32),'09:00','17:00','horario_unico','09:00','17:00',0,false,8) RETURNING id INTO occ;
 PERFORM set_config('l02.emp',emp::text,true); PERFORM set_config('l02.grp',grp::text,true); PERFORM set_config('l02.occ',occ::text,true);
END $seed$;
DO $owner$ DECLARE u uuid; BEGIN
 PERFORM set_config('l02.version',(SELECT updated_at::text FROM public.dp_convocacao_grupos WHERE id=current_setting('l02.grp')::uuid),true);
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

UPDATE public.dp_convocacoes SET resposta_tipo='parcial',parcial_status='aguardando_gestor',parcial_entrada='10:00',parcial_saida='14:00',parcial_termina_no_dia_seguinte=false,parcial_carga_horas=4 WHERE id=current_setting('l02.offer')::uuid;
INSERT INTO public.dp_colaboradores(company_id,nome,unidade_id,cargo_id,regime,forma_pagamento,valor_hora)
SELECT company_id,'L02 CONC REOFERTA CANDIDATO',unidade_id,cargo_id,'intermitente','horista',41 FROM public.dp_colaboradores WHERE id=current_setting('l02.emp')::uuid;
DO $candidate_user$ DECLARE u uuid; BEGIN
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-b@example.invalid';
 IF EXISTS(SELECT 1 FROM public.dp_colaboradores WHERE user_id=u) THEN RAISE EXCEPTION 'worker already linked'; END IF;
 UPDATE public.dp_colaboradores SET user_id=u WHERE nome='L02 CONC REOFERTA CANDIDATO' AND unidade_id=(SELECT unidade_id FROM public.dp_colaboradores WHERE id=current_setting('l02.emp')::uuid);
 PERFORM set_config('l02.worker',u::text,true);
END $candidate_user$;
SET LOCAL ROLE authenticated;
DO $create_reoffer$ DECLARE v jsonb; BEGIN
 v:=public.dp_convocacao_decidir_parcial(current_setting('l02.offer')::uuid,'REOFERTAR');
 IF (v->>'ofertas_criadas')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'reoffer setup failed: %',v; END IF;
END $create_reoffer$;
RESET ROLE;
DO $capture$ DECLARE r uuid; BEGIN
 SELECT id INTO STRICT r FROM public.dp_convocacoes WHERE reoferta_de_convocacao_id=current_setting('l02.offer')::uuid;
 PERFORM set_config('l02.reoffer',r::text,true);
END $capture$;
DO $identity$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('l02.worker'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('l02.worker'),'role','authenticated')::text,true);
END $identity$;
SET LOCAL ROLE authenticated;
DO $first$ DECLARE v jsonb; BEGIN v:=public.dp_convocacao_responder_oferta(current_setting('l02.reoffer')::uuid,true,NULL::text,NULL::time,NULL::time,NULL::boolean,NULL::text,NULL::text); IF (v->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'first action failed: %',v; END IF; END $first$;
RESET ROLE;
DO $identity$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE email='l01-d@example.invalid'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
END $identity$;
SET LOCAL ROLE authenticated;
DO $second$ DECLARE v jsonb; BEGIN v:=public.dp_convocacao_decidir_parcial(current_setting('l02.offer')::uuid,'APROVAR'); IF v->>'motivo' IS DISTINCT FROM 'INVALID_STATE' THEN RAISE EXCEPTION 'losing action not denied: %',v; END IF; END $second$;
RESET ROLE;
DO $check$ BEGIN
 IF (SELECT count(*) FROM public.dp_convocacoes WHERE ocorrencia_id=current_setting('l02.occ')::uuid AND status='aceita')<>1 THEN RAISE EXCEPTION 'accepted count invalid'; END IF;
END $check$;
SELECT 'accept first: competing action refused; one accepted offer' result;
ROLLBACK;
