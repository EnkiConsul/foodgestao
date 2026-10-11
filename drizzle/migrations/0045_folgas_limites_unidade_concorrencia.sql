-- Correções do Calendário de Folgas (5 divergências da auditoria).
-- ROLLBACK: recriar dp_folga_limite_dia, dp_folgas_validar_unificado,
-- dp_folga_criar_admin(7 args) e dp_folga_atribuir_admin_v2(6 args) a partir das
-- migrations 20260914143639, 20260906130600 e 20260930035958; DROP TRIGGER
-- dp_folgas_guard_unidade; DROP FUNCTION private.dp_folga_ocupa_vaga,
-- private.dp_folga_lock_vaga, public.dp_folgas_guard_unidade.

-- 1) Quem ocupa vaga: folga ativa (não extra/férias/licença) ou solicitação aprovada,
--    contado UMA vez por colaborador/data; folga fixa dominical não ocupa vaga de escolha.
CREATE OR REPLACE FUNCTION private.dp_folga_ocupa_vaga(_colab uuid, _data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.dp_folgas f
             WHERE f.colaborador_id = _colab AND f.data = _data
               AND f.status <> 'cancelada' AND f.extra = false
               AND f.tipo NOT IN ('ferias','licenca'))
    OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                WHERE s.colaborador_id = _colab AND s.tipo = 'folga'
                  AND s.data_alvo = _data AND s.status = 'aprovada')
  )
  AND NOT (EXTRACT(DOW FROM _data)::int = 0
           AND 0::smallint = ANY (COALESCE(public.dp_dias_fixos_folga(_colab, _data), '{}'::smallint[])));
$$;

-- 2) Trava transacional por empresa+unidade+data (última vaga).
CREATE OR REPLACE FUNCTION private.dp_folga_lock_vaga(_company uuid, _unidade uuid, _data date)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(
    'dp_folga_vaga|' || _company::text || '|' || COALESCE(_unidade::text, '-') || '|' || _data::text, 0));
$$;
REVOKE ALL ON FUNCTION private.dp_folga_ocupa_vaga(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_folga_lock_vaga(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- 3) Limite do dia
CREATE OR REPLACE FUNCTION public.dp_folga_limite_dia(p_company uuid, p_unidade uuid, p_cargo uuid, p_data date, p_ignorar_colaborador uuid DEFAULT NULL::uuid, p_setor uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wd int; v_limite int; v_regras jsonb := '[]'::jsonb; v_pior jsonb;
  v_setor_nao_definido boolean := false; v_tem_regra_setor boolean := false;
  rec record; v_setores uuid[]; v_em_folga int; v_cfg record; v_reserva int;
  v_reserva_ativa boolean := false;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.dp_folga_escopo_empresa_ok(p_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.dp_folga_lock_vaga(p_company, p_unidade, p_data);

  v_wd := EXTRACT(DOW FROM p_data)::int;
  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(p_company, p_unidade);
  v_reserva_ativa := COALESCE(v_cfg.disponibilidade_reserva_folga, false);

  SELECT dc.limite_folgas INTO v_limite FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC LIMIT 1;

  IF v_limite IS NOT NULL THEN
    v_reserva := CASE WHEN v_reserva_ativa
      THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, NULL, p_data, NULL) ELSE 0 END;
    SELECT count(*) INTO v_em_folga FROM public.dp_colaboradores c
     WHERE c.company_id = p_company AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
       AND private.dp_folga_ocupa_vaga(c.id, p_data);
    v_em_folga := COALESCE(v_em_folga, 0) + v_reserva;
    RETURN jsonb_build_object('limite', v_limite, 'origem', 'excecao_data', 'regra_id', NULL, 'tipo', NULL,
      'por_cargo', false, 'por_setor', false, 'setor_nao_definido', false,
      'em_folga', v_em_folga, 'reserva', v_reserva, 'reserva_ativa', v_reserva_ativa,
      'disponivel', GREATEST(v_limite - v_em_folga, 0), 'excedido', v_em_folga >= v_limite,
      'regras', '[]'::jsonb);
  END IF;

  FOR rec IN
    SELECT r.id, r.maximo, r.tipo, r.nome FROM public.dp_folga_limite_regras r
     WHERE r.company_id = p_company AND r.ativo = true
       AND r.tipo IN ('quantidade', 'cargo', 'setor')
       AND (r.unidade_id IS NULL OR r.unidade_id = p_unidade)
       AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
       AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= p_data)
       AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
       AND (r.tipo <> 'cargo'
         OR NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc
               WHERE rc.regra_id = r.id AND rc.cargo_id = p_cargo)))
     ORDER BY (r.unidade_id IS NOT NULL) DESC, (r.tipo IN ('cargo', 'setor')) DESC,
              (r.dia_semana IS NOT NULL) DESC, r.vigencia_inicio DESC NULLS LAST
  LOOP
    v_setores := ARRAY[]::uuid[];
    IF rec.tipo = 'setor' THEN
      v_tem_regra_setor := true;
      SELECT coalesce(array_agg(rs.setor_id), ARRAY[]::uuid[]) INTO v_setores
        FROM public.dp_folga_limite_regra_setores rs WHERE rs.regra_id = rec.id;
      IF p_setor IS NULL THEN v_setor_nao_definido := true; CONTINUE; END IF;
      IF NOT (p_setor = ANY(v_setores)) THEN CONTINUE; END IF;
    END IF;

    SELECT count(*) INTO v_em_folga FROM public.dp_colaboradores c
     WHERE c.company_id = p_company AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (rec.tipo <> 'cargo'
         OR NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = rec.id)
         OR (p_cargo IS NOT NULL AND c.cargo_id = p_cargo))
       AND (rec.tipo <> 'setor' OR public.dp_setor_previsto_id(c.id, p_data) = ANY(v_setores))
       AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
       AND private.dp_folga_ocupa_vaga(c.id, p_data);

    v_reserva := CASE WHEN v_reserva_ativa THEN
      CASE rec.tipo
        WHEN 'setor' THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, p_cargo, p_data, p_setor)
        WHEN 'cargo' THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, p_cargo, p_data, NULL)
        ELSE public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, NULL, p_data, NULL)
      END ELSE 0 END;
    v_em_folga := COALESCE(v_em_folga, 0) + v_reserva;

    v_regras := v_regras || jsonb_build_object('regra_id', rec.id, 'nome', rec.nome, 'tipo', rec.tipo,
      'limite', rec.maximo, 'setores', to_jsonb(v_setores), 'em_folga', v_em_folga, 'reserva', v_reserva,
      'disponivel', GREATEST(rec.maximo - v_em_folga, 0), 'excedido', v_em_folga >= rec.maximo);
  END LOOP;

  SELECT x.regra INTO v_pior FROM jsonb_array_elements(v_regras) AS x(regra)
   ORDER BY ((x.regra->>'excedido')::boolean) DESC, (x.regra->>'disponivel')::int ASC LIMIT 1;

  IF v_pior IS NULL THEN
    -- Segunda a sexta sem limite configurado: referência = ativos da unidade com folga fixa no dia.
    IF v_wd BETWEEN 1 AND 5 AND p_unidade IS NOT NULL THEN
      SELECT count(*) INTO v_limite FROM public.dp_colaboradores c
       WHERE c.company_id = p_company AND c.unidade_id = p_unidade
         AND c.ativo = true AND c.deleted_at IS NULL AND c.folga_fixa_semana = v_wd;
      SELECT count(*) INTO v_em_folga FROM public.dp_colaboradores c
       WHERE c.company_id = p_company AND c.deleted_at IS NULL AND c.unidade_id = p_unidade
         AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
         AND private.dp_folga_ocupa_vaga(c.id, p_data);
      v_reserva := CASE WHEN v_reserva_ativa
        THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, NULL, p_data, NULL) ELSE 0 END;
      v_em_folga := COALESCE(v_em_folga, 0) + v_reserva;
      RETURN jsonb_build_object('limite', v_limite, 'origem', 'folga_fixa', 'regra_id', NULL, 'tipo', NULL,
        'por_cargo', false, 'por_setor', false,
        'setor_nao_definido', v_setor_nao_definido AND v_tem_regra_setor,
        'em_folga', v_em_folga, 'reserva', v_reserva, 'reserva_ativa', v_reserva_ativa,
        'disponivel', GREATEST(v_limite - v_em_folga, 0), 'excedido', v_em_folga >= v_limite,
        'regras', v_regras);
    END IF;
    RETURN jsonb_build_object('limite', NULL, 'origem', 'sem_limite', 'regra_id', NULL, 'tipo', NULL,
      'por_cargo', false, 'por_setor', false,
      'setor_nao_definido', v_setor_nao_definido AND v_tem_regra_setor,
      'em_folga', 0, 'reserva', 0, 'reserva_ativa', v_reserva_ativa,
      'disponivel', NULL, 'excedido', false, 'regras', v_regras);
  END IF;

  RETURN jsonb_build_object('limite', (v_pior->>'limite')::int, 'origem', 'regra_recorrente',
    'regra_id', v_pior->>'regra_id', 'tipo', v_pior->>'tipo',
    'por_cargo', (v_pior->>'tipo') = 'cargo', 'por_setor', (v_pior->>'tipo') = 'setor',
    'setor_nao_definido', v_setor_nao_definido, 'em_folga', (v_pior->>'em_folga')::int,
    'reserva', (v_pior->>'reserva')::int, 'reserva_ativa', v_reserva_ativa,
    'disponivel', (v_pior->>'disponivel')::int, 'excedido', (v_pior->>'excedido')::boolean,
    'regras', v_regras);
END;
$function$;

-- 4) Gatilho de validação: limite por data com contagem única, trava e exceção autorizada.
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_contingencia boolean := COALESCE(current_setting('dp.folga_auto_contingencia', true), 'off') = 'on';
  v_ignora_bloqueio boolean := COALESCE(current_setting('dp.folga_ignora_bloqueio', true), 'off') = 'on';
  v_excedente boolean := COALESCE(current_setting('dp.folga_excedente_autorizado', true), 'off') = 'on';
  v_limite int; v_qtd int; v_mensais int; v_teto int; v_bloq record; v_liberada boolean;
  v_fixa int; v_aniv record; v_bloq_individual boolean; v_socio boolean;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;

  SELECT unidade_id, folga_fixa_semana, lower(coalesce(vinculo_label, '')) IN ('socio', 'sócio')
    INTO v_unidade, v_fixa, v_socio
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  IF NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra AND NOT v_ignora_bloqueio THEN
    SELECT motivo, liberada_por_solicitacao, liberada INTO v_bloq
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id IS NULL OR unidade_id = v_unidade) AND regra_id IS NULL
     ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
    IF FOUND AND v_bloq.liberada_por_solicitacao IS NULL AND COALESCE(v_bloq.liberada, false) = false THEN
      RAISE EXCEPTION 'Data % está bloqueada administrativamente.', NEW.data USING ERRCODE = 'check_violation';
    END IF;
    IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
      SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false)) INTO v_liberada
        FROM public.dp_datas_bloqueadas
       WHERE company_id = NEW.company_id AND data = NEW.data
         AND (unidade_id IS NULL OR unidade_id = v_unidade)
       ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
      IF NOT COALESCE(v_liberada, false) THEN
        RAISE EXCEPTION 'Esta data está bloqueada por regra da empresa.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data AND (bl.fim IS NULL OR bl.fim >= NEW.data)) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Colaborador está bloqueado para marcar folga em %', NEW.data USING ERRCODE = 'check_violation';
  END IF;

  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') AND NOT v_contingencia AND NOT v_excedente THEN
    PERFORM private.dp_folga_lock_vaga(NEW.company_id, v_unidade, NEW.data);
    SELECT limite_folgas INTO v_limite FROM public.dp_dia_config
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id = v_unidade OR unidade_id IS NULL)
     ORDER BY (unidade_id IS NOT NULL) DESC LIMIT 1;
    IF v_limite IS NOT NULL AND v_limite > 0
       AND NOT (v_wd = 0 AND 0::smallint = ANY (COALESCE(public.dp_dias_fixos_folga(NEW.colaborador_id, NEW.data), '{}'::smallint[]))) THEN
      SELECT count(*) INTO v_qtd FROM public.dp_colaboradores c
       WHERE c.company_id = NEW.company_id AND c.deleted_at IS NULL
         AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
         AND c.id <> NEW.colaborador_id
         AND private.dp_folga_ocupa_vaga(c.id, NEW.data);
      IF v_qtd >= v_limite THEN
        RAISE EXCEPTION 'Limite diário de folgas (%) atingido em %', v_limite, NEW.data USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF v_self AND NOT COALESCE(v_socio, false) THEN
    IF v_wd IN (0, 6) AND NOT NEW.extra THEN
      SELECT folgas_fds_por_mes INTO v_teto FROM public.dp_config_dp WHERE company_id = NEW.company_id;
      v_teto := COALESCE(v_teto, 1);
      IF v_teto > 0 THEN
        SELECT count(*) INTO v_mensais FROM public.dp_folgas
         WHERE colaborador_id = NEW.colaborador_id AND extra = false AND status <> 'cancelada'
           AND EXTRACT(DOW FROM data) IN (0, 6)
           AND date_trunc('month', data) = date_trunc('month', NEW.data);
        IF v_mensais >= v_teto THEN
          RAISE EXCEPTION 'Você já atingiu o limite de % folga(s) de fim de semana neste mês.', v_teto USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
      RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT pa.colaborador_id INTO v_aniv FROM public.dp_prioridade_aniversario pa
      JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
     WHERE pa.company_id = NEW.company_id AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
       AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int AND pa.aniversariante = true
       AND c.data_nascimento IS NOT NULL AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
     LIMIT 1;
    IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
      RAISE EXCEPTION 'Data reservada para aniversariante.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Permissão por unidade em QUALQUER gravação de dp_folgas feita por membro da empresa
--    (cobre RPCs administrativas e chamadas diretas). Colaborador no portal e rotinas sem sessão passam.
CREATE OR REPLACE FUNCTION public.dp_folgas_guard_unidade()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_unidade uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members m
                  WHERE m.company_id = NEW.company_id AND m.user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF NOT public.unidade_liberada(NEW.company_id, v_unidade) THEN
    RAISE EXCEPTION 'FORBIDDEN_UNIDADE: você não tem permissão para gerenciar folgas desta unidade.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_folgas_guard_unidade() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS dp_folgas_guard_unidade ON public.dp_folgas;
CREATE TRIGGER dp_folgas_guard_unidade BEFORE INSERT OR UPDATE ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_folgas_guard_unidade();

-- 6) dp_folga_criar_admin: unidade, idempotência, trava e exceção autorizada auditada.
DROP FUNCTION IF EXISTS public.dp_folga_atribuir_admin_v2(uuid, date, text, uuid, date, text);
DROP FUNCTION IF EXISTS public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[]);

CREATE FUNCTION public.dp_folga_criar_admin(p_colaborador_id uuid, p_data date, p_tipo text DEFAULT 'normal'::text, p_extra boolean DEFAULT false, p_observacao text DEFAULT NULL::text, p_confirmar_deficit boolean DEFAULT false, p_substituir_ids uuid[] DEFAULT NULL::uuid[], p_autorizar_excedente boolean DEFAULT false, p_justificativa_excedente text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

-- 7) Triagem: intermitente não usa troca semanal nem troca de folga de fim de semana.
CREATE FUNCTION public.dp_folga_atribuir_admin_v2(p_colaborador uuid, p_data date, p_modo text, p_folga_substituir_id uuid DEFAULT NULL::uuid, p_data_trabalho date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_autorizar_excedente boolean DEFAULT false, p_justificativa_excedente text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT c.company_id, c.unidade_id, c.regime_trabalho::text INTO v_company, v_unidade, v_regime
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

REVOKE ALL ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[], boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_folga_atribuir_admin_v2(uuid, date, text, uuid, date, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[], boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_atribuir_admin_v2(uuid, date, text, uuid, date, text, boolean, text) TO authenticated, service_role;