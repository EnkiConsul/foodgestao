CREATE TABLE public.dp_documento_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  documento_id UUID,
  origem TEXT NOT NULL DEFAULT 'doc',
  acao TEXT NOT NULL,
  titulo TEXT,
  tipo TEXT,
  competencia TEXT,
  colaborador_id UUID,
  colaborador_nome TEXT,
  unidade_id UUID,
  unidade_nome TEXT,
  arquivo_anterior TEXT,
  arquivo_novo TEXT,
  motivo TEXT,
  autor_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX dp_documento_eventos_company_idx ON public.dp_documento_eventos (company_id, created_at DESC);
CREATE INDEX dp_documento_eventos_documento_idx ON public.dp_documento_eventos (documento_id);

GRANT SELECT, INSERT ON public.dp_documento_eventos TO authenticated;
GRANT ALL ON public.dp_documento_eventos TO service_role;

ALTER TABLE public.dp_documento_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_doc_eventos_admin_read ON public.dp_documento_eventos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_doc_eventos_admin_insert ON public.dp_documento_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    AND autor_id = (SELECT auth.uid())
  );