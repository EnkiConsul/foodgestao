-- Pré-Admissão — endurecimento do backend (revisão do commit f276cab)
-- Rollback ao final, comentado.

-- 1) Pessoas: remoção lógica, para não perder rastreabilidade do titular dos documentos.
ALTER TABLE public.dp_preadmissao_pessoas ADD COLUMN IF NOT EXISTS removido_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_dp_preadm_pessoas_vigentes
  ON public.dp_preadmissao_pessoas (preadmissao_id) WHERE removido_em IS NULL;

-- 2) Conferência da ficha oficial: sem isso a promoção não acontece.
ALTER TABLE public.dp_preadmissoes ADD COLUMN IF NOT EXISTS ficha_oficial_conferida_em timestamptz;
ALTER TABLE public.dp_preadmissoes ADD COLUMN IF NOT EXISTS ficha_oficial_conferida_por uuid;

-- 3) Escrita direta pelo cliente autenticado deixa de existir: toda transição
--    passa pelas funções de servidor/RPCs, que aplicam trava e regras.
REVOKE INSERT, UPDATE, DELETE ON public.dp_preadmissoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_preadmissao_convites FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_preadmissao_pessoas FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_preadmissao_documentos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_preadmissao_eventos FROM authenticated;

-- 4) Transição de situação com trava: só sai de um estado esperado.
CREATE OR REPLACE FUNCTION public.dp_preadmissao_transicionar(
  p_preadmissao_id uuid,
  p_de text[],
  p_para text,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF p_de IS NOT NULL AND array_length(p_de, 1) IS NOT NULL AND NOT (pa.status = ANY (p_de)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_inesperado', 'status', pa.status);
  END IF;

  UPDATE public.dp_preadmissoes SET
    status = COALESCE(p_para, status),
    dados = COALESCE(p_patch->'dados', dados),
    admin_dados = COALESCE(p_patch->'admin_dados', admin_dados),
    cpf = CASE WHEN p_patch ? 'cpf' THEN NULLIF(p_patch->>'cpf', '') ELSE cpf END,
    email = CASE WHEN p_patch ? 'email' THEN NULLIF(p_patch->>'email', '') ELSE email END,
    data_nascimento = CASE WHEN p_patch ? 'data_nascimento'
      THEN NULLIF(p_patch->>'data_nascimento', '')::date ELSE data_nascimento END,
    estado_civil = CASE WHEN p_patch ? 'estado_civil' THEN NULLIF(p_patch->>'estado_civil', '') ELSE estado_civil END,
    correcao_motivo = CASE WHEN p_patch ? 'correcao_motivo'
      THEN NULLIF(p_patch->>'correcao_motivo', '') ELSE correcao_motivo END,
    cargo_previsto_id = CASE WHEN p_patch ? 'cargo_previsto_id'
      THEN NULLIF(p_patch->>'cargo_previsto_id', '')::uuid ELSE cargo_previsto_id END,
    unidade_prevista_id = CASE WHEN p_patch ? 'unidade_prevista_id'
      THEN NULLIF(p_patch->>'unidade_prevista_id', '')::uuid ELSE unidade_prevista_id END,
    trabalho_apos_22h = CASE WHEN p_patch ? 'trabalho_apos_22h'
      THEN (p_patch->>'trabalho_apos_22h')::boolean ELSE trabalho_apos_22h END,
    enviado_em = CASE WHEN p_patch ? 'enviado_em' THEN now() ELSE enviado_em END,
    revisado_em = CASE WHEN p_patch ? 'revisado_em' THEN now() ELSE revisado_em END,
    revisado_por = CASE WHEN p_patch ? 'revisado_por'
      THEN NULLIF(p_patch->>'revisado_por', '')::uuid ELSE revisado_por END,
    contabilidade_enviado_em = CASE WHEN p_patch ? 'contabilidade_enviado_em' THEN now() ELSE contabilidade_enviado_em END,
    contabilidade_retorno_em = CASE WHEN p_patch ? 'contabilidade_retorno_em' THEN now() ELSE contabilidade_retorno_em END,
    ficha_oficial_conferida_em = CASE WHEN p_patch ? 'ficha_oficial_conferida_em' THEN now() ELSE ficha_oficial_conferida_em END,
    ficha_oficial_conferida_por = CASE WHEN p_patch ? 'ficha_oficial_conferida_por'
      THEN NULLIF(p_patch->>'ficha_oficial_conferida_por', '')::uuid ELSE ficha_oficial_conferida_por END,
    updated_at = now()
  WHERE id = pa.id;

  RETURN jsonb_build_object('ok', true, 'status_anterior', pa.status,
                            'status', (SELECT status FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_transicionar(uuid, text[], text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.dp_preadmissao_transicionar(uuid, text[], text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.dp_preadmissao_transicionar(uuid, text[], text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_transicionar(uuid, text[], text, jsonb) TO service_role;

-- 5) Documento: substituir a versão vigente e inserir a nova em UMA transação travada.
CREATE OR REPLACE FUNCTION public.dp_preadmissao_documento_registrar(
  p_preadmissao_id uuid,
  p_requisito_codigo text,
  p_pessoa_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  v_versao int;
  v_id uuid;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status NOT IN ('aguardando_preenchimento', 'em_preenchimento', 'correcao_solicitada', 'aguardando_nova_versao') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;
  IF p_pessoa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_preadmissao_pessoas
    WHERE id = p_pessoa_id AND preadmissao_id = pa.id AND removido_em IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'titular_invalido');
  END IF;

  UPDATE public.dp_preadmissao_documentos
     SET substituido_em = now()
   WHERE preadmissao_id = pa.id
     AND requisito_codigo = p_requisito_codigo
     AND COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND substituido_em IS NULL;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_versao
    FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = p_requisito_codigo;

  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name, mime_type, file_size, versao)
  VALUES (pa.id, pa.company_id, p_pessoa_id, p_requisito_codigo, p_file_path, p_file_name, p_mime_type, p_file_size, v_versao)
  RETURNING id INTO v_id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe)
  VALUES (pa.id, pa.company_id, 'documento_enviado',
          jsonb_build_object('codigo', p_requisito_codigo, 'versao', v_versao));

  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint) FROM public;
REVOKE ALL ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint) TO service_role;

-- 6) Promoção: exige ficha oficial anexada E conferida; ignora pessoas removidas.
CREATE OR REPLACE FUNCTION public.dp_preadmissao_efetivar(p_preadmissao_id uuid, p_colaborador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  v_idade int;
  v_docs int := 0;
  p record;
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RAISE EXCEPTION 'Pré-admissão não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), pa.company_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta pré-admissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('colaborador_id', pa.colaborador_id, 'ja_aplicado', true, 'documentos', 0);
  END IF;

  IF pa.status NOT IN ('registro_recebido') THEN
    RAISE EXCEPTION 'A pré-admissão só é concluída depois de receber e conferir a ficha oficial da contabilidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF pa.ficha_oficial_conferida_em IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.dp_preadmissao_documentos d
     WHERE d.preadmissao_id = pa.id AND d.requisito_codigo = 'ficha_oficial' AND d.substituido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Anexe a ficha oficial da contabilidade e registre a conferência antes de concluir.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = p_colaborador_id AND c.company_id = pa.company_id) THEN
    RAISE EXCEPTION 'Colaborador informado não pertence a esta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Bloqueio trabalhista revalidado aqui, sem depender de configuração da empresa.
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
      SELECT 1 FROM public.dp_dependentes d
      WHERE d.colaborador_id = p_colaborador_id
        AND (d.cpf IS NOT NULL AND d.cpf = p.cpf OR (p.cpf IS NULL AND upper(d.nome) = upper(p.nome)))
    ) THEN
      INSERT INTO public.dp_dependentes (company_id, colaborador_id, nome, data_nascimento, parentesco, cpf)
      VALUES (pa.company_id, p_colaborador_id, upper(p.nome), p.data_nascimento, p.parentesco, p.cpf);
    END IF;
  END LOOP;

  INSERT INTO public.dp_documentos (company_id, colaborador_id, tipo, titulo, descricao, file_path, file_name, file_size, mime_type, uploaded_by, aprovacao_status)
  SELECT pa.company_id, p_colaborador_id, 'outros_admissao'::dp_documento_tipo,
         upper(d.requisito_codigo), 'Documento enviado na pré-admissão.', d.file_path, d.file_name, d.file_size, d.mime_type, auth.uid(), 'aprovado'
  FROM public.dp_preadmissao_documentos d
  WHERE d.preadmissao_id = pa.id AND d.substituido_em IS NULL
    AND (d.pessoa_id IS NULL OR EXISTS (
      SELECT 1 FROM public.dp_preadmissao_pessoas pp WHERE pp.id = d.pessoa_id AND pp.removido_em IS NULL))
    AND NOT EXISTS (SELECT 1 FROM public.dp_documentos x WHERE x.file_path = d.file_path);
  GET DIAGNOSTICS v_docs = ROW_COUNT;

  UPDATE public.dp_preadmissoes
     SET colaborador_id = p_colaborador_id, status = 'concluido', updated_at = now()
   WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'concluida', jsonb_build_object('documentos', v_docs), auth.uid());

  RETURN jsonb_build_object('colaborador_id', p_colaborador_id, 'ja_aplicado', false, 'documentos', v_docs);
END;
$$;

-- ROLLBACK (revisar antes de executar; nunca apagar dados sem inventário):
-- DROP FUNCTION IF EXISTS public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint);
-- DROP FUNCTION IF EXISTS public.dp_preadmissao_transicionar(uuid, text[], text, jsonb);
-- GRANT INSERT, UPDATE, DELETE ON public.dp_preadmissoes, public.dp_preadmissao_convites,
--   public.dp_preadmissao_pessoas, public.dp_preadmissao_documentos, public.dp_preadmissao_eventos TO authenticated;
-- ALTER TABLE public.dp_preadmissoes DROP COLUMN IF EXISTS ficha_oficial_conferida_em;
-- ALTER TABLE public.dp_preadmissoes DROP COLUMN IF EXISTS ficha_oficial_conferida_por;
-- ALTER TABLE public.dp_preadmissao_pessoas DROP COLUMN IF EXISTS removido_em;