ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'folga_janela_lembrete';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'folga_pendentes_gestor';

-- Lembretes diários da janela de escolha de folga (vira push pela fila de notificações):
-- abertura + lembrete diário ao colaborador pendente; D+1 do fechamento avisa o gestor.
CREATE OR REPLACE FUNCTION private.dp_folga_janela_lembretes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a record; c record; j jsonb;
  v_hoje date; v_abre date; v_fecha date; v_comp date;
  v_dias int[]; v_exig int; v_pend int; v_colab int := 0; v_gest int := 0;
BEGIN
  FOR a IN SELECT DISTINCT company_id, unidade_id FROM public.dp_colaboradores WHERE deleted_at IS NULL AND ativo IS NOT false LOOP
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
                AND deleted_at IS NULL AND ativo IS NOT false LOOP
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

-- Atribuição automática só em D+2 do fechamento (D+1 é o prazo do gestor).
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_todas(p_limite_alvos integer DEFAULT 2)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_alvo record; v_janela jsonb;
  v_processadas int := 0; v_geradas int := 0; v_pendentes int := 0;
  v_limite int := GREATEST(COALESCE(p_limite_alvos, 2), 1);
  v_res jsonb;
BEGIN
  FOR v_alvo IN SELECT DISTINCT c.company_id, c.unidade_id FROM public.dp_colaboradores c WHERE c.deleted_at IS NULL AND c.ativo IS NOT false LOOP
    v_janela := public.dp_folgas_janela_efetiva(v_alvo.company_id, v_alvo.unidade_id, NULL);
    CONTINUE WHEN NOT COALESCE((v_janela->>'ativa')::boolean, false);
    CONTINUE WHEN NOT COALESCE((v_janela->>'autoatribuir')::boolean, false);
    CONTINUE WHEN (v_janela->>'estado') <> 'encerrada';
    CONTINUE WHEN (v_janela->>'hoje')::date < (v_janela->>'fecha_em')::date + 2;
    IF EXISTS (SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes e
       WHERE e.company_id = v_alvo.company_id
         AND COALESCE(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_alvo.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND e.competencia = (v_janela->>'competencia')::date AND e.status = 'concluida') THEN
      CONTINUE;
    END IF;
    IF v_processadas >= v_limite THEN v_pendentes := v_pendentes + 1; CONTINUE; END IF;
    BEGIN
      v_res := public.dp_folga_autoatribuir_competencia(v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date);
      v_processadas := v_processadas + 1;
      v_geradas := v_geradas + COALESCE((v_res->>'geradas')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_processadas := v_processadas + 1;
      INSERT INTO public.dp_folga_autoatribuicao_execucoes(company_id, unidade_id, competencia, status, iniciada_em, erro)
      VALUES (v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date, 'erro', now(), SQLERRM)
      ON CONFLICT (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia)
      DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, updated_at = now();
    END;
  END LOOP;
  RETURN jsonb_build_object('processadas', v_processadas, 'geradas', v_geradas, 'pendentes', v_pendentes);
END;
$function$;

SELECT cron.unschedule('dp-folga-janela-lembretes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dp-folga-janela-lembretes');
SELECT cron.schedule('dp-folga-janela-lembretes', '0 12 * * *', $$SELECT private.dp_folga_janela_lembretes();$$);