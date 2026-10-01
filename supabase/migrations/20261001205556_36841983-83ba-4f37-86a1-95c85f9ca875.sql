CREATE OR REPLACE FUNCTION public.dp_cargo_aplicar_salario_zerados(
  _cargo_id uuid, _salario numeric, _unidade_id uuid DEFAULT NULL, _sindicato_patronal_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_qtd integer;
BEGIN
  IF _salario IS NULL OR _salario <= 0 THEN RAISE EXCEPTION 'Salário inválido'; END IF;
  IF (_unidade_id IS NULL) = (_sindicato_patronal_id IS NULL) THEN
    RAISE EXCEPTION 'Informe a unidade ou o sindicato patronal';
  END IF;
  SELECT company_id INTO v_company FROM dp_cargos WHERE id = _cargo_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Cargo não encontrado'; END IF;
  IF NOT tem_permissao(v_company, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para alterar colaboradores';
  END IF;
  UPDATE dp_colaboradores c SET salario_base = _salario, updated_at = now()
   WHERE c.company_id = v_company AND c.cargo_id = _cargo_id
     AND c.ativo AND c.deleted_at IS NULL AND c.data_desligamento IS NULL
     AND coalesce(c.salario_base, 0) = 0
     AND coalesce(c.forma_pagamento::text, 'mensalista') = 'mensalista'
     AND (
       (_unidade_id IS NOT NULL AND c.unidade_id = _unidade_id) OR
       (_sindicato_patronal_id IS NOT NULL AND c.unidade_id IN (
          SELECT su.unidade_id FROM dp_sindicato_unidades su WHERE su.sindicato_id = _sindicato_patronal_id))
     );
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END $$;
REVOKE ALL ON FUNCTION public.dp_cargo_aplicar_salario_zerados(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_cargo_aplicar_salario_zerados(uuid, numeric, uuid, uuid) TO authenticated, service_role;
-- Reversão: DROP FUNCTION public.dp_cargo_aplicar_salario_zerados(uuid, numeric, uuid, uuid);