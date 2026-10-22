-- Fase 3A: registro do aviso pelo servidor (Edge com motor TS) + proteção de agenda.
ALTER TABLE public.dp_desligamento_processos
  ADD COLUMN IF NOT EXISTS comunicacao_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS dias_aviso integer,
  ADD COLUMN IF NOT EXISTS dias_indenizados integer;
CREATE UNIQUE INDEX IF NOT EXISTS dp_desligamento_proc_idem
  ON public.dp_desligamento_processos (colaborador_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Grava processo + evento numa transação. Só service_role (Edge, após auth e recálculo).
CREATE OR REPLACE FUNCTION public.dp_desligamento_registrar_aviso(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_colab uuid := (p->>'colaborador_id')::uuid;
  v_key text := p->>'idempotency_key';
  v_existente public.dp_desligamento_processos%ROWTYPE;
  v_id uuid;
  v_limite date;
  v_conf jsonb;
BEGIN
  PERFORM 1 FROM public.dp_colaboradores
   WHERE id = v_colab AND ativo AND data_desligamento IS NULL AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não está ativo' USING HINT = 'colaborador_inativo'; END IF;

  SELECT * INTO v_existente FROM public.dp_desligamento_processos
   WHERE colaborador_id = v_colab AND status IN ('rascunho','aviso_em_curso','suspenso','aguardando_revisao');
  IF FOUND THEN
    IF v_existente.idempotency_key = v_key THEN
      RETURN jsonb_build_object('id', v_existente.id, 'repetido', true);
    END IF;
    RAISE EXCEPTION 'Já existe um desligamento em andamento para este colaborador' USING HINT = 'processo_aberto';
  END IF;

  v_limite := COALESCE((p->>'ultimo_comparecimento')::date, (p->>'dispensado_desde')::date - 1, (p->>'data_efetiva')::date);
  SELECT jsonb_build_object(
    'folgas', COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela','dp_folgas','id',id,'data',data,'status',status))
                FROM public.dp_folgas WHERE colaborador_id = v_colab AND status = 'agendada' AND data > v_limite), '[]'::jsonb),
    'ferias', COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela','dp_ferias_gozos','id',id,'inicio',data_inicio,'fim',data_fim,'status',status))
                FROM public.dp_ferias_gozos WHERE colaborador_id = v_colab AND status IN ('planejado','aprovado','em_gozo') AND data_fim >= (p->>'inicio_aviso')::date), '[]'::jsonb),
    'escala', (SELECT count(*) FROM public.dp_escala_itens WHERE colaborador_id = v_colab AND data > v_limite),
    'convocacoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela','dp_convocacoes','id',id,'data',data,'status',status))
                FROM public.dp_convocacoes WHERE colaborador_id = v_colab AND data > v_limite), '[]'::jsonb)
  ) INTO v_conf;

  INSERT INTO public.dp_desligamento_processos (
    colaborador_id, company_id, status, motivo, modalidade, reducao, regra_validada, regra_versao, calculado_por,
    data_comunicacao, inicio_aviso, ultimo_comparecimento, dispensado_desde, data_efetiva, projecao_indenizada,
    base_quitacao, prazo_10_dias, sugestao_pagamento, dias_aviso, dias_indenizados,
    comunicacao_confirmada_em, idempotency_key, criado_por)
  VALUES (
    v_colab, (SELECT company_id FROM public.dp_colaboradores WHERE id = v_colab), 'aviso_em_curso',
    (p->>'motivo')::public.dp_motivo_desligamento, p->>'modalidade', NULLIF(p->>'reducao',''), true, p->>'regra_versao', 'motor_servidor',
    (p->>'data_comunicacao')::date, (p->>'inicio_aviso')::date, (p->>'ultimo_comparecimento')::date, (p->>'dispensado_desde')::date,
    (p->>'data_efetiva')::date, (p->>'projecao_indenizada')::date, (p->>'base_quitacao')::date, (p->>'prazo_10_dias')::date,
    (p->>'sugestao_pagamento')::date, (p->>'dias_aviso')::int, (p->>'dias_indenizados')::int,
    now(), v_key, (p->>'ator')::uuid)
  RETURNING id INTO v_id;

  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois, itens_agenda, ator)
  VALUES (v_id, (SELECT company_id FROM public.dp_colaboradores WHERE id = v_colab), 'aberto', v_key, 1,
          p - 'ator' - 'idempotency_key', v_conf, (p->>'ator')::uuid);

  RETURN jsonb_build_object('id', v_id, 'repetido', false, 'conflitos', v_conf);
END $$;

-- Cancelamento de registro lançado por engano (sem efeito na agenda, que não foi alterada).
CREATE OR REPLACE FUNCTION public.dp_desligamento_cancelar(p_processo uuid, p_ator uuid, p_justificativa text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.dp_desligamento_processos WHERE id = p_processo FOR UPDATE;
  IF NOT FOUND OR v.status <> 'aviso_em_curso' THEN RAISE EXCEPTION 'Processo não está em andamento'; END IF;
  IF length(btrim(coalesce(p_justificativa,''))) < 5 THEN RAISE EXCEPTION 'Informe a justificativa'; END IF;
  UPDATE public.dp_desligamento_processos SET status = 'cancelado' WHERE id = p_processo;
  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, antes, depois, ator)
  VALUES (p_processo, v.company_id, 'cancelado', 'cancelar:' || p_processo, v.versao + 1,
          jsonb_build_object('status', v.status), jsonb_build_object('status','cancelado','justificativa', left(btrim(p_justificativa), 500)), p_ator);
END $$;

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_cancelar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_cancelar(uuid, uuid, text) TO service_role;

-- Desligamento legado gravado (no dia): fecha o aviso aberto e registra o evento.
CREATE OR REPLACE FUNCTION public.dp_desligamento_efetivar_por_legado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE;
BEGIN
  IF NEW.data_desligamento IS NULL OR OLD.data_desligamento IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.dp_desligamento_processos
   WHERE colaborador_id = NEW.id AND status = 'aviso_em_curso' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE public.dp_desligamento_processos SET status = 'efetivado' WHERE id = v.id;
  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, antes, depois, ator)
  VALUES (v.id, v.company_id, 'efetivado', 'efetivado:' || v.id, v.versao + 1,
          jsonb_build_object('status', v.status, 'data_efetiva', v.data_efetiva),
          jsonb_build_object('status','efetivado','data_desligamento_registrada', NEW.data_desligamento), auth.uid());
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_efetivar_por_legado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_dp_desligamento_efetivar_legado ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_desligamento_efetivar_legado AFTER UPDATE OF data_desligamento ON public.dp_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_efetivar_por_legado();

-- Agenda: só age para quem tem aviso em curso. Nada muda para os demais.
CREATE OR REPLACE FUNCTION public.dp_desligamento_limite_agenda(p_colab uuid) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ultimo_comparecimento, dispensado_desde - 1, data_efetiva)
    FROM public.dp_desligamento_processos
   WHERE colaborador_id = p_colab AND status = 'aviso_em_curso' LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_limite_agenda(uuid) FROM PUBLIC, anon, authenticated;

-- Itens gerados em lote (escala, folgas) são ignorados depois do último dia,
-- para não derrubar a geração da unidade inteira; ações individuais recusam.
CREATE OR REPLACE FUNCTION public.dp_desligamento_agenda_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim date; v_data date;
BEGIN
  IF NEW.colaborador_id IS NULL THEN RETURN NEW; END IF;
  v_lim := public.dp_desligamento_limite_agenda(NEW.colaborador_id);
  IF v_lim IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'dp_ferias_gozos' THEN
    IF TG_OP = 'UPDATE' AND NEW.data_inicio IS NOT DISTINCT FROM OLD.data_inicio AND NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN RETURN NEW; END IF;
    IF NEW.data_fim > v_lim THEN
      RAISE EXCEPTION 'Colaborador em aviso prévio: férias após o último dia de trabalho precisam de revisão do RH.' USING HINT = 'aviso_previo_agenda';
    END IF;
    RETURN NEW;
  END IF;
  v_data := NEW.data;
  IF TG_OP = 'UPDATE' AND v_data IS NOT DISTINCT FROM OLD.data THEN RETURN NEW; END IF;
  IF v_data <= v_lim THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('dp_escala_itens','dp_folgas') THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Colaborador em aviso prévio: não há jornada depois do último dia de trabalho.' USING HINT = 'aviso_previo_agenda';
END $$;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_agenda_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_desl_agenda ON public.dp_folgas;
CREATE TRIGGER trg_dp_desl_agenda BEFORE INSERT OR UPDATE OF data ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_agenda_guard();
DROP TRIGGER IF EXISTS trg_dp_desl_agenda ON public.dp_escala_itens;
CREATE TRIGGER trg_dp_desl_agenda BEFORE INSERT OR UPDATE OF data ON public.dp_escala_itens FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_agenda_guard();
DROP TRIGGER IF EXISTS trg_dp_desl_agenda ON public.dp_convocacoes;
CREATE TRIGGER trg_dp_desl_agenda BEFORE INSERT OR UPDATE OF data ON public.dp_convocacoes FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_agenda_guard();
DROP TRIGGER IF EXISTS trg_dp_desl_agenda ON public.dp_ferias_gozos;
CREATE TRIGGER trg_dp_desl_agenda BEFORE INSERT OR UPDATE OF data_inicio, data_fim ON public.dp_ferias_gozos FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_agenda_guard();