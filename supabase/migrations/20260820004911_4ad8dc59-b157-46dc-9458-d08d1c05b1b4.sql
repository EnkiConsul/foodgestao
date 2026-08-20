-- Vale-alimentação: dia de pagamento, antecedência do corte e regras de desconto
ALTER TABLE public.dp_beneficios
  ADD COLUMN IF NOT EXISTS dia_pagamento integer CHECK (dia_pagamento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS dias_antecedencia_corte integer NOT NULL DEFAULT 5 CHECK (dias_antecedencia_corte BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS desconta_falta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desconta_folga_extra boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desconta_atestado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desconta_ferias boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS vale_alimentacao_dia_pagamento integer CHECK (vale_alimentacao_dia_pagamento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS vale_alimentacao_dias_corte integer CHECK (vale_alimentacao_dias_corte BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconta_falta boolean,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconta_folga_extra boolean,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconta_atestado boolean,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconta_ferias boolean;

ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS va_dia_pagamento integer CHECK (va_dia_pagamento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS va_dias_corte integer NOT NULL DEFAULT 5 CHECK (va_dias_corte BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS va_desconta_falta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS va_desconta_folga_extra boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS va_desconta_atestado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS va_desconta_ferias boolean NOT NULL DEFAULT true;

-- Fechamento mensal do VA por colaborador (permite ajuste manual auditável)
CREATE TABLE IF NOT EXISTS public.dp_va_apuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  dias_previstos integer NOT NULL DEFAULT 0,
  dias_descontados integer NOT NULL DEFAULT 0,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_dia numeric NOT NULL DEFAULT 0,
  valor_depositar numeric NOT NULL DEFAULT 0,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, competencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_va_apuracoes TO authenticated;
GRANT ALL ON public.dp_va_apuracoes TO service_role;

ALTER TABLE public.dp_va_apuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_va_apuracoes_admin_write ON public.dp_va_apuracoes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_va_apuracoes_self_read ON public.dp_va_apuracoes
  FOR SELECT TO authenticated
  USING (
    public.dp_colaborador_of((SELECT auth.uid())) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of((SELECT auth.uid()))
  );

CREATE TRIGGER dp_va_apuracoes_updated_at
  BEFORE UPDATE ON public.dp_va_apuracoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();