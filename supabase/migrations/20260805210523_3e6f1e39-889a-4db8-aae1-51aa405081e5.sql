CREATE OR REPLACE FUNCTION public.ped_save_unit_receiving(
  p_unit_id uuid,
  p_payment_kinds text[],
  p_accept_mode text DEFAULT NULL,
  p_sound_enabled boolean DEFAULT NULL,
  p_notifications_enabled boolean DEFAULT NULL,
  p_printer_enabled boolean DEFAULT NULL,
  p_external_menu_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_kinds public.ped_payment_kind[];
  v_url text := nullif(btrim(coalesce(p_external_menu_url, '')), '');
BEGIN
  v_unit := public.ped_resolve_unit(p_unit_id, 'orders.settings');
  IF v_unit.operational_state = 'suspended' THEN
    RAISE EXCEPTION 'Unidade suspensa não pode ser alterada.' USING ERRCODE = '42501';
  END IF;

  IF p_payment_kinds IS NULL OR array_length(p_payment_kinds, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma forma de recebimento.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x::public.ped_payment_kind) INTO v_kinds FROM unnest(p_payment_kinds) x;

  IF v_url IS NOT NULL AND (
       v_url !~* '^https?://.{3,}$'
       OR length(v_url) > 507
     ) THEN
    RAISE EXCEPTION 'Informe um link de cardápio válido (http/https).' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.ped_unit_payment_options
   WHERE unit_id = v_unit.id AND kind <> ALL (v_kinds);

  INSERT INTO public.ped_unit_payment_options (company_id, unit_id, kind)
  SELECT v_unit.company_id, v_unit.id, k FROM unnest(v_kinds) k
  ON CONFLICT (unit_id, kind) DO UPDATE SET is_active = true, updated_at = now();

  UPDATE public.ped_units
     SET accept_mode = coalesce(p_accept_mode::public.ped_accept_mode, accept_mode),
         sound_enabled = coalesce(p_sound_enabled, sound_enabled),
         notifications_enabled = coalesce(p_notifications_enabled, notifications_enabled),
         printer_enabled = coalesce(p_printer_enabled, printer_enabled),
         external_menu_url = coalesce(v_url, external_menu_url),
         onboarding_step = GREATEST(onboarding_step, 4)
   WHERE id = v_unit.id
   RETURNING * INTO v_unit;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_unit_receiving_saved', 'ped_units', v_unit.id::text,
          jsonb_build_object('payment_kinds', v_kinds, 'accept_mode', v_unit.accept_mode));

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id, 'onboarding_step', v_unit.onboarding_step);
END;
$$;