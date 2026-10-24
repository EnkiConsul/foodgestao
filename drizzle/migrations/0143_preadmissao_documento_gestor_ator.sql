CREATE OR REPLACE FUNCTION public.dp_preadmissao_documento_registrar_gestor(
  p_preadmissao_id uuid, p_requisito_codigo text, p_pessoa_id uuid, p_file_path text,
  p_file_name text, p_mime_type text, p_file_size bigint, p_parte smallint,
  p_parte_rotulo text, p_ator uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pa record; v_versao int; v_id uuid; v_parte smallint := COALESCE(p_parte, 1);
BEGIN
  IF v_parte < 1 OR v_parte > 10 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'parte_invalida'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); END IF;
  IF p_pessoa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dp_preadmissao_pessoas
     WHERE id = p_pessoa_id AND preadmissao_id = pa.id AND removido_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'titular_invalido');
  END IF;
  UPDATE public.dp_preadmissao_documentos SET substituido_em = now()
   WHERE preadmissao_id = pa.id AND requisito_codigo = p_requisito_codigo
     AND COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND parte = v_parte AND substituido_em IS NULL;
  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_versao FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = p_requisito_codigo AND parte = v_parte;
  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name, mime_type, file_size, versao, parte, parte_rotulo, status)
  VALUES (pa.id, pa.company_id, p_pessoa_id, p_requisito_codigo, p_file_path, p_file_name, p_mime_type, p_file_size, v_versao,
          v_parte, NULLIF(btrim(COALESCE(p_parte_rotulo, '')), ''), 'aprovado')
  RETURNING id INTO v_id;
  UPDATE public.dp_preadmissoes SET versao = versao + 1, updated_at = now() WHERE id = pa.id;
  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'documento_ajustado_gestor',
          jsonb_build_object('codigo', p_requisito_codigo, 'versao', v_versao, 'parte', v_parte, 'motivo', p_motivo), p_ator);
  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'versao', v_versao, 'parte', v_parte);
END $$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_documento_registrar_gestor(uuid,text,uuid,text,text,text,bigint,smallint,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_documento_registrar_gestor(uuid,text,uuid,text,text,text,bigint,smallint,text,uuid,text) TO service_role;