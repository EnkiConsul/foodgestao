-- Rollback documentado (não destrutivo):
--   DROP FUNCTION public.dp_admissao_regra_salvar(jsonb);
--   DROP FUNCTION public.dp_admissao_regra_excluir(uuid);
--   DROP TABLE public.dp_admissao_regra_unidades, public.dp_admissao_regra_cargos, public.dp_admissao_regra_regimes;
--   DROP INDEX public.dp_admissao_regras_padrao_uk;
--   ALTER TABLE public.dp_admissao_regras DROP COLUMN padrao;
--   ALTER TABLE public.dp_preadmissoes DROP COLUMN regime_previsto;
--   (as colunas unidade_id/cargo_id/regime foram preservadas e continuam com os valores originais)

ALTER TABLE public.dp_admissao_regras
  ADD COLUMN IF NOT EXISTS padrao boolean NOT NULL DEFAULT false;

CREATE TABLE public.dp_admissao_regra_unidades (
  regra_id uuid NOT NULL REFERENCES public.dp_admissao_regras(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, unidade_id)
);

CREATE TABLE public.dp_admissao_regra_cargos (
  regra_id uuid NOT NULL REFERENCES public.dp_admissao_regras(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, cargo_id)
);

CREATE TABLE public.dp_admissao_regra_regimes (
  regra_id uuid NOT NULL REFERENCES public.dp_admissao_regras(id) ON DELETE CASCADE,
  regime public.dp_regime_trabalho NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, regime)
);

CREATE INDEX dp_admissao_regra_unidades_unidade_idx ON public.dp_admissao_regra_unidades (unidade_id);
CREATE INDEX dp_admissao_regra_cargos_cargo_idx ON public.dp_admissao_regra_cargos (cargo_id);
CREATE INDEX dp_admissao_regra_regimes_regime_idx ON public.dp_admissao_regra_regimes (regime);

GRANT SELECT ON public.dp_admissao_regra_unidades TO authenticated;
GRANT SELECT ON public.dp_admissao_regra_cargos TO authenticated;
GRANT SELECT ON public.dp_admissao_regra_regimes TO authenticated;
GRANT ALL ON public.dp_admissao_regra_unidades TO service_role;
GRANT ALL ON public.dp_admissao_regra_cargos TO service_role;
GRANT ALL ON public.dp_admissao_regra_regimes TO service_role;

ALTER TABLE public.dp_admissao_regra_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_admissao_regra_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_admissao_regra_regimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_admissao_regra_unidades_read ON public.dp_admissao_regra_unidades
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR public.is_super_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores c
      WHERE c.company_id = dp_admissao_regra_unidades.company_id
        AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
    )
  );

CREATE POLICY dp_admissao_regra_cargos_read ON public.dp_admissao_regra_cargos
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR public.is_super_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores c
      WHERE c.company_id = dp_admissao_regra_cargos.company_id
        AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
    )
  );

CREATE POLICY dp_admissao_regra_regimes_read ON public.dp_admissao_regra_regimes
  FOR SELECT TO authenticated
  USING (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR public.is_super_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores c
      WHERE c.company_id = dp_admissao_regra_regimes.company_id
        AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
    )
  );

-- Integridade composta: filha sempre da mesma empresa da regra
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_filha_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_admissao_regras WHERE id = NEW.regra_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'regra_de_outra_empresa';
  END IF;
  IF TG_TABLE_NAME = 'dp_admissao_regra_unidades' AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'unidade_de_outra_empresa';
  END IF;
  IF TG_TABLE_NAME = 'dp_admissao_regra_cargos' AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos c WHERE c.id = NEW.cargo_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'cargo_de_outra_empresa';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regra_filha_guard() FROM PUBLIC;

CREATE TRIGGER dp_admissao_regra_unidades_guard
BEFORE INSERT OR UPDATE ON public.dp_admissao_regra_unidades
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_regra_filha_guard();

CREATE TRIGGER dp_admissao_regra_cargos_guard
BEFORE INSERT OR UPDATE ON public.dp_admissao_regra_cargos
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_regra_filha_guard();

CREATE TRIGGER dp_admissao_regra_regimes_guard
BEFORE INSERT OR UPDATE ON public.dp_admissao_regra_regimes
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_regra_filha_guard();

-- Converte as regras já existentes para o novo formato
INSERT INTO public.dp_admissao_regra_unidades (regra_id, unidade_id, company_id)
SELECT r.id, r.unidade_id, r.company_id
FROM public.dp_admissao_regras r
WHERE r.unidade_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.dp_admissao_regra_cargos (regra_id, cargo_id, company_id)
SELECT r.id, r.cargo_id, r.company_id
FROM public.dp_admissao_regras r
WHERE r.cargo_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.dp_admissao_regra_regimes (regra_id, regime, company_id)
SELECT r.id, r.regime, r.company_id
FROM public.dp_admissao_regras r
WHERE r.regime IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.dp_admissao_regras
SET padrao = true
WHERE unidade_id IS NULL AND cargo_id IS NULL AND regime IS NULL;

DROP INDEX IF EXISTS public.dp_admissao_regras_uk;
CREATE UNIQUE INDEX dp_admissao_regras_padrao_uk
  ON public.dp_admissao_regras (company_id, tipo, chave)
  WHERE padrao;

-- Gravação apenas pela rotina do servidor
REVOKE INSERT, UPDATE, DELETE ON public.dp_admissao_regras FROM authenticated;

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
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_unidades x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_unidades x
        WHERE x.regra_id = r.id AND x.unidade_id = p_unidade_id
      )
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_cargos x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_cargos x
        WHERE x.regra_id = r.id AND x.cargo_id = p_cargo_id
      )
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_regimes x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_regimes x
        WHERE x.regra_id = r.id AND x.regime = p_regime
      )
    )
  ORDER BY r.tipo, r.chave,
    (CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_cargos x WHERE x.regra_id = r.id) THEN 8 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_regimes x WHERE x.regra_id = r.id) THEN 4 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_unidades x WHERE x.regra_id = r.id) THEN 2 ELSE 0 END) DESC,
    r.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho) TO authenticated, service_role;

-- Grava a regra (cabeçalho + seleções) em uma única transação
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_salvar(p_regra jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := (p_regra->>'company_id')::uuid;
  v_id uuid := NULLIF(p_regra->>'id','')::uuid;
  v_tipo text := p_regra->>'tipo';
  v_chave text := btrim(coalesce(p_regra->>'chave',''));
  v_exig text := p_regra->>'exigencia';
  v_padrao boolean := coalesce((p_regra->>'padrao')::boolean, false);
  v_uid uuid := auth.uid();
  v_item uuid;
  v_reg text;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'empresa_obrigatoria'; END IF;
  IF NOT (private.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF v_tipo NOT IN ('campo','documento') THEN RAISE EXCEPTION 'tipo_invalido'; END IF;
  IF v_exig NOT IN ('obrigatorio','opcional','nao_pedir') THEN RAISE EXCEPTION 'exigencia_invalida'; END IF;
  IF length(v_chave) < 1 OR length(v_chave) > 80 THEN RAISE EXCEPTION 'chave_invalida'; END IF;

  IF v_id IS NULL AND v_padrao THEN
    SELECT id INTO v_id FROM public.dp_admissao_regras
    WHERE company_id = v_company AND tipo = v_tipo AND chave = v_chave AND padrao
    FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_admissao_regras (company_id, tipo, chave, exigencia, padrao)
    VALUES (v_company, v_tipo, v_chave, v_exig, v_padrao)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_admissao_regras
    SET exigencia = v_exig, chave = v_chave, tipo = v_tipo, padrao = v_padrao, updated_at = now()
    WHERE id = v_id AND company_id = v_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'regra_nao_encontrada'; END IF;
    DELETE FROM public.dp_admissao_regra_unidades WHERE regra_id = v_id;
    DELETE FROM public.dp_admissao_regra_cargos WHERE regra_id = v_id;
    DELETE FROM public.dp_admissao_regra_regimes WHERE regra_id = v_id;
  END IF;

  IF NOT v_padrao THEN
    FOR v_item IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_regra->'unidades','[]'::jsonb))
    LOOP
      INSERT INTO public.dp_admissao_regra_unidades (regra_id, unidade_id, company_id)
      VALUES (v_id, v_item, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_item IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_regra->'cargos','[]'::jsonb))
    LOOP
      INSERT INTO public.dp_admissao_regra_cargos (regra_id, cargo_id, company_id)
      VALUES (v_id, v_item, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_reg IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_regra->'regimes','[]'::jsonb))
    LOOP
      IF v_reg NOT IN ('clt','pj','estagio','temporario','mei','intermitente','freelancer') THEN
        RAISE EXCEPTION 'vinculo_invalido';
      END IF;
      INSERT INTO public.dp_admissao_regra_regimes (regra_id, regime, company_id)
      VALUES (v_id, v_reg::public.dp_regime_trabalho, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regra_salvar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_salvar(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_admissao_regra_excluir(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_uid uuid := auth.uid();
BEGIN
  SELECT company_id INTO v_company FROM public.dp_admissao_regras WHERE id = p_id FOR UPDATE;
  IF v_company IS NULL THEN RETURN false; END IF;
  IF NOT (private.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  DELETE FROM public.dp_admissao_regras WHERE id = p_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regra_excluir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_excluir(uuid) TO authenticated, service_role;

ALTER TABLE public.dp_preadmissoes
  ADD COLUMN IF NOT EXISTS regime_previsto public.dp_regime_trabalho;