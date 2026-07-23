DROP POLICY IF EXISTS dp_sol_colab_self_write ON public.dp_solicitacoes;
CREATE POLICY dp_sol_colab_self_write ON public.dp_solicitacoes
  FOR INSERT
  WITH CHECK (
    colaborador_id = public.dp_colaborador_of(auth.uid())
    AND company_id = (
      SELECT c.company_id FROM public.dp_colaboradores c
      WHERE c.id = public.dp_colaborador_of(auth.uid())
    )
  );