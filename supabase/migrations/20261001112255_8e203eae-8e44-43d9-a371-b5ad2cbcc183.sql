ALTER TABLE public.dp_recibos ADD COLUMN IF NOT EXISTS assinatura_imagem text
  CHECK (assinatura_imagem IS NULL OR (assinatura_imagem LIKE 'data:image/png;base64,%' AND length(assinatura_imagem) <= 400000));
ALTER TABLE public.dp_documento_aceites ADD COLUMN IF NOT EXISTS assinatura_imagem text
  CHECK (assinatura_imagem IS NULL OR (assinatura_imagem LIKE 'data:image/png;base64,%' AND length(assinatura_imagem) <= 400000));

CREATE OR REPLACE FUNCTION private.dp_assinatura_imagem_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.assinatura_imagem IS NOT NULL AND NEW.assinatura_imagem IS DISTINCT FROM OLD.assinatura_imagem THEN
    RAISE EXCEPTION 'assinatura_imutavel';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_assinatura_imagem_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_recibos_assinatura_imutavel ON public.dp_recibos;
CREATE TRIGGER trg_dp_recibos_assinatura_imutavel BEFORE UPDATE OF assinatura_imagem ON public.dp_recibos
  FOR EACH ROW EXECUTE FUNCTION private.dp_assinatura_imagem_imutavel();
DROP TRIGGER IF EXISTS trg_dp_aceites_assinatura_imutavel ON public.dp_documento_aceites;
CREATE TRIGGER trg_dp_aceites_assinatura_imutavel BEFORE UPDATE OF assinatura_imagem ON public.dp_documento_aceites
  FOR EACH ROW EXECUTE FUNCTION private.dp_assinatura_imagem_imutavel();