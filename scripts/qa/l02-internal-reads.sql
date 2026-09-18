-- Manual synthetic homologation regression only. Verify the target before setting
-- aveto.test_project_ref = 'utjhzpdbqzajrhnzcher'. Never execute in production.
BEGIN;
DO $target$ BEGIN
 IF current_setting('aveto.test_project_ref',true) IS DISTINCT FROM 'utjhzpdbqzajrhnzcher' THEN RAISE EXCEPTION 'Explicit synthetic target required'; END IF;
END $target$;
DO $seed$
DECLARE c uuid; u uuid; emp uuid;
BEGIN
 SELECT id INTO STRICT c FROM public.companies WHERE name='HOMOLOGAÇÃO L01 Empresa 2';
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-a@example.invalid';
 IF EXISTS(SELECT 1 FROM public.company_members WHERE company_id=c AND user_id=u) THEN RAISE EXCEPTION 'fixture not isolated'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('l02.c',c::text,true);
 INSERT INTO public.dp_admissao_regras(company_id,tipo,chave,exigencia) VALUES(c,'campo','l02_regra_sintetica','obrigatorio');
 INSERT INTO public.dp_colaboradores(company_id,nome,regime,forma_pagamento,valor_hora) VALUES(c,'L02 REMUNERACAO FICTICIA','intermitente','horista',37) RETURNING id INTO emp;
 PERFORM set_config('l02.emp',emp::text,true);
END $seed$;

SET LOCAL ROLE authenticated;
DO $denied$ BEGIN
 BEGIN
  PERFORM public.dp_convocacao_remuneracao_snapshot(current_setting('l02.emp')::uuid,8);
  RAISE EXCEPTION 'salary endpoint remained accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM public.dp_admissao_regras_resolver(current_setting('l02.c')::uuid,NULL::uuid,NULL::uuid,NULL::public.dp_regime_trabalho,NULL::text);
  RAISE EXCEPTION 'admission endpoint remained accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $denied$ BEGIN
 BEGIN
  PERFORM public.dp_convocacao_remuneracao_snapshot(current_setting('l02.emp')::uuid,8);
  RAISE EXCEPTION 'salary endpoint remained accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM public.dp_admissao_regras_resolver(current_setting('l02.c')::uuid,NULL::uuid,NULL::uuid,NULL::public.dp_regime_trabalho,NULL::text);
  RAISE EXCEPTION 'admission endpoint remained accessible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
DO $grants$ DECLARE f regprocedure; r text; BEGIN
 FOREACH f IN ARRAY ARRAY[
 'public.dp_admissao_regras_resolver(uuid,uuid,uuid,public.dp_regime_trabalho)'::regprocedure,
 'public.dp_admissao_regras_resolver(uuid,uuid,uuid,public.dp_regime_trabalho,text)'::regprocedure,
 'public.dp_convocacao_remuneracao_snapshot(uuid,numeric)'::regprocedure
 ] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'grant still exposed: % %',r,f; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'service grant lost: %',f; END IF;
 END LOOP;
END $grants$;
SET LOCAL ROLE service_role;
DO $service$ DECLARE v jsonb; BEGIN
 v:=public.dp_convocacao_remuneracao_snapshot(current_setting('l02.emp')::uuid,8);
 IF (v->>'elegivel')::boolean IS DISTINCT FROM true OR (v->>'valor_unitario')::numeric IS DISTINCT FROM 37 OR (v->>'valor_previsto')::numeric IS DISTINCT FROM 296 THEN RAISE EXCEPTION 'service remuneration changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dp_admissao_regras_resolver(current_setting('l02.c')::uuid,NULL::uuid,NULL::uuid,NULL::public.dp_regime_trabalho,NULL::text) WHERE chave='l02_regra_sintetica' AND exigencia='obrigatorio') THEN RAISE EXCEPTION 'service admission rules lost'; END IF;
END $service$;
RESET ROLE;
DO $owner$ BEGIN
 IF (public.dp_convocacao_remuneracao_snapshot(current_setting('l02.emp')::uuid,8)->>'valor_previsto')::numeric IS DISTINCT FROM 296 THEN RAISE EXCEPTION 'owner execution changed'; END IF;
END $owner$;
SELECT 'authenticated and anonymous direct calls denied; all three ACLs restricted; service admission and salary preserved; owner salary preserved' result;
ROLLBACK;
