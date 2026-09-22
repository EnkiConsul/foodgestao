CREATE OR REPLACE FUNCTION private.f02_guard_title() RETURNS trigger
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
 IF NOT NEW.payment_ledger_enabled THEN
   IF NEW.account_id IS NOT NULL AND NEW.transaction_type IN ('entrada','saida') THEN
     IF NEW.status='pendente' OR (coalesce(NEW.amount_paid,0)<>0 AND NEW.amount_paid<>NEW.amount) THEN
       RAISE EXCEPTION 'Baixa parcial exige histórico; cancele e recrie o título legado pendente' USING ERRCODE='23514';
     END IF;
   END IF;
   RETURN NEW;
 END IF;
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
