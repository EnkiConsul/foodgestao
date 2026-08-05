-- =========================================================
-- PEDIDOS FASE 6 — Cozinha, Expedição, Alertas e Impressão
-- =========================================================

CREATE TYPE public.ped_print_station AS ENUM ('cozinha','bar','caixa','expedicao');
CREATE TYPE public.ped_print_job_status AS ENUM ('queued','printing','printed','failed','cancelled');

-- 1. Roteamento por estação no catálogo e nos itens do pedido
ALTER TABLE public.ped_menu_categories ADD COLUMN IF NOT EXISTS print_station public.ped_print_station;
ALTER TABLE public.ped_products        ADD COLUMN IF NOT EXISTS print_station public.ped_print_station;
ALTER TABLE public.ped_order_items     ADD COLUMN IF NOT EXISTS station public.ped_print_station;
ALTER TABLE public.ped_order_items     ADD COLUMN IF NOT EXISTS prepared_at timestamptz;

-- 2. Configuração de impressão/expedição por unidade
ALTER TABLE public.ped_units ADD COLUMN IF NOT EXISTS auto_print_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.ped_units ADD COLUMN IF NOT EXISTS print_copies smallint NOT NULL DEFAULT 1;
ALTER TABLE public.ped_units ADD COLUMN IF NOT EXISTS expedition_check_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.ped_units ADD COLUMN IF NOT EXISTS print_stations public.ped_print_station[] NOT NULL DEFAULT '{cozinha}'::public.ped_print_station[];
ALTER TABLE public.ped_units DROP CONSTRAINT IF EXISTS ped_units_print_copies_chk;
ALTER TABLE public.ped_units ADD CONSTRAINT ped_units_print_copies_chk CHECK (print_copies BETWEEN 1 AND 3);

-- 3. Helpers de autorização (fail-closed)
CREATE OR REPLACE FUNCTION public.ped_can_read_orders(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN RETURN false; END IF;
  v_ent := public.can_use_orders_module(p_company_id, 'orders.dashboard');
  RETURN COALESCE((v_ent->>'allowed')::boolean, false);
END; $$;

REVOKE ALL ON FUNCTION public.ped_can_read_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_can_read_orders(uuid) TO authenticated;

-- 4. Fila de impressão
CREATE TABLE public.ped_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  station public.ped_print_station NOT NULL,
  copies smallint NOT NULL DEFAULT 1,
  status public.ped_print_job_status NOT NULL DEFAULT 'queued',
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  printer_name text,
  idempotency_key text NOT NULL,
  is_reprint boolean NOT NULL DEFAULT false,
  reprint_of uuid REFERENCES public.ped_print_jobs(id) ON DELETE SET NULL,
  reason text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz,
  CONSTRAINT ped_print_jobs_copies_chk CHECK (copies BETWEEN 1 AND 3),
  CONSTRAINT ped_print_jobs_attempts_chk CHECK (attempts BETWEEN 0 AND 20),
  CONSTRAINT ped_print_jobs_error_chk CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  CONSTRAINT ped_print_jobs_reason_chk CHECK (reason IS NULL OR char_length(reason) <= 300),
  CONSTRAINT ped_print_jobs_printer_chk CHECK (printer_name IS NULL OR char_length(printer_name) <= 120)
);

GRANT SELECT ON public.ped_print_jobs TO authenticated;
GRANT ALL ON public.ped_print_jobs TO service_role;
ALTER TABLE public.ped_print_jobs ENABLE ROW LEVEL SECURITY;

-- leitura apenas para membros com o módulo liberado; escrita somente via RPCs
CREATE POLICY "print_jobs_read" ON public.ped_print_jobs FOR SELECT TO authenticated
  USING (public.ped_can_read_orders(company_id));

CREATE UNIQUE INDEX ped_print_jobs_idem_uk ON public.ped_print_jobs(company_id, idempotency_key);
CREATE INDEX idx_ped_print_jobs_queue ON public.ped_print_jobs(unit_id, status, created_at);
CREATE INDEX idx_ped_print_jobs_order ON public.ped_print_jobs(order_id, station);

CREATE TRIGGER trg_ped_print_jobs_updated
  BEFORE UPDATE ON public.ped_print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Enfileirar impressão (idempotente)
CREATE OR REPLACE FUNCTION public.ped_enqueue_print_job(
  p_order_id uuid,
  p_station public.ped_print_station,
  p_idempotency_key text,
  p_copies smallint DEFAULT NULL,
  p_printer_name text DEFAULT NULL,
  p_is_reprint boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_reprint_of uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.ped_orders;
  v_unit public.ped_units;
  v_ent jsonb;
  v_job public.ped_print_jobs;
  v_copies smallint;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated', 'message', 'Sessão expirada.');
  END IF;
  IF v_key IS NULL OR char_length(v_key) > 120 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_key', 'message', 'Chave de impressão inválida.');
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found', 'message', 'Pedido não encontrado.');
  END IF;

  v_ent := public.can_use_orders_module(v_order.company_id, 'orders.print');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden', 'message', 'Sem permissão para imprimir comandas.');
  END IF;

  IF p_is_reprint AND (p_reason IS NULL OR char_length(btrim(p_reason)) < 3) THEN
    RETURN jsonb_build_object('success', false, 'code', 'reason_required', 'message', 'Informe o motivo da reimpressão.');
  END IF;

  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_order.unit_id;
  v_copies := least(3, greatest(1, coalesce(p_copies, v_unit.print_copies, 1)));

  -- idempotência: mesma chave nunca gera vias extras
  SELECT * INTO v_job FROM public.ped_print_jobs
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_queued',
      'message', 'Comanda já estava na fila de impressão.', 'job_id', v_job.id, 'status', v_job.status);
  END IF;

  INSERT INTO public.ped_print_jobs (
    company_id, unit_id, order_id, station, copies, idempotency_key,
    printer_name, is_reprint, reprint_of, reason, requested_by
  ) VALUES (
    v_order.company_id, v_order.unit_id, v_order.id, p_station, v_copies, v_key,
    nullif(btrim(coalesce(p_printer_name, '')), ''), coalesce(p_is_reprint, false), p_reprint_of,
    nullif(btrim(coalesce(p_reason, '')), ''), auth.uid()
  )
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('success', true, 'code', 'queued',
    'message', CASE WHEN coalesce(p_is_reprint, false) THEN 'Reimpressão registrada.' ELSE 'Comanda enviada para impressão.' END,
    'job_id', v_job.id, 'status', v_job.status, 'copies', v_job.copies);
END; $$;

-- 6. Atualizar situação do trabalho de impressão
CREATE OR REPLACE FUNCTION public.ped_update_print_job(
  p_job_id uuid,
  p_status public.ped_print_job_status,
  p_error text DEFAULT NULL,
  p_printer_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.ped_print_jobs;
  v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated', 'message', 'Sessão expirada.');
  END IF;

  SELECT * INTO v_job FROM public.ped_print_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found', 'message', 'Trabalho de impressão não encontrado.');
  END IF;

  v_ent := public.can_use_orders_module(v_job.company_id, 'orders.print');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden', 'message', 'Sem permissão para atualizar a fila de impressão.');
  END IF;

  IF v_job.status IN ('printed','cancelled') AND p_status <> v_job.status THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_final',
      'message', 'Trabalho de impressão já finalizado.', 'status', v_job.status);
  END IF;

  UPDATE public.ped_print_jobs SET
    status = p_status,
    attempts = CASE WHEN p_status IN ('printing','failed') THEN least(20, attempts + 1) ELSE attempts END,
    last_error = CASE WHEN p_status = 'failed' THEN left(nullif(btrim(coalesce(p_error, '')), ''), 500) ELSE NULL END,
    printer_name = coalesce(nullif(btrim(coalesce(p_printer_name, '')), ''), printer_name),
    printed_at = CASE WHEN p_status = 'printed' THEN now() ELSE printed_at END
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('success', true, 'code', 'updated', 'message', 'Fila de impressão atualizada.',
    'status', v_job.status, 'attempts', v_job.attempts);
END; $$;

-- 7. Marcar item pronto (modo cozinha)
CREATE OR REPLACE FUNCTION public.ped_set_order_item_prepared(
  p_item_id uuid,
  p_prepared boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.ped_order_items;
  v_order public.ped_orders;
  v_ent jsonb;
  v_pending integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated', 'message', 'Sessão expirada.');
  END IF;

  SELECT * INTO v_item FROM public.ped_order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found', 'message', 'Item não encontrado.');
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = v_item.order_id;

  v_ent := public.can_use_orders_module(v_order.company_id, 'orders.kitchen');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden', 'message', 'Sem permissão de produção.');
  END IF;

  IF v_order.status NOT IN ('accepted','preparation_started') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_status',
      'message', 'O pedido não está em produção.');
  END IF;

  UPDATE public.ped_order_items
     SET prepared_at = CASE WHEN coalesce(p_prepared, true) THEN coalesce(prepared_at, now()) ELSE NULL END
   WHERE id = v_item.id;

  SELECT count(*) INTO v_pending
    FROM public.ped_order_items WHERE order_id = v_order.id AND prepared_at IS NULL;

  RETURN jsonb_build_object('success', true, 'code', 'updated',
    'message', CASE WHEN coalesce(p_prepared, true) THEN 'Item marcado como pronto.' ELSE 'Item reaberto.' END,
    'pending_items', v_pending);
END; $$;

REVOKE ALL ON FUNCTION public.ped_enqueue_print_job(uuid, public.ped_print_station, text, smallint, text, boolean, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_update_print_job(uuid, public.ped_print_job_status, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ped_set_order_item_prepared(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_enqueue_print_job(uuid, public.ped_print_station, text, smallint, text, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ped_update_print_job(uuid, public.ped_print_job_status, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ped_set_order_item_prepared(uuid, boolean) TO authenticated;

-- 8. Realtime da fila de impressão
ALTER TABLE public.ped_print_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ped_print_jobs;