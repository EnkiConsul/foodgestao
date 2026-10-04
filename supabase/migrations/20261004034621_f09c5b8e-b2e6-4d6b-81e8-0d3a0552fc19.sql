DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean)'::regprocedure);
  d := replace(d, '_pendente_bloqueia boolean DEFAULT true)', '_pendente_bloqueia boolean DEFAULT true, _permitir_indisponivel boolean DEFAULT false)');
  d := replace(d, E'       AND i.cancelada_em IS NULL\n  ) THEN\n    RETURN jsonb_build_object(''apto'', false, ''motivo'', ''INDISPONIVEL_NA_DATA'');',
                  E'       AND i.cancelada_em IS NULL\n  ) AND NOT COALESCE(_permitir_indisponivel, false) THEN\n    RETURN jsonb_build_object(''apto'', false, ''motivo'', ''INDISPONIVEL_NA_DATA'');');
  IF position('_permitir_indisponivel, false) THEN' in d) = 0 THEN RAISE EXCEPTION 'patch avaliar falhou'; END IF;
  DROP FUNCTION public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean);
  EXECUTE d;
  REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean,boolean) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_candidato(uuid,uuid,uuid,boolean,boolean) TO service_role;

  d := pg_get_functiondef('public.dp_convocacao_publicar_grupo'::regproc);
  d := replace(d, 'dp_convocacao_avaliar_candidato(v_ocor.colaborador_alvo_id, v_ocor.id, NULL, true)', 'dp_convocacao_avaliar_candidato(v_ocor.colaborador_alvo_id, v_ocor.id, NULL, true, true)');
  d := replace(d, 'dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true)', 'dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true, v_restrito)');
  IF position('NULL, true, v_restrito)' in d) = 0 OR position('NULL, true, true)' in d) = 0 THEN RAISE EXCEPTION 'patch publicar falhou'; END IF;
  EXECUTE d;

  d := pg_get_functiondef('public.dp_convocacao_pre_avaliar_grupo'::regproc);
  d := replace(d, 'dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true)', 'dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true, (v_restrito OR v_grupo.modalidade = ''individual''))');
  d := replace(d, E'''motivo'', v_aval->>''motivo'',', E'''motivo'', v_aval->>''motivo'',\n        ''indisponivel'', EXISTS (SELECT 1 FROM public.dp_indisponibilidades i WHERE i.colaborador_id = v_cand.id AND i.data = v_ocor.data AND i.cancelada_em IS NULL),');
  IF position('''indisponivel''' in d) = 0 OR position('v_grupo.modalidade = ''individual''))' in d) = 0 THEN RAISE EXCEPTION 'patch pre falhou'; END IF;
  EXECUTE d;
END $mig$;

DROP FUNCTION public.dp_convocacao_colegas_substitutos(uuid);
CREATE FUNCTION public.dp_convocacao_colegas_substitutos(p_convocacao_id uuid)
 RETURNS TABLE(colaborador_id uuid, nome text, cargo_nome text, unidade_nome text, indisponivel boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_me uuid := public.dp_colaborador_ativo_of(auth.uid()); c public.dp_convocacoes%ROWTYPE; v_cargo uuid;
BEGIN
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = p_convocacao_id;
  IF NOT FOUND OR c.colaborador_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'FORBIDDEN: convocação não pertence a você.' USING ERRCODE='42501';
  END IF;
  SELECT cargo_id INTO v_cargo FROM public.dp_colaboradores WHERE id = c.colaborador_id;
  RETURN QUERY
  SELECT o.id, o.nome, cg.nome, u.nome,
         EXISTS (SELECT 1 FROM public.dp_indisponibilidades i WHERE i.colaborador_id = o.id
                  AND i.data = c.data AND i.cancelada_em IS NULL)
    FROM public.dp_colaboradores o
    LEFT JOIN public.dp_cargos cg ON cg.id = o.cargo_id
    LEFT JOIN public.dp_unidades u ON u.id = o.unidade_id
   WHERE o.company_id = c.company_id AND o.id <> c.colaborador_id
     AND o.ativo AND o.deleted_at IS NULL
     AND COALESCE(public.dp_regime_convocavel(o.regime), false)
     AND v_cargo IS NOT NULL AND o.cargo_id = v_cargo
     AND NOT EXISTS (SELECT 1 FROM public.dp_convocacoes x WHERE x.colaborador_id = o.id
                      AND x.data = c.data AND x.status IN ('pendente','aceita'))
   ORDER BY 5, o.nome;
END $f$;
REVOKE ALL ON FUNCTION public.dp_convocacao_colegas_substitutos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_colegas_substitutos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_meus_convites_troca(p_inicio date, p_fim date)
 RETURNS TABLE(substituicao_id uuid, data date, entrada time, saida time, unidade_nome text, solicitante_nome text, motivo text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT s.id, c.data, c.entrada, c.saida, u.nome, sol.nome, s.motivo
    FROM public.dp_convocacao_substituicoes s
    JOIN public.dp_convocacoes c ON c.id = s.convocacao_id AND c.company_id = s.company_id
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
    LEFT JOIN public.dp_colaboradores sol ON sol.id = s.solicitante_id
   WHERE s.colega_id IS NOT NULL
     AND s.colega_id = public.dp_colaborador_ativo_of(auth.uid())
     AND s.status = 'aguardando_colega'
     AND c.data BETWEEN p_inicio AND p_fim
   ORDER BY c.data;
$f$;
REVOKE ALL ON FUNCTION public.dp_meus_convites_troca(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_meus_convites_troca(date, date) TO authenticated, service_role;