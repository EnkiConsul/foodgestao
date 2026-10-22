-- Desistência da admissão (exclusão da ficha ou cancelamento do link) encerra
-- o cadastro provisório da rotina: a pessoa sai da operação, mas todo o
-- histórico de escalas, folgas e eventos desde o primeiro dia é preservado.

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
BEGIN
  SELECT id, company_id, admin_dados INTO pa
    FROM public.dp_preadmissoes WHERE id = _preadmissao_id;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
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
         desligado_por = _ator
   WHERE id = v_colab
     AND origem_cadastro = 'preadmissao_rotina'
     AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ja_encerrada', true);
  END IF;

  -- Agendas futuras deixam de fazer sentido; o passado fica intacto.
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
                             'trocas_canceladas', v_trocas),
          _ator);

  RETURN jsonb_build_object('ok', true, 'colaborador_id', v_colab, 'data_desligamento', v_hoje,
                            'folgas_canceladas', v_folgas, 'solicitacoes_canceladas', v_sol,
                            'trocas_canceladas', v_trocas);
END;
$function$;

-- Só o servidor chama (Edge com service_role ou outra rotina do banco).
REVOKE ALL ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_encerrar_rotina(uuid, uuid) TO service_role;

-- Excluir a ficha agora também encerra a rotina provisória, se houver.
CREATE OR REPLACE FUNCTION public.dp_preadmissao_excluir(_preadmissao_id uuid, _ator uuid, _motivo text DEFAULT NULL::text, _versao integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pa public.dp_preadmissoes;
  motivo text := NULLIF(btrim(COALESCE(_motivo, '')), '');
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = _preadmissao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Ficha não encontrada.');
  END IF;

  IF pa.removido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_removida', true);
  END IF;

  IF _versao IS NOT NULL AND pa.versao IS NOT NULL AND pa.versao <> _versao THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'A ficha mudou enquanto você estava nela. Abra novamente e tente de novo.');
  END IF;

  IF pa.status = 'concluido' OR pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Esta admissão já virou cadastro de colaborador e não pode ser excluída.');
  END IF;

  UPDATE public.dp_preadmissoes
     SET removido_em = now(),
         removido_por = _ator,
         removido_motivo = motivo,
         updated_at = now()
   WHERE id = pa.id;

  UPDATE public.dp_preadmissao_convites
     SET revoked_at = now()
   WHERE preadmissao_id = pa.id
     AND revoked_at IS NULL;

  -- Se a pessoa já atuava na rotina da loja, encerra o vínculo provisório
  -- preservando todo o histórico operacional.
  PERFORM public.dp_preadmissao_encerrar_rotina(pa.id, _ator);

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'ficha_excluida',
          jsonb_build_object('motivo', motivo, 'status_anterior', pa.status), _ator);

  RETURN jsonb_build_object('ok', true);
END;
$function$;