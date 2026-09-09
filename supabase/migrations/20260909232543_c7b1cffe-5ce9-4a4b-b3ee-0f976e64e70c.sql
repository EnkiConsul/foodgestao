CREATE OR REPLACE FUNCTION public.dp_adiantamento_solicitacao_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dia_pagamento INT;
  v_base DATE;
  v_pagamento DATE;
BEGIN
  IF NEW.origem = 'portal' THEN
    IF NEW.data_solicitacao < CURRENT_DATE THEN
      RAISE EXCEPTION 'No portal, a data da solicitacao nao pode ser retroativa.';
    END IF;
    SELECT u.dia_adiantamento INTO v_dia_pagamento
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
    WHERE c.id = NEW.colaborador_id;
    -- Carencia de 30 dias: o pedido do colaborador vale a partir da
    -- competencia compativel com data + 30 dias.
    v_base := NEW.data_solicitacao + 30;
    v_pagamento := LEAST(
      date_trunc('month', v_base)::date + (COALESCE(v_dia_pagamento, 15) - 1),
      (date_trunc('month', v_base) + INTERVAL '1 month - 1 day')::date
    );
    IF v_base >= v_pagamento THEN
      NEW.competencia_efeito := to_char(v_base + INTERVAL '1 month', 'YYYY-MM');
    ELSE
      NEW.competencia_efeito := to_char(v_base, 'YYYY-MM');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;