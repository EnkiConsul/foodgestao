CREATE OR REPLACE FUNCTION public.dp_folga_atribuir_admin_v2(p_colaborador uuid, p_data date, p_modo text, p_folga_substituir_id uuid DEFAULT NULL::uuid, p_data_trabalho date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_autorizar_excedente boolean DEFAULT false, p_justificativa_excedente text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; v_unidade uuid; v_regime text; v_res jsonb;
  v_sub uuid[] := NULL; v_fixos smallint[]; v_obs text; v_data_substituida date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000'; END IF;
  IF p_colaborador IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_modo, '') NOT IN ('extra', 'substituir_fds', 'troca_semanal') THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o tipo da folga (extra, substituir_fds ou troca_semanal).' USING ERRCODE = '22023';
  END IF;
  SELECT c.company_id, c.unidade_id, c.regime::text INTO v_company, v_unidade, v_regime
    FROM public.dp_colaboradores c WHERE c.id = p_colaborador AND c.ativo = true AND c.deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503'; END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.unidade_liberada(v_company, v_unidade) THEN
    RAISE EXCEPTION 'FORBIDDEN_UNIDADE: você não tem permissão para gerenciar folgas desta unidade.' USING ERRCODE = '42501';
  END IF;
  IF v_regime = 'intermitente' AND p_modo IN ('substituir_fds', 'troca_semanal') THEN
    RAISE EXCEPTION 'INTERMITENTE: intermitente não participa de folga fixa, troca semanal ou escolha de fim de semana.' USING ERRCODE = '22023';
  END IF;

  IF p_modo = 'substituir_fds' THEN
    IF p_folga_substituir_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a folga que será substituída.' USING ERRCODE = '22023';
    END IF;
    SELECT f.data INTO v_data_substituida FROM public.dp_folgas f
     WHERE f.id = p_folga_substituir_id AND f.colaborador_id = p_colaborador
       AND f.company_id = v_company AND f.status <> 'cancelada';
    IF v_data_substituida IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: a folga informada não está ativa para este colaborador.' USING ERRCODE = '22023';
    END IF;
    v_sub := ARRAY[p_folga_substituir_id];
    v_obs := btrim(concat_ws(' ', 'Substituição da folga de fim de semana.', NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  ELSIF p_modo = 'troca_semanal' THEN
    IF p_data_trabalho IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe o dia de folga semanal que será trabalhado.' USING ERRCODE = '22023';
    END IF;
    v_fixos := public.dp_dias_fixos_folga(p_colaborador, p_data_trabalho);
    IF NOT (EXTRACT(DOW FROM p_data_trabalho)::smallint = ANY(COALESCE(v_fixos, '{}'::smallint[]))) THEN
      RAISE EXCEPTION 'INVALID_INPUT: o dia informado não é folga semanal fixa deste colaborador.' USING ERRCODE = '22023';
    END IF;
    v_obs := btrim(concat_ws(' ', 'Troca da folga semanal de ' || to_char(p_data_trabalho, 'DD/MM/YYYY') || '.',
      NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  ELSE
    v_obs := btrim(concat_ws(' ', 'Folga extra.', NULLIF(btrim(COALESCE(p_motivo, '')), '')));
  END IF;

  v_res := public.dp_folga_criar_admin(p_colaborador_id => p_colaborador, p_data => p_data, p_tipo => 'normal',
    p_extra => (p_modo = 'extra'), p_observacao => v_obs, p_confirmar_deficit => false,
    p_substituir_ids => v_sub, p_autorizar_excedente => p_autorizar_excedente,
    p_justificativa_excedente => p_justificativa_excedente);

  IF COALESCE((v_res->>'ok')::boolean, false) = false OR COALESCE((v_res->>'ja_existia')::boolean, false) THEN
    RETURN v_res || jsonb_build_object('modo', p_modo);
  END IF;

  IF p_modo = 'substituir_fds' THEN
    INSERT INTO public.dp_folgas_canceladas(company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    SELECT v_company, p_colaborador, f.id, f.data, 'Substituída pela folga de ' || to_char(p_data, 'DD/MM/YYYY') || '.',
           'admin_substituicao', v_uid FROM public.dp_folgas f WHERE f.id = p_folga_substituir_id;
    UPDATE public.dp_solicitacoes s SET status = 'cancelada',
           resposta_admin = btrim(concat_ws(' ', NULLIF(s.resposta_admin, ''), 'Substituída pela folga de ' || to_char(p_data, 'DD/MM/YYYY') || '.')),
           respondido_por = v_uid, respondido_em = now(), updated_at = now()
     WHERE s.colaborador_id = p_colaborador AND s.company_id = v_company AND s.tipo = 'folga'
       AND s.status = 'aprovada' AND s.data_alvo = v_data_substituida AND s.removido_em IS NULL;
  ELSIF p_modo = 'troca_semanal' THEN
    INSERT INTO public.dp_dia_trabalho_excepcional(company_id, colaborador_id, data, origem, criado_por)
    VALUES (v_company, p_colaborador, p_data_trabalho, 'troca_semanal_admin', v_uid)
    ON CONFLICT (colaborador_id, data) DO UPDATE SET origem = 'troca_semanal_admin', updated_at = now();
  END IF;

  PERFORM public.insert_audit_log('folga_atribuida_admin_triagem', 'dp_folgas', (v_res->>'folga_id'),
    jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador, 'data', p_data, 'modo', p_modo,
                       'folga_substituida', p_folga_substituir_id, 'data_trabalho', p_data_trabalho));
  RETURN v_res || jsonb_build_object('modo', p_modo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_notif_solicitacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT nome INTO v_nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'solicitacao_nova',
            'Nova solicitação: ' || COALESCE(v_nome,'colaborador'),
            'Tipo: ' || NEW.tipo::text,
            'dp_solicitacoes', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('aprovada','recusada') THEN
    SELECT c.user_id INTO v_nome FROM public.dp_colaboradores c WHERE c.id = NEW.colaborador_id;
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
    SELECT NEW.company_id, c.user_id, c.id, 'solicitacao_respondida',
           'Sua solicitação foi ' || NEW.status::text,
           'Tipo: ' || NEW.tipo::text,
           'dp_solicitacoes', NEW.id
    FROM public.dp_colaboradores c
    WHERE c.id = NEW.colaborador_id AND c.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.dp_folga_ocorrencia(_folga uuid, _solicitacao uuid DEFAULT NULL::uuid, _troca uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.dp_folgas%ROWTYPE; s public.dp_solicitacoes%ROWTYPE; sub text; titulo text;
BEGIN
 SELECT * INTO f FROM public.dp_folgas WHERE id=_folga FOR UPDATE;
 IF NOT FOUND OR f.status='cancelada' THEN RETURN; END IF;
 IF _solicitacao IS NOT NULL THEN
   SELECT * INTO s FROM public.dp_solicitacoes WHERE id=_solicitacao AND company_id=f.company_id AND colaborador_id=f.colaborador_id AND status='aprovada' AND removido_em IS NULL;
   IF NOT FOUND THEN RETURN; END IF;
 END IF;
 -- Swap rows are created before status approval: only the swap trigger may justify them.
 IF _troca IS NULL AND coalesce(f.observacao,'') LIKE 'Troca aprovada (id=%' THEN RETURN; END IF;
 sub := CASE WHEN _troca IS NOT NULL OR f.direito_origem='folga_fixa_deslocada' OR (s.data_fim IS NOT NULL AND s.data_fim<>s.data_alvo) THEN 'troca_folga'
             WHEN f.tipo::text='compensatoria' OR coalesce(f.observacao,'') ILIKE '%compensat%' OR coalesce(s.motivo,'') ILIKE '%compensa%' THEN 'compensacao_feriado'
             WHEN f.extra THEN 'folga_extra' ELSE NULL END;
 IF sub IS NULL THEN RETURN; END IF;
 titulo := CASE sub WHEN 'troca_folga' THEN 'Folga autorizada por troca de folga' WHEN 'compensacao_feriado' THEN 'Compensação de feriado trabalhado autorizada' ELSE 'Folga extra autorizada pelo gestor' END;
 INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,analisado_por,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,folga_id,solicitacao_id,troca_id,subtipo)
 SELECT f.company_id,f.colaborador_id,c.unidade_id,c.setor_id,f.data,'ausencia_justificada','confirmada','sistema',titulo || '. Justifica a ausência no sistema externo de ponto; sem impacto na assiduidade ou férias.', 'nao','nao','analisada',now(),auth.uid(),false,false,true,'pendente',f.id,_solicitacao,_troca,sub
 FROM public.dp_colaboradores c WHERE c.id=f.colaborador_id AND c.company_id=f.company_id
 ON CONFLICT (folga_id) WHERE folga_id IS NOT NULL AND estado <> 'cancelada' DO UPDATE SET solicitacao_id=coalesce(public.dp_ocorrencias.solicitacao_id,EXCLUDED.solicitacao_id),troca_id=coalesce(public.dp_ocorrencias.troca_id,EXCLUDED.troca_id),subtipo=EXCLUDED.subtipo;
END $function$;

CREATE OR REPLACE FUNCTION public.dp_folga_criar_admin(p_colaborador_id uuid, p_data date, p_tipo text DEFAULT 'normal'::text, p_extra boolean DEFAULT false, p_observacao text DEFAULT NULL::text, p_confirmar_deficit boolean DEFAULT false, p_substituir_ids uuid[] DEFAULT NULL::uuid[], p_autorizar_excedente boolean DEFAULT false, p_justificativa_excedente text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; v_unidade uuid; v_cargo uuid; v_setor uuid;
  v_res jsonb; v_id uuid; v_canceladas int := 0; r record;
  v_just text := NULLIF(btrim(COALESCE(p_justificativa_excedente, '')), '');
  v_excedeu boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000'; END IF;
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;
  SELECT company_id, unidade_id, cargo_id, setor_id INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores WHERE id = p_colaborador_id AND ativo = true AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503'; END IF;
  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.unidade_liberada(v_company, v_unidade) THEN
    RAISE EXCEPTION 'FORBIDDEN_UNIDADE: você não tem permissão para gerenciar folgas desta unidade.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador_id::text || '|folga|' || p_data::text, 0));

  -- Idempotência: repetição da mesma operação não duplica a folga.
  SELECT id INTO v_id FROM public.dp_folgas
   WHERE colaborador_id = p_colaborador_id AND data = p_data AND status <> 'cancelada' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'ja_existia', true, 'canceladas', 0);
  END IF;

  v_res := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, p_colaborador_id, v_setor);

  IF COALESCE((v_res->>'excedido')::boolean, false) AND COALESCE(p_extra, false) = false
     AND p_tipo NOT IN ('ferias', 'licenca') THEN
    IF NOT COALESCE(p_autorizar_excedente, false) THEN
      RETURN jsonb_build_object('ok', false, 'limite_atingido', true, 'limite', v_res,
        'pode_autorizar', true,
        'mensagem', format('Este dia já atingiu o limite de %s pessoa(s) em folga.', (v_res->>'limite')::int));
    END IF;
    IF v_just IS NULL OR length(v_just) < 15 THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA: descreva o motivo da exceção (mínimo 15 caracteres).' USING ERRCODE = '22023';
    END IF;
    v_excedeu := true;
    PERFORM set_config('dp.folga_excedente_autorizado', 'on', true);
  END IF;

  IF p_substituir_ids IS NOT NULL AND array_length(p_substituir_ids, 1) > 0 THEN
    FOR r IN
      UPDATE public.dp_folgas f SET status = 'cancelada',
             observacao = btrim(concat_ws(' | ', NULLIF(f.observacao, ''), 'Substituída por folga de ' || to_char(p_data, 'DD/MM/YYYY'))),
             updated_at = now()
       WHERE f.id = ANY(p_substituir_ids) AND f.company_id = v_company
         AND f.colaborador_id = p_colaborador_id AND f.status <> 'cancelada'
      RETURNING f.id, f.data
    LOOP
      v_canceladas := v_canceladas + 1;
      PERFORM public.insert_audit_log('folga_cancelada_substituicao', 'dp_folgas', r.id::text,
        jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id, 'data_cancelada', r.data, 'data_nova', p_data));
    END LOOP;
  END IF;

  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (v_company, p_colaborador_id, p_data, p_tipo::public.dp_folga_tipo, 'admin_manual', 'agendada',
          COALESCE(p_extra, false),
          NULLIF(btrim(concat_ws(' | ', NULLIF(btrim(COALESCE(p_observacao, '')), ''),
                 CASE WHEN v_excedeu THEN 'Acima do limite, autorizado: ' || v_just END)), ''),
          v_uid)
  RETURNING id INTO v_id;

  PERFORM set_config('dp.folga_excedente_autorizado', 'off', true);

  PERFORM public.insert_audit_log('folga_criada_admin', 'dp_folgas', v_id::text,
    jsonb_build_object('company_id', v_company, 'unidade_id', v_unidade, 'cargo_id', v_cargo,
                       'setor_id', v_setor, 'data', p_data, 'limite', v_res));
  IF v_excedeu THEN
    PERFORM public.insert_audit_log('folga_excedente_autorizado', 'dp_folgas', v_id::text,
      jsonb_build_object('company_id', v_company, 'unidade_id', v_unidade, 'colaborador_id', p_colaborador_id,
                         'data', p_data, 'justificativa', v_just, 'autorizado_por', v_uid, 'limite', v_res));
  END IF;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'canceladas', v_canceladas,
                            'limite', v_res, 'excedente_autorizado', v_excedeu);
END;
$function$;