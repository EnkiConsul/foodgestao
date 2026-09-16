-- Visitante não autenticado não tem nenhum acesso direto às tabelas da
-- Pré-Admissão: o candidato só chega pela função de servidor com o convite.
REVOKE ALL ON public.dp_preadmissoes FROM anon;
REVOKE ALL ON public.dp_preadmissao_convites FROM anon;
REVOKE ALL ON public.dp_preadmissao_pessoas FROM anon;
REVOKE ALL ON public.dp_preadmissao_documentos FROM anon;
REVOKE ALL ON public.dp_preadmissao_eventos FROM anon;
REVOKE ALL ON public.dp_requisito_cargos FROM anon;
REVOKE ALL ON public.dp_requisito_unidades FROM anon;

-- ROLLBACK (não recomendado):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_preadmissoes,
--   public.dp_preadmissao_convites, public.dp_preadmissao_pessoas,
--   public.dp_preadmissao_documentos, public.dp_preadmissao_eventos,
--   public.dp_requisito_cargos, public.dp_requisito_unidades TO anon;