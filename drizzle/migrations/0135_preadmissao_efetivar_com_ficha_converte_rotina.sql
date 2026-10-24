CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar_com_ficha(p_preadmissao_id uuid, p_item_id uuid, p_dados jsonb, p_campos text[] DEFAULT NULL::text[], p_cargo_id uuid DEFAULT NULL::uuid, p_unidade_id uuid DEFAULT NULL::uuid, p_setor_id uuid DEFAULT NULL::uuid, p_turno_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT NULL::text, p_forma_pagamento text DEFAULT NULL::text, p_jornada jsonb DEFAULT NULL::jsonb, p_justificativa text DEFAULT NULL::text, p_salario numeric DEFAULT NULL::numeric, p_data_admissao date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_pessoais constant text[] := array[
    'nome','cpf','data_nascimento','sexo','telefone','whatsapp','email_contato',
    'estado_civil','endereco','rg_numero','rg_orgao','rg_uf','rg_emissao',
    'ctps_numero','ctps_serie','ctps_uf','ctps_expedicao','titulo_eleitor',
    'titulo_zona','titulo_secao','reservista','reservista_categoria',
    'nome_pai','nome_mae','nacionalidade','naturalidade','raca_cor',
    'grau_instrucao','deficiencia'
  ];
  pa record;
  it record;
  v_cpf text;
  v_cpf_item text;
  v_existente record;
  v_colab uuid;
  v_res jsonb;
  v_modo text := 'importacao';
  v_admissao date;
  v_salario numeric;
  v_regime text;
  v_forma text;
  v_cargo uuid;
  v_unidade uuid;
  v_campos text[];
  v_rotina_colab uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));

  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', pa.colaborador_id, 'ja_aplicado', true, 'modo', 'idempotente');
  END IF;

  IF pa.status <> 'registro_recebido' OR pa.ficha_oficial_conferida_em IS NULL THEN
    RAISE EXCEPTION 'Conclua a conferência da ficha oficial da contabilidade antes de efetivar.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_cpf := regexp_replace(COALESCE(pa.cpf, pa.dados->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'A pré-admissão não tem CPF válido conferido.' USING ERRCODE = 'check_violation';
  END IF;
  IF regexp_replace(COALESCE(p_dados->>'cpf',''), '\D','','g') <> v_cpf THEN
    RAISE EXCEPTION 'O CPF da ficha conferida é diferente do CPF da pré-admissão.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Informe a ficha conferida a aplicar.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO it FROM public.dp_ficha_importacao_itens WHERE id = p_item_id FOR UPDATE;
  IF it.id IS NULL THEN
    RAISE EXCEPTION 'Ficha importada não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF it.company_id <> pa.company_id THEN
    RAISE EXCEPTION 'A ficha importada informada não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  v_cpf_item := regexp_replace(COALESCE(it.dados_extraidos->>'cpf',''), '\D','','g');
  IF length(v_cpf_item) = 11 AND v_cpf_item <> v_cpf THEN
    RAISE EXCEPTION 'A ficha importada informada é de outro CPF.' USING ERRCODE = 'check_violation';
  END IF;

  v_cargo := COALESCE(p_cargo_id, pa.cargo_previsto_id);
  v_unidade := COALESCE(p_unidade_id, pa.unidade_prevista_id);
  v_regime := COALESCE(p_regime, pa.admin_dados->>'regime_trabalho');
  v_forma := COALESCE(p_forma_pagamento, pa.admin_dados->>'forma_pagamento');
  v_salario := COALESCE(p_salario, NULLIF(pa.admin_dados->>'salario','')::numeric);
  v_admissao := COALESCE(p_data_admissao, NULLIF(pa.admin_dados->>'data_admissao','')::date);

  IF v_cargo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_cargos WHERE id = v_cargo AND company_id = pa.company_id
  ) THEN
    RAISE EXCEPTION 'O cargo escolhido não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_unidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades WHERE id = v_unidade AND company_id = pa.company_id
  ) THEN
    RAISE EXCEPTION 'A unidade escolhida não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_setores WHERE id = p_setor_id AND company_id = pa.company_id
  ) THEN
    RAISE EXCEPTION 'O setor escolhido não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_turno_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_turnos WHERE id = p_turno_id AND company_id = pa.company_id
  ) THEN
    RAISE EXCEPTION 'O turno escolhido não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existente FROM public.dp_colaboradores
   WHERE company_id = pa.company_id
     AND regexp_replace(COALESCE(cpf,''), '\D','','g') = v_cpf
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF it.colaborador_id IS NOT NULL
     AND (v_existente.id IS NULL OR it.colaborador_id <> v_existente.id) THEN
    RAISE EXCEPTION 'A ficha importada informada já foi aplicada a outro colaborador.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF it.colaborador_existente_id IS NOT NULL
     AND v_existente.id IS NOT NULL
     AND it.colaborador_existente_id <> v_existente.id THEN
    RAISE EXCEPTION 'A ficha importada informada aponta para outro cadastro.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cadastro provisório da rotina da loja: converte o MESMO cadastro no
  -- vínculo oficial (sem duplicar e preservando o histórico da rotina).
  v_rotina_colab := NULLIF(pa.admin_dados->'rotina'->>'colaborador_id','')::uuid;
  IF v_rotina_colab IS NOT NULL AND v_existente.id = v_rotina_colab
     AND v_existente.deleted_at IS NULL
     AND v_existente.origem_cadastro = 'preadmissao_rotina' THEN
    v_modo := 'conversao_rotina';
    UPDATE public.dp_colaboradores SET
      cargo_id = COALESCE(v_cargo, cargo_id),
      unidade_id = COALESCE(v_unidade, unidade_id),
      setor_id = COALESCE(p_setor_id, setor_id),
      regime = COALESCE(NULLIF(v_regime,''), 'clt')::dp_regime_trabalho,
      forma_pagamento = COALESCE(NULLIF(v_forma,''), 'mensalista')::dp_forma_pagamento,
      salario_base = COALESCE(v_salario, salario_base),
      data_admissao = COALESCE(v_admissao, data_admissao),
      domingos_folga_mes = CASE WHEN COALESCE(v_regime,'clt') = 'clt'
        THEN GREATEST(1, LEAST(4, COALESCE(NULLIF(pa.admin_dados->>'domingos_folga_mes','')::int, domingos_folga_mes, 1)))
        ELSE domingos_folga_mes END,
      origem_cadastro = 'preadmissao'
     WHERE id = v_rotina_colab AND company_id = pa.company_id;

    UPDATE public.dp_ficha_importacao_itens
       SET colaborador_existente_id = v_rotina_colab, updated_at = now()
     WHERE id = it.id AND company_id = pa.company_id;

    SELECT array_agg(c) INTO v_campos
      FROM unnest(COALESCE(p_campos, c_pessoais)) c
     WHERE c = ANY(c_pessoais);
    IF v_campos IS NULL OR array_length(v_campos, 1) IS NULL THEN
      v_campos := ARRAY['nome','cpf'];
    END IF;

    v_res := public.dp_ficha_aplicar(
      p_item_id, p_dados, NULL, v_campos, true,
      NULL, NULL, NULL, p_turno_id, NULL, NULL, NULL, NULL, p_jornada
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL OR v_colab <> v_rotina_colab THEN
      RAISE EXCEPTION 'Não foi possível aplicar a ficha conferida ao cadastro da rotina.'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN public.dp_preadmissao_efetivar(pa.id, v_colab, p_item_id, v_admissao)
           || jsonb_build_object('modo', v_modo);
  END IF;

  IF v_existente.id IS NOT NULL AND COALESCE(v_existente.ativo, false)
     AND v_existente.deleted_at IS NULL AND v_existente.data_desligamento IS NULL THEN
    RAISE EXCEPTION 'Já existe colaborador ativo com este CPF nesta empresa.' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_existente.id IS NOT NULL AND v_existente.deleted_at IS NULL THEN
    v_modo := 'recontratacao';

    IF v_existente.data_desligamento IS NOT NULL
       AND COALESCE(v_admissao, CURRENT_DATE) <= v_existente.data_desligamento THEN
      RAISE EXCEPTION 'A nova data de admissão precisa ser posterior ao desligamento (%).',
        to_char(v_existente.data_desligamento, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;

    PERFORM public.dp_recontratar_colaborador(
      v_existente.id,
      COALESCE(v_admissao, CURRENT_DATE),
      v_regime,
      v_forma,
      v_cargo,
      v_unidade,
      p_setor_id,
      v_salario,
      NULL,
      NULL,
      COALESCE(p_justificativa, 'Recontratação a partir da Pré-Admissão pelo Candidato conferida.')
    );

    UPDATE public.dp_ficha_importacao_itens
       SET colaborador_existente_id = v_existente.id,
           updated_at = now()
     WHERE id = it.id AND company_id = pa.company_id;

    SELECT array_agg(c) INTO v_campos
      FROM unnest(COALESCE(p_campos, c_pessoais)) c
     WHERE c = ANY(c_pessoais);
    IF v_campos IS NULL OR array_length(v_campos, 1) IS NULL THEN
      v_campos := ARRAY['nome','cpf'];
    END IF;

    v_res := public.dp_ficha_aplicar(
      p_item_id, p_dados, NULL, v_campos, true,
      NULL, NULL, NULL, p_turno_id, NULL, NULL, NULL, NULL, p_jornada
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL OR v_colab <> v_existente.id THEN
      RAISE EXCEPTION 'Não foi possível aplicar a ficha conferida ao cadastro existente.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_res := public.dp_ficha_aplicar(
      p_item_id, p_dados, NULL, p_campos, false,
      v_cargo, v_unidade, p_setor_id, p_turno_id, v_regime, v_forma,
      NULL, NULL, p_jornada
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL THEN
      RAISE EXCEPTION 'Não foi possível criar o cadastro a partir da ficha conferida.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN public.dp_preadmissao_efetivar(pa.id, v_colab, p_item_id, v_admissao)
         || jsonb_build_object('modo', v_modo);
END;
$function$;