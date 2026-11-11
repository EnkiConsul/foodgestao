-- Troca de folga entre colegas passa a ser decidida só pela regra de troca da unidade
-- (troca_folga_modo/troca_folga_escopo), independente da escolha de folgas pelo portal.

CREATE OR REPLACE FUNCTION private.dp_troca_portal_exigir_permitida(_data_oferecida date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_colab uuid; v_company uuid; v_unidade uuid; v_modo text; v_escopo text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT company_id, unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores WHERE id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;

  SELECT c.troca_folga_modo, c.troca_folga_escopo INTO v_modo, v_escopo
    FROM public.dp_config_dp c
   WHERE c.company_id = v_company AND (c.unidade_id IS NULL OR c.unidade_id = v_unidade)
   ORDER BY (c.unidade_id IS NOT NULL) DESC LIMIT 1;

  IF COALESCE(v_modo, 'aprovacao_admin') = 'proibida' THEN
    RAISE EXCEPTION 'TROCA_PROIBIDA: as trocas de folga estão desativadas nesta unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_escopo := COALESCE(v_escopo, 'ambas');
  IF _data_oferecida IS NOT NULL THEN
    IF v_escopo = 'dominical' AND EXTRACT(DOW FROM _data_oferecida) <> 0 THEN
      RAISE EXCEPTION 'TROCA_FORA_DO_ESCOPO: nesta unidade a troca vale só para a folga dominical (DSR).'
        USING ERRCODE = 'check_violation';
    ELSIF v_escopo = 'semanal' AND EXTRACT(DOW FROM _data_oferecida) = 0 THEN
      RAISE EXCEPTION 'TROCA_FORA_DO_ESCOPO: nesta unidade a troca vale só para a folga semanal.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.dp_troca_portal_exigir_permitida(date) FROM PUBLIC, anon, authenticated;

-- Preserva o efeito atual: onde a escolha pelo portal está desligada, as trocas também
-- estavam barradas; fica registrado explicitamente como "Não permitida" para o gestor decidir.
UPDATE public.dp_config_dp
   SET troca_folga_modo = 'proibida'
 WHERE folga_marcacao_portal = false
   AND troca_folga_modo IS DISTINCT FROM 'proibida';

-- Troca proposta pelo colaborador: troca a trava da escolha pela regra de troca (corpo preservado).
DO $mig$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.dp_troca_propor(uuid,date,date,text)'::regprocedure);
  IF position('dp_troca_portal_exigir_permitida' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position('PERFORM private.dp_folga_portal_exigir_liberada();' IN v_def) = 0 THEN
    RAISE EXCEPTION 'dp_troca_propor sem a trava esperada';
  END IF;
  v_def := replace(v_def,
    'PERFORM private.dp_folga_portal_exigir_liberada();',
    'PERFORM private.dp_troca_portal_exigir_permitida(p_data_original);');
  EXECUTE v_def;
END $mig$;