CREATE OR REPLACE FUNCTION public.dp_meu_sindicato_ctx()
RETURNS TABLE(sindicato_id uuid, unidade_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.sindicato_id, c.unidade_id FROM public.dp_colaboradores c
  WHERE c.id = public.dp_colaborador_ativo_of(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.dp_meu_sindicato_ctx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_sindicato_ctx() TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_negociacao_visivel_colab(_neg_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_sindicato_negociacoes n, public.dp_meu_sindicato_ctx() m
    WHERE n.id = _neg_id AND m.sindicato_id IS NOT NULL
      AND (n.sindicato_id = m.sindicato_id OR n.sindicato_laboral_id = m.sindicato_id)
      AND (n.unidade_id IS NULL OR n.unidade_id = m.unidade_id)
  )
$$;
REVOKE ALL ON FUNCTION public.dp_negociacao_visivel_colab(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_negociacao_visivel_colab(uuid) TO authenticated;

CREATE POLICY dp_sindicato_negociacoes_colab_read ON public.dp_sindicato_negociacoes
FOR SELECT TO authenticated USING (public.dp_negociacao_visivel_colab(id));

CREATE POLICY dp_sindicatos_colab_read ON public.dp_sindicatos
FOR SELECT TO authenticated USING (
  id = (SELECT m.sindicato_id FROM public.dp_meu_sindicato_ctx() m)
);

CREATE POLICY dp_doc_bucket_read_sindicato_negociacao ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'dp-documentos' AND EXISTS (
    SELECT 1 FROM public.dp_sindicato_negociacoes n
    WHERE n.pdf_path = objects.name AND public.dp_negociacao_visivel_colab(n.id)
  )
);