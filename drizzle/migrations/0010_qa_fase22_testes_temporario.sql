CREATE OR REPLACE FUNCTION public.qa_fase22_testes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r jsonb := '{}'::jsonb; v jsonb; v2 jsonb; t record; nc uuid; uid uuid := gen_random_uuid();
  aperte uuid := '7fe0c1e9-9e4d-43a7-add3-1689e86ba81d'; aperte_owner uuid := '902396b6-3873-49cf-9dce-88ea80690fee';
  aperte_sub uuid := 'f590a9a6-a2c5-416f-9b3a-6eca57909f20';
  bar uuid := 'fbcf2e49-426c-4f4d-a639-aca2a95ed76b'; praia_owner uuid := '9bde0e92-f331-4e8a-97d9-ba18068c2f99';
  praia_pes uuid := 'f106d9f4-c0cd-4744-9bfb-487c6cd261e4'; praia_fin uuid := '967b22af-17c6-411e-b719-202218434133';
  enki_owner uuid := '3a2cb0ed-e2fc-4485-b5f3-4a99b8ec2042'; colab_user uuid := '3e90ec42-0898-4e0c-8611-668924ae0fdc';
  PROCEDURE_ROLLBACK constant text := 'P0099';
BEGIN
  -- a
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    r := r || jsonb_build_object('a', jsonb_build_object('fin', has_module_access(aperte,'financeiro'), 'pes', has_module_access(aperte,'pessoas')));
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('a', SQLERRM); END;
  -- b
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',enki_owner,'role','authenticated')::text, true);
    v := '[]'::jsonb;
    FOR t IN SELECT id, name FROM companies WHERE user_id = enki_owner LOOP
      v := v || jsonb_build_object('empresa', t.name, 'pes', has_module_access(t.id,'pessoas')->'allowed', 'motivo', has_module_access(t.id,'pessoas')->'motivo');
    END LOOP;
    r := r || jsonb_build_object('b', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('b', SQLERRM); END;
  -- c
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',praia_owner,'role','authenticated')::text, true);
    UPDATE subscription_companies SET removed_at = now() WHERE subscription_id = praia_pes AND company_id = bar;
    r := r || jsonb_build_object('c', jsonb_build_object('fin', has_module_access(bar,'financeiro')->'allowed', 'pes', has_module_access(bar,'pessoas')->'allowed', 'pes_motivo', has_module_access(bar,'pessoas')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('c', SQLERRM); END;
  -- d
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',praia_owner,'role','authenticated')::text, true);
    UPDATE subscription_grants SET revoked_at = now() WHERE subscription_id = praia_pes AND revoked_at IS NULL;
    UPDATE subscriptions SET status = 'grace', grace_ends_at = now() - interval '1 day' WHERE id = praia_pes;
    r := r || jsonb_build_object('d', jsonb_build_object('fin', has_module_access(bar,'financeiro')->'allowed', 'pes', has_module_access(bar,'pessoas')->'allowed', 'pes_motivo', has_module_access(bar,'pessoas')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('d', SQLERRM); END;
  -- e
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    UPDATE subscription_grants SET revoked_at = now() WHERE subscription_id = aperte_sub AND revoked_at IS NULL;
    UPDATE subscriptions SET status = 'trialing', trial_ends_at = now() - interval '1 day' WHERE id = aperte_sub;
    v := has_module_access(aperte,'financeiro');
    UPDATE subscriptions SET trial_ends_at = now() + interval '3 day' WHERE id = aperte_sub;
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA TRIAL EMPRESA NOVA', 'pj') RETURNING id INTO nc;
    r := r || jsonb_build_object('e', jsonb_build_object('expirado', v->'motivo', 'original_em_trial', has_module_access(aperte,'financeiro')->'allowed', 'nova_empresa', has_module_access(nc,'financeiro')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('e', SQLERRM); END;
  -- f
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = aperte_sub;
    INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, starts_at)
      VALUES (aperte_sub, 'cortesia_total', (SELECT motivo_codigo FROM subscription_grants WHERE tipo='cortesia_total' LIMIT 1), 'QA', now() - interval '1 day');
    r := r || jsonb_build_object('f', has_module_access(aperte,'financeiro'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('f', SQLERRM); END;
  -- g
  BEGIN
    EXECUTE 'CREATE FUNCTION public.qa_falha_cobranca() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION ''falha forçada QA''; END $f$';
    EXECUTE 'CREATE TRIGGER qa_falha BEFORE INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.qa_falha_cobranca()';
    INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
      VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-fase22-'||left(uid::text,8)||'@exemplo-qa.com', '{}'::jsonb, '{}'::jsonb, now(), now());
    r := r || jsonb_build_object('g', jsonb_build_object('usuario_criado', EXISTS(SELECT 1 FROM auth.users WHERE id = uid),
      'assinatura_criada', EXISTS(SELECT 1 FROM subscriptions WHERE user_id = uid)));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('g', SQLERRM); END;
  -- h
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA SEGUNDA EMPRESA', 'pj') RETURNING id INTO nc;
    v := get_company_coverage_options(nc, 'financeiro');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',praia_owner,'role','authenticated')::text, true);
    UPDATE subscription_companies SET removed_at = now() WHERE subscription_id = praia_fin AND company_id = bar;
    v2 := get_company_coverage_options(bar, 'financeiro');
    r := r || jsonb_build_object('h', jsonb_build_object('essencial', v, 'gestao_1_empresa', v2));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('h', SQLERRM); END;
  -- i e k (modo v2 só dentro do bloco)
  BEGIN
    UPDATE system_parameters SET value = '"v2"'::jsonb WHERE key = 'access_model_v2';
    SELECT * INTO t FROM private.dp_portal_decisao(colab_user) LIMIT 1;
    v := jsonb_build_object('estado', t.estado, 'empresa', t.company_id);
    UPDATE subscription_grants SET revoked_at = now() WHERE subscription_id = praia_pes AND revoked_at IS NULL;
    UPDATE subscriptions SET status = 'grace', grace_ends_at = now() - interval '1 day' WHERE id = praia_pes;
    SELECT * INTO t FROM private.dp_portal_decisao(colab_user) LIMIT 1;
    r := r || jsonb_build_object('i', v, 'k', jsonb_build_object('estado', t.estado, 'acesso_ate', t.acesso_ate));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('ik', SQLERRM); END;
  -- j (só Pessoas) e l (segunda empresa sem cobertura) — backend
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',enki_owner,'role','authenticated')::text, true);
    v := jsonb_build_object('fin', has_module_access('693aff26-052d-4801-8670-3fea4c0c7a1a','financeiro')->'motivo', 'pes', has_module_access('693aff26-052d-4801-8670-3fea4c0c7a1a','pessoas')->'allowed');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',aperte_owner,'role','authenticated')::text, true);
    INSERT INTO companies(user_id, name, profile_type) VALUES (aperte_owner, 'QA SEGUNDA EMPRESA L', 'pj') RETURNING id INTO nc;
    r := r || jsonb_build_object('j', v, 'l', jsonb_build_object('fin', has_module_access(nc,'financeiro')->'motivo', 'pes', has_module_access(nc,'pessoas')->'motivo'));
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN OTHERS THEN r := r || jsonb_build_object('jl', SQLERRM); END;
  r := r || jsonb_build_object('flag_final', access_model_mode());
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.qa_fase22_testes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_fase22_testes() TO service_role;