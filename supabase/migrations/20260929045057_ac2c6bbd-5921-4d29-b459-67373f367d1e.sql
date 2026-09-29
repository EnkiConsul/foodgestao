-- Régua de cobrança e trial (100% e-mail) — AVETO 360
-- Fila idempotente + apuração de estágio alinhada a company_access_status.

-- 1) Pausa da régua por negociação
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS dunning_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_pause_reason text;

-- 2) Fila de envios
CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  stage text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_notifications_channel_chk CHECK (channel = 'email'),
  CONSTRAINT billing_notifications_status_chk
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'))
);

GRANT SELECT ON public.billing_notifications TO authenticated;
GRANT ALL ON public.billing_notifications TO service_role;

ALTER TABLE public.billing_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role gerencia a régua" ON public.billing_notifications;
CREATE POLICY "Service role gerencia a régua"
  ON public.billing_notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin lê a régua" ON public.billing_notifications;
CREATE POLICY "Super admin lê a régua"
  ON public.billing_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Trava física contra envio duplicado
CREATE UNIQUE INDEX IF NOT EXISTS billing_notifications_fatura_unica
  ON public.billing_notifications (invoice_id, stage, channel, recipient)
  WHERE invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_notifications_assinatura_unica
  ON public.billing_notifications (subscription_id, stage, channel, recipient)
  WHERE invoice_id IS NULL;

CREATE INDEX IF NOT EXISTS billing_notifications_pendentes
  ON public.billing_notifications (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS billing_notifications_empresa
  ON public.billing_notifications (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_billing_notifications_updated_at ON public.billing_notifications;
CREATE TRIGGER trg_billing_notifications_updated_at
  BEFORE UPDATE ON public.billing_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Apuração do estágio do dia (mesma lógica de dias de atraso do bloqueio)
CREATE OR REPLACE FUNCTION public.billing_dunning_scan()
RETURNS TABLE(
  company_id uuid,
  subscription_id uuid,
  invoice_id uuid,
  stage text,
  dias integer,
  amount_cents integer,
  due_date date,
  expira_em date,
  owner_user_id uuid,
  company_name text,
  company_cnpj text,
  company_email text,
  payment_url text,
  modulo text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    SELECT c.id, c.name, c.cnpj, c.email, c.user_id
      INTO v_company
      FROM public.companies c
     WHERE (s.company_id IS NOT NULL AND c.id = s.company_id)
        OR (s.company_id IS NULL AND c.user_id = s.user_id AND c.is_active IS TRUE)
     ORDER BY c.created_at ASC
     LIMIT 1;

    IF v_company.id IS NULL THEN
      CONTINUE;
    END IF;

    v_stage := NULL;
    v_d := NULL;
    v_fat := NULL;

    IF s.status = 'trialing' AND s.trial_ends_at IS NOT NULL THEN
      v_d := (current_date - (s.trial_ends_at AT TIME ZONE 'America/Sao_Paulo')::date)::integer;
      v_stage := CASE v_d
        WHEN -2 THEN 'trial_d5'
        WHEN 0 THEN 'trial_d7'
        WHEN 3 THEN 'trial_pos_3'
        WHEN 10 THEN 'trial_pos_10'
        ELSE NULL END;

      IF v_stage IS NOT NULL THEN
        RETURN QUERY SELECT v_company.id, s.id, NULL::uuid, v_stage, v_d,
          NULL::integer, NULL::date, NULL::date, v_company.user_id,
          v_company.name, v_company.cnpj, v_company.email, NULL::text, s.module;
      END IF;
      CONTINUE;
    END IF;

    SELECT i.id, i.amount_cents, i.due_date, i.external_payment_url
      INTO v_fat
      FROM public.invoices i
     WHERE i.subscription_id = s.id
       AND i.status IN ('open', 'overdue')
     ORDER BY i.due_date ASC
     LIMIT 1;

    IF v_fat.id IS NULL THEN
      CONTINUE;
    END IF;

    v_d := (current_date - v_fat.due_date)::integer;
    v_stage := CASE v_d
      WHEN -3 THEN 'd_menos_3'
      WHEN 0 THEN 'd_0'
      WHEN 1 THEN 'd_mais_1'
      WHEN 5 THEN 'd_mais_5'
      WHEN 8 THEN 'd_mais_8'
      WHEN 10 THEN 'd_mais_10'
      WHEN 11 THEN 'd_mais_11'
      WHEN 20 THEN 'd_mais_20'
      WHEN 28 THEN 'd_mais_28'
      WHEN 31 THEN 'd_mais_31'
      WHEN 60 THEN 'd_mais_60'
      WHEN 80 THEN 'd_mais_80'
      WHEN 90 THEN 'd_mais_90'
      ELSE NULL END;

    IF v_stage IS NULL THEN
      CONTINUE;
    END IF;

    RETURN QUERY SELECT v_company.id, s.id, v_fat.id, v_stage, v_d,
      v_fat.amount_cents, v_fat.due_date, (v_fat.due_date + 90)::date,
      v_company.user_id, v_company.name, v_company.cnpj, v_company.email,
      v_fat.external_payment_url, s.module;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.billing_dunning_scan() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_dunning_scan() FROM anon;
REVOKE ALL ON FUNCTION public.billing_dunning_scan() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_dunning_scan() TO service_role;

-- 4) Estágio numérico registrado na assinatura (informativo)
CREATE OR REPLACE FUNCTION public.billing_set_dunning_stage(_subscription_id uuid, _stage integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.subscriptions SET dunning_stage = _stage, updated_at = now()
   WHERE id = _subscription_id;
$function$;

REVOKE ALL ON FUNCTION public.billing_set_dunning_stage(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_set_dunning_stage(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.billing_set_dunning_stage(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_set_dunning_stage(uuid, integer) TO service_role;