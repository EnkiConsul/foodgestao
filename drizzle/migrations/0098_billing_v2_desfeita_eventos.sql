CREATE TABLE public.billing_v2_desfeita_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  asaas_env text NOT NULL,
  payment_id text,
  alerta boolean NOT NULL DEFAULT false,
  motivo text,
  resolvido_em timestamptz,
  resolvido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_v2_desfeita_eventos TO authenticated;
GRANT ALL ON public.billing_v2_desfeita_eventos TO service_role;
ALTER TABLE public.billing_v2_desfeita_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê eventos de contratação desfeita" ON public.billing_v2_desfeita_eventos
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE INDEX ON public.billing_v2_desfeita_eventos (subscription_id);

ALTER TABLE public.asaas_env_divergencias
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolucao text;