CREATE OR REPLACE FUNCTION public.companies_guard_owner_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT (auth.uid() = OLD.user_id OR public.is_super_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Apenas o dono da empresa pode transferir a titularidade';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_guard_owner_transfer ON public.companies;
CREATE TRIGGER companies_guard_owner_transfer
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_guard_owner_transfer();