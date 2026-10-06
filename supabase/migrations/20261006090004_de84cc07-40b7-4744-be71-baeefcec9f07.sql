ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'grace';

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS public.system_parameters (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.system_parameters TO authenticated;
GRANT ALL ON public.system_parameters TO service_role;
ALTER TABLE public.system_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê parâmetros" ON public.system_parameters
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin altera parâmetros" ON public.system_parameters
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.system_parameters_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.key = 'carencia_pos_cortesia_dias' THEN
    IF jsonb_typeof(NEW.value) <> 'number' OR (NEW.value)::text::numeric < 1 OR (NEW.value)::text::numeric > 90
       OR (NEW.value)::text::numeric <> trunc((NEW.value)::text::numeric) THEN
      RAISE EXCEPTION 'A carência deve ser um número inteiro de 1 a 90 dias.';
    END IF;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_system_parameters_validate BEFORE INSERT OR UPDATE ON public.system_parameters
  FOR EACH ROW EXECUTE FUNCTION public.system_parameters_validate();

INSERT INTO public.system_parameters (key, value, description)
VALUES ('carencia_pos_cortesia_dias', '10'::jsonb, 'Dias de carência após a revogação de uma cortesia')
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.company_access_status(uuid);
CREATE FUNCTION public.company_access_status(_company_id uuid)
 RETURNS TABLE(company_id uuid, is_owner boolean, status text, trial_ends_at timestamptz, blocked boolean, motivo text, dias_atraso integer, can_export boolean, valor_pendente_cents integer, fatura_pendente_id uuid, grace_ends_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_sub record;
  v_atraso integer;
  v_fatura record;
  v_best_status text := NULL;
  v_best_trial timestamptz := NULL;
  v_best_motivo text := 'sem_assinatura';
  v_best_atraso integer := NULL;
  v_best_valor integer := NULL;
  v_best_fatura uuid := NULL;
  v_best_grace timestamptz := NULL;
  v_cur_motivo text;
  v_encontrou boolean := false;
BEGIN
  IF v_uid IS NULL OR _company_id IS NULL THEN RETURN; END IF;
  SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = _company_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = v_uid
  ) THEN RETURN; END IF;

  FOR v_sub IN
    SELECT s.* FROM public.subscriptions s WHERE s.user_id = v_owner ORDER BY s.created_at DESC
  LOOP
    v_encontrou := true;
    v_atraso := NULL;
    v_cur_motivo := NULL;

    SELECT i.id, i.amount_cents, i.due_date INTO v_fatura
    FROM public.invoices i
    WHERE i.subscription_id = v_sub.id AND i.status IN ('open', 'overdue') AND i.due_date < current_date
    ORDER BY i.due_date ASC LIMIT 1;
    IF v_fatura.id IS NOT NULL THEN
      v_atraso := (current_date - v_fatura.due_date)::integer;
    END IF;

    IF v_sub.is_exempt IS TRUE AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until >= now()) THEN
      v_cur_motivo := NULL;
    ELSIF v_sub.status::text = 'grace' THEN
      IF v_sub.grace_ends_at IS NOT NULL AND v_sub.grace_ends_at >= now() THEN
        v_cur_motivo := NULL;
      ELSE
        v_cur_motivo := 'carencia_expirada';
      END IF;
    ELSIF v_sub.status = 'trialing' THEN
      IF v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at < now() THEN
        v_cur_motivo := 'trial_expirado';
      END IF;
    ELSIF v_sub.status IN ('expired', 'canceled') THEN
      v_cur_motivo := CASE WHEN v_atraso IS NOT NULL AND v_atraso > 90 THEN 'expirado_definitivo' ELSE 'rescindido' END;
    ELSIF v_sub.status IN ('active', 'past_due', 'pending') THEN
      IF v_atraso IS NULL OR v_atraso <= 10 THEN v_cur_motivo := NULL;
      ELSIF v_atraso <= 30 THEN v_cur_motivo := 'inadimplente_suspenso';
      ELSIF v_atraso <= 90 THEN v_cur_motivo := 'rescindido';
      ELSE v_cur_motivo := 'expirado_definitivo';
      END IF;
    ELSE
      v_cur_motivo := 'sem_assinatura';
    END IF;

    IF v_cur_motivo IS NULL THEN
      RETURN QUERY SELECT _company_id, (v_owner = v_uid), v_sub.status::text, v_sub.trial_ends_at,
        false, NULL::text, v_atraso, true, v_fatura.amount_cents, v_fatura.id,
        CASE WHEN v_sub.status::text = 'grace' THEN v_sub.grace_ends_at ELSE NULL END;
      RETURN;
    END IF;

    IF v_best_status IS NULL
       OR (v_best_motivo = 'expirado_definitivo' AND v_cur_motivo <> 'expirado_definitivo') THEN
      v_best_status := v_sub.status::text;
      v_best_trial := v_sub.trial_ends_at;
      v_best_motivo := v_cur_motivo;
      v_best_atraso := v_atraso;
      v_best_valor := v_fatura.amount_cents;
      v_best_fatura := v_fatura.id;
      v_best_grace := v_sub.grace_ends_at;
    END IF;
  END LOOP;

  IF NOT v_encontrou THEN v_best_motivo := 'sem_assinatura'; END IF;

  RETURN QUERY SELECT _company_id, (v_owner = v_uid), v_best_status, v_best_trial, true, v_best_motivo,
    v_best_atraso, (v_best_motivo <> 'expirado_definitivo'), v_best_valor, v_best_fatura, v_best_grace;
END;
$function$;
REVOKE ALL ON FUNCTION public.company_access_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_access_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.billing_dunning_scan()
 RETURNS TABLE(company_id uuid, subscription_id uuid, invoice_id uuid, stage text, dias integer, amount_cents integer, due_date date, expira_em date, owner_user_id uuid, company_name text, company_cnpj text, company_email text, payment_url text, modulo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_company record;
  v_fat record;
  v_d integer;
  v_stage text;
BEGIN
  FOR s IN
    SELECT sub.* FROM public.subscriptions sub
    WHERE (sub.is_exempt IS NOT TRUE OR (sub.exempt_until IS NOT NULL AND sub.exempt_until < now()))
      AND (sub.dunning_paused_until IS NULL OR sub.dunning_paused_until < now())
  LOOP
    SELECT c.id, c.name, c.cnpj, c.email, c.user_id INTO v_company
      FROM public.companies c
     WHERE (s.company_id IS NOT NULL AND c.id = s.company_id)
        OR (s.company_id IS NULL AND c.user_id = s.user_id AND c.is_active IS TRUE)
     ORDER BY c.created_at ASC LIMIT 1;
    IF v_company.id IS NULL THEN CONTINUE; END IF;

    v_stage := NULL; v_d := NULL; v_fat := NULL;

    IF s.status::text = 'grace' THEN
      IF s.grace_ends_at IS NOT NULL THEN
        v_d := (current_date - (s.grace_ends_at AT TIME ZONE 'America/Sao_Paulo')::date)::integer;
        v_stage := CASE v_d WHEN -3 THEN 'grace_d_menos_3' WHEN -1 THEN 'grace_d_menos_1' WHEN 0 THEN 'grace_d0' ELSE NULL END;
        IF v_stage IS NOT NULL THEN
          RETURN QUERY SELECT v_company.id, s.id, NULL::uuid, v_stage, v_d, NULL::integer,
            (s.grace_ends_at AT TIME ZONE 'America/Sao_Paulo')::date, NULL::date, v_company.user_id,
            v_company.name, v_company.cnpj, v_company.email, NULL::text, s.module;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    IF s.status = 'trialing' AND s.trial_ends_at IS NOT NULL THEN
      v_d := (current_date - (s.trial_ends_at AT TIME ZONE 'America/Sao_Paulo')::date)::integer;
      v_stage := CASE v_d WHEN -2 THEN 'trial_d5' WHEN 0 THEN 'trial_d7' WHEN 3 THEN 'trial_pos_3' WHEN 10 THEN 'trial_pos_10' ELSE NULL END;
      IF v_stage IS NOT NULL THEN
        RETURN QUERY SELECT v_company.id, s.id, NULL::uuid, v_stage, v_d, NULL::integer, NULL::date, NULL::date,
          v_company.user_id, v_company.name, v_company.cnpj, v_company.email, NULL::text, s.module;
      END IF;
      CONTINUE;
    END IF;

    SELECT i.id, i.amount_cents, i.due_date, i.external_payment_url INTO v_fat
      FROM public.invoices i
     WHERE i.subscription_id = s.id AND i.status IN ('open', 'overdue')
     ORDER BY i.due_date ASC LIMIT 1;
    IF v_fat.id IS NULL THEN CONTINUE; END IF;

    v_d := (current_date - v_fat.due_date)::integer;
    v_stage := CASE v_d
      WHEN -3 THEN 'd_menos_3' WHEN 0 THEN 'd_0' WHEN 1 THEN 'd_mais_1' WHEN 5 THEN 'd_mais_5'
      WHEN 8 THEN 'd_mais_8' WHEN 10 THEN 'd_mais_10' WHEN 11 THEN 'd_mais_11' WHEN 20 THEN 'd_mais_20'
      WHEN 28 THEN 'd_mais_28' WHEN 31 THEN 'd_mais_31' WHEN 60 THEN 'd_mais_60' WHEN 80 THEN 'd_mais_80'
      WHEN 90 THEN 'd_mais_90' ELSE NULL END;
    IF v_stage IS NULL THEN CONTINUE; END IF;

    RETURN QUERY SELECT v_company.id, s.id, v_fat.id, v_stage, v_d, v_fat.amount_cents, v_fat.due_date,
      (v_fat.due_date + 90)::date, v_company.user_id, v_company.name, v_company.cnpj, v_company.email,
      v_fat.external_payment_url, s.module;
  END LOOP;
END;
$function$;