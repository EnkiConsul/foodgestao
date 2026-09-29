-- Portal do Colaborador: modo de consulta durante suspensão/rescisão comercial da empresa.
-- O colaborador não responde pela dívida do empregador: mantém acesso de leitura a
-- holerites, documentos e ficha durante os 90 dias de guarda dos dados.

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
  v_atraso int;
  v_leitura boolean := false;
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

  -- Desativação manual da empresa (segurança) prevalece: bloqueio total.
  IF v_col.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT 'empresa_inativa'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- Estado do vínculo é resolvido ANTES da situação comercial:
  -- o desligado dentro do prazo mantém acesso somente aos documentos.
  IF v_col.ativo IS TRUE THEN
    v_estado := 'ativo';
  ELSIF v_col.acesso_portal_ate IS NOT NULL AND v_col.acesso_portal_ate >= v_hoje THEN
    RETURN QUERY SELECT 'desligado_no_prazo'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  ELSE
    RETURN QUERY SELECT 'desligado_expirado'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- Daqui para baixo: somente colaborador ativo.

  -- Suspensão comercial do tenant: colaborador mantém leitura (não é bloqueado).
  IF lower(COALESCE(v_col.status_tenant, '')) IN
     ('suspenso','suspended','cancelado','canceled','bloqueado','blocked','expirado','expired','inativo','inactive') THEN
    v_leitura := true;
  END IF;

  SELECT s.status::text AS status, s.trial_ends_at, s.is_exempt, s.exempt_until, s.id
    INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = v_col.owner_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.status IS NOT NULL
     AND NOT (v_sub.is_exempt IS TRUE AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until >= now()))
     AND (v_sub.status IN ('expired','canceled')
          OR (v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now())) THEN
    v_leitura := true;
  END IF;

  -- Fatura vencida do empregador nunca bloqueia o colaborador: só reduz a leitura.
  IF v_sub.id IS NOT NULL THEN
    SELECT (current_date - min(i.due_date))::int INTO v_atraso
    FROM public.invoices i
    WHERE i.subscription_id = v_sub.id
      AND i.status IN ('open','overdue')
      AND i.due_date < current_date;

    IF v_atraso IS NOT NULL AND v_atraso > 10 THEN
      v_leitura := true;
    END IF;

    -- Esgotado o prazo de guarda dos dados (90 dias), o portal encerra.
    IF v_atraso IS NOT NULL AND v_atraso > 90 THEN
      RETURN QUERY SELECT 'sem_plano'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
      RETURN;
    END IF;
  END IF;

  SELECT m.status::text AS status, m.trial_termina_em, m.ends_at INTO v_mod
  FROM public.company_modules m
  WHERE m.company_id = v_col.company_id AND m.module = 'dp'::public.app_module
  LIMIT 1;

  IF v_mod.status IS NOT NULL
     AND (v_mod.status IN ('suspended','canceled','trial_expirado')
          OR (v_mod.status = 'trial' AND v_mod.trial_termina_em IS NOT NULL AND v_mod.trial_termina_em < now())
          OR (v_mod.ends_at IS NOT NULL AND v_mod.ends_at < now())) THEN
    -- Módulo encerrado há mais de 90 dias: fim do prazo de guarda, portal encerra.
    IF COALESCE(v_mod.ends_at, v_mod.trial_termina_em) IS NOT NULL
       AND COALESCE(v_mod.ends_at, v_mod.trial_termina_em) < now() - interval '90 days' THEN
      RETURN QUERY SELECT 'sem_modulo'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
      RETURN;
    END IF;
    v_leitura := true;
  END IF;

  IF v_leitura THEN
    RETURN QUERY SELECT 'empresa_suspensa_leitura'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_estado, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
END;
$function$;

-- Leitura de documentos liberada também no modo de consulta.
CREATE OR REPLACE FUNCTION private.dp_pode_ver_documentos(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura')
  );
$fn$;

CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura')
      AND d.company_id = _company_id
  );
$fn$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura');
$function$;

-- Acesso permitido em modo de consulta; ações operacionais seguem bloqueadas
-- (private.dp_pode_agir e dp_colaborador_ativo_of continuam exigindo 'ativo').
CREATE OR REPLACE FUNCTION public.dp_meu_acesso_portal()
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date, somente_documentos boolean, permitido boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.estado, d.colaborador_id, d.company_id, d.acesso_ate,
         d.estado IN ('desligado_no_prazo','empresa_suspensa_leitura'),
         d.estado IN ('ativo','desligado_no_prazo','empresa_suspensa_leitura')
  FROM private.dp_portal_decisao(auth.uid()) d
  WHERE auth.uid() IS NOT NULL;
$fn$;
