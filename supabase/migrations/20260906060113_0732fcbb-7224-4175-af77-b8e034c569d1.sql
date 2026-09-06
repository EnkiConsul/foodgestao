CREATE TYPE public.dp_pessoa_avulsa_tipo AS ENUM ('teste', 'folguista');

CREATE TABLE public.dp_pessoas_avulsas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE RESTRICT,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  tipo public.dp_pessoa_avulsa_tipo NOT NULL,
  cobre_colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  entrada time,
  saida time,
  termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_pessoas_avulsas TO authenticated;
GRANT ALL ON public.dp_pessoas_avulsas TO service_role;

ALTER TABLE public.dp_pessoas_avulsas ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_pessoas_avulsas_select_membro ON public.dp_pessoas_avulsas
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY dp_pessoas_avulsas_insert_admin ON public.dp_pessoas_avulsas
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_pessoas_avulsas_update_admin ON public.dp_pessoas_avulsas
  FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_pessoas_avulsas_delete_admin ON public.dp_pessoas_avulsas
  FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE INDEX idx_dp_pessoas_avulsas_periodo
  ON public.dp_pessoas_avulsas (company_id, data_inicio, data_fim);
CREATE INDEX idx_dp_pessoas_avulsas_unidade ON public.dp_pessoas_avulsas (unidade_id);
CREATE INDEX idx_dp_pessoas_avulsas_cargo ON public.dp_pessoas_avulsas (cargo_id);
CREATE INDEX idx_dp_pessoas_avulsas_cobre ON public.dp_pessoas_avulsas (cobre_colaborador_id);

CREATE OR REPLACE FUNCTION public.dp_pessoas_avulsas_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_pessoas_avulsas_guard
  BEFORE INSERT OR UPDATE ON public.dp_pessoas_avulsas
  FOR EACH ROW EXECUTE FUNCTION public.dp_pessoas_avulsas_guard();