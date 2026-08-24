CREATE OR REPLACE FUNCTION public.check_onboarding_cnpj(p_cnpj text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cnpj_digits text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_company_id uuid;
  v_has_access boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_nao_autenticado';
  END IF;

  IF length(v_cnpj_digits) <> 14 THEN
    RAISE EXCEPTION 'cnpj_invalido';
  END IF;

  SELECT c.id
    INTO v_company_id
    FROM public.companies c
   WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = v_cnpj_digits
     AND c.profile_type = 'empresarial'
     AND c.is_active = true
   ORDER BY c.created_at
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('status', 'available');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.companies c
     WHERE c.id = v_company_id
       AND c.user_id = v_uid
    UNION ALL
    SELECT 1
      FROM public.company_members cm
     WHERE cm.company_id = v_company_id
       AND cm.user_id = v_uid
  ) INTO v_has_access;

  IF v_has_access THEN
    RETURN jsonb_build_object('status', 'accessible', 'company_id', v_company_id);
  END IF;

  RETURN jsonb_build_object('status', 'registered');
END;
$$;

REVOKE ALL ON FUNCTION public.check_onboarding_cnpj(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_onboarding_cnpj(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_onboarding_cnpj(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_onboarding_cnpj(text) TO service_role;