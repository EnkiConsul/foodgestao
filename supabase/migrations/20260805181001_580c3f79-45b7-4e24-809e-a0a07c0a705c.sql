-- 1) Integridade das datas de trial
ALTER TABLE public.company_modules
  DROP CONSTRAINT IF EXISTS company_modules_trial_window_chk;
ALTER TABLE public.company_modules
  ADD CONSTRAINT company_modules_trial_window_chk
  CHECK (
    trial_iniciado_em IS NULL
    OR trial_termina_em IS NULL
    OR trial_termina_em > trial_iniciado_em
  );

CREATE INDEX IF NOT EXISTS idx_company_modules_module_status
  ON public.company_modules (module, status);

-- 2) Guard: trial não pode ser reiniciado/alterado fora da RPC oficial
CREATE OR REPLACE FUNCTION public.guard_company_modules_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.orders_trial_ctx', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF OLD.trial_iniciado_em IS NOT NULL
     AND NEW.trial_iniciado_em IS DISTINCT FROM OLD.trial_iniciado_em THEN
    RAISE EXCEPTION 'Não é permitido reiniciar o período de teste deste módulo';
  END IF;
  IF OLD.trial_termina_em IS NOT NULL
     AND NEW.trial_termina_em IS DISTINCT FROM OLD.trial_termina_em THEN
    RAISE EXCEPTION 'Não é permitido alterar a data final do período de teste';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_company_modules_trial ON public.company_modules;
CREATE TRIGGER trg_guard_company_modules_trial
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_modules_trial();

-- 3) Direito de uso (fail closed)
CREATE OR REPLACE FUNCTION public.can_use_orders_module(
  p_company_id uuid,
  p_operation text DEFAULT 'orders.dashboard'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE c.id = p_company_id AND (c.user_id = v_uid OR c.owner_id = v_uid)
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

  -- nível de permissão por chave canônica
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
    -- modo consulta: apenas leitura, e somente se o módulo já foi contratado antes
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
$$;

REVOKE ALL ON FUNCTION public.can_use_orders_module(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_use_orders_module(uuid, text) TO authenticated, service_role;

-- 4) Início do trial (atômico, idempotente, backend-only nas datas)
CREATE OR REPLACE FUNCTION public.start_orders_trial(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_role IS NULL AND (v_company.user_id = v_uid OR v_company.owner_id = v_uid) THEN
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
      -- idempotente: clique duplo devolve o mesmo trial
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
$$;

REVOKE ALL ON FUNCTION public.start_orders_trial(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_orders_trial(uuid) TO authenticated, service_role;