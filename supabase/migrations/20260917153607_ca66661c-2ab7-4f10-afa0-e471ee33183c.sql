ALTER TABLE public.dp_preadmissao_documentos
  ADD COLUMN parte smallint NOT NULL DEFAULT 1 CHECK (parte BETWEEN 1 AND 10),
  ADD COLUMN parte_rotulo text CHECK (parte_rotulo IS NULL OR length(btrim(parte_rotulo)) BETWEEN 1 AND 40);

DROP INDEX IF EXISTS public.dp_preadm_doc_vigente_uk;

CREATE UNIQUE INDEX dp_preadm_doc_vigente_uk ON public.dp_preadmissao_documentos (
  preadmissao_id, requisito_codigo,
  COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid),
  parte
) WHERE (substituido_em IS NULL);