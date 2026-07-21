CREATE POLICY dp_folgas_read_colaborador
  ON public.dp_folgas
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT c.company_id
      FROM public.dp_colaboradores c
      WHERE c.id = public.dp_colaborador_of(auth.uid())
    )
  );