CREATE OR REPLACE FUNCTION public.dp_colaborador_definir_domingos_folga(_colaborador_id uuid, _domingos smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_antigo smallint;
BEGIN
  IF _domingos IS NOT NULL AND _domingos NOT IN (1,2) THEN
    RAISE EXCEPTION 'Frequência inválida: use 1 ou 2 domingos por mês';
  END IF;
  SELECT company_id, domingos_folga_mes INTO v_company, v_antigo
    FROM dp_colaboradores WHERE id = _colaborador_id AND deleted_at IS NULL FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT tem_permissao(v_company, 'dp.cadastros', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar regras de folgas' USING ERRCODE = '42501';
  END IF;
  IF v_antigo IS NOT DISTINCT FROM _domingos THEN RETURN; END IF;
  UPDATE dp_colaboradores SET domingos_folga_mes = _domingos, updated_at = now() WHERE id = _colaborador_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_colaborador_definir_domingos_folga(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_definir_domingos_folga(uuid, smallint) TO authenticated, service_role;
-- down: DROP FUNCTION public.dp_colaborador_definir_domingos_folga(uuid, smallint);