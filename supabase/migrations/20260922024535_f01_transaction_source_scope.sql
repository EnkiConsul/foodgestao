-- F01: source identity is enforced before any transaction effect.
-- No balance formula changes, RLS relaxations, or historical data repair.
-- Apply in one transaction. The deployment must stop on any pre-existing mismatch.
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.accounts, public.credit_cards, public.transactions
  IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION private.assert_financial_source_scope(
  _context public.context_type, _company_id uuid, _user_id uuid,
  _account_id uuid, _credit_card_id uuid, _destination_account_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _source record;
BEGIN
  IF _context IS NULL OR _user_id IS NULL
     OR (_context = 'pj' AND _company_id IS NULL)
     OR (_context = 'pf' AND _company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Contexto financeiro inválido' USING ERRCODE = '23514';
  END IF;

  FOR _source IN
    SELECT 'Conta'::text AS kind, r.id AS requested_id, a.id AS found_id,
           a.context, a.company_id, a.user_id
      FROM (VALUES (_account_id), (_destination_account_id)) AS r(id)
      LEFT JOIN public.accounts a ON a.id = r.id
     WHERE r.id IS NOT NULL
    UNION ALL
    SELECT 'Cartão', _credit_card_id, c.id, c.context, c.company_id, c.user_id
      FROM (VALUES (_credit_card_id)) AS r(id)
      LEFT JOIN public.credit_cards c ON c.id = r.id
     WHERE r.id IS NOT NULL
  LOOP
    IF _source.found_id IS NULL THEN
      RAISE EXCEPTION 'Origem financeira não encontrada' USING ERRCODE = '23503';
    END IF;
    IF _source.context IS DISTINCT FROM _context
       OR _source.company_id IS DISTINCT FROM _company_id
       OR (_context = 'pf' AND _source.user_id IS DISTINCT FROM _user_id) THEN
      RAISE EXCEPTION 'Conta ou cartão não pertence ao contexto do lançamento'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$function$;

-- Integrity helper only: RLS / authorized RPCs still decide who may write.
-- SECURITY DEFINER is needed to validate references hidden by the caller's RLS;
-- it does not expose data or grant callers new write access.
REVOKE ALL ON FUNCTION private.assert_financial_source_scope(
  public.context_type, uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_financial_source_scope(
  public.context_type, uuid, uuid, uuid, uuid, uuid
) TO service_role;

-- Never silently exempt invalid history from UPDATE validation.
DO $preflight$
DECLARE _tx public.transactions%ROWTYPE;
BEGIN
  FOR _tx IN SELECT * FROM public.transactions LOOP
    PERFORM private.assert_financial_source_scope(
      _tx.context, _tx.company_id, _tx.user_id, _tx.account_id,
      _tx.credit_card_id,
      CASE WHEN _tx.transaction_type = 'transferencia' THEN _tx.destination_account_id END
    );
  END LOOP;
END;
$preflight$;

CREATE OR REPLACE FUNCTION private.f01_validate_transaction_source()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.assert_financial_source_scope(
    NEW.context, NEW.company_id, NEW.user_id, NEW.account_id,
    NEW.credit_card_id,
    CASE WHEN NEW.transaction_type = 'transferencia' THEN NEW.destination_account_id END
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.f01_validate_transaction_source()
  FROM PUBLIC, anon, authenticated;

-- Last BEFORE trigger validates the row after existing normalizers.
CREATE TRIGGER zz_f01_validate_transaction_source
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION private.f01_validate_transaction_source();

CREATE OR REPLACE FUNCTION private.f01_preserve_source_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- PJ user_id is authorship, not tenancy; legitimate editor saves may change it.
  -- PF user_id is ownership and must remain stable.
  IF NEW.context IS DISTINCT FROM OLD.context
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR (OLD.context = 'pf' AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Empresa e contexto da conta ou cartão não podem ser alterados; crie um novo cadastro'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.f01_preserve_source_identity()
  FROM PUBLIC, anon, authenticated;

-- Immutable tenant identities also close concurrent source-reassignment races.
-- Ordinary name/bank/limit updates remain allowed by their existing permissions.
CREATE TRIGGER zz_f01_preserve_account_identity
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION private.f01_preserve_source_identity();
CREATE TRIGGER zz_f01_preserve_card_identity
BEFORE UPDATE ON public.credit_cards
FOR EACH ROW EXECUTE FUNCTION private.f01_preserve_source_identity();

CREATE OR REPLACE FUNCTION public.apply_tx_balance(_tx public.transactions, _sign integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF _tx.status <> 'confirmado' THEN RETURN; END IF;
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
