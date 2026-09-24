REVOKE ALL ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_remuneracao_snapshot(uuid, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.seed_default_contacts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_contacts(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.seed_default_payment_methods(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_payment_methods(uuid, uuid) TO service_role;
-- Rollback: GRANT EXECUTE ON FUNCTION <fn> TO authenticated;