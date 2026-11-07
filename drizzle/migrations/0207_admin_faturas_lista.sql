CREATE OR REPLACE FUNCTION public.admin_faturas_lista(p_escopo text DEFAULT 'reais')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_escopo IS NULL OR p_escopo NOT IN ('reais','teste','todas') THEN
    RAISE EXCEPTION 'Escopo inválido: % (use reais, teste ou todas)', p_escopo USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) INTO r FROM (
    SELECT to_jsonb(i) || jsonb_build_object(
      'is_test', coalesce(a.is_test, false),
      'plan_name', pl.name,
      'plan_slug', pl.slug
    ) x
    FROM invoices i
    LEFT JOIN billing_accounts a ON a.id = i.billing_account_id
    LEFT JOIN subscriptions s ON s.id = i.subscription_id
    LEFT JOIN plans pl ON pl.id = s.plan_id
    WHERE CASE p_escopo
      WHEN 'reais' THEN NOT coalesce(a.is_test, false)
      WHEN 'teste' THEN coalesce(a.is_test, false)
      ELSE true END
  ) t;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.admin_faturas_lista(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_faturas_lista(text) TO authenticated;