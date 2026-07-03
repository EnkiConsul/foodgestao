
CREATE OR REPLACE FUNCTION public.can_manage_bank_connection(_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _conn record;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT user_id, context, company_id INTO _conn FROM public.bank_connections WHERE id = _connection_id;
  IF _conn IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;
  IF _conn.user_id = _uid THEN RETURN true; END IF;
  IF _conn.context = 'pj' AND _conn.company_id IS NOT NULL THEN
    RETURN private.is_company_admin_or_owner(_uid, _conn.company_id);
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_sync_bank_connection(_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _conn record;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT user_id, context, company_id INTO _conn FROM public.bank_connections WHERE id = _connection_id;
  IF _conn IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;
  IF _conn.context = 'pf' THEN
    RETURN _conn.user_id = _uid;
  END IF;
  IF _conn.company_id IS NULL THEN RETURN false; END IF;
  RETURN private.member_can_edit(_uid, _conn.company_id, 'transactions');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_bank_connection(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_sync_bank_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_bank_connection(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_sync_bank_connection(uuid) TO authenticated, service_role;
