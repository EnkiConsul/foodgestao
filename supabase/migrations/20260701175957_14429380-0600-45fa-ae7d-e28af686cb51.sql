
-- Revoke public/anon execute on SECURITY DEFINER helpers not intended for anonymous callers.
REVOKE EXECUTE ON FUNCTION public.apply_tx_balance(public.transactions, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_account_balance_on_tx() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_transaction_destination_account() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_transaction_payment_method() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_accessible_accounts(public.context_type, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_accessible_payment_methods(public.context_type, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

-- Also revoke from trigger-only functions for authenticated (triggers run as table owner regardless).
REVOKE EXECUTE ON FUNCTION public.apply_tx_balance(public.transactions, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_account_balance_on_tx() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_transaction_destination_account() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_transaction_payment_method() FROM authenticated;

-- Explicit deny-all policies for asaas_webhook_events writes (service role bypasses RLS).
CREATE POLICY "no_client_insert_webhook_events" ON public.asaas_webhook_events
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_webhook_events" ON public.asaas_webhook_events
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_webhook_events" ON public.asaas_webhook_events
  FOR DELETE TO anon, authenticated USING (false);
