CREATE OR REPLACE FUNCTION public.asaas_env_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF TG_TABLE_NAME = 'subscriptions' THEN
    IF NEW.billing_account_id IS NOT NULL THEN
      SELECT asaas_env INTO v FROM billing_accounts WHERE id = NEW.billing_account_id;
      IF v IS NOT NULL AND v <> NEW.asaas_env THEN
        RAISE EXCEPTION 'Ambiente do Asaas divergente entre assinatura e conta de cobrança' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.subscription_id IS NOT NULL THEN
      SELECT asaas_env INTO v FROM subscriptions WHERE id = NEW.subscription_id;
      IF v IS NOT NULL AND v <> NEW.asaas_env THEN
        RAISE EXCEPTION 'Ambiente do Asaas divergente entre fatura e assinatura' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;