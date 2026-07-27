CREATE POLICY dp_escalas_read_self_publicada ON public.dp_escalas
FOR SELECT TO authenticated
USING (
  status = 'publicada'
  AND EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.id = public.dp_colaborador_ativo_of(auth.uid())
      AND c.company_id = dp_escalas.company_id
  )
);