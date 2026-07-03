
CREATE OR REPLACE FUNCTION public.pluggy_link_provider_account(
  _conn_account_id uuid,
  _account_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _conn record;
  _acc record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;

  SELECT bca.*, bc.user_id AS conn_user_id, bc.company_id AS conn_company_id, bc.context AS conn_context
    INTO _conn
    FROM public.bank_connection_accounts bca
    JOIN public.bank_connections bc ON bc.id = bca.connection_id
    WHERE bca.id = _conn_account_id;
  IF _conn IS NULL THEN RAISE EXCEPTION 'Conexão não encontrada' USING ERRCODE='42501'; END IF;
  IF _conn.conn_user_id <> _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  IF _account_id IS NULL THEN
    UPDATE public.bank_connection_accounts SET account_id = NULL WHERE id = _conn_account_id;
    RETURN;
  END IF;

  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id;
  IF _acc IS NULL THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE='42501'; END IF;
  IF _acc.user_id <> _uid THEN RAISE EXCEPTION 'Conta não pertence ao usuário' USING ERRCODE='42501'; END IF;
  IF _acc.context <> _conn.conn_context THEN RAISE EXCEPTION 'Conta em contexto diferente' USING ERRCODE='42501'; END IF;
  IF _conn.conn_context = 'pj' AND _acc.company_id IS DISTINCT FROM _conn.conn_company_id THEN
    RAISE EXCEPTION 'Conta pertence a empresa diferente' USING ERRCODE='42501';
  END IF;

  UPDATE public.bank_connection_accounts
    SET account_id = _account_id
    WHERE id = _conn_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_link_provider_account(uuid, uuid) TO authenticated;
