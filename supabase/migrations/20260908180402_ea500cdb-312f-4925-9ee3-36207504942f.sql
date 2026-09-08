CREATE TABLE public.dp_apoio_unidades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pessoa_apoio_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.dp_setores(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_apoio_unidades_origem_check CHECK (
    (pessoa_apoio_id IS NOT NULL AND colaborador_id IS NULL)
    OR (pessoa_apoio_id IS NULL AND colaborador_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX dp_apoio_unidades_apoio_uk
  ON public.dp_apoio_unidades (pessoa_apoio_id, unidade_id)
  WHERE pessoa_apoio_id IS NOT NULL;

CREATE UNIQUE INDEX dp_apoio_unidades_colab_uk
  ON public.dp_apoio_unidades (colaborador_id, unidade_id)
  WHERE colaborador_id IS NOT NULL;

CREATE INDEX dp_apoio_unidades_unidade_idx
  ON public.dp_apoio_unidades (company_id, unidade_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_apoio_unidades TO authenticated;
GRANT ALL ON public.dp_apoio_unidades TO service_role;

ALTER TABLE public.dp_apoio_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da empresa veem disponibilidades"
  ON public.dp_apoio_unidades FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admin/dono gerencia disponibilidades"
  ON public.dp_apoio_unidades FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.dp_apoio_unidades_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u
    WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'APOIO_UNIDADE_OUTRA_EMPRESA';
  END IF;

  IF NEW.pessoa_apoio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_pessoas_apoio p
    WHERE p.id = NEW.pessoa_apoio_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'APOIO_PESSOA_OUTRA_EMPRESA';
  END IF;

  IF NEW.colaborador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.id = NEW.colaborador_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'APOIO_COLABORADOR_OUTRA_EMPRESA';
  END IF;

  IF NEW.cargo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos g
    WHERE g.id = NEW.cargo_id AND g.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'APOIO_CARGO_OUTRA_EMPRESA';
  END IF;

  IF NEW.setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_setores s
    WHERE s.id = NEW.setor_id
      AND s.company_id = NEW.company_id
      AND (s.unidade_id IS NULL OR s.unidade_id = NEW.unidade_id)
  ) THEN
    RAISE EXCEPTION 'APOIO_SETOR_INVALIDO';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_apoio_unidades_guard() FROM public;

CREATE TRIGGER dp_apoio_unidades_guard_trg
  BEFORE INSERT OR UPDATE ON public.dp_apoio_unidades
  FOR EACH ROW EXECUTE FUNCTION public.dp_apoio_unidades_guard();