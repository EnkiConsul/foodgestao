ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS pagamento_salario_tipo text,
  ADD COLUMN IF NOT EXISTS pagamento_salario_dia smallint;

ALTER TABLE public.dp_unidades
  DROP CONSTRAINT IF EXISTS dp_unidades_pagamento_salario_chk;
ALTER TABLE public.dp_unidades
  ADD CONSTRAINT dp_unidades_pagamento_salario_chk CHECK (
    (pagamento_salario_tipo IS NULL AND pagamento_salario_dia IS NULL)
    OR (pagamento_salario_tipo = 'quinto_dia_util' AND pagamento_salario_dia IS NULL)
    OR (pagamento_salario_tipo = 'dia_fixo' AND pagamento_salario_dia BETWEEN 1 AND 31)
  );

COMMENT ON COLUMN public.dp_unidades.pagamento_salario_tipo IS
  'Regra do pagamento mensal do salário: quinto_dia_util (art. 459 §1º CLT; sábado conta, domingos e feriados da unidade não) ou dia_fixo. NULL = não informado, nenhuma previsão é exibida.';
COMMENT ON COLUMN public.dp_unidades.pagamento_salario_dia IS
  'Dia do mês do pagamento quando pagamento_salario_tipo = dia_fixo (meses mais curtos usam o último dia).';

-- Portal: o colaborador recebe só as regras de pagamento que valem para ele
-- (salário só para mensalista CLT/temporário/estágio, adiantamento só se optante
-- na competência, VA só com benefício ativo e dia informado). Datas são
-- calculadas no navegador com os feriados da própria unidade.
CREATE OR REPLACE FUNCTION public.dp_portal_meus_pagamentos(_competencia text)
RETURNS TABLE(
  unidade_id uuid,
  salario_tipo text,
  salario_dia smallint,
  salario_rotulo text,
  adiantamento_dia smallint,
  va_dia smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT c.*
    FROM public.dp_colaboradores c
    WHERE c.id = public.dp_meu_colaborador()
      AND c.ativo = true
      AND c.deleted_at IS NULL
      AND _competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  cfg_unidade AS (
    SELECT d.* FROM public.dp_config_dp d JOIN me ON d.company_id = me.company_id AND d.unidade_id = me.unidade_id
    LIMIT 1
  ),
  cfg_empresa AS (
    SELECT d.* FROM public.dp_config_dp d JOIN me ON d.company_id = me.company_id AND d.unidade_id IS NULL
    LIMIT 1
  )
  SELECT
    me.unidade_id,
    CASE WHEN me.forma_pagamento = 'mensalista'
           AND me.regime::text IN ('clt', 'temporario', 'estagio')
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
         THEN u.pagamento_salario_tipo END,
    CASE WHEN me.forma_pagamento = 'mensalista'
           AND me.regime::text IN ('clt', 'temporario', 'estagio')
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
         THEN u.pagamento_salario_dia END,
    CASE WHEN me.regime::text = 'estagio' THEN 'Bolsa-estágio' ELSE 'Salário' END,
    CASE WHEN coalesce(u.tem_adiantamento, false)
           AND u.dia_adiantamento IS NOT NULL
           AND lower(coalesce(me.vinculo_label, '')) NOT IN ('socio', 'sócio')
           AND coalesce((
             SELECT s.tipo = 'ativar'
             FROM public.dp_adiantamento_solicitacoes s
             WHERE s.colaborador_id = me.id AND s.competencia_efeito <= _competencia
             ORDER BY s.competencia_efeito DESC, s.created_at DESC
             LIMIT 1
           ), me.optante_adiantamento, false)
         THEN u.dia_adiantamento END,
    CASE WHEN coalesce(me.vale_alimentacao, false)
           AND coalesce((SELECT ce.va_ativo FROM cfg_empresa ce), true)
         THEN coalesce(
           me.vale_alimentacao_dia_pagamento,
           CASE WHEN EXISTS (SELECT 1 FROM cfg_unidade)
                THEN (SELECT cu.va_dia_pagamento FROM cfg_unidade cu)
                ELSE (SELECT ce.va_dia_pagamento FROM cfg_empresa ce) END
         )::smallint END
  FROM me
  LEFT JOIN public.dp_unidades u ON u.id = me.unidade_id
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_meus_pagamentos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_meus_pagamentos(text) TO authenticated, service_role;
