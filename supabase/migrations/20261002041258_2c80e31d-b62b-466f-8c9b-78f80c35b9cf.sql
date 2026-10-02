CREATE OR REPLACE FUNCTION public.dp_ficha_historico_aplicar(
  p_item_id uuid, p_ferias jsonb, p_afastamentos jsonb, p_advertencias jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record; v_colab uuid; v_company uuid;
  r jsonb; v_ai date; v_af date; v_gi date; v_gf date; v_dias int;
  v_periodo uuid; v_data date; v_tipo dp_disciplinar_tipo; v_motivo text; v_desc text;
  n_fer int := 0; n_afa int := 0; n_adv int := 0; erros jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_item FROM dp_ficha_importacao_itens WHERE id = p_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Ficha não encontrada.'; END IF;
  v_company := v_item.company_id;
  IF NOT tem_permissao(v_company, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para lançar histórico de colaboradores.';
  END IF;
  v_colab := coalesce(v_item.colaborador_id, v_item.colaborador_existente_id);
  IF v_colab IS NULL OR NOT EXISTS (SELECT 1 FROM dp_colaboradores WHERE id = v_colab AND company_id = v_company) THEN
    RAISE EXCEPTION 'A ficha ainda não está ligada a um colaborador.';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_ferias, '[]'::jsonb)) LOOP
    BEGIN
      v_ai := nullif(r->>'aquisitivo_inicio','')::date;
      v_af := coalesce(nullif(r->>'aquisitivo_fim','')::date, (v_ai + interval '1 year' - interval '1 day')::date);
      v_gi := nullif(r->>'gozo_inicio','')::date;
      v_gf := nullif(r->>'gozo_fim','')::date;
      IF v_ai IS NULL OR v_gi IS NULL THEN CONTINUE; END IF;
      v_dias := coalesce(nullif(r->>'dias','')::int, (v_gf - v_gi) + 1);
      IF v_gf IS NULL THEN v_gf := v_gi + v_dias - 1; END IF;
      INSERT INTO dp_ferias_periodos (company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, observacao, criado_por)
      VALUES (v_company, v_colab, v_ai, v_af, (v_af + interval '1 year')::date, 'Importado da Ficha de Registro', auth.uid())
      ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;
      SELECT id INTO v_periodo FROM dp_ferias_periodos WHERE colaborador_id = v_colab AND inicio_aquisitivo = v_ai;
      IF NOT EXISTS (SELECT 1 FROM dp_ferias_gozos WHERE periodo_id = v_periodo AND data_inicio = v_gi AND status <> 'cancelado') THEN
        INSERT INTO dp_ferias_gozos (company_id, periodo_id, colaborador_id, data_inicio, data_fim, dias, status, origem,
          contabilidade_status, observacao, criado_por, aprovado_por, aprovado_em, aviso_retroativo)
        VALUES (v_company, v_periodo, v_colab, v_gi, v_gf, (v_gf - v_gi) + 1, 'concluido', 'importacao',
          'informada', 'Importado da Ficha de Registro', auth.uid(), auth.uid(), now(), true);
        n_fer := n_fer + 1;
      END IF;
    EXCEPTION WHEN others THEN
      erros := erros || jsonb_build_object('tipo','ferias','item',r,'erro',SQLERRM);
    END;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_advertencias, '[]'::jsonb)) LOOP
    BEGIN
      v_data := nullif(r->>'data','')::date;
      IF v_data IS NULL THEN CONTINUE; END IF;
      v_tipo := CASE WHEN r->>'tipo' = 'suspensao' THEN 'suspensao' ELSE 'advertencia_escrita' END::dp_disciplinar_tipo;
      v_motivo := left(coalesce(nullif(trim(r->>'motivo'),''), CASE WHEN v_tipo = 'suspensao' THEN 'Suspensão' ELSE 'Advertência' END) , 500);
      IF NOT EXISTS (SELECT 1 FROM dp_registros_disciplinares WHERE colaborador_id = v_colab AND tipo = v_tipo
                     AND data = v_data AND removido_em IS NULL AND descricao LIKE 'Importado da Ficha de Registro%') THEN
        INSERT INTO dp_registros_disciplinares (company_id, colaborador_id, tipo, data, motivo, descricao, suspensao_dias, aplicado_por)
        VALUES (v_company, v_colab, v_tipo, v_data, v_motivo, 'Importado da Ficha de Registro (histórico anterior ao sistema).',
          CASE WHEN v_tipo = 'suspensao' THEN nullif(r->>'dias','')::int END, auth.uid());
        n_adv := n_adv + 1;
      END IF;
    EXCEPTION WHEN others THEN
      erros := erros || jsonb_build_object('tipo','advertencia','item',r,'erro',SQLERRM);
    END;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_afastamentos, '[]'::jsonb)) LOOP
    BEGIN
      v_data := nullif(r->>'inicio','')::date;
      IF v_data IS NULL THEN CONTINUE; END IF;
      v_motivo := left('Afastamento: ' || coalesce(nullif(trim(r->>'motivo'),''), 'não informado'), 500);
      v_desc := 'Importado da Ficha de Registro · período ' || to_char(v_data,'DD/MM/YYYY') || ' a ' ||
                coalesce(to_char(nullif(r->>'fim','')::date,'DD/MM/YYYY'), 'não informado');
      IF NOT EXISTS (SELECT 1 FROM dp_registros_disciplinares WHERE colaborador_id = v_colab AND tipo = 'observacao'
                     AND data = v_data AND removido_em IS NULL AND descricao LIKE 'Importado da Ficha de Registro%') THEN
        INSERT INTO dp_registros_disciplinares (company_id, colaborador_id, tipo, data, motivo, descricao, aplicado_por)
        VALUES (v_company, v_colab, 'observacao', v_data, v_motivo, v_desc, auth.uid());
        n_afa := n_afa + 1;
      END IF;
    EXCEPTION WHEN others THEN
      erros := erros || jsonb_build_object('tipo','afastamento','item',r,'erro',SQLERRM);
    END;
  END LOOP;

  UPDATE dp_ficha_importacao_itens
     SET dados_extraidos = dados_extraidos || jsonb_build_object('historico_aplicado_em', now())
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ferias', n_fer, 'advertencias', n_adv, 'afastamentos', n_afa, 'erros', erros);
END $$;

REVOKE ALL ON FUNCTION public.dp_ficha_historico_aplicar(uuid, jsonb, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_historico_aplicar(uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;