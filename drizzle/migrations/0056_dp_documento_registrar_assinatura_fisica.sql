CREATE OR REPLACE FUNCTION public.dp_documento_registrar(p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_colab uuid;
  v_unidade uuid;
  v_path text;
  v_admin boolean;
  v_self uuid;
  v_id uuid;
  v_doc public.dp_documentos;
  v_fisica boolean;
BEGIN
  IF auth.uid() IS NULL AND NOT private.dp_doc_service_role() THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  PERFORM private.dp_doc_campos_conferir(p_dados, ARRAY[
    'company_id','colaborador_id','unidade_id','tipo','titulo','descricao',
    'file_path','file_name','file_size','mime_type','referencia_data',
    'ferias_gozo_id','rescisao_grupo_id','exige_aceite','assinatura_fisica'
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

  -- Só o gestor pode marcar via física (assinatura à mão).
  v_fisica := v_admin AND coalesce(nullif(p_dados->>'assinatura_fisica','')::boolean, false);

  PERFORM private.dp_documento_conferir(v_company, v_colab, v_unidade, v_path);

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_documento:' || v_company::text || ':' || v_path, 0));

  SELECT id INTO v_id FROM public.dp_documentos
   WHERE company_id = v_company AND file_path = v_path LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.dp_documentos (
    company_id, colaborador_id, unidade_id, tipo, titulo, descricao,
    file_path, file_name, file_size, mime_type, referencia_data,
    ferias_gozo_id, rescisao_grupo_id, exige_aceite, assinatura_fisica, uploaded_by,
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
    CASE WHEN v_fisica THEN false ELSE coalesce(nullif(p_dados->>'exige_aceite','')::boolean, true) END,
    v_fisica,
    auth.uid(),
    NOT v_admin,
    CASE WHEN v_admin THEN 'aprovado'::public.dp_documento_aprovacao_status
         ELSE 'pendente'::public.dp_documento_aprovacao_status END,
    CASE WHEN v_admin THEN auth.uid() ELSE NULL END,
    CASE WHEN v_admin THEN now() ELSE NULL END
  ) RETURNING * INTO v_doc;

  PERFORM private.dp_doc_evento(v_doc, 'document_created', NULL, NULL, v_path);
  RETURN v_doc.id;
END $function$;