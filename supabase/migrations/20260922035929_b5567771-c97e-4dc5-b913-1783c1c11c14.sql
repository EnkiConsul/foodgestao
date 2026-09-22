CREATE OR REPLACE FUNCTION private.dp_portal_acesso_revogar_core(_colaborador_id uuid, _motivo text, _actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_colab record;
  v_links integer := 0;
  v_sessoes_antes timestamptz;
  v_agora timestamptz := now();
BEGIN
  SELECT id, user_id, company_id INTO v_colab
    FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_colab.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cadastro_nao_encontrado');
  END IF;
  IF v_colab.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'sem_acesso', true, 'links_invalidados', 0);
  END IF;

  -- Uma revogação por usuário de cada vez (chave única de 64 bits).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('dp_portal_acesso_revogar:' || v_colab.user_id::text, 0));

  SELECT sessions_revoked_at INTO v_sessoes_antes
    FROM public.auth_user_security_state WHERE user_id = v_colab.user_id;

  WITH alvo AS (
    UPDATE public.dp_portal_access_tokens
       SET consumed_at = v_agora,
           claimed_at = NULL,
           claim_expires_at = NULL
     WHERE user_id = v_colab.user_id
       AND consumed_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::int INTO v_links FROM alvo;

  INSERT INTO public.auth_user_security_state (user_id, must_change_password, sessions_revoked_at)
  VALUES (v_colab.user_id, false, v_agora)
  ON CONFLICT (user_id) DO UPDATE SET sessions_revoked_at = v_agora;

  IF v_links > 0 OR v_sessoes_antes IS NULL OR v_sessoes_antes < v_agora - interval '5 seconds' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, metadata)
    VALUES (_actor, 'portal_access_revoked', 'dp_portal_acesso', v_colab.user_id,
            jsonb_build_object(
              'colaborador_id', v_colab.id,
              'company_id', v_colab.company_id,
              'target_user_id', v_colab.user_id,
              'motivo', COALESCE(NULLIF(btrim(COALESCE(_motivo, '')), ''), 'revogacao'),
              'links_invalidados', v_links));
  ELSE
    RETURN jsonb_build_object('ok', true, 'ja_revogado', true, 'links_invalidados', 0,
                              'user_id', v_colab.user_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'links_invalidados', v_links,
                            'user_id', v_colab.user_id, 'revogado_em', v_agora);
END;
$function$;

-- ROLLBACK: restaurar a versão anterior desta função.