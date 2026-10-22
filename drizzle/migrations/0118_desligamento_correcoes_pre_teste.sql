ALTER TABLE public.dp_desligamento_eventos DROP CONSTRAINT IF EXISTS dp_desligamento_eventos_tipo_check;
ALTER TABLE public.dp_desligamento_eventos ADD CONSTRAINT dp_desligamento_eventos_tipo_check CHECK (tipo IN (
  'aberto','datas_alteradas','condicoes_alteradas','suspenso','retomado','ocorrencia','revisao',
  'reconsideracao_solicitada','reconsideracao_aceita','reconsideracao_recusada',
  'cancelado','agenda_suspensa','agenda_restaurada','efetivado','efetivacao_falhou',
  'alerta_d2','alerta_prazo','alerta_sugestao','alerta_prazo_vencido','termino_antecipado',
  'pos_atualizado','encerrado_admin'));

-- Agenda: inserção individual de trabalho depois do limite falha com mensagem (sem sucesso falso).
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
  IF TG_TABLE_NAME = 'dp_escala_itens' AND NEW.tipo <> 'trabalho' THEN RETURN NEW; END IF; -- folga/feriado/férias seguem
  RAISE EXCEPTION 'Colaborador em aviso prévio: o último dia de trabalho é %. Não é possível escalar trabalho depois dessa data.', to_char(v_lim,'DD/MM/YYYY') USING HINT = 'aviso_previo_agenda';
END $$;

-- Geração mensal em lote: descarta antes de gravar o trabalho incompatível e informa quantos.
CREATE OR REPLACE FUNCTION public.dp_escala_gerar_mes(p_competencia text, p_unidade_id uuid, p_itens jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_comp text := NULLIF(btrim(COALESCE(p_competencia, '')), '');
  e public.dp_escalas%ROWTYPE;
  v_total integer;
  v_antes integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF v_comp IS NULL OR v_comp !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o mês da escala.' USING ERRCODE = '22023';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT: nenhum dia recebido.' USING ERRCODE = '22023';
  END IF;

  IF p_unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = p_unidade_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: unidade não encontrada.' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT (i->>'colaborador_id')::uuid INTO v_company FROM jsonb_array_elements(p_itens) i LIMIT 1;
    SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = v_company;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a unidade da escala.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a responsáveis da empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.dp_escala_fila(v_company, p_unidade_id, v_comp);

  e := private.dp_escala_garantir(v_company, p_unidade_id, v_comp, v_uid);

  IF e.status = 'publicada' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA: reabra a escala antes de alterar os dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_antes := jsonb_array_length(p_itens);
  SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) INTO p_itens
    FROM jsonb_array_elements(p_itens) i
   WHERE NOT (i->>'tipo' = 'trabalho'
              AND (i->>'data')::date > COALESCE(public.dp_desligamento_limite_agenda((i->>'colaborador_id')::uuid), 'infinity'::date));

  PERFORM private.dp_escala_itens_conferir(v_company, p_unidade_id, v_comp, p_itens);
  v_total := private.dp_escala_itens_gravar(v_company, e.id, p_itens);

  UPDATE public.dp_escalas SET updated_at = now() WHERE id = e.id;

  RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'itens', v_total,
                            'ignorados_aviso_previo', v_antes - jsonb_array_length(p_itens));
END;
$function$;

-- Alertas de um processo (usado pelo worker e logo após confirmar/alterar na Edge). Idempotente por chave.
CREATE OR REPLACE FUNCTION public.dp_desligamento_alertas_processo(p_processo uuid, p_hoje date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := COALESCE(p_hoje, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v public.dp_desligamento_processos%ROWTYPE;
  n int := 0;
BEGIN
  SELECT * INTO v FROM public.dp_desligamento_processos WHERE id = p_processo;
  IF NOT FOUND OR v.encerrado_admin_em IS NOT NULL THEN RETURN 0; END IF;

  IF v.status = 'aviso_em_curso' AND v.data_efetiva - hoje BETWEEN 0 AND 2 THEN
    INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
    VALUES (v.id, v.company_id, 'alerta_d2', 'd2:' || v.versao || ':' || v.data_efetiva, v.versao, jsonb_build_object('data_efetiva', v.data_efetiva))
    ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
    IF FOUND THEN
      n := n + 1;
      PERFORM public.dp_desligamento_notificar(v, true, 'Desligamento em ' || to_char(v.data_efetiva, 'DD/MM'),
        'Último dia do vínculo em ' || to_char(v.data_efetiva,'DD/MM/YYYY') || '. Prazo de pagamento: ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') ||
        ' (sugestão para a empresa: até ' || to_char(v.sugestao_pagamento,'DD/MM/YYYY') || ').', 'desl-d2:' || v.id || ':' || v.versao);
    END IF;
  END IF;

  IF v.status IN ('aviso_em_curso','efetivado') AND v.pagamento_status <> 'pago' THEN
    -- Sugestão (só gestão): pode antecipar mais de 2 dias com feriados seguidos.
    IF v.sugestao_pagamento IS NOT NULL AND v.sugestao_pagamento <> v.prazo_10_dias AND v.sugestao_pagamento - hoje BETWEEN 0 AND 2 THEN
      INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
      VALUES (v.id, v.company_id, 'alerta_sugestao', 'sugestao:' || v.sugestao_pagamento, v.versao, jsonb_build_object('sugestao_pagamento', v.sugestao_pagamento))
      ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
      IF FOUND THEN
        n := n + 1;
        PERFORM public.dp_desligamento_notificar(v, true, 'Sugestão de pagamento da rescisão',
          'Para TED/compensação, a sugestão é pagar até ' || to_char(v.sugestao_pagamento,'DD/MM/YYYY') ||
          '. O prazo legal (10º dia corrido) é ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') || '.', 'desl-sug:' || v.id || ':' || v.sugestao_pagamento);
      END IF;
    END IF;
    IF v.prazo_10_dias - hoje BETWEEN 0 AND 2 THEN
      INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
      VALUES (v.id, v.company_id, 'alerta_prazo', 'prazo:' || v.prazo_10_dias, v.versao, jsonb_build_object('prazo_10_dias', v.prazo_10_dias))
      ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
      IF FOUND THEN
        n := n + 1;
        PERFORM public.dp_desligamento_notificar(v, true, 'Prazo de pagamento da rescisão',
          'Vence em ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') || '. Sugestão para a empresa: pagar até ' || to_char(v.sugestao_pagamento,'DD/MM/YYYY') || '.',
          'desl-prazo:' || v.id || ':' || v.prazo_10_dias);
      END IF;
    ELSIF v.prazo_10_dias < hoje THEN
      INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois)
      VALUES (v.id, v.company_id, 'alerta_prazo_vencido', 'vencido:' || v.prazo_10_dias, v.versao, jsonb_build_object('prazo_10_dias', v.prazo_10_dias))
      ON CONFLICT (processo_id, idempotency_key) DO NOTHING;
      IF FOUND THEN
        n := n + 1;
        PERFORM public.dp_desligamento_notificar(v, true, 'Prazo de pagamento da rescisão vencido',
          'O prazo legal terminou em ' || to_char(v.prazo_10_dias,'DD/MM/YYYY') || ' e o pagamento não foi informado como feito.',
          'desl-venc:' || v.id || ':' || v.prazo_10_dias);
      END IF;
    END IF;
  END IF;
  RETURN n;
END $$;

-- Worker: mesma efetivação; alertas delegados à função por processo.
CREATE OR REPLACE FUNCTION public.dp_desligamento_processar(p_hoje date DEFAULT NULL, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := COALESCE(p_hoje, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v public.dp_desligamento_processos%ROWTYPE;
  c record;
  ef int := 0; rev int := 0; fal int := 0; al int := 0;
  snap jsonb;
BEGIN
  FOR v IN SELECT * FROM public.dp_desligamento_processos WHERE status IN ('aviso_em_curso','efetivado') AND encerrado_admin_em IS NULL LOOP
    IF p_simular THEN
      IF v.status = 'aviso_em_curso' AND v.data_efetiva - hoje BETWEEN 0 AND 2 THEN al := al + 1; END IF;
      CONTINUE;
    END IF;
    al := al + public.dp_desligamento_alertas_processo(v.id, hoje);
  END LOOP;

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

-- Transições: retomada fail-closed, término por novo emprego (Súmula 276) e alteração vedada durante suspensão.
CREATE OR REPLACE FUNCTION public.dp_desligamento_transicao(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.dp_desligamento_processos%ROWTYPE;
  a text := p->>'acao';
  k text := p->>'idempotency_key';
  ator uuid := (p->>'ator')::uuid;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  n public.dp_desligamento_processos%ROWTYPE;
  tipo_ev text;
  d date;
BEGIN
  SELECT * INTO v FROM public.dp_desligamento_processos WHERE id = (p->>'processo_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
  IF k IS NULL OR length(k) < 8 THEN RAISE EXCEPTION 'Chave de confirmação ausente'; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_desligamento_eventos WHERE processo_id = v.id AND idempotency_key = k) THEN
    RETURN jsonb_build_object('repetido', true);
  END IF;

  IF a = 'alterar' THEN
    IF v.status NOT IN ('aviso_em_curso','aguardando_revisao') THEN
      RAISE EXCEPTION 'Aviso suspenso por afastamento/impedimento: retome com evidência antes de alterar.';
    END IF;
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
      PERFORM public.dp_desligamento_notificar(n, false, 'Aviso prévio encerrado por reconsideração',
        'O aviso prévio foi encerrado e o seu vínculo continua.', 'desl-rec:' || n.id);
    ELSIF p->>'resultado' = 'recusada' THEN
      n := v; tipo_ev := 'reconsideracao_recusada';
    ELSE RAISE EXCEPTION 'Informe se a reconsideração foi aceita ou recusada'; END IF;
  ELSIF a = 'ocorrencia' THEN
    IF v.status NOT IN ('aviso_em_curso','suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Ocorrência só durante o aviso'; END IF;
    IF p->>'tipo' NOT IN ('dispensa_cumprimento','novo_emprego','afastamento','impedimento_legal','outro') THEN RAISE EXCEPTION 'Tipo de ocorrência inválido'; END IF;
    IF (p->>'aplicar_termino')::boolean IS TRUE THEN
      -- Súmula 276 TST: só aviso trabalhado, novo emprego comprovado; termina no último dia trabalhado.
      d := (p->>'data')::date;
      IF p->>'tipo' <> 'novo_emprego' OR v.modalidade <> 'trabalhado' THEN RAISE EXCEPTION 'Término antecipado automático só para novo emprego em aviso trabalhado.'; END IF;
      IF v.status = 'suspenso' THEN RAISE EXCEPTION 'Aviso suspenso: resolva o afastamento antes.'; END IF;
      IF d IS NULL OR d < v.data_comunicacao OR d >= v.data_efetiva THEN
        RAISE EXCEPTION 'O último dia trabalhado precisa estar dentro do aviso e antes de %.', to_char(v.data_efetiva,'DD/MM/YYYY');
      END IF;
      IF (p->>'prazo_10_dias')::date IS DISTINCT FROM d + 10 OR (p->>'sugestao_pagamento')::date > d + 10 OR (p->>'sugestao_pagamento')::date < d THEN
        RAISE EXCEPTION 'Prazo calculado inválido';
      END IF;
      UPDATE public.dp_desligamento_processos SET
        status = 'aviso_em_curso', revisao_motivo = NULL,
        ultimo_comparecimento = CASE WHEN d > v.data_comunicacao THEN d ELSE NULL END,
        dispensado_desde = CASE WHEN d > v.data_comunicacao THEN NULL ELSE v.inicio_aviso END,
        data_efetiva = d, projecao_indenizada = d, base_quitacao = d, dias_indenizados = 0,
        prazo_10_dias = d + 10, sugestao_pagamento = (p->>'sugestao_pagamento')::date,
        publicado_em = now(), alterado_apos_comunicacao = true
       WHERE id = v.id RETURNING * INTO n;
      tipo_ev := 'termino_antecipado';
      PERFORM public.dp_desligamento_notificar(n, false, 'Datas do seu desligamento foram atualizadas',
        'Com o novo emprego, o vínculo termina no último dia trabalhado. Confira no portal.', 'desl-alt:' || n.id || ':' || n.versao);
    ELSE
      UPDATE public.dp_desligamento_processos SET
        status = CASE WHEN p->>'tipo' IN ('afastamento','impedimento_legal') THEN 'suspenso' ELSE 'aguardando_revisao' END,
        revisao_motivo = p->>'tipo'
       WHERE id = v.id RETURNING * INTO n;
      tipo_ev := 'ocorrencia';
      PERFORM public.dp_desligamento_notificar(n, true, 'Desligamento em revisão',
        'Uma ocorrência no aviso prévio pausou a efetivação automática. Revise na ficha.', 'desl-oc:' || n.id || ':' || n.versao);
    END IF;
  ELSIF a = 'retomar' THEN
    IF v.status NOT IN ('suspenso','aguardando_revisao') THEN RAISE EXCEPTION 'Processo não está pausado'; END IF;
    IF (p->>'confirmado')::boolean IS NOT TRUE OR length(btrim(coalesce(p->>'justificativa',''))) < 20 THEN
      RAISE EXCEPTION 'Informe a justificativa (mínimo 20 caracteres) e confirme a conferência.';
    END IF;
    IF v.revisao_motivo = 'dispensa_cumprimento' THEN
      RAISE EXCEPTION 'Dispensa do cumprimento pela empresa depende de análise: faça o término pelo registro manual com a contabilidade.';
    END IF;
    IF v.status = 'suspenso' THEN
      d := (p->>'fim_impedimento')::date;
      IF d IS NULL OR d > hoje THEN RAISE EXCEPTION 'Informe quando o afastamento/impedimento terminou (não pode ser futuro).'; END IF;
    END IF;
    IF v.data_efetiva <= hoje THEN
      RAISE EXCEPTION 'O término registrado (%) já chegou: retomar efetivaria na hora. Altere as condições ou use o registro manual.', to_char(v.data_efetiva,'DD/MM/YYYY');
    END IF;
    IF EXISTS (SELECT 1 FROM public.dp_ferias_gozos WHERE colaborador_id = v.colaborador_id
                 AND status IN ('planejado','aprovado','em_gozo') AND (data_fim > v.data_efetiva OR hoje BETWEEN data_inicio AND data_fim)) THEN
      RAISE EXCEPTION 'Há férias em curso ou depois do término: revise as férias antes de retomar.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.dp_solicitacoes WHERE colaborador_id = v.colaborador_id AND removido_em IS NULL
                 AND status IN ('pendente','aprovada')
                 AND tipo IN ('atestado','licenca_maternidade','licenca_paternidade','servico_militar')
                 AND COALESCE(data_fim, data_alvo) >= hoje) THEN
      RAISE EXCEPTION 'Há atestado ou licença em curso ou futura: o aviso continua pausado.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.dp_ocorrencias WHERE colaborador_id = v.colaborador_id AND tipo = 'atestado'
                 AND estado <> 'cancelada' AND data_operacional BETWEEN hoje AND v.data_efetiva) THEN
      RAISE EXCEPTION 'Há atestado registrado no período restante do aviso: o aviso continua pausado.';
    END IF;
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
                       'fim_impedimento', p->>'fim_impedimento', 'confirmado', (p->>'confirmado')::boolean,
                       'nota', left(COALESCE(p->>'justificativa', p->>'nota'), 500)),
    ator);
  RETURN jsonb_build_object('repetido', false, 'status', n.status, 'versao', n.versao);
END $$;

-- Cancelamento: avisa o colaborador já comunicado (sem a justificativa interna).
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
  PERFORM public.dp_desligamento_notificar(v, false, 'Registro de desligamento cancelado',
    'O registro de aviso prévio foi cancelado pela empresa. Em caso de dúvida, fale com o RH.', 'desl-canc:' || p_processo);
END $$;

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_alertas_processo(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_alertas_processo(uuid, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_processar(date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_desligamento_cancelar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_processar(date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_cancelar(uuid, uuid, text) TO service_role;