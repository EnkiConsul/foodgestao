
CREATE OR REPLACE FUNCTION public.dp_folha_enviar_financeiro(_periodo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_status text;
  v_count int;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.dp_folha_periodos WHERE id = _periodo_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Período não encontrado'; END IF;
  IF v_status <> 'aberto' THEN RAISE EXCEPTION 'Período não está aberto (status atual: %)', v_status; END IF;

  SELECT COUNT(*) INTO v_count FROM public.dp_folha_lancamentos
    WHERE periodo_id = _periodo_id AND status = 'rascunho';
  IF v_count = 0 THEN RAISE EXCEPTION 'Nenhum lançamento em rascunho para enviar'; END IF;

  UPDATE public.dp_folha_lancamentos
    SET status = 'aprovado_dp'
    WHERE periodo_id = _periodo_id AND status = 'rascunho';

  UPDATE public.dp_folha_periodos
    SET status = 'aprovado_dp'
    WHERE id = _periodo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_folha_reabrir_periodo(_periodo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.dp_folha_periodos WHERE id = _periodo_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Período não encontrado'; END IF;
  IF v_status NOT IN ('aprovado_dp') THEN
    RAISE EXCEPTION 'Só é possível reabrir períodos com status aprovado_dp (atual: %)', v_status;
  END IF;

  UPDATE public.dp_folha_lancamentos
    SET status = 'rascunho'
    WHERE periodo_id = _periodo_id AND status = 'aprovado_dp';

  UPDATE public.dp_folha_periodos
    SET status = 'aberto'
    WHERE id = _periodo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_folha_enviar_financeiro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_folha_reabrir_periodo(uuid) TO authenticated;
