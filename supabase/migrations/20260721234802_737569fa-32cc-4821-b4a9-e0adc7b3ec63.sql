DROP POLICY IF EXISTS dp_folgas_self_insert ON public.dp_folgas;

CREATE POLICY dp_folgas_self_insert
ON public.dp_folgas
FOR INSERT
TO authenticated
WITH CHECK (
  colaborador_id = public.dp_colaborador_of(auth.uid())
  AND company_id = (
    SELECT c.company_id FROM public.dp_colaboradores c
     WHERE c.id = public.dp_colaborador_of(auth.uid())
  )
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'::dp_folga_origem
  AND extra = false
  AND tipo = 'normal'::dp_folga_tipo
  AND status = 'agendada'::dp_folga_status
);