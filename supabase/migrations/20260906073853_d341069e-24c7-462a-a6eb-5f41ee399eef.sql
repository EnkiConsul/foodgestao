-- M32: banco reaproveitável de folguistas/testes (mão de obra extra)
CREATE TABLE IF NOT EXISTS public.dp_pessoas_apoio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  tipo public.dp_pessoa_avulsa_tipo NOT NULL DEFAULT 'folguista',
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  cpf text,
  genero text,
  data_nascimento date,
  observacao text,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_pessoas_apoio TO authenticated;
GRANT ALL ON public.dp_pessoas_apoio TO service_role;

ALTER TABLE public.dp_pessoas_apoio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_pessoas_apoio_select_membro ON public.dp_pessoas_apoio;
CREATE POLICY dp_pessoas_apoio_select_membro ON public.dp_pessoas_apoio
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_pessoas_apoio_insert_admin ON public.dp_pessoas_apoio;
CREATE POLICY dp_pessoas_apoio_insert_admin ON public.dp_pessoas_apoio
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_pessoas_apoio_update_admin ON public.dp_pessoas_apoio;
CREATE POLICY dp_pessoas_apoio_update_admin ON public.dp_pessoas_apoio
  FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_pessoas_apoio_delete_admin ON public.dp_pessoas_apoio;
CREATE POLICY dp_pessoas_apoio_delete_admin ON public.dp_pessoas_apoio
  FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE UNIQUE INDEX IF NOT EXISTS dp_pessoas_apoio_telefone_uniq
  ON public.dp_pessoas_apoio (company_id, telefone)
  WHERE telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS dp_pessoas_apoio_company_nome_idx
  ON public.dp_pessoas_apoio (company_id, lower(nome));

DROP TRIGGER IF EXISTS trg_dp_pessoas_apoio_updated_at ON public.dp_pessoas_apoio;
CREATE TRIGGER trg_dp_pessoas_apoio_updated_at
  BEFORE UPDATE ON public.dp_pessoas_apoio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dp_pessoas_avulsas
  ADD COLUMN IF NOT EXISTS pessoa_apoio_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telefone text;

CREATE INDEX IF NOT EXISTS dp_pessoas_avulsas_apoio_idx
  ON public.dp_pessoas_avulsas (pessoa_apoio_id);

-- Cria ou atualiza a pessoa de apoio e devolve o registro consolidado.
CREATE OR REPLACE FUNCTION public.dp_pessoa_apoio_upsert(
  p_company_id uuid,
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_tipo text DEFAULT 'folguista',
  p_cargo_id uuid DEFAULT NULL,
  p_unidade_id uuid DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_id uuid DEFAULT NULL)
RETURNS public.dp_pessoas_apoio
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tel text := NULLIF(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g'), '');
  v_nome text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_row public.dp_pessoas_apoio;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR NOT private.is_company_admin_or_owner(v_uid, p_company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão nesta empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o nome da pessoa.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.dp_pessoas_apoio
     WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  ELSIF v_tel IS NOT NULL THEN
    SELECT * INTO v_row FROM public.dp_pessoas_apoio
     WHERE company_id = p_company_id AND telefone = v_tel FOR UPDATE;
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.dp_pessoas_apoio(
      company_id, nome, telefone, tipo, cargo_id, unidade_id,
      cpf, genero, data_nascimento, observacao, criado_por)
    VALUES (p_company_id, v_nome, v_tel, COALESCE(p_tipo, 'folguista')::public.dp_pessoa_avulsa_tipo,
            p_cargo_id, p_unidade_id, NULLIF(btrim(COALESCE(p_cpf, '')), ''),
            NULLIF(btrim(COALESCE(p_genero, '')), ''), p_data_nascimento,
            NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.dp_pessoas_apoio SET
    nome = v_nome,
    telefone = COALESCE(v_tel, telefone),
    tipo = COALESCE(p_tipo, tipo::text)::public.dp_pessoa_avulsa_tipo,
    cargo_id = COALESCE(p_cargo_id, cargo_id),
    unidade_id = COALESCE(p_unidade_id, unidade_id),
    cpf = COALESCE(NULLIF(btrim(COALESCE(p_cpf, '')), ''), cpf),
    genero = COALESCE(NULLIF(btrim(COALESCE(p_genero, '')), ''), genero),
    data_nascimento = COALESCE(p_data_nascimento, data_nascimento),
    observacao = COALESCE(NULLIF(btrim(COALESCE(p_observacao, '')), ''), observacao),
    updated_at = now()
  WHERE id = v_row.id AND company_id = p_company_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;