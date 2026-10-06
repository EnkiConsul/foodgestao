REVOKE ALL ON FUNCTION public.subscription_close_grace_on_active() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscriptions_v2_link_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.companies_v2_billing_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_status_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscriptions_v2_unique_guard() FROM PUBLIC, anon, authenticated;