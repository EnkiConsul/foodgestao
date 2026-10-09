CREATE OR REPLACE FUNCTION public.billing_v2_block_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('aveto.qa_purge', true) = 'on' AND current_user = 'postgres' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Registro de histórico de cobrança não pode ser % .', lower(TG_OP);
END $$;

CREATE OR REPLACE FUNCTION public.trial_usage_no_delete()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('aveto.qa_purge', true) = 'on' AND current_user = 'postgres' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Registro de teste grátis é permanente e não pode ser apagado.';
END $$;

-- Remove SOMENTE massa de teste da cobrança (titulares com e-mail teste.billing.*@aveto360.com).
CREATE OR REPLACE FUNCTION public.billing_v2_qa_purge(_emails text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uids uuid[]; accs uuid[]; subs uuid[]; r jsonb := '{}'::jsonb; n int;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(_emails) e WHERE e NOT LIKE 'teste.billing.%@aveto360.com') THEN
    RAISE EXCEPTION 'Somente e-mails de teste da cobrança';
  END IF;
  PERFORM set_config('aveto.qa_purge', 'on', true);
  SELECT array_agg(DISTINCT titular_user_id) INTO uids FROM trial_usage WHERE email = ANY(_emails);
  SELECT coalesce(uids,'{}') || coalesce(array_agg(id),'{}') INTO uids FROM auth.users WHERE email = ANY(_emails);
  SELECT array_agg(id) INTO accs FROM billing_accounts WHERE titular_user_id = ANY(uids);
  SELECT array_agg(id) INTO subs FROM subscriptions WHERE user_id = ANY(uids) OR billing_account_id = ANY(accs);
  IF EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = ANY(subs) AND s.external_subscription_id IS NOT NULL AND s.asaas_env <> 'sandbox') THEN
    RAISE EXCEPTION 'Há assinatura de produção vinculada; nada removido';
  END IF;
  DELETE FROM invoices WHERE subscription_id = ANY(subs) OR billing_account_id = ANY(accs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('faturas', n);
  DELETE FROM subscription_addons WHERE subscription_id = ANY(subs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('adicionais', n);
  DELETE FROM subscription_companies WHERE subscription_id = ANY(subs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('coberturas', n);
  DELETE FROM trial_usage WHERE subscription_id = ANY(subs) OR titular_user_id = ANY(uids) OR email = ANY(_emails); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('trials', n);
  DELETE FROM subscription_events WHERE subscription_id = ANY(subs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('eventos', n);
  DELETE FROM subscriptions WHERE id = ANY(subs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('assinaturas', n);
  DELETE FROM billing_account_companies WHERE billing_account_id = ANY(accs); 
  DELETE FROM billing_accounts WHERE id = ANY(accs); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('contas', n);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_qa_purge(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_qa_purge(text[]) TO service_role;