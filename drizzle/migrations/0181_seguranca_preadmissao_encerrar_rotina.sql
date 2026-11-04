CREATE OR REPLACE FUNCTION public.dp_preadmissao_encerrar_rotina(_preadmissao_id uuid, _ator uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa record;
  v_colab uuid;
  v_hoje date;
  v_folgas int := 0;
  v_sol int := 0;
  v_trocas int := 0;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_ator uuid;
BEGIN
  SELECT id, company_id, admin_dados INTO pa
    FROM public.dp_preadmissoes WHERE id = _preadmissao_id;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;

  IF v_is_service THEN
    v_ator := _ator;
  ELSE
    v_ator := auth.uid();
    IF v_ator IS NULL OR NOT (
         COALESCE(private.is_company_admin_or_owner(v_ator, pa.company_id), false)
      OR COALESCE(public.is_super_admin(v_ator), false)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para encerrar a rotina desta pré-admissão.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_colab := NULLIF(COALESCE(pa.admin_dados, '{}'::jsonb)->'rotina'->>'colaborador_id', '')::uuid;
  IF v_colab IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'sem_rotina', true);
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  UPDATE public.dp_colaboradores
     SET ativo = false,
         data_desligamento = v_hoje,
         motivo_desligamento = 'outro'::dp_motivo_desligamento,
         desligado_em = now(),
         desligado_por = v_ator
   WHERE id = v_colab
     AND company_id = pa.company_id
     AND origem_cadastro = 'preadmissao_rotina'
     AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ja_encerrada', true);
  END IF;

  UPDATE public.dp_folgas
     SET status = 'cancelada'::dp_folga_status
   WHERE colaborador_id = v_colab
     AND status = 'agendada'::dp_folga_status
     AND data > v_hoje;
  GET DIAGNOSTICS v_folgas = ROW_COUNT;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada'::dp_solicitacao_status
   WHERE colaborador_id = v_colab
     AND status = 'pendente'::dp_solicitacao_status;
  GET DIAGNOSTICS v_sol = ROW_COUNT;

  UPDATE public.dp_trocas
     SET status = 'cancelada'::dp_troca_status
   WHERE (solicitante_id = v_colab OR destino_id = v_colab)
     AND status IN ('pendente_colega'::dp_troca_status, 'pendente_gestor'::dp_troca_status);
  GET DIAGNOSTICS v_trocas = ROW_COUNT;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'rotina_encerrada',
          jsonb_build_object('colaborador_id', v_colab, 'data_desligamento', v_hoje,
                             'folgas_canceladas', v_folgas, 'solicitacoes_canceladas', v_sol,
                             'trocas_canceladas', v_trocas,
                             'origem_chamada', CASE WHEN v_is_service THEN 'servidor' ELSE 'usuario' END),
          v_ator);

  RETURN jsonb_build_object('ok', true, 'colaborador_id', v_colab, 'data_desligamento', v_hoje,
                            'folgas_canceladas', v_folgas, 'solicitacoes_canceladas', v_sol,
                            'trocas_canceladas', v_trocas);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) TO service_role;