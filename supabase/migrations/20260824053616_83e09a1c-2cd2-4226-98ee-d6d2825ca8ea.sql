-- =====================================================================
-- M15 — Convocações · retirada de necessidade de rascunho (sem DELETE)
-- Rollback documentado:
--   DROP FUNCTION IF EXISTS public.dp_convocacao_cancelar_ocorrencia_rascunho(uuid, timestamptz);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(
  p_ocorrencia_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_ocorrencias;
  v_grupo_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  IF p_ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador da necessidade é obrigatório.' USING ERRCODE = '22023';
  END IF;

  -- company_id derivado do próprio registro; nunca recebido do cliente.
  SELECT company_id INTO v_company
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

  -- autorização ANTES de qualquer lock (owner/admin da empresa do registro)
  PERFORM public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id AND company_id = v_company
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

  SELECT status INTO v_grupo_status
    FROM public.dp_convocacao_grupos
   WHERE id = v_row.grupo_id AND company_id = v_company;

  IF v_grupo_status IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo da necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

  -- retry idempotente: já cancelada => sucesso, sem novo evento
  IF v_row.status = 'cancelada' THEN
    RETURN jsonb_build_object(
      'ocorrencia_id', v_row.id,
      'status', v_row.status,
      'updated_at', v_row.updated_at,
      'alterado', false,
      'idempotente', true);
  END IF;

  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente necessidades em rascunho podem ser retiradas.' USING ERRCODE = '22023';
  END IF;

  IF v_grupo_status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: o grupo não está mais em rascunho.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a necessidade foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_ocorrencias
     SET status = 'cancelada',
         updated_at = now()
   WHERE id = v_row.id AND company_id = v_company
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_row.grupo_id, v_row.id, 'ocorrencia_cancelada',
    jsonb_build_object('de_status', 'rascunho', 'para_status', 'cancelada', 'motivo', 'retirada_do_rascunho'));

  RETURN jsonb_build_object(
    'ocorrencia_id', v_row.id,
    'status', v_row.status,
    'updated_at', v_row.updated_at,
    'alterado', true,
    'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(uuid, timestamptz) TO service_role;