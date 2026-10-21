REVOKE EXECUTE ON FUNCTION public.billing_v2_apply_change(uuid, text, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.billing_v2_plan_change_cancel(uuid, uuid) FROM anon;