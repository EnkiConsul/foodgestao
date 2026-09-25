REVOKE ALL ON FUNCTION public.subscriptions_default_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.companies_link_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_addons_touch() FROM PUBLIC, anon, authenticated;