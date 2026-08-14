-- 1) Motor genérico de entitlement por módulo
CREATE OR REPLACE FUNCTION public.can_use_module(
  p_company_id uuid,
  p_module public.app_module,
  p_operation text DEFAULT NULL
)
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
  v_op text := coalesce(nullif(trim(p_operation), ''), p_module::text || '.dashboard');
  v_missing public.app_module;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated',
      'module', p_module, 'operation', v_op,
      'status', 'not_contracted', 'effective_status', 'not_contracted',
      'level', 'none', 'read_only', true, 'trial_ends_at', NULL, 'days_left', NULL);
  END IF;
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_company',
      'module', p_module, 'operation', v_op,
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
      'module', p_module, 'operation', v_op,
      'status', 'not_contracted', 'effective_status', 'not_contracted',
      'level', 'none', 'read_only', true, 'trial_ends_at', NULL, 'days_left', NULL);
  END IF;

  SELECT * INTO v_row
  FROM public.company_modules
  WHERE company_id = p_company_id AND module = p_module;

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

  -- pré-requisitos declarados (dependências duras)
  IF v_usable THEN
    SELECT d.requires INTO v_missing
    FROM public.module_dependencies d
    WHERE d.module = p_module AND d.hard
      AND NOT EXISTS (
        SELECT 1 FROM public.company_modules cmr
        WHERE cmr.company_id = p_company_id
          AND cmr.module = d.requires
          AND (
            cmr.status = 'active'
            OR (cmr.status = 'trial' AND (cmr.trial_termina_em IS NULL OR cmr.trial_termina_em > now()))
          )
      )
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      v_usable := false;
      v_effective := 'missing_dependency';
    END IF;
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

  v_needs_edit := v_op NOT LIKE '%.dashboard'
              AND v_op NOT LIKE '%.reports'
              AND v_op NOT LIKE '%.view';
  v_read_only := NOT v_usable OR v_level <> 'edit';

  IF NOT v_usable THEN
    v_allowed := v_effective IN ('trial_expirado', 'suspended', 'canceled')
                 AND NOT v_needs_edit
                 AND v_level IN ('view', 'edit');
    v_reason := CASE
      WHEN v_effective = 'not_contracted' THEN 'not_contracted'
      WHEN v_effective = 'trial_expirado' THEN 'trial_expired'
      WHEN v_effective = 'missing_dependency' THEN 'missing_dependency'
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
    'module', p_module,
    'operation', v_op,
    'role', v_role,
    'status', v_status,
    'effective_status', v_effective,
    'level', v_level,
    'read_only', v_read_only,
    'usable', v_usable,
    'missing_dependency', v_missing,
    'trial_started_at', v_row.trial_iniciado_em,
    'trial_ends_at', v_row.trial_termina_em,
    'days_left', v_days,
    'trial_used', v_row.trial_iniciado_em IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.can_use_module(uuid, public.app_module, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_module(uuid, public.app_module, text) TO authenticated, service_role;

-- 2) Pedidos passa a delegar para o motor genérico
CREATE OR REPLACE FUNCTION public.can_use_orders_module(
  p_company_id uuid,
  p_operation text DEFAULT 'orders.dashboard'::text
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_use_module(
    p_company_id,
    'pedidos'::public.app_module,
    coalesce(nullif(trim(p_operation), ''), 'orders.dashboard')
  );
$function$;

REVOKE ALL ON FUNCTION public.can_use_orders_module(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_orders_module(uuid, text) TO authenticated, service_role;

-- 3) Trial genérico por módulo
CREATE OR REPLACE FUNCTION public.start_module_trial(
  p_company_id uuid,
  p_module public.app_module
)
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
  WHERE company_id = p_company_id AND module = p_module
  FOR UPDATE;

  IF v_row.id IS NOT NULL THEN
    IF v_row.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'code', 'already_active',
        'message', 'Este módulo já está ativo nesta empresa.');
    END IF;
    IF v_row.status = 'trial' AND v_row.trial_termina_em > now() THEN
      RETURN jsonb_build_object('success', true, 'code', 'already_trialing',
        'message', 'Teste gratuito já está em andamento.',
        'trial_started_at', v_row.trial_iniciado_em,
        'trial_ends_at', v_row.trial_termina_em);
    END IF;
    IF v_row.trial_iniciado_em IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'trial_already_used',
        'message', 'Esta empresa já utilizou o teste gratuito deste módulo.',
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
    p_company_id, p_module, 'trial', v_start, v_end, v_start, v_end
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
  WHERE company_id = p_company_id AND module = p_module;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid, 'module_trial_started', 'company_modules', v_row.id::text,
    jsonb_build_object(
      'company_id', p_company_id,
      'module', p_module,
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

REVOKE ALL ON FUNCTION public.start_module_trial(uuid, public.app_module) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_module_trial(uuid, public.app_module) TO authenticated, service_role;

-- 4) Wrapper de compatibilidade do trial de Pedidos
CREATE OR REPLACE FUNCTION public.start_orders_trial(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.start_module_trial(p_company_id, 'pedidos'::public.app_module);
$function$;

REVOKE ALL ON FUNCTION public.start_orders_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_orders_trial(uuid) TO authenticated, service_role;