-- Regras de visibilidade
CREATE OR REPLACE FUNCTION private.pode_ver_salarios(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.user_id = _user_id AND m.company_id = _company_id
      AND coalesce(m.situacao,'ativo') = 'ativo'
      AND (m.role IN ('owner','admin') OR m.ver_salarios IS NOT FALSE))
$$;
CREATE OR REPLACE FUNCTION private.pode_ver_saldos(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.user_id = _user_id AND m.company_id = _company_id
      AND coalesce(m.situacao,'ativo') = 'ativo'
      AND (m.role IN ('owner','admin') OR m.ver_saldos IS NOT FALSE))
$$;
REVOKE ALL ON FUNCTION private.pode_ver_salarios(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.pode_ver_saldos(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Colunas confidenciais do cadastro: leitura só pela consulta segura
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.dp_colaboradores'::regclass AND attnum > 0 AND NOT attisdropped
    AND attname NOT IN ('salario_base','base_salarial','cpf','rg_numero','rg_orgao','rg_uf','rg_emissao',
      'pis_nit','banco_codigo','banco_nome','agencia','conta','conta_digito','conta_tipo','pix_tipo','pix_chave');
  EXECUTE 'REVOKE SELECT ON public.dp_colaboradores FROM authenticated, anon';
  EXECUTE format('GRANT SELECT (%s) ON public.dp_colaboradores TO authenticated', v_cols);

  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.accounts'::regclass AND attnum > 0 AND NOT attisdropped
    AND attname NOT IN ('initial_balance','current_balance','bank_balance');
  EXECUTE 'REVOKE SELECT ON public.accounts FROM authenticated, anon';
  EXECUTE format('GRANT SELECT (%s) ON public.accounts TO authenticated', v_cols);
END $$;

-- Consulta segura dos campos confidenciais
CREATE OR REPLACE FUNCTION public.dp_colaboradores_confidencial(_company_id uuid, _ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, liberado boolean, salario_base numeric, base_salarial numeric, cpf text,
  rg_numero text, rg_orgao text, rg_uf text, rg_emissao date, pis_nit text,
  banco_codigo text, banco_nome text, agencia text, conta text, conta_digito text,
  conta_tipo text, pix_tipo text, pix_chave text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ler boolean;
  v_ver boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  v_ler := public.is_super_admin(v_uid)
           OR private.dp_pode_ler_empresa(_company_id) AND public.tem_permissao(_company_id, 'dp.colaboradores', 'consulta');
  v_ver := private.pode_ver_salarios(v_uid, _company_id);
  RETURN QUERY
  SELECT c.id, (v_ver OR c.user_id = v_uid),
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.salario_base END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.base_salarial END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.cpf
         WHEN c.cpf IS NULL THEN NULL
         ELSE '***.' || coalesce(substr(regexp_replace(c.cpf,'\D','','g'),4,3),'***') || '.'
              || coalesce(substr(regexp_replace(c.cpf,'\D','','g'),7,3),'***') || '-**' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_numero WHEN c.rg_numero IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_orgao END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_uf END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.rg_emissao END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pis_nit WHEN c.pis_nit IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.banco_codigo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.banco_nome END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.agencia WHEN c.agencia IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta WHEN c.conta IS NULL THEN NULL ELSE '••••' END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta_digito END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.conta_tipo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pix_tipo END,
    CASE WHEN v_ver OR c.user_id = v_uid THEN c.pix_chave WHEN c.pix_chave IS NULL THEN NULL ELSE '••••' END
  FROM public.dp_colaboradores c
  WHERE c.company_id = _company_id
    AND (_ids IS NULL OR c.id = ANY(_ids))
    AND (v_ler OR c.user_id = v_uid);
END $$;
REVOKE ALL ON FUNCTION public.dp_colaboradores_confidencial(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaboradores_confidencial(uuid, uuid[]) TO authenticated, service_role;

-- Saldos: zerados para quem não pode ver
CREATE OR REPLACE FUNCTION public.get_accessible_accounts(_context context_type, _company_id uuid DEFAULT NULL::uuid, _include_inactive boolean DEFAULT false)
 RETURNS SETOF accounts
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_accountant boolean := false;
  v_contas uuid[];
  v_saldos boolean := true;
  r public.accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN RETURN; END IF;
    IF NOT private.is_company_member(auth.uid(), _company_id) THEN
      RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
    END IF;
    v_accountant := private.is_company_accountant(auth.uid(), _company_id);
    v_contas := private.contas_permitidas(auth.uid(), _company_id);
    v_saldos := private.pode_ver_saldos(auth.uid(), _company_id);
    FOR r IN
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pj'
        AND a.company_id = _company_id
        AND (NOT v_accountant OR a.is_accounting)
        AND (v_contas IS NULL OR a.id = ANY(v_contas))
      ORDER BY a.name
    LOOP
      IF NOT v_saldos THEN
        r.initial_balance := 0; r.current_balance := 0; r.bank_balance := NULL;
      END IF;
      RETURN NEXT r;
    END LOOP;
  ELSE
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pf'
        AND a.user_id = auth.uid()
        AND a.company_id IS NULL
      ORDER BY a.name;
  END IF;
END;
$function$;

-- Rollback:
-- GRANT SELECT ON public.dp_colaboradores TO authenticated; GRANT SELECT ON public.accounts TO authenticated;
-- DROP FUNCTION public.dp_colaboradores_confidencial(uuid, uuid[]);