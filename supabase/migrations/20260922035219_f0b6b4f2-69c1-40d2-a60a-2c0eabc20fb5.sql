-- =====================================================================
-- FASE 3 — Revogação de acesso no Portal do Colaborador
-- Nada é apagado: links pendentes são marcados como usados e o histórico
-- de auditoria é preservado.
-- =====================================================================

-- 1) Situação central do acesso (fonte única) ------------------------------
CREATE OR REPLACE FUNCTION private.dp_acesso_situacao(_colaborador_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN c.id IS NULL THEN 'cadastro_nao_encontrado'
    WHEN c.deleted_at IS NOT NULL THEN 'cadastro_removido'
    WHEN co.is_active IS NOT TRUE
      OR lower(COALESCE(co.status_tenant, '')) IN
         ('suspenso','suspended','cancelado','canceled','bloqueado','blocked',
          'expirado','expired','inativo','inactive') THEN 'empresa_inativa'
    WHEN c.user_id IS NOT NULL
      AND COALESCE((SELECT s.access_blocked FROM public.auth_user_security_state s
                     WHERE s.user_id = c.user_id), false) THEN 'bloqueado'
    WHEN c.ativo IS NOT TRUE THEN 'vinculo_encerrado'
    ELSE 'ok'
  END
  FROM public.dp_colaboradores c
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.id = _colaborador_id
  UNION ALL
  SELECT 'cadastro_nao_encontrado'
  WHERE NOT EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = _colaborador_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.dp_portal_acesso_situacao(p_colaborador_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_service boolean;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RETURN 'cadastro_nao_encontrado'; END IF;

  v_service := COALESCE(current_setting('request.jwt.claim.role', true) = 'service_role', false)
               OR COALESCE(auth.role() = 'service_role', false);

  IF NOT (
    v_service
    OR private.is_company_admin_or_owner(auth.uid(), v_company)
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'ACESSO_SEM_PERMISSAO';
  END IF;

  RETURN private.dp_acesso_situacao(p_colaborador_id);
END;
$$;

-- 2) Encerramento do acesso (links + sessões + auditoria) ------------------
CREATE OR REPLACE FUNCTION private.dp_portal_acesso_revogar_core(
  _colaborador_id uuid,
  _motivo text,
  _actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Uma revogação por usuário de cada vez.
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_portal_acesso_revogar', 0),
                                hashtextextended(v_colab.user_id::text, 0));

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
$$;

CREATE OR REPLACE FUNCTION public.dp_portal_acesso_revogar(
  p_colaborador_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_service boolean;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'ACESSO_CADASTRO_NAO_ENCONTRADO'; END IF;

  v_service := COALESCE(current_setting('request.jwt.claim.role', true) = 'service_role', false)
               OR COALESCE(auth.role() = 'service_role', false);

  IF NOT (v_service OR private.is_company_admin_or_owner(auth.uid(), v_company)) THEN
    RAISE EXCEPTION 'ACESSO_SEM_PERMISSAO';
  END IF;

  RETURN private.dp_portal_acesso_revogar_core(p_colaborador_id, p_motivo, auth.uid());
END;
$$;

-- 3) Encerramento automático quando o vínculo termina ----------------------
CREATE OR REPLACE FUNCTION public.dp_colaborador_revogar_acesso_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_motivo := 'cadastro_removido';
  ELSIF NEW.ativo IS NOT TRUE AND OLD.ativo IS TRUE THEN
    v_motivo := 'vinculo_encerrado';
  ELSIF NEW.data_desligamento IS NOT NULL AND OLD.data_desligamento IS NULL THEN
    v_motivo := 'desligamento_registrado';
  END IF;

  IF v_motivo IS NULL THEN RETURN NEW; END IF;

  PERFORM private.dp_portal_acesso_revogar_core(NEW.id, v_motivo, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_colaborador_revogar_acesso ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_colaborador_revogar_acesso
AFTER UPDATE OF ativo, data_desligamento, deleted_at ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colaborador_revogar_acesso_trg();

-- 4) Ocorrência de ponto exige vínculo ativo -------------------------------
-- Nos 30 dias após o desligamento o portal é somente consulta/download de
-- documentos: o registro de ocorrência deixa de aceitar quem está no prazo.
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_registrar(_colaborador_id uuid, _data date, _tipo dp_ocorrencia_tipo, _justificativa text DEFAULT NULL::text, _horario_estimado time without time zone DEFAULT NULL::time without time zone, _horario_real time without time zone DEFAULT NULL::time without time zone, _marcacao_alvo dp_ocorrencia_marcacao DEFAULT NULL::dp_ocorrencia_marcacao, _estado dp_ocorrencia_estado DEFAULT NULL::dp_ocorrencia_estado, _documento_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid; v_is_gestor boolean; v_self uuid;
  v_prazo smallint; v_prev record; v_cfg record;
  v_estado public.dp_ocorrencia_estado; v_previsto time; v_minutos integer;
  v_existente uuid; v_id uuid; v_antec integer;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_COLABORADOR_NAO_ENCONTRADO'; END IF;

  -- Somente vínculo ativo pode registrar por conta própria.
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  v_is_gestor := private.is_company_admin_or_owner(auth.uid(), v_company);
  IF NOT v_is_gestor AND v_self IS DISTINCT FROM _colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;

  SELECT prazo_retroativo_dias INTO v_prazo FROM public.dp_ocorrencia_config(v_company);
  IF NOT v_is_gestor AND _data < (CURRENT_DATE - v_prazo) THEN
    RAISE EXCEPTION 'OCORRENCIA_PRAZO_RETROATIVO';
  END IF;

  SELECT * INTO v_prev FROM public.dp_ocorrencia_previsto(_colaborador_id, _data);
  SELECT * INTO v_cfg FROM public.dp_ocorrencia_tipo_config
   WHERE company_id = v_company AND tipo = _tipo;

  v_previsto := CASE
    WHEN _tipo IN ('atraso','previsao_atraso') THEN v_prev.entrada
    WHEN _tipo IN ('saida_antecipada','previsao_saida_antecipada') THEN v_prev.saida
    ELSE NULL END;

  v_estado := COALESCE(_estado, CASE
    WHEN _tipo IN ('previsao_falta','previsao_atraso','previsao_saida_antecipada','previsao_atraso_intervalo')
      THEN 'aguardando_confirmacao'::public.dp_ocorrencia_estado
    ELSE 'informada'::public.dp_ocorrencia_estado END);

  IF _horario_real IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_real - v_previsto)) / 60)::int;
  ELSIF _horario_estimado IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_estimado - v_previsto)) / 60)::int;
  END IF;

  IF v_previsto IS NOT NULL THEN
    v_antec := GREATEST(0, (EXTRACT(EPOCH FROM ((_data + v_previsto) - now()::timestamp)) / 60)::int);
  END IF;

  SELECT id INTO v_existente FROM public.dp_ocorrencias
   WHERE colaborador_id = _colaborador_id AND data_operacional = _data
     AND estado <> 'cancelada'
     AND COALESCE(marcacao_alvo::text,'') = COALESCE(_marcacao_alvo::text,'')
     AND tipo IN (_tipo,
        CASE _tipo
          WHEN 'atraso' THEN 'previsao_atraso'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
          WHEN 'falta' THEN 'previsao_falta'::public.dp_ocorrencia_tipo
          WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
          WHEN 'saida_antecipada' THEN 'previsao_saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'atraso_intervalo' THEN 'previsao_atraso_intervalo'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
          ELSE _tipo END)
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_DUPLICADA:%', v_existente;
  END IF;

  INSERT INTO public.dp_ocorrencias (
    company_id, colaborador_id, unidade_id, setor_id, data_operacional, tipo, estado, origem,
    previsto_entrada, previsto_saida, horario_previsto, horario_estimado, horario_real, minutos,
    justificativa_inicial, impacta_assiduidade, impacta_ferias, relevancia_operacional,
    tratativa_ponto, tratativa_status, marcacao_alvo, documento_id,
    antecedencia_minutos, criado_por
  ) VALUES (
    v_company, _colaborador_id, v_prev.unidade_id, v_prev.setor_id, _data, _tipo, v_estado,
    CASE WHEN v_self IS NOT DISTINCT FROM _colaborador_id THEN 'colaborador'::public.dp_ocorrencia_origem
         ELSE 'gestor'::public.dp_ocorrencia_origem END,
    v_prev.entrada, v_prev.saida, v_previsto, _horario_estimado, _horario_real, v_minutos,
    NULLIF(btrim(COALESCE(_justificativa,'')),''),
    COALESCE(v_cfg.impacta_assiduidade,'aguardando'), COALESCE(v_cfg.impacta_ferias,'aguardando'),
    COALESCE(v_cfg.relevancia_operacional,true),
    COALESCE(v_cfg.exige_tratativa_ponto,false),
    CASE WHEN COALESCE(v_cfg.exige_tratativa_ponto,false) THEN 'pendente'::public.dp_ocorrencia_tratativa_status
         ELSE 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status END,
    _marcacao_alvo, _documento_id, v_antec, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, metadata, autor_id)
  VALUES (v_company, v_id, 'ocorrencia_criada', _tipo::text,
          jsonb_build_object('estado', v_estado, 'data_operacional', _data), auth.uid());

  RETURN v_id;
END;
$function$;

-- 5) Menor privilégio ------------------------------------------------------
REVOKE ALL ON FUNCTION public.dp_portal_acesso_situacao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_portal_acesso_revogar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_acesso_situacao(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_portal_acesso_revogar(uuid, text) TO authenticated, service_role;

-- =====================================================================
-- ROLLBACK (executar somente se for preciso desfazer esta fase)
-- DROP TRIGGER IF EXISTS trg_dp_colaborador_revogar_acesso ON public.dp_colaboradores;
-- DROP FUNCTION IF EXISTS public.dp_colaborador_revogar_acesso_trg();
-- DROP FUNCTION IF EXISTS public.dp_portal_acesso_revogar(uuid, text);
-- DROP FUNCTION IF EXISTS private.dp_portal_acesso_revogar_core(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.dp_portal_acesso_situacao(uuid);
-- DROP FUNCTION IF EXISTS private.dp_acesso_situacao(uuid);
-- (dp_ocorrencia_registrar: restaurar a versão anterior trocando
--  dp_colaborador_ativo_of por dp_colaborador_of)
-- =====================================================================