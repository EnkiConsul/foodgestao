-- 1) Novo estado "discarded" nas filas de webhook (evento irrelevante/órfão)
ALTER TABLE public.pluggy_webhook_events DROP CONSTRAINT IF EXISTS pluggy_webhook_events_status_chk;
ALTER TABLE public.pluggy_webhook_events ADD CONSTRAINT pluggy_webhook_events_status_chk
  CHECK (status = ANY (ARRAY['pending','processing','processed','retry','dead_letter','discarded']));

ALTER TABLE public.asaas_webhook_events DROP CONSTRAINT IF EXISTS asaas_webhook_events_status_chk;
ALTER TABLE public.asaas_webhook_events ADD CONSTRAINT asaas_webhook_events_status_chk
  CHECK (status = ANY (ARRAY['pending','processing','processed','retry','dead_letter','discarded']));

-- 2) Descarte administrativo de evento em falha definitiva
CREATE OR REPLACE FUNCTION public.webhook_discard_admin(_provider text, _event_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _provider = 'asaas' THEN
    UPDATE public.asaas_webhook_events
    SET status = 'discarded',
        error = left(coalesce(_reason, error, 'descartado pelo administrador'), 500),
        locked_by = NULL,
        claim_expires_at = NULL,
        next_attempt_at = NULL,
        processed_at = now(),
        updated_at = now()
    WHERE id = _event_id AND status IN ('dead_letter','retry','pending');
  ELSIF _provider = 'pluggy' THEN
    UPDATE public.pluggy_webhook_events
    SET status = 'discarded',
        error = left(coalesce(_reason, error, 'descartado pelo administrador'), 500),
        locked_by = NULL,
        claim_expires_at = NULL,
        next_attempt_at = NULL,
        processed_at = now(),
        updated_at = now()
    WHERE id = _event_id AND status IN ('dead_letter','retry','pending');
  ELSE
    RAISE EXCEPTION 'invalid provider';
  END IF;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.webhook_discard_admin(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.webhook_discard_admin(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.webhook_discard_admin(text, uuid, text) TO authenticated;

-- 3) Descarte em lote por código de erro (limpeza de ruído de itens órfãos)
CREATE OR REPLACE FUNCTION public.webhook_discard_by_code_admin(_provider text, _error_code text, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _provider = 'pluggy' THEN
    UPDATE public.pluggy_webhook_events
    SET status = 'discarded',
        error = left(coalesce(_reason, error, 'descartado em lote'), 500),
        locked_by = NULL, claim_expires_at = NULL, next_attempt_at = NULL,
        processed_at = now(), updated_at = now()
    WHERE status = 'dead_letter' AND error_code = _error_code;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF _provider = 'asaas' THEN
    UPDATE public.asaas_webhook_events
    SET status = 'discarded',
        error = left(coalesce(_reason, error, 'descartado em lote'), 500),
        locked_by = NULL, claim_expires_at = NULL, next_attempt_at = NULL,
        processed_at = now(), updated_at = now()
    WHERE status = 'dead_letter' AND error_code = _error_code;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'invalid provider';
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.webhook_discard_by_code_admin(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.webhook_discard_by_code_admin(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.webhook_discard_by_code_admin(text, text, text) TO authenticated;

-- 4) Índice faltante em chave estrangeira de tabela que cresce por sincronização
CREATE INDEX IF NOT EXISTS idx_pluggy_v2_transactions_raw_connection
  ON public.pluggy_v2_transactions_raw (connection_id);