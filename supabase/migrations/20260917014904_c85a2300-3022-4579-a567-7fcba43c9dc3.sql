-- 1) Recebimento da ficha oficial: substituição + nova versão + invalidação da conferência, atômico
CREATE OR REPLACE FUNCTION public.dp_preadmissao_ficha_oficial_registrar(
  p_preadmissao_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  v_versao int;
  v_doc uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status NOT IN ('enviado_contabilidade','aguardando_retorno_contabilidade','registro_recebido') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_invalida', 'status', pa.status);
  END IF;

  SELECT COALESCE(max(versao), 0) + 1 INTO v_versao
    FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = 'ficha_oficial';

  UPDATE public.dp_preadmissao_documentos
     SET substituido_em = now()
   WHERE preadmissao_id = pa.id
     AND requisito_codigo = 'ficha_oficial'
     AND substituido_em IS NULL;

  INSERT INTO public.dp_preadmissao_documentos (
    preadmissao_id, company_id, requisito_codigo, file_path, file_name,
    mime_type, file_size, versao
  ) VALUES (
    pa.id, pa.company_id, 'ficha_oficial', p_file_path, left(COALESCE(p_file_name, 'ficha-oficial'), 180),
    p_mime_type, p_file_size, v_versao
  ) RETURNING id INTO v_doc;

  -- Nova versão recebida invalida a conferência anterior: o gestor precisa
  -- conferir novamente antes de concluir a admissão.
  UPDATE public.dp_preadmissoes
     SET ficha_oficial_conferida_em = NULL,
         ficha_oficial_conferida_por = NULL,
         contabilidade_retorno_em = now(),
         versao = COALESCE(versao, 1) + 1,
         updated_at = now()
   WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true, 'documento_id', v_doc, 'versao', v_versao, 'status', pa.status);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_ficha_oficial_registrar(uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_ficha_oficial_registrar(uuid, text, text, text, bigint) TO service_role;

-- 2) Conferência da ficha oficial: sempre amarrada ao documento vigente, sob trava
CREATE OR REPLACE FUNCTION public.dp_preadmissao_ficha_oficial_conferir(
  p_preadmissao_id uuid,
  p_documento_id uuid,
  p_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  doc record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status NOT IN ('enviado_contabilidade','aguardando_retorno_contabilidade','registro_recebido') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_invalida', 'status', pa.status);
  END IF;

  SELECT * INTO doc FROM public.dp_preadmissao_documentos
   WHERE id = p_documento_id
     AND preadmissao_id = pa.id
     AND company_id = pa.company_id
     AND requisito_codigo = 'ficha_oficial'
   FOR UPDATE;
  IF doc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_nao_encontrado');
  END IF;
  IF doc.substituido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'documento_substituido');
  END IF;

  UPDATE public.dp_preadmissoes
     SET status = 'registro_recebido',
         ficha_oficial_conferida_em = now(),
         ficha_oficial_conferida_por = p_por,
         versao = COALESCE(versao, 1) + 1,
         updated_at = now()
   WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true, 'status', 'registro_recebido', 'documento_id', doc.id);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_ficha_oficial_conferir(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_ficha_oficial_conferir(uuid, uuid, uuid) TO service_role;

-- 3) Somente anexar a ficha: registra o recebimento sem tocar em cadastro algum
CREATE OR REPLACE FUNCTION public.dp_preadmissao_anexar_somente(
  p_preadmissao_id uuid,
  p_item_id uuid,
  p_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  it record;
  v_cpf text;
  v_cpf_item text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_concluida');
  END IF;
  IF pa.status NOT IN ('enviado_contabilidade','aguardando_retorno_contabilidade','registro_recebido') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_invalida', 'status', pa.status);
  END IF;

  SELECT * INTO it FROM public.dp_ficha_importacao_itens WHERE id = p_item_id;
  IF it.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'item_nao_encontrado');
  END IF;
  IF it.company_id <> pa.company_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'item_outra_empresa');
  END IF;

  v_cpf := regexp_replace(COALESCE(pa.cpf, pa.dados->>'cpf', ''), '\D', '', 'g');
  v_cpf_item := regexp_replace(COALESCE(it.dados_extraidos->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf_item) = 11 AND length(v_cpf) = 11 AND v_cpf_item <> v_cpf THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cpf_diferente');
  END IF;

  -- Nada é criado, reativado ou alterado: apenas o registro do recebimento.
  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, ator_user_id)
  VALUES (
    pa.id, pa.company_id, 'ficha_somente_anexada',
    jsonb_build_object('ficha_importacao_item_id', it.id, 'arquivo_path', it.arquivo_path),
    p_por
  );

  RETURN jsonb_build_object('ok', true, 'status', pa.status, 'ficha_importacao_item_id', it.id);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid) TO service_role;

-- 4) Recontratação: histórico do vínculo anterior é capturado ANTES de aplicar
--    os dados pessoais da ficha (a ordem anterior sobrescrevia os valores).
CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  p_preadmissao_id uuid,
  p_item_id uuid,
  p_dados jsonb,
  p_campos text[] DEFAULT NULL::text[],
  p_cargo_id uuid DEFAULT NULL::uuid,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_setor_id uuid DEFAULT NULL::uuid,
  p_turno_id uuid DEFAULT NULL::uuid,
  p_regime text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT NULL::text,
  p_jornada jsonb DEFAULT NULL::jsonb,
  p_justificativa text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_campos text[];
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || pa.id::text, 0));

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

  v_admissao := NULLIF(pa.admin_dados->>'data_admissao','')::date;

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

    -- Primeiro o novo vínculo: a rotina canônica captura os valores ANTERIORES
    -- para o histórico antes de qualquer alteração vinda da ficha.
    PERFORM public.dp_recontratar_colaborador(
      v_existente.id,
      COALESCE(v_admissao, CURRENT_DATE),
      COALESCE(p_regime, pa.admin_dados->>'regime_trabalho'),
      COALESCE(p_forma_pagamento, pa.admin_dados->>'forma_pagamento'),
      COALESCE(p_cargo_id, pa.cargo_previsto_id),
      COALESCE(p_unidade_id, pa.unidade_prevista_id),
      p_setor_id,
      NULLIF(pa.admin_dados->>'salario','')::numeric,
      NULL,
      NULL,
      COALESCE(p_justificativa, 'Recontratação a partir da Pré-Admissão pelo Candidato conferida.')
    );

    -- Depois os dados PESSOAIS conferidos, sem tocar no vínculo recém-registrado.
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
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL OR v_colab <> v_existente.id THEN
      RAISE EXCEPTION 'Não foi possível aplicar a ficha conferida ao cadastro existente.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_res := public.dp_ficha_aplicar(
      p_item_id, p_dados, NULL, p_campos, false,
      COALESCE(p_cargo_id, pa.cargo_previsto_id),
      COALESCE(p_unidade_id, pa.unidade_prevista_id),
      p_setor_id, p_turno_id,
      COALESCE(p_regime, pa.admin_dados->>'regime_trabalho'),
      COALESCE(p_forma_pagamento, pa.admin_dados->>'forma_pagamento'),
      NULL, NULL, p_jornada
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL THEN
      RAISE EXCEPTION 'Não foi possível criar o cadastro a partir da ficha conferida.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN public.dp_preadmissao_efetivar(pa.id, v_colab, p_item_id)
         || jsonb_build_object('modo', v_modo);
END;
$$;
