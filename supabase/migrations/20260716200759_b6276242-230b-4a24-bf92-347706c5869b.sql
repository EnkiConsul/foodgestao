-- 1. Enum de status de aprovação
CREATE TYPE public.dp_documento_aprovacao_status AS ENUM ('pendente', 'aprovado', 'recusado');

-- 2. Novas colunas
ALTER TABLE public.dp_documentos
  ADD COLUMN aprovacao_status public.dp_documento_aprovacao_status NOT NULL DEFAULT 'aprovado',
  ADD COLUMN revisado_por uuid,
  ADD COLUMN revisado_em timestamptz,
  ADD COLUMN motivo_recusao text,
  ADD COLUMN submetido_por_colaborador boolean NOT NULL DEFAULT false;

-- 3. Documentos legados: manter como aprovados (default já cobre; explícito para clareza)
UPDATE public.dp_documentos SET aprovacao_status = 'aprovado' WHERE aprovacao_status IS NULL;

-- 4. Policy: colaborador pode enviar documentos próprios (sempre como pendente)
CREATE POLICY dp_doc_colab_submit ON public.dp_documentos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of(auth.uid())
    AND submetido_por_colaborador = true
    AND aprovacao_status = 'pendente'
  );

-- 5. Policy: colaborador pode cancelar (deletar) seus próprios envios enquanto pendentes
CREATE POLICY dp_doc_colab_cancel_pending ON public.dp_documentos
  FOR DELETE
  TO authenticated
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id = public.dp_colaborador_of(auth.uid())
    AND submetido_por_colaborador = true
    AND aprovacao_status = 'pendente'
  );

-- 6. Índice para acelerar filtro de pendências
CREATE INDEX IF NOT EXISTS dp_documentos_aprovacao_status_idx
  ON public.dp_documentos (company_id, aprovacao_status)
  WHERE aprovacao_status = 'pendente';