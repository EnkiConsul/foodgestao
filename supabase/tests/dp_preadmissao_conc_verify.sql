-- Concorrência da conclusão da Pré-Admissão — VERIFICAÇÃO.
--
-- ⚠ Só em banco isolado/descartável (lê public.zz_preadm_conc_fix).

\set ON_ERROR_STOP on

DO $$
DECLARE f public.zz_preadm_conc_fix; pa public.dp_preadmissoes; n int;
BEGIN
  SELECT * INTO f FROM public.zz_preadm_conc_fix;
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = f.preadmissao_a;

  -- 1) um único cadastro para o CPF disputado
  SELECT count(*) INTO n FROM public.dp_colaboradores
   WHERE company_id = f.company_a AND cpf = '11144477735';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C1: % cadastros para o mesmo CPF', n; END IF;

  -- 2) vínculo único e status concluído
  IF pa.colaborador_id IS NULL OR pa.status <> 'concluido' THEN
    RAISE EXCEPTION 'FALHA C2: pré-admissão não concluída (status=%, colab=%)', pa.status, pa.colaborador_id;
  END IF;
  IF pa.vinculo_admissao_em IS NULL THEN
    RAISE EXCEPTION 'FALHA C2: vínculo de admissão sem data';
  END IF;

  -- 3) nenhum efeito duplicado pela corrida
  SELECT count(*) INTO n FROM public.dp_preadmissao_eventos
   WHERE preadmissao_id = f.preadmissao_a AND evento = 'concluida';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C3: % eventos de conclusão (esperado 1)', n; END IF;

  SELECT count(*) INTO n FROM public.dp_documentos WHERE colaborador_id = pa.colaborador_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C3: % documentos migrados (esperado 1)', n; END IF;

  SELECT count(*) INTO n FROM public.dp_colaborador_config_trabalho
   WHERE colaborador_id = pa.colaborador_id AND vigencia_fim IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA C3: % configurações vigentes', n; END IF;

  RAISE NOTICE 'OK concorrência: uma conclusão efetiva, demais idempotentes';
END $$;
