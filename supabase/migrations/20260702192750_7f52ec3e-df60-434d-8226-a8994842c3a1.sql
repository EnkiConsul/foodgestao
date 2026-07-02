REVOKE EXECUTE ON FUNCTION public.plin_ia_summary(context_type, uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_by_account(context_type, uuid, date, date, transaction_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_by_category(context_type, uuid, date, date, transaction_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_by_contact(context_type, uuid, date, date, transaction_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_upcoming(context_type, uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_overdue(context_type, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_search_transactions(context_type, uuid, date, date, transaction_type, transaction_status, uuid, uuid, uuid, numeric, numeric, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_cashflow(context_type, uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plin_ia_accounts_balance(context_type, uuid) FROM PUBLIC, anon;