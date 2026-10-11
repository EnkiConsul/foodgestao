CREATE OR REPLACE FUNCTION private.dp_folga_janela_lembretes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a record; c record; j jsonb; v_empresa_ant uuid;
  v_hoje date; v_abre date; v_fecha date; v_comp date;
  v_dias int[]; v_exig int; v_pend int; v_colab int := 0; v_gest int := 0;
BEGIN
  -- Uma empresa por vez, com pausa entre empresas e entre avisos, para não pesar o sistema.
  FOR a IN SELECT DISTINCT company_id, unidade_id FROM public.dp_colaboradores
            WHERE deleted_at IS NULL AND ativo IS NOT false ORDER BY company_id, unidade_id LOOP
    IF v_empresa_ant IS NOT NULL AND v_empresa_ant <> a.company_id THEN PERFORM pg_sleep(2); END IF;
    v_empresa_ant := a.company_id;
    j := public.dp_folgas_janela_efetiva(a.company_id, a.unidade_id, NULL);
    CONTINUE WHEN NOT COALESCE((j->>'ativa')::boolean, false);
    v_hoje := (j->>'hoje')::date; v_abre := (j->>'abre_em')::date; v_fecha := (j->>'fecha_em')::date;
    v_comp := (j->>'competencia')::date; v_exig := COALESCE((j->>'folgas_exigidas')::int, 1);
    CONTINUE WHEN v_hoje IS NULL OR v_fecha IS NULL OR v_exig <= 0;
    v_dias := public.dp_folga_dias_fds_aplicaveis(a.company_id, a.unidade_id);
    CONTINUE WHEN v_dias IS NULL OR array_length(v_dias, 1) IS NULL;
    v_pend := 0;
    FOR c IN SELECT id, user_id FROM public.dp_colaboradores
              WHERE company_id = a.company_id AND unidade_id IS NOT DISTINCT FROM a.unidade_id
                AND deleted_at IS NULL AND ativo IS NOT false ORDER BY id LOOP
      CONTINUE WHEN NOT public.dp_folga_exige_descanso_fds(a.company_id, c.id, v_dias, v_comp);
      CONTINUE WHEN COALESCE(public.dp_folga_marcadas_no_mes(a.company_id, c.id, v_comp, v_dias), 0) >= v_exig;
      v_pend := v_pend + 1;
      IF c.user_id IS NOT NULL AND v_hoje BETWEEN v_abre AND v_fecha THEN
        INSERT INTO public.dp_notificacoes(company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
        VALUES (a.company_id, c.user_id, c.id, 'folga_janela_lembrete',
          CASE WHEN v_hoje = v_abre THEN 'Escolha de folga disponível' ELSE 'Lembrete: marque sua folga' END,
          'Escolha sua folga do mês até ' || to_char(v_fecha, 'DD/MM') || '.',
          'dp_folgas', c.id, false, 'folga_janela:' || c.id || ':' || v_hoje)
        ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
        v_colab := v_colab + 1;
        PERFORM pg_sleep(0.05);
      END IF;
    END LOOP;
    IF v_pend > 0 AND v_hoje = v_fecha + 1 THEN
      INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
      VALUES (a.company_id, 'folga_pendentes_gestor', 'Colaboradores sem folga escolhida',
        v_pend || ' colaborador(es) não marcaram a folga do mês. Defina hoje; amanhã o sistema atribui automaticamente, sem usar datas bloqueadas.',
        'dp_folgas', COALESCE(a.unidade_id, a.company_id), true,
        'folga_pend_gestor:' || a.company_id || ':' || COALESCE(a.unidade_id::text, '-') || ':' || v_comp)
      ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
      v_gest := v_gest + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('colaboradores', v_colab, 'gestores', v_gest);
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_janela_lembretes() FROM PUBLIC;

SELECT cron.unschedule('dp-folga-janela-lembretes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dp-folga-janela-lembretes');
SELECT cron.schedule('dp-folga-janela-lembretes', '0 11 * * *', $$SELECT private.dp_folga_janela_lembretes();$$);