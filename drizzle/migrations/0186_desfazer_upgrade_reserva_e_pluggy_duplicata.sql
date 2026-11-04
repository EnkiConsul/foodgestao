CREATE OR REPLACE FUNCTION public.billing_v2_desfazer_disponivel(_subscription_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_ini timestamptz;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta assinatura.' USING ERRCODE = '42501';
  END IF;
  SELECT current_period_start, current_period_end, billing_cycle INTO s FROM subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_ini := COALESCE(s.current_period_start,
    s.current_period_end - CASE WHEN s.billing_cycle = 'anual' THEN interval '1 year' ELSE interval '1 month' END,
    '-infinity'::timestamptz);
  -- Reserva (upgrade_desfeito) conta para o limite, salvo se uma reversão a anulou.
  RETURN NOT EXISTS (
    SELECT 1 FROM subscription_events e
     WHERE e.subscription_id = _subscription_id AND e.tipo_evento = 'upgrade_desfeito' AND e.created_at >= v_ini
       AND NOT EXISTS (SELECT 1 FROM subscription_events r
                        WHERE r.subscription_id = _subscription_id AND r.tipo_evento = 'upgrade_desfeito_revertido'
                          AND r.payload->>'reserva_id' = e.id::text));
END $function$;

GRANT EXECUTE ON FUNCTION public.pluggy_mark_duplicate_staging TO authenticated;