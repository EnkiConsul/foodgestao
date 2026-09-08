CREATE OR REPLACE FUNCTION public.dp_guard_company_owner_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role / backend jobs
    END IF;
    IF auth.uid() = OLD.user_id OR public.is_super_admin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Somente o proprietário atual da empresa ou um super admin pode transferir a titularidade';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_company_owner_transfer ON public.companies;
CREATE TRIGGER guard_company_owner_transfer
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.dp_guard_company_owner_transfer();