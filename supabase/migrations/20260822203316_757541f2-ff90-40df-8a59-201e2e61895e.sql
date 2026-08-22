ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'contracheque_13';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'contracheque_ferias';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'aviso_ferias';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'recibo_ferias';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'informe_rendimentos';

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS exige_aceite boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_bulk_import_items
  ADD COLUMN IF NOT EXISTS tipo_detectado public.dp_documento_tipo,
  ADD COLUMN IF NOT EXISTS tipo_confidence numeric;

ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS deteccao_automatica boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS dp_doc_aceites_documento_idx ON public.dp_documento_aceites(documento_id);
CREATE INDEX IF NOT EXISTS dp_documentos_tipo_ref_idx ON public.dp_documentos(company_id, tipo, referencia_data);