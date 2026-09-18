-- Manual regression for synthetic homologation only; not wired into CI.
-- Verify the connection target, then SET aveto.test_project_ref = 'utjhzpdbqzajrhnzcher'.
BEGIN;
DO $target$ BEGIN
 IF current_setting('aveto.test_project_ref', true) IS DISTINCT FROM 'utjhzpdbqzajrhnzcher' THEN
 RAISE EXCEPTION 'Explicit synthetic homologation target required';
 END IF;
END $target$;
DO $seed$
DECLARE c1 uuid; c2 uuid; u uuid;
BEGIN
 SELECT id INTO STRICT c1 FROM public.companies WHERE name='HOMOLOGAÇÃO L01 Empresa 1';
 SELECT id INTO STRICT c2 FROM public.companies WHERE name='HOMOLOGAÇÃO L01 Empresa 2';
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-a@example.invalid';
 PERFORM set_config('l02.c1',c1::text,true); PERFORM set_config('l02.c2',c2::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.dp_config_dp(company_id,ferias_aviso_antecedencia_dias) VALUES(c1,31)
 ON CONFLICT(company_id) WHERE unidade_id IS NULL DO UPDATE SET ferias_aviso_antecedencia_dias=31;
 INSERT INTO public.dp_config_dp(company_id,ferias_aviso_antecedencia_dias) VALUES(c2,43)
 ON CONFLICT(company_id) WHERE unidade_id IS NULL DO UPDATE SET ferias_aviso_antecedencia_dias=43;
END $seed$;
SET LOCAL ROLE authenticated;
DO $after$ BEGIN
 IF (SELECT aviso_antecedencia_dias FROM public.dp_ferias_config(current_setting('l02.c1')::uuid,NULL)) IS DISTINCT FROM 31::smallint
 THEN RAISE EXCEPTION 'own company denied'; END IF;
 IF (public.dp_config_resolvida(current_setting('l02.c1')::uuid,NULL)).ferias_aviso_antecedencia_dias IS DISTINCT FROM 31::smallint
 THEN RAISE EXCEPTION 'own composite denied'; END IF;
 IF (SELECT aviso_antecedencia_dias FROM public.dp_ferias_config(current_setting('l02.c2')::uuid,NULL)) IS DISTINCT FROM 60::smallint
 THEN RAISE EXCEPTION 'foreign config leaked'; END IF;
 IF (public.dp_config_resolvida(current_setting('l02.c2')::uuid,NULL)).id IS NOT NULL
 THEN RAISE EXCEPTION 'foreign composite leaked'; END IF;
END $after$;
RESET ROLE;
DO $internal$ BEGIN
 IF (public.dp_config_resolvida(current_setting('l02.c2')::uuid,NULL)).ferias_aviso_antecedencia_dias IS DISTINCT FROM 43::smallint
 THEN RAISE EXCEPTION 'trusted database context changed'; END IF;
 IF has_function_privilege('anon','public.dp_config_resolvida(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.dp_ferias_config(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous execution still allowed'; END IF;
END $internal$;

INSERT INTO public.auth_user_security_state(user_id,access_blocked)
VALUES (current_setting('request.jwt.claim.sub')::uuid,true)
ON CONFLICT(user_id) DO UPDATE SET access_blocked=true;
SET LOCAL ROLE authenticated;
DO $blocked$ BEGIN
 IF (public.dp_config_resolvida(current_setting('l02.c1')::uuid,NULL)).id IS NOT NULL OR
 (SELECT aviso_antecedencia_dias FROM public.dp_ferias_config(current_setting('l02.c1')::uuid,NULL)) IS DISTINCT FROM 60::smallint
 THEN RAISE EXCEPTION 'blocked user read company configuration'; END IF;
END $blocked$;
RESET ROLE;
UPDATE public.auth_user_security_state SET access_blocked=false WHERE user_id=current_setting('request.jwt.claim.sub')::uuid;
DELETE FROM public.company_members WHERE company_id=current_setting('l02.c1')::uuid AND user_id=current_setting('request.jwt.claim.sub')::uuid;
SET LOCAL ROLE authenticated;
DO $revoked$ BEGIN
 IF (public.dp_config_resolvida(current_setting('l02.c1')::uuid,NULL)).id IS NOT NULL THEN RAISE EXCEPTION 'revoked membership read'; END IF;
END $revoked$;
RESET ROLE;
DO $portal_seed$ DECLARE u uuid; BEGIN
 SELECT id INTO STRICT u FROM auth.users WHERE email='l01-b@example.invalid';
 IF EXISTS(SELECT 1 FROM public.dp_colaboradores WHERE user_id=u) THEN RAISE EXCEPTION 'portal fixture already has employee'; END IF;
 DELETE FROM public.company_members WHERE user_id=u AND company_id=current_setting('l02.c1')::uuid;
 INSERT INTO public.dp_colaboradores(company_id,nome,user_id,ativo) VALUES(current_setting('l02.c1')::uuid,'L02 PORTAL FICTICIO',u,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
END $portal_seed$;
SET LOCAL ROLE authenticated;
DO $portal$ BEGIN
 IF (public.dp_config_resolvida(current_setting('l02.c1')::uuid,NULL)).ferias_aviso_antecedencia_dias IS DISTINCT FROM 31::smallint
 THEN RAISE EXCEPTION 'active portal denied'; END IF;
 IF (public.dp_config_resolvida(current_setting('l02.c2')::uuid,NULL)).id IS NOT NULL
 THEN RAISE EXCEPTION 'portal cross-company read'; END IF;
 IF (SELECT aviso_antecedencia_dias FROM public.dp_ferias_config(current_setting('l02.c1')::uuid,NULL)) IS DISTINCT FROM 31::smallint
 THEN RAISE EXCEPTION 'portal vacation config denied'; END IF;
END $portal$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $service$ BEGIN
 IF (public.dp_config_resolvida(current_setting('l02.c2')::uuid,NULL)).ferias_aviso_antecedencia_dias IS DISTINCT FROM 43::smallint
 THEN RAISE EXCEPTION 'service role denied'; END IF;
END $service$;
RESET ROLE;
SELECT 'own-company preserved; foreign rows hidden; trusted DB preserved; anon revoked; blocked and revoked users denied; active portal isolated; service role preserved' AS result;
ROLLBACK;
