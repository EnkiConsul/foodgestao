-- ============================================================
-- Fase 7 — Documentos e arquivos do colaborador
-- ============================================================

-- 1. Ajudantes privados -------------------------------------------------

CREATE OR REPLACE FUNCTION private.dp_doc_service_role()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role',
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.dp_doc_admin(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _company_id IS NOT NULL AND (
    private.dp_doc_service_role()
    OR private.is_company_admin_or_owner(auth.uid(), _company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.dp_documento_conferir(
  _company_id uuid,
  _colaborador_id uuid,
  _unidade_id uuid,
  _file_path text
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'DOC_EMPRESA_INVALIDA'; END IF;

  IF _file_path IS NOT NULL AND _file_path NOT LIKE (_company_id::text || '/%') THEN
    RAISE EXCEPTION 'DOC_ARQUIVO_FORA_DA_EMPRESA';
  END IF;

  IF _colaborador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
     WHERE c.id = _colaborador_id AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'DOC_COLABORADOR_INVALIDO';
  END IF;

  IF _unidade_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u
     WHERE u.id = _unidade_id AND u.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'DOC_UNIDADE_INVALIDA';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.dp_doc_campos_conferir(_dados jsonb, _permitidos text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(coalesce(_dados, '{}'::jsonb)) LOOP
    IF NOT (k = ANY(_permitidos)) THEN
      RAISE EXCEPTION 'DOC_CAMPO_NAO_PERMITIDO:%', k;
    END IF;
  END LOOP;
END $$;

-- Registra a linha do histórico do documento (uso interno das rotinas).
CREATE OR REPLACE FUNCTION private.dp_doc_evento(
  _doc public.dp_documentos,
  _acao text,
  _motivo text DEFAULT NULL,
  _arquivo_anterior text DEFAULT NULL,
  _arquivo_novo text DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.dp_documento_eventos (
    company_id, documento_id, origem, acao, titulo, tipo, competencia,
    colaborador_id, arquivo_anterior, arquivo_novo, motivo, autor_id
  ) VALUES (
    _doc.company_id, _doc.id, 'doc', _acao, _doc.titulo, _doc.tipo::text,
    to_char(_doc.referencia_data, 'YYYY-MM'), _doc.colaborador_id,
    _arquivo_anterior, _arquivo_novo, _motivo, auth.uid()
  );
$$;

-- 2. Documento: registrar ----------------------------------------------

CREATE OR REPLACE FUNCTION public.dp_documento_registrar(p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid;
  v_colab uuid;
  v_unidade uuid;
  v_path text;
  v_admin boolean;
  v_self uuid;
  v_id uuid;
  v_doc public.dp_documentos;
BEGIN
  IF auth.uid() IS NULL AND NOT private.dp_doc_service_role() THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  PERFORM private.dp_doc_campos_conferir(p_dados, ARRAY[
    'company_id','colaborador_id','unidade_id','tipo','titulo','descricao',
    'file_path','file_name','file_size','mime_type','referencia_data',
    'ferias_gozo_id','rescisao_grupo_id','exige_aceite'
  ]);

  v_company := nullif(p_dados->>'company_id','')::uuid;
  v_colab   := nullif(p_dados->>'colaborador_id','')::uuid;
  v_unidade := nullif(p_dados->>'unidade_id','')::uuid;
  v_path    := nullif(p_dados->>'file_path','');

  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;
  IF coalesce(trim(p_dados->>'titulo'),'') = '' THEN RAISE EXCEPTION 'DOC_TITULO_OBRIGATORIO'; END IF;

  v_admin := private.dp_doc_admin(v_company);
  v_self  := public.dp_colaborador_ativo_of(auth.uid());

  IF NOT v_admin THEN
    IF v_colab IS NULL OR v_self IS NULL OR v_colab <> v_self THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  PERFORM private.dp_documento_conferir(v_company, v_colab, v_unidade, v_path);

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_documento:' || v_company::text || ':' || v_path, 0));

  SELECT id INTO v_id FROM public.dp_documentos
   WHERE company_id = v_company AND file_path = v_path LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.dp_documentos (
    company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
    file_path, file_name, file_size, mime_type, referencia_data,
    ferias_gozo_id, rescisao_grupo_id, exige_aceite, uploaded_by,
    submetido_por_colaborador, aprovacao_status, revisado_por, revisado_em
  ) VALUES (
    v_company, v_colab, v_unidade,
    coalesce(nullif(p_dados->>'tipo','')::public.dp_documento_tipo, 'outros'),
    trim(p_dados->>'titulo'),
    nullif(p_dados->>'descricao',''),
    v_path,
    nullif(p_dados->>'file_name',''),
    nullif(p_dados->>'file_size','')::bigint,
    nullif(p_dados->>'mime_type',''),
    nullif(p_dados->>'referencia_data','')::date,
    nullif(p_dados->>'ferias_gozo_id','')::uuid,
    nullif(p_dados->>'rescisao_grupo_id','')::uuid,
    coalesce(nullif(p_dados->>'exige_aceite','')::boolean, true),
    auth.uid(),
    NOT v_admin,
    CASE WHEN v_admin THEN 'aprovado'::public.dp_documento_aprovacao_status
         ELSE 'pendente'::public.dp_documento_aprovacao_status END,
    CASE WHEN v_admin THEN auth.uid() ELSE NULL END,
    CASE WHEN v_admin THEN now() ELSE NULL END
  ) RETURNING * INTO v_doc;

  PERFORM private.dp_doc_evento(v_doc, 'document_created', NULL, NULL, v_path);
  RETURN v_doc.id;
END $$;

-- 3. Documento: revisar (aprovar / recusar) ----------------------------

CREATE OR REPLACE FUNCTION public.dp_documento_revisar(
  p_documento_id uuid,
  p_status text,
  p_motivo text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_doc public.dp_documentos;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_status NOT IN ('aprovado','recusado','pendente') THEN RAISE EXCEPTION 'DOC_STATUS_INVALIDO'; END IF;
  IF p_status = 'recusado' AND coalesce(trim(p_motivo),'') = '' THEN
    RAISE EXCEPTION 'DOC_MOTIVO_OBRIGATORIO';
  END IF;

  UPDATE public.dp_documentos
     SET aprovacao_status = p_status::public.dp_documento_aprovacao_status,
         motivo_recusao = CASE WHEN p_status = 'recusado' THEN trim(p_motivo) ELSE NULL END,
         revisado_por = auth.uid(),
         revisado_em = now(),
         updated_at = now()
   WHERE id = p_documento_id;

  PERFORM private.dp_doc_evento(v_doc, 'document_reviewed_' || p_status, nullif(trim(coalesce(p_motivo,'')),''));
  RETURN true;
END $$;

-- 4. Documento: substituir arquivo ------------------------------------

CREATE OR REPLACE FUNCTION public.dp_documento_substituir(
  p_documento_id uuid,
  p_arquivo jsonb,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_doc public.dp_documentos;
  v_novo public.dp_documentos;
  v_assinado boolean;
  v_path text;
  v_colab uuid;
  v_tipo public.dp_documento_tipo;
  v_ref date;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);
  PERFORM private.dp_doc_campos_conferir(p_patch, ARRAY['colaborador_id','tipo','competencia']);

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_documento_sub:' || p_documento_id::text, 0));

  v_path := nullif(p_arquivo->>'file_path','');
  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;

  v_colab := CASE WHEN p_patch ? 'colaborador_id'
                  THEN nullif(p_patch->>'colaborador_id','')::uuid
                  ELSE v_doc.colaborador_id END;
  v_tipo := coalesce(nullif(p_patch->>'tipo','')::public.dp_documento_tipo, v_doc.tipo);
  v_ref := CASE WHEN p_patch ? 'competencia'
                THEN nullif(nullif(p_patch->>'competencia','') || '-01','')::date
                ELSE v_doc.referencia_data END;

  PERFORM private.dp_documento_conferir(v_doc.company_id, v_colab, v_doc.unidade_id, v_path);

  SELECT EXISTS (SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = v_doc.id)
    INTO v_assinado;

  IF v_assinado THEN
    INSERT INTO public.dp_documentos (
      company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
      file_path, file_name, file_size, mime_type, referencia_data,
      ferias_gozo_id, rescisao_grupo_id, exige_aceite, uploaded_by,
      aprovacao_status, revisado_por, revisado_em, replaces_documento_id
    ) VALUES (
      v_doc.company_id, v_colab, v_doc.unidade_id, v_tipo, v_doc.titulo, v_doc.descricao,
      v_path, nullif(p_arquivo->>'file_name',''), nullif(p_arquivo->>'file_size','')::bigint,
      coalesce(nullif(p_arquivo->>'mime_type',''), 'application/pdf'), v_ref,
      v_doc.ferias_gozo_id, v_doc.rescisao_grupo_id, v_doc.exige_aceite, auth.uid(),
      v_doc.aprovacao_status, auth.uid(), now(), v_doc.id
    ) RETURNING * INTO v_novo;

    PERFORM public.dp_documento_versao_publicar(
      v_novo.id, v_doc.id,
      coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Novo arquivo enviado no Histórico')
    );

    RETURN jsonb_build_object(
      'modo','nova_versao','documento_id', v_novo.id, 'arquivo_anterior', NULL
    );
  END IF;

  UPDATE public.dp_documentos
     SET file_path = v_path,
         file_name = nullif(p_arquivo->>'file_name',''),
         file_size = nullif(p_arquivo->>'file_size','')::bigint,
         mime_type = coalesce(nullif(p_arquivo->>'mime_type',''), 'application/pdf'),
         colaborador_id = v_colab,
         tipo = v_tipo,
         referencia_data = v_ref,
         arquivo_sha256 = NULL,
         arquivo_sha256_em = NULL,
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(
    v_doc, 'document_replaced', nullif(trim(coalesce(p_motivo,'')),''), v_doc.file_path, v_path
  );

  RETURN jsonb_build_object(
    'modo','substituido','documento_id', v_doc.id, 'arquivo_anterior', v_doc.file_path
  );
END $$;

-- 5. Documento: excluir (lógico) --------------------------------------

CREATE OR REPLACE FUNCTION public.dp_documento_excluir(
  p_documento_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_doc public.dp_documentos;
  v_admin boolean;
  v_self uuid;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RETURN jsonb_build_object('modo','inexistente'); END IF;

  v_admin := private.dp_doc_admin(v_doc.company_id);
  v_self := public.dp_colaborador_ativo_of(auth.uid());

  -- O próprio colaborador pode cancelar o envio dele enquanto está pendente.
  IF NOT v_admin THEN
    IF v_self IS NULL OR v_doc.colaborador_id IS DISTINCT FROM v_self
       OR NOT v_doc.submetido_por_colaborador
       OR v_doc.aprovacao_status <> 'pendente' THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;

    PERFORM private.dp_doc_evento(v_doc, 'document_canceled', 'Cancelado pelo colaborador', v_doc.file_path, NULL);
    DELETE FROM public.dp_colaborador_documentos WHERE documento_id = v_doc.id;
    DELETE FROM public.dp_documentos WHERE id = v_doc.id;
    RETURN jsonb_build_object('modo','cancelado','arquivo_path', v_doc.file_path);
  END IF;

  IF v_doc.arquivado_em IS NOT NULL THEN
    RETURN jsonb_build_object('modo','ja_arquivado','arquivo_path', NULL);
  END IF;

  UPDATE public.dp_documentos
     SET ciclo_status = 'arquivado',
         arquivado_em = now(),
         arquivado_por = auth.uid(),
         arquivamento_motivo = nullif(trim(coalesce(p_motivo,'')),''),
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(
    v_doc, 'document_deleted', nullif(trim(coalesce(p_motivo,'')),''), v_doc.file_path, NULL
  );

  RETURN jsonb_build_object('modo','arquivado','arquivo_path', NULL);
END $$;

-- 6. Comprovante de pagamento -----------------------------------------

CREATE OR REPLACE FUNCTION public.dp_comprovante_anexar(
  p_documento_id uuid,
  p_arquivo jsonb,
  p_pago_em date DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_doc public.dp_documentos;
  v_path text;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_path := nullif(p_arquivo->>'file_path','');
  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;
  PERFORM private.dp_documento_conferir(v_doc.company_id, v_doc.colaborador_id, NULL, v_path);

  IF p_pago_em IS NOT NULL THEN
    IF p_pago_em > current_date THEN RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_FUTURA'; END IF;
    IF v_doc.referencia_data IS NOT NULL
       AND p_pago_em < date_trunc('month', v_doc.referencia_data)::date THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_ANTES_DA_COMPETENCIA';
    END IF;
  END IF;

  UPDATE public.dp_documentos
     SET comprovante_file_path = v_path,
         comprovante_file_name = nullif(p_arquivo->>'file_name',''),
         comprovante_file_size = nullif(p_arquivo->>'file_size','')::bigint,
         comprovante_mime_type = nullif(p_arquivo->>'mime_type',''),
         comprovante_pago_em = p_pago_em,
         comprovante_uploaded_by = auth.uid(),
         comprovante_uploaded_at = now(),
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(
    v_doc, 'comprovante_anexado', NULL, v_doc.comprovante_file_path, v_path
  );

  RETURN CASE WHEN v_doc.comprovante_file_path IS DISTINCT FROM v_path
              THEN v_doc.comprovante_file_path ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public.dp_comprovante_remover(p_documento_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_doc public.dp_documentos;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  UPDATE public.dp_documentos
     SET comprovante_file_path = NULL,
         comprovante_file_name = NULL,
         comprovante_file_size = NULL,
         comprovante_mime_type = NULL,
         comprovante_pago_em = NULL,
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(v_doc, 'comprovante_removido', NULL, v_doc.comprovante_file_path, NULL);
  RETURN v_doc.comprovante_file_path;
END $$;

CREATE OR REPLACE FUNCTION public.dp_comprovante_reassociar(
  p_origem_id uuid,
  p_destino_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_o public.dp_documentos;
  v_d public.dp_documentos;
BEGIN
  IF p_origem_id = p_destino_id THEN RAISE EXCEPTION 'DOC_COMPROVANTE_MESMO_DOCUMENTO'; END IF;

  SELECT * INTO v_o FROM public.dp_documentos WHERE id = p_origem_id FOR UPDATE;
  SELECT * INTO v_d FROM public.dp_documentos WHERE id = p_destino_id FOR UPDATE;
  IF v_o.id IS NULL OR v_d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_o.company_id <> v_d.company_id THEN RAISE EXCEPTION 'DOC_EMPRESA_INVALIDA'; END IF;
  IF NOT private.dp_doc_admin(v_o.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_o.comprovante_file_path IS NULL THEN RAISE EXCEPTION 'DOC_COMPROVANTE_INEXISTENTE'; END IF;

  UPDATE public.dp_documentos
     SET comprovante_file_path = v_o.comprovante_file_path,
         comprovante_file_name = v_o.comprovante_file_name,
         comprovante_file_size = v_o.comprovante_file_size,
         comprovante_mime_type = v_o.comprovante_mime_type,
         comprovante_pago_em = v_o.comprovante_pago_em,
         comprovante_uploaded_by = v_o.comprovante_uploaded_by,
         comprovante_uploaded_at = v_o.comprovante_uploaded_at,
         updated_at = now()
   WHERE id = v_d.id;

  UPDATE public.dp_documentos
     SET comprovante_file_path = NULL,
         comprovante_file_name = NULL,
         comprovante_file_size = NULL,
         comprovante_mime_type = NULL,
         comprovante_pago_em = NULL,
         comprovante_uploaded_by = NULL,
         comprovante_uploaded_at = NULL,
         updated_at = now()
   WHERE id = v_o.id;

  PERFORM private.dp_doc_evento(v_o, 'comprovante_reassociado', p_motivo, v_o.comprovante_file_path, NULL);
  PERFORM private.dp_doc_evento(v_d, 'comprovante_reassociado', p_motivo, NULL, v_o.comprovante_file_path);
  RETURN true;
END $$;

-- 7. Checklist do colaborador -----------------------------------------

CREATE OR REPLACE FUNCTION public.dp_colaborador_documento_salvar(
  p_id uuid,
  p_dados jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_linha public.dp_colaborador_documentos;
  v_colab uuid;
  v_company uuid;
  v_admin boolean;
  v_self uuid;
  v_req uuid;
  v_doc uuid;
  v_dep uuid;
  v_status text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL AND NOT private.dp_doc_service_role() THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  PERFORM private.dp_doc_campos_conferir(p_dados, ARRAY[
    'colaborador_id','dependente_id','requisito_id','documento_id','status',
    'validade','dispensado','motivo_dispensa','conteudo_hash','aceite_solicitado'
  ]);

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_linha FROM public.dp_colaborador_documentos WHERE id = p_id FOR UPDATE;
    IF v_linha.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_colab := v_linha.colaborador_id;
  ELSE
    v_colab := nullif(p_dados->>'colaborador_id','')::uuid;
  END IF;
  IF v_colab IS NULL THEN RAISE EXCEPTION 'DOC_COLABORADOR_INVALIDO'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = v_colab;
  IF v_company IS NULL THEN RAISE EXCEPTION 'DOC_COLABORADOR_INVALIDO'; END IF;

  v_admin := private.dp_doc_admin(v_company);
  v_self := public.dp_colaborador_ativo_of(auth.uid());

  v_req := coalesce(nullif(p_dados->>'requisito_id','')::uuid, v_linha.requisito_id);
  v_doc := CASE WHEN p_dados ? 'documento_id'
                THEN nullif(p_dados->>'documento_id','')::uuid
                ELSE v_linha.documento_id END;
  v_dep := CASE WHEN p_dados ? 'dependente_id'
                THEN nullif(p_dados->>'dependente_id','')::uuid
                ELSE v_linha.dependente_id END;
  v_status := coalesce(nullif(p_dados->>'status',''), v_linha.status, 'enviado');

  IF v_status NOT IN ('enviado','aprovado','recusado','dispensado') THEN
    RAISE EXCEPTION 'DOC_STATUS_INVALIDO';
  END IF;

  IF NOT v_admin THEN
    -- Colaborador só registra o envio do próprio documento.
    IF v_self IS NULL OR v_colab <> v_self OR v_status <> 'enviado'
       OR coalesce(nullif(p_dados->>'dispensado','')::boolean, false)
       OR (p_dados ? 'aceite_solicitado') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  IF v_req IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.dp_documento_requisitos r
     WHERE r.id = v_req AND r.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'DOC_REQUISITO_INVALIDO';
  END IF;

  IF v_doc IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_documentos d
     WHERE d.id = v_doc AND d.company_id = v_company
       AND (d.colaborador_id IS NULL OR d.colaborador_id = v_colab)
  ) THEN
    RAISE EXCEPTION 'DOC_DOCUMENTO_INVALIDO';
  END IF;

  IF v_dep IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_dependentes dep
     WHERE dep.id = v_dep AND dep.colaborador_id = v_colab
  ) THEN
    RAISE EXCEPTION 'DOC_DEPENDENTE_INVALIDO';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.dp_colaborador_documentos (
      company_id, colaborador_id, dependente_id, requisito_id, documento_id,
      status, validade, dispensado, motivo_dispensa, conteudo_hash,
      aceite_solicitado_em, aceito_em
    ) VALUES (
      v_company, v_colab, v_dep, v_req, v_doc, v_status,
      nullif(p_dados->>'validade','')::date,
      coalesce(nullif(p_dados->>'dispensado','')::boolean, false),
      nullif(p_dados->>'motivo_dispensa',''),
      nullif(p_dados->>'conteudo_hash',''),
      CASE WHEN coalesce(nullif(p_dados->>'aceite_solicitado','')::boolean, false)
           THEN now() ELSE NULL END,
      NULL
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_colaborador_documentos SET
      dependente_id = v_dep,
      requisito_id = v_req,
      documento_id = v_doc,
      status = v_status,
      validade = CASE WHEN p_dados ? 'validade'
                      THEN nullif(p_dados->>'validade','')::date ELSE validade END,
      dispensado = coalesce(nullif(p_dados->>'dispensado','')::boolean, dispensado),
      motivo_dispensa = CASE WHEN p_dados ? 'motivo_dispensa'
                             THEN nullif(p_dados->>'motivo_dispensa','') ELSE motivo_dispensa END,
      conteudo_hash = coalesce(nullif(p_dados->>'conteudo_hash',''), conteudo_hash),
      aceite_solicitado_em = CASE
        WHEN p_dados ? 'aceite_solicitado' THEN
          CASE WHEN (p_dados->>'aceite_solicitado')::boolean THEN now() ELSE NULL END
        ELSE aceite_solicitado_em END,
      aceito_em = CASE
        WHEN p_dados ? 'aceite_solicitado' AND (p_dados->>'aceite_solicitado')::boolean
          THEN NULL ELSE aceito_em END,
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  -- Decisão do DP acompanha o documento do acervo.
  IF v_admin AND v_doc IS NOT NULL AND v_status IN ('aprovado','recusado') THEN
    UPDATE public.dp_documentos
       SET aprovacao_status = v_status::public.dp_documento_aprovacao_status,
           motivo_recusao = CASE WHEN v_status = 'recusado'
                                 THEN nullif(p_dados->>'motivo_dispensa','') ELSE NULL END,
           revisado_por = auth.uid(),
           revisado_em = now(),
           updated_at = now()
     WHERE id = v_doc;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_documento_excluir(
  p_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_linha public.dp_colaborador_documentos;
  v_admin boolean;
  v_self uuid;
  v_res jsonb := jsonb_build_object('modo','removido');
BEGIN
  SELECT * INTO v_linha FROM public.dp_colaborador_documentos WHERE id = p_id FOR UPDATE;
  IF v_linha.id IS NULL THEN RETURN jsonb_build_object('modo','inexistente'); END IF;

  v_admin := private.dp_doc_admin(v_linha.company_id);
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  IF NOT v_admin AND (v_self IS NULL OR v_linha.colaborador_id <> v_self
                      OR v_linha.status <> 'enviado') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_linha.documento_id IS NOT NULL THEN
    v_res := public.dp_documento_excluir(
      v_linha.documento_id,
      coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Anexo removido do requisito')
    );
  END IF;

  DELETE FROM public.dp_colaborador_documentos WHERE id = p_id;
  RETURN v_res;
END $$;

-- 8. Catálogo de documentos exigidos ----------------------------------

CREATE OR REPLACE FUNCTION public.dp_documento_requisito_salvar(
  p_id uuid,
  p_dados jsonb,
  p_company_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_req public.dp_documento_requisitos;
  v_company uuid;
  v_id uuid;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_dados, ARRAY[
    'nome','descricao','categoria','obrigatoriedade','aplica_a','tipo_documento',
    'periodicidade','meses_validade','dias_aviso','ordem','permite_multiplos',
    'exige_aceite','satisfeito_por','grupo','responsavel','codigo'
  ]);

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.dp_documento_requisitos WHERE id = p_id FOR UPDATE;
    IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_company := v_req.company_id;
  ELSE
    v_company := p_company_id;
  END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'DOC_EMPRESA_INVALIDA'; END IF;
  IF NOT private.dp_doc_admin(v_company) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_id IS NULL THEN
    IF coalesce(trim(p_dados->>'nome'),'') = '' THEN RAISE EXCEPTION 'DOC_NOME_OBRIGATORIO'; END IF;
    INSERT INTO public.dp_documento_requisitos (
      company_id, codigo, nome, descricao, categoria, obrigatoriedade, aplica_a,
      tipo_documento, periodicidade, meses_validade, dias_aviso, ordem,
      permite_multiplos, exige_aceite, satisfeito_por
    ) VALUES (
      v_company,
      coalesce(nullif(p_dados->>'codigo',''), 'custom_' || extract(epoch from now())::bigint::text),
      trim(p_dados->>'nome'),
      nullif(p_dados->>'descricao',''),
      coalesce(nullif(p_dados->>'categoria',''), 'admissao'),
      coalesce(nullif(p_dados->>'obrigatoriedade',''), 'obrigatorio'),
      coalesce(nullif(p_dados->>'aplica_a',''), 'todos'),
      coalesce(nullif(p_dados->>'tipo_documento','')::public.dp_documento_tipo, 'admissao'),
      coalesce(nullif(p_dados->>'periodicidade',''), 'unica'),
      nullif(p_dados->>'meses_validade','')::integer,
      coalesce(nullif(p_dados->>'dias_aviso','')::integer, 30),
      coalesce(nullif(p_dados->>'ordem','')::integer, 900),
      coalesce(nullif(p_dados->>'permite_multiplos','')::boolean, false),
      coalesce(nullif(p_dados->>'exige_aceite','')::boolean, false),
      nullif(p_dados->>'satisfeito_por','')
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.dp_documento_requisitos SET
    nome = coalesce(nullif(trim(coalesce(p_dados->>'nome','')),''), nome),
    descricao = CASE WHEN p_dados ? 'descricao' THEN nullif(p_dados->>'descricao','') ELSE descricao END,
    categoria = coalesce(nullif(p_dados->>'categoria',''), categoria),
    obrigatoriedade = coalesce(nullif(p_dados->>'obrigatoriedade',''), obrigatoriedade),
    aplica_a = coalesce(nullif(p_dados->>'aplica_a',''), aplica_a),
    tipo_documento = coalesce(nullif(p_dados->>'tipo_documento','')::public.dp_documento_tipo, tipo_documento),
    periodicidade = coalesce(nullif(p_dados->>'periodicidade',''), periodicidade),
    meses_validade = CASE WHEN p_dados ? 'meses_validade'
                          THEN nullif(p_dados->>'meses_validade','')::integer ELSE meses_validade END,
    dias_aviso = coalesce(nullif(p_dados->>'dias_aviso','')::integer, dias_aviso),
    ordem = coalesce(nullif(p_dados->>'ordem','')::integer, ordem),
    permite_multiplos = coalesce(nullif(p_dados->>'permite_multiplos','')::boolean, permite_multiplos),
    exige_aceite = coalesce(nullif(p_dados->>'exige_aceite','')::boolean, exige_aceite),
    satisfeito_por = CASE WHEN p_dados ? 'satisfeito_por'
                          THEN nullif(p_dados->>'satisfeito_por','') ELSE satisfeito_por END,
    updated_at = now()
  WHERE id = p_id;

  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_documento_requisito_excluir(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req public.dp_documento_requisitos;
BEGIN
  SELECT * INTO v_req FROM public.dp_documento_requisitos WHERE id = p_id FOR UPDATE;
  IF v_req.id IS NULL THEN RETURN true; END IF;
  IF NOT private.dp_doc_admin(v_req.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  DELETE FROM public.dp_documento_requisitos WHERE id = p_id;
  RETURN true;
END $$;

-- 9. Histórico das outras origens (atestado, sindicato, disciplinar) ---

CREATE OR REPLACE FUNCTION public.dp_documento_evento_registrar(p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid;
  v_id uuid;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_dados, ARRAY[
    'company_id','documento_id','origem','acao','titulo','tipo','competencia',
    'colaborador_id','colaborador_nome','unidade_id','unidade_nome',
    'arquivo_anterior','arquivo_novo','motivo'
  ]);

  v_company := nullif(p_dados->>'company_id','')::uuid;
  IF NOT private.dp_doc_admin(v_company) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(nullif(p_dados->>'acao',''),'') = '' THEN RAISE EXCEPTION 'DOC_ACAO_OBRIGATORIA'; END IF;
  IF coalesce(nullif(p_dados->>'origem',''),'doc') NOT IN ('doc','sol','sind','disc','dp','sistema') THEN
    RAISE EXCEPTION 'DOC_ORIGEM_INVALIDA';
  END IF;

  INSERT INTO public.dp_documento_eventos (
    company_id, documento_id, origem, acao, titulo, tipo, competencia,
    colaborador_id, colaborador_nome, unidade_id, unidade_nome,
    arquivo_anterior, arquivo_novo, motivo, autor_id
  ) VALUES (
    v_company,
    nullif(p_dados->>'documento_id','')::uuid,
    coalesce(nullif(p_dados->>'origem',''), 'doc'),
    p_dados->>'acao',
    nullif(p_dados->>'titulo',''),
    nullif(p_dados->>'tipo',''),
    nullif(p_dados->>'competencia',''),
    nullif(p_dados->>'colaborador_id','')::uuid,
    nullif(p_dados->>'colaborador_nome',''),
    nullif(p_dados->>'unidade_id','')::uuid,
    nullif(p_dados->>'unidade_nome',''),
    nullif(p_dados->>'arquivo_anterior',''),
    nullif(p_dados->>'arquivo_novo',''),
    nullif(p_dados->>'motivo',''),
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- 10. Permissões das rotinas ------------------------------------------

REVOKE ALL ON FUNCTION private.dp_doc_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_documento_conferir(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_doc_campos_conferir(jsonb, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_doc_evento(public.dp_documentos, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_doc_service_role() FROM PUBLIC;

DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'public.dp_documento_registrar(jsonb)',
    'public.dp_documento_revisar(uuid, text, text)',
    'public.dp_documento_substituir(uuid, jsonb, jsonb, text)',
    'public.dp_documento_excluir(uuid, text)',
    'public.dp_comprovante_anexar(uuid, jsonb, date)',
    'public.dp_comprovante_remover(uuid)',
    'public.dp_comprovante_reassociar(uuid, uuid, text)',
    'public.dp_colaborador_documento_salvar(uuid, jsonb)',
    'public.dp_colaborador_documento_excluir(uuid, text)',
    'public.dp_documento_requisito_salvar(uuid, jsonb, uuid)',
    'public.dp_documento_requisito_excluir(uuid)',
    'public.dp_documento_evento_registrar(jsonb)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- 11. Fecha a gravação direta -----------------------------------------

DROP POLICY IF EXISTS dp_doc_admin_write ON public.dp_documentos;
DROP POLICY IF EXISTS dp_doc_colab_submit ON public.dp_documentos;
DROP POLICY IF EXISTS dp_doc_colab_cancel_pending ON public.dp_documentos;

DROP POLICY IF EXISTS dp_colab_doc_admin_all ON public.dp_colaborador_documentos;
DROP POLICY IF EXISTS dp_colab_doc_self_insert ON public.dp_colaborador_documentos;
DROP POLICY IF EXISTS dp_colab_doc_self_aceite ON public.dp_colaborador_documentos;
CREATE POLICY dp_colab_doc_admin_read ON public.dp_colaborador_documentos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_doc_req_admin_all ON public.dp_documento_requisitos;
CREATE POLICY dp_doc_req_admin_read ON public.dp_documento_requisitos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_doc_eventos_admin_insert ON public.dp_documento_eventos;

REVOKE INSERT, UPDATE, DELETE ON public.dp_documentos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_colaborador_documentos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_documento_requisitos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_documento_eventos FROM authenticated;

REVOKE ALL ON public.dp_documentos FROM anon;
REVOKE ALL ON public.dp_colaborador_documentos FROM anon;
REVOKE ALL ON public.dp_documento_requisitos FROM anon;
REVOKE ALL ON public.dp_documento_eventos FROM anon;

GRANT SELECT ON public.dp_documentos TO authenticated;
GRANT SELECT ON public.dp_colaborador_documentos TO authenticated;
GRANT SELECT ON public.dp_documento_requisitos TO authenticated;
GRANT SELECT ON public.dp_documento_eventos TO authenticated;

GRANT ALL ON public.dp_documentos TO service_role;
GRANT ALL ON public.dp_colaborador_documentos TO service_role;
GRANT ALL ON public.dp_documento_requisitos TO service_role;
GRANT ALL ON public.dp_documento_eventos TO service_role;
