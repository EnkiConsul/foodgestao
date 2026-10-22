-- Fluxo integral de desligamento: pedido de demissão (dispensa com/sem desconto),
-- acordo mútuo e motivos sem aviso. Campos aditivos de declaração e opção de desconto.
ALTER TABLE public.dp_desligamento_processos
  ADD COLUMN IF NOT EXISTS descontar_aviso boolean,
  ADD COLUMN IF NOT EXISTS pedido_escrito_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceite_empresa_confirmado boolean NOT NULL DEFAULT false;

-- Registro passa a gravar as declarações do pedido de demissão dispensado.
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

  -- Pedido de demissão dispensado pela empresa: as duas declarações são obrigatórias.
  IF (p->>'motivo') = 'pedido_demissao' AND (p->>'modalidade') = 'indenizado'
     AND (COALESCE((p->>'pedido_escrito_confirmado')::boolean, false) = false
          OR COALESCE((p->>'aceite_empresa_confirmado')::boolean, false) = false) THEN
    RAISE EXCEPTION 'Pedido de demissão dispensado exige pedido escrito do colaborador e aceite da empresa' USING HINT = 'declaracoes_pendentes';
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
    comunicacao_confirmada_em, idempotency_key, criado_por,
    descontar_aviso, pedido_escrito_confirmado, aceite_empresa_confirmado)
  VALUES (
    v_colab, (SELECT company_id FROM public.dp_colaboradores WHERE id = v_colab), 'aviso_em_curso',
    (p->>'motivo')::public.dp_motivo_desligamento, p->>'modalidade', NULLIF(p->>'reducao',''), true, p->>'regra_versao', 'motor_servidor',
    (p->>'data_comunicacao')::date, (p->>'inicio_aviso')::date, (p->>'ultimo_comparecimento')::date, (p->>'dispensado_desde')::date,
    (p->>'data_efetiva')::date, (p->>'projecao_indenizada')::date, (p->>'base_quitacao')::date, (p->>'prazo_10_dias')::date,
    (p->>'sugestao_pagamento')::date, (p->>'dias_aviso')::int, (p->>'dias_indenizados')::int,
    now(), v_key, (p->>'ator')::uuid,
    (p->>'descontar_aviso')::boolean,
    COALESCE((p->>'pedido_escrito_confirmado')::boolean, false),
    COALESCE((p->>'aceite_empresa_confirmado')::boolean, false))
  RETURNING id INTO v_id;

  INSERT INTO public.dp_desligamento_eventos (processo_id, company_id, tipo, idempotency_key, versao_processo, depois, itens_agenda, ator)
  VALUES (v_id, (SELECT company_id FROM public.dp_colaboradores WHERE id = v_colab), 'aberto', v_key, 1,
          p - 'ator' - 'idempotency_key', v_conf, (p->>'ator')::uuid);

  RETURN jsonb_build_object('id', v_id, 'repetido', false, 'conflitos', v_conf);
END $$;

REVOKE EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) TO service_role;