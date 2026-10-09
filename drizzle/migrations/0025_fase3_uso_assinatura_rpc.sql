CREATE OR REPLACE FUNCTION public.billing_v2_uso_assinatura(_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; r jsonb;
BEGIN
  SELECT billing_account_id INTO acc FROM subscriptions WHERE id = _subscription_id;
  IF acc IS NULL OR NOT (public.is_super_admin(auth.uid()) OR public.billing_account_can_read(acc) OR public._billing_v2_can_manage_sub(_subscription_id)) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta assinatura.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('recurso', recurso, 'incluido', incluido, 'adicional', adicional,
           'limite', limite, 'uso', uso, 'saldo', saldo) ORDER BY recurso), '[]'::jsonb)
    INTO r FROM public._billing_v2_limits(_subscription_id);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_uso_assinatura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_uso_assinatura(uuid) TO authenticated, service_role;