
CREATE POLICY dp_bloqueio_regras_read_colaborador
ON public.dp_bloqueio_regras
FOR SELECT
TO authenticated
USING (
  company_id = (
    SELECT c.company_id FROM public.dp_colaboradores c
    WHERE c.id = public.dp_colaborador_of(auth.uid())
  )
);

CREATE POLICY dp_bloqueio_regra_unidades_read_colaborador
ON public.dp_bloqueio_regra_unidades
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dp_bloqueio_regras r
    JOIN public.dp_colaboradores c ON c.company_id = r.company_id
    WHERE r.id = dp_bloqueio_regra_unidades.regra_id
      AND c.id = public.dp_colaborador_of(auth.uid())
  )
);
