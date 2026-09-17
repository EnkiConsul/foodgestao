CREATE OR REPLACE FUNCTION public.dp_preadmissao_documento_registrar(
  p_preadmissao_id uuid, p_requisito_codigo text, p_pessoa_id uuid,
  p_file_path text, p_file_name text, p_mime_type text, p_file_size bigint,
  p_parte smallint DEFAULT 1, p_parte_rotulo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  pa record;
  v_versao int;
  v_id uuid;
  v_parte smallint := COALESCE(p_parte, 1);
BEGIN
  IF v_parte < 1 OR v_parte > 10 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'parte_invalida');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.status NOT IN ('aguardando_preenchimento', 'em_preenchimento', 'correcao_solicitada', 'aguardando_nova_versao') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_encerrada', 'status', pa.status);
  END IF;
  IF p_pessoa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_preadmissao_pessoas
    WHERE id = p_pessoa_id AND preadmissao_id = pa.id AND company_id = pa.company_id
      AND removido_em IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'titular_invalido');
  END IF;

  -- Substitui apenas a MESMA parte: frente não derruba verso.
  UPDATE public.dp_preadmissao_documentos
     SET substituido_em = now()
   WHERE preadmissao_id = pa.id
     AND requisito_codigo = p_requisito_codigo
     AND COALESCE(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND parte = v_parte
     AND substituido_em IS NULL;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_versao
    FROM public.dp_preadmissao_documentos
   WHERE preadmissao_id = pa.id AND requisito_codigo = p_requisito_codigo AND parte = v_parte;

  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name, mime_type, file_size, versao, parte, parte_rotulo)
  VALUES (pa.id, pa.company_id, p_pessoa_id, p_requisito_codigo, p_file_path, p_file_name, p_mime_type, p_file_size, v_versao,
          v_parte, NULLIF(btrim(COALESCE(p_parte_rotulo, '')), ''))
  RETURNING id INTO v_id;

  UPDATE public.dp_preadmissoes SET versao = versao + 1, updated_at = now() WHERE id = pa.id;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe)
  VALUES (pa.id, pa.company_id, 'documento_enviado',
          jsonb_build_object('codigo', p_requisito_codigo, 'versao', v_versao, 'parte', v_parte));

  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'versao', v_versao, 'parte', v_parte,
    'ficha_versao', (SELECT versao FROM public.dp_preadmissoes WHERE id = pa.id));
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint, smallint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint, smallint, text) TO service_role;
DROP FUNCTION IF EXISTS public.dp_preadmissao_documento_registrar(uuid, text, uuid, text, text, text, bigint);