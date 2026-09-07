ALTER TABLE public.dp_pessoas_apoio
  ADD COLUMN IF NOT EXISTS setor_id uuid NULL REFERENCES public.dp_setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dp_pessoas_apoio_setor
  ON public.dp_pessoas_apoio (setor_id) WHERE setor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.dp_pessoa_apoio_validar_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_unidade uuid;
  v_ativo boolean;
BEGIN
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.company_id, s.unidade_id, s.ativo
    INTO v_company, v_unidade, v_ativo
    FROM public.dp_setores s
   WHERE s.id = NEW.setor_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'SETOR_INEXISTENTE: setor não encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: setor de outra empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_unidade IS NOT NULL AND NEW.unidade_id IS NOT NULL AND v_unidade <> NEW.unidade_id THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: setor de outra unidade.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_ativo, true) = false
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.setor_id::text, '') <> NEW.setor_id::text) THEN
    RAISE EXCEPTION 'SETOR_INATIVO: setor inativo.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_pessoa_apoio_validar_setor ON public.dp_pessoas_apoio;
CREATE TRIGGER trg_dp_pessoa_apoio_validar_setor
  BEFORE INSERT OR UPDATE OF setor_id, unidade_id, company_id ON public.dp_pessoas_apoio
  FOR EACH ROW EXECUTE FUNCTION public.dp_pessoa_apoio_validar_setor();