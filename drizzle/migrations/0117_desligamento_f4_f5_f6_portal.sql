ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'desligamento_aviso';

ALTER TABLE public.dp_desligamento_processos
  ADD COLUMN IF NOT EXISTS publicado_em timestamptz,
  ADD COLUMN IF NOT EXISTS alterado_apos_comunicacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revisao_motivo text,
  ADD COLUMN IF NOT EXISTS pagamento_previsto date,
  ADD COLUMN IF NOT EXISTS pagamento_status text NOT NULL DEFAULT 'pendente' CHECK (pagamento_status IN ('pendente','programado','pago')),
  ADD COLUMN IF NOT EXISTS pagamento_em date,
  ADD COLUMN IF NOT EXISTS pagamento_ref text,
  ADD COLUMN IF NOT EXISTS valor_informado numeric(12,2),
  ADD COLUMN IF NOT EXISTS pos_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS encerrado_admin_em timestamptz;
UPDATE public.dp_desligamento_processos SET publicado_em = comunicacao_confirmada_em WHERE publicado_em IS NULL;

ALTER TABLE public.dp_desligamento_eventos DROP CONSTRAINT IF EXISTS dp_desligamento_eventos_tipo_check;
ALTER TABLE public.dp_desligamento_eventos ADD CONSTRAINT dp_desligamento_eventos_tipo_check CHECK (tipo IN (
  'aberto','datas_alteradas','condicoes_alteradas','suspenso','retomado','ocorrencia','revisao',
  'reconsideracao_solicitada','reconsideracao_aceita','reconsideracao_recusada',
  'cancelado','agenda_suspensa','agenda_restaurada','efetivado','efetivacao_falhou',
  'alerta_d2','alerta_prazo','pos_atualizado','encerrado_admin'));

-- Guard: encerramento jurídico imutável; após efetivado só o acompanhamento pós.
CREATE OR REPLACE FUNCTION public.dp_desligamento_processo_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador inexistente'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.colaborador_id <> OLD.colaborador_id OR NEW.company_id <> OLD.company_id THEN
      RAISE EXCEPTION 'Vínculo e empresa do processo não podem mudar';
    END IF;
    IF OLD.status IN ('cancelado','reconsiderado') OR OLD.encerrado_admin_em IS NOT NULL THEN
      RAISE EXCEPTION 'Processo encerrado não pode ser alterado';
    END IF;
    IF OLD.status = 'efetivado' AND (NEW.status, NEW.motivo, NEW.modalidade, NEW.data_comunicacao, NEW.ultimo_comparecimento,
         NEW.dispensado_desde, NEW.data_efetiva, NEW.base_quitacao, NEW.prazo_10_dias, NEW.projecao_indenizada)
       IS DISTINCT FROM (OLD.status, OLD.motivo, OLD.modalidade, OLD.data_comunicacao, OLD.ultimo_comparecimento,
         OLD.dispensado_desde, OLD.data_efetiva, OLD.base_quitacao, OLD.prazo_10_dias, OLD.projecao_indenizada) THEN
      RAISE EXCEPTION 'Desligamento efetivado: datas e condições não podem mudar';
    END IF;
    NEW.versao := OLD.versao + 1;
    NEW.updated_at := now();
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END $$;

-- Agenda: folgas/DSR nunca bloqueadas (não são jornada). Bloqueia só trabalho.
DROP TRIGGER IF EXISTS trg_dp_desl_agenda ON public.dp_folgas;
CREATE OR REPLACE FUNCTION public.dp_desligamento_agenda_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim date;
BEGIN
  IF NEW.colaborador_id IS NULL THEN RETURN NEW; END IF;
  v_lim := public.dp_desligamento_limite_agenda(NEW.colaborador_id);
  IF v_lim IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'dp_ferias_gozos' THEN
    IF TG_OP = 'UPDATE' AND NEW.data_inicio IS NOT DISTINCT FROM OLD.data_inicio AND NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN RETURN NEW; END IF;
    IF NEW.data_fim > v_lim THEN
      RAISE EXCEPTION 'Colaborador em aviso prévio: férias depois do último dia de trabalho precisam de revisão do RH.' USING HINT = 'aviso_previo_agenda';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.data IS NOT DISTINCT FROM OLD.data AND (TG_TABLE_NAME <> 'dp_escala_itens' OR NEW.tipo IS NOT DISTINCT FROM OLD.tipo) THEN RETURN NEW; END IF;
  IF NEW.data <= v_lim THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'dp_escala_itens' THEN
    IF NEW.tipo <> 'trabalho' THEN RETURN NEW; END IF;      -- folga/feriado/férias seguem
    IF TG_OP = 'INSERT' THEN RETURN NULL; END IF;           -- geração em lote não cai
  END IF;
  RAISE EXCEPTION 'Colaborador em aviso prévio: não há jornada depois do último dia de trabalho.' USING HINT = 'aviso_previo_agenda';
END $$;

-- Registro legado no dia: com aviso aberto, só a data calculada é aceita.
CREATE OR REPLACE FUNCTION public.dp_desligamento_efetivar_por_legado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE;
BEGIN
  IF NEW.data_desligamento IS NULL OR OLD.data_desligamento IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.dp_desligamento_processos
   WHERE colaborador_id = NEW.id AND status IN ('aviso_em_curso','suspenso','aguardando_revisao') FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v.status <> 'aviso_em_curso' THEN
    RAISE EXCEPTION 'Há um aviso prévio em revisão para este colaborador. Resolva na aba Desligamento.' USING HINT = 'processo_em_revisao';
  END IF;
  IF NEW.data_desligamento <> v.data_efetiva THEN
    RAISE EXCEPTION 'Há aviso prévio registrado: o término é %. Use essa data ou altere o aviso.', to_char(v.data_efetiva,'DD/MM/YYYY') USING HINT = 'data_diferente_do_aviso';
  END IF;
  UPDATE public.dp_desligamento_processos SET status = 'efetivado' WHERE id = v.id;
  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, antes, depois, ator)
  VALUES (v.id, v.company_id, 'efetivado', 'efetivado:' || v.id, v.versao + 1,
          jsonb_build_object('status', v.status), jsonb_build_object('status','efetivado','data_desligamento', NEW.data_desligamento), auth.uid())
  ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dp_desligamento_notificar(v public.dp_desligamento_processos, p_admin boolean, p_titulo text, p_desc text, p_chave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF p_admin THEN
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    SELECT v.company_id, NULL, v.colaborador_id, 'desligamento_aviso', p_titulo, p_desc, 'dp_desligamento_processos', v.id, true, p_chave
     WHERE NOT EXISTS (SELECT 1 FROM public.dp_notificacoes WHERE chave = p_chave AND company_id = v.company_id);
  ELSE
    SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = v.colaborador_id;
    IF v_user IS NULL OR v.comunicacao_confirmada_em IS NULL THEN RETURN; END IF;
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    SELECT v.company_id, v_user, v.colaborador_id, 'desligamento_aviso', p_titulo, p_desc, 'dp_desligamento_processos', v.id, false, p_chave
     WHERE NOT EXISTS (SELECT 1 FROM public.dp_notificacoes WHERE chave = p_chave AND company_id = v.company_id);
  END IF;
END $$;

-- Transições do gestor (chamadas só pela Edge após auth + recálculo).
CREATE OR REPLACE FUNCTION public.dp_desligamento_transicao(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.dp_desligamento_processos%ROWTYPE;
  a text := p->>'acao';
  k text := p->>'idempotency_key';
  ator uuid := (p->>'ator')::uuid;
  n public.dp_desligamento_processos%ROWTYPE;
  tipo_ev text;
BEGIN
  SELECT * INTO v FROM public.dp_desligamento_processos WHERE id = (p->>'processo_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
  IF k IS NULL OR length(k) < 8 THEN RAISE EXCEPTION 'Chave de confirmação ausente'; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_desligamento_eventos WHERE processo_id = v.id AND idempotency_key = k) THEN
    RETURN jsonb_build_object('repetido', true);
  END IF;

  IF a = 'alterar' THEN
    IF v.status NOT IN ('aviso_em_curso','suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Aviso não pode ser alterado neste status'; END IF;
    UPDATE public.dp_desligamento_processos SET
      status = 'aviso_em_curso', revisao_motivo = NULL,
      modalidade = p->>'modalidade', reducao = NULLIF(p->>'reducao',''),
      data_comunicacao = (p->>'data_comunicacao')::date, inicio_aviso = (p->>'inicio_aviso')::date,
      ultimo_comparecimento = (p->>'ultimo_comparecimento')::date, dispensado_desde = (p->>'dispensado_desde')::date,
      data_efetiva = (p->>'data_efetiva')::date, projecao_indenizada = (p->>'projecao_indenizada')::date,
      base_quitacao = (p->>'base_quitacao')::date, prazo_10_dias = (p->>'prazo_10_dias')::date,
      sugestao_pagamento = (p->>'sugestao_pagamento')::date, dias_aviso = (p->>'dias_aviso')::int,
      dias_indenizados = (p->>'dias_indenizados')::int, regra_versao = p->>'regra_versao',
      publicado_em = now(), alterado_apos_comunicacao = true
     WHERE id = v.id RETURNING * INTO n;
    tipo_ev := 'condicoes_alteradas';
    PERFORM public.dp_desligamento_notificar(n, false, 'Datas do seu desligamento foram atualizadas',
      'Confira o último dia de trabalho e o prazo de pagamento no portal.', 'desl-alt:' || n.id || ':' || n.versao);
  ELSIF a = 'reconsideracao' THEN
    IF v.status NOT IN ('aviso_em_curso','suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Reconsideração só durante o aviso'; END IF;
    IF p->>'resultado' = 'aceita' THEN
      UPDATE public.dp_desligamento_processos SET status = 'reconsiderado' WHERE id = v.id RETURNING * INTO n;
      tipo_ev := 'reconsideracao_aceita';
    ELSIF p->>'resultado' = 'recusada' THEN
      n := v; tipo_ev := 'reconsideracao_recusada';
    ELSE RAISE EXCEPTION 'Informe se a reconsideração foi aceita ou recusada'; END IF;
  ELSIF a = 'ocorrencia' THEN
    IF v.status NOT IN ('aviso_em_curso','suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Ocorrência só durante o aviso'; END IF;
    IF p->>'tipo' NOT IN ('dispensa_cumprimento','novo_emprego','afastamento','impedimento_legal','outro') THEN RAISE EXCEPTION 'Tipo de ocorrência inválido'; END IF;
    UPDATE public.dp_desligamento_processos SET
      status = CASE WHEN p->>'tipo' IN ('afastamento','impedimento_legal') THEN 'suspenso' ELSE 'aguardando_revisao' END,
      revisao_motivo = p->>'tipo'
     WHERE id = v.id RETURNING * INTO n;
    tipo_ev := 'ocorrencia';
    PERFORM public.dp_desligamento_notificar(n, true, 'Desligamento em revisão',
      'Uma ocorrência no aviso prévio pausou a efetivação automática. Revise na ficha.', 'desl-oc:' || n.id || ':' || n.versao);
  ELSIF a = 'retomar' THEN
    IF v.status NOT IN ('suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Processo não está pausado'; END IF;
    UPDATE public.dp_desligamento_processos SET status = 'aviso_em_curso', revisao_motivo = NULL WHERE id = v.id RETURNING * INTO n;
    tipo_ev := 'retomado';
  ELSIF a = 'pos' THEN
    IF v.status NOT IN ('aviso_em_curso','suspenso','aguardando_revisao','efetivado') THEN RAISE EXCEPTION 'Processo encerrado'; END IF;
    IF p ? 'pagamento_status' AND p->>'pagamento_status' = 'pago' AND (p->>'pagamento_em') IS NULL THEN RAISE EXCEPTION 'Informe a data do pagamento'; END IF;
    UPDATE public.dp_desligamento_processos SET
      pagamento_previsto = CASE WHEN p ? 'pagamento_previsto' THEN (p->>'pagamento_previsto')::date ELSE pagamento_previsto END,
      pagamento_status = COALESCE(p->>'pagamento_status', pagamento_status),
      pagamento_em = CASE WHEN p ? 'pagamento_em' THEN (p->>'pagamento_em')::date ELSE pagamento_em END,
      pagamento_ref = CASE WHEN p ? 'pagamento_ref' THEN left(p->>'pagamento_ref', 120) ELSE pagamento_ref END,
      valor_informado = CASE WHEN p ? 'valor_informado' THEN (p->>'valor_informado')::numeric ELSE valor_informado END,
      pos_checklist = CASE WHEN p ? 'checklist' THEN pos_checklist || (p->'checklist') ELSE pos_checklist END
     WHERE id = v.id RETURNING * INTO n;
    tipo_ev := 'pos_atualizado';
    IF n.pagamento_status IS DISTINCT FROM v.pagamento_status OR n.pagamento_previsto IS DISTINCT FROM v.pagamento_previsto THEN
      PERFORM public.dp_desligamento_notificar(n, false, 'Pagamento da rescisão atualizado',
        'Confira a situação do pagamento no portal.', 'desl-pg:' || n.id || ':' || n.versao);
    END IF;
  ELSIF a = 'encerrar_admin' THEN
    IF v.status <> 'efetivado' THEN RAISE EXCEPTION 'Só é possível encerrar depois da efetivação'; END IF;
    UPDATE public.dp_desligamento_processos SET encerrado_admin_em = now() WHERE id = v.id RETURNING * INTO n;
    tipo_ev := 'encerrado_admin';
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, antes, depois, ator)
  VALUES (v.id, v.company_id, tipo_ev, k, n.versao,
    jsonb_build_object('status', v.status, 'ultimo_comparecimento', v.ultimo_comparecimento, 'data_efetiva', v.data_efetiva, 'prazo_10_dias', v.prazo_10_dias, 'pagamento_status', v.pagamento_status),
    jsonb_build_object('status', n.status, 'ultimo_comparecimento', n.ultimo_comparecimento, 'data_efetiva', n.data_efetiva, 'prazo_10_dias', n.prazo_10_dias,
                       'pagamento_status', n.pagamento_status, 'ocorrencia', p->>'tipo', 'data_ocorrencia', p->>'data', 'resultado', p->>'resultado',
                       'nota', left(p->>'nota', 500)),
    ator);
  RETURN jsonb_build_object('repetido', false, 'status', n.status, 'versao', n.versao);
END $$;

-- Registro inicial: publica e notifica o colaborador.
CREATE OR REPLACE FUNCTION public.dp_desligamento_pos_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.publicado_em := COALESCE(NEW.publicado_em, NEW.comunicacao_confirmada_em);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dp_desligamento_publicar ON public.dp_desligamento_processos;
CREATE TRIGGER dp_desligamento_publicar BEFORE INSERT ON public.dp_desligamento_processos
  FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_pos_registro();

-- Worker diário: alertas D-2/prazo e efetivação depois do último dia (fuso SP).
CREATE OR REPLACE FUNCTION public.dp_desligamento_processar(p_hoje date DEFAULT NULL, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := COALESCE(p_hoje, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v public.dp_desligamento_processos%ROWTYPE;
  c record;
  ef int := 0; rev int := 0; fal int := 0; al int := 0;
  snap jsonb;
BEGIN
  -- Alertas (D-2 corridos; registro tardio alerta no mesmo dia)
  FOR v IN SELECT * FROM public.dp_desligamento_processos WHERE status = 'aviso_em_curso' AND data_efetiva - hoje BETWEEN 0 AND 2 LOOP
    IF p_simular THEN al := al + 1; CONTINUE; END IF;
    INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
    VALUES (v.id, v.company_id, 'alerta_d2', 'd2:' || v.versao || ':' || v.data_efetiva, v.versao, jsonb_build_object('data_efetiva', v.data_efetiva))
    ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
    IF FOUND THEN
      al := al + 1;
      PERFORM public.dp_desligamento_notificar(v, true, 'Desligamento em ' || to_char(v.data_efetiva, 'DD/MM'),
        'Último dia do vínculo em ' || to_char(v.data_efetiva,'DD/MM/YYYY') || '. Prazo de pagamento: ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') ||
        ' (sugestão para a empresa: até ' || to_char(v.sugestao_pagamento,'DD/MM/YYYY') || ').', 'desl-d2:' || v.id || ':' || v.versao);
    END IF;
  END LOOP;
  FOR v IN SELECT * FROM public.dp_desligamento_processos WHERE status IN ('aviso_em_curso','efetivado') AND encerrado_admin_em IS NULL
            AND pagamento_status <> 'pago' AND prazo_10_dias - hoje BETWEEN 0 AND 2 LOOP
    IF p_simular THEN CONTINUE; END IF;
    INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
    VALUES (v.id, v.company_id, 'alerta_prazo', 'prazo:' || v.prazo_10_dias, v.versao, jsonb_build_object('prazo_10_dias', v.prazo_10_dias))
    ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
    IF FOUND THEN
      PERFORM public.dp_desligamento_notificar(v, true, 'Prazo de pagamento da rescisão',
        'Vence em ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') || '. Sugestão para a empresa: pagar até ' || to_char(v.sugestao_pagamento,'DD/MM/YYYY') || '.',
        'desl-prazo:' || v.id || ':' || v.prazo_10_dias);
    END IF;
  END LOOP;

  -- Efetivação: só depois de terminado o último dia (data_efetiva < hoje).
  FOR v IN SELECT * FROM public.dp_desligamento_processos WHERE status = 'aviso_em_curso' AND data_efetiva < hoje
            ORDER BY data_efetiva FOR UPDATE SKIP LOCKED LOOP
    IF p_simular THEN ef := ef + 1; CONTINUE; END IF;
    BEGIN
      SELECT id, ativo, data_desligamento, deleted_at INTO c FROM public.dp_colaboradores WHERE id = v.colaborador_id FOR UPDATE;
      IF c.data_desligamento IS NOT NULL OR NOT c.ativo OR c.deleted_at IS NOT NULL OR
         EXISTS (SELECT 1 FROM public.dp_ferias_gozos WHERE colaborador_id = v.colaborador_id
                  AND status IN ('aprovado','em_gozo','planejado') AND data_fim > v.data_efetiva) THEN
        UPDATE public.dp_desligamento_processos SET status = 'aguardando_revisao',
          revisao_motivo = CASE WHEN c.data_desligamento IS NOT NULL OR NOT c.ativo THEN 'vinculo_ja_alterado' ELSE 'ferias_conflitantes' END
         WHERE id = v.id;
        INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
        VALUES (v.id, v.company_id, 'revisao', 'revisao:' || v.versao, v.versao + 1, jsonb_build_object('motivo','impedimento_na_efetivacao'))
        ON CONFLICT DO NOTHING;
        PERFORM public.dp_desligamento_notificar(v, true, 'Desligamento precisa de revisão',
          'A efetivação automática foi pausada (férias ou cadastro em conflito). Revise na ficha.', 'desl-rev:' || v.id || ':' || v.versao);
        rev := rev + 1;
        CONTINUE;
      END IF;

      SELECT jsonb_build_object(
        'folgas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status','agendada')) FROM public.dp_folgas WHERE colaborador_id = v.colaborador_id AND status = 'agendada' AND data > v.data_efetiva), '[]'),
        'solicitacoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status','pendente')) FROM public.dp_solicitacoes WHERE colaborador_id = v.colaborador_id AND status = 'pendente'), '[]'),
        'trocas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status)) FROM public.dp_trocas WHERE (solicitante_id = v.colaborador_id OR destino_id = v.colaborador_id) AND status IN ('pendente_colega','pendente_gestor')), '[]')
      ) INTO snap;

      UPDATE public.dp_colaboradores SET data_desligamento = v.data_efetiva, motivo_desligamento = v.motivo WHERE id = v.colaborador_id;
      -- o gatilho legado marca o processo como efetivado (data conferida)
      UPDATE public.dp_folgas SET status = 'cancelada' WHERE colaborador_id = v.colaborador_id AND status = 'agendada' AND data > v.data_efetiva;
      UPDATE public.dp_solicitacoes SET status = 'cancelada' WHERE colaborador_id = v.colaborador_id AND status = 'pendente';
      UPDATE public.dp_trocas SET status = 'cancelada' WHERE (solicitante_id = v.colaborador_id OR destino_id = v.colaborador_id) AND status IN ('pendente_colega','pendente_gestor');
      INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, itens_agenda)
      VALUES (v.id, v.company_id, 'agenda_suspensa', 'agenda:' || v.id, v.versao + 1, snap) ON CONFLICT DO NOTHING;
      ef := ef + 1;
    EXCEPTION WHEN OTHERS THEN
      fal := fal + 1;
      INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
      VALUES (v.id, v.company_id, 'efetivacao_falhou', 'falha:' || hoje || ':' || v.versao, v.versao, jsonb_build_object('erro', left(SQLSTATE || ' ' || SQLERRM, 200)))
      ON CONFLICT DO NOTHING;
      PERFORM public.dp_desligamento_notificar(v, true, 'Falha ao efetivar desligamento',
        'A efetivação automática falhou e será tentada de novo. Se persistir, registre pela ficha.', 'desl-falha:' || v.id || ':' || hoje);
    END;
  END LOOP;
  RETURN jsonb_build_object('hoje', hoje, 'efetivados', ef, 'revisao', rev, 'falhas', fal, 'alertas', al, 'simulado', p_simular);
END $$;

-- Portal: só o próprio colaborador, só depois da comunicação formal, campos permitidos.
CREATE OR REPLACE FUNCTION public.dp_meu_desligamento()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status', CASE p.status WHEN 'efetivado' THEN 'desligado' WHEN 'aviso_em_curso' THEN 'em_aviso' ELSE 'em_revisao' END,
    'data_comunicacao', p.data_comunicacao,
    'ultimo_comparecimento', p.ultimo_comparecimento,
    'dispensado_desde', p.dispensado_desde,
    'data_efetiva', p.data_efetiva,
    'base_quitacao', p.base_quitacao,
    'prazo_10_dias', p.prazo_10_dias,
    'pagamento_previsto', p.pagamento_previsto,
    'pagamento_status', p.pagamento_status,
    'pagamento_em', CASE WHEN p.pagamento_status = 'pago' THEN p.pagamento_em END,
    'alterado', p.alterado_apos_comunicacao,
    'atualizado_em', p.publicado_em)
  FROM public.dp_desligamento_processos p
  WHERE p.colaborador_id = public.dp_meu_colaborador()
    AND p.comunicacao_confirmada_em IS NOT NULL
    AND p.status IN ('aviso_em_curso','suspenso','aguardando_revisao','efetivado')
  ORDER BY p.created_at DESC LIMIT 1
$$;

-- Desligamento manual legado com aviso aberto: só na data calculada.
CREATE OR REPLACE FUNCTION public.dp_desligamento_checar_legado(p_colab uuid, p_data date) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ef date; v_st text;
BEGIN
  SELECT data_efetiva, status INTO v_ef, v_st FROM public.dp_desligamento_processos
   WHERE colaborador_id = p_colab AND status IN ('aviso_em_curso','suspenso','aguardando_revisao');
  IF v_st IS NULL THEN RETURN; END IF;
  IF v_st <> 'aviso_em_curso' THEN RAISE EXCEPTION 'Há um aviso prévio em revisão. Resolva na aba Desligamento.'; END IF;
  IF p_data <> v_ef THEN RAISE EXCEPTION 'Há aviso prévio registrado com término em %. Use essa data.', to_char(v_ef,'DD/MM/YYYY'); END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_processar(date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_notificar(public.dp_desligamento_processos, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_pos_registro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_checar_legado(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_processar(date, boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.dp_meu_desligamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_desligamento() TO authenticated;