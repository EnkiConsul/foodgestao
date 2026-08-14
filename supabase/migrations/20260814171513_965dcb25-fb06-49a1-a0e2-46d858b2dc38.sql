ALTER TYPE public.dp_regime_trabalho ADD VALUE IF NOT EXISTS 'freelancer';

ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS vinculo_label text;

COMMENT ON COLUMN public.dp_colaboradores.vinculo_label IS 'Rótulo de exibição do tipo de vínculo escolhido no cadastro (ex: Sócio, PJ). O comportamento legal continua vindo de regime.';