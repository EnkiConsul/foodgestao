CREATE OR REPLACE FUNCTION public.billing_v2_expirar_carencias()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o servidor.' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT id, grace_ends_at FROM subscriptions
            WHERE status = 'grace' AND grace_ends_at IS NOT NULL AND grace_ends_at < now()
            FOR UPDATE SKIP LOCKED LOOP
    UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = r.id AND status = 'grace';
    IF FOUND THEN
      INSERT INTO subscription_events(subscription_id, tipo_evento, status_anterior, status_novo, payload)
      VALUES (r.id, 'carencia_expirada', 'grace', 'expired', jsonb_build_object('grace_ends_at', r.grace_ends_at, 'origem', 'rotina_diaria'));
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_expirar_carencias() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_expirar_carencias() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('billing-v2-carencias-expirar') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='billing-v2-carencias-expirar');
  PERFORM cron.schedule('billing-v2-carencias-expirar', '15 3 * * *', 'SELECT public.billing_v2_expirar_carencias();');
END $$;