-- Convocação automática de feriados (conforme ACT/CCT):
-- 1) não depende mais da janela de folgas do portal: lojas com a marcação pelo portal
--    desligada também avisam os convocados, no mesmo prazo (fechamento configurado + 3 dias);
-- 2) quem está na escala 12x36 nunca é convocado: o feriado segue o ciclo de plantões
--    e já é compensado (Art. 59-A, parágrafo único, da CLT);
-- 3) unidades inativas ficam de fora.
-- Aceita data de referência opcional para simulação; o agendamento diário segue chamando sem argumentos.
DROP FUNCTION IF EXISTS private.dp_feriado_convocacao_notificar();

CREATE FUNCTION private.dp_feriado_convocacao_notificar(_data_ref date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  u record; c record; f record; j jsonb;
  v_hoje date; v_fecha date; v_comp date; v_fim date;
  v_conv int; v_colab int := 0; v_gest int := 0; v_lista text;
BEGIN
  FOR u IN SELECT id, company_id, nome FROM public.dp_unidades
            WHERE convoca_feriados_automatico = true AND ativo = true ORDER BY company_id, id LOOP
    j := public.dp_folgas_janela_efetiva(u.company_id, u.id, _data_ref);
    v_hoje := (j->>'hoje')::date; v_fecha := (j->>'fecha_em')::date; v_comp := (j->>'competencia')::date;
    CONTINUE WHEN v_hoje IS NULL OR v_fecha IS NULL OR v_comp IS NULL;
    CONTINUE WHEN v_hoje < v_fecha + 3 OR v_hoje >= v_comp;
    v_fim := (date_trunc('month', v_comp) + interval '1 month - 1 day')::date;
    v_lista := NULL;
    FOR f IN SELECT DISTINCT ON (r.data) r.data, r.nome FROM public.dp_feriados_resolver_v2(u.id, v_comp, v_fim) r ORDER BY r.data LOOP
      IF EXISTS (SELECT 1 FROM public.dp_unidade_feriado_operacao o WHERE o.unidade_id = u.id AND o.data = f.data AND o.fechada) THEN
        v_lista := COALESCE(v_lista || '; ', '') || to_char(f.data, 'DD/MM') || ' ' || f.nome || ': loja fechada';
        CONTINUE;
      END IF;
      v_conv := 0;
      FOR c IN
        SELECT col.id, col.user_id FROM public.dp_colaboradores col
        LEFT JOIN LATERAL (
          SELECT ct.* FROM public.dp_colaborador_config_trabalho ct
          WHERE ct.colaborador_id = col.id AND ct.company_id = col.company_id
            AND ct.vigencia_inicio <= f.data AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= f.data)
          ORDER BY ct.vigencia_inicio DESC, ct.id LIMIT 1) cfg ON true
        WHERE col.company_id = u.company_id AND col.ativo = true AND col.deleted_at IS NULL
          AND COALESCE(cfg.unidade_id, col.unidade_id) = u.id
          AND COALESCE(col.regime::text, 'clt') NOT IN ('intermitente', 'freelancer', 'pj', 'mei')
          AND COALESCE(lower(col.vinculo_label), '') NOT LIKE 's_cio%'
          AND COALESCE(cfg.escala_modelo, 'semanal') <> '12x36'
          AND NOT private.dp_colab_afastado_em(col.id, f.data)
          AND NOT EXISTS (SELECT 1 FROM public.dp_folgas fo WHERE fo.colaborador_id = col.id
                            AND fo.data = f.data AND fo.status <> 'cancelada')
          AND NOT (CASE WHEN cfg.id IS NOT NULL THEN
                NOT COALESCE(cfg.folga_variavel, false) AND (
                  cfg.folga_fixa_dow = extract(dow FROM f.data)::int OR EXISTS (
                    SELECT 1 FROM public.dp_colaborador_config_dias d WHERE d.config_id = cfg.id
                      AND d.dow = extract(dow FROM f.data)::int AND d.trabalha = false))
              ELSE COALESCE(col.folga_fixa_semana = extract(dow FROM f.data)::int, false) END)
      LOOP
        v_conv := v_conv + 1;
        IF c.user_id IS NOT NULL THEN
          INSERT INTO public.dp_notificacoes(company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
          VALUES (u.company_id, c.user_id, c.id, 'feriado_convocacao',
            'Convocação para o feriado ' || to_char(f.data, 'DD/MM'),
            'Você está convocado(a) para trabalhar em ' || to_char(f.data, 'DD/MM') || ' (' || f.nome || ') na unidade ' || u.nome ||
            ', no seu horário habitual, conforme o acordo/convenção coletiva da categoria (art. 6º-A da Lei 10.101/2000 e art. 9º da Lei 605/1949). ' ||
            'O trabalho no feriado garante a contrapartida prevista no acordo (folga compensatória ou pagamento). Se precisar, você pode pedir dispensa ao gestor.',
            'dp_unidades', u.id, false, 'feriado_conv:' || c.id || ':' || f.data)
          ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
          v_colab := v_colab + 1;
        END IF;
      END LOOP;
      v_lista := COALESCE(v_lista || '; ', '') || to_char(f.data, 'DD/MM') || ' ' || f.nome || ': ' || v_conv || ' convocado(s)';
    END LOOP;
    IF v_lista IS NOT NULL THEN
      INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
      VALUES (u.company_id, 'feriado_convocacao', 'Feriados do próximo mês — convocados (' || u.nome || ')',
        'Os colaboradores escalados para os feriados do próximo mês foram avisados. ' || v_lista ||
        '. Não foram convocados: quem tem folga fixa no dia (incluí-lo gera dobra) e quem está na escala 12x36 (o feriado segue o ciclo de plantões, art. 59-A da CLT).',
        'dp_unidades', u.id, true, 'feriado_conv_gestor:' || u.id || ':' || v_comp)
      ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
      v_gest := v_gest + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('colaboradores', v_colab, 'gestores', v_gest);
END $$;
REVOKE ALL ON FUNCTION private.dp_feriado_convocacao_notificar(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_feriado_convocacao_notificar(date) TO service_role;
COMMENT ON FUNCTION private.dp_feriado_convocacao_notificar(date) IS 'Agendamento diário: avisa convocados dos feriados da próxima competência a partir do fechamento configurado + 3 dias, com ou sem janela de folgas pelo portal; 12x36 nunca é convocado.';