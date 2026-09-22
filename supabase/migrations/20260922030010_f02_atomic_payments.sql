-- Requires F01. Pending bank titles use an immutable cash-payment ledger.
SET LOCAL lock_timeout='5s';
LOCK TABLE public.transactions, public.accounts IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.transactions WHERE account_id IS NOT NULL
 AND transaction_type IN ('entrada','saida') AND status='pendente' AND coalesce(amount_paid,0)<>0)
 THEN RAISE EXCEPTION 'F02: reconciliar baixas legadas pendentes antes da migração'; END IF;
END $$;
ALTER TABLE public.transactions ADD COLUMN payment_ledger_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.transaction_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 paid_on date NOT NULL,
 payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
 idempotency_key uuid NOT NULL,
 reversal_of uuid REFERENCES public.transaction_payments(id) ON DELETE RESTRICT,
 reason text,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(transaction_id,idempotency_key),
 UNIQUE(reversal_of)
);
CREATE INDEX transaction_payments_account_date_idx ON public.transaction_payments(account_id,paid_on);
CREATE INDEX transaction_payments_method_idx ON public.transaction_payments(payment_method_id) WHERE payment_method_id IS NOT NULL;
CREATE INDEX transaction_payments_actor_idx ON public.transaction_payments(created_by);
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.transaction_payments TO authenticated;
CREATE POLICY payment_history_read ON public.transaction_payments FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=transaction_id));

CREATE FUNCTION private.f02_guard_title() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE total numeric; last_date date; has_history boolean; expected public.transaction_status;
BEGIN
 IF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=OLD.id) THEN
     RAISE EXCEPTION 'Título com histórico não pode ser excluído; estorne e cancele' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.account_id IS NOT NULL AND NEW.transaction_type IN ('entrada','saida') AND NEW.status='pendente' THEN
     NEW.payment_ledger_enabled:=true;
   ELSIF NEW.payment_ledger_enabled THEN
     RAISE EXCEPTION 'Novo título com histórico deve iniciar pendente' USING ERRCODE='23514';
   END IF;
 ELSE
   IF OLD.payment_ledger_enabled AND NOT NEW.payment_ledger_enabled THEN
     RAISE EXCEPTION 'Histórico de pagamentos não pode ser desativado' USING ERRCODE='23514';
   END IF;
   IF NOT OLD.payment_ledger_enabled AND NEW.payment_ledger_enabled
     AND (OLD.status<>'pendente' OR coalesce(OLD.amount_paid,0)<>0) THEN
     RAISE EXCEPTION 'Título legado requer conciliação antes de usar histórico' USING ERRCODE='23514';
   END IF;
 END IF;
 IF NOT NEW.payment_ledger_enabled THEN RETURN NEW; END IF;
 IF NEW.account_id IS NULL OR NEW.credit_card_id IS NOT NULL OR NEW.transaction_type NOT IN ('entrada','saida') THEN
   RAISE EXCEPTION 'Baixas por histórico requerem título bancário de entrada ou saída' USING ERRCODE='23514';
 END IF;
 SELECT count(*)>0,coalesce(sum(CASE WHEN reversal_of IS NULL THEN amount ELSE -amount END),0)
 INTO has_history,total FROM public.transaction_payments WHERE transaction_id=NEW.id;
 SELECT max(p.paid_on) INTO last_date FROM public.transaction_payments p
 WHERE p.transaction_id=NEW.id AND p.reversal_of IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.transaction_payments r WHERE r.reversal_of=p.id);
 IF TG_OP='UPDATE' AND has_history AND
   (NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.context IS DISTINCT FROM OLD.context
    OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type) THEN
   RAISE EXCEPTION 'Identidade de título com pagamentos é imutável' USING ERRCODE='23514';
 END IF;
 IF NEW.amount<=0 OR NEW.amount<total OR total<0 THEN
   RAISE EXCEPTION 'Valor do título não pode ser menor que o pago' USING ERRCODE='23514';
 END IF;
 IF coalesce(NEW.amount_paid,0) IS DISTINCT FROM total OR NEW.payment_date IS DISTINCT FROM last_date THEN
   RAISE EXCEPTION 'Registre ou estorne pagamentos pela operação de baixa' USING ERRCODE='23514';
 END IF;
 expected:=CASE WHEN total=NEW.amount THEN 'confirmado' ELSE 'pendente' END;
 IF NEW.status='cancelado' THEN
   IF total<>0 THEN RAISE EXCEPTION 'Estorne os pagamentos antes de cancelar' USING ERRCODE='23514'; END IF;
 ELSE
   IF NEW.status IS DISTINCT FROM expected AND
      (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
     RAISE EXCEPTION 'Status de pagamento é calculado pelo histórico' USING ERRCODE='23514';
   END IF;
   NEW.status:=expected;
 END IF;
 NEW.amount_paid:=total;
 NEW.payment_date:=last_date;
 NEW.bill_status:=CASE WHEN NEW.status='cancelado' THEN NULL
   WHEN total=NEW.amount THEN 'pago' WHEN total>0 THEN 'parcial'
   WHEN NEW.due_date IS NOT NULL THEN 'em_dia' ELSE NULL END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.f02_guard_title() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_f02_guard_title BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
 FOR EACH ROW EXECUTE FUNCTION private.f02_guard_title();

-- One title per statement: preserve the existing bulk-payment-change safeguard.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT id FROM public.transactions WHERE account_id IS NOT NULL
   AND transaction_type IN ('entrada','saida') AND status='pendente' LOOP
   UPDATE public.transactions SET payment_ledger_enabled=true,amount_paid=0,payment_date=NULL WHERE id=t.id;
 END LOOP;
END $$;

CREATE FUNCTION private.f02_payment(_transaction_id uuid,_amount numeric,_paid_on date,
 _account_id uuid,_idempotency_key uuid,_payment_method_id uuid,_reversal_of uuid,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.transactions; p public.transaction_payments; original public.transaction_payments;
 uid uuid:=auth.uid(); total numeric; last_date date; signed_amount numeric; ref date;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.transactions WHERE id=_transaction_id FOR UPDATE;
 IF NOT FOUND OR NOT (
    (t.context='pf' AND t.company_id IS NULL AND t.user_id=uid)
    OR (t.context='pj' AND t.company_id IS NOT NULL AND private.member_can_edit(uid,t.company_id,'transactions'))
 ) THEN RAISE EXCEPTION 'Sem permissão para baixar este título' USING ERRCODE='42501'; END IF;
 IF NOT t.payment_ledger_enabled THEN
   RAISE EXCEPTION 'Título legado ou de cartão: utilize o fluxo correspondente' USING ERRCODE='23514';
 END IF;
 IF _idempotency_key IS NULL OR _paid_on IS NULL THEN
   RAISE EXCEPTION 'Data e chave de idempotência obrigatórias' USING ERRCODE='23514'; END IF;
 IF _reversal_of IS NOT NULL THEN
   SELECT * INTO original FROM public.transaction_payments WHERE id=_reversal_of AND transaction_id=t.id AND reversal_of IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado neste título' USING ERRCODE='23514'; END IF;
   IF length(trim(coalesce(_reason,'')))<3 OR _paid_on<original.paid_on THEN
     RAISE EXCEPTION 'Informe motivo e data de estorno posterior ou igual ao pagamento' USING ERRCODE='23514'; END IF;
   _amount:=original.amount; _account_id:=original.account_id; _payment_method_id:=original.payment_method_id;
 END IF;
 IF _amount IS NULL OR _amount<=0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<>round(_amount,2) THEN
   RAISE EXCEPTION 'Valor deve ser positivo com até duas casas decimais' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.transaction_payments WHERE transaction_id=t.id AND idempotency_key=_idempotency_key;
 IF FOUND THEN
   IF p.amount IS DISTINCT FROM _amount OR p.paid_on IS DISTINCT FROM _paid_on
      OR p.account_id IS DISTINCT FROM _account_id OR p.payment_method_id IS DISTINCT FROM _payment_method_id
      OR p.reversal_of IS DISTINCT FROM _reversal_of OR p.reason IS DISTINCT FROM _reason THEN
     RAISE EXCEPTION 'Chave de idempotência já usada com outros dados' USING ERRCODE='23514'; END IF;
   RETURN jsonb_build_object('payment_id',p.id,'amount_paid',t.amount_paid,'remaining',t.amount-t.amount_paid,'replayed',true);
 END IF;
 IF t.status='cancelado' THEN RAISE EXCEPTION 'Título cancelado' USING ERRCODE='23514'; END IF;
 IF _reversal_of IS NULL AND _amount>t.amount-coalesce(t.amount_paid,0) THEN
   RAISE EXCEPTION 'Pagamento excede o saldo restante' USING ERRCODE='23514'; END IF;
 IF _reversal_of IS NOT NULL AND EXISTS(SELECT 1 FROM public.transaction_payments WHERE reversal_of=_reversal_of) THEN
   RAISE EXCEPTION 'Pagamento já estornado' USING ERRCODE='23514'; END IF;
 PERFORM private.assert_financial_source_scope(t.context,t.company_id,t.user_id,_account_id,NULL,NULL);
 IF _account_id IS NULL THEN RAISE EXCEPTION 'Conta obrigatória' USING ERRCODE='23514'; END IF;
 IF _reversal_of IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=_account_id AND is_active AND soft_deleted_at IS NULL) THEN
     RAISE EXCEPTION 'Conta inativa' USING ERRCODE='23514'; END IF;
   IF _payment_method_id IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.payment_methods m WHERE m.id=_payment_method_id AND m.user_id=uid
       AND ((t.context='pf' AND m.visible_pf) OR (t.context='pj' AND EXISTS(
         SELECT 1 FROM public.payment_method_companies c WHERE c.payment_method_id=m.id AND c.company_id=t.company_id)))
   ) THEN RAISE EXCEPTION 'Forma de pagamento fora do contexto autorizado' USING ERRCODE='42501'; END IF;
 END IF;
 -- Lock the cash account before appending: balance rebuild holds this same lock.
 SELECT reference_balance_date INTO ref FROM public.accounts WHERE id=_account_id FOR UPDATE;
 INSERT INTO public.transaction_payments(transaction_id,account_id,amount,paid_on,payment_method_id,idempotency_key,reversal_of,reason,created_by)
 VALUES(t.id,_account_id,_amount,_paid_on,_payment_method_id,_idempotency_key,_reversal_of,_reason,uid) RETURNING * INTO p;
 signed_amount:=_amount * CASE WHEN t.transaction_type='entrada' THEN 1 ELSE -1 END * CASE WHEN _reversal_of IS NULL THEN 1 ELSE -1 END;
 IF ref IS NULL OR _paid_on>=ref THEN
   PERFORM pg_catalog.set_config('app.balance_engine','on',true);
   UPDATE public.accounts SET current_balance=current_balance+signed_amount WHERE id=_account_id;
 END IF;
 SELECT coalesce(sum(CASE WHEN reversal_of IS NULL THEN amount ELSE -amount END),0)
 INTO total FROM public.transaction_payments WHERE transaction_id=t.id;
 SELECT max(x.paid_on) INTO last_date FROM public.transaction_payments x WHERE x.transaction_id=t.id AND x.reversal_of IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.transaction_payments r WHERE r.reversal_of=x.id);
 UPDATE public.transactions SET amount_paid=total,payment_date=last_date,
 status=CASE WHEN total=amount THEN 'confirmado'::public.transaction_status ELSE 'pendente'::public.transaction_status END
 WHERE id=t.id;
 RETURN jsonb_build_object('payment_id',p.id,'amount_paid',total,'remaining',t.amount-total,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION private.f02_payment(uuid,numeric,date,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.f02_payment(uuid,numeric,date,uuid,uuid,uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.record_transaction_payment(_transaction_id uuid,_amount numeric,_paid_on date,
 _account_id uuid,_idempotency_key uuid,_payment_method_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.f02_payment(_transaction_id,_amount,_paid_on,_account_id,_idempotency_key,_payment_method_id,NULL,NULL)
$$;
CREATE FUNCTION public.reverse_transaction_payment(_transaction_id uuid,_payment_id uuid,
 _paid_on date,_idempotency_key uuid,_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.f02_payment(_transaction_id,NULL,_paid_on,NULL,_idempotency_key,NULL,_payment_id,_reason)
$$;
REVOKE ALL ON FUNCTION public.record_transaction_payment(uuid,numeric,date,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reverse_transaction_payment(uuid,uuid,date,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_transaction_payment(uuid,numeric,date,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction_payment(uuid,uuid,date,uuid,text) TO authenticated;

-- Managed titles move cash only through payment entries, never through their face value.
CREATE OR REPLACE FUNCTION public.apply_tx_balance(_tx public.transactions, _sign integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF _tx.payment_ledger_enabled OR _tx.status <> 'confirmado' THEN RETURN; END IF;
  -- Defense for privileged callers supplying a composite record directly.
  PERFORM private.assert_financial_source_scope(
    _tx.context, _tx.company_id, _tx.user_id, _tx.account_id,
    _tx.credit_card_id,
    CASE WHEN _tx.transaction_type = 'transferencia' THEN _tx.destination_account_id END
  );
  PERFORM pg_catalog.set_config('app.balance_engine', 'on', true);
  IF _tx.transaction_type = 'entrada' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'saida' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'transferencia' THEN
    IF _tx.account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
        WHERE id = _tx.account_id;
    END IF;
    IF _tx.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
        WHERE id = _tx.destination_account_id;
    END IF;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_tx_balance(public.transactions, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tx_balance(public.transactions, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_account_balance(_account_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _acc public.accounts;
  _movements numeric;
  _new_balance numeric;
  _ref date;
BEGIN
  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id FOR UPDATE;
  IF _acc IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _acc.user_id <> auth.uid()
     AND NOT public.is_super_admin(auth.uid())
     AND NOT (
       _acc.context = 'pj' AND _acc.company_id IS NOT NULL
       AND private.is_company_member(auth.uid(), _acc.company_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  _ref := _acc.reference_balance_date;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type = 'entrada'       AND t.account_id = _account_id THEN t.amount
      WHEN t.transaction_type = 'saida'       AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = _account_id THEN t.amount
      ELSE 0
    END
  ), 0)
  INTO _movements
  FROM public.transactions t
  WHERE NOT t.payment_ledger_enabled AND t.status = 'confirmado'
    AND (t.account_id = _account_id OR t.destination_account_id = _account_id)
    AND (_ref IS NULL OR t.transaction_date >= _ref);

  SELECT _movements + coalesce(sum(p.amount
    * CASE WHEN t.transaction_type='entrada' THEN 1 ELSE -1 END
    * CASE WHEN p.reversal_of IS NULL THEN 1 ELSE -1 END),0)
  INTO _movements FROM public.transaction_payments p
  JOIN public.transactions t ON t.id=p.transaction_id
  WHERE p.account_id=_account_id AND (_ref IS NULL OR p.paid_on>=_ref);
  _new_balance := COALESCE(_acc.initial_balance, 0) + _movements;

  PERFORM set_config('app.balance_engine', 'on', true);
  UPDATE public.accounts
     SET current_balance = _new_balance
   WHERE id = _account_id;

  RETURN _new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_balance_drift()
 RETURNS TABLE(account_id uuid, account_name text, context context_type, company_id uuid, stored_balance numeric, computed_balance numeric, drift numeric, bank_balance numeric, bank_drift numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT a.*
      FROM public.accounts a
     WHERE a.soft_deleted_at IS NULL
       AND (
         a.user_id = auth.uid()
         OR public.is_super_admin(auth.uid())
         OR (a.context = 'pj' AND a.company_id IS NOT NULL
             AND private.is_company_member(auth.uid(), a.company_id))
       )
  ),
  mov AS (
    SELECT s.id AS aid,
      COALESCE(SUM(
        CASE
          WHEN t.transaction_type = 'entrada'       AND t.account_id = s.id THEN t.amount
          WHEN t.transaction_type = 'saida'         AND t.account_id = s.id THEN -t.amount
          WHEN t.transaction_type = 'transferencia' AND t.account_id = s.id THEN -t.amount
          WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = s.id THEN t.amount
          ELSE 0
        END
      ), 0) AS total
    FROM scope s
    LEFT JOIN public.transactions t
      ON (t.account_id = s.id OR t.destination_account_id = s.id)
     AND NOT t.payment_ledger_enabled AND t.status = 'confirmado'
     AND (s.reference_balance_date IS NULL OR t.transaction_date >= s.reference_balance_date)
    GROUP BY s.id
  )
  , cash AS (
    SELECT p.account_id AS aid, sum(p.amount
      * CASE WHEN t.transaction_type='entrada' THEN 1 ELSE -1 END
      * CASE WHEN p.reversal_of IS NULL THEN 1 ELSE -1 END) AS total
    FROM public.transaction_payments p JOIN public.transactions t ON t.id=p.transaction_id
    JOIN scope s ON s.id=p.account_id
    WHERE s.reference_balance_date IS NULL OR p.paid_on>=s.reference_balance_date
    GROUP BY p.account_id
  )
  SELECT s.id, s.name, s.context, s.company_id,
         s.current_balance,
         (COALESCE(s.initial_balance,0) + (COALESCE(m.total,0)+COALESCE(c.total,0))),
         (s.current_balance - (COALESCE(s.initial_balance,0) + (COALESCE(m.total,0)+COALESCE(c.total,0)))),
         s.bank_balance,
         CASE WHEN s.bank_balance IS NULL THEN NULL
              ELSE (s.bank_balance - s.current_balance) END
    FROM scope s
    LEFT JOIN mov m ON m.aid = s.id
    LEFT JOIN cash c ON c.aid = s.id
   WHERE ABS(s.current_balance - (COALESCE(s.initial_balance,0) + (COALESCE(m.total,0)+COALESCE(c.total,0)))) > 0.005
      OR (s.bank_balance IS NOT NULL AND ABS(s.bank_balance - s.current_balance) > 0.005);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_of_account_balance(_account_id uuid, _new_balance numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_initial numeric;
  v_current numeric;
  v_has_tx boolean;
BEGIN
  IF _new_balance IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(initial_balance, 0), COALESCE(current_balance, 0)
    INTO v_initial, v_current
    FROM public.accounts
   WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE (account_id = _account_id OR destination_account_id = _account_id)
       AND status = 'confirmado'
  ) INTO v_has_tx;

  v_has_tx := v_has_tx OR EXISTS(SELECT 1 FROM public.transaction_payments WHERE account_id=_account_id);
  IF v_initial = 0 AND v_current = 0 AND NOT v_has_tx THEN
    -- Conta recém-conectada e sem razão: o saldo do banco semeia o saldo inicial.
    PERFORM set_config('app.balance_engine', 'on', true);
    UPDATE public.accounts
       SET initial_balance = _new_balance,
           current_balance = _new_balance,
           bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  ELSE
    -- Razão é a fonte da verdade: o banco fica apenas como referência.
    UPDATE public.accounts
       SET bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  END IF;
END;
$function$;

CREATE FUNCTION private.f02_immutable_payment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Histórico imutável; registre um estorno' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION private.f02_immutable_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER f02_immutable_payment BEFORE UPDATE OR DELETE ON public.transaction_payments
 FOR EACH ROW EXECUTE FUNCTION private.f02_immutable_payment();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.transaction_payments FROM service_role;
NOTIFY pgrst,'reload schema';
