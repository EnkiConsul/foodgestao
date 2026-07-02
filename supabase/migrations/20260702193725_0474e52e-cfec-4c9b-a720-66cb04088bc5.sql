
-- Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER functions in public schema,
-- and grant only to authenticated where the app invokes them.
-- Trigger-only functions receive no grants (triggers do not require EXECUTE).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon;',
                   r.schema_name, r.func_name, r.args);
  END LOOP;
END $$;

-- Grant EXECUTE to authenticated for callable helpers used by the app
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ia_usage_today(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_accessible_accounts(public.context_type, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_payment_methods(public.context_type, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_categories(public.context_type, uuid, public.transaction_type) TO authenticated;

GRANT EXECUTE ON FUNCTION public.plin_ia_summary(public.context_type, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_account(public.context_type, uuid, date, date, public.transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_category(public.context_type, uuid, date, date, public.transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_contact(public.context_type, uuid, date, date, public.transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_upcoming(public.context_type, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_overdue(public.context_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_search_transactions(public.context_type, uuid, date, date, public.transaction_type, public.transaction_status, uuid, uuid, uuid, numeric, numeric, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_cashflow(public.context_type, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_accounts_balance(public.context_type, uuid) TO authenticated;
