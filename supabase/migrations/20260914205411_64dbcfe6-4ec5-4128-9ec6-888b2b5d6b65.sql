CREATE OR REPLACE FUNCTION private.dp_portal_decisao(_user_id uuid)
 RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_col record;
  v_n int;
  v_hoje date;
  v_sub record;
  v_mod record;
  v_estado text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN QUERY SELECT 'sem_vinculo'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  IF NOT private.dp_access_enabled(_user_id) THEN
    RETURN QUERY SELECT 'bloqueado'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.dp_colaboradores c
  WHERE c.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = c.company_id AND co.user_id = _user_id)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.company_id AND m.user_id = _user_id AND m.role IN ('owner','admin'));

  IF v_n <> 1 THEN
    RETURN QUERY SELECT 'sem_vinculo'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  SELECT c.id, c.company_id, c.ativo, c.acesso_portal_ate,
         co.user_id AS owner_id, co.is_active, co.status_tenant,
         (now() AT TIME ZONE COALESCE(NULLIF(co.timezone, ''), 'America/Sao_Paulo'))::date AS hoje
    INTO v_col
  FROM public.dp_colaboradores c
  JOIN public.companies co ON co.id = c.company_id
  WHERE c.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.companies co2 WHERE co2.id = c.company_id AND co2.user_id = _user_id)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.company_id AND m.user_id = _user_id AND m.role IN ('owner','admin'));

  v_hoje := v_col.hoje;

  -- Suspensão/bloqueio da empresa (segurança) prevalece sobre a carência.
  IF v_col.is_active IS NOT TRUE
     OR lower(COALESCE(v_col.status_tenant, '')) IN ('suspenso','suspended','cancelado','canceled','bloqueado','blocked','expirado','expired','inativo','inactive') THEN
    RETURN QUERY SELECT 'empresa_inativa'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- Estado do vínculo é resolvido ANTES da situação comercial:
  -- o desligado dentro do prazo mantém acesso somente aos documentos
  -- mesmo com assinatura vencida, plano cancelado ou módulo desativado.
  IF v_col.ativo IS TRUE THEN
    v_estado := 'ativo';
  ELSIF v_col.acesso_portal_ate IS NOT NULL AND v_col.acesso_portal_ate >= v_hoje THEN
    RETURN QUERY SELECT 'desligado_no_prazo'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  ELSE
    RETURN QUERY SELECT 'desligado_expirado'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- Daqui para baixo: somente colaborador ativo (regra inalterada).
  SELECT s.status::text AS status, s.trial_ends_at INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = v_col.owner_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.status IS NOT NULL
     AND (v_sub.status IN ('expired','canceled')
          OR (v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now())) THEN
    RETURN QUERY SELECT 'sem_plano'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  SELECT m.status::text AS status, m.trial_termina_em, m.ends_at INTO v_mod
  FROM public.company_modules m
  WHERE m.company_id = v_col.company_id AND m.module = 'dp'::public.app_module
  LIMIT 1;

  IF v_mod.status IS NOT NULL
     AND (v_mod.status IN ('suspended','canceled','trial_expirado')
          OR (v_mod.status = 'trial' AND v_mod.trial_termina_em IS NOT NULL AND v_mod.trial_termina_em < now())
          OR (v_mod.ends_at IS NOT NULL AND v_mod.ends_at < now())) THEN
    RETURN QUERY SELECT 'sem_modulo'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_estado, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
END;
$function$;