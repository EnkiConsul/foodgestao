CREATE OR REPLACE FUNCTION public.dp_dependente_salvar(p_colaborador_id uuid, p_dependente jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_patch jsonb; v_id uuid := nullif(p_dependente->>'id','')::uuid;
  v_antigo jsonb; v_cpf text; v_parentesco text;
  v_permitidos text[] := ARRAY['nome','data_nascimento','parentesco','cpf','deficiencia','laudo_validade',
    'conta_irrf','conta_salario_familia','vacinacao_em','frequencia_escolar_em','cessado_em','observacao'];
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM private.dp_regras_admin(v_company);

  v_patch := private.dp_regras_campos(p_dependente, v_permitidos, ARRAY['id','company_id','colaborador_id','created_at','updated_at']);
  IF nullif(btrim(coalesce(v_patch->>'nome','')),'') IS NULL THEN RAISE EXCEPTION 'REGRA_NOME_OBRIGATORIO'; END IF;
  IF length(btrim(v_patch->>'nome')) > 120 THEN RAISE EXCEPTION 'REGRA_NOME_INVALIDO'; END IF;
  v_patch := v_patch || jsonb_build_object('nome', upper(btrim(v_patch->>'nome')));

  v_parentesco := lower(btrim(coalesce(v_patch->>'parentesco','')));
  IF v_parentesco = '' THEN RAISE EXCEPTION 'REGRA_PARENTESCO_OBRIGATORIO'; END IF;
  IF v_parentesco = 'cônjuge' THEN v_parentesco := 'conjuge'; END IF;
  IF NOT (v_parentesco = ANY (ARRAY['filho','enteado','tutelado','conjuge','outro'])) THEN
    RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO';
  END IF;
  v_patch := v_patch || jsonb_build_object('parentesco', v_parentesco);

  v_cpf := regexp_replace(coalesce(v_patch->>'cpf',''), '[^0-9]', '', 'g');
  IF v_cpf <> '' AND length(v_cpf) <> 11 THEN RAISE EXCEPTION 'REGRA_CPF_INVALIDO'; END IF;
  IF v_patch ? 'cpf' THEN
    v_patch := v_patch || jsonb_build_object('cpf', nullif(v_cpf,''));
  END IF;

  IF nullif(v_patch->>'data_nascimento','')::date > current_date THEN
    RAISE EXCEPTION 'REGRA_DATA_FUTURA';
  END IF;

  PERFORM private.dp_regras_fila(format('dependente|%s', p_colaborador_id));

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(d) INTO v_antigo FROM public.dp_dependentes d
     WHERE d.id = v_id AND d.colaborador_id = p_colaborador_id;
    IF v_antigo IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM private.dp_regras_atualizar('public.dp_dependentes'::regclass, v_id, v_patch, true);
  ELSE
    SELECT d.id INTO v_id FROM public.dp_dependentes d
     WHERE d.colaborador_id = p_colaborador_id
       AND upper(btrim(d.nome)) = v_patch->>'nome'
       AND d.data_nascimento IS NOT DISTINCT FROM nullif(v_patch->>'data_nascimento','')::date
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      SELECT to_jsonb(d) INTO v_antigo FROM public.dp_dependentes d WHERE d.id = v_id;
      PERFORM private.dp_regras_atualizar('public.dp_dependentes'::regclass, v_id, v_patch, true);
    ELSE
      v_id := private.dp_regras_inserir(
        'public.dp_dependentes'::regclass,
        v_patch || jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id)
      );
    END IF;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.dp_dependente_salvar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_dependente_salvar(uuid, jsonb) TO authenticated, service_role;
