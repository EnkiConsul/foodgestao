-- ============================================================
-- Portal: previsões de pagamento que cada colaborador pode ver
-- ============================================================
--  T1 mensalista CLT optante com VA → salário (5º dia útil), adiantamento e VA
--  T2 solicitação de desativação na competência → sem adiantamento naquele mês
--  T3 no mês anterior à desativação o adiantamento continua
--  T4 intermitente/horista → sem previsão de salário mensal
--  T5 sócio → sem salário nem adiantamento
--  T6 competência inválida → nada
--  T7 usuário sem vínculo de colaborador → nada
-- Dados 100% fictícios; rodar só no banco isolado (scripts/test-p04-isolated.mjs).
-- ============================================================

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_fora uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_unid uuid := gen_random_uuid();
  v_col uuid := gen_random_uuid();
  r record;
  n int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'pagto-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (v_owner, 'owner'), (v_user, 'colab'), (v_fora, 'fora')) AS u(id, tag);
  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (v_company, v_owner, 'PAGAMENTOS SINTETICA LTDA', true, 'empresarial', 'ativa');
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (v_company, v_user, 'member') ON CONFLICT DO NOTHING;
  INSERT INTO public.dp_unidades (id, company_id, nome, tem_adiantamento, dia_adiantamento, pagamento_salario_tipo)
  VALUES (v_unid, v_company, 'LOJA SINTETICA', true, 20, 'quinto_dia_util');
  INSERT INTO public.dp_config_dp (company_id, unidade_id, va_ativo, va_dia_pagamento) VALUES (v_company, NULL, true, 25);
  INSERT INTO public.dp_colaboradores (id, company_id, user_id, nome, unidade_id, ativo, regime, forma_pagamento, optante_adiantamento, vale_alimentacao)
  VALUES (v_col, v_company, v_user, 'PESSOA SINTETICA', v_unid, true, 'clt', 'mensalista', true, true);
  CREATE TEMP TABLE pg_fix AS SELECT v_user AS u, v_fora AS fora, v_company AS c, v_col AS col;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.como(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

DO $$
DECLARE f record; r record; n int;
BEGIN
  SELECT * INTO f FROM pg_fix;
  PERFORM pg_temp.como(f.u);

  SELECT * INTO r FROM public.dp_portal_meus_pagamentos('2026-11');
  IF r.salario_tipo IS DISTINCT FROM 'quinto_dia_util' OR r.salario_rotulo <> 'Salário' OR r.adiantamento_dia <> 20 OR r.va_dia <> 25 THEN
    RAISE EXCEPTION 'T1 falhou: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T1 ok: salário, adiantamento e VA';

  RESET ROLE;
  INSERT INTO public.dp_adiantamento_solicitacoes (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito)
  VALUES (f.c, f.col, 'desativar', '2026-10-15', '2026-11');
  PERFORM pg_temp.como(f.u);
  SELECT * INTO r FROM public.dp_portal_meus_pagamentos('2026-11');
  IF r.adiantamento_dia IS NOT NULL THEN RAISE EXCEPTION 'T2 falhou: %', row_to_json(r); END IF;
  RAISE NOTICE 'T2 ok: desativado na competência';
  SELECT * INTO r FROM public.dp_portal_meus_pagamentos('2026-10');
  IF r.adiantamento_dia IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'T3 falhou: %', row_to_json(r); END IF;
  RAISE NOTICE 'T3 ok: mês anterior mantém adiantamento';

  UPDATE public.dp_colaboradores SET regime = 'intermitente', forma_pagamento = 'horista' WHERE id = f.col;
  SELECT * INTO r FROM public.dp_portal_meus_pagamentos('2026-11');
  IF r.salario_tipo IS NOT NULL THEN RAISE EXCEPTION 'T4 falhou: %', row_to_json(r); END IF;
  RAISE NOTICE 'T4 ok: intermitente sem salário mensal';

  UPDATE public.dp_colaboradores SET regime = 'clt', forma_pagamento = 'mensalista', vinculo_label = 'socio' WHERE id = f.col;
  SELECT * INTO r FROM public.dp_portal_meus_pagamentos('2026-10');
  IF r.salario_tipo IS NOT NULL OR r.adiantamento_dia IS NOT NULL THEN RAISE EXCEPTION 'T5 falhou: %', row_to_json(r); END IF;
  RAISE NOTICE 'T5 ok: sócio sem salário/adiantamento';

  SELECT count(*) INTO n FROM public.dp_portal_meus_pagamentos('2026-13');
  IF n <> 0 THEN RAISE EXCEPTION 'T6 falhou'; END IF;
  RAISE NOTICE 'T6 ok: competência inválida';

  PERFORM pg_temp.como(f.fora);
  SELECT count(*) INTO n FROM public.dp_portal_meus_pagamentos('2026-11');
  IF n <> 0 THEN RAISE EXCEPTION 'T7 falhou'; END IF;
  RAISE NOTICE 'T7 ok: sem vínculo não vê nada';
END $$;
