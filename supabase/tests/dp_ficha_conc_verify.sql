-- Concorrência da aplicação de ficha — VERIFICAÇÃO.
--
-- ⚠ Só em banco isolado/descartável (lê public.zz_ficha_conc_fix).

\set ON_ERROR_STOP on

DO $$
DECLARE
  f public.zz_ficha_conc_fix; imp public.dp_ficha_importacoes;
  n int; v_colab uuid; v_cfg uuid;
BEGIN
  SELECT * INTO f FROM public.zz_ficha_conc_fix;

  -- 1) o item disputado tem exatamente UM colaborador
  SELECT colaborador_id INTO v_colab FROM public.dp_ficha_importacao_itens WHERE id = f.it1;
  IF v_colab IS NULL THEN RAISE EXCEPTION 'FALHA C1: item disputado sem cadastro'; END IF;
  SELECT count(*) INTO n FROM public.dp_colaboradores
   WHERE company_id = f.company_a AND cpf = '11144477735';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C1: % cadastros para o mesmo CPF', n; END IF;

  -- 2) nenhuma jornada/dia duplicado pela corrida
  SELECT count(*) INTO n FROM public.dp_colaborador_config_trabalho WHERE colaborador_id = v_colab;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C2: % configurações vigentes', n; END IF;
  SELECT id INTO v_cfg FROM public.dp_colaborador_config_trabalho
   WHERE colaborador_id = v_colab AND vigencia_fim IS NULL;
  SELECT count(*) INTO n FROM public.dp_colaborador_config_dias WHERE config_id = v_cfg;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA C2: % dias gravados (esperado 2)', n; END IF;

  -- 3) os três itens do lote aplicados e contadores exatos (sem contagem perdida)
  SELECT count(*) INTO n FROM public.dp_ficha_importacao_itens
   WHERE importacao_id = f.imp_a AND status = 'criado';
  IF n <> 3 THEN RAISE EXCEPTION 'FALHA C3: % itens criados (esperado 3)', n; END IF;

  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.criados <> 3 OR imp.atualizados <> 0 THEN
    RAISE EXCEPTION 'FALHA C3: contadores errados (%/%)', imp.criados, imp.atualizados;
  END IF;
  IF imp.status <> 'concluida' THEN
    RAISE EXCEPTION 'FALHA C3: lote sem pendências não concluído (%)', imp.status;
  END IF;

  RAISE NOTICE 'OK C1-C3: corrida no mesmo item e em itens do mesmo lote sem duplicar cadastro, jornada, dias ou contadores (7 casos)';
END $$;
