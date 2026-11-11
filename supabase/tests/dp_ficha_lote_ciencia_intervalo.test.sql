-- Ciência única do lote para intervalo reduzido: autor/data do servidor e validação.
-- Executar inteiro: termina com RAISE 'TESTE_OK' e desfaz tudo (lote fictício).
DO $t$
DECLARE v_uid uuid; v_company uuid; v_imp uuid := gen_random_uuid(); v_org jsonb; m_curta text; m_sem text;
BEGIN
  SELECT c.user_id, c.id INTO v_uid, v_company
    FROM companies c WHERE c.user_id IS NOT NULL AND c.name NOT ILIKE '%rancho%' LIMIT 1;
  INSERT INTO dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status, organizacao)
  VALUES (v_imp, v_company, 'teste/ficticio.pdf', 'ficticio.pdf', 'ready', '{"padroes":{"regime":"clt"}}'::jsonb);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  BEGIN PERFORM public.dp_ficha_lote_ajustar(v_imp, '{"intervalo_reduzido_ciencia":{"justificativa":"curta","ciente":true}}');
  EXCEPTION WHEN OTHERS THEN m_curta := SQLERRM; END;
  IF m_curta NOT LIKE 'AJUSTE_INVALIDO%' THEN RAISE EXCEPTION 'FALHOU justificativa curta: %', m_curta; END IF;

  BEGIN PERFORM public.dp_ficha_lote_ajustar(v_imp, '{"intervalo_reduzido_ciencia":{"justificativa":"Previsto na convenção coletiva"}}');
  EXCEPTION WHEN OTHERS THEN m_sem := SQLERRM; END;
  IF m_sem NOT LIKE 'AJUSTE_INVALIDO%' THEN RAISE EXCEPTION 'FALHOU sem ciente: %', m_sem; END IF;

  v_org := public.dp_ficha_lote_ajustar(v_imp,
    '{"intervalo_reduzido_ciencia":{"justificativa":"Previsto na convenção coletiva","ciente":true,"por":"00000000-0000-0000-0000-000000000000"}}');
  IF (v_org #>> '{padroes,intervalo_reduzido_ciencia,por}')::uuid IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FALHOU autor deveria vir da sessão: %', v_org;
  END IF;
  IF v_org #>> '{padroes,regime}' IS DISTINCT FROM 'clt' THEN RAISE EXCEPTION 'FALHOU perdeu padrão: %', v_org; END IF;

  v_org := public.dp_ficha_lote_ajustar(v_imp, '{"intervalo_reduzido_ciencia":null}');
  IF jsonb_typeof(v_org #> '{padroes,intervalo_reduzido_ciencia}') <> 'null' THEN RAISE EXCEPTION 'FALHOU desfazer: %', v_org; END IF;

  RAISE EXCEPTION 'TESTE_OK';
END $t$;
