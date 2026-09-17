-- =============================================================================
-- Pré-Admissão pelo Candidato: anexo consultável, ordem única de travas e
-- recontratação com as decisões do gestor.
-- Rollback não destrutivo: basta recriar as versões anteriores das funções
-- (nenhuma tabela, coluna ou dado é alterado por esta migração).
-- =============================================================================

-- 1) SOMENTE ANEXAR ------------------------------------------------------------
-- Antes só gravava um evento; o arquivo recebido não ficava consultável. Agora
-- registra o anexo em dp_preadmissao_documentos (código 'ficha_oficial_anexada'),
-- versionado, sem tocar em dados pessoais, vínculo ou conclusão.
DROP FUNCTION IF EXISTS public.dp_preadmissao_anexar_somente(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.dp_preadmissao_anexar_somente(
  p_preadmissao_id uuid,
  p_item_id uuid,
  p_por uuid,
  p_file_path text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  it record;
  v_cpf text;
  v_cpf_item text;
  v_versao int;
  v_doc uuid;
BEGIN
  -- Ordem única em toda a fase: trava lógica da ficha ANTES da trava da linha.
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

  IF COALESCE(p_file_path, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'arquivo_obrigatorio');
  END IF;

  SELECT COALESCE(max(versao), 0) + 1 INTO v_versao
    FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = 'ficha_oficial_anexada';

  UPDATE public.dp_preadmissao_documentos
     SET substituido_em = now()
   WHERE preadmissao_id = pa.id
     AND requisito_codigo = 'ficha_oficial_anexada'
     AND substituido_em IS NULL;

  INSERT INTO public.dp_preadmissao_documentos (
    preadmissao_id, company_id, requisito_codigo, file_path, file_name,
    mime_type, file_size, versao
  ) VALUES (
    pa.id, pa.company_id, 'ficha_oficial_anexada', p_file_path,
    left(COALESCE(p_file_name, 'ficha-anexada'), 180), p_mime_type, p_file_size, v_versao
  ) RETURNING id INTO v_doc;

  -- Nenhuma mudança de situação, de dados pessoais ou de vínculo: só o anexo.
  UPDATE public.dp_preadmissoes
     SET versao = COALESCE(versao, 1) + 1,
         updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (
    pa.id, pa.company_id, 'ficha_somente_anexada',
    jsonb_build_object(
      'ficha_importacao_item_id', it.id,
      'documento_id', v_doc,
      'versao', v_versao
    ),
    p_por
  );

  RETURN jsonb_build_object('ok', true, 'status', pa.status, 'ficha_importacao_item_id', it.id,
                            'documento_id', v_doc, 'versao', v_versao);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid, text, text, text, bigint) TO service_role;

-- 2) CONCLUSÃO: trava lógica antes da linha + data de admissão decidida --------
DROP FUNCTION IF EXISTS public.dp_preadmissao_efetivar(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar(
  p_preadmissao_id uuid,
  p_colaborador_id uuid,
  p_ficha_importacao_item_id uuid DEFAULT NULL::uuid,
  p_data_admissao date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  colab record;
  v_idade int;
  v_docs int := 0;
  v_deps int := 0;
  v_cpf_pa text;
  v_cpf_colab text;
  v_admissao date;
  p record;
  d record;
  v_titular text;
  v_finalidade text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotência
  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', pa.colaborador_id, 'ja_aplicado', true,
                              'documentos', 0, 'dependentes', 0);
  END IF;

  IF pa.status <> 'registro_recebido' THEN
    RAISE EXCEPTION 'A pré-admissão só é concluída depois de receber e conferir a ficha oficial da contabilidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF pa.ficha_oficial_conferida_em IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.dp_preadmissao_documentos dd
     WHERE dd.preadmissao_id = pa.id AND dd.requisito_codigo = 'ficha_oficial'
       AND dd.substituido_em IS NULL AND dd.status <> 'recusado'
  ) THEN
    RAISE EXCEPTION 'Anexe a ficha oficial da contabilidade e registre a conferência antes de concluir.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO colab FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND company_id = pa.company_id FOR UPDATE;
  IF colab.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador informado não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  v_cpf_pa := regexp_replace(COALESCE(pa.cpf, pa.dados->>'cpf', ''), '\D', '', 'g');
  v_cpf_colab := regexp_replace(COALESCE(colab.cpf, ''), '\D', '', 'g');
  IF length(v_cpf_pa) <> 11 THEN
    RAISE EXCEPTION 'A pré-admissão não tem CPF válido conferido.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cpf_pa <> v_cpf_colab THEN
    RAISE EXCEPTION 'O CPF do colaborador não corresponde ao CPF conferido na pré-admissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_ficha_importacao_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_ficha_importacao_itens i
       WHERE i.id = p_ficha_importacao_item_id
         AND i.company_id = pa.company_id
         AND i.colaborador_id = p_colaborador_id
         AND i.status IN ('criado', 'atualizado')
    ) THEN
      RAISE EXCEPTION 'A ficha importada informada não pertence a esta empresa ou não foi aplicada a este colaborador.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF pa.trabalho_apos_22h THEN
    IF pa.data_nascimento IS NULL THEN
      RAISE EXCEPTION 'Validação de idade pendente: informe a data de nascimento antes de concluir.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_idade := EXTRACT(YEAR FROM age(CURRENT_DATE, pa.data_nascimento))::int;
    IF v_idade < 18 THEN
      RAISE EXCEPTION 'Trabalho após as 22h não é permitido para menor de 18 anos (Art. 404 CLT / Art. 67 ECA).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  FOR p IN SELECT * FROM public.dp_preadmissao_pessoas
            WHERE preadmissao_id = pa.id AND finalidade_dependente AND removido_em IS NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.dp_dependentes x
      WHERE x.colaborador_id = p_colaborador_id
        AND ((x.cpf IS NOT NULL AND p.cpf IS NOT NULL AND regexp_replace(x.cpf,'\D','','g') = regexp_replace(p.cpf,'\D','','g'))
             OR (p.cpf IS NULL AND upper(x.nome) = upper(p.nome)))
    ) THEN
      INSERT INTO public.dp_dependentes (company_id, colaborador_id, nome, data_nascimento, parentesco, cpf)
      VALUES (pa.company_id, p_colaborador_id, upper(p.nome), p.data_nascimento, p.parentesco, p.cpf);
      v_deps := v_deps + 1;
    END IF;
  END LOOP;

  FOR d IN
    SELECT dd.*, pp.nome AS pessoa_nome, pp.parentesco AS pessoa_parentesco,
           pp.finalidade_dependente, pp.finalidade_sesc
      FROM public.dp_preadmissao_documentos dd
      LEFT JOIN public.dp_preadmissao_pessoas pp ON pp.id = dd.pessoa_id
     WHERE dd.preadmissao_id = pa.id
       AND dd.substituido_em IS NULL
       AND dd.status <> 'recusado'
       AND (dd.pessoa_id IS NULL OR pp.removido_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.dp_documentos x WHERE x.file_path = dd.file_path)
  LOOP
    IF d.pessoa_id IS NULL THEN
      v_titular := upper(COALESCE(pa.dados->>'nome', pa.candidato_nome));
      v_finalidade := 'TITULAR';
    ELSE
      v_titular := upper(d.pessoa_nome);
      v_finalidade := CASE
        WHEN d.finalidade_dependente AND d.finalidade_sesc THEN 'DEPENDENTE E SESC'
        WHEN d.finalidade_dependente THEN 'DEPENDENTE'
        ELSE 'SESC' END
        || COALESCE(' - ' || upper(d.pessoa_parentesco), '');
    END IF;

    INSERT INTO public.dp_documentos (
      company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
      file_path, file_name, file_size, mime_type, uploaded_by,
      aprovacao_status, submetido_por_colaborador
    )
    VALUES (
      pa.company_id, p_colaborador_id, pa.unidade_prevista_id,
      'outros_admissao'::dp_documento_tipo,
      upper(d.requisito_codigo),
      'Origem: Pré-Admissão pelo Candidato. Titular: ' || v_titular || '. Finalidade: ' || v_finalidade || '.',
      d.file_path, d.file_name, d.file_size, d.mime_type, auth.uid(),
      CASE WHEN d.status = 'aprovado' THEN 'aprovado'::dp_documento_aprovacao_status
           ELSE 'pendente'::dp_documento_aprovacao_status END,
      true
    );
    v_docs := v_docs + 1;
  END LOOP;

  -- Data de admissão: a decidida pelo gestor tem prioridade sobre o rascunho.
  v_admissao := COALESCE(p_data_admissao,
                         NULLIF(pa.admin_dados->>'data_admissao','')::date,
                         colab.data_admissao, CURRENT_DATE);

  UPDATE public.dp_preadmissoes
     SET colaborador_id = p_colaborador_id,
         status = 'concluido',
         vinculo_admissao_em = v_admissao,
         ficha_importacao_item_id = COALESCE(p_ficha_importacao_item_id, ficha_importacao_item_id),
         updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'concluida',
          jsonb_build_object('documentos', v_docs, 'dependentes', v_deps,
                             'ficha_importacao_item_id', p_ficha_importacao_item_id,
                             'admissao', v_admissao), auth.uid());

  RETURN jsonb_build_object('colaborador_id', p_colaborador_id, 'ja_aplicado', false,
                            'documentos', v_docs, 'dependentes', v_deps, 'admissao', v_admissao);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid, date) TO authenticated, service_role;

-- 3) CONCLUSÃO COM A FICHA CONFERIDA ------------------------------------------
-- Trava lógica antes da linha (mesma ordem do anexo e da conferência) e
-- recontratação com o vínculo, salário, data e jornada decididos pelo gestor.
DROP FUNCTION IF EXISTS public.dp_preadmissao_efetivar_com_ficha(
  uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text);

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
  p_justificativa text DEFAULT NULL::text,
  p_salario numeric DEFAULT NULL::numeric,
  p_data_admissao date DEFAULT NULL::date
)
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
BEGIN
  -- Ordem única: trava lógica ANTES de travar a linha, como no anexo e na
  -- conferência, para que duas conclusões simultâneas nunca se travem em cruz.
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

  -- Referências do vínculo: sempre a decisão do gestor; o previsto é só o padrão.
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

    -- Primeiro o novo vínculo pela rotina canônica: ela captura os valores
    -- ANTERIORES no histórico antes de qualquer alteração, e já recebe as
    -- decisões do gestor (cargo, unidade, setor, vínculo, forma e salário).
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

    -- Dados pessoais conferidos: só campos pessoais entram no conjunto, de modo
    -- que PIS, e-mail de portal e demais dados administrativos já cadastrados
    -- permanecem intactos.
    SELECT array_agg(c) INTO v_campos
      FROM unnest(COALESCE(p_campos, c_pessoais)) c
     WHERE c = ANY(c_pessoais);
    IF v_campos IS NULL OR array_length(v_campos, 1) IS NULL THEN
      v_campos := ARRAY['nome','cpf'];
    END IF;

    -- Turno e jornada decididos pelo gestor são aplicados DEPOIS da captura do
    -- histórico, então nada do vínculo anterior é perdido.
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

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text, numeric, date) TO authenticated, service_role;
