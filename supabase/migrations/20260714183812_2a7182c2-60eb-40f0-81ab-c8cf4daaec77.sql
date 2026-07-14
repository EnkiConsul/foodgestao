
DO $$ BEGIN
  CREATE TYPE public.dp_disciplinar_tipo AS ENUM ('advertencia_verbal','advertencia_escrita','suspensao','elogio','observacao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_bloqueio_tipo AS ENUM ('folga','troca','solicitacoes','todos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.dp_registros_disciplinares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo public.dp_disciplinar_tipo NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  motivo text NOT NULL,
  descricao text,
  suspensao_dias integer,
  aplicado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_registros_disciplinares TO authenticated;
GRANT ALL ON public.dp_registros_disciplinares TO service_role;
ALTER TABLE public.dp_registros_disciplinares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_disc_read" ON public.dp_registros_disciplinares FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_disc_write" ON public.dp_registros_disciplinares FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER dp_disc_upd BEFORE UPDATE ON public.dp_registros_disciplinares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_disc_company ON public.dp_registros_disciplinares(company_id, data DESC);
CREATE INDEX idx_dp_disc_colab ON public.dp_registros_disciplinares(colaborador_id);

CREATE TABLE public.dp_bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo public.dp_bloqueio_tipo NOT NULL DEFAULT 'todos',
  motivo text NOT NULL,
  inicio date NOT NULL DEFAULT CURRENT_DATE,
  fim date,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bloqueios TO authenticated;
GRANT ALL ON public.dp_bloqueios TO service_role;
ALTER TABLE public.dp_bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_bloq_read" ON public.dp_bloqueios FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_bloq_write" ON public.dp_bloqueios FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER dp_bloq_upd BEFORE UPDATE ON public.dp_bloqueios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_bloq_company ON public.dp_bloqueios(company_id, ativo);
CREATE INDEX idx_dp_bloq_colab ON public.dp_bloqueios(colaborador_id);
