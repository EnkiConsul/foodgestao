
ALTER FUNCTION public.billing_v2_digits(text) SET search_path = public;
ALTER FUNCTION public.trial_usage_no_delete() SET search_path = public;

CREATE OR REPLACE FUNCTION public._billing_v2_usage(_sub uuid, _recurso text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v int; v_ini date := date_trunc('month', now())::date; v_fim date := (date_trunc('month', now()) + interval '1 month')::date;
BEGIN
  IF _recurso = 'empresas' THEN
    SELECT count(*) INTO v FROM subscription_companies WHERE subscription_id = _sub AND removed_at IS NULL;
  ELSIF _recurso IN ('usuarios','usuarios_contador') THEN
    SELECT count(DISTINCT m.user_id) INTO v FROM company_members m
     JOIN subscription_companies sc ON sc.company_id = m.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE m.situacao = 'ativo' AND ((m.role::text = 'contabilidade') = (_recurso = 'usuarios_contador'));
  ELSIF _recurso = 'open_finance' THEN
    SELECT count(*) INTO v FROM pluggy_connections p
     JOIN subscription_companies sc ON sc.company_id = p.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE p.status::text NOT IN ('deleted','revoked');
  ELSIF _recurso = 'unidades' THEN
    SELECT count(*) INTO v FROM dp_unidades u
     JOIN subscription_companies sc ON sc.company_id = u.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE u.ativo;
  ELSIF _recurso = 'colaboradores' THEN
    SELECT count(*) INTO v FROM dp_colaboradores c
     JOIN subscription_companies sc ON sc.company_id = c.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE c.ativo AND c.deleted_at IS NULL AND c.data_desligamento IS NULL
       AND (c.regime::text NOT IN ('intermitente','freelancer')
            OR EXISTS (SELECT 1 FROM dp_convocacoes cv WHERE cv.colaborador_id = c.id AND cv.status::text = 'aceita' AND cv.data >= v_ini AND cv.data < v_fim)
            OR EXISTS (SELECT 1 FROM dp_escala_itens e WHERE e.colaborador_id = c.id AND e.data >= v_ini AND e.data < v_fim));
  ELSE v := 0;
  END IF;
  RETURN COALESCE(v, 0);
END $$;
REVOKE ALL ON FUNCTION public._billing_v2_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._billing_v2_usage(uuid, text) TO service_role;
