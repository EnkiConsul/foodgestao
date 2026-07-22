ALTER TABLE public.dp_bloqueio_regras DROP CONSTRAINT dp_bloqueio_regras_check;

ALTER TABLE public.dp_bloqueio_regras
  ADD CONSTRAINT dp_bloqueio_regras_check CHECK (
    (tipo = 'fixa_anual'    AND mes IS NOT NULL AND dia IS NOT NULL)
 OR (tipo = 'dinamica'      AND regra_json IS NOT NULL)
 OR (tipo = 'pos_pagamento' AND regra_json IS NOT NULL)
  );