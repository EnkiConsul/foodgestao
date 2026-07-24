CREATE OR REPLACE FUNCTION public.link_open_finance_account(_of_account_id uuid, _local_account_id uuid DEFAULT NULL::uuid, _local_credit_card_id uuid DEFAULT NULL::uuid, _auto_import boolean DEFAULT NULL::boolean)
 RETURNS open_finance_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _acc public.open_finance_accounts%ROWTYPE;
  _company_id uuid;
  _member_role text;
  _is_admin boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _acc FROM public.open_finance_accounts WHERE id = _of_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'of_account_not_found' USING ERRCODE = 'P0002';
  END IF;

  _company_id := _acc.company_id;

  -- Authorization: company owner or admin/manager member
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = _uid) THEN
    _is_admin := true;
  ELSE
    SELECT role INTO _member_role
      FROM public.company_members
     WHERE company_id = _company_id AND user_id = _uid AND is_active = true
     LIMIT 1;
    IF _member_role IN ('admin','manager','owner') THEN
      _is_admin := true;
    END IF;
  END IF;

  IF NOT _is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _acc.provider_type = 'BANK' THEN
    IF _local_credit_card_id IS NOT NULL THEN
      RAISE EXCEPTION 'cannot_link_bank_account_to_credit_card' USING ERRCODE = '22023';
    END IF;
    IF _local_account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.accounts
       WHERE id = _local_account_id AND company_id = _company_id AND context = 'pj'
    ) THEN
      RAISE EXCEPTION 'local_account_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF _acc.provider_type = 'CREDIT' THEN
    IF _local_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'cannot_link_credit_to_bank_account' USING ERRCODE = '22023';
    END IF;
    IF _local_credit_card_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.credit_cards
       WHERE id = _local_credit_card_id AND company_id = _company_id AND context = 'pj'
    ) THEN
      RAISE EXCEPTION 'local_credit_card_not_found_or_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.open_finance_accounts
     SET local_account_id     = CASE WHEN _acc.provider_type = 'BANK'   THEN _local_account_id     ELSE NULL END,
         local_credit_card_id = CASE WHEN _acc.provider_type = 'CREDIT' THEN _local_credit_card_id ELSE NULL END,
         auto_import          = COALESCE(_auto_import, auto_import),
         updated_at           = now()
   WHERE id = _of_account_id
   RETURNING * INTO _acc;

  RETURN _acc;
END;
$function$;