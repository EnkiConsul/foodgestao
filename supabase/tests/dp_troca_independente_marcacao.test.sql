-- Troca entre colegas independe da escolha de folgas pelo portal.
-- Executar inteiro: termina com RAISE 'TESTE_OK' e desfaz tudo.
DO $t$
DECLARE v_uid uuid; v_company uuid; m_proibida text; m_liberada text; m_escopo text;
BEGIN
  SELECT c.user_id, c.company_id INTO v_uid, v_company
    FROM dp_colaboradores c JOIN dp_config_dp d ON d.company_id = c.company_id AND d.unidade_id IS NULL
   WHERE c.user_id IS NOT NULL AND c.ativo AND c.deleted_at IS NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  UPDATE dp_config_dp SET folga_marcacao_portal = false, troca_folga_modo = 'proibida', troca_folga_escopo = 'ambas'
   WHERE company_id = v_company;
  BEGIN PERFORM public.dp_troca_propor(NULL, NULL, NULL, 'x'); EXCEPTION WHEN OTHERS THEN m_proibida := SQLERRM; END;
  IF m_proibida NOT LIKE 'TROCA_PROIBIDA%' THEN RAISE EXCEPTION 'FALHOU proibida: %', m_proibida; END IF;

  UPDATE dp_config_dp SET troca_folga_modo = 'aprovacao_admin' WHERE company_id = v_company;
  BEGIN PERFORM public.dp_troca_propor(NULL, NULL, NULL, 'x'); EXCEPTION WHEN OTHERS THEN m_liberada := SQLERRM; END;
  IF m_liberada LIKE 'TROCA_PROIBIDA%' OR m_liberada LIKE 'FOLGA_PORTAL_BLOQUEADA%' THEN
    RAISE EXCEPTION 'FALHOU escolha desligada bloqueou troca: %', m_liberada;
  END IF;

  UPDATE dp_config_dp SET troca_folga_escopo = 'dominical' WHERE company_id = v_company;
  BEGIN PERFORM public.dp_troca_propor(gen_random_uuid(), DATE '2031-03-03', DATE '2031-03-09', 'x');
  EXCEPTION WHEN OTHERS THEN m_escopo := SQLERRM; END;
  IF m_escopo NOT LIKE 'TROCA_FORA_DO_ESCOPO%' THEN RAISE EXCEPTION 'FALHOU escopo: %', m_escopo; END IF;

  RAISE EXCEPTION 'TESTE_OK';
END $t$;
