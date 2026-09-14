-- Fase 8: decisão central de acesso ao Portal do Colaborador
CREATE OR REPLACE FUNCTION private.dp_portal_decisao(_user_id uuid)
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  IF v_col.is_active IS NOT TRUE
     OR lower(COALESCE(v_col.status_tenant, '')) IN ('suspenso','suspended','cancelado','canceled','bloqueado','blocked','expirado','expired','inativo','inactive') THEN
    RETURN QUERY SELECT 'empresa_inativa'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

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

  IF v_col.ativo IS TRUE THEN
    v_estado := 'ativo';
  ELSIF v_col.acesso_portal_ate IS NOT NULL AND v_col.acesso_portal_ate >= v_hoje THEN
    v_estado := 'desligado_no_prazo';
  ELSE
    v_estado := 'desligado_expirado';
  END IF;

  RETURN QUERY SELECT v_estado, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
END;
$fn$;

GRANT EXECUTE ON FUNCTION private.dp_portal_decisao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.dp_pode_agir(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM private.dp_portal_decisao(_user_id) d WHERE d.estado = 'ativo');
$fn$;

CREATE OR REPLACE FUNCTION private.dp_pode_ver_documentos(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo')
  );
$fn$;

GRANT EXECUTE ON FUNCTION private.dp_pode_agir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.dp_pode_ver_documentos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_dp_colaborador_of_company(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_meu_acesso_portal()
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date, somente_documentos boolean, permitido boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.estado, d.colaborador_id, d.company_id, d.acesso_ate,
         d.estado = 'desligado_no_prazo',
         d.estado IN ('ativo','desligado_no_prazo')
  FROM private.dp_portal_decisao(auth.uid()) d
  WHERE auth.uid() IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.dp_meu_acesso_portal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_meu_acesso_portal() TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR auth.uid() IS NULL
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado = 'ativo';
$fn$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR auth.uid() IS NULL
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado IN ('ativo','desligado_no_prazo');
$fn$;

CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.dp_colaborador_of(_user_id) IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo')
      AND d.company_id = _company_id
  );
$fn$;

DROP POLICY IF EXISTS dp_doc_colab_cancel_pending ON public.dp_documentos;
CREATE POLICY dp_doc_colab_cancel_pending ON public.dp_documentos
FOR DELETE TO authenticated
USING (
  colaborador_id IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
  AND submetido_por_colaborador = true
  AND aprovacao_status = 'pendente'::public.dp_documento_aprovacao_status
);

DROP POLICY IF EXISTS dp_comentarios_self_insert ON public.dp_avisos_comentarios;
CREATE POLICY dp_comentarios_self_insert ON public.dp_avisos_comentarios
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (
    private.is_company_member((SELECT auth.uid()), company_id)
    OR (
      private.is_dp_colaborador_of_company((SELECT auth.uid()), company_id)
      AND private.dp_pode_agir((SELECT auth.uid()))
    )
  )
);

-- ações do portal passam a exigir vínculo ativo nas rotinas existentes
DO $do$
DECLARE
  r record;
  s text;
  n text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('dp_convocacao_responder_oferta','dp_convocacao_registrar_visualizacao','dp_solicitacao_cancelar')
  LOOP
    s := pg_get_functiondef(r.oid);
    n := replace(s, 'public.dp_colaborador_of(v_uid)', 'public.dp_colaborador_ativo_of(v_uid)');
    IF n = s THEN
      RAISE EXCEPTION 'FASE8: nao foi possivel ajustar %', r.proname;
    END IF;
    EXECUTE n;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('dp_ferias_solicitar','dp_ferias_registrar_ciencia')
  LOOP
    s := pg_get_functiondef(r.oid);
    n := replace(
           replace(s,
             'IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid() THEN',
             'IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid() OR NOT private.dp_pode_agir(auth.uid()) THEN'),
           'IF v_gozo.col_user_id IS NULL OR v_gozo.col_user_id <> auth.uid() THEN',
           'IF v_gozo.col_user_id IS NULL OR v_gozo.col_user_id <> auth.uid() OR NOT private.dp_pode_agir(auth.uid()) THEN');
    IF n = s THEN
      RAISE EXCEPTION 'FASE8: nao foi possivel ajustar %', r.proname;
    END IF;
    EXECUTE n;
  END LOOP;
END
$do$;