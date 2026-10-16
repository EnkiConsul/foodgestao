CREATE OR REPLACE FUNCTION public.dp_ata_salvar(
  p_ata_id uuid,
  p_company_id uuid,
  p_dados jsonb,
  p_participantes jsonb,
  p_versao timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ata record;
  v_company uuid;
  v_id uuid;
  v_unidade uuid;
  v_p jsonb;
  v_pid uuid;
  v_colab uuid;
  v_mod text;
  v_ex record;
  v_mantidos uuid[] := '{}';
  v_versao timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  IF p_participantes IS NULL OR jsonb_typeof(p_participantes) <> 'array' THEN RAISE EXCEPTION 'DADOS_INVALIDOS'; END IF;

  IF p_ata_id IS NOT NULL THEN
    SELECT id, company_id, status, updated_at INTO v_ata FROM public.dp_atas WHERE id = p_ata_id FOR UPDATE;
    IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ATA_NAO_ENCONTRADA'; END IF;
    v_company := v_ata.company_id;
    IF p_company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'EMPRESA_DIVERGENTE' USING ERRCODE = '42501'; END IF;
    IF NOT public.tem_permissao(v_company, 'dp.documentos', 'alteracao') THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501'; END IF;
    IF v_ata.status <> 'rascunho' THEN RAISE EXCEPTION 'ATA_ENVIADA'; END IF;
    IF p_versao IS NOT NULL AND v_ata.updated_at <> p_versao THEN RAISE EXCEPTION 'CONFLITO_EDICAO'; END IF;
  ELSE
    v_company := p_company_id;
    IF v_company IS NULL OR NOT public.tem_permissao(v_company, 'dp.documentos', 'inclusao') THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501'; END IF;
  END IF;

  v_unidade := nullif(p_dados->>'unidade_id', '')::uuid;
  IF v_unidade IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_unidades WHERE id = v_unidade AND company_id = v_company) THEN
    RAISE EXCEPTION 'EMPRESA_DIVERGENTE' USING ERRCODE = '42501';
  END IF;

  IF p_ata_id IS NOT NULL THEN
    UPDATE public.dp_atas SET
      titulo = trim(p_dados->>'titulo'), data_reuniao = (p_dados->>'data_reuniao')::date,
      local = nullif(trim(coalesce(p_dados->>'local','')), ''), unidade_id = v_unidade,
      conteudo_html = coalesce(p_dados->>'conteudo_html',''),
      anexos = coalesce(p_dados->'anexos','[]'), materiais_apoio = coalesce(p_dados->'materiais_apoio','[]'),
      condutores = coalesce(p_dados->'condutores','[]'), publicar_mural = coalesce((p_dados->>'publicar_mural')::boolean, false)
    WHERE id = p_ata_id;
    v_id := p_ata_id;
  ELSE
    INSERT INTO public.dp_atas (company_id, titulo, data_reuniao, local, unidade_id, conteudo_html, anexos, materiais_apoio, condutores, publicar_mural, created_by)
    VALUES (v_company, trim(p_dados->>'titulo'), (p_dados->>'data_reuniao')::date, nullif(trim(coalesce(p_dados->>'local','')), ''), v_unidade,
      coalesce(p_dados->>'conteudo_html',''), coalesce(p_dados->'anexos','[]'), coalesce(p_dados->'materiais_apoio','[]'),
      coalesce(p_dados->'condutores','[]'), coalesce((p_dados->>'publicar_mural')::boolean, false), v_uid)
    RETURNING id INTO v_id;
  END IF;

  FOR v_p IN SELECT * FROM jsonb_array_elements(p_participantes) LOOP
    v_pid := nullif(v_p->>'id','')::uuid;
    v_colab := nullif(v_p->>'colaborador_id','')::uuid;
    v_mod := coalesce(v_p->>'modalidade','presente');
    IF v_colab IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_colaboradores WHERE id = v_colab AND company_id = v_company) THEN
      RAISE EXCEPTION 'EMPRESA_DIVERGENTE' USING ERRCODE = '42501';
    END IF;
    v_ex := NULL;
    IF v_pid IS NOT NULL THEN
      SELECT * INTO v_ex FROM public.dp_ata_participantes WHERE id = v_pid AND ata_id = v_id;
      IF v_ex.id IS NULL THEN RAISE EXCEPTION 'PARTICIPANTE_INVALIDO'; END IF;
    ELSIF v_colab IS NOT NULL THEN
      SELECT * INTO v_ex FROM public.dp_ata_participantes WHERE ata_id = v_id AND colaborador_id = v_colab;
    END IF;

    IF v_ex.id IS NOT NULL THEN
      IF v_ex.assinado_em IS NOT NULL OR v_ex.documento_id IS NOT NULL THEN
        -- protegido: mantém intacto
        NULL;
      ELSE
        UPDATE public.dp_ata_participantes SET
          colaborador_id = v_colab, modalidade = v_mod,
          avulso_nome = CASE WHEN v_colab IS NULL THEN v_p->>'avulso_nome' END,
          avulso_cpf = CASE WHEN v_colab IS NULL THEN v_p->>'avulso_cpf' END,
          avulso_whatsapp = CASE WHEN v_colab IS NULL THEN v_p->>'avulso_whatsapp' END
        WHERE id = v_ex.id
          AND (colaborador_id IS DISTINCT FROM v_colab OR modalidade IS DISTINCT FROM v_mod
            OR avulso_nome IS DISTINCT FROM CASE WHEN v_colab IS NULL THEN v_p->>'avulso_nome' END
            OR avulso_cpf IS DISTINCT FROM CASE WHEN v_colab IS NULL THEN v_p->>'avulso_cpf' END
            OR avulso_whatsapp IS DISTINCT FROM CASE WHEN v_colab IS NULL THEN v_p->>'avulso_whatsapp' END);
      END IF;
      v_mantidos := v_mantidos || v_ex.id;
    ELSE
      INSERT INTO public.dp_ata_participantes (ata_id, company_id, colaborador_id, modalidade, avulso_nome, avulso_cpf, avulso_whatsapp)
      VALUES (v_id, v_company, v_colab, v_mod,
        CASE WHEN v_colab IS NULL THEN v_p->>'avulso_nome' END,
        CASE WHEN v_colab IS NULL THEN v_p->>'avulso_cpf' END,
        CASE WHEN v_colab IS NULL THEN v_p->>'avulso_whatsapp' END)
      RETURNING id INTO v_pid;
      v_mantidos := v_mantidos || v_pid;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.dp_ata_participantes WHERE ata_id = v_id AND NOT (id = ANY(v_mantidos))
             AND (assinado_em IS NOT NULL OR documento_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'PARTICIPANTE_PROTEGIDO';
  END IF;
  DELETE FROM public.dp_ata_participantes WHERE ata_id = v_id AND NOT (id = ANY(v_mantidos));

  SELECT updated_at INTO v_versao FROM public.dp_atas WHERE id = v_id;
  RETURN jsonb_build_object('id', v_id, 'updated_at', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ata_salvar(uuid, uuid, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ata_salvar(uuid, uuid, jsonb, jsonb, timestamptz) TO authenticated, service_role;