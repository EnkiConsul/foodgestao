CREATE OR REPLACE FUNCTION public.dp_colab_valida_domingos_folga()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.domingos_folga_mes IS NOT NULL AND NEW.domingos_folga_mes NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Domingos de folga por mês devem ficar entre 1 e 4';
  END IF;
  IF NEW.sexo IS NOT NULL AND NEW.sexo NOT IN ('F','M') AND NEW.regime = 'clt' AND NEW.domingos_folga_mes IS NULL THEN
    RAISE EXCEPTION 'Informe a quantidade de folgas dominicais por mês para este colaborador';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_definir_domingos_folga(_colaborador_id uuid, _domingos smallint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_antigo smallint;
BEGIN
  IF _domingos IS NOT NULL AND _domingos NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Frequência inválida: use de 1 a 4 domingos por mês';
  END IF;
  SELECT company_id, domingos_folga_mes INTO v_company, v_antigo
    FROM dp_colaboradores WHERE id = _colaborador_id AND deleted_at IS NULL FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT tem_permissao(v_company, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar regras de folgas' USING ERRCODE = '42501';
  END IF;
  IF v_antigo IS NOT DISTINCT FROM _domingos THEN RETURN; END IF;
  UPDATE dp_colaboradores SET domingos_folga_mes = _domingos, updated_at = now() WHERE id = _colaborador_id;
END $function$;

CREATE TABLE public.dp_folga_domingo_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  domingos_mes smallint NOT NULL CHECK (domingos_mes BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (unidade_id, cargo_id)
);
GRANT SELECT ON public.dp_folga_domingo_cargos TO authenticated;
GRANT ALL ON public.dp_folga_domingo_cargos TO service_role;
ALTER TABLE public.dp_folga_domingo_cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_folga_domingo_cargos_read ON public.dp_folga_domingo_cargos
  FOR SELECT TO authenticated USING (private.is_company_member(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.dp_folga_domingo_cargo_definir(_unidade_id uuid, _cargo_id uuid, _domingos smallint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_cargo_company uuid;
BEGIN
  IF _domingos IS NOT NULL AND _domingos NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Frequência inválida: use de 1 a 4 domingos por mês';
  END IF;
  SELECT company_id INTO v_company FROM dp_unidades WHERE id = _unidade_id;
  SELECT company_id INTO v_cargo_company FROM dp_cargos WHERE id = _cargo_id;
  IF v_company IS NULL OR v_cargo_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Unidade ou cargo não encontrado';
  END IF;
  IF NOT tem_permissao(v_company, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar regras de folgas' USING ERRCODE = '42501';
  END IF;
  IF _domingos IS NULL THEN
    DELETE FROM dp_folga_domingo_cargos WHERE unidade_id = _unidade_id AND cargo_id = _cargo_id;
  ELSE
    INSERT INTO dp_folga_domingo_cargos (company_id, unidade_id, cargo_id, domingos_mes, updated_by)
    VALUES (v_company, _unidade_id, _cargo_id, _domingos, auth.uid())
    ON CONFLICT (unidade_id, cargo_id) DO UPDATE
      SET domingos_mes = EXCLUDED.domingos_mes, updated_at = now(), updated_by = auth.uid();
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.dp_folga_domingo_cargo_definir(uuid, uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_domingo_cargo_definir(uuid, uuid, smallint) TO authenticated;