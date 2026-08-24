-- M1 (Convocações 3A.1) — Timezone compatível, nullable, sem default e sem backfill.
-- Rollback enquanto sem uso: ALTER TABLE ... DROP COLUMN timezone; DROP FUNCTION dp_timezone_resolvido; DROP trigger/function de validação.

ALTER TABLE public.companies   ADD COLUMN IF NOT EXISTS timezone text NULL;
ALTER TABLE public.dp_unidades ADD COLUMN IF NOT EXISTS timezone text NULL;

COMMENT ON COLUMN public.companies.timezone IS 'Fuso horário IANA da empresa. NULL = não configurado (fluxo novo de Convocações falha fechado).';
COMMENT ON COLUMN public.dp_unidades.timezone IS 'Fuso horário IANA da unidade. NULL = herda da empresa.';

-- Validação por trigger (CHECK não pode depender de catálogo)
CREATE OR REPLACE FUNCTION public.dp_valida_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.timezone IS NOT NULL THEN
    IF btrim(NEW.timezone) = '' THEN
      RAISE EXCEPTION 'TIMEZONE_INVALIDO: timezone não pode ser vazio';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
      RAISE EXCEPTION 'TIMEZONE_INVALIDO: %', NEW.timezone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_valida_timezone ON public.companies;
CREATE TRIGGER trg_companies_valida_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.dp_valida_timezone();

DROP TRIGGER IF EXISTS trg_dp_unidades_valida_timezone ON public.dp_unidades;
CREATE TRIGGER trg_dp_unidades_valida_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.dp_unidades
  FOR EACH ROW EXECUTE FUNCTION public.dp_valida_timezone();

-- Resolução: unidade -> empresa -> NULL (sem fallback silencioso)
CREATE OR REPLACE FUNCTION public.dp_timezone_resolvido(_company_id uuid, _unidade_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.timezone FROM public.dp_unidades u
      WHERE u.id = _unidade_id AND u.company_id = _company_id AND u.timezone IS NOT NULL),
    (SELECT c.timezone FROM public.companies c
      WHERE c.id = _company_id AND c.timezone IS NOT NULL)
  );
$$;

COMMENT ON FUNCTION public.dp_timezone_resolvido(uuid, uuid) IS 'Resolve o timezone: unidade -> empresa -> NULL. NULL deve ser tratado como TIMEZONE_NAO_CONFIGURADO pelo chamador (fail closed).';

REVOKE ALL ON FUNCTION public.dp_timezone_resolvido(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_timezone_resolvido(uuid, uuid) TO authenticated, service_role;