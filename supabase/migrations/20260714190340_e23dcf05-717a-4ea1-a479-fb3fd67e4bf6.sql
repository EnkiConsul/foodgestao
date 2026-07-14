
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_desc text;
  v_due date;
  v_colab_nome text;
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF NEW.status = 'aprovado_financeiro'
     AND (OLD.status IS DISTINCT FROM 'aprovado_financeiro')
     AND NEW.transaction_id IS NULL THEN

    SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = NEW.periodo_id;
    SELECT user_id INTO v_owner FROM public.companies WHERE id = NEW.company_id;
    SELECT nome INTO v_colab_nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

    v_account := NEW.financeiro_account_id;
    IF v_account IS NULL THEN
      SELECT id INTO v_account FROM public.accounts
       WHERE company_id = NEW.company_id AND context = 'pj' AND is_active = true
       ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_account IS NULL THEN
      RAISE EXCEPTION 'Nenhuma conta bancária PJ disponível para gerar o lançamento financeiro';
    END IF;

    v_due := COALESCE(v_periodo.data_pagamento, CURRENT_DATE);
    v_desc := 'Folha DP — ' || COALESCE(v_colab_nome,'colaborador') || ' — ' || NEW.tipo::text
              || ' (' || to_char(v_periodo.competencia, 'MM/YYYY') || ')';

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      description, amount, transaction_date, due_date,
      transaction_type, status, bill_status
    ) VALUES (
      v_owner, NEW.company_id, 'pj', v_account, NEW.financeiro_categoria_id,
      v_desc, NEW.valor_liquido, v_due, v_due,
      'expense', 'pending', 'a_pagar'
    ) RETURNING id INTO v_tx_id;

    NEW.transaction_id := v_tx_id;
  END IF;

  RETURN NEW;
END;
$$;
