-- =========================================================
-- MÓDULO PEDIDOS — FASE 2: onboarding e ativação da unidade
-- =========================================================

CREATE TYPE public.ped_unit_state AS ENUM ('setup','closed','open','paused','scheduled_only','suspended');
CREATE TYPE public.ped_fulfillment_mode AS ENUM ('delivery','pickup','counter','table','dine_in');
CREATE TYPE public.ped_order_channel AS ENUM ('balcao','link_proprio','whatsapp','telefone','integracao');
CREATE TYPE public.ped_accept_mode AS ENUM ('manual','automatic');
CREATE TYPE public.ped_payment_kind AS ENUM ('pix','dinheiro','credito','debito','vale','online','outro');

-- ---------------------------------------------------------
-- 1) Extensão operacional da unidade (reuso de dp_unidades)
-- ---------------------------------------------------------
CREATE TABLE public.ped_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL UNIQUE REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  codigo_interno text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  operational_state public.ped_unit_state NOT NULL DEFAULT 'setup',
  fulfillment_modes public.ped_fulfillment_mode[] NOT NULL DEFAULT '{}',
  channels public.ped_order_channel[] NOT NULL DEFAULT '{}',
  accept_mode public.ped_accept_mode NOT NULL DEFAULT 'manual',
  prep_time_minutes integer NOT NULL DEFAULT 30,
  scheduled_orders_enabled boolean NOT NULL DEFAULT false,
  sound_enabled boolean NOT NULL DEFAULT true,
  notifications_enabled boolean NOT NULL DEFAULT true,
  printer_enabled boolean NOT NULL DEFAULT false,
  responsible_user_id uuid,
  external_menu_url text,
  onboarding_step smallint NOT NULL DEFAULT 1,
  onboarding_completed_at timestamptz,
  test_order_completed_at timestamptz,
  activated_at timestamptz,
  activated_by uuid,
  paused_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_units_prep_time_chk CHECK (prep_time_minutes BETWEEN 1 AND 480),
  CONSTRAINT ped_units_step_chk CHECK (onboarding_step BETWEEN 1 AND 5),
  CONSTRAINT ped_units_codigo_chk CHECK (codigo_interno IS NULL OR char_length(btrim(codigo_interno)) BETWEEN 1 AND 30),
  CONSTRAINT ped_units_menu_url_chk CHECK (external_menu_url IS NULL OR external_menu_url ~* '^https?://.{3,500}$')
);

CREATE UNIQUE INDEX ped_units_company_codigo_uk
  ON public.ped_units (company_id, lower(btrim(codigo_interno)))
  WHERE codigo_interno IS NOT NULL;
CREATE INDEX idx_ped_units_company_state ON public.ped_units (company_id, operational_state);

GRANT SELECT ON public.ped_units TO authenticated;
GRANT ALL ON public.ped_units TO service_role;
ALTER TABLE public.ped_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ped_units_select_members" ON public.ped_units
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

-- ---------------------------------------------------------
-- 2) Horários de funcionamento
-- ---------------------------------------------------------
CREATE TABLE public.ped_unit_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_unit_hours_weekday_chk CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT ped_unit_hours_range_chk CHECK (closes_at > opens_at)
);
CREATE INDEX idx_ped_unit_hours_unit ON public.ped_unit_hours (unit_id, weekday, opens_at);

GRANT SELECT ON public.ped_unit_hours TO authenticated;
GRANT ALL ON public.ped_unit_hours TO service_role;
ALTER TABLE public.ped_unit_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ped_unit_hours_select_members" ON public.ped_unit_hours
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE OR REPLACE FUNCTION public.ped_unit_hours_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ped_unit_hours h
    WHERE h.unit_id = NEW.unit_id
      AND h.weekday = NEW.weekday
      AND h.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND NEW.opens_at < h.closes_at
      AND h.opens_at < NEW.closes_at
  ) THEN
    RAISE EXCEPTION 'Horários sobrepostos para o mesmo dia da semana (%).', NEW.weekday
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ped_unit_hours_no_overlap
  BEFORE INSERT OR UPDATE ON public.ped_unit_hours
  FOR EACH ROW EXECUTE FUNCTION public.ped_unit_hours_no_overlap();

CREATE TRIGGER trg_ped_unit_hours_updated_at
  BEFORE UPDATE ON public.ped_unit_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 3) Exceções de calendário (feriados / datas especiais)
-- ---------------------------------------------------------
CREATE TABLE public.ped_unit_hour_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT true,
  opens_at time,
  closes_at time,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_unit_hour_exc_range_chk CHECK (
    (is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
  ),
  CONSTRAINT ped_unit_hour_exc_note_chk CHECK (note IS NULL OR char_length(note) <= 200)
);
CREATE UNIQUE INDEX ped_unit_hour_exc_uk
  ON public.ped_unit_hour_exceptions (unit_id, exception_date, COALESCE(opens_at, '00:00'::time));

GRANT SELECT ON public.ped_unit_hour_exceptions TO authenticated;
GRANT ALL ON public.ped_unit_hour_exceptions TO service_role;
ALTER TABLE public.ped_unit_hour_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ped_unit_hour_exc_select_members" ON public.ped_unit_hour_exceptions
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE TRIGGER trg_ped_unit_hour_exc_updated_at
  BEFORE UPDATE ON public.ped_unit_hour_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 4) Formas de recebimento da unidade (independe do Financeiro)
-- ---------------------------------------------------------
CREATE TABLE public.ped_unit_payment_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  kind public.ped_payment_kind NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_unit_payment_label_chk CHECK (label IS NULL OR char_length(label) <= 60)
);
CREATE UNIQUE INDEX ped_unit_payment_uk ON public.ped_unit_payment_options (unit_id, kind);

GRANT SELECT ON public.ped_unit_payment_options TO authenticated;
GRANT ALL ON public.ped_unit_payment_options TO service_role;
ALTER TABLE public.ped_unit_payment_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ped_unit_payment_select_members" ON public.ped_unit_payment_options
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE TRIGGER trg_ped_unit_payment_updated_at
  BEFORE UPDATE ON public.ped_unit_payment_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 5) Pedido de teste (isolado dos pedidos reais)
-- ---------------------------------------------------------
CREATE TABLE public.ped_test_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'created',
  fulfillment_mode public.ped_fulfillment_mode NOT NULL,
  channel public.ped_order_channel NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ped_test_orders_is_test_chk CHECK (is_test),
  CONSTRAINT ped_test_orders_status_chk CHECK (status IN ('created','accepted','preparing','completed','canceled')),
  CONSTRAINT ped_test_orders_total_chk CHECK (total >= 0)
);
CREATE INDEX idx_ped_test_orders_unit ON public.ped_test_orders (unit_id, created_at DESC);

GRANT SELECT ON public.ped_test_orders TO authenticated;
GRANT ALL ON public.ped_test_orders TO service_role;
ALTER TABLE public.ped_test_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ped_test_orders_select_members" ON public.ped_test_orders
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE TRIGGER trg_ped_units_updated_at
  BEFORE UPDATE ON public.ped_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- 6) Guarda de autorização compartilhada
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_assert_can_manage(p_company_id uuid, p_operation text DEFAULT 'orders.settings')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  v_ent := public.can_use_orders_module(p_company_id, p_operation);
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Sem permissão para % (motivo: %).', p_operation, COALESCE(v_ent->>'reason','forbidden')
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE((v_ent->>'read_only')::boolean, true) THEN
    RAISE EXCEPTION 'Módulo Pedidos em modo consulta (motivo: %).', COALESCE(v_ent->>'effective_status','')
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_ent->>'role','') NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Somente proprietário ou administrador pode alterar a configuração da unidade.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_ent;
END;
$$;

-- Resolve a unidade garantindo que pertence à empresa do usuário
CREATE OR REPLACE FUNCTION public.ped_resolve_unit(p_unit_id uuid, p_operation text DEFAULT 'orders.settings')
RETURNS public.ped_units
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.ped_assert_can_manage(v_unit.company_id, p_operation);
  RETURN v_unit;
END;
$$;

-- ---------------------------------------------------------
-- 7) Etapa 1 — cadastro da operação / unidade
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_upsert_unit(
  p_company_id uuid,
  p_nome text,
  p_unit_id uuid DEFAULT NULL,
  p_codigo_interno text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_timezone text DEFAULT 'America/Sao_Paulo',
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text := nullif(btrim(p_nome), '');
  v_codigo text := nullif(btrim(p_codigo_interno), '');
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_unidade_id uuid;
  v_unit public.ped_units;
BEGIN
  PERFORM public.ped_assert_can_manage(p_company_id, 'orders.settings');

  IF v_nome IS NULL OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe o nome da unidade (até 120 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_uf IS NOT NULL AND char_length(btrim(p_uf)) NOT IN (0, 2) THEN
    RAISE EXCEPTION 'UF inválida.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fuso horário inválido: %.', v_tz USING ERRCODE = '22023';
  END;

  IF p_responsible_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = p_responsible_user_id
    UNION ALL
    SELECT 1 FROM public.companies c
     WHERE c.id = p_company_id AND (c.user_id = p_responsible_user_id OR c.owner_id = p_responsible_user_id)
  ) THEN
    RAISE EXCEPTION 'Responsável precisa ser um usuário da própria empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_unit_id IS NOT NULL THEN
    v_unit := public.ped_resolve_unit(p_unit_id, 'orders.settings');
    IF v_unit.company_id <> p_company_id THEN
      RAISE EXCEPTION 'Unidade não pertence à empresa informada.' USING ERRCODE = '42501';
    END IF;
    IF v_unit.operational_state = 'suspended' THEN
      RAISE EXCEPTION 'Unidade suspensa não pode ser alterada.' USING ERRCODE = '42501';
    END IF;
    v_unidade_id := v_unit.unidade_id;

    UPDATE public.dp_unidades
       SET nome = v_nome,
           telefone = nullif(btrim(p_telefone), ''),
           endereco = nullif(btrim(p_endereco), ''),
           cidade = nullif(btrim(p_cidade), ''),
           uf = upper(nullif(btrim(p_uf), ''))
     WHERE id = v_unidade_id;

    UPDATE public.ped_units
       SET codigo_interno = v_codigo,
           timezone = v_tz,
           responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id, v_uid),
           onboarding_step = GREATEST(onboarding_step, 2)
     WHERE id = v_unit.id
     RETURNING * INTO v_unit;
  ELSE
    INSERT INTO public.dp_unidades (company_id, nome, telefone, endereco, cidade, uf)
    VALUES (p_company_id, v_nome, nullif(btrim(p_telefone), ''), nullif(btrim(p_endereco), ''),
            nullif(btrim(p_cidade), ''), upper(nullif(btrim(p_uf), '')))
    RETURNING id INTO v_unidade_id;

    INSERT INTO public.ped_units (company_id, unidade_id, codigo_interno, timezone, responsible_user_id, onboarding_step)
    VALUES (p_company_id, v_unidade_id, v_codigo, v_tz, coalesce(p_responsible_user_id, v_uid), 2)
    RETURNING * INTO v_unit;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, CASE WHEN p_unit_id IS NULL THEN 'orders_unit_created' ELSE 'orders_unit_updated' END,
          'ped_units', v_unit.id::text,
          jsonb_build_object('company_id', p_company_id, 'timezone', v_tz));

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id, 'unidade_id', v_unidade_id,
                            'onboarding_step', v_unit.onboarding_step);
END;
$$;

-- ---------------------------------------------------------
-- 8) Etapa 2 — atendimento e horários
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_save_unit_service(
  p_unit_id uuid,
  p_fulfillment_modes text[],
  p_channels text[] DEFAULT NULL,
  p_prep_time_minutes integer DEFAULT NULL,
  p_scheduled_orders_enabled boolean DEFAULT NULL,
  p_hours jsonb DEFAULT NULL,
  p_exceptions jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_modes public.ped_fulfillment_mode[];
  v_channels public.ped_order_channel[];
  v_item jsonb;
  v_count int := 0;
BEGIN
  v_unit := public.ped_resolve_unit(p_unit_id, 'orders.settings');
  IF v_unit.operational_state = 'suspended' THEN
    RAISE EXCEPTION 'Unidade suspensa não pode ser alterada.' USING ERRCODE = '42501';
  END IF;

  IF p_fulfillment_modes IS NULL OR array_length(p_fulfillment_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma forma de atendimento.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x::public.ped_fulfillment_mode) INTO v_modes FROM unnest(p_fulfillment_modes) x;
  IF p_channels IS NOT NULL THEN
    SELECT array_agg(DISTINCT x::public.ped_order_channel) INTO v_channels FROM unnest(p_channels) x;
  END IF;

  IF p_prep_time_minutes IS NOT NULL AND (p_prep_time_minutes < 1 OR p_prep_time_minutes > 480) THEN
    RAISE EXCEPTION 'Tempo de preparo deve estar entre 1 e 480 minutos.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ped_units
     SET fulfillment_modes = v_modes,
         channels = coalesce(v_channels, channels),
         prep_time_minutes = coalesce(p_prep_time_minutes, prep_time_minutes),
         scheduled_orders_enabled = coalesce(p_scheduled_orders_enabled, scheduled_orders_enabled),
         onboarding_step = GREATEST(onboarding_step, 3)
   WHERE id = v_unit.id
   RETURNING * INTO v_unit;

  IF p_hours IS NOT NULL THEN
    DELETE FROM public.ped_unit_hours WHERE unit_id = v_unit.id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_hours) LOOP
      INSERT INTO public.ped_unit_hours (company_id, unit_id, weekday, opens_at, closes_at)
      VALUES (v_unit.company_id, v_unit.id,
              (v_item->>'weekday')::smallint,
              (v_item->>'opens_at')::time,
              (v_item->>'closes_at')::time);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  IF p_exceptions IS NOT NULL THEN
    DELETE FROM public.ped_unit_hour_exceptions WHERE unit_id = v_unit.id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_exceptions) LOOP
      INSERT INTO public.ped_unit_hour_exceptions (company_id, unit_id, exception_date, is_closed, opens_at, closes_at, note)
      VALUES (v_unit.company_id, v_unit.id,
              (v_item->>'exception_date')::date,
              coalesce((v_item->>'is_closed')::boolean, true),
              nullif(v_item->>'opens_at','')::time,
              nullif(v_item->>'closes_at','')::time,
              nullif(btrim(coalesce(v_item->>'note','')), ''));
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_unit_service_saved', 'ped_units', v_unit.id::text,
          jsonb_build_object('modes', v_modes, 'hours', v_count));

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id, 'hours_saved', v_count,
                            'onboarding_step', v_unit.onboarding_step);
END;
$$;

-- ---------------------------------------------------------
-- 9) Etapa 3 — recebimento
-- ---------------------------------------------------------
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

  IF v_url IS NOT NULL AND v_url !~* '^https?://.{3,500}$' THEN
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

-- ---------------------------------------------------------
-- 10) Etapa 4 — pedido de teste
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_create_test_order(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_order public.ped_test_orders;
  v_mode public.ped_fulfillment_mode;
  v_channel public.ped_order_channel;
BEGIN
  v_unit := public.ped_resolve_unit(p_unit_id, 'orders.settings');
  IF v_unit.operational_state = 'suspended' THEN
    RAISE EXCEPTION 'Unidade suspensa não pode gerar pedido de teste.' USING ERRCODE = '42501';
  END IF;
  IF array_length(v_unit.fulfillment_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'Configure a forma de atendimento antes do pedido de teste.' USING ERRCODE = '22023';
  END IF;

  v_mode := v_unit.fulfillment_modes[1];
  v_channel := COALESCE(v_unit.channels[1], 'balcao'::public.ped_order_channel);

  INSERT INTO public.ped_test_orders (company_id, unit_id, fulfillment_mode, channel, items, total, status, created_by, completed_at)
  VALUES (v_unit.company_id, v_unit.id, v_mode, v_channel,
          jsonb_build_array(jsonb_build_object('name', 'Item de teste', 'qty', 1, 'price', 0)),
          0, 'completed', auth.uid(), now())
  RETURNING * INTO v_order;

  UPDATE public.ped_units
     SET test_order_completed_at = now(),
         onboarding_step = GREATEST(onboarding_step, 4)
   WHERE id = v_unit.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_test_order_created', 'ped_test_orders', v_order.id::text,
          jsonb_build_object('unit_id', v_unit.id, 'is_test', true));

  RETURN jsonb_build_object('success', true, 'test_order_id', v_order.id, 'unit_id', v_unit.id);
END;
$$;

-- ---------------------------------------------------------
-- 11) Checklist
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_unit_checklist(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_ent jsonb;
  v_company_active boolean := false;
  v_items jsonb;
  v_ready boolean;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.is_company_member(auth.uid(), v_unit.company_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta unidade.' USING ERRCODE = '42501';
  END IF;

  v_ent := public.can_use_orders_module(v_unit.company_id, 'orders.dashboard');
  SELECT coalesce(c.is_active, false) INTO v_company_active FROM public.companies c WHERE c.id = v_unit.company_id;

  v_items := jsonb_build_object(
    'company_active', v_company_active,
    'subscription_valid', coalesce((v_ent->>'usable')::boolean, false),
    'unit_not_suspended', v_unit.operational_state <> 'suspended',
    'fulfillment_mode', array_length(v_unit.fulfillment_modes, 1) IS NOT NULL,
    'schedule', EXISTS (SELECT 1 FROM public.ped_unit_hours h WHERE h.unit_id = v_unit.id),
    'channel', array_length(v_unit.channels, 1) IS NOT NULL,
    'menu', v_unit.external_menu_url IS NOT NULL,
    'payment', EXISTS (SELECT 1 FROM public.ped_unit_payment_options p WHERE p.unit_id = v_unit.id AND p.is_active),
    'responsible', v_unit.responsible_user_id IS NOT NULL,
    'test_order', v_unit.test_order_completed_at IS NOT NULL
  );

  SELECT bool_and(value::boolean) INTO v_ready FROM jsonb_each_text(v_items);

  RETURN jsonb_build_object(
    'unit_id', v_unit.id,
    'operational_state', v_unit.operational_state,
    'onboarding_step', v_unit.onboarding_step,
    'ready', coalesce(v_ready, false),
    'items', v_items,
    'optional', jsonb_build_object(
      'printer', v_unit.printer_enabled,
      'scheduled_orders', v_unit.scheduled_orders_enabled,
      'own_delivery', 'delivery' = ANY (v_unit.fulfillment_modes),
      'tables', 'table' = ANY (v_unit.fulfillment_modes)
    )
  );
END;
$$;

-- ---------------------------------------------------------
-- 12) Ativação da unidade (idempotente e auditável)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_orders_unit(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_check jsonb;
  v_missing text[];
BEGIN
  v_unit := public.ped_resolve_unit(p_unit_id, 'orders.manage');

  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_unit.id FOR UPDATE;

  IF v_unit.operational_state = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'code', 'unit_suspended',
      'message', 'Unidade suspensa. Fale com o suporte para reativar.');
  END IF;

  IF v_unit.operational_state = 'open' THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_open', 'unit_id', v_unit.id,
      'message', 'A unidade já está aberta para pedidos.', 'activated_at', v_unit.activated_at);
  END IF;

  v_check := public.ped_unit_checklist(v_unit.id);
  IF NOT coalesce((v_check->>'ready')::boolean, false) THEN
    SELECT array_agg(key) INTO v_missing
      FROM jsonb_each_text(v_check->'items') WHERE value::boolean IS NOT TRUE;
    RETURN jsonb_build_object('success', false, 'code', 'checklist_incomplete',
      'message', 'Conclua o checklist antes de abrir a unidade.', 'missing', to_jsonb(v_missing),
      'checklist', v_check);
  END IF;

  UPDATE public.ped_units
     SET operational_state = 'open',
         activated_at = coalesce(activated_at, now()),
         activated_by = coalesce(activated_by, auth.uid()),
         onboarding_completed_at = coalesce(onboarding_completed_at, now()),
         onboarding_step = 5,
         paused_until = NULL
   WHERE id = v_unit.id
   RETURNING * INTO v_unit;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_unit_activated', 'ped_units', v_unit.id::text,
          jsonb_build_object('company_id', v_unit.company_id, 'activated_at', v_unit.activated_at));

  RETURN jsonb_build_object('success', true, 'code', 'activated', 'unit_id', v_unit.id,
    'message', 'Unidade aberta para pedidos.', 'activated_at', v_unit.activated_at);
END;
$$;

-- ---------------------------------------------------------
-- 13) Troca de estado operacional (pausar / fechar / reabrir)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_set_unit_state(p_unit_id uuid, p_state text, p_paused_until timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.ped_units;
  v_state public.ped_unit_state := p_state::public.ped_unit_state;
BEGIN
  v_unit := public.ped_resolve_unit(p_unit_id, 'orders.manage');

  IF v_state = 'suspended' THEN
    RAISE EXCEPTION 'Suspensão é uma ação administrativa e não pode ser feita aqui.' USING ERRCODE = '42501';
  END IF;
  IF v_unit.operational_state = 'suspended' THEN
    RAISE EXCEPTION 'Unidade suspensa não pode mudar de estado.' USING ERRCODE = '42501';
  END IF;
  IF v_state IN ('open','scheduled_only') AND v_unit.activated_at IS NULL THEN
    RAISE EXCEPTION 'Conclua o onboarding e abra a unidade pela ativação.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ped_units
     SET operational_state = v_state,
         paused_until = CASE WHEN v_state = 'paused' THEN p_paused_until ELSE NULL END
   WHERE id = v_unit.id
   RETURNING * INTO v_unit;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_unit_state_changed', 'ped_units', v_unit.id::text,
          jsonb_build_object('state', v_state));

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id, 'operational_state', v_unit.operational_state);
END;
$$;

-- ---------------------------------------------------------
-- 14) Grants de execução (fail closed para anon)
-- ---------------------------------------------------------
REVOKE ALL ON FUNCTION public.ped_assert_can_manage(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_resolve_unit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_upsert_unit(uuid, text, uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_save_unit_service(uuid, text[], text[], integer, boolean, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_save_unit_receiving(uuid, text[], text, boolean, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_create_test_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_unit_checklist(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_orders_unit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_set_unit_state(uuid, text, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ped_upsert_unit(uuid, text, uuid, text, text, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_save_unit_service(uuid, text[], text[], integer, boolean, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_save_unit_receiving(uuid, text[], text, boolean, boolean, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_create_test_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_unit_checklist(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_orders_unit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_set_unit_state(uuid, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ped_assert_can_manage(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_resolve_unit(uuid, text) TO service_role;