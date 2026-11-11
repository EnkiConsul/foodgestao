-- As rotinas agendadas de feriado (convocação automática e régua D-10/D-5 do gestor)
-- rodam sem sessão; o resolvedor público exige sessão de membro e devolvia vazio,
-- então nenhum aviso de feriado era gerado. O cálculo passa a viver num núcleo privado
-- (fonte única), usado pelo resolvedor público após a checagem de acesso e pelas rotinas.
CREATE OR REPLACE FUNCTION private.dp_feriados_resolver_base(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; y int; d date; primeiro date; ultimo date; delta int;
BEGIN
  IF _unidade_id IS NULL OR _inicio IS NULL OR _fim IS NULL OR _fim < _inicio THEN RETURN; END IF;
  FOR r IN SELECT * FROM public.dp_unidade_feriados f WHERE f.unidade_id = _unidade_id AND f.ativo LOOP
    IF r.tipo = 'especifica' THEN
      IF r.data BETWEEN _inicio AND _fim THEN RETURN QUERY SELECT r.data, r.nome, r.id, r.tipo; END IF;
    ELSE
      FOR y IN GREATEST(EXTRACT(YEAR FROM _inicio)::int, COALESCE(r.ano_inicio, 0)) .. EXTRACT(YEAR FROM _fim)::int LOOP
        IF r.tipo = 'movel' THEN d := public.dp_feriado_movel_data(r.codigo_movel, y);
        ELSIF r.tipo = 'anual' THEN
          BEGIN d := make_date(y, r.mes, r.dia); EXCEPTION WHEN others THEN d := NULL; END;
        ELSE
          primeiro := make_date(y, r.mes, 1);
          IF r.ordinal = -1 THEN
            ultimo := (primeiro + INTERVAL '1 month - 1 day')::date;
            delta := (EXTRACT(DOW FROM ultimo)::int - r.dia_semana + 7) % 7; d := ultimo - delta;
          ELSE
            delta := (r.dia_semana - EXTRACT(DOW FROM primeiro)::int + 7) % 7; d := primeiro + delta + (r.ordinal - 1) * 7;
            IF EXTRACT(MONTH FROM d)::int <> r.mes THEN d := NULL; END IF;
          END IF;
        END IF;
        IF d IS NOT NULL AND d BETWEEN _inicio AND _fim THEN RETURN QUERY SELECT d, r.nome, r.id, r.tipo; END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.dp_feriados_resolver_base(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_feriados_resolver_base(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_feriados_resolver(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid;
BEGIN
  IF _unidade_id IS NULL OR _inicio IS NULL OR _fim IS NULL OR _fim < _inicio THEN RETURN; END IF;
  SELECT u.company_id INTO v_company FROM public.dp_unidades u WHERE u.id = _unidade_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (private.is_company_member(auth.uid(), v_company) OR private.is_company_owner(auth.uid(), v_company)) THEN RETURN; END IF;
  RETURN QUERY SELECT b.data, b.nome, b.feriado_id, b.tipo FROM private.dp_feriados_resolver_base(_unidade_id, _inicio, _fim) b;
END $$;

CREATE OR REPLACE FUNCTION private.dp_feriado_regua_gestor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u record; f record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_d int; v_etapa text; v_txt text; v_n int := 0;
BEGIN
  FOR u IN SELECT id, company_id, nome, COALESCE(convoca_feriados_automatico,false) auto FROM public.dp_unidades WHERE ativo = true LOOP
    FOR f IN SELECT DISTINCT ON (r.data) r.data, r.nome FROM private.dp_feriados_resolver_base(u.id, v_hoje + 5, v_hoje + 10) r ORDER BY r.data LOOP
      v_d := f.data - v_hoje;
      CONTINUE WHEN v_d NOT IN (10, 5);
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.dp_unidade_feriado_operacao o WHERE o.unidade_id = u.id AND o.data = f.data AND (o.fechada OR o.escala_confirmada_em IS NOT NULL));
      v_etapa := CASE WHEN v_d = 10 THEN 'd10' ELSE 'd5' END;
      v_txt := CASE
        WHEN NOT u.auto THEN 'A loja não usa convocação automática: ninguém está convocado. Monte a escala manual do dia. Incluir quem tem folga fixa nesse dia gera dobra ou folga compensatória.'
        WHEN v_d = 10 THEN 'Revise quem você não vai precisar no feriado. Até 5 dias antes a desconvocação é livre.'
        ELSE 'Último dia para desconvocar. A partir de amanhã, desconvocar (exceto a pedido do colaborador) mantém o pagamento do dia.' END;
      INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
      VALUES (u.company_id, 'feriado_convocacao',
        'Feriado ' || f.nome || ' em ' || to_char(f.data,'DD/MM') || ' — ' || u.nome || ' (faltam ' || v_d || ' dias)',
        v_txt, 'dp_unidades', u.id, true, 'feriado_' || v_etapa || ':' || u.id || ':' || f.data)
      ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('alertas', v_n);
END $$;
REVOKE ALL ON FUNCTION private.dp_feriado_regua_gestor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.dp_feriado_convocacao_notificar(_data_ref date DEFAULT NULL)
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
    FOR f IN SELECT DISTINCT ON (r.data) r.data, r.nome FROM private.dp_feriados_resolver_base(u.id, v_comp, v_fim) r ORDER BY r.data LOOP
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