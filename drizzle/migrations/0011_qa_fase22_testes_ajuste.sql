CREATE OR REPLACE FUNCTION public.qa_fase22_testes()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb := '{}'::jsonb; v jsonb; v2 jsonb; t record; nc uuid;
  aperte uuid := '7fe0c1e9-9e4d-43a7-add3-1689e86ba81d'; aperte_owner uuid := '902396b6-3873-49cf-9dce-88ea80690fee';
  aperte_sub uuid := 'f590a9a6-a2c5-416f-9b3a-6eca57909f20';
  bar uuid := 'fbcf2e49-426c-4f4d-a639-aca2a95ed76b'; praia_owner uuid := '9bde0e92-f331-4e8a-97d9-ba18068c2f99';
  praia_fin uuid := '967b22af-17c6-411e-b719-202218434133';
  enki_owner uuid := '3a2cb0ed-e2fc-4485-b5f3-4a99b8ec2042';
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    UPDATE subscription_grants SET revoked_at = now() WHERE subscription_id = aperte_sub AND revoked_at IS NULL;
    UPDATE subscriptions SET status = 'trialing', trial_ends_at = now() - interval '1 day' WHERE id = aperte_sub;
    v := has_module_access(aperte,'financeiro');
    UPDATE subscriptions SET trial_ends_at = now() + interval '3 day' WHERE id = aperte_sub;
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA TRIAL EMPRESA NOVA', 'empresarial') RETURNING id INTO nc;
    r := r || jsonb_build_object('e', jsonb_build_object('expirado', v->'motivo', 'original_em_trial', has_module_access(aperte,'financeiro')->'allowed', 'nova_empresa', has_module_access(nc,'financeiro')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('e', SQLERRM); END;
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA SEGUNDA EMPRESA', 'empresarial') RETURNING id INTO nc;
    v := get_company_coverage_options(nc, 'financeiro');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',praia_owner,'role','authenticated')::text, true);
    UPDATE subscription_companies SET removed_at = now() WHERE subscription_id = praia_fin AND company_id = bar;
    v2 := get_company_coverage_options(bar, 'financeiro');
    r := r || jsonb_build_object('h', jsonb_build_object('essencial', v, 'gestao_1_empresa', v2));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('h', SQLERRM); END;
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',enki_owner,'role','authenticated')::text, true);
    v := jsonb_build_object('fin', has_module_access('693aff26-052d-4801-8670-3fea4c0c7a1a','financeiro')->'motivo', 'pes', has_module_access('693aff26-052d-4801-8670-3fea4c0c7a1a','pessoas')->'allowed');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA SEGUNDA EMPRESA L', 'empresarial') RETURNING id INTO nc;
    r := r || jsonb_build_object('j', v, 'l', jsonb_build_object('fin', has_module_access(nc,'financeiro')->'motivo', 'pes', has_module_access(nc,'pessoas')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('jl', SQLERRM); END;
  r := r || jsonb_build_object('flag_final', access_model_mode());
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.qa_fase22_testes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_fase22_testes() TO service_role;