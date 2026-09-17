-- =====================================================================
-- Pré-Admissão — caminho de RECONTRATAÇÃO na efetivação atômica
-- ROLLBACK (não destrutivo): recriar a versão anterior de
--   public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid,
--   uuid, uuid, text, text, jsonb, text) a partir da migration
--   20260917000527. Nenhuma coluna, índice ou dado é alterado aqui.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  p_preadmissao_id uuid,
  p_item_id uuid,
  p_dados jsonb,
  p_campos text[] DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_unidade_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_regime text DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_jornada jsonb DEFAULT NULL,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  pa record;
  it record;
  v_cpf text;
  v_cpf_item text;
  v_existente record;
  v_colab uuid;
  v_res jsonb;
  v_modo text := 'importacao';
  v_admissao date;
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

  -- ---------------------------------------------------------------
  -- Validação da ficha importada ANTES de qualquer mutação
  -- ---------------------------------------------------------------
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Informe a ficha conferida a aplicar.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO it FROM public.dp_ficha_importacao_itens
   WHERE id = p_item_id FOR UPDATE;
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
    -- Recontratação canônica do ex-colaborador
    v_modo := 'recontratacao';

    IF v_existente.data_desligamento IS NOT NULL
       AND COALESCE(v_admissao, CURRENT_DATE) <= v_existente.data_desligamento THEN
      RAISE EXCEPTION 'A nova data de admissão precisa ser posterior ao desligamento (%).',
        to_char(v_existente.data_desligamento, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;

    -- A ficha conferida passa a apontar para o cadastro existente, para que os
    -- dados pessoais conferidos sejam aplicados e o item fique vinculado.
    UPDATE public.dp_ficha_importacao_itens
       SET colaborador_existente_id = v_existente.id,
           updated_at = now()
     WHERE id = it.id AND company_id = pa.company_id;

    v_res := public.dp_ficha_aplicar(
      p_item_id, p_dados, NULL, p_campos, true,
      COALESCE(p_cargo_id, pa.cargo_previsto_id),
      COALESCE(p_unidade_id, pa.unidade_prevista_id),
      p_setor_id, p_turno_id,
      COALESCE(p_regime, pa.admin_dados->>'regime_trabalho'),
      COALESCE(p_forma_pagamento, pa.admin_dados->>'forma_pagamento'),
      NULL, NULL, p_jornada
    );
    v_colab := (v_res->>'colaborador_id')::uuid;
    IF v_colab IS NULL OR v_colab <> v_existente.id THEN
      RAISE EXCEPTION 'Não foi possível aplicar a ficha conferida ao cadastro existente.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Dados administrativos conferidos (novo vínculo com histórico canônico)
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
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) TO authenticated, service_role;