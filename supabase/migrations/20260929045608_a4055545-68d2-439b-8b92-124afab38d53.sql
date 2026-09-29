-- Backoffice da régua: pausa por negociação e histórico com nome da empresa.

CREATE OR REPLACE FUNCTION public.billing_dunning_pausar(
  _subscription_id uuid,
  _until timestamptz,
  _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para pausar a régua de cobrança';
  END IF;

  UPDATE public.subscriptions
     SET dunning_paused_until = _until,
         dunning_pause_reason = NULLIF(btrim(coalesce(_motivo, '')), ''),
         updated_at = now()
   WHERE id = _subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.billing_dunning_pausar(uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_dunning_pausar(uuid, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_dunning_pausar(uuid, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.billing_dunning_historico(
  _busca text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limite integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  empresa text,
  subscription_id uuid,
  invoice_id uuid,
  stage text,
  recipient text,
  status text,
  attempts integer,
  last_error text,
  provider_message_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz,
  pausada_ate timestamptz,
  pausa_motivo text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT n.id, n.company_id, c.name, n.subscription_id, n.invoice_id, n.stage,
         n.recipient, n.status, n.attempts, n.last_error, n.provider_message_id,
         n.scheduled_at, n.sent_at, n.created_at,
         s.dunning_paused_until, s.dunning_pause_reason
    FROM public.billing_notifications n
    LEFT JOIN public.companies c ON c.id = n.company_id
    LEFT JOIN public.subscriptions s ON s.id = n.subscription_id
   WHERE public.has_role(auth.uid(), 'super_admin'::app_role)
     AND (_status IS NULL OR n.status = _status)
     AND (
       _busca IS NULL OR btrim(_busca) = ''
       OR c.name ILIKE '%' || _busca || '%'
       OR n.recipient ILIKE '%' || _busca || '%'
     )
   ORDER BY n.created_at DESC
   LIMIT LEAST(GREATEST(coalesce(_limite, 200), 1), 500);
$function$;

REVOKE ALL ON FUNCTION public.billing_dunning_historico(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_dunning_historico(text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_dunning_historico(text, text, integer) TO authenticated;