CREATE TABLE public.dp_admissao_regras (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('campo','documento')),
  chave text NOT NULL CHECK (length(btrim(chave)) BETWEEN 1 AND 80),
  exigencia text NOT NULL CHECK (exigencia IN ('obrigatorio','opcional','nao_pedir')),
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  regime public.dp_regime_trabalho,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dp_admissao_regras_uk
  ON public.dp_admissao_regras (company_id, tipo, chave, unidade_id, cargo_id, regime)
  NULLS NOT DISTINCT;
CREATE INDEX dp_admissao_regras_company_idx ON public.dp_admissao_regras (company_id, tipo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_admissao_regras TO authenticated;
GRANT ALL ON public.dp_admissao_regras TO service_role;
ALTER TABLE public.dp_admissao_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_admissao_regras_admin_all ON public.dp_admissao_regras
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_admissao_regras_colab_read ON public.dp_admissao_regras
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.company_id = dp_admissao_regras.company_id
      AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
  ));

CREATE TABLE public.dp_admissao_regra_parentescos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parentesco text NOT NULL CHECK (length(btrim(parentesco)) BETWEEN 1 AND 40),
  permite_dependente boolean NOT NULL DEFAULT true,
  permite_sesc boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, parentesco)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_admissao_regra_parentescos TO authenticated;
GRANT ALL ON public.dp_admissao_regra_parentescos TO service_role;
ALTER TABLE public.dp_admissao_regra_parentescos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_admissao_parentescos_admin_all ON public.dp_admissao_regra_parentescos
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_admissao_parentescos_colab_read ON public.dp_admissao_regra_parentescos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.company_id = dp_admissao_regra_parentescos.company_id
      AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
  ));

CREATE OR REPLACE FUNCTION public.dp_admissao_regras_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unidade_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'unidade_de_outra_empresa';
  END IF;
  IF NEW.cargo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos c WHERE c.id = NEW.cargo_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'cargo_de_outra_empresa';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_admissao_regras_guard_trg
BEFORE INSERT OR UPDATE ON public.dp_admissao_regras
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_regras_guard();

CREATE TRIGGER dp_admissao_parentescos_touch
BEFORE UPDATE ON public.dp_admissao_regra_parentescos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dp_admissao_regras_resolver(
  p_company_id uuid,
  p_unidade_id uuid DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_regime public.dp_regime_trabalho DEFAULT NULL
)
RETURNS TABLE (tipo text, chave text, exigencia text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (r.tipo, r.chave) r.tipo, r.chave, r.exigencia
  FROM public.dp_admissao_regras r
  WHERE r.company_id = p_company_id
    AND (r.unidade_id IS NULL OR r.unidade_id = p_unidade_id)
    AND (r.cargo_id IS NULL OR r.cargo_id = p_cargo_id)
    AND (r.regime IS NULL OR r.regime = p_regime)
  ORDER BY r.tipo, r.chave,
    (CASE WHEN r.cargo_id IS NOT NULL THEN 8 ELSE 0 END
     + CASE WHEN r.regime IS NOT NULL THEN 4 ELSE 0 END
     + CASE WHEN r.unidade_id IS NOT NULL THEN 2 ELSE 0 END) DESC,
    r.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.dp_admissao_regras_guard() FROM PUBLIC;