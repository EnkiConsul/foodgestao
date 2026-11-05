ALTER TABLE public.dp_unidade_feriado_operacao
  ADD COLUMN IF NOT EXISTS escala_confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS escala_confirmada_por uuid;
COMMENT ON COLUMN public.dp_unidade_feriado_operacao.escala_confirmada_em IS 'Gestor confirmou a escala do feriado: some do Resolva Rápido/Ações do Dia e a régua não avisa mais.';

CREATE OR REPLACE FUNCTION private.dp_feriado_regua_gestor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u record; f record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_d int; v_etapa text; v_txt text; v_n int := 0;
BEGIN
  FOR u IN SELECT id, company_id, nome, COALESCE(convoca_feriados_automatico,false) auto FROM public.dp_unidades WHERE ativo = true LOOP
    FOR f IN SELECT DISTINCT ON (r.data) r.data, r.nome FROM public.dp_feriados_resolver_v2(u.id, v_hoje + 5, v_hoje + 10) r ORDER BY r.data LOOP
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