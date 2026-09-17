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
  -- Cada coluna só pode ser lida dentro do bloco da sua própria tabela:
  -- referenciar NEW.unidade_id na tabela de cargos falha no planejamento.
  IF TG_TABLE_NAME = 'dp_admissao_regra_unidades' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_unidades u WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'unidade_de_outra_empresa';
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_admissao_regra_cargos' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_cargos c WHERE c.id = NEW.cargo_id AND c.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'cargo_de_outra_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_regra_filha_guard() FROM PUBLIC, anon;

-- Rollback: restaurar a versão anterior da função (não destrutivo, sem DDL de dados).