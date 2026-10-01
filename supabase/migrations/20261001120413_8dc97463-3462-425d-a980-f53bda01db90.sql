-- lovable-cron-fallback-reviewed: 1440 runs/day; push precisa chegar em ~1 minuto e a chamada retorna de imediato quando a fila está vazia
CREATE TABLE public.dp_push_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  falhas int NOT NULL DEFAULT 0,
  ultimo_envio_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.dp_push_inscricoes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_push_inscricoes TO authenticated;
GRANT ALL ON public.dp_push_inscricoes TO service_role;
ALTER TABLE public.dp_push_inscricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario gerencia proprias inscricoes push" ON public.dp_push_inscricoes
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE TRIGGER trg_dp_push_inscricoes_updated BEFORE UPDATE ON public.dp_push_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.dp_push_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id uuid NOT NULL UNIQUE REFERENCES public.dp_notificacoes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','enviado','erro')),
  tentativas int NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);
CREATE INDEX ON public.dp_push_fila(status, created_at);
GRANT ALL ON public.dp_push_fila TO service_role;
ALTER TABLE public.dp_push_fila ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.dp_push_enfileirar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.dp_push_fila(notificacao_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_push_enfileirar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_dp_notificacoes_push AFTER INSERT ON public.dp_notificacoes
  FOR EACH ROW EXECUTE FUNCTION private.dp_push_enfileirar();

-- Reserva atômica de lote (idempotente: cada item só é pego por um processador)
CREATE OR REPLACE FUNCTION public.dp_push_reservar(_limite int DEFAULT 50)
RETURNS TABLE(fila_id uuid, notificacao_id uuid, user_id uuid, company_id uuid, para_admins boolean, titulo text, descricao text, ref_table text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH r AS (
    UPDATE public.dp_push_fila f SET status = 'processando', tentativas = f.tentativas + 1
     WHERE f.id IN (
       SELECT id FROM public.dp_push_fila
        WHERE status = 'pendente' OR (status = 'processando' AND processado_em IS NULL AND created_at < now() - interval '10 minutes' AND tentativas < 3)
        ORDER BY created_at LIMIT _limite FOR UPDATE SKIP LOCKED)
    RETURNING f.id, f.notificacao_id)
  SELECT r.id, n.id, n.user_id, n.company_id, n.para_admins, n.titulo, n.descricao, n.ref_table
    FROM r JOIN public.dp_notificacoes n ON n.id = r.notificacao_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_push_reservar(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_push_reservar(int) TO service_role;

-- Destinatários inscritos: o próprio usuário, ou gestores da empresa para avisos compartilhados
CREATE OR REPLACE FUNCTION public.dp_push_destinos(_user_id uuid, _company_id uuid, _para_admins boolean)
RETURNS TABLE(inscricao_id uuid, user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.user_id, i.endpoint, i.p256dh, i.auth
    FROM public.dp_push_inscricoes i
   WHERE (_user_id IS NOT NULL AND i.user_id = _user_id)
      OR (_user_id IS NULL AND _para_admins AND private.is_company_admin_or_owner(i.user_id, _company_id));
$$;
REVOKE ALL ON FUNCTION public.dp_push_destinos(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_push_destinos(uuid, uuid, boolean) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'DP_PUSH_WORKER_SECRET') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'DP_PUSH_WORKER_SECRET', 'Segredo interno do envio de notificações push (Pessoas 360)');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dp_push_worker_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DP_PUSH_WORKER_SECRET' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dp_push_worker_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_push_worker_secret() TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('dp-push-dispatch-tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('dp-push-dispatch-tick', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/dp-push-dispatch',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'DP_PUSH_WORKER_SECRET' LIMIT 1)),
    body := jsonb_build_object('trigger','cron'));
$cron$);