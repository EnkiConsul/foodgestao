ALTER TABLE public.dp_colaborador_documentos
  ADD COLUMN IF NOT EXISTS conteudo_hash text,
  ADD COLUMN IF NOT EXISTS aceito_em timestamptz;

DROP POLICY IF EXISTS "dp_colab_doc_self_aceite" ON public.dp_colaborador_documentos;
CREATE POLICY "dp_colab_doc_self_aceite"
ON public.dp_colaborador_documentos
FOR UPDATE
TO authenticated
USING (colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid())))
WITH CHECK (
  colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
  AND dispensado = false
  AND status IN ('enviado', 'aprovado')
);