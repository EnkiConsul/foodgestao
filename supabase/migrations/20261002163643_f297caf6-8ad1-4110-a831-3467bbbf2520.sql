ALTER TABLE public.dp_recibos
  ADD COLUMN IF NOT EXISTS substitui_recibo_id uuid REFERENCES public.dp_recibos(id),
  ADD COLUMN IF NOT EXISTS substituido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_substituicao text;
CREATE INDEX IF NOT EXISTS dp_recibos_substitui_idx ON public.dp_recibos(substitui_recibo_id);
-- Reversão: ALTER TABLE public.dp_recibos DROP COLUMN substitui_recibo_id, DROP COLUMN substituido_em, DROP COLUMN motivo_substituicao;