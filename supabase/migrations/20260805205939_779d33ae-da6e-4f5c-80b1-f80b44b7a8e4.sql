CREATE OR REPLACE FUNCTION public.can_use_orders_module(p_company_id uuid, p_operation text DEFAULT 'orders.dashboard'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_super boolean := false;
  v_perms jsonb := '{}'::jsonb;
  v_row public.company_modules;
  v_status text;
  v_effective text;
  v_level text := 'none';
  v_usable boolean := false;
  v_read_only boolean := true;
  v_needs_edit boolean;
  v_days int;
  v_allowed boolean := false;
  v_reason text := 'forbidden';
  v_op text := coalesce(nullif(trim(p_operation), ''), 'orders.dashboard');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated',
      'status', 'not_contracted', 'effective_status', 'not_contracted',
      'level', 'none', 'read_only', true, 'trial_ends_at', NULL, 'days_left', NULL);
  END IF;
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_company',
      'status', 'not_contracted', 'effective_status', 'not_contracted',
      'level', 'none', 'read_only', true, 'trial_ends_at', NULL, 'days_left', NULL);
  END IF;

  v_super := public.is_super_admin(v_uid);

  SELECT cm.role::text, coalesce(cm.permissions, '{}'::jsonb)
    INTO v_role, v_perms
  FROM public.company_members cm
  WHERE cm.user_id = v_uid AND cm.company_id = p_company_id;

  IF v_role IS NULL AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id AND c.user_id = v_uid
  ) THEN
    v_role := 'owner';
  END IF;

  IF v_role IS NULL AND v_super THEN
    v_role := 'admin';
  END IF;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_member',
      'status', 'not_contracted', 'effective_status', 'not_contracted',
      'level', 'none', 'read_only', true, 'trial_ends_at', NULL, 'days_left', NULL);
  END IF;

  SELECT * INTO v_row
  FROM public.company_modules
  WHERE company_id = p_company_id AND module = 'pedidos';

  v_status := coalesce(v_row.status::text, 'not_contracted');
  v_effective := v_status;
  IF v_status = 'trial' AND v_row.trial_termina_em IS NOT NULL
     AND v_row.trial_termina_em <= now() THEN
    v_effective := 'trial_expirado';
  END IF;

  v_usable := v_effective IN ('active', 'trial');
  IF v_row.trial_termina_em IS NOT NULL THEN
    v_days := greatest(0, ceil(extract(epoch FROM (v_row.trial_termina_em - now())) / 86400)::int);
  END IF;

  IF v_role IN ('owner', 'admin') THEN
    v_level := 'edit';
  ELSIF v_role = 'viewer' THEN
    v_level := 'view';
  ELSE
    v_level := coalesce(v_perms ->> v_op, 'none');
    IF v_level NOT IN ('none', 'view', 'edit') THEN
      v_level := 'none';
    END IF;
  END IF;

  v_needs_edit := v_op NOT IN ('orders.dashboard', 'orders.reports');
  v_read_only := NOT v_usable OR v_level <> 'edit';

  IF NOT v_usable THEN
    v_allowed := v_effective IN ('trial_expirado', 'suspended', 'canceled')
                 AND NOT v_needs_edit
                 AND v_level IN ('view', 'edit');
    v_reason := CASE
      WHEN v_effective = 'not_contracted' THEN 'not_contracted'
      WHEN v_effective = 'trial_expirado' THEN 'trial_expired'
      ELSE v_effective
    END;
  ELSIF v_needs_edit THEN
    v_allowed := v_level = 'edit';
    v_reason := CASE WHEN v_allowed THEN 'ok' ELSE 'missing_permission' END;
  ELSE
    v_allowed := v_level IN ('view', 'edit');
    v_reason := CASE WHEN v_allowed THEN 'ok' ELSE 'missing_permission' END;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'operation', v_op,
    'role', v_role,
    'status', v_status,
    'effective_status', v_effective,
    'level', v_level,
    'read_only', v_read_only,
    'usable', v_usable,
    'trial_started_at', v_row.trial_iniciado_em,
    'trial_ends_at', v_row.trial_termina_em,
    'days_left', v_days,
    'trial_used', v_row.trial_iniciado_em IS NOT NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_orders_trial(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company public.companies;
  v_role text;
  v_row public.company_modules;
  v_start timestamptz;
  v_end timestamptz;
  v_doc text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated',
      'message', 'Sessão expirada. Faça login novamente.');
  END IF;
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_company',
      'message', 'Selecione uma empresa para iniciar o teste.');
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF v_company.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'company_not_found',
      'message', 'Empresa não encontrada.');
  END IF;

  SELECT cm.role::text INTO v_role
  FROM public.company_members cm
  WHERE cm.user_id = v_uid AND cm.company_id = p_company_id;

  IF v_role IS NULL AND v_company.user_id = v_uid THEN
    v_role := 'owner';
  END IF;
  IF v_role IS NULL AND public.is_super_admin(v_uid) THEN
    v_role := 'admin';
  END IF;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_member',
      'message', 'Você não tem vínculo com esta empresa.');
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden',
      'message', 'Apenas o proprietário da empresa pode iniciar o teste gratuito.');
  END IF;

  v_doc := regexp_replace(coalesce(v_company.cnpj, ''), '[^0-9]', '', 'g');
  IF length(v_doc) NOT IN (11, 14) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_company_document',
      'message', 'Complete o CNPJ/CPF da empresa antes de iniciar o teste.');
  END IF;

  SELECT * INTO v_row
  FROM public.company_modules
  WHERE company_id = p_company_id AND module = 'pedidos'
  FOR UPDATE;

  IF v_row.id IS NOT NULL THEN
    IF v_row.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'code', 'already_active',
        'message', 'O módulo Pedidos já está ativo nesta empresa.');
    END IF;
    IF v_row.status = 'trial' AND v_row.trial_termina_em > now() THEN
      RETURN jsonb_build_object('success', true, 'code', 'already_trialing',
        'message', 'Teste gratuito já está em andamento.',
        'trial_started_at', v_row.trial_iniciado_em,
        'trial_ends_at', v_row.trial_termina_em);
    END IF;
    IF v_row.trial_iniciado_em IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'trial_already_used',
        'message', 'Esta empresa já utilizou o teste gratuito do módulo Pedidos.',
        'trial_started_at', v_row.trial_iniciado_em,
        'trial_ends_at', v_row.trial_termina_em);
    END IF;
  END IF;

  v_start := now();
  v_end := v_start + interval '7 days';

  PERFORM set_config('app.orders_trial_ctx', 'on', true);

  INSERT INTO public.company_modules (
    company_id, module, status, starts_at, ends_at,
    trial_iniciado_em, trial_termina_em
  ) VALUES (
    p_company_id, 'pedidos', 'trial', v_start, v_end, v_start, v_end
  )
  ON CONFLICT (company_id, module) DO UPDATE
  SET status = 'trial',
      starts_at = v_start,
      ends_at = v_end,
      trial_iniciado_em = v_start,
      trial_termina_em = v_end,
      cancelado_em = NULL,
      updated_at = now()
  WHERE public.company_modules.trial_iniciado_em IS NULL;

  PERFORM set_config('app.orders_trial_ctx', 'off', true);

  SELECT * INTO v_row
  FROM public.company_modules
  WHERE company_id = p_company_id AND module = 'pedidos';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid, 'orders_trial_started', 'company_modules', v_row.id::text,
    jsonb_build_object(
      'company_id', p_company_id,
      'module', 'pedidos',
      'role', v_role,
      'doc_length', length(v_doc),
      'trial_started_at', v_row.trial_iniciado_em,
      'trial_ends_at', v_row.trial_termina_em
    )
  );

  RETURN jsonb_build_object('success', true, 'code', 'trial_started',
    'message', 'Teste gratuito de 7 dias iniciado.',
    'trial_started_at', v_row.trial_iniciado_em,
    'trial_ends_at', v_row.trial_termina_em);
END;
$function$;

CREATE OR REPLACE FUNCTION public.contract_orders_module(p_company_id uuid, p_valor_mensal numeric DEFAULT NULL::numeric, p_reference text DEFAULT NULL::text, p_reopen_units boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company public.companies;
  v_role text;
  v_row public.company_modules;
  v_units int := 0;
  v_channels int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated',
      'message', 'Sessão expirada. Faça login novamente.');
  END IF;
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_company',
      'message', 'Selecione uma empresa.');
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF v_company.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'company_not_found',
      'message', 'Empresa não encontrada.');
  END IF;

  SELECT cm.role::text INTO v_role FROM public.company_members cm
   WHERE cm.user_id = v_uid AND cm.company_id = p_company_id;
  IF v_role IS NULL AND v_company.user_id = v_uid THEN
    v_role := 'owner';
  END IF;
  IF v_role IS NULL AND public.is_super_admin(v_uid) THEN v_role := 'admin'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden',
      'message', 'Apenas o proprietário ou administrador da empresa pode contratar o módulo.');
  END IF;

  SELECT * INTO v_row FROM public.company_modules
   WHERE company_id = p_company_id AND module = 'pedidos' FOR UPDATE;

  IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_active',
      'message', 'O módulo Pedidos já está ativo nesta empresa.',
      'contratado_em', v_row.contratado_em);
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.company_modules (company_id, module, status, starts_at, contratado_em, valor_mensal)
    VALUES (p_company_id, 'pedidos', 'active', now(), now(), p_valor_mensal)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.company_modules
       SET status = 'active',
           starts_at = COALESCE(starts_at, now()),
           ends_at = NULL,
           cancelado_em = NULL,
           contratado_em = COALESCE(contratado_em, now()),
           valor_mensal = COALESCE(p_valor_mensal, valor_mensal),
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  WITH upd AS (
    UPDATE public.ped_order_channels
       SET is_active = true, paused_by_trial = false
     WHERE company_id = p_company_id AND paused_by_trial
    RETURNING 1
  ) SELECT count(*) INTO v_channels FROM upd;

  WITH upd AS (
    UPDATE public.ped_units
       SET operational_state = CASE
             WHEN COALESCE(p_reopen_units, false)
               THEN COALESCE(state_before_block, operational_state)
             ELSE 'closed'::public.ped_unit_state END,
           blocked_by_trial = false,
           state_before_block = NULL
     WHERE company_id = p_company_id AND blocked_by_trial
    RETURNING 1
  ) SELECT count(*) INTO v_units FROM upd;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'orders_module_contracted', 'company_modules', v_row.id::text,
    jsonb_build_object('company_id', p_company_id, 'role', v_role,
      'reference', nullif(btrim(p_reference), ''), 'units_restored', v_units,
      'channels_restored', v_channels, 'reopened', COALESCE(p_reopen_units, false)));

  RETURN jsonb_build_object('success', true, 'code', 'contracted',
    'message', 'Módulo Pedidos ativado. Seus dados e configurações foram mantidos.',
    'contratado_em', v_row.contratado_em, 'units_restored', v_units,
    'channels_restored', v_channels);
END; $function$;

CREATE OR REPLACE FUNCTION public.ped_upsert_unit(p_company_id uuid, p_nome text, p_unit_id uuid DEFAULT NULL::uuid, p_codigo_interno text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_endereco text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_timezone text DEFAULT 'America/Sao_Paulo'::text, p_responsible_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := nullif(btrim(p_nome), '');
  v_codigo text := nullif(btrim(p_codigo_interno), '');
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_unidade_id uuid;
  v_unit public.ped_units;
BEGIN
  PERFORM public.ped_assert_can_manage(p_company_id, 'orders.settings');

  IF v_nome IS NULL OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe o nome da unidade (até 120 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_uf IS NOT NULL AND char_length(btrim(p_uf)) NOT IN (0, 2) THEN
    RAISE EXCEPTION 'UF inválida.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fuso horário inválido: %.', v_tz USING ERRCODE = '22023';
  END;

  IF p_responsible_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = p_responsible_user_id
    UNION ALL
    SELECT 1 FROM public.companies c
     WHERE c.id = p_company_id AND c.user_id = p_responsible_user_id
  ) THEN
    RAISE EXCEPTION 'Responsável precisa ser um usuário da própria empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_unit_id IS NOT NULL THEN
    v_unit := public.ped_resolve_unit(p_unit_id, 'orders.settings');
    IF v_unit.company_id <> p_company_id THEN
      RAISE EXCEPTION 'Unidade não pertence à empresa informada.' USING ERRCODE = '42501';
    END IF;
    IF v_unit.operational_state = 'suspended' THEN
      RAISE EXCEPTION 'Unidade suspensa não pode ser alterada.' USING ERRCODE = '42501';
    END IF;
    v_unidade_id := v_unit.unidade_id;

    UPDATE public.dp_unidades
       SET nome = v_nome,
           telefone = nullif(btrim(p_telefone), ''),
           endereco = nullif(btrim(p_endereco), ''),
           cidade = nullif(btrim(p_cidade), ''),
           uf = upper(nullif(btrim(p_uf), ''))
     WHERE id = v_unidade_id;

    UPDATE public.ped_units
       SET codigo_interno = v_codigo,
           timezone = v_tz,
           responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id, v_uid),
           onboarding_step = GREATEST(onboarding_step, 2)
     WHERE id = v_unit.id
     RETURNING * INTO v_unit;
  ELSE
    INSERT INTO public.dp_unidades (company_id, nome, telefone, endereco, cidade, uf)
    VALUES (p_company_id, v_nome, nullif(btrim(p_telefone), ''), nullif(btrim(p_endereco), ''),
            nullif(btrim(p_cidade), ''), upper(nullif(btrim(p_uf), '')))
    RETURNING id INTO v_unidade_id;

    INSERT INTO public.ped_units (company_id, unidade_id, codigo_interno, timezone, responsible_user_id, onboarding_step)
    VALUES (p_company_id, v_unidade_id, v_codigo, v_tz, coalesce(p_responsible_user_id, v_uid), 2)
    RETURNING * INTO v_unit;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, CASE WHEN p_unit_id IS NULL THEN 'orders_unit_created' ELSE 'orders_unit_updated' END,
          'ped_units', v_unit.id::text,
          jsonb_build_object('company_id', p_company_id, 'timezone', v_tz));

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id, 'unidade_id', v_unidade_id,
                            'onboarding_step', v_unit.onboarding_step);
END;
$function$;