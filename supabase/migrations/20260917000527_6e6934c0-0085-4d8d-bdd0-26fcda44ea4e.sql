-- =====================================================================
-- Pré-Admissão — efetivação atômica, idempotente e rastreável
-- ROLLBACK (não destrutivo; mantém colunas e dados):
--   DROP FUNCTION IF EXISTS public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text);
--   -- restaurar a versão anterior de dp_preadmissao_efetivar(uuid, uuid) a partir do histórico de migrations
--   DROP INDEX IF EXISTS public.dp_preadm_colab_admissao_uk;
--   CREATE UNIQUE INDEX dp_preadm_colaborador_uk ON public.dp_preadmissoes (colaborador_id) WHERE colaborador_id IS NOT NULL;
--   (as colunas vinculo_admissao_em / ficha_importacao_item_id podem permanecer; não remover)
-- =====================================================================

ALTER TABLE public.dp_preadmissoes
  ADD COLUMN IF NOT EXISTS vinculo_admissao_em date,
  ADD COLUMN IF NOT EXISTS ficha_importacao_item_id uuid;

ALTER TABLE public.dp_ficha_importacao_itens
  ADD CONSTRAINT uq_dp_ficha_itens_id_company UNIQUE (id, company_id);

ALTER TABLE public.dp_preadmissoes
  ADD CONSTRAINT dp_preadm_ficha_item_fk
    FOREIGN KEY (ficha_importacao_item_id, company_id)
    REFERENCES public.dp_ficha_importacao_itens (id, company_id) ON DELETE SET NULL;

-- Vínculo por admissão: não impede recontratação futura do mesmo colaborador.
DROP INDEX IF EXISTS public.dp_preadm_colaborador_uk;
CREATE UNIQUE INDEX IF NOT EXISTS dp_preadm_colab_admissao_uk
  ON public.dp_preadmissoes (colaborador_id, vinculo_admissao_em)
  WHERE colaborador_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Efetivação: exige CPF idêntico, ficha oficial conferida e preserva
-- titular / finalidade / origem dos documentos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar(
  p_preadmissao_id uuid,
  p_colaborador_id uuid,
  p_ficha_importacao_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- CPF do cadastro precisa ser o mesmo da pré-admissão conferida.
  v_cpf_pa := regexp_replace(COALESCE(pa.cpf, pa.dados->>'cpf', ''), '\D', '', 'g');
  v_cpf_colab := regexp_replace(COALESCE(colab.cpf, ''), '\D', '', 'g');
  IF length(v_cpf_pa) <> 11 THEN
    RAISE EXCEPTION 'A pré-admissão não tem CPF válido conferido.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cpf_pa <> v_cpf_colab THEN
    RAISE EXCEPTION 'O CPF do colaborador não corresponde ao CPF conferido na pré-admissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Evidência da ficha conferida no importador (quando informada)
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

  -- Bloqueio trabalhista revalidado, sem depender de configuração da empresa.
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

  -- Dependentes (somente pessoas vigentes com finalidade de dependente)
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

  -- Documentos: preserva titular, finalidade e origem; recusados não são aproveitados.
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

  v_admissao := COALESCE(NULLIF(pa.admin_dados->>'data_admissao','')::date, colab.data_admissao, CURRENT_DATE);

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

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Promoção atômica: aplica a ficha conferida (ou recontrata) e conclui
-- a pré-admissão na MESMA transação, de forma idempotente.
-- ---------------------------------------------------------------------
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
  v_cpf text;
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

  SELECT * INTO v_existente FROM public.dp_colaboradores
   WHERE company_id = pa.company_id
     AND regexp_replace(COALESCE(cpf,''), '\D','','g') = v_cpf
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  v_admissao := NULLIF(pa.admin_dados->>'data_admissao','')::date;

  IF v_existente.id IS NOT NULL AND COALESCE(v_existente.ativo, false)
     AND v_existente.deleted_at IS NULL AND v_existente.data_desligamento IS NULL THEN
    RAISE EXCEPTION 'Já existe colaborador ativo com este CPF nesta empresa.' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_existente.id IS NOT NULL AND v_existente.deleted_at IS NULL THEN
    -- Recontratação canônica do ex-colaborador
    v_modo := 'recontratacao';
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
    v_colab := v_existente.id;
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

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) TO authenticated, service_role;