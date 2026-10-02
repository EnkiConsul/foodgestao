ALTER TABLE public.dp_documentos ADD COLUMN IF NOT EXISTS valor_liquido_cents bigint
  CHECK (valor_liquido_cents IS NULL OR valor_liquido_cents > 0);
ALTER TABLE public.dp_bulk_import_items ADD COLUMN IF NOT EXISTS valor_liquido_cents bigint
  CHECK (valor_liquido_cents IS NULL OR valor_liquido_cents > 0);

CREATE OR REPLACE FUNCTION private.dp_documento_valor_do_recibo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.origem_recibo_id IS NOT NULL AND NEW.valor_liquido_cents IS NULL THEN
    SELECT r.valor_cents INTO NEW.valor_liquido_cents FROM public.dp_recibos r WHERE r.id = NEW.origem_recibo_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_documento_valor_do_recibo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_documento_valor_do_recibo ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_valor_do_recibo
BEFORE INSERT OR UPDATE OF origem_recibo_id ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION private.dp_documento_valor_do_recibo();

UPDATE public.dp_documentos d SET valor_liquido_cents = r.valor_cents
FROM public.dp_recibos r
WHERE d.origem_recibo_id = r.id AND d.valor_liquido_cents IS NULL;

CREATE OR REPLACE FUNCTION public.dp_documento_definir_valor_liquido(p_documento_id uuid, p_valor_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_documentos WHERE id = p_documento_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_company) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_valor_cents IS NOT NULL AND (p_valor_cents <= 0 OR p_valor_cents > 100000000) THEN
    RAISE EXCEPTION 'DOC_VALOR_LIQUIDO_INVALIDO';
  END IF;
  UPDATE public.dp_documentos SET valor_liquido_cents = p_valor_cents WHERE id = p_documento_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_documento_definir_valor_liquido(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_definir_valor_liquido(uuid, bigint) TO authenticated, service_role;