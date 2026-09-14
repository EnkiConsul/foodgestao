-- Fase 8: decisão central de acesso ao Portal do Colaborador
CREATE OR REPLACE FUNCTION private.dp_portal_decisao(_user_id uuid)
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_col record;
  v_n int;
  v_hoje date;
  v_sub record;
  v_mod record;
  v_estado text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN QUERY SELECT 'sem_vinculo'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  IF NOT private.dp_access_enabled(_user_id) THEN
    RETURN QUERY SELECT 'bloqueado'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.dp_colaboradores c
  WHERE c.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.id = c.company_id AND co.user_id = _user_id)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.company_id AND m.user_id = _user_id AND m.role IN ('owner','admin'));

  IF v_n <> 1 THEN
    RETURN QUERY SELECT 'sem_vinculo'::text, NULL::uuid, NULL::uuid, NULL::date;
    RETURN;
  END IF;

  SELECT c.id, c.company_id, c.ativo, c.acesso_portal_ate,
         co.user_id AS owner_id, co.is_active, co.status_tenant,
         (now() AT TIME ZONE COALESCE(NULLIF(co.timezone, ''), 'America/Sao_Paulo'))::date AS hoje
    INTO v_col
  FROM public.dp_colaboradores c
  JOIN public.companies co ON co.id = c.company_id
  WHERE c.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.companies co2 WHERE co2.id = c.company_id AND co2.user_id = _user_id)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.company_id AND m.user_id = _user_id AND m.role IN ('owner','admin'));

  v_hoje := v_col.hoje;

  -- empresa desativada ou suspensa
  IF v_col.is_active IS NOT TRUE
     OR lower(COALESCE(v_col.status_tenant, '')) IN ('suspenso','suspended','cancelado','canceled','bloqueado','blocked','expirado','expired','inativo','inactive') THEN
    RETURN QUERY SELECT 'empresa_inativa'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- assinatura do titular da empresa
  SELECT s.status::text AS status, s.trial_ends_at INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = v_col.owner_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.status IS NOT NULL
     AND (v_sub.status IN ('expired','canceled')
          OR (v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now())) THEN
    RETURN QUERY SELECT 'sem_plano'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  -- módulo Pessoas (dp) explicitamente desativado
  SELECT m.status::text AS status, m.trial_termina_em, m.ends_at INTO v_mod
  FROM public.company_modules m
  WHERE m.company_id = v_col.company_id AND m.module = 'dp'::public.app_module
  LIMIT 1;

  IF v_mod.status IS NOT NULL
     AND (v_mod.status IN ('suspended','canceled','trial_expirado')
          OR (v_mod.status = 'trial' AND v_mod.trial_termina_em IS NOT NULL AND v_mod.trial_termina_em < now())
          OR (v_mod.ends_at IS NOT NULL AND v_mod.ends_at < now())) THEN
    RETURN QUERY SELECT 'sem_modulo'::text, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
    RETURN;
  END IF;

  IF v_col.ativo IS TRUE THEN
    v_estado := 'ativo';
  ELSIF v_col.acesso_portal_ate IS NOT NULL AND v_col.acesso_portal_ate >= v_hoje THEN
    v_estado := 'desligado_no_prazo';
  ELSE
    v_estado := 'desligado_expirado';
  END IF;

  RETURN QUERY SELECT v_estado, v_col.id, v_col.company_id, v_col.acesso_portal_ate;
END;
$fn$;

REVOKE ALL ON FUNCTION private.dp_portal_decisao(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.dp_pode_agir(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM private.dp_portal_decisao(_user_id) d WHERE d.estado = 'ativo');
$fn$;

CREATE OR REPLACE FUNCTION private.dp_pode_ver_documentos(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo')
  );
$fn$;

REVOKE ALL ON FUNCTION private.dp_pode_agir(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_pode_ver_documentos(uuid) FROM PUBLIC;

-- RPC pública: estado do portal apenas da própria sessão
CREATE OR REPLACE FUNCTION public.dp_meu_acesso_portal()
RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date, somente_documentos boolean, permitido boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.estado, d.colaborador_id, d.company_id, d.acesso_ate,
         d.estado = 'desligado_no_prazo',
         d.estado IN ('ativo','desligado_no_prazo')
  FROM private.dp_portal_decisao(auth.uid()) d
  WHERE auth.uid() IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.dp_meu_acesso_portal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_meu_acesso_portal() TO authenticated;

-- identidade do portal derivada da decisão central
CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR auth.uid() IS NULL
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado = 'ativo';
$fn$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT d.colaborador_id
  FROM private.dp_portal_decisao(_user_id) d
  WHERE _user_id IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR auth.uid() IS NULL
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role'
    )
    AND d.estado IN ('ativo','desligado_no_prazo');
$fn$;

CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.dp_colaborador_of(_user_id) IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM private.dp_portal_decisao(_user_id) d
    WHERE d.estado IN ('ativo','desligado_no_prazo')
      AND d.company_id = _company_id
  );
$fn$;

-- ações do portal exigem vínculo ativo (desligado fica somente com documentos)
DROP POLICY IF EXISTS dp_doc_colab_cancel_pending ON public.dp_documentos;
CREATE POLICY dp_doc_colab_cancel_pending ON public.dp_documentos
FOR DELETE TO authenticated
USING (
  colaborador_id IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
  AND submetido_por_colaborador = true
  AND aprovacao_status = 'pendente'::public.dp_documento_aprovacao_status
);

DROP POLICY IF EXISTS dp_comentarios_self_insert ON public.dp_avisos_comentarios;
CREATE POLICY dp_comentarios_self_insert ON public.dp_avisos_comentarios
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (
    private.is_company_member((SELECT auth.uid()), company_id)
    OR (
      private.is_dp_colaborador_of_company((SELECT auth.uid()), company_id)
      AND private.dp_pode_agir((SELECT auth.uid()))
    )
  )
);
CREATE OR REPLACE FUNCTION public.dp_convocacao_registrar_visualizacao(p_convocacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conv record;
  v_colab uuid;
  v_visto timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  SELECT id, company_id, colaborador_id, ocorrencia_id, visualizada_em
    INTO v_conv
    FROM public.dp_convocacoes
   WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador registra a visualização.'
      USING ERRCODE = '42501';
  END IF;

  IF v_conv.visualizada_em IS NOT NULL THEN
    RETURN jsonb_build_object('convocacao_id', v_conv.id,
      'visualizada_em', v_conv.visualizada_em, 'idempotente', true);
  END IF;

  -- vencedor da corrida grava; perdedor não altera linha alguma
  UPDATE public.dp_convocacoes
     SET visualizada_em = now(), updated_at = now()
   WHERE id = v_conv.id AND visualizada_em IS NULL
  RETURNING visualizada_em INTO v_visto;

  IF v_visto IS NULL THEN
    -- outra chamada venceu: relê o timestamp existente e não gera 2º evento
    SELECT visualizada_em INTO v_visto
      FROM public.dp_convocacoes WHERE id = v_conv.id;
    RETURN jsonb_build_object('convocacao_id', v_conv.id,
      'visualizada_em', v_visto, 'idempotente', true);
  END IF;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_visualizada',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id));

  RETURN jsonb_build_object('convocacao_id', v_conv.id,
    'visualizada_em', v_visto, 'idempotente', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(p_convocacao_id uuid, p_aceito boolean, p_motivo text DEFAULT NULL::text, p_parcial_entrada time without time zone DEFAULT NULL::time without time zone, p_parcial_saida time without time zone DEFAULT NULL::time without time zone, p_parcial_termina_no_dia_seguinte boolean DEFAULT NULL::boolean, p_parcial_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conv record;
  v_ocor record;
  v_colab uuid;
  v_agora timestamptz := now();
  v_aceitas int := 0;
  v_encerradas int := 0;
  v_alvo public.dp_convocacao_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_aval jsonb;
  v_enc text;
  v_enc_status public.dp_convocacao_status;
  v_enc_motivo text;
  v_enc_evento text;
  v_parcial boolean := (p_parcial_entrada IS NOT NULL OR p_parcial_saida IS NOT NULL);
  v_n_ini int; v_n_fim int; v_p_ini int; v_p_fim int;
  v_p_vira boolean;
  v_p_carga numeric;
  v_intervalo int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_convocacao_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a oferta e a resposta.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND NOT p_aceito THEN
    RAISE EXCEPTION 'INVALID_INPUT: horário parcial só se aplica ao aceite.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND (p_parcial_entrada IS NULL OR p_parcial_saida IS NULL) THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe entrada e saída do horário parcial.' USING ERRCODE = '22023';
  END IF;

  v_alvo := (CASE WHEN p_aceito THEN 'aceita' ELSE 'recusada' END)::public.dp_convocacao_status;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador responde à sua convocação.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conv.colaborador_id::text || '|' || v_conv.data::text, 0));

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    SELECT * INTO v_ocor
      FROM public.dp_convocacao_ocorrencias
     WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  IF NOT v_parcial AND v_conv.status = v_alvo AND COALESCE(v_conv.parcial_status,'') <> 'aguardando_gestor' THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'motivo', 'INVALID_STATE');
  END IF;

  v_enc := public.dp_convocacao_estado_encerramento(
    v_conv.prazo_resposta, v_conv.inicio_previsto, v_agora);

  IF v_enc IS NOT NULL THEN
    IF v_enc = 'sem_resposta' THEN
      v_enc_status := 'sem_resposta';
      v_enc_motivo := 'DEADLINE_EXPIRED';
      v_enc_evento := 'oferta_sem_resposta';
    ELSE
      v_enc_status := 'encerrada_inicio_ocorrencia';
      v_enc_motivo := 'OCCURRENCE_ALREADY_STARTED';
      v_enc_evento := 'oferta_encerrada';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_enc_status, encerrada_em = v_agora,
           encerramento_motivo = v_enc_motivo, updated_at = now()
     WHERE id = v_conv.id;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, v_enc_evento,
      jsonb_build_object('convocacao_id', v_conv.id, 'motivo', v_enc_motivo,
        'prazo_resposta', v_conv.prazo_resposta, 'inicio_previsto', v_conv.inicio_previsto));
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_enc_status::text, 'motivo', v_enc_motivo);
  END IF;

  -- recusa (motivo opcional)
  IF NOT p_aceito THEN
    UPDATE public.dp_convocacoes
       SET status = 'recusada', respondida_em = v_agora, motivo_recusa = v_motivo,
           resposta_tipo = 'integral',
           parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
           parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
           parcial_observacao = NULL,
           visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_recusada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'motivo', v_motivo));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'recusada',
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- proposta de horário parcial: reserva o dia e aguarda o gestor
  IF v_parcial THEN
    IF v_conv.ocorrencia_id IS NULL OR v_ocor.id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: esta convocação não aceita horário parcial.' USING ERRCODE = '22023';
    END IF;

    v_n_ini := EXTRACT(HOUR FROM v_ocor.necessidade_entrada)::int * 60
             + EXTRACT(MINUTE FROM v_ocor.necessidade_entrada)::int;
    v_n_fim := EXTRACT(HOUR FROM v_ocor.necessidade_saida)::int * 60
             + EXTRACT(MINUTE FROM v_ocor.necessidade_saida)::int;
    IF COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
      v_n_fim := v_n_fim + 1440;
    END IF;

    v_p_vira := COALESCE(p_parcial_termina_no_dia_seguinte, false);
    v_p_ini := EXTRACT(HOUR FROM p_parcial_entrada)::int * 60 + EXTRACT(MINUTE FROM p_parcial_entrada)::int;
    v_p_fim := EXTRACT(HOUR FROM p_parcial_saida)::int * 60 + EXTRACT(MINUTE FROM p_parcial_saida)::int;
    IF v_p_vira OR v_p_fim <= v_p_ini THEN
      v_p_fim := v_p_fim + 1440;
      v_p_vira := true;
    END IF;

    IF v_p_ini < v_n_ini OR v_p_fim > v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_OUT_OF_WINDOW: o horário parcial deve ficar dentro do horário pedido.'
        USING ERRCODE = '22023';
    END IF;
    IF v_p_ini = v_n_ini AND v_p_fim = v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_IS_FULL: este horário é o horário completo — use aceitar.'
        USING ERRCODE = '22023';
    END IF;

    v_intervalo := LEAST(GREATEST(COALESCE(v_conv.intervalo_minutos, 0), 0),
                         GREATEST(v_p_fim - v_p_ini - 1, 0));
    v_p_carga := round(((v_p_fim - v_p_ini) - v_intervalo)::numeric / 60.0, 2);
    IF v_p_carga <= 0 THEN
      RAISE EXCEPTION 'PARTIAL_INVALID_DURATION: o horário parcial precisa ter duração maior que zero.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.dp_convocacoes
       SET resposta_tipo = 'parcial',
           parcial_entrada = p_parcial_entrada,
           parcial_saida = p_parcial_saida,
           parcial_termina_no_dia_seguinte = v_p_vira,
           parcial_carga_horas = v_p_carga,
           parcial_observacao = NULLIF(btrim(COALESCE(p_parcial_observacao, '')), ''),
           parcial_status = 'aguardando_gestor',
           parcial_decidido_em = NULL, parcial_decidido_por = NULL, parcial_decisao_motivo = NULL,
           visualizada_em = COALESCE(visualizada_em, v_agora),
           updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_parcial_proposta',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'entrada', p_parcial_entrada, 'saida', p_parcial_saida,
        'termina_no_dia_seguinte', v_p_vira, 'carga_prevista_horas', v_p_carga,
        'observacao', p_parcial_observacao));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'pendente',
      'parcial_status', 'aguardando_gestor', 'carga_prevista_horas', v_p_carga,
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- aceite integral
  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL THEN
    SELECT count(*) INTO v_aceitas
      FROM public.dp_convocacoes c
     WHERE c.ocorrencia_id = v_ocor.id AND c.status = 'aceita';

    IF v_aceitas >= COALESCE(v_ocor.vagas, 1) THEN
      UPDATE public.dp_convocacoes
         SET status = 'encerrada_sem_vaga', encerrada_em = v_agora,
             encerramento_motivo = 'OFFER_FILLED', updated_at = now()
       WHERE id = v_conv.id;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_encerrada_sem_vaga',
        jsonb_build_object('convocacao_id', v_conv.id, 'vagas', v_ocor.vagas));
      RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
        'status', 'encerrada_sem_vaga', 'motivo', 'OFFER_FILLED');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_conv.company_id
       AND c.colaborador_id = v_conv.colaborador_id
       AND c.data = v_conv.data
       AND c.id <> v_conv.id
       AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED_TODAY: você já tem uma convocação confirmada para este dia.'
      USING ERRCODE = '22023';
  END IF;

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    v_aval := public.dp_convocacao_avaliar_candidato(
      v_conv.colaborador_id, v_conv.ocorrencia_id, v_conv.id, false);
    IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'ACCEPT_INELIGIBLE: %', COALESCE(v_aval->>'motivo', 'INELEGIVEL')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'aceita', respondida_em = v_agora, motivo_recusa = NULL,
         resposta_tipo = 'integral',
         parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
         parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
         visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
   WHERE id = v_conv.id;

  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL
     AND (v_aceitas + 1) >= COALESCE(v_ocor.vagas, 1) THEN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = CASE WHEN parcial_status = 'aguardando_gestor'
                           THEN 'recusada'::public.dp_convocacao_status
                           ELSE 'encerrada_sem_vaga'::public.dp_convocacao_status END,
             encerrada_em = v_agora,
             encerramento_motivo = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN 'COVERED_BY_OTHER' ELSE 'OFFER_FILLED' END,
             parcial_status = CASE WHEN parcial_status = 'aguardando_gestor'
                                   THEN 'superada' ELSE parcial_status END,
             parcial_decidido_em = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN v_agora ELSE parcial_decidido_em END,
             respondida_em = COALESCE(respondida_em, v_agora),
             updated_at = now()
       WHERE ocorrencia_id = v_ocor.id AND status = 'pendente' AND id <> v_conv.id
      RETURNING 1
    )
    SELECT count(*) INTO v_encerradas FROM enc;

    UPDATE public.dp_convocacao_ocorrencias
       SET status = 'preenchida', updated_at = now()
     WHERE id = v_ocor.id AND company_id = v_conv.company_id AND status = 'publicada';
  END IF;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_aceita',
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'ofertas_encerradas', v_encerradas));

  RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'aceita',
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_responder_oferta(p_convocacao_id uuid, p_aceito boolean, p_motivo text DEFAULT NULL::text, p_parcial_entrada time without time zone DEFAULT NULL::time without time zone, p_parcial_saida time without time zone DEFAULT NULL::time without time zone, p_parcial_termina_no_dia_seguinte boolean DEFAULT NULL::boolean, p_parcial_observacao text DEFAULT NULL::text, p_atraso_justificativa text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_conv record;
  v_ocor record;
  v_colab uuid;
  v_agora timestamptz := now();
  v_aceitas int := 0;
  v_encerradas int := 0;
  v_alvo public.dp_convocacao_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_aval jsonb;
  v_enc text;
  v_enc_status public.dp_convocacao_status;
  v_enc_motivo text;
  v_enc_evento text;
  v_parcial boolean := (p_parcial_entrada IS NOT NULL OR p_parcial_saida IS NOT NULL);
  v_n_ini int; v_n_fim int; v_p_ini int; v_p_fim int;
  v_p_vira boolean;
  v_p_carga numeric;
  v_intervalo int;
  v_just text := NULLIF(btrim(COALESCE(p_atraso_justificativa, '')), '');
  v_atrasado boolean := false;
  v_atraso_min int;
  v_atraso_forma text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_convocacao_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a oferta e a resposta.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND NOT p_aceito THEN
    RAISE EXCEPTION 'INVALID_INPUT: horário parcial só se aplica ao aceite.' USING ERRCODE = '22023';
  END IF;
  IF v_parcial AND (p_parcial_entrada IS NULL OR p_parcial_saida IS NULL) THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe entrada e saída do horário parcial.' USING ERRCODE = '22023';
  END IF;

  v_alvo := (CASE WHEN p_aceito THEN 'aceita' ELSE 'recusada' END)::public.dp_convocacao_status;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: oferta inexistente.' USING ERRCODE = '23503';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL OR v_colab <> v_conv.colaborador_id THEN
    RAISE EXCEPTION 'FORBIDDEN: somente o próprio trabalhador responde à sua convocação.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conv.colaborador_id::text || '|' || v_conv.data::text, 0));

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    SELECT * INTO v_ocor
      FROM public.dp_convocacao_ocorrencias
     WHERE id = v_conv.ocorrencia_id AND company_id = v_conv.company_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_conv FROM public.dp_convocacoes WHERE id = p_convocacao_id FOR UPDATE;

  IF NOT v_parcial AND v_conv.status = v_alvo AND COALESCE(v_conv.parcial_status,'') <> 'aguardando_gestor' THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'idempotente', true, 'ofertas_encerradas', 0);
  END IF;

  IF v_conv.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_conv.status::text, 'motivo', 'INVALID_STATE');
  END IF;

  v_enc := public.dp_convocacao_estado_encerramento(
    v_conv.prazo_resposta, v_conv.inicio_previsto, v_agora);

  -- Horário já começou mas ainda não terminou: aceita com justificativa.
  IF v_enc = 'encerrada_inicio_ocorrencia'
     AND p_aceito
     AND v_conv.fim_previsto IS NOT NULL
     AND v_agora < v_conv.fim_previsto THEN
    IF v_just IS NULL THEN
      RAISE EXCEPTION 'LATE_JUSTIFICATION_REQUIRED: explique por que está respondendo depois do início.'
        USING ERRCODE = '22023';
    END IF;
    v_atrasado := true;
    v_atraso_min := GREATEST(0, (EXTRACT(EPOCH FROM (v_agora - v_conv.inicio_previsto)) / 60)::int);
    v_atraso_forma := CASE WHEN v_parcial THEN 'chegada_tardia' ELSE 'integral' END;
    v_enc := NULL;
  END IF;

  IF v_enc IS NOT NULL THEN
    IF v_enc = 'sem_resposta' THEN
      v_enc_status := 'sem_resposta';
      v_enc_motivo := 'DEADLINE_EXPIRED';
      v_enc_evento := 'oferta_sem_resposta';
    ELSE
      v_enc_status := 'encerrada_inicio_ocorrencia';
      v_enc_motivo := 'OCCURRENCE_ALREADY_STARTED';
      v_enc_evento := 'oferta_encerrada';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_enc_status, encerrada_em = v_agora,
           encerramento_motivo = v_enc_motivo, updated_at = now()
     WHERE id = v_conv.id;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, v_enc_evento,
      jsonb_build_object('convocacao_id', v_conv.id, 'motivo', v_enc_motivo,
        'prazo_resposta', v_conv.prazo_resposta, 'inicio_previsto', v_conv.inicio_previsto));
    RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
      'status', v_enc_status::text, 'motivo', v_enc_motivo);
  END IF;

  -- recusa (motivo opcional)
  IF NOT p_aceito THEN
    UPDATE public.dp_convocacoes
       SET status = 'recusada', respondida_em = v_agora, motivo_recusa = v_motivo,
           resposta_tipo = 'integral',
           parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
           parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
           parcial_observacao = NULL,
           visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_recusada',
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'motivo', v_motivo));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'recusada',
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- proposta de horário parcial: reserva o dia e aguarda o gestor
  IF v_parcial THEN
    IF v_conv.ocorrencia_id IS NULL OR v_ocor.id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: esta convocação não aceita horário parcial.' USING ERRCODE = '22023';
    END IF;

    v_n_ini := public.dp_minutos_do_horario(v_ocor.necessidade_entrada);
    v_n_fim := public.dp_minutos_do_horario(v_ocor.necessidade_saida);
    IF COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
      v_n_fim := v_n_fim + 1440;
    END IF;

    v_p_vira := COALESCE(p_parcial_termina_no_dia_seguinte, false);
    v_p_ini := public.dp_minutos_do_horario(p_parcial_entrada);
    v_p_fim := public.dp_minutos_do_horario(p_parcial_saida);
    IF v_p_vira OR v_p_fim <= v_p_ini THEN
      v_p_fim := v_p_fim + 1440;
      v_p_vira := true;
    END IF;

    IF v_p_ini < v_n_ini OR v_p_fim > v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_OUT_OF_WINDOW: o horário parcial deve ficar dentro do horário pedido.'
        USING ERRCODE = '22023';
    END IF;
    IF v_p_ini = v_n_ini AND v_p_fim = v_n_fim THEN
      RAISE EXCEPTION 'PARTIAL_IS_FULL: este horário é o horário completo — use aceitar.'
        USING ERRCODE = '22023';
    END IF;

    IF public.dp_colaborador_horario_ocupado(
         v_conv.colaborador_id, v_conv.data, p_parcial_entrada, p_parcial_saida,
         v_p_vira, v_conv.id, false) THEN
      RAISE EXCEPTION 'WORKER_ALREADY_BOOKED: você já tem outra convocação confirmada nesse horário.'
        USING ERRCODE = '22023';
    END IF;

    v_intervalo := LEAST(GREATEST(COALESCE(v_conv.intervalo_minutos, 0), 0),
                         GREATEST(v_p_fim - v_p_ini - 1, 0));
    v_p_carga := round(((v_p_fim - v_p_ini) - v_intervalo)::numeric / 60.0, 2);
    IF v_p_carga <= 0 THEN
      RAISE EXCEPTION 'PARTIAL_INVALID_DURATION: o horário parcial precisa ter duração maior que zero.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.dp_convocacoes
       SET resposta_tipo = 'parcial',
           parcial_entrada = p_parcial_entrada,
           parcial_saida = p_parcial_saida,
           parcial_termina_no_dia_seguinte = v_p_vira,
           parcial_carga_horas = v_p_carga,
           parcial_observacao = NULLIF(btrim(COALESCE(p_parcial_observacao, '')), ''),
           parcial_status = 'aguardando_gestor',
           parcial_decidido_em = NULL, parcial_decidido_por = NULL, parcial_decisao_motivo = NULL,
           aceite_atrasado = v_atrasado,
           aceite_atraso_minutos = CASE WHEN v_atrasado THEN v_atraso_min ELSE NULL END,
           aceite_atraso_justificativa = CASE WHEN v_atrasado THEN v_just ELSE NULL END,
           aceite_atraso_forma = v_atraso_forma,
           visualizada_em = COALESCE(visualizada_em, v_agora),
           updated_at = now()
     WHERE id = v_conv.id;

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_conv.company_id, NULL, v_conv.ocorrencia_id,
      CASE WHEN v_atrasado THEN 'oferta_aceita_com_atraso' ELSE 'oferta_parcial_proposta' END,
      jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
        'entrada', p_parcial_entrada, 'saida', p_parcial_saida,
        'termina_no_dia_seguinte', v_p_vira, 'carga_prevista_horas', v_p_carga,
        'observacao', p_parcial_observacao,
        'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
        'atraso_forma', v_atraso_forma, 'atraso_justificativa', v_just));

    RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'pendente',
      'parcial_status', 'aguardando_gestor', 'carga_prevista_horas', v_p_carga,
      'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
      'idempotente', false, 'ofertas_encerradas', 0);
  END IF;

  -- aceite integral
  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL THEN
    SELECT count(*) INTO v_aceitas
      FROM public.dp_convocacoes c
     WHERE c.ocorrencia_id = v_ocor.id AND c.status = 'aceita';

    IF v_aceitas >= COALESCE(v_ocor.vagas, 1) THEN
      UPDATE public.dp_convocacoes
         SET status = 'encerrada_sem_vaga', encerrada_em = v_agora,
             encerramento_motivo = 'OFFER_FILLED', updated_at = now()
       WHERE id = v_conv.id;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_conv.company_id, NULL, v_conv.ocorrencia_id, 'oferta_encerrada_sem_vaga',
        jsonb_build_object('convocacao_id', v_conv.id, 'vagas', v_ocor.vagas));
      RETURN jsonb_build_object('ok', false, 'convocacao_id', v_conv.id,
        'status', 'encerrada_sem_vaga', 'motivo', 'OFFER_FILLED');
    END IF;
  END IF;

  -- Mesmo dia liberado; horário sobreposto (em qualquer unidade) não.
  IF public.dp_colaborador_horario_ocupado(
       v_conv.colaborador_id, v_conv.data, v_conv.entrada, v_conv.saida,
       COALESCE(v_conv.termina_no_dia_seguinte, false), v_conv.id, false) THEN
    RAISE EXCEPTION 'WORKER_ALREADY_BOOKED: você já tem outra convocação confirmada nesse horário.'
      USING ERRCODE = '22023';
  END IF;

  IF v_conv.ocorrencia_id IS NOT NULL THEN
    v_aval := public.dp_convocacao_avaliar_candidato(
      v_conv.colaborador_id, v_conv.ocorrencia_id, v_conv.id, false);
    IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'ACCEPT_INELIGIBLE: %', COALESCE(v_aval->>'motivo', 'INELEGIVEL')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'aceita', respondida_em = v_agora, motivo_recusa = NULL,
         resposta_tipo = 'integral',
         parcial_status = NULL, parcial_entrada = NULL, parcial_saida = NULL,
         parcial_termina_no_dia_seguinte = NULL, parcial_carga_horas = NULL,
         aceite_atrasado = v_atrasado,
         aceite_atraso_minutos = CASE WHEN v_atrasado THEN v_atraso_min ELSE NULL END,
         aceite_atraso_justificativa = CASE WHEN v_atrasado THEN v_just ELSE NULL END,
         aceite_atraso_forma = v_atraso_forma,
         visualizada_em = COALESCE(visualizada_em, v_agora), updated_at = now()
   WHERE id = v_conv.id;

  IF v_conv.ocorrencia_id IS NOT NULL AND v_ocor.id IS NOT NULL
     AND (v_aceitas + 1) >= COALESCE(v_ocor.vagas, 1) THEN
    WITH enc AS (
      UPDATE public.dp_convocacoes
         SET status = CASE WHEN parcial_status = 'aguardando_gestor'
                           THEN 'recusada'::public.dp_convocacao_status
                           ELSE 'encerrada_sem_vaga'::public.dp_convocacao_status END,
             encerrada_em = v_agora,
             encerramento_motivo = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN 'COVERED_BY_OTHER' ELSE 'OFFER_FILLED' END,
             parcial_status = CASE WHEN parcial_status = 'aguardando_gestor'
                                   THEN 'superada' ELSE parcial_status END,
             parcial_decidido_em = CASE WHEN parcial_status = 'aguardando_gestor'
                                        THEN v_agora ELSE parcial_decidido_em END,
             respondida_em = COALESCE(respondida_em, v_agora),
             updated_at = now()
       WHERE ocorrencia_id = v_ocor.id AND status = 'pendente' AND id <> v_conv.id
      RETURNING 1
    )
    SELECT count(*) INTO v_encerradas FROM enc;

    UPDATE public.dp_convocacao_ocorrencias
       SET status = 'preenchida', updated_at = now()
     WHERE id = v_ocor.id AND company_id = v_conv.company_id AND status = 'publicada';
  END IF;

  PERFORM public.dp_convocacao_log_evento_trabalhador(
    v_conv.company_id, NULL, v_conv.ocorrencia_id,
    CASE WHEN v_atrasado THEN 'oferta_aceita_com_atraso' ELSE 'oferta_aceita' END,
    jsonb_build_object('convocacao_id', v_conv.id, 'colaborador_id', v_conv.colaborador_id,
      'ofertas_encerradas', v_encerradas,
      'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
      'atraso_forma', v_atraso_forma, 'atraso_justificativa', v_just));

  RETURN jsonb_build_object('ok', true, 'convocacao_id', v_conv.id, 'status', 'aceita',
    'aceite_atrasado', v_atrasado, 'atraso_minutos', v_atraso_min,
    'idempotente', false, 'ofertas_encerradas', v_encerradas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_ferias_registrar_ciencia(_gozo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gozo record;
BEGIN
  SELECT g.*, c.user_id AS col_user_id
    INTO v_gozo
  FROM public.dp_ferias_gozos g
  JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
  WHERE g.id = _gozo_id;

  IF v_gozo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA';
  END IF;
  IF v_gozo.col_user_id IS NULL OR v_gozo.col_user_id <> auth.uid()
     OR NOT private.dp_pode_agir(auth.uid()) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  UPDATE public.dp_ferias_gozos
  SET ciente_em = COALESCE(ciente_em, now()),
      ciente_por = COALESCE(ciente_por, auth.uid()),
      ciente_fora_prazo = CASE WHEN ciente_em IS NULL THEN aviso_fora_prazo ELSE ciente_fora_prazo END
  WHERE id = _gozo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_ferias_solicitar(_periodo_id uuid, _data_inicio date, _data_fim date, _dias_abono integer DEFAULT 0, _adiantar_13 boolean DEFAULT false, _observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_periodo record;
  v_col record;
  v_solicitacao_id uuid;
  v_usados int;
  v_novos int;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id FOR UPDATE;
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  SELECT id, company_id, user_id INTO v_col
  FROM public.dp_colaboradores WHERE id = v_periodo.colaborador_id;

  IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid()
     OR NOT private.dp_pode_agir(auth.uid()) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id AND g.status <> 'cancelado';

  v_novos := (_data_fim - _data_inicio + 1) + COALESCE(_dias_abono, 0);
  IF v_usados + v_novos > v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INSUFICIENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dp_ferias_solicitacao_detalhes d
    JOIN public.dp_solicitacoes s ON s.id = d.solicitacao_id
    WHERE d.colaborador_id = v_col.id
      AND s.status = 'pendente'
      AND daterange(d.data_inicio, d.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_DUPLICADA';
  END IF;

  INSERT INTO public.dp_solicitacoes (
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status
  ) VALUES (
    v_col.company_id, v_col.id, auth.uid(), 'ferias', _data_inicio, _data_fim,
    NULLIF(btrim(_observacao), ''), 'pendente'
  )
  RETURNING id INTO v_solicitacao_id;

  INSERT INTO public.dp_ferias_solicitacao_detalhes (
    company_id, solicitacao_id, periodo_id, colaborador_id,
    data_inicio, data_fim, dias, dias_abono, adiantar_13, observacao
  ) VALUES (
    v_col.company_id, v_solicitacao_id, _periodo_id, v_col.id,
    _data_inicio, _data_fim, (_data_fim - _data_inicio + 1)::smallint,
    COALESCE(_dias_abono, 0)::smallint, COALESCE(_adiantar_13, false),
    NULLIF(btrim(_observacao), '')
  );

  RETURN v_solicitacao_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_solicitacao_cancelar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.colaborador_id <> v_colab THEN
    RAISE EXCEPTION 'FORBIDDEN: solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pendente'::public.dp_solicitacao_status THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: apenas solicitações pendentes podem ser canceladas.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada', updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id);
END;
$function$;
