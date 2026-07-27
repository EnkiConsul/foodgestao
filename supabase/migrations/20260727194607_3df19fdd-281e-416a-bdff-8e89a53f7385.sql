
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_despesa(
  p_periodo_id uuid,
  p_account_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_data_pagamento date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_total numeric;
  v_existente uuid;
  v_tx uuid;
  v_venc date;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = p_periodo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Período da folha não encontrado.';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_periodo.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_periodo.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar a despesa desta folha.';
  END IF;

  IF v_periodo.status NOT IN ('aprovado_financeiro', 'pago') THEN
    RAISE EXCEPTION 'A folha precisa estar aprovada pelo financeiro para gerar a despesa.';
  END IF;

  SELECT transaction_id INTO v_existente
  FROM public.dp_folha_lancamentos
  WHERE periodo_id = p_periodo_id AND transaction_id IS NOT NULL
  LIMIT 1;
  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  SELECT COALESCE(SUM(valor_liquido), 0) INTO v_total
  FROM public.dp_folha_lancamentos
  WHERE periodo_id = p_periodo_id AND status <> 'cancelado';

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Não há valor líquido a pagar neste período.';
  END IF;

  v_venc := COALESCE(p_data_pagamento, v_periodo.data_pagamento, (date_trunc('month', v_periodo.competencia) + interval '1 month 4 days')::date);

  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = p_account_id AND a.company_id = v_periodo.company_id
  ) THEN
    RAISE EXCEPTION 'Conta bancária inválida para esta empresa.';
  END IF;

  INSERT INTO public.transactions (
    user_id, company_id, context, transaction_type, status, description, amount,
    transaction_date, due_date, account_id, category_id, notes
  ) VALUES (
    auth.uid(), v_periodo.company_id, 'pj', 'despesa',
    CASE WHEN v_periodo.status = 'pago' THEN 'confirmado' ELSE 'pendente' END,
    'Folha de pagamento ' || to_char(v_periodo.competencia, 'MM/YYYY'),
    v_total, v_venc, v_venc, p_account_id, p_category_id,
    'Gerado automaticamente pelo módulo de Departamento Pessoal.'
  ) RETURNING id INTO v_tx;

  UPDATE public.dp_folha_lancamentos
  SET transaction_id = v_tx,
      financeiro_account_id = p_account_id,
      financeiro_categoria_id = p_category_id
  WHERE periodo_id = p_periodo_id AND status <> 'cancelado';

  RETURN v_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folha_gerar_despesa(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folha_gerar_despesa(uuid, uuid, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_folha_desfazer_despesa(p_periodo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_tx uuid;
  v_status public.transaction_status;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_folha_periodos WHERE id = p_periodo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Período da folha não encontrado.';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para desfazer a despesa desta folha.';
  END IF;

  SELECT transaction_id INTO v_tx
  FROM public.dp_folha_lancamentos
  WHERE periodo_id = p_periodo_id AND transaction_id IS NOT NULL
  LIMIT 1;

  IF v_tx IS NULL THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status FROM public.transactions WHERE id = v_tx;
  IF v_status = 'confirmado' THEN
    RAISE EXCEPTION 'A despesa já foi confirmada no financeiro. Cancele o lançamento financeiro antes.';
  END IF;

  UPDATE public.dp_folha_lancamentos
  SET transaction_id = NULL, financeiro_account_id = NULL, financeiro_categoria_id = NULL
  WHERE periodo_id = p_periodo_id;

  DELETE FROM public.transactions WHERE id = v_tx;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folha_desfazer_despesa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folha_desfazer_despesa(uuid) TO authenticated;
