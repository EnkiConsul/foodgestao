ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'ata_reuniao';

CREATE TABLE public.dp_atas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  titulo text NOT NULL CHECK (length(trim(titulo)) >= 3),
  data_reuniao date NOT NULL,
  local text,
  conteudo_html text NOT NULL DEFAULT '',
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviada')),
  enviada_em timestamptz,
  enviada_por uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_atas TO authenticated;
GRANT ALL ON public.dp_atas TO service_role;
ALTER TABLE public.dp_atas ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_atas_select ON public.dp_atas FOR SELECT TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'consulta'));
CREATE POLICY dp_atas_insert ON public.dp_atas FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'inclusao') AND status = 'rascunho');
CREATE POLICY dp_atas_update ON public.dp_atas FOR UPDATE TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'alteracao') AND status = 'rascunho')
  WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'alteracao'));
CREATE POLICY dp_atas_delete ON public.dp_atas FOR DELETE TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'exclusao') AND status = 'rascunho');

CREATE TABLE public.dp_ata_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id uuid NOT NULL REFERENCES public.dp_atas(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  modalidade text NOT NULL CHECK (modalidade IN ('presente','ciencia','consulta')),
  documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ata_id, colaborador_id)
);
CREATE INDEX dp_ata_participantes_ata_idx ON public.dp_ata_participantes(ata_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ata_participantes TO authenticated;
GRANT ALL ON public.dp_ata_participantes TO service_role;
ALTER TABLE public.dp_ata_participantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_ata_part_select ON public.dp_ata_participantes FOR SELECT TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'consulta'));
CREATE POLICY dp_ata_part_insert ON public.dp_ata_participantes FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'inclusao')
    AND EXISTS (SELECT 1 FROM public.dp_atas a WHERE a.id = ata_id AND a.company_id = dp_ata_participantes.company_id));
CREATE POLICY dp_ata_part_update ON public.dp_ata_participantes FOR UPDATE TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'alteracao'))
  WITH CHECK (public.tem_permissao(company_id, 'dp.documentos', 'alteracao'));
CREATE POLICY dp_ata_part_delete ON public.dp_ata_participantes FOR DELETE TO authenticated
  USING (public.tem_permissao(company_id, 'dp.documentos', 'alteracao')
    AND EXISTS (SELECT 1 FROM public.dp_atas a WHERE a.id = ata_id AND a.status = 'rascunho'));

CREATE OR REPLACE FUNCTION public.dp_atas_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER dp_atas_touch BEFORE UPDATE ON public.dp_atas FOR EACH ROW EXECUTE FUNCTION public.dp_atas_touch();
CREATE TRIGGER dp_ata_part_touch BEFORE UPDATE ON public.dp_ata_participantes FOR EACH ROW EXECUTE FUNCTION public.dp_atas_touch();