CREATE OR REPLACE FUNCTION public.purge_open_finance_link(_account_id uuid DEFAULT NULL::uuid, _card_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pa record;
  _conns uuid[] := '{}';
  _conn uuid;
BEGIN
  IF _account_id IS NULL AND _card_id IS NULL THEN RETURN; END IF;

  FOR _pa IN
    SELECT id, pluggy_account_id, connection_id
      FROM public.pluggy_accounts
     WHERE (_account_id IS NOT NULL AND linked_account_id = _account_id)
        OR (_card_id IS NOT NULL AND linked_credit_card_id = _card_id)
  LOOP
    DELETE FROM public.pluggy_staging_transactions
     WHERE pluggy_account_id = _pa.pluggy_account_id
       AND status = 'pending';
    DELETE FROM public.pluggy_accounts WHERE id = _pa.id;
    IF _pa.connection_id IS NOT NULL AND NOT (_pa.connection_id = ANY(_conns)) THEN
      _conns := _conns || _pa.connection_id;
    END IF;
  END LOOP;

  FOREACH _conn IN ARRAY _conns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pluggy_accounts
       WHERE connection_id = _conn
         AND (linked_account_id IS NOT NULL OR linked_credit_card_id IS NOT NULL)
    ) THEN
      -- Sem nenhum vínculo local restante: encerra a conexão e limpa o que sobrou
      -- do espelho, para que a próxima sincronização não recrie contas/cartões.
      DELETE FROM public.pluggy_staging_transactions
       WHERE connection_id = _conn
         AND status = 'pending';
      DELETE FROM public.pluggy_accounts WHERE connection_id = _conn;
      UPDATE public.pluggy_connections
         SET status = 'deleted', updated_at = now()
       WHERE id = _conn;
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.credit_card_other_company(_company_id uuid, _number text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.name
    FROM public.credit_cards cc
    JOIN public.companies c ON c.id = cc.company_id
   WHERE _number IS NOT NULL
     AND length(btrim(_number)) >= 4
     AND cc.company_id IS DISTINCT FROM _company_id
     AND right(regexp_replace(coalesce(cc.last4, ''), '\D', '', 'g'), 4)
         = right(regexp_replace(_number, '\D', '', 'g'), 4)
     AND private.is_company_member(auth.uid(), cc.company_id)
   ORDER BY c.name
   LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.credit_card_other_company(uuid, text) TO authenticated;