-- =====================================================================
-- FASE 2 (parte 2) — Folgas pelo painel do DP sem escrita direta do app
-- Rollback no final (comentado).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dp_folga_admin_cancelar(
  p_folga_id uuid,
  p_solicitacao_id uuid,
  p_colaborador uuid,
  p_data date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_resposta text;
  v_folgas int := 0;
  v_solic int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colaborador e o dia.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_resposta := COALESCE('Cancelada pelo gestor: ' || v_motivo, 'Cancelada pelo gestor.');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_data::text, 0));

  IF p_folga_id IS NOT NULL THEN
    UPDATE public.dp_folgas f
       SET status = 'cancelada', observacao = v_resposta, updated_at = now()
     WHERE f.id = p_folga_id
       AND f.company_id = v_company
       AND f.colaborador_id = p_colaborador
       AND f.status <> 'cancelada';
    GET DIAGNOSTICS v_folgas = ROW_COUNT;
  END IF;

  UPDATE public.dp_solicitacoes s
     SET status = 'cancelada',
         resposta_admin = v_resposta,
         respondido_por = v_uid,
         respondido_em = now(),
         updated_at = now()
   WHERE s.company_id = v_company
     AND s.colaborador_id = p_colaborador
     AND s.tipo = 'folga'::public.dp_solicitacao_tipo
     AND s.status = 'aprovada'::public.dp_solicitacao_status
     AND s.data_alvo = p_data
     AND s.removido_em IS NULL
     AND (p_solicitacao_id IS NULL OR s.id = p_solicitacao_id);
  GET DIAGNOSTICS v_solic = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'folgas', v_folgas, 'solicitacoes', v_solic);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_folga_admin_remarcar(
  p_folga_id uuid,
  p_solicitacao_id uuid,
  p_colaborador uuid,
  p_data_atual date,
  p_data_nova date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_folgas int := 0;
  v_solic int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_data_atual IS NULL OR p_data_nova IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colaborador e as datas.' USING ERRCODE = '22023';
  END IF;
  IF p_data_nova = p_data_atual THEN
    RAISE EXCEPTION 'INVALID_INPUT: escolha um dia diferente.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_data_nova::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = p_colaborador
       AND f.data = p_data_nova
       AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'JA_TEM_FOLGA: o colaborador já tem folga neste dia.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_folga_id IS NOT NULL THEN
    UPDATE public.dp_folgas f
       SET data = p_data_nova, updated_at = now()
     WHERE f.id = p_folga_id
       AND f.company_id = v_company
       AND f.colaborador_id = p_colaborador
       AND f.status <> 'cancelada';
    GET DIAGNOSTICS v_folgas = ROW_COUNT;
  END IF;

  UPDATE public.dp_solicitacoes s
     SET data_alvo = p_data_nova, updated_at = now()
   WHERE s.company_id = v_company
     AND s.colaborador_id = p_colaborador
     AND s.tipo = 'folga'::public.dp_solicitacao_tipo
     AND s.status = 'aprovada'::public.dp_solicitacao_status
     AND s.data_alvo = p_data_atual
     AND s.removido_em IS NULL
     AND (p_solicitacao_id IS NULL OR s.id = p_solicitacao_id);
  GET DIAGNOSTICS v_solic = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'folgas', v_folgas, 'solicitacoes', v_solic);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_admin_cancelar(uuid, uuid, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_folga_admin_remarcar(uuid, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_cancelar(uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_remarcar(uuid, uuid, uuid, date, date) TO authenticated, service_role;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.dp_folga_admin_cancelar(uuid, uuid, uuid, date, text);
-- DROP FUNCTION IF EXISTS public.dp_folga_admin_remarcar(uuid, uuid, uuid, date, date);
