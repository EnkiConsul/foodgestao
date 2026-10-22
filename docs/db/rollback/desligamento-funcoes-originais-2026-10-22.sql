-- Definições ORIGINAIS (antes da Fase 2), só para referência/auditoria.
-- NÃO reaplicar: reabre o P0 (desligamento futuro inativa na hora).

CREATE OR REPLACE FUNCTION public.dp_colaborador_desligamento_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias integer;
BEGIN
  IF NEW.ativo = false AND NEW.data_desligamento IS NULL THEN
    RAISE EXCEPTION 'Informe a data de demissão para desligar o colaborador';
  END IF;

  IF NEW.data_desligamento IS NOT NULL THEN
    NEW.ativo := false;
    SELECT COALESCE(dias_carencia_portal, 30) INTO v_dias
      FROM public.dp_pendencias_config WHERE company_id = NEW.company_id;
    v_dias := COALESCE(v_dias, 30);
    IF NEW.acesso_portal_ate IS NULL
       OR TG_OP = 'UPDATE' AND COALESCE(OLD.data_desligamento, '1900-01-01'::date) IS DISTINCT FROM NEW.data_desligamento THEN
      NEW.acesso_portal_ate := NEW.data_desligamento + v_dias;
    END IF;
    IF NEW.desligado_em IS NULL THEN
      NEW.desligado_em := now();
      NEW.desligado_por := COALESCE(NEW.desligado_por, auth.uid());
    END IF;
  ELSE
    NEW.ativo := COALESCE(NEW.ativo, true);
    NEW.acesso_portal_ate := NULL;
    NEW.motivo_desligamento := NULL;
    NEW.desligado_em := NULL;
    NEW.desligado_por := NULL;
    UPDATE public.dp_colaborador_desligamento_restrito
       SET encerrado_em = now()
     WHERE colaborador_id = NEW.id AND encerrado_em IS NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dp_desligar_colaborador(p_colaborador_id uuid, p_data_desligamento date, p_motivo dp_motivo_desligamento DEFAULT NULL::dp_motivo_desligamento, p_observacao text DEFAULT NULL::text, p_elegibilidade dp_elegibilidade_recontratacao DEFAULT NULL::dp_elegibilidade_recontratacao)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_folgas int := 0;
  v_sol int := 0;
  v_trocas int := 0;
  v_ate date;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para desligar colaboradores';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         desligado_por = auth.uid(),
         desligado_em = now(),
         acesso_portal_ate = NULL,
         ativo = false
   WHERE id = p_colaborador_id;

  PERFORM public.dp_set_desligamento_ressalvas(p_colaborador_id, p_observacao, p_elegibilidade);

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  UPDATE public.dp_folgas
     SET status = 'cancelada'::dp_folga_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'agendada'::dp_folga_status
     AND data > p_data_desligamento;
  GET DIAGNOSTICS v_folgas = ROW_COUNT;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada'::dp_solicitacao_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'pendente'::dp_solicitacao_status;
  GET DIAGNOSTICS v_sol = ROW_COUNT;

  UPDATE public.dp_trocas
     SET status = 'cancelada'::dp_troca_status
   WHERE (solicitante_id = p_colaborador_id OR destino_id = p_colaborador_id)
     AND status IN ('pendente_colega'::dp_troca_status, 'pendente_gestor'::dp_troca_status);
  GET DIAGNOSTICS v_trocas = ROW_COUNT;

  RETURN jsonb_build_object(
    'folgas_canceladas', v_folgas,
    'solicitacoes_canceladas', v_sol,
    'trocas_canceladas', v_trocas,
    'acesso_portal_ate', v_ate
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dp_editar_desligamento(p_colaborador_id uuid, p_data_desligamento date, p_motivo dp_motivo_desligamento DEFAULT NULL::dp_motivo_desligamento, p_observacao text DEFAULT NULL::text, p_elegibilidade dp_elegibilidade_recontratacao DEFAULT NULL::dp_elegibilidade_recontratacao)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_atual date;
  v_ate date;
BEGIN
  SELECT company_id, data_desligamento INTO v_company, v_atual
    FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para editar o desligamento';
  END IF;
  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'Colaborador não está desligado';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         acesso_portal_ate = CASE WHEN p_data_desligamento IS DISTINCT FROM v_atual THEN NULL ELSE acesso_portal_ate END
   WHERE id = p_colaborador_id;

  PERFORM public.dp_set_desligamento_ressalvas(p_colaborador_id, p_observacao, p_elegibilidade);

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  RETURN jsonb_build_object('acesso_portal_ate', v_ate);
END;
$function$
;
