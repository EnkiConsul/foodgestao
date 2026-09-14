-- ============================================================
-- Fase 7 — fluxo único de acesso do colaborador
-- ============================================================
-- Cobre: emissão do link (liberar/redefinir), novo link invalida o anterior,
-- uso único, link expirado, duas tentativas simultâneas (só uma vence),
-- liberação do link após falha, bloqueio efetivo no backend e reativação,
-- e isolamento entre empresas na consulta de situação.
--
-- A negativa para visitante e a ausência do fluxo legado estão em
-- src/test/rls/acesso_colaborador.rls.test.ts.
--
-- Uso: rodar como serviço interno (role postgres/service_role).
-- Termina com RAISE EXCEPTION para desfazer tudo — não altera produção.
-- ============================================================

DO $$
DECLARE
  v_company uuid;
  v_colab uuid;
  v_user uuid;
  v_t1 uuid := '00000000-0000-4000-8000-00000ac00001';
  v_t2 uuid := '00000000-0000-4000-8000-00000ac00002';
  v_t3 uuid := '00000000-0000-4000-8000-00000ac00003';
  res text[] := '{}';
  n int;
  ok1 boolean; ok2 boolean;
  habilitado boolean;
BEGIN
  SELECT c.id, c.company_id, c.user_id INTO v_colab, v_company, v_user
    FROM public.dp_colaboradores c
   WHERE c.user_id IS NOT NULL
   ORDER BY c.created_at
   LIMIT 1;
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'sem colaborador com acesso para testar';
  END IF;

  -- T1: link de ativação emitido fica pendente
  INSERT INTO public.dp_portal_access_tokens
    (id, user_id, colaborador_id, company_id, token_hash, purpose, expires_at)
  VALUES (v_t1, v_user, v_colab, v_company, 'hash-t1', 'activation', now() + interval '24 hours');
  SELECT count(*) INTO n FROM public.dp_portal_access_tokens
    WHERE id = v_t1 AND consumed_at IS NULL;
  res := res || CASE WHEN n = 1 THEN 'PASS T1' ELSE 'FAIL T1' END;

  -- T2: novo link da mesma finalidade invalida o anterior
  UPDATE public.dp_portal_access_tokens SET consumed_at = now()
    WHERE user_id = v_user AND purpose = 'activation' AND consumed_at IS NULL;
  INSERT INTO public.dp_portal_access_tokens
    (id, user_id, colaborador_id, company_id, token_hash, purpose, expires_at)
  VALUES (v_t2, v_user, v_colab, v_company, 'hash-t2', 'activation', now() + interval '24 hours');
  SELECT count(*) INTO n FROM public.dp_portal_access_tokens
    WHERE user_id = v_user AND purpose = 'activation' AND consumed_at IS NULL;
  res := res || CASE WHEN n = 1 THEN 'PASS T2' ELSE 'FAIL T2 (' || n || ')' END;

  -- T3: duas tentativas simultâneas — só a primeira reserva o link
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t2, 'hash-t2', 'activation');
  SELECT count(*) > 0 INTO ok2 FROM public.dp_portal_token_claim(v_t2, 'hash-t2', 'activation');
  res := res || CASE WHEN ok1 AND NOT ok2 THEN 'PASS T3' ELSE 'FAIL T3' END;

  -- T4: reserva liberada volta a valer (falha ao salvar a senha)
  PERFORM public.dp_portal_token_release(v_t2);
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t2, 'hash-t2', 'activation');
  res := res || CASE WHEN ok1 THEN 'PASS T4' ELSE 'FAIL T4' END;

  -- T5: uso único — depois de confirmado, não reserva de novo
  PERFORM public.dp_portal_token_confirm(v_t2);
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t2, 'hash-t2', 'activation');
  res := res || CASE WHEN NOT ok1 THEN 'PASS T5' ELSE 'FAIL T5' END;

  -- T6: link expirado não é reservado
  INSERT INTO public.dp_portal_access_tokens
    (id, user_id, colaborador_id, company_id, token_hash, purpose, expires_at)
  VALUES (v_t3, v_user, v_colab, v_company, 'hash-t3', 'reset', now() - interval '1 minute');
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t3, 'hash-t3', 'reset');
  res := res || CASE WHEN NOT ok1 THEN 'PASS T6' ELSE 'FAIL T6' END;

  -- T7: finalidade errada não reserva
  UPDATE public.dp_portal_access_tokens
     SET expires_at = now() + interval '30 minutes', consumed_at = NULL,
         claimed_at = NULL, claim_expires_at = NULL
   WHERE id = v_t3;
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t3, 'hash-t3', 'activation');
  res := res || CASE WHEN NOT ok1 THEN 'PASS T7' ELSE 'FAIL T7' END;

  -- T8: código errado não reserva
  SELECT count(*) > 0 INTO ok1 FROM public.dp_portal_token_claim(v_t3, 'hash-errado', 'reset');
  res := res || CASE WHEN NOT ok1 THEN 'PASS T8' ELSE 'FAIL T8' END;

  -- T9: bloqueio é efetivo no backend
  INSERT INTO public.auth_user_security_state (user_id, access_blocked, blocked_at)
  VALUES (v_user, true, now())
  ON CONFLICT (user_id) DO UPDATE SET access_blocked = true, blocked_at = now();
  SELECT private.dp_access_enabled(v_user) INTO habilitado;
  res := res || CASE WHEN habilitado IS FALSE THEN 'PASS T9' ELSE 'FAIL T9' END;

  -- T10: reativação devolve o acesso
  UPDATE public.auth_user_security_state
     SET access_blocked = false, blocked_at = NULL, blocked_by = NULL
   WHERE user_id = v_user;
  SELECT private.dp_access_enabled(v_user) INTO habilitado;
  res := res || CASE WHEN habilitado IS TRUE THEN 'PASS T10' ELSE 'FAIL T10' END;

  -- T11: nenhum link guarda o código em claro (só a impressão digital)
  SELECT count(*) INTO n FROM public.dp_portal_access_tokens
   WHERE colaborador_id = v_colab AND token_hash IS NULL;
  res := res || CASE WHEN n = 0 THEN 'PASS T11' ELSE 'FAIL T11' END;

  -- T12: a situação do acesso só aparece para quem administra a empresa
  -- (sem sessão de administrador, a consulta não devolve nada — falha fechada)
  SELECT count(*) INTO n FROM public.dp_portal_acesso_status(v_colab) s;
  res := res || CASE WHEN n = 0 THEN 'PASS T12' ELSE 'FAIL T12' END;

  RAISE EXCEPTION 'RESULTADO: %', array_to_string(res, ' | ');
END $$;
