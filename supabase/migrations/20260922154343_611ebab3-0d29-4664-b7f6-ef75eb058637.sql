CREATE OR REPLACE FUNCTION private.dp_regras_admin(p_company_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
BEGIN
  IF v_claims = '' AND session_user IN ('service_role', 'postgres', 'supabase_admin') THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REGRA_EMPRESA_OBRIGATORIA'; END IF;
  IF private.is_company_admin_or_owner(auth.uid(), p_company_id) THEN RETURN; END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END $$;

CREATE OR REPLACE FUNCTION private.dp_regras_membro(p_company_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
BEGIN
  IF v_claims = '' AND session_user IN ('service_role', 'postgres', 'supabase_admin') THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REGRA_EMPRESA_OBRIGATORIA'; END IF;
  IF private.is_company_member(auth.uid(), p_company_id) THEN RETURN; END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END $$;

REVOKE ALL ON FUNCTION private.dp_regras_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regras_membro(uuid) FROM PUBLIC, anon, authenticated;
